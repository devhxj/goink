# AI 小说创作系统架构优化计划

> 版本：2.0 | 日期：2026-04-28 | 状态：待批准

***

## 一、背景与目标

### 当前问题

经过深度 Code Review，系统存在以下核心问题：

1. **双引擎并存**：Coordinator 递归链与 LangGraph 状态图实现相同逻辑，维护成本倍增
2. **LangGraph 有功能性 Bug**：feedback 未传递给 WriterAgent，修订循环无效
3. **审核质量不足**：ReviewerAgent 纯规则检查，无法检测语义层面问题
4. **上下文膨胀**：对话历史无限增长，无压缩机制
5. **编辑工具不可靠**：search\_replace 只匹配第一行第一处，AI 难以精确编辑
6. **事务安全性缺失**：db session 共享、章节保存+记忆更新非原子、异常被吞没

### 核心设计理念

**一个主 Agent 与用户自由对话，其他 Agent 是它的手下。**

- 主 Agent（Tool-Use Loop 中的 LLM）直接与用户交流，自主决定调用什么工具
- 子 Agent（Writer/Reviewer/Memory）是主 Agent 可调度的"专家"，通过工具触发
- 用户可随时干预调整，不被固定流程束缚
- 未来 LLM 能力提升后，灵活的工具调用模式将更有优势

### 目标

- 统一为 Tool-Use Loop 单引擎架构，废弃 LangGraph
- 将 ReviewerAgent 改造为子 Agent，由主 Agent 按需调度
- 实现上下文压缩（LLM 摘要压缩 + Token 预算分配）
- 改进编辑机制（参考 Aider/Claude Code 的 search/replace + 精确匹配+错误反馈）
- 加固事务安全性

***

## 二、架构优化方案

### 2.1 废弃 LangGraph，统一为 Tool-Use Loop

**改动范围**：

| 文件                                    | 操作                                  |
| ------------------------------------- | ----------------------------------- |
| `workflows/langgraph_workflow.py`     | 标记为 deprecated，添加弃用警告               |
| `ws_chat.py` 的 `_run_generation_task` | 移除 LangGraph 分支，统一走流式生成             |
| `agents/coordinator.py`               | 保留但简化，仅用于 `run_agent_task` 工具的子任务调度 |
| `agents/writer.py`                    | 保留，重构参数传递（见 2.6）                    |
| `agents/reviewer.py`                  | 重构为子 Agent，由主 Agent 按需调度（见 2.2）     |
| `agents/memory.py`                    | 保留，与 ws\_chat 中的记忆更新逻辑统一            |

**具体改动**：

1. `_run_generation_task` 中移除 `if use_langgraph and workflow:` 分支
2. **重要**：当前代码中 `use_langgraph=None` 时默认走 LangGraph（[ws_chat.py:1968](file:///home/nianhe/projects/todo/backend/app/core/ws_chat.py#L1968)），需要修改此默认行为
3. Coordinator 的 `_execute_task_chain` 保留，但仅通过 `run_agent_task` 工具触发
4. 前端 `ChapterGenerate.tsx` 移除 `use_langgraph` 选项

### 2.2 审核机制改造：子 Agent 模式

**设计理念**：ReviewerAgent 作为主 Agent 可调度的子 Agent，用户说"审核一下"或主 Agent 判断需要审核时，通过 `run_agent_task` 工具触发。

**分层策略**：

```
第一层：规则快速初筛（零成本、毫秒级）
  ├── 字数检查（过短/过长）
  ├── 段落结构检查（过少/过多）
  ├── 重复度检测（字符集去重率）
  └── 格式检查（对话标记、段落分隔）

第二层：LLM 语义深审（有成本、秒级）
  ├── 逻辑连贯性（前后文是否矛盾）
  ├── 角色一致性（人设是否崩塌、行为是否符合性格）
  ├── 情节合理性（冲突是否合理、推进是否自然）
  ├── 伏笔管理（是否呼应了到期伏笔、是否埋了新伏笔）
  └── 文笔质量（节奏、描写、对话自然度）
```

**LLM 审核的 Prompt 设计**：

```python
REVIEW_SYSTEM_PROMPT = """你是一位严格的小说审稿编辑。请审核以下章节内容。

审核维度与评分标准（每项 1-10 分）：
1. 逻辑连贯性：前后文是否矛盾，因果是否合理
2. 角色一致性：角色行为是否符合已建立的人设
3. 情节推进：本章是否实质推进了故事，还是原地踏步
4. 伏笔管理：是否合理处理了到期伏笔
5. 文笔质量：节奏、描写、对话的自然度

请以 JSON 格式输出审核结果：
{
  "scores": {"logic": 8, "character": 7, "plot": 6, "foreshadowing": 5, "writing": 8},
  "issues": [
    {"dimension": "character", "severity": "warning", "description": "张三在此处的反应与他谨慎的性格不符", "suggestion": "改为更犹豫的表达"}
  ],
  "passed": true,
  "overall_comment": "整体质量良好，但角色行为需要微调"
}"""
```

**调用方式**：主 Agent 通过 `run_agent_task` 工具调用 ReviewerAgent：

```python
# 主 Agent 判断需要审核时，调用工具
run_agent_task(
    task_type="review_chapter",
    chapter_id=123,
    parameters={"use_llm_review": True}  # 启用 LLM 语义审核
)
```

**改动文件**：

| 文件                         | 改动                                       |
| -------------------------- | ---------------------------------------- |
| `agents/reviewer.py`       | 重构 `_review_chapter`，增加 `_llm_review` 方法 |
| `core/prompt_templates.py` | 添加审核 Prompt 模板                           |
| `core/llm_service.py`      | 添加结构化输出方法（JSON mode）                     |

### 2.3 上下文压缩增强

**现有机制**：`ContextCompressor`（`core/session_manager.py:388-465`）已实现基于重要性评分的压缩：

- `should_compress()`：当上下文使用率 >= 80% 或消息数超限时触发
- `compress()`：保留系统消息 + 重要消息（importance >= 0.7）+ 最近消息
- `_build_fallback_summary()`：简单截断前 120 字作为摘要
- Token 估算：中文字符 /1.5 + 其他字符 /4

**问题**：现有摘要只是简单截断，没用 LLM 生成有意义的摘要，信息损失严重。

**设计参考**：

- OpenAI 官方推荐的 Summarized Context + Recent Turns 模式
- Mem0 的记忆形成策略（选择性提取关键事实）
- Claude Code 的按需读取 + 摘要压缩

**核心原则**：

- ❌ 不限制工具返回内容（章节内容应尽量完整获取）
- ❌ 不使用简单滑动窗口（会丢失重要信息）
- ✅ 在现有 `ContextCompressor` 基础上增加 LLM 摘要生成
- ✅ 保留最近 N 轮完整对话
- ✅ Token 预算分配确保各部分不超限

**改进方案**：增强现有 `ContextCompressor`，而非新建模块

#### 改进1：LLM 摘要替代简单截断

将 `_build_fallback_summary` 替换为 LLM 生成的"记忆形成"摘要：

```python
class ContextCompressor:
    def __init__(self, config: SessionConfig):
        self.config = config
        self._summary_cache: dict[str, str] = {}  # 缓存已生成的摘要

    async def compress_with_llm(self, session: Session) -> Session:
        """使用 LLM 生成摘要的压缩方法"""
        if not self.should_compress(session):
            return session

        messages = session.messages
        if len(messages) <= self.config.keep_recent_messages:
            return session

        system_messages = [m for m in messages if m.role == MessageRole.SYSTEM]
        recent_messages = messages[-self.config.keep_recent_messages:]
        older_messages = messages[len(system_messages):-self.config.keep_recent_messages]
        important_messages = [m for m in older_messages if m.importance >= 0.7]

        # 用 LLM 生成摘要（而非简单截断）
        session.summary = await self._generate_llm_summary(older_messages, session.summary)
        new_messages = system_messages + important_messages + recent_messages
        session.messages = new_messages
        return session

    async def _generate_llm_summary(
        self, older_messages: list[Message], existing_summary: str | None = None
    ) -> str:
        """用 LLM 从早期对话中提取关键事实"""
        from app.core.llm_service import llm_service

        summary_prompt = """请从以下对话历史中提取关键信息，包括：
1. 用户的核心创作意图和偏好
2. 已做出的重要决策（角色设定、情节方向等）
3. 已完成的操作（创建了什么、修改了什么）
4. 未解决的需求或待办事项

忽略日常寒暄和重复内容，只保留对后续创作有价值的要点。"""

        context_parts = []
        if existing_summary:
            context_parts.append(f"【已有摘要】\n{existing_summary}")
        context_parts.append("【新增对话】")
        for m in older_messages[-10:]:  # 只取最近 10 条旧消息
            context_parts.append(f"[{m.role.value}]: {m.content[:200]}")

        return await llm_service.generate_text(
            prompt="\n".join(context_parts),
            system_prompt=summary_prompt,
            temperature=0.3,
            max_tokens=500
        )
```

#### 改进2：Token 预算分配

在 `get_messages_for_api` 中增加更精细的 Token 预算控制：

```python
TOKEN_BUDGET = {
    "system_prompt": 0.15,    # 15% 给 system prompt
    "context": 0.25,          # 25% 给上下文（角色、情节、记忆等）
    "history": 0.35,          # 35% 给对话历史
    "generation": 0.25,       # 25% 给生成空间
}
```

**改动文件**：

| 文件                        | 改动                                                                      |
| ------------------------- | ----------------------------------------------------------------------- |
| `core/session_manager.py` | 增强 `ContextCompressor`，添加 `compress_with_llm` 和 `_generate_llm_summary` |
| `ws_chat.py`              | 调用 `compress_with_llm` 替代 `compress`，增加 Token 预算分配                      |

### 2.4 编辑机制改造

**设计参考**：

- Aider 的 search/replace 三段式（但 Aider 已禁用模糊匹配——因为会静默删除重要内容）
- Claude Code 的 `Replace` 工具（精确匹配 + 错误反馈让 LLM 重试）
- SWE-Agent 的行级编辑（行号范围替换）

**关键洞察**：Aider 的经验表明，模糊匹配在代码编辑中会静默删除重要行，因此 Aider 已改为精确匹配+错误反馈。对小说编辑而言，风险类似但略低（小说文本不像代码那样结构敏感）。我们的策略是：**精确匹配优先，匹配失败时提供详细错误信息让 LLM 重试，同时提供行号范围替换作为备选**。

**当前问题**：

- `search_replace` 只匹配第一行第一处
- 不支持跨行搜索
- 不支持多处匹配
- 匹配失败时无有用错误信息

**新编辑工具设计**：

#### 工具1：`search_replace`（改进版）

```python
class SearchReplaceEdit:
    """改进的 search/replace 编辑

    参考 Aider/Claude Code 设计：
    - 精确匹配优先
    - 支持跨行搜索
    - 支持 first/all 匹配模式
    - 匹配失败时返回详细错误信息（包含附近内容），让 LLM 可以重试
    """

    async def execute(
        self,
        search_text: str,       # 要搜索的文本（可跨行）
        replace_text: str,      # 替换文本
        match_mode: str = "first",  # first / all
    ) -> EditResult:
        """
        match_mode:
        - first: 精确匹配第一处（默认）
        - all: 精确匹配所有处
        """
        # 精确匹配
        if search_text in content:
            # 执行替换
            ...
        else:
            # 匹配失败：返回详细错误信息
            # 找到最相似的段落，告诉 LLM 差异在哪
            best_match = find_most_similar_paragraph(search_text, content)
            return EditResult(
                success=False,
                error=f"未找到精确匹配。最相似的段落：\n{best_match}\n请基于此内容重试。"
            )
```

**错误反馈机制**（参考 Claude Code）：

```python
def find_most_similar_paragraph(search_text: str, content: str) -> str:
    """匹配失败时，找到最相似的段落作为参考

    使用 rapidfuzz 计算段落相似度，找到最接近的段落
    """
    from rapidfuzz import fuzz

    paragraphs = content.split("\n\n")
    best_score = 0
    best_para = ""

    for para in paragraphs:
        score = fuzz.partial_ratio(search_text, para)
        if score > best_score:
            best_score = score
            best_para = para

    return best_para
```

#### 工具2：`line_range_replace`（新增）

```python
class LineRangeReplace:
    """行号范围替换，参考 SWE-Agent 的行级编辑

    适用于：需要精确替换特定行范围的场景
    """

    async def execute(
        self,
        start_line: int,    # 起始行号（1-based）
        end_line: int,      # 结束行号（inclusive）
        new_content: str,   # 新内容（替换 start_line 到 end_line 的内容）
    ) -> EditResult:
```

**改动文件**：

| 文件                     | 改动                                                               |
| ---------------------- | ---------------------------------------------------------------- |
| `mcp/editing_tools.py` | 重构 `ApplyEditTool`，增加 `search_replace` 和 `line_range_replace` 模式 |
| `core/diff_engine.py`  | 增加相似度查找算法（使用 rapidfuzz）                                          |
| `core/edit_mode.py`    | 更新 EditMode 允许的工具列表                                              |

### 2.5 事务安全性加固

#### 问题1：db session 共享

**当前**：`_run_chat_with_tools` 整个工具循环共用一个 db session。

**修复**：每个工具调用使用独立的 db session。

```python
# 修改前
async with AsyncSessionLocal() as db:
    while loop_count < 50:
        result = await registry.execute(tool_name, db=db, ...)

# 修改后
while loop_count < 50:
    async with AsyncSessionLocal() as db:
        result = await registry.execute(tool_name, db=db, ...)
```

#### 问题2：章节保存+记忆更新非原子

**当前**：章节保存成功但记忆更新失败时，向量索引与数据库不一致。

**修复**：章节保存后，记忆更新失败时记录到重试队列。

```python
try:
    await update_chapter_memory(novel_id, chapter_id)
except Exception as e:
    logger.error(f"Memory update failed for chapter {chapter_id}: {e}")
    await schedule_memory_retry(novel_id, chapter_id)
```

#### 问题3：异常被吞没

**当前**：预处理阶段异常被 `except Exception: pass` 吞没。

**修复**：捕获异常后向用户发送警告消息。

```python
try:
    extra_context = await context_builder.search_relevant_context(...)
except Exception as e:
    logger.warning(f"Context retrieval failed: {e}")
    extra_context = ""
    await ws_send(ws, {
        "type": "system_warning",
        "message": "记忆检索暂时不可用，生成质量可能受影响"
    })
```

**改动文件**：

| 文件                                         | 改动                                       |
| ------------------------------------------ | ---------------------------------------- |
| `ws_chat.py`                               | db session 隔离、异常通知、记忆更新重试                |
| `mcp/base.py`                              | `MCPToolRegistry.execute()` 支持独立 session |
| 新建 `core/memory_retry.py` 或在 `memory/` 模块中 | 记忆更新重试队列                                 |

### 2.6 WriterAgent 参数传递重构

**当前**：`_build_writing_prompt` 接受 29 个参数（不含 self）。

**修复**：直接传递 `WritingContext` dataclass。

```python
@dataclass
class WritingContext:
    chapter_number: int
    target_length: int = 3000
    style: str = "narrative"
    writing_task: str = ""
    tone: str = ""
    outline: str = ""
    author_intent: str = ""
    scene_goal: str = ""
    must_keep: list[str] = field(default_factory=list)
    must_avoid: list[str] = field(default_factory=list)
    revision: bool = False
    issues: list[dict] = field(default_factory=list)
    previous_summary: str = ""
    characters: list[dict] = field(default_factory=list)
    plot_hints: list[dict] = field(default_factory=list)
    story_outline: dict = field(default_factory=dict)
    active_plot_lines: list[dict] = field(default_factory=list)
    due_plot_nodes: list[dict] = field(default_factory=list)
    upcoming_plot_nodes: list[dict] = field(default_factory=list)
    timeline_entries: list[dict] = field(default_factory=list)
    priority_timeline_entries: list[dict] = field(default_factory=list)
    unresolved_foreshadowings: list[dict] = field(default_factory=list)
    due_foreshadowings: list[dict] = field(default_factory=list)
    retrieved_memory: list[dict] = field(default_factory=list)
    prewrite_recommendations: list[str] = field(default_factory=list)
    chapter_mission: dict = field(default_factory=dict)
    story_brief: str = ""
    current_arc_summary: str = ""
    author_preferences: dict = field(default_factory=dict)
    feedback: str = ""
```

**改动文件**：

| 文件                      | 改动                                             |
| ----------------------- | ---------------------------------------------- |
| 新建 `agents/context.py`  | `WritingContext` dataclass                     |
| `agents/writer.py`      | 重构 `_build_writing_prompt` 接受 `WritingContext` |
| `agents/coordinator.py` | 使用 `WritingContext` 构建 context                 |

***

## 三、CodeReview 发现的 Bug 修复

### 3.1 关键 Bug

| #   | Bug                                    | 文件                                                     | 修复方案                            |
| --- | -------------------------------------- | ------------------------------------------------------ | ------------------------------- |
| B1  | LangGraph feedback 未传递                 | `langgraph_workflow.py:445-471`                        | 废弃 LangGraph，不修此 Bug            |
| B2  | search\_replace 只匹配第一行                 | `editing_tools.py:228-233`                             | 重构编辑工具（见 2.4）                   |
| B3  | 预处理异常被吞没                               | `ws_chat.py:1227-1230`                                 | 发送警告消息（见 2.5）                   |
| B4  | `_validate_chapter_access` 返回协程未 await | `editing_tools.py:19-35`                               | 删除此死代码                          |
| B5 | `word_count` 用 `len()` 计字符非字数          | `ws_chat.py:520`, `chapters/router.py:158`             | 统一为 `char_count` 或实现中英文混合计数     |
| B6 | `datetime.now()` 应改为 UTC（50+处）        | `ws_chat.py` 50+处, `consistency_tools.py:176,239`, `coordinator.py` 多处, `session_manager.py` 多处 | 改为 `datetime.now(timezone.utc)`，移除手动 `updated_at = datetime.now()` |
| B7 | MCP 工具修改数据后未清 Redis 缓存                 | `novel_tools.py`, `memory_tools.py` 等全部 MCP 工具                    | 在 MCP 工具的写操作后添加缓存清除             |
| B8 | 手动 `updated_at = datetime.now()` 覆盖数据库自动更新 | `ws_chat.py:411,542` 等           | 移除手动赋值，依赖数据库 `onupdate=func.now()` |
| B9 | N+1 查询（双重）                             | `memory_tools.py:286-306`（双重N+1）, `location_tools.py:110-112`（全表扫描） | 使用 `selectinload` 或批量查询         |
| B10 | `cache_result` 装饰器键碰撞风险                | `redis_service.py:382-384`                             | 使用 hash 替代字符串拼接                 |

### 3.2 代码质量问题

| #  | 问题                                           | 文件                                     | 修复方案                          |
| -- | -------------------------------------------- | -------------------------------------- | ----------------------------- |
| Q1 | Pydantic Schema 使用旧式 `Optional[X]`/`List[X]` | 多个 schemas.py                          | 批量更新为现代语法                     |
| Q2 | 工具显示名定义 3 次（DRY 违反）                          | `ws_chat.py:182-271,320-362`           | 合并为单一 `TOOL_DISPLAY_CONFIG`   |
| Q3 | 5 个生成函数结构相同（DRY 违反）                          | `ws_chat.py:2122-2415`                 | 提取通用 `_generate_streaming_ws` |
| Q4 | LLM URL 构建逻辑重复 4 次                           | `llm_service.py` 多处                    | 提取 `_build_api_url` 方法        |
| Q5 | `novel_id` 注入不一致                             | `novel_tools.py` 多处                    | 统一注入机制                        |
| Q6 | 已废弃工具类仍存在                                    | `consistency_tools.py:261-323`         | 删除废弃代码                        |
| Q7 | 魔法数字未集中管理                                    | `ws_chat.py:1286`, `websocket.py:14` 等 | 提取为配置常量                       |

### 3.3 前端问题

| #  | 问题                                    | 文件                                       | 修复方案                                  |
| -- | ------------------------------------- | ---------------------------------------- | ------------------------------------- |
| F1 | apiClient 与 Zustand store 状态不同步       | `apiClient.ts:45-60`                     | 通过 `useAuthStore.getState()` 读写 token |
| F2 | 搜索逻辑 bug：setState 异步导致用旧值             | `NovelList.tsx:166-170`                  | 将搜索值直接作为参数传递                          |
| F3 | Alert 使用了不存在的 `title` prop            | `ConsistencyCheck.tsx:78`                | 改为 `message`                          |
| F4 | `use_langgraph` 布尔字段用 Select 非 Switch | `ChapterGenerate.tsx:319-324`            | 移除此选项（LangGraph 已废弃）                  |
| F5 | planning.ts 与 progress.ts 类型冲突        | `types/planning.ts`, `types/progress.ts` | 统一类型定义                                |
| F6 | logout 未断开 WebSocket                  | `authStore.ts:26-28`                     | 添加 WebSocket 断开调用                     |
| F7 | EditorPage/ChatPage 过大（1400+/1300+ 行） | 两个页面                                     | 拆分为子组件 + 自定义 Hook                     |
| F8 | 大量 `any` 类型                           | 多个文件                                     | 定义具体接口类型                              |

***

## 四、执行计划

### 阶段 1：核心架构修复（优先级最高）

| 任务                   | 涉及文件                                       | 依赖  |
| -------------------- | ------------------------------------------ | --- |
| 1.1 废弃 LangGraph     | `langgraph_workflow.py`, `ws_chat.py`      | 无   |
| 1.2 修复 db session 共享 | `ws_chat.py`, `mcp/base.py`                | 无   |
| 1.3 修复异常吞没           | `ws_chat.py`                               | 无   |
| 1.4 修复记忆更新非原子        | `ws_chat.py`, 新建重试模块                       | 1.2 |
| 1.5 删除死代码            | `editing_tools.py`, `consistency_tools.py` | 无   |

### 阶段 2：编辑机制改造

| 任务                                   | 涉及文件                                      | 依赖       |
| ------------------------------------ | ----------------------------------------- | -------- |
| 2.1 添加 rapidfuzz 依赖，实现相似度查找          | `core/diff_engine.py`, `requirements.txt` | 无        |
| 2.2 重构 search\_replace（支持跨行+多处+错误反馈） | `mcp/editing_tools.py`                    | 2.1      |
| 2.3 新增 line\_range\_replace          | `mcp/editing_tools.py`                    | 无        |
| 2.4 更新 EditMode 工具列表                 | `core/edit_mode.py`                       | 2.2, 2.3 |

### 阶段 3：审核机制改造

| 任务                              | 涉及文件                       | 依赖  |
| ------------------------------- | -------------------------- | --- |
| 3.1 添加审核 Prompt 模板              | `core/prompt_templates.py` | 无   |
| 3.2 重构 ReviewerAgent（规则+LLM 分层） | `agents/reviewer.py`       | 3.1 |
| 3.3 添加结构化输出方法                   | `core/llm_service.py`      | 无   |

### 阶段 4：上下文压缩增强

| 任务                                             | 涉及文件                                       | 依赖  |
| ---------------------------------------------- | ------------------------------------------ | --- |
| 4.1 增强 ContextCompressor（添加 LLM 摘要生成）          | `core/session_manager.py`                  | 3.3 |
| 4.2 ws\_chat 调用 compress\_with\_llm + Token 预算 | `ws_chat.py`                               | 4.1 |
| 4.3 重构 WriterAgent 参数传递                        | 新建 `agents/context.py`, `agents/writer.py` | 无   |

### 阶段 5：Bug 修复与代码质量

| 任务                    | 涉及文件   | 依赖  |
| --------------------- | ------ | --- |
| 5.1 修复 B4-B10 关键 Bug  | 多个文件   | 无   |
| 5.2 修复 Q1-Q7 代码质量问题   | 多个文件   | 无   |
| 5.3 修复 F1-F6 前端关键 Bug | 前端多个文件 | 无   |
| 5.4 前端组件拆分（F7-F8）     | 前端页面文件 | 5.3 |

***

## 五、风险与注意事项

1. **废弃 LangGraph 的影响**：前端 `ChapterGenerate.tsx` 中的 `use_langgraph` 选项需要移除。
2. **LLM 审核成本**：每次审核增加一次 LLM 调用。可通过配置开关控制是否启用 LLM 审核。
3. **精确匹配+错误反馈 vs 模糊匹配**：Aider 的经验表明模糊匹配会静默删除重要内容。我们采用精确匹配优先+错误反馈策略，匹配失败时返回最相似段落让 LLM 重试。
4. **对话压缩信息损失**：LLM 摘要可能遗漏关键细节。保留最近 3 轮完整对话可部分缓解。摘要采用"记忆形成"策略（选择性提取关键事实），而非简单压缩。
5. **db session 隔离性能**：每次工具调用创建新 session 有开销，但保证了事务隔离。
6. **rapidfuzz 依赖**：新增 `rapidfuzz` 包用于相似度计算，MIT 许可，C++ 实现性能优秀。

***

## 六、验收标准

1. LangGraph 代码标记为 deprecated，不再被调用
2. 编辑工具支持跨行搜索、多处替换、匹配失败时返回详细错误信息
3. ReviewerAgent 输出包含 LLM 语义审核结果
4. 对话历史超过 token 阈值时自动 LLM 摘要压缩
5. db session 不再跨工具调用共享
6. 记忆更新失败时有重试机制
7. 预处理异常时用户收到警告
8. 所有关键 Bug 修复完成

