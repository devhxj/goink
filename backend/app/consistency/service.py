"""
一致性检查服务 - 检查角色、情节、时间线一致性
"""
import logging
import uuid
import time
import json
import asyncio
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.novels.models import Novel
from app.chapters.models import Chapter
from app.characters.models import Character
from app.plot_events.models import PlotEvent
from app.foreshadowing.models import Foreshadowing, ForeshadowingStatus
from app.foreshadowing.schemas import ConsistencyIssue
from app.core.llm_service import LLMService

logger = logging.getLogger(__name__)


class ConsistencyChecker:
    """一致性检查服务"""
    
    def __init__(self, db: Session, novel_id: int):
        self.db = db
        self.novel_id = novel_id
        self.novel = db.query(Novel).filter(Novel.id == novel_id).first()
        self.llm_service = LLMService()
    
    async def _call_llm_with_retry(
        self,
        prompt: str,
        max_retries: int = 3,
        delay: float = 1.0
    ) -> Optional[Dict[str, Any]]:
        """
        带重试机制的LLM调用
        
        Args:
            prompt: 提示词
            max_retries: 最大重试次数
            delay: 重试延迟
            
        Returns:
            解析后的JSON数据，失败返回None
        """
        for attempt in range(max_retries):
            try:
                result = await self.llm_service.generate_text(prompt)
                
                try:
                    data = json.loads(result)
                    return data
                except json.JSONDecodeError:
                    logger.warning(f"Attempt {attempt + 1}: Failed to parse JSON from LLM response")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay * (attempt + 1))
                    continue
                    
            except Exception as e:
                logger.error(f"Attempt {attempt + 1}: LLM call failed: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay * (attempt + 1))
                continue
        
        logger.error(f"LLM call failed after {max_retries} retries")
        return None
    
    async def check_all(
        self,
        chapter_ids: Optional[List[int]] = None,
        check_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        执行全部一致性检查
        
        Args:
            chapter_ids: 指定检查的章节ID列表
            check_types: 检查类型列表 ['character', 'plot', 'timeline', 'foreshadowing']
            
        Returns:
            检查结果
        """
        start_time = time.time()
        check_id = f"check_{uuid.uuid4().hex[:12]}"
        
        if check_types is None:
            check_types = ["character", "plot", "timeline", "foreshadowing"]
        
        all_issues: List[ConsistencyIssue] = []
        
        chapters = self._get_chapters(chapter_ids)
        
        if "character" in check_types:
            character_issues = await self.check_character_consistency(chapters)
            all_issues.extend(character_issues)
        
        if "plot" in check_types:
            plot_issues = await self.check_plot_consistency(chapters)
            all_issues.extend(plot_issues)
        
        if "timeline" in check_types:
            timeline_issues = await self.check_timeline_consistency(chapters)
            all_issues.extend(timeline_issues)
        
        if "foreshadowing" in check_types:
            foreshadowing_issues = await self.check_foreshadowing_status()
            all_issues.extend(foreshadowing_issues)
        
        check_time = time.time() - start_time
        
        summary = self._generate_summary(all_issues)
        
        return {
            "check_id": check_id,
            "novel_id": self.novel_id,
            "status": "completed",
            "issues": [issue.model_dump() for issue in all_issues],
            "summary": summary,
            "check_time": round(check_time, 2)
        }
    
    def _get_chapters(self, chapter_ids: Optional[List[int]] = None) -> List[Chapter]:
        """获取要检查的章节"""
        query = self.db.query(Chapter).filter(
            Chapter.novel_id == self.novel_id,
            Chapter.status == "completed"
        )
        
        if chapter_ids:
            query = query.filter(Chapter.id.in_(chapter_ids))
        
        return query.order_by(Chapter.chapter_number).all()
    
    async def check_character_consistency(self, chapters: List[Chapter]) -> List[ConsistencyIssue]:
        """
        检查角色一致性
        
        检查内容:
        - 角色性格前后是否一致
        - 角色能力是否突然变化
        - 角色关系是否矛盾
        """
        issues: List[ConsistencyIssue] = []
        
        if not chapters:
            return issues
        
        characters = self.db.query(Character).filter(
            Character.novel_id == self.novel_id
        ).all()
        
        if not characters:
            return issues
        
        character_info = "\n".join([
            f"- {char.name}: 性格={char.personality}, 能力={char.abilities}"
            for char in characters
        ])
        
        chapter_contents = []
        for chapter in chapters[-5:]:
            if chapter.content:
                chapter_contents.append(f"第{chapter.chapter_number}章:\n{chapter.content[:2000]}")
        
        if not chapter_contents:
            return issues
        
        prompt = f"""请检查以下章节内容中角色的一致性问题。

角色设定:
{character_info}

章节内容:
{chr(10).join(chapter_contents)}

请检查:
1. 角色性格是否前后矛盾
2. 角色能力是否突然变化且无解释
3. 角色关系是否有矛盾

以JSON格式返回问题列表，格式如下:
{{
    "issues": [
        {{
            "chapter_number": 章节号,
            "character_name": "角色名",
            "issue_type": "personality/ability/relationship",
            "description": "问题描述",
            "suggestion": "修改建议"
        }}
    ]
}}

如果没有问题，返回 {{"issues": []}}
只返回JSON，不要其他内容。"""

        try:
            data = await self._call_llm_with_retry(prompt)
            
            if data:
                for item in data.get("issues", []):
                    issues.append(ConsistencyIssue(
                        issue_type="character",
                        severity="warning",
                        chapter_number=item.get("chapter_number"),
                        description=f"角色'{item.get('character_name')}'一致性问题: {item.get('description')}",
                        details={
                            "character_name": item.get("character_name"),
                            "issue_type": item.get("issue_type")
                        },
                        suggestion=item.get("suggestion")
                    ))
                
        except Exception as e:
            logger.error(f"Character consistency check failed: {e}")
        
        return issues
    
    async def check_plot_consistency(self, chapters: List[Chapter]) -> List[ConsistencyIssue]:
        """
        检查情节一致性
        
        检查内容:
        - 情节发展是否合理
        - 是否有逻辑漏洞
        - 事件因果关系是否清晰
        """
        issues: List[ConsistencyIssue] = []
        
        if len(chapters) < 2:
            return issues
        
        plot_events = self.db.query(PlotEvent).filter(
            PlotEvent.novel_id == self.novel_id
        ).order_by(PlotEvent.created_at).all()
        
        if not plot_events:
            return issues
        
        events_summary = "\n".join([
            f"- 第{event.chapter_id}章: {event.event_type} - {event.description}"
            for event in plot_events[-10:]
        ])
        
        recent_chapters = chapters[-3:]
        chapter_contents = []
        for chapter in recent_chapters:
            if chapter.content:
                chapter_contents.append(f"第{chapter.chapter_number}章:\n{chapter.content[:1500]}")
        
        if not chapter_contents:
            return issues
        
        prompt = f"""请检查以下章节内容的情节一致性问题。

情节事件记录:
{events_summary}

近期章节内容:
{chr(10).join(chapter_contents)}

请检查:
1. 情节发展是否有逻辑漏洞
2. 事件因果关系是否合理
3. 是否有前后矛盾的情节

以JSON格式返回问题列表，格式如下:
{{
    "issues": [
        {{
            "chapter_number": 章节号,
            "issue_type": "logic/contradiction/causality",
            "description": "问题描述",
            "suggestion": "修改建议"
        }}
    ]
}}

如果没有问题，返回 {{"issues": []}}
只返回JSON，不要其他内容。"""

        try:
            data = await self._call_llm_with_retry(prompt)
            
            if data:
                for item in data.get("issues", []):
                    issues.append(ConsistencyIssue(
                        issue_type="plot",
                        severity="warning",
                        chapter_number=item.get("chapter_number"),
                        description=f"情节一致性问题: {item.get('description')}",
                        details={
                            "issue_type": item.get("issue_type")
                        },
                        suggestion=item.get("suggestion")
                    ))
                
        except Exception as e:
            logger.error(f"Plot consistency check failed: {e}")
        
        return issues
    
    async def check_timeline_consistency(self, chapters: List[Chapter]) -> List[ConsistencyIssue]:
        """
        检查时间线一致性
        
        检查内容:
        - 时间顺序是否合理
        - 事件时间跨度是否矛盾
        """
        issues: List[ConsistencyIssue] = []
        
        plot_events = self.db.query(PlotEvent).filter(
            PlotEvent.novel_id == self.novel_id
        ).order_by(PlotEvent.timeline).all()
        
        if len(plot_events) < 2:
            return issues
        
        for i in range(1, len(plot_events)):
            prev_event = plot_events[i-1]
            curr_event = plot_events[i]
            
            if prev_event.timeline and curr_event.timeline:
                if prev_event.timeline > curr_event.timeline:
                    prev_chapter = self.db.query(Chapter).filter(
                        Chapter.id == prev_event.chapter_id
                    ).first()
                    curr_chapter = self.db.query(Chapter).filter(
                        Chapter.id == curr_event.chapter_id
                    ).first()
                    
                    if prev_chapter and curr_chapter and prev_chapter.chapter_number <= curr_chapter.chapter_number:
                        issues.append(ConsistencyIssue(
                            issue_type="timeline",
                            severity="error",
                            chapter_id=curr_event.chapter_id,
                            chapter_number=curr_chapter.chapter_number if curr_chapter else None,
                            description=f"时间线顺序错误: 事件'{curr_event.description}'的时间早于前一事件'{prev_event.description}'",
                            details={
                                "prev_event_id": prev_event.id,
                                "curr_event_id": curr_event.id
                            },
                            suggestion="请检查并修正事件的时间标记"
                        ))
        
        return issues
    
    async def check_foreshadowing_status(self) -> List[ConsistencyIssue]:
        """
        检查伏笔状态
        
        检查内容:
        - 未解决的伏笔
        - 长期未填的坑
        """
        issues: List[ConsistencyIssue] = []
        
        unresolved_foreshadowings = self.db.query(Foreshadowing).filter(
            Foreshadowing.novel_id == self.novel_id,
            Foreshadowing.status == ForeshadowingStatus.UNRESOLVED.value
        ).all()
        
        for fs in unresolved_foreshadowings:
            from datetime import datetime
            days_pending = (datetime.now() - fs.created_at).days if fs.created_at else 0
            
            severity = "info"
            if fs.importance >= 4 and days_pending > 30:
                severity = "warning"
            elif fs.importance >= 4 and days_pending > 60:
                severity = "error"
            
            issues.append(ConsistencyIssue(
                issue_type="foreshadowing",
                severity=severity,
                chapter_id=fs.created_chapter_id,
                description=f"未解决的伏笔: {fs.title}",
                details={
                    "foreshadowing_id": fs.id,
                    "importance": fs.importance,
                    "days_pending": days_pending,
                    "description": fs.description
                },
                suggestion=f"建议在后续章节中解决此伏笔" if fs.importance >= 3 else None
            ))
        
        return issues
    
    def _generate_summary(self, issues: List[ConsistencyIssue]) -> Dict[str, Any]:
        """生成检查摘要"""
        summary = {
            "total_issues": len(issues),
            "by_severity": {
                "error": 0,
                "warning": 0,
                "info": 0
            },
            "by_type": {
                "character": 0,
                "plot": 0,
                "timeline": 0,
                "foreshadowing": 0
            }
        }
        
        for issue in issues:
            summary["by_severity"][issue.severity] = summary["by_severity"].get(issue.severity, 0) + 1
            summary["by_type"][issue.issue_type] = summary["by_type"].get(issue.issue_type, 0) + 1
        
        return summary
