# 上下文压缩 & 协议抽象改进方案

## 现状分析

### 1. 压缩系统（backend/chat/session_manager.py）

**ContextCompressor**（line 311-465）提供两种压缩：

| 方法 | 机制 | 问题 |
|------|------|------|
| `compress()` 同步 | 重要性评分 + 截断，回退摘要（截取前 120 字符拼列表） | 摘要质量差，丢失信息 |
| `compress_with_llm()` 异步 | LLM 提取关键事实生成摘要 | 多一次 LLM 调用但质量可靠 |

**当前触发**：在 `ws_chat.py:623` 发消息前同步检查并压缩，**阻塞消息处理**。

**触发条件**：token 使用率 >= 80% 或消息数 >= 500。

**Token 估算**：`中文 / 1.5 + 英文 / 4`，与实际值偏差可达 30%。

### 2. 缓存命中监控

| 场景 | 状态 |
|------|------|
| 非流式 `chat_completion()` | 已监控，`PromptCacheMonitor` 正常 |
| 流式 `chat_stream_with_tools()` | **缺失**，最后 chunk 的 `usage` 未提取 |

### 3. 前端

- `SessionStats`（token_count、context_window、usage_ratio、should_compress）前后端类型都定义好了
- `GET /sessions/{id}/stats` 端点已实现
- 但前端从未调用，无任何上下文占用展示，无压缩 UI

### 4. 多模型协议

当前通过 `model.startswith("glm")` / `"deepseek" in model` 做分支，没有抽象层。Anthropic Messages API 完全不兼容。

---

## 核心设计决策

### Token 计数：用 API 真实值，不本地估算

每次 LLM 调用都传了完整 messages 数组，API 返回的 `usage.prompt_tokens` 本身就**是当前上下文总 token 数**。直接用，不累积、不估算。

```
第 N 轮最后一帧: usage.prompt_tokens = 145000  →  当前上下文 145K / 1M = 14.5%
第 N+1 轮:        usage.prompt_tokens = 168000  →  自动增长到 16.8%
```

**LiteLLM 兼容性**：`prompt_tokens` 是 OpenAI 标准字段，DeepSeek 和 LiteLLM 归一化后完全一致。压缩决策只依赖这个字段，未来换 LiteLLM 零适配。

### 压缩时机：分级触发

| 上下文占用 | 行为 |
|-----------|------|
| < 80% | 不触发 |
| 80%–90% | **turn 结束后异步压缩**。压缩期间前端阻止发消息，显示压缩动画 |
| > 90% | **turn 内紧急压缩**。当前 LLM 调用完、下个工具调用/回复前执行 |

### 移除同步 compress()

只保留 LLM 压缩（`compress_with_llm()`），删除低级的纯文本截断 `compress()`。所有压缩（自动 + 手动）统一走同一处理。

### 统一压缩入口

无论是自动触发还是用户手动点击，都走 WebSocket 消息流内压缩（追加 system 消息 → LLM 生成摘要 → 替换旧消息）。手动和自动使用同一逻辑，前端统一展示"正在压缩..."。

### 最终引入 LiteLLM

当前只有 DeepSeek + GLM，差异小。未来加入 Anthropic 等非 OpenAI 协议模型时，用 LiteLLM 替代自研适配层。

---

## 改进计划

### Phase 1：流式 usage 提取

**目标**：每次 LLM 调用（一个 turn 内可能多次 tool call 循环）结束后拿到真实 token 用量。前端每次调用后更新指示器，而非等待整个 turn 结束。

**后端 `core/llm_service.py`**：
- `chat_stream_with_tools()` 流结束后从最后一帧提取 `usage`
- yield `{"type": "usage", "usage": {...}}` 作为最终事件
- 调用 `cache_monitor.record_call()`（补上流式场景的缺失）

**后端 `core/agent_loop.py`**：
- 处理 `usage` 事件，转发到 WebSocket
- 每次 LLM 调用完成后更新 session 的 `last_prompt_tokens`

**后端 `chat/session_manager.py`**：
- Session 增加 `last_prompt_tokens: int` 字段，存储最近一次 API 返回的 `prompt_tokens`（就是当前上下文总大小）

**前端 `wsEditorService.ts`**：
- 添加 `UsageMsg` 事件类型

---

### Phase 2：前端上下文占用指示器（输入框旁持久显示）

**UI 设计**：输入框旁边放置一个环形百分比指示器，每次 LLM 调用完成后更新。鼠标悬停展开详情面板和压缩按钮。

```
┌──────────────────────────────────────────────────┐
│  [User input box...]                    [发送]   │
│                                          ◉ 14.5% │  ← 环形指示器，始终可见
└──────────────────────────────────────────────────┘

悬停时弹出 Popover：
┌─────────────────────────────────────┐
│ 上下文占用: 14.5% / 1M               │
│ ████████░░░░░░░░░░░░░░░             │
│                                     │
│ 系统上下文   24,000 tokens    2.3%   │
│ 用户输入      8,000 tokens    0.8%   │
│ AI 输出      98,000 tokens    9.3%   │
│ 工具结果     20,000 tokens    1.9%   │
│                                     │
│ [手动压缩]                           │
└─────────────────────────────────────┘
```

**为什么放在输入框旁**：每次 LLM 调用都返回 `usage.prompt_tokens`，一个 turn 内可能更新多次（多次 tool call 循环），放在消息流中会频繁插入/替换节点。输入框旁的固定位置更稳定，用户随时可见。

**组件细节**：
- **环形指示器**：小型 SVG donut ring，中间显示百分比。绿色 < 80%，橙色 80-90%，红色 > 90%
- **Popover 详情**：鼠标悬停时弹出，含分类柱状条 + 各类别 token 数和占比 + 手动压缩按钮
- **更新时机**：每次收到 `usage` WebSocket 事件时更新（即每次 LLM 调用完成后）

**数据来源**：
- 每次 LLM 调用完成后的 `usage` WebSocket 事件推送（更新频率高于 turn 级别）
- 初始加载：`sessionApi.getStats(sessionId)` 返回最新状态
- `get_session_stats()` 增加分类统计：

```python
{
    "token_count": 150000,
    "context_window": 1048576,
    "usage_ratio": 14.3,
    "should_compress": false,
    "breakdown": {
        "system": 24000,
        "user": 8000,
        "assistant": 98000,
        "tool": 20000
    }
}
```

分类直接按消息 `role` 汇总：

| 英文 key | 中文名 | 对应 |
|----------|--------|------|
| `system` | 系统上下文 | `role=system`（System1/2、工具定义、chapter 注入等） |
| `user` | 用户输入 | `role=user`（用户指令和偏好，尽量保留） |
| `assistant` | AI 输出 | `role=assistant`（LLM 回复，压缩主要目标） |
| `tool` | 工具结果 | `role=tool`（工具调用的输入和输出） |

---

### Phase 3：统一压缩逻辑（消息流内压缩 + 断点续传）

**核心设计**：压缩不走独立 HTTP 端点，不走独立 LLM 调用。在现有消息流上追加 system 消息让 LLM 基于完整历史生成摘要，捕获后替换旧消息。全程在对话流内完成，前端自然展示"正在压缩..."。

**为什么不用 HTTP 端点**：
- 压缩本质是对话流的一部分，和发送消息体验一致
- LLM 已有完整上下文，无需手动截断/拼接
- 前端发送按钮变暂停、输入框禁用等状态 WebSocket 天然支持

**3.1 压缩流程**

```
1. 触发压缩（自动或用户点击）
2. 在消息流末尾追加 system 消息：压缩提示词
3. LLM 基于完整历史生成结构化摘要
4. 后端捕获摘要文本，从消息流中移除压缩 system + LLM 回复
5. 按保留规则替换旧消息，摘要作为 system 消息插入边界
6. 前端收到 compression_started → 发送按钮变暂停、"正在压缩..."出现在对话流
   前端收到 compression_done → 恢复正常，指示器更新
```

**3.2 断点续传（核心）**

压缩摘要必须包含精确断点信息，使 LLM 压缩后能无缝继续。压缩 system 提示词要求 LLM 输出：

```
## 已完成的任务
（不再重复执行的事项）

## 进行中（断点）
（当前正在做什么、做到了哪一步、下一步是什么）

## 用户偏好和要求
（用户的核心偏好、写作风格要求、反复强调的事项）

## 关键决策和设定变更
（已确认的情节决策、角色设定变更、世界观更新）

## 待办事项
（尚未开始但已计划的任务）
```

**Mid-turn 压缩（>90%，turn 内同步）**：
1. tool call 返回后，下一次 LLM 调用前插入压缩 system
2. LLM 生成摘要（不展示给用户，或仅展示"正在压缩..."）
3. 移除压缩交换，用摘要替换旧消息
4. 继续 agent loop → LLM 读摘要 + 最近消息，从断点继续
5. 用户无感：压缩前后 LLM 行为一致，不会"失忆"或重复已完成任务

**End-of-turn 压缩（80-90%，turn 后异步）**：
1. turn 结束后触发，同样走消息流追加
2. 前端显示"正在压缩..."，发送按钮变暂停，输入框禁用
3. 压缩完成后恢复正常

**3.3 手动压缩（WebSocket）**

用户点击输入框旁的压缩按钮 → 发送 `{type: "compress"}` WebSocket 消息 → 走相同流程。
手动和自动压缩统一处理。

**3.4 消息保留规则**

| 优先级 | 消息类型 | 处理方式 |
|--------|---------|---------|
| 必保留 | System1（agent base prompt） | 原样保留 |
| 必保留 | System2（novel context） | 原样保留 |
| 尽量保留 | User 消息 | 含用户偏好和要求，尽量不删 |
| 可摘要 | 旧的 assistant 回复 | 内容进摘要后移除 |
| 可摘要 | 旧的 tool 结果 | 关键结果进摘要后移除 |
| 可摘要 | System1/2 之外的 system 消息 | 进摘要后移除 |
| 保留 | 最近 N 条消息 | 原样保留，维持对话连续性 |

**3.5 前端压缩状态**

手动压缩（用户点击按钮）：
- 对话流显示 "正在压缩对话历史..."
- 发送按钮变为暂停图标，输入框禁用
- 环形指示器播放鎏金动画

自动压缩（mid-turn）：
- 用户无感知，仅环形指示器短暂显示鎏金动画

自动压缩（end-of-turn）：
- 同手动压缩的外观，但不阻塞（后台异步）

**3.6 鎏金动画**

```css
@keyframes gildedFlow {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

.compressing-indicator {
  background: linear-gradient(
    135deg,
    #a68a2e, #c9a84c, #f3e5ab, #d4af37, #b8942e, #c9a84c
  );
  background-size: 300% 300%;
  animation: gildedFlow 1.5s ease-in-out infinite;
}
```

---

### Phase 4：压缩算法实现细节

**4.1 压缩 system 提示词**

追加到消息流的 system 消息（完整版）：

```
[SYSTEM 压缩指令]
请基于以上完整对话历史生成压缩摘要。你的回复将替换较早的消息，所以摘要必须包含足够信息来实现"断点续传"——后续的你能直接从摘要中了解所有关键上下文，无缝继续工作。

## 摘要要求

### 已完成的任务
列出已确认完成的事项（这些不会再重复执行）。

### 进行中（断点）
精确描述当前正在做什么、做到了哪一步、接下来要做什么。这是最重要的部分——后续的你将从此处恢复工作。

### 用户偏好和要求
用户反复强调的写作风格、格式偏好、命名规范等。特别是用户最近的指令。

### 关键决策和设定变更
已确认的情节走向、角色设定、世界观规则等决策。标注各项决策的确定程度。

### 待办事项
已计划但尚未开始的任务清单。

## 输出格式
请严格按照上述五个部分输出，每个部分用 ## 标题分隔。不要添加额外说明。
```

**4.2 摘要捕获和消息替换**

```
压缩前:
  [System1: base prompt]        ← 保留
  [System2: novel context]       ← 保留
  [User: "我喜欢黑暗风格"]        ← 保留（用户偏好）
  [Assistant: "好的..."]
  [Tool: search_story_memory]
  [User: "写第三章"]
  [Assistant: "好的，我来写..."]
  [Tool: edit_chapter]
  ...（大量历史消息）
  [User: "继续写第四章"]          ← 保留（最近消息）
  [Assistant: "第四章开始..."]    ← 保留（最近消息）

↓ 插入压缩 system + LLM 回复

  ...（同上完整历史）
  [System: 压缩指令]
  [Assistant: "## 已完成\n- 第三章...\n## 进行中（断点）\n正在写第四章开头...\n..."]
                                                                ↑ 捕获这段回复

↓ 移除压缩交换 + 替换旧消息

  [System1: base prompt]
  [System2: novel context]
  [User: "我喜欢黑暗风格"]        ← 保留的 user 消息
  [System: ## 压缩摘要\n...]      ← 摘要替代旧的 assistant/tool 消息
  [User: "继续写第四章"]
  [Assistant: "第四章开始..."]
```

**4.3 防抖和并发控制**

- 同一次压缩进行中直接返回跟正常途径一样的结果 幂等
- 压缩前后各记录一次 stats，前端展示"压缩前 X tokens → 压缩后 Y tokens"
- 压缩失败不回退消息，保留原消息流，前端提示错误

---

### Phase 5：LiteLLM 接入（低优先级）

**为什么是 LiteLLM**：
- 100+ 模型统一 OpenAI 格式调用，自动翻译 Anthropic Messages API
- 处理流式、function calling、JSON mode 的跨提供商差异
- 比 LangChain 轻量，可仅用于协议层
- `usage.prompt_tokens` 是标准字段，与当前设计完全兼容

**接入方式**：替换 `llm_service.py` 中约 60% 的代码（请求构建、发送、流式解析），保留：
- `PromptCacheMonitor`（缓存监控）
- `chat_stream_with_tools()` 的事件流接口（前端协议不变）
- `reasoning_effort` 等 DeepSeek 特殊参数
- 错误转换 + 重试逻辑

**不造轮子**：放弃自研 Provider Adapter，用 LiteLLM 替代。

---

## 实施优先级

| 阶段 | 内容 | 优先级 | 预估 |
|------|------|--------|------|
| Phase 1 | 流式 usage 提取（每次 LLM 调用） | 高 | 小 |
| Phase 2 | 前端输入框旁环形指示器 + Popover 详情 | 高 | 中 |
| Phase 3 | 消息流内压缩 + 断点续传 + 鎏金动画 | 中 | 中 |
| Phase 4 | 压缩提示词 + 消息替换规则细化 | 中 | 中 |
| Phase 5 | LiteLLM 接入 | 低 | 大 |

## 涉及文件

| 文件 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| `backend/core/llm_service.py` | 改 | — | — | — | LiteLLM 替代 |
| `backend/core/agent_loop.py` | 改 | — | 改 | — | — |
| `backend/chat/session_manager.py` | 改 | — | — | 改 | — |
| `backend/chat/ws_chat.py` | — | — | 改 | — | — |
| `frontend/src/services/wsEditorService.ts` | 改 | — | 改 | — | — |
| `frontend/src/pages/editor/EditorPage.tsx` | — | 改 | 改 | — | — |
| `frontend/src/pages/editor/EditorPage.module.css` | — | 改 | 改 | — | — |
