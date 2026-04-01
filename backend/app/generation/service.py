"""
章节生成服务 - 整合RAG、Memory、Agent系统
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.context_builder import ContextBuilder
from app.agents.base import AgentTask, TaskType
from app.agents.factory import create_default_coordinator
from app.novels.models import Novel, NovelCreativeProfile
from app.chapters.models import Chapter
from app.characters.models import Character
from app.plot_events.models import PlotEvent
from app.foreshadowing.models import Foreshadowing, ForeshadowingStatus
from app.planning.models import PlotOutline, PlotLine, PlotNode, PlotNodeStatus
from app.workflows.langgraph_workflow import ChapterWorkflow, LANGGRAPH_AVAILABLE
from app.core.llm_service import llm_service

logger = logging.getLogger(__name__)


class ChapterGenerationService:
    """章节生成服务"""
    
    def __init__(self, db: AsyncSession, novel_id: int):
        self.db = db
        self.novel_id = novel_id
        self.context_builder = ContextBuilder(db, novel_id)
        self.coordinator = create_default_coordinator()
    
    async def _get_novel(self) -> Optional[Novel]:
        """获取小说"""
        result = await self.db.execute(
            select(Novel).where(Novel.id == self.novel_id)
        )
        return result.scalar_one_or_none()
    
    async def generate_chapter(
        self,
        chapter_number: int,
        target_length: int = 3000,
        style: str = "narrative",
        additional_context: Optional[Dict[str, Any]] = None,
        agent_role: Optional[str] = None,
        model: Optional[str] = None,
        use_workflow: Optional[bool] = None,
        context_size: int = 3000
    ) -> Dict[str, Any]:
        """
        生成章节完整流程
        
        Args:
            chapter_number: 章节号
            target_length: 目标字数
            style: 写作风格
            additional_context: 额外上下文
            
        Returns:
            生成结果
        """
        logger.info(f"Starting chapter {chapter_number} generation for novel {self.novel_id}")
        
        try:
            context = await self._prepare_context(chapter_number, additional_context)
            should_use_workflow = LANGGRAPH_AVAILABLE if use_workflow is None else use_workflow
            extra_parameters = self._build_generation_parameters(additional_context)

            if should_use_workflow and LANGGRAPH_AVAILABLE:
                workflow = ChapterWorkflow()
                workflow_result = await workflow.run(
                    task_id=f"gen_{self.novel_id}_{chapter_number}_{datetime.now().timestamp()}",
                    novel_id=self.novel_id,
                    chapter_number=chapter_number,
                    target_length=target_length,
                    style=style,
                    context=context,
                    model=model,
                    agent_role=agent_role,
                    context_size=context_size,
                    extra_parameters=extra_parameters
                )
                if workflow_result.get("success"):
                    chapter = await self._get_chapter(chapter_number)
                    generated_content = workflow_result.get("generated_content", "")
                    return {
                        "success": True,
                        "chapter_id": chapter.id if chapter else None,
                        "chapter_number": chapter_number,
                        "content": generated_content,
                        "word_count": len(generated_content),
                        "review_result": workflow_result.get("review_result"),
                        "consistency_result": workflow_result.get("consistency_result"),
                        "iterations": workflow_result.get("iterations", 0)
                    }
                return {
                    "success": False,
                    "error": workflow_result.get("error") or "工作流执行失败"
                }
            
            task = AgentTask(
                task_id=f"gen_{self.novel_id}_{chapter_number}_{datetime.now().timestamp()}",
                task_type=TaskType.GENERATE_CHAPTER,
                novel_id=self.novel_id,
                parameters={
                    "chapter_number": chapter_number,
                    "target_length": target_length,
                    "style": style,
                    "agent_role": agent_role,
                    "model": model,
                    **extra_parameters
                },
                context=context
            )
            
            result = await self.coordinator.execute(task)
            
            if result.success:
                chapter = await self._save_chapter(
                    chapter_number=chapter_number,
                    content=result.result.get("content", ""),
                    style=style
                )
                
                await self._update_chapter_memory(chapter.id)
                
                logger.info(f"Chapter {chapter_number} generated successfully: {chapter.id}")
                
                return {
                    "success": True,
                    "chapter_id": chapter.id,
                    "chapter_number": chapter_number,
                    "content": chapter.content,
                    "word_count": len(chapter.content),
                    "suggestions": result.suggestions
                }
            else:
                logger.error(f"Chapter generation failed: {result.error}")
                return {
                    "success": False,
                    "error": result.error
                }
                
        except Exception as e:
            logger.error(f"Chapter generation error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _prepare_context(
        self,
        chapter_number: int,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """准备生成上下文"""
        logger.info(f"Preparing context for chapter {chapter_number}")
        
        context = {}
        
        result = await self.db.execute(
            select(Chapter).where(
                Chapter.novel_id == self.novel_id,
                Chapter.chapter_number < chapter_number
            ).order_by(Chapter.chapter_number.desc()).limit(3)
        )
        previous_chapters = list(result.scalars().all())
        
        if previous_chapters:
            summaries = []
            for ch in reversed(previous_chapters):
                if ch.summary:
                    summaries.append(f"第{ch.chapter_number}章: {ch.summary}")
                elif ch.content:
                    summaries.append(f"第{ch.chapter_number}章: {ch.content[:200]}...")
            context["previous_summary"] = "\n".join(summaries)
        
        result = await self.db.execute(
            select(Character).where(Character.novel_id == self.novel_id)
        )
        characters = list(result.scalars().all())
        context["characters"] = [
            {
                "id": char.id,
                "name": char.name,
                "personality": char.personality,
                "abilities": char.abilities
            }
            for char in characters
        ]
        
        result = await self.db.execute(
            select(PlotEvent).where(
                PlotEvent.novel_id == self.novel_id
            ).order_by(PlotEvent.created_at.desc()).limit(10)
        )
        plot_events = list(result.scalars().all())
        context["plot_hints"] = [
            {
                "id": event.id,
                "type": event.event_type,
                "description": event.description
            }
            for event in plot_events
        ]

        outline_result = await self.db.execute(
            select(PlotOutline).where(PlotOutline.novel_id == self.novel_id)
        )
        outline = outline_result.scalar_one_or_none()
        if outline:
            context["story_outline"] = {
                "premise": outline.premise,
                "theme": outline.theme,
                "beginning": outline.beginning,
                "middle": outline.middle,
                "climax": outline.climax,
                "ending": outline.ending,
                "current_chapter": outline.current_chapter,
                "total_chapters": outline.total_chapters,
            }

        active_lines_result = await self.db.execute(
            select(PlotLine)
            .where(PlotLine.novel_id == self.novel_id, PlotLine.status == "active")
            .order_by(PlotLine.importance.desc(), PlotLine.updated_at.desc())
            .limit(5)
        )
        active_lines = list(active_lines_result.scalars().all())
        context["active_plot_lines"] = [
            {
                "id": line.id,
                "name": line.name,
                "description": line.description,
                "line_type": line.line_type,
                "importance": line.importance
            }
            for line in active_lines
        ]

        upcoming_nodes_result = await self.db.execute(
            select(PlotNode)
            .where(
                PlotNode.novel_id == self.novel_id,
                PlotNode.status.in_([PlotNodeStatus.PLANNED.value, PlotNodeStatus.IN_PROGRESS.value]),
                ((PlotNode.chapter_number == None) | (PlotNode.chapter_number >= chapter_number))
            )
            .order_by(PlotNode.chapter_number.asc(), PlotNode.sequence.asc())
            .limit(5)
        )
        upcoming_nodes = list(upcoming_nodes_result.scalars().all())
        context["upcoming_plot_nodes"] = [
            {
                "id": node.id,
                "title": node.title,
                "description": node.description,
                "chapter_number": node.chapter_number,
                "status": node.status,
                "notes": node.notes
            }
            for node in upcoming_nodes
        ]

        unresolved_result = await self.db.execute(
            select(Foreshadowing)
            .where(
                Foreshadowing.novel_id == self.novel_id,
                Foreshadowing.status == ForeshadowingStatus.UNRESOLVED.value
            )
            .order_by(Foreshadowing.importance.desc(), Foreshadowing.created_at.desc())
            .limit(8)
        )
        unresolved = list(unresolved_result.scalars().all())
        context["unresolved_foreshadowings"] = [
            {
                "id": fs.id,
                "title": fs.title,
                "description": fs.description,
                "importance": fs.importance,
                "created_chapter_id": fs.created_chapter_id
            }
            for fs in unresolved
        ]

        if active_lines:
            context["current_arc_summary"] = "；".join(
                f"{line.name}: {line.description or ''}".strip()
                for line in active_lines[:3]
            )

        profile_result = await self.db.execute(
            select(NovelCreativeProfile).where(NovelCreativeProfile.novel_id == self.novel_id)
        )
        creative_profile = profile_result.scalar_one_or_none()
        if creative_profile:
            context["author_preferences"] = {
                "author_intent": creative_profile.author_intent,
                "preferred_tone": creative_profile.preferred_tone,
                "collaboration_style": creative_profile.collaboration_style,
                "scene_planning_notes": creative_profile.scene_planning_notes,
                "must_keep": creative_profile.must_keep or [],
                "must_avoid": creative_profile.must_avoid or [],
                "long_term_goals": creative_profile.long_term_goals or [],
            }
        
        if additional_context:
            key_events = additional_context.get("key_events")
            if key_events:
                context.setdefault("plot_hints", [])
                context["plot_hints"].extend(
                    {"id": None, "type": "planned_event", "description": str(item)}
                    for item in key_events
                )
            context.update(additional_context)
        
        return context

    def _build_generation_parameters(self, additional_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        additional_context = additional_context or {}
        parameters: Dict[str, Any] = {}
        if additional_context.get("user_prompt"):
            parameters["writing_task"] = additional_context["user_prompt"]
        if additional_context.get("chapter_outline"):
            parameters["outline"] = additional_context["chapter_outline"]
        if additional_context.get("tone"):
            parameters["tone"] = additional_context["tone"]
        if additional_context.get("author_intent"):
            parameters["author_intent"] = additional_context["author_intent"]
        if additional_context.get("scene_goal"):
            parameters["scene_goal"] = additional_context["scene_goal"]
        if additional_context.get("must_keep"):
            parameters["must_keep"] = additional_context["must_keep"]
        if additional_context.get("must_avoid"):
            parameters["must_avoid"] = additional_context["must_avoid"]
        return parameters
    
    async def _save_chapter(
        self,
        chapter_number: int,
        content: str,
        style: str
    ) -> Chapter:
        """保存章节"""
        result = await self.db.execute(
            select(Chapter).where(
                Chapter.novel_id == self.novel_id,
                Chapter.chapter_number == chapter_number
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.content = content
            existing.summary = await self._generate_chapter_summary(content)
            existing.status = "completed"
            existing.word_count = len(content)
            existing.updated_at = datetime.now()
            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            chapter = Chapter(
                novel_id=self.novel_id,
                chapter_number=chapter_number,
                title=f"第{chapter_number}章",
                content=content,
                summary=await self._generate_chapter_summary(content),
                status="completed",
                word_count=len(content)
            )
            self.db.add(chapter)
            await self.db.commit()
            await self.db.refresh(chapter)
            return chapter
    
    async def _update_chapter_memory(self, chapter_id: int) -> Dict[str, Any]:
        task = AgentTask(
            task_id=f"memory_{self.novel_id}_{chapter_id}_{datetime.now().timestamp()}",
            task_type=TaskType.UPDATE_MEMORY,
            novel_id=self.novel_id,
            chapter_id=chapter_id,
            parameters={"chapter_id": chapter_id}
        )
        result = await self.coordinator.execute(task)
        if not result.success:
            logger.warning(f"Memory update failed for chapter {chapter_id}: {result.error}")
        return result.to_dict()

    async def _get_chapter(self, chapter_number: int) -> Optional[Chapter]:
        result = await self.db.execute(
            select(Chapter).where(
                Chapter.novel_id == self.novel_id,
                Chapter.chapter_number == chapter_number
            )
        )
        return result.scalar_one_or_none()

    async def _generate_chapter_summary(self, content: str) -> Optional[str]:
        if not content or len(content.strip()) < 200:
            return content[:200] if content else None

        prompt = (
            "请为以下小说章节生成一段120字以内的剧情摘要，"
            "只保留关键情节推进、人物变化和伏笔，不要评价。\n\n"
            f"{content[:4000]}"
        )
        try:
            summary = await llm_service.generate_text(
                prompt=prompt,
                system_prompt="你是长篇小说章节摘要助手。",
                max_tokens=200
            )
            return summary.strip()
        except Exception as e:
            logger.warning(f"Failed to generate chapter summary: {e}")
            return content[:200]
    
    async def regenerate_chapter(
        self,
        chapter_id: int,
        feedback: Optional[str] = None
    ) -> Dict[str, Any]:
        """重新生成章节"""
        result = await self.db.execute(
            select(Chapter).where(Chapter.id == chapter_id)
        )
        chapter = result.scalar_one_or_none()
        if not chapter:
            return {"success": False, "error": "章节不存在"}
        
        additional_context = {}
        if feedback:
            additional_context["feedback"] = feedback
            additional_context["previous_content"] = chapter.content
        
        return await self.generate_chapter(
            chapter_number=chapter.chapter_number,
            additional_context=additional_context
        )
    
    async def get_generation_status(self, task_id: str) -> Dict[str, Any]:
        """获取生成状态"""
        status = self.coordinator.get_task_status(task_id)
        return status or {"status": "not_found"}
