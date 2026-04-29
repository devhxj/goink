"""
编辑类MCP工具 - 支持副本编辑机制
注意：accept_edit和reject_edit是用户操作，不暴露给AI
"""
from contextvars import ContextVar
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .base import BaseMCPTool, MCPToolResult, MCPToolCategory, MCPToolRegistry
from app.novels.models import Novel
from app.chapters.models import Chapter
from app.editor.service import get_edit_session_manager
from app.editor.models import EditSession, EditSessionStatus, EditChange
from app.core.context_builder import ContextBuilder
from app.core.permissions import verify_novel_ownership

_subagent_running_var: ContextVar[bool] = ContextVar("_subagent_running_var", default=False)


class StartEditSessionTool(BaseMCPTool):
    """开始编辑会话（创建副本）"""
    
    name = "start_edit_session"
    description = "开始编辑会话，创建一个副本用于AI和用户编辑。原内容保持不变，直到用户接受或拒绝。必须提供chapter_id；若不清楚章节ID，先调用 get_chapter_list 或 read_chapter_for_edit 获取。成功后应继续调用 apply_edit 写入正文。\n💡 提示：如果已有活跃编辑会话，会自动复用，无需重复创建。"
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "integer",
                "description": "章节ID（必填）"
            }
        },
        "required": ["chapter_id"]
    }
    
    def __init__(self):
        pass
    
    async def execute(
        self,
        db: AsyncSession,
        novel_id: int,
        user_id: int,
        chapter_id: Optional[int] = None,
        session_id: str = "",
        **kwargs
    ) -> MCPToolResult:
        try:
            if not chapter_id:
                return MCPToolResult(
                    success=False,
                    error="无法确定要编辑的章节，请先选择一个章节或提供chapter_id"
                )
            
            novel = await verify_novel_ownership(db, novel_id, user_id)
            if not novel:
                return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
            
            result = await db.execute(
                select(Chapter).where(Chapter.id == chapter_id)
            )
            chapter = result.scalar_one_or_none()
            
            if not chapter:
                return MCPToolResult(success=False, error=f"章节不存在: {chapter_id}")
            
            if chapter.novel_id != novel_id:
                return MCPToolResult(success=False, error="无权编辑此章节：章节不属于当前小说")
            
            manager = get_edit_session_manager(db)
            existing = await manager.get_edit_session(chapter_id)
            
            if existing:
                return MCPToolResult(
                    success=True,
                    data={
                        "edit_session_id": existing.edit_session_id,
                        "chapter_id": chapter_id,
                        "original_content": existing.original_content,
                        "working_content": existing.working_content,
                        "change_count": existing.change_count,
                        "status": existing.status,
                        "reused_existing": True,
                        "message": "已有活动的编辑会话，可以继续编辑"
                    },
                    metadata={"tool": self.name, "edit_session_id": existing.edit_session_id}
                )
            
            edit_session = await manager.create_edit_session(chapter_id, session_id)
            
            return MCPToolResult(
                success=True,
                data={
                    "edit_session_id": edit_session.edit_session_id,
                    "chapter_id": chapter_id,
                    "original_content": edit_session.original_content,
                    "working_content": edit_session.working_content,
                    "change_count": 0,
                    "status": "pending",
                    "reused_existing": False,
                    "message": "编辑会话已创建，可以开始编辑。编辑完成后用户需要确认接受或拒绝。"
                },
                metadata={"tool": self.name, "edit_session_id": edit_session.edit_session_id}
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class ApplyEditTool(BaseMCPTool):
    """应用编辑到副本"""
    
    name = "apply_edit"
    description = (
        "应用编辑到副本内容。必须先用 start_edit_session 获取 edit_session_id（如有活跃会话可直接用）。"
        "\n【变更类型选择指南】"
        "\n- full_replace：你有完整的修改后全文，且改动幅度超过30% → 传 new_content 为完整替换文本"
        "\n- search_replace（推荐）：你知道要改的是哪段原文 → 传 search_text(要找的原文) + new_content(替换内容)，无需知道行号。支持跨行匹配和 match_mode 控制替换范围。"
        "\n- line_range_replace：你知道精确的行号范围 → 传 start_line + end_line + new_content"
        "\n- partial_edit：同 line_range_replace（兼容旧调用）"
        "\n- insert：在指定位置插入新内容"
        "\n- delete：删除指定范围的内容"
        "\n多次编辑会累积变更计数。编辑只修改副本，需用户确认后才生效。"
    )
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "edit_session_id": {
                "type": "string",
                "description": "编辑会话ID"
            },
            "change_type": {
                "type": "string",
                "enum": ["full_replace", "partial_edit", "search_replace", "line_range_replace", "insert", "delete"],
                "description": "变更类型（推荐用 search_replace 做局部修改）"
            },
            "new_content": {
                "type": "string",
                "description": "新内容（search_replace模式为替换后的内容；full_replace为完整新文本）"
            },
            "search_text": {
                "type": "string",
                "description": "要搜索的原文片段（search_replace模式必填，支持跨行匹配）"
            },
            "match_mode": {
                "type": "string",
                "enum": ["first", "all"],
                "default": "first",
                "description": "匹配模式：first=只替换第一处匹配，all=替换所有匹配（search_replace模式时使用）"
            },
            "start_line": {
                "type": "integer",
                "description": "起始行号（line_range_replace/partial_edit/insert/delete时必填）"
            },
            "end_line": {
                "type": "integer",
                "description": "结束行号（line_range_replace/partial_edit/delete时必填）"
            },
            "reason": {
                "type": "string",
                "description": "修改原因"
            }
        },
        "required": ["edit_session_id", "change_type", "new_content"]
    }
    
    def __init__(self):
        pass
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int,
        edit_session_id: str,
        change_type: str,
        new_content: str,
        start_line: int | None = None,
        end_line: int | None = None,
        search_text: str | None = None,
        match_mode: str = "first",
        reason: str | None = None,
        **kwargs
    ) -> MCPToolResult:
        try:
            manager = get_edit_session_manager(db)
            edit_session = await manager.get_edit_session_by_id(edit_session_id)

            if not edit_session:
                return MCPToolResult(success=False, error="编辑会话不存在")

            chapter_result = await db.execute(
                select(Chapter).where(Chapter.id == edit_session.chapter_id)
            )
            chapter = chapter_result.scalar_one_or_none()
            if not chapter:
                return MCPToolResult(success=False, error="章节不存在")

            novel = await verify_novel_ownership(db, chapter.novel_id, user_id)
            if not novel:
                return MCPToolResult(success=False, error="无权访问此小说或小说不存在")

            effective_start_line = start_line
            effective_end_line = end_line

            if change_type == "search_replace":
                if not search_text:
                    return MCPToolResult(
                        success=False,
                        error="search_replace 模式必须提供 search_text 参数（要搜索的原文片段）"
                    )
                from app.core.diff_engine import DiffEngine
                working = edit_session.working_content or ""
                new_working, replace_count, error_msg = DiffEngine.search_and_replace(
                    content=working,
                    search_text=search_text,
                    replace_text=new_content,
                    match_mode=match_mode,
                )
                if error_msg:
                    return MCPToolResult(success=False, error=error_msg)

                edit_session.working_content = new_working
                edit_session.change_count = (edit_session.change_count or 0) + replace_count
                await db.commit()
                await db.refresh(edit_session)

                diff_data = await manager.get_diff(edit_session_id)

                return MCPToolResult(
                    success=True,
                    data={
                        "edit_session_id": edit_session_id,
                        "change_count": edit_session.change_count,
                        "replacements_made": replace_count,
                        "working_content": edit_session.working_content,
                        "diff": diff_data.get("diff", {}),
                        "message": f"替换了 {replace_count} 处匹配。共 {edit_session.change_count} 处改动。等待用户确认。"
                    },
                    metadata={
                        "tool": self.name,
                        "change_count": edit_session.change_count,
                        "edit_session_id": edit_session_id,
                        "requires_user_confirmation": True
                    }
                )

            if change_type == "line_range_replace":
                if start_line is None or end_line is None:
                    return MCPToolResult(
                        success=False,
                        error="line_range_replace 模式必须提供 start_line 和 end_line 参数"
                    )

            await manager.apply_change(
                edit_session=edit_session,
                change_type="partial_edit" if change_type in ("partial_edit", "line_range_replace") else change_type,
                new_content=new_content,
                start_line=effective_start_line,
                end_line=effective_end_line,
                reason=reason
            )

            diff_data = await manager.get_diff(edit_session_id)

            return MCPToolResult(
                success=True,
                data={
                    "edit_session_id": edit_session_id,
                    "change_count": edit_session.change_count,
                    "working_content": edit_session.working_content,
                    "diff": diff_data.get("diff", {}),
                    "message": f"变更已应用到副本，共 {edit_session.change_count} 处改动。等待用户确认。"
                },
                metadata={
                    "tool": self.name,
                    "change_count": edit_session.change_count,
                    "edit_session_id": edit_session_id,
                    "requires_user_confirmation": True
                }
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class EditChapterContentTool(BaseMCPTool):
    """编辑章节内容，创建或复用编辑会话"""
    
    name = "edit_chapter_content"
    description = "编辑章节内容，自动创建或复用副本编辑会话并应用变更。用于前端API调用，不建议LLM直接调用。"
    category = MCPToolCategory.WRITING_ASSISTANT
    expose_to_llm = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "session_id": {
                "type": "string",
                "description": "会话ID"
            },
            "chapter_id": {
                "type": "integer",
                "description": "章节ID"
            },
            "change_type": {
                "type": "string",
                "enum": ["full_replace", "partial_edit", "insert", "delete"],
                "description": "变更类型"
            },
            "new_content": {
                "type": "string",
                "description": "新内容"
            },
            "start_line": {
                "type": "integer",
                "description": "起始行号（partial_edit/insert/delete时可选）"
            },
            "end_line": {
                "type": "integer",
                "description": "结束行号（partial_edit/delete时可选）"
            },
            "reason": {
                "type": "string",
                "description": "修改原因"
            }
        },
        "required": ["session_id", "chapter_id", "change_type", "new_content"]
    }
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int,
        session_id: str,
        chapter_id: int,
        change_type: str,
        new_content: str,
        start_line: Optional[int] = None,
        end_line: Optional[int] = None,
        reason: Optional[str] = None,
        **kwargs
    ) -> MCPToolResult:
        try:
            chapter_result = await db.execute(
                select(Chapter).where(Chapter.id == chapter_id)
            )
            chapter = chapter_result.scalar_one_or_none()
            if not chapter:
                return MCPToolResult(success=False, error="章节不存在")
            
            novel = await verify_novel_ownership(db, chapter.novel_id, user_id)
            if not novel:
                return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
            
            manager = get_edit_session_manager(db)
            edit_session = await manager.get_edit_session(chapter_id)
            if not edit_session:
                edit_session = await manager.create_edit_session(chapter_id, session_id)
            
            await manager.apply_change(
                edit_session=edit_session,
                change_type=change_type,
                new_content=new_content,
                start_line=start_line,
                end_line=end_line,
                reason=reason
            )
            
            diff_data = await manager.get_diff(edit_session.edit_session_id)
            
            return MCPToolResult(
                success=True,
                data={
                    "edit_session_id": edit_session.edit_session_id,
                    "chapter_id": chapter_id,
                    "change_count": edit_session.change_count,
                    "working_content": edit_session.working_content,
                    "diff": diff_data.get("diff", {}),
                    "message": f"变更已应用到副本，共 {edit_session.change_count} 处改动。等待用户确认。"
                },
                metadata={
                    "tool": self.name,
                    "change_count": edit_session.change_count,
                    "edit_session_id": edit_session.edit_session_id,
                    "requires_user_confirmation": True
                }
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class GetEditStatusTool(BaseMCPTool):
    """获取编辑状态"""
    
    name = "get_edit_status"
    description = "获取章节当前的编辑状态，包括是否有活动的编辑会话、副本内容等。必须提供chapter_id，可先用 get_chapter_list 获取。"
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "integer",
                "description": "章节ID"
            },
            "include_line_numbers": {
                "type": "boolean",
                "default": True,
                "description": "是否包含行号"
            }
        },
        "required": ["chapter_id"]
    }
    
    def __init__(self):
        pass
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int,
        chapter_id: int,
        include_line_numbers: bool = True,
        **kwargs
    ) -> MCPToolResult:
        try:
            manager = get_edit_session_manager(db)
            edit_session = await manager.get_edit_session(chapter_id)
            
            if edit_session:
                result = await db.execute(
                    select(Chapter).where(Chapter.id == chapter_id)
                )
                chapter = result.scalar_one_or_none()
                if not chapter:
                    return MCPToolResult(success=False, error="章节不存在")
                novel = await verify_novel_ownership(db, chapter.novel_id, user_id)
                if not novel:
                    return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
                diff_data = await manager.get_diff(edit_session.edit_session_id)
                changes_result = await db.execute(
                    select(EditChange)
                    .where(EditChange.edit_session_id == edit_session.id)
                    .order_by(EditChange.created_at.desc())
                    .limit(5)
                )
                recent_changes = list(changes_result.scalars().all())
                return MCPToolResult(
                    success=True,
                    data={
                        "has_active_edit": True,
                        "edit_session_id": edit_session.edit_session_id,
                        "latest_pending_edit_session_id": edit_session.edit_session_id,
                        "status": edit_session.status,
                        "change_count": edit_session.change_count,
                        "working_content": edit_session.working_content,
                        "original_content": edit_session.original_content,
                        "diff": diff_data.get("diff", {}),
                        "created_from_ws_session": (edit_session.extra_metadata or {}).get("created_from_ws_session"),
                        "recent_changes": [change.to_dict() for change in recent_changes]
                    }
                )
            
            result = await db.execute(
                select(Chapter).where(Chapter.id == chapter_id)
            )
            chapter = result.scalar_one_or_none()
            if chapter:
                novel = await verify_novel_ownership(db, chapter.novel_id, user_id)
                if not novel:
                    return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
            
            return MCPToolResult(
                success=True,
                data={
                    "has_active_edit": False,
                    "latest_pending_edit_session_id": None,
                    "chapter_content": chapter.content if chapter else "",
                    "message": "当前没有活动的编辑会话"
                }
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class RunAgentTaskTool(BaseMCPTool):
    """执行Agent任务"""
    
    name = "run_agent_task"
    description = "由主Agent调度子Agent执行任务（写作/审核/一致性/规划）。task_type可选：generate_chapter/review_chapter/check_consistency/update_memory/plan_plot/manage_foreshadowing，也支持别名 writing/write/review/consistency/memory/plan/foreshadowing。"
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "task_type": {
                "type": "string",
                "description": "任务类型"
            },
            "novel_id": {
                "type": "integer",
                "description": "小说ID"
            },
            "chapter_id": {
                "type": "integer",
                "description": "章节ID（可选）"
            },
            "parameters": {
                "type": "object",
                "description": "任务参数"
            },
            "agent_role": {
                "type": "string",
                "description": "指定Agent角色（可选）"
            },
            "agent_id": {
                "type": "string",
                "description": "指定Agent ID（可选）"
            },
            "model": {
                "type": "string",
                "description": "指定模型（可选）"
            }
        },
        "required": ["task_type", "novel_id"]
    }
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int,
        task_type: str,
        novel_id: int,
        chapter_id: Optional[int] = None,
        parameters: Optional[Dict[str, Any]] = None,
        agent_role: Optional[str] = None,
        agent_id: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> MCPToolResult:
        try:
            task_type_map = {
                "writing": "generate_chapter",
                "write": "generate_chapter",
                "review": "review_chapter",
                "consistency": "check_consistency",
                "memory": "update_memory",
                "plan": "plan_plot",
                "foreshadowing": "manage_foreshadowing"
            }
            normalized_type = task_type_map.get(task_type, task_type)
            novel = await verify_novel_ownership(db, novel_id, user_id)
            if not novel:
                return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
            
            from app.agents.base import AgentTask, TaskType, AgentRole
            from app.agents.reviewer import ReviewerAgent
            from app.agents.memory import MemoryAgent
            from app.consistency.service import ConsistencyChecker
            
            task_parameters = parameters or {}
            if model:
                task_parameters["model"] = model
            if agent_role:
                task_parameters["agent_role"] = agent_role
            if agent_id:
                task_parameters["agent_id"] = agent_id
            
            context: Dict[str, Any] = {}
            if chapter_id:
                chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
                chapter = chapter_result.scalar_one_or_none()
                if chapter:
                    task_parameters.setdefault("chapter_number", chapter.chapter_number)
                    context_builder = ContextBuilder(db, novel_id)
                    story_brief = await context_builder.build_story_brief(
                        chapter_number=chapter.chapter_number,
                        context_size=3000,
                        additional_context=task_parameters
                    )
                    layered_context = story_brief.get("layered_context", {})
                    context = {
                        "previous_summary": layered_context.get("previous_summary"),
                        "characters": layered_context.get("characters", []),
                        "plot_hints": layered_context.get("plot_hints", []),
                        "story_outline": story_brief.get("outline", {}),
                        "active_plot_lines": story_brief.get("active_plot_lines", []),
                        "upcoming_plot_nodes": story_brief.get("upcoming_plot_nodes", []),
                        "due_plot_nodes": story_brief.get("due_plot_nodes", []),
                        "timeline_entries": story_brief.get("timeline_entries", []),
                        "priority_timeline_entries": story_brief.get("priority_timeline_entries", []),
                        "unresolved_foreshadowings": story_brief.get("foreshadowing_entries", []),
                        "due_foreshadowings": story_brief.get("due_foreshadowing_entries", []),
                        "retrieved_memory": story_brief.get("retrieved_memory", []),
                        "prewrite_recommendations": story_brief.get("prewrite_recommendations", []),
                        "chapter_mission": story_brief.get("chapter_mission", {}),
                        "story_brief": story_brief.get("brief_text", ""),
                        "author_preferences": story_brief.get("creative_profile", {}),
                    }
            if normalized_type == "check_consistency":
                checker = ConsistencyChecker(db, novel_id)
                context["consistency_result"] = await checker.check_all(
                    chapter_ids=[chapter_id] if chapter_id else None,
                    check_types=task_parameters.get("check_types")
                )
            
            task = AgentTask(
                task_id=f"task_{novel_id}_{task_type}_{chapter_id or 'general'}",
                task_type=TaskType(normalized_type),
                novel_id=novel_id,
                chapter_id=chapter_id,
                parameters=task_parameters,
                context=context
            )
            
            if normalized_type in ("review_chapter", "check_consistency", "manage_foreshadowing"):
                agent = ReviewerAgent()
                result = await agent.execute(task)
            elif normalized_type == "update_memory":
                agent = MemoryAgent()
                result = await agent.execute(task)
            else:
                from app.agents.factory import create_default_coordinator
                coordinator = create_default_coordinator()
                result = await coordinator.execute(task)
            
            return MCPToolResult(
                success=result.success,
                data=result.to_dict(),
                error=result.error
            )
        except ValueError:
            return MCPToolResult(
                success=False,
                error="无效的task_type，可用: generate_chapter, review_chapter, check_consistency, update_memory, plan_plot, manage_foreshadowing"
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class GetPendingChangesTool(BaseMCPTool):
    """获取待确认变更列表"""


class RunSubagentTool(BaseMCPTool):
    """调度子Agent执行专业任务"""

    name = "run_subagent"
    description = (
        "调度子Agent执行专业任务。可用任务类型：\n"
        "- write_chapter: 写作/续写章节内容\n"
        "- review: 全量审核章节（规则初筛+LLM语义深审+一致性检查+伏笔管理）\n"
        "- update_memory: 更新向量记忆索引\n\n"
        "你只需指定任务类型和目标（如章节ID），后端会自动准备上下文。\n"
        "子Agent会返回结构化报告，包含摘要、关键发现和建议。"
    )
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "task_type": {
                "type": "string",
                "description": "任务类型：write_chapter / review / update_memory"
            },
            "chapter_id": {
                "type": "integer",
                "description": "目标章节ID（写作/审核/一致性检查时必填）"
            },
            "instruction": {
                "type": "string",
                "description": "给子Agent的额外指令（如写作要求、审核重点、修订意见等）"
            },
            "parameters": {
                "type": "object",
                "description": "任务特定参数（可选，如 model、style、target_length 等）"
            }
        },
        "required": ["task_type"]
    }

    async def execute(self, **kwargs) -> MCPToolResult:
        if _subagent_running_var.get():
            return MCPToolResult(
                success=False,
                error="子Agent不允许启动子Agent，避免无限递归"
            )

        task_type = str(kwargs.get("task_type", ""))
        chapter_id = kwargs.get("chapter_id")
        instruction = kwargs.get("instruction")
        parameters = kwargs.get("parameters", {})
        novel_id = kwargs.get("novel_id")
        db = kwargs.get("db")

        if not novel_id or not db:
            return MCPToolResult(success=False, error="novel_id and db are required")

        from app.agents.registry import get_agent_for_task, get_all_specs
        from app.agents.context_provider import build_subagent_context
        from app.agents.base import AgentTask, TaskType, SubAgentReport
        import uuid

        TYPE_ALIASES = {
            "write": "write_chapter",
            "writing": "write_chapter",
            "generate": "write_chapter",
            "generate_chapter": "write_chapter",
            "review_chapter": "review",
            "check_consistency": "review",
            "manage_foreshadowing": "review",
            "review": "review",
            "memory": "update_memory",
        }

        normalized_type = TYPE_ALIASES.get(task_type, task_type)

        entry = get_agent_for_task(normalized_type)
        if not entry:
            available = list(get_all_specs().keys())
            return MCPToolResult(
                success=False,
                error=f"未知的任务类型 '{task_type}'，可用类型: {', '.join(available)}"
            )

        agent_cls, spec = entry

        if spec.requires_chapter_id and not chapter_id:
            return MCPToolResult(
                success=False,
                error=f"任务类型 '{normalized_type}' 需要 chapter_id 参数"
            )

        try:
            context = await build_subagent_context(
                db=db,
                novel_id=novel_id,
                spec=spec,
                chapter_id=chapter_id,
                instruction=instruction,
                extra_parameters=parameters,
            )

            task_type_enum = TaskType(normalized_type) if normalized_type in [e.value for e in TaskType] else TaskType.GENERATE_CHAPTER

            task = AgentTask(
                task_id=f"sub_{uuid.uuid4().hex[:12]}",
                task_type=task_type_enum,
                novel_id=novel_id,
                chapter_id=chapter_id,
                parameters=parameters,
                context=context,
            )

            agent = agent_cls()
            token = _subagent_running_var.set(True)
            try:
                result = await agent.execute(task)
            finally:
                _subagent_running_var.reset(token)

            report = SubAgentReport(
                task_type=normalized_type,
                success=result.success,
                summary=result.result.get("summary", "任务完成") if result.success else f"任务失败: {result.error}",
                key_findings=result.result.get("key_findings", []) if result.success else [],
                suggestions=result.suggestions,
                data=result.result,
                error=result.error,
            )

            return MCPToolResult(
                success=report.success,
                data=report.to_dict(),
                error=report.error,
            )

        except Exception as e:
            return MCPToolResult(success=False, error=f"子Agent执行失败: {str(e)}")
    
    name = "get_pending_changes"
    description = "获取待确认的副本编辑变更列表，可按章节或会话筛选"
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "integer",
                "description": "章节ID（可选）"
            },
            "session_id": {
                "type": "string",
                "description": "会话ID（可选）"
            },
            "limit": {
                "type": "integer",
                "default": 10,
                "description": "返回数量限制"
            }
        },
        "required": []
    }
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int ,
        chapter_id: Optional[int] = None,
        session_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> MCPToolResult:
        try:
            if not user_id:
                return MCPToolResult(success=False, error="未提供用户身份信息")
            
            query = select(EditSession).options(selectinload(EditSession.chapter))
            query = (
                query.join(Chapter, EditSession.chapter_id == Chapter.id)
                .join(Novel, Chapter.novel_id == Novel.id)
                .where(Novel.author_id == user_id)
            )
            
            query = query.where(EditSession.status == EditSessionStatus.PENDING)
            
            if chapter_id:
                query = query.where(EditSession.chapter_id == chapter_id)
            if session_id:
                query = query.where(EditSession.ws_session_id == session_id)
            
            query = query.order_by(EditSession.created_at.desc()).limit(limit)
            result = await db.execute(query)
            sessions = result.scalars().all()
            
            data = [
                {
                    "edit_session_id": s.edit_session_id,
                    "chapter_id": s.chapter_id,
                    "chapter_title": s.chapter.title if s.chapter else None,
                    "ws_session_id": s.ws_session_id,
                    "status": s.status,
                    "change_count": s.change_count,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "content_preview": (s.working_content or "")[:120]
                }
                for s in sessions
            ]
            
            return MCPToolResult(
                success=True,
                data={"items": data, "total": len(data)}
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class ReadChapterForEditTool(BaseMCPTool):
    """读取章节内容用于编辑"""
    
    name = "read_chapter_for_edit"
    description = "读取章节内容用于编辑，返回完整内容和行号信息"
    category = MCPToolCategory.WRITING_ASSISTANT
    parameters_schema = {
        "type": "object",
        "properties": {
            "chapter_id": {
                "type": "integer",
                "description": "章节ID"
            }
        },
        "required": ["chapter_id"]
    }
    
    def __init__(self):
        pass
    
    async def execute(
        self,
        db: AsyncSession,
        user_id: int,
        chapter_id: int,
        **kwargs
    ) -> MCPToolResult:
        try:
            result = await db.execute(
                select(Chapter).where(Chapter.id == chapter_id)
            )
            chapter = result.scalar_one_or_none()
            
            if not chapter:
                return MCPToolResult(success=False, error="章节不存在")
            
            novel = await verify_novel_ownership(db, chapter.novel_id, user_id)
            if not novel:
                return MCPToolResult(success=False, error="无权访问此小说或小说不存在")
            
            content = chapter.content or ""
            lines = content.splitlines()
            lines_payload = [{"line_number": i + 1, "content": line} for i, line in enumerate(lines)]
            
            return MCPToolResult(
                success=True,
                data={
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "content": content,
                    "line_count": len(lines),
                    "word_count": len(content),
                    "lines": lines_payload
                },
                metadata={"tool": self.name, "chapter_id": chapter_id}
            )
        except Exception as e:
            return MCPToolResult(success=False, error=str(e))


class EditingTools:
    """编辑工具集合 - 只包含AI可调用的工具"""
    
    @staticmethod
    def register_all(registry: MCPToolRegistry) -> None:
        """注册所有编辑工具（不包括accept/reject，那是用户操作）"""
        registry.register(StartEditSessionTool())
        registry.register(ApplyEditTool())
        registry.register(EditChapterContentTool())
        registry.register(GetEditStatusTool())
        registry.register(RunAgentTaskTool())
        registry.register(RunSubagentTool())
        registry.register(GetPendingChangesTool())
        registry.register(ReadChapterForEditTool())
