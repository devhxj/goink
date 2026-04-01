"""
审核Agent - 负责内容审核和一致性检查
"""
import logging
from datetime import datetime
from typing import Dict, Any, List

from sqlalchemy import select

from .base import BaseAgent, AgentTask, AgentResult, AgentRole, TaskType
from app.core.database import AsyncSessionLocal
from app.consistency.service import ConsistencyChecker
from app.foreshadowing.models import Foreshadowing, ForeshadowingStatus
from app.chapters.models import Chapter

logger = logging.getLogger(__name__)


class ReviewerAgent(BaseAgent):
    """审核Agent - 负责内容审核和一致性检查"""
    
    def __init__(self, agent_id: str = "reviewer_001"):
        super().__init__(agent_id, AgentRole.REVIEWER)
        self.supported_tasks = {
            TaskType.REVIEW_CHAPTER,
            TaskType.CHECK_CONSISTENCY,
            TaskType.MANAGE_FORESHADOWING
        }
    
    def can_handle(self, task_type: TaskType) -> bool:
        return task_type in self.supported_tasks
    
    async def execute(self, task: AgentTask) -> AgentResult:
        """执行审核任务"""
        self.log_task_start(task)
        
        try:
            if task.task_type == TaskType.REVIEW_CHAPTER:
                result = await self._review_chapter(task)
            elif task.task_type == TaskType.CHECK_CONSISTENCY:
                result = await self._check_consistency(task)
            elif task.task_type == TaskType.MANAGE_FORESHADOWING:
                result = await self._manage_foreshadowing(task)
            else:
                result = self.create_result(
                    task=task,
                    success=False,
                    error=f"Unsupported task type: {task.task_type}"
                )
            
            self.log_task_complete(result)
            return result
            
        except Exception as e:
            self.logger.error(f"Error in review task: {e}")
            return self.create_result(
                task=task,
                success=False,
                error=str(e)
            )
    
    async def _review_chapter(self, task: AgentTask) -> AgentResult:
        """审核章节内容"""
        content = task.parameters.get("content", "")
        context = task.context
        
        issues = []
        suggestions = []
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        lines = [line.strip() for line in content.splitlines() if line.strip()]
        chapter_number = task.parameters.get("chapter_number") or context.get("chapter_number")
        
        if len(content) < 500:
            issues.append({
                "type": "length",
                "severity": "warning",
                "message": "章节内容过短，建议扩充"
            })

        if len(paragraphs) < 3:
            issues.append({
                "type": "structure_sparse",
                "severity": "warning",
                "message": "章节段落过少，结构显得单薄"
            })

        if len(content) > 0 and len(set(content)) / max(len(content), 1) < 0.18:
            issues.append({
                "type": "repetition",
                "severity": "warning",
                "message": "文本重复度偏高，建议压缩重复表达"
            })

        dialogue_lines = [line for line in lines if any(mark in line for mark in ["“", "”", "\"", "："])]
        if len(dialogue_lines) == 0 and len(content) > 1200:
            suggestions.append("可适度加入对话，增强场景表现和阅读节奏")

        if paragraphs and any(len(p) > 500 for p in paragraphs):
            suggestions.append("部分段落过长，建议拆分长段以提升可读性")
        
        characters = context.get("characters", [])
        for char in characters:
            char_name = char.get("name", "")
            if char_name and char_name not in content:
                issues.append({
                    "type": "character_missing",
                    "severity": "info",
                    "message": f"角色 '{char_name}' 未在本章出现"
                })
        
        plot_hints = context.get("plot_hints", [])
        unresolved_plot_hints = [hint for hint in plot_hints if hint.get("type") in {"unresolved", "foreshadowing", "planned_event"}]
        for hint in plot_hints:
            if hint.get("type") == "unresolved":
                suggestions.append(f"考虑解决伏笔：{hint.get('description', '')}")

        if unresolved_plot_hints and not any(hint.get("description", "")[:8] in content for hint in unresolved_plot_hints):
            suggestions.append("本章可以呼应至少一个既有伏笔或计划事件，增强连载连贯性")

        active_plot_lines = context.get("active_plot_lines", [])
        if active_plot_lines and not any(line.get("name", "") in content for line in active_plot_lines):
            suggestions.append("可以推进当前活跃情节线，避免主线停滞")

        current_arc = context.get("current_arc_summary")
        if current_arc and chapter_number:
            suggestions.append(f"第{chapter_number}章建议继续贴合当前卷目标：{current_arc}")
        
        passed = len([i for i in issues if i.get("severity") == "error"]) == 0
        score = max(0, 100 - len([i for i in issues if i.get("severity") == "warning"]) * 10 - len([i for i in issues if i.get("severity") == "info"]) * 3)
        
        return self.create_result(
            task=task,
            success=passed,
            result={
                "content_length": len(content),
                "issues_found": len(issues),
                "issues": issues,
                "passed": passed,
                "approved": passed,
                "score": score
            },
            suggestions=suggestions,
            next_actions=[] if passed else [
                {
                    "type": "create_task",
                    "task_type": TaskType.GENERATE_CHAPTER.value,
                    "chapter_id": task.chapter_id,
                    "parameters": {
                        "revision": True,
                        "issues": issues
                    }
                }
            ]
        )
    
    async def _check_consistency(self, task: AgentTask) -> AgentResult:
        """检查一致性"""
        chapter_id = task.chapter_id
        parameters = task.parameters
        precomputed = task.context.get("consistency_result") or {}
        check_types = parameters.get("check_types", ["character", "plot", "timeline"])

        if precomputed:
            consistency_issues = precomputed.get("issues", [])
            summary = precomputed.get("summary", {})
        else:
            consistency_issues = []
            if "character" in check_types:
                consistency_issues.extend(await self._check_character_consistency(task))
            if "plot" in check_types:
                consistency_issues.extend(await self._check_plot_consistency(task))
            if "timeline" in check_types:
                consistency_issues.extend(await self._check_timeline_consistency(task))
            summary = {
                "total_issues": len(consistency_issues)
            }

        passed = not any(issue.get("severity") == "error" for issue in consistency_issues)
        
        return self.create_result(
            task=task,
            success=passed,
            result={
                "chapter_id": chapter_id,
                "consistency_issues": consistency_issues,
                "checks_performed": check_types,
                "passed": passed,
                "issues": consistency_issues,
                "summary": summary
            }
        )
    
    async def _manage_foreshadowing(self, task: AgentTask) -> AgentResult:
        """管理伏笔"""
        parameters = task.parameters
        action = parameters.get("action", "list")
        
        if action == "list":
            foreshadowing = await self._list_foreshadowing(task)
            success = not isinstance(foreshadowing, dict) or not foreshadowing.get("error")
            return self.create_result(
                task=task,
                success=success,
                result={
                    "action": "list",
                    "foreshadowing": foreshadowing
                },
                error=foreshadowing.get("error") if isinstance(foreshadowing, dict) else None
            )
        elif action == "create":
            new_fs = await self._create_foreshadowing(task)
            success = not new_fs.get("error")
            return self.create_result(
                task=task,
                success=success,
                result={
                    "action": "create",
                    "foreshadowing": new_fs
                },
                error=new_fs.get("error")
            )
        elif action == "resolve":
            resolved = await self._resolve_foreshadowing(task)
            success = not resolved.get("error")
            return self.create_result(
                task=task,
                success=success,
                result={
                    "action": "resolve",
                    "foreshadowing": resolved
                },
                error=resolved.get("error")
            )
        else:
            return self.create_result(
                task=task,
                success=False,
                error=f"Unknown foreshadowing action: {action}"
            )
    
    async def _check_character_consistency(self, task: AgentTask) -> List[Dict[str, Any]]:
        """检查角色一致性"""
        async with AsyncSessionLocal() as db:
            checker = ConsistencyChecker(db, task.novel_id)
            chapters = await checker._get_chapters([task.chapter_id] if task.chapter_id else None)
            issues = await checker.check_character_consistency(chapters)
            return [issue.model_dump() for issue in issues]
    
    async def _check_plot_consistency(self, task: AgentTask) -> List[Dict[str, Any]]:
        """检查情节一致性"""
        async with AsyncSessionLocal() as db:
            checker = ConsistencyChecker(db, task.novel_id)
            chapters = await checker._get_chapters([task.chapter_id] if task.chapter_id else None)
            issues = await checker.check_plot_consistency(chapters)
            return [issue.model_dump() for issue in issues]
    
    async def _check_timeline_consistency(self, task: AgentTask) -> List[Dict[str, Any]]:
        """检查时间线一致性"""
        async with AsyncSessionLocal() as db:
            checker = ConsistencyChecker(db, task.novel_id)
            chapters = await checker._get_chapters([task.chapter_id] if task.chapter_id else None)
            issues = await checker.check_timeline_consistency(chapters)
            return [issue.model_dump() for issue in issues]
    
    async def _list_foreshadowing(self, task: AgentTask) -> List[Dict[str, Any]] | Dict[str, Any]:
        """列出伏笔"""
        parameters = task.parameters
        status = parameters.get("status")
        min_importance = parameters.get("min_importance")
        limit = parameters.get("limit", 20)

        async with AsyncSessionLocal() as db:
            query = select(Foreshadowing).where(Foreshadowing.novel_id == task.novel_id)
            if status:
                query = query.where(Foreshadowing.status == status)
            if min_importance is not None:
                query = query.where(Foreshadowing.importance >= min_importance)

            query = query.order_by(Foreshadowing.importance.desc(), Foreshadowing.created_at.desc()).limit(limit)
            result = await db.execute(query)
            items = result.scalars().all()

            return [
                {
                    "id": fs.id,
                    "title": fs.title,
                    "description": fs.description,
                    "status": fs.status,
                    "foreshadowing_type": fs.foreshadowing_type,
                    "importance": fs.importance,
                    "created_chapter_id": fs.created_chapter_id,
                    "resolved_chapter_id": fs.resolved_chapter_id,
                    "resolution_notes": fs.resolution_notes,
                    "metadata": fs.extra_metadata,
                    "created_at": fs.created_at.isoformat() if fs.created_at else None,
                    "resolved_at": fs.resolved_at.isoformat() if fs.resolved_at else None
                }
                for fs in items
            ]
    
    async def _create_foreshadowing(self, task: AgentTask) -> Dict[str, Any]:
        """创建伏笔"""
        parameters = task.parameters
        title = parameters.get("title")
        if not title:
            return {"error": "缺少 title，无法创建伏笔"}

        created_chapter_id = parameters.get("created_chapter_id", task.chapter_id)
        async with AsyncSessionLocal() as db:
            if created_chapter_id:
                chapter_result = await db.execute(select(Chapter).where(Chapter.id == created_chapter_id))
                chapter = chapter_result.scalar_one_or_none()
                if not chapter or chapter.novel_id != task.novel_id:
                    return {"error": "created_chapter_id 无效或不属于当前小说"}

            foreshadowing = Foreshadowing(
                novel_id=task.novel_id,
                created_chapter_id=created_chapter_id,
                title=title,
                description=parameters.get("description"),
                foreshadowing_type=parameters.get("foreshadowing_type", "other"),
                importance=parameters.get("importance", 1),
                extra_metadata=parameters.get("metadata")
            )
            db.add(foreshadowing)
            await db.commit()
            await db.refresh(foreshadowing)

            return {
                "id": foreshadowing.id,
                "title": foreshadowing.title,
                "status": foreshadowing.status,
                "foreshadowing_type": foreshadowing.foreshadowing_type,
                "importance": foreshadowing.importance,
                "created_chapter_id": foreshadowing.created_chapter_id
            }
    
    async def _resolve_foreshadowing(self, task: AgentTask) -> Dict[str, Any]:
        """解决伏笔"""
        parameters = task.parameters
        foreshadowing_id = parameters.get("foreshadowing_id")
        if not foreshadowing_id:
            return {"error": "缺少 foreshadowing_id，无法解决伏笔"}

        resolved_chapter_id = parameters.get("resolved_chapter_id", task.chapter_id)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Foreshadowing).where(
                    Foreshadowing.id == foreshadowing_id,
                    Foreshadowing.novel_id == task.novel_id
                )
            )
            foreshadowing = result.scalar_one_or_none()
            if not foreshadowing:
                return {"error": "伏笔不存在"}

            if resolved_chapter_id:
                chapter_result = await db.execute(select(Chapter).where(Chapter.id == resolved_chapter_id))
                chapter = chapter_result.scalar_one_or_none()
                if not chapter or chapter.novel_id != task.novel_id:
                    return {"error": "resolved_chapter_id 无效或不属于当前小说"}

            foreshadowing.status = ForeshadowingStatus.RESOLVED.value
            foreshadowing.resolved_chapter_id = resolved_chapter_id
            foreshadowing.resolution_notes = parameters.get("resolution_notes")
            foreshadowing.resolved_at = datetime.now()
            await db.commit()
            await db.refresh(foreshadowing)

            return {
                "id": foreshadowing.id,
                "title": foreshadowing.title,
                "status": foreshadowing.status,
                "resolved_chapter_id": foreshadowing.resolved_chapter_id,
                "resolution_notes": foreshadowing.resolution_notes,
                "resolved_at": foreshadowing.resolved_at.isoformat() if foreshadowing.resolved_at else None
            }
