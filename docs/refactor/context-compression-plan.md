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

无论是自动触发还是用户手动点击，都走同一个后端端点 + 同一套前端 UI 状态。

### 最终引入 LiteLLM

当前只有 DeepSeek + GLM，差异小。未来加入 Anthropic 等非 OpenAI 协议模型时，用 LiteLLM 替代自研适配层。

---

## 改进计划

### Phase 1：流式 usage 提取

**目标**：每个 turn 的 LLM 调用结束后拿到真实 token 用量。

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

### Phase 2：前端上下文占用指示器（每条消息下方）

**UI 设计**：每个 turn 完成后，在该 turn 消息流末尾插入一行上下文占用指示器。不放在输入框上方，而是作为消息流的一部分。

```
[User: "帮我写第三章"]
[AI: 好的，我来写...]
[Tool: edit_chapter]
[AI: 第三章已完成...]
┌──────────────────────────────────────────────────┐
│ ◉ 14.5%  ████░░░░░░  ·  [压缩]                 │
│ system 5K  对话 120K  工具 20K  注入 5K  摘要 0  │
└──────────────────────────────────────────────────┘
[User: "继续写第四章"]
[AI: ...]
┌──────────────────────────────────────────────────┐
│ ◉ 18.7%  ██████░░░░  ·  [压缩]                 │
│ system 5K  对话 160K  工具 25K  注入 5K  摘要 0  │
└──────────────────────────────────────────────────┘
```

每次刷新替换上一行的指示器（保持消息流干净），始终只有最新一条占用指示器。

**组件细节**：
- **环形指示器**：小型 SVG donut ring，中间显示百分比。绿色 < 80%，橙色 80-90%，红色 > 90%
- **分类条**：水平色块条，各颜色代表不同类别
- **类别 tooltip**：鼠标悬停时弹出各类别的 token 数和百分比
- **压缩按钮**：消息 >= 20 条时可用。触发手动压缩

**数据来源**：
- 每轮结束后的 `usage` WebSocket 事件推送
- 初始加载：`sessionApi.getStats(sessionId)` 返回最新状态
- `get_session_stats()` 增加分类统计：

```python
{
    "token_count": 150000,
    "context_window": 1048576,
    "usage_ratio": 14.3,
    "should_compress": false,
    "breakdown": {
        "system": 5000,
        "conversation": 120000,
        "tool": 20000,
        "context_injection": 5000,
        "summary": 0
    }
}
```

分类按消息 role 汇总 —— system 消息归系统，user/assistant 归对话，tool 归工具，novel_context/chapter_context 归注入，summary 字段归摘要。

---

### Phase 3：统一压缩逻辑 + 鎏金动画

**3.1 后端：统一压缩端点**

实现 `POST /sessions/{session_id}/compress`（前端 `sessionService.ts` 已定义，后端 `sessions/router.py` 缺实现）：

```python
@router.post("/{session_id}/compress")
async def compress_session(user, session_id):
    session = await load_session(session_id)
    old_count = len(session.messages)
    old_tokens = session.last_prompt_tokens
    session = await session_manager.compressor.compress_with_llm(session)
    return ApiResponse.success({
        "compressed": True,
        "messages_before": old_count,
        "messages_after": len(session.messages),
        "tokens_before": old_tokens,
        "tokens_after": session.last_prompt_tokens,
        "summary_updated": True
    })
```

**3.2 自动压缩触发**

```
last_prompt_tokens / context_window >= 90%:
    → 当前 LLM 调用完成 → turn 内立刻调用 compress_with_llm()
    → 前端显示"正在压缩..."
    → 压缩完后继续后续工具调用/回复

last_prompt_tokens / context_window 在 80-90%:
    → turn 结束后异步调用 compress_with_llm()
    → 前端显示"正在压缩..."
    → 输入框禁用，阻止发消息

last_prompt_tokens / context_window < 80%:
    → 不触发
```

**3.3 前端压缩状态**

- 压缩中：输入框禁用、发送按钮 disabled
- 消息流末尾的占用指示器变为鎏金动画 + 显示"正在压缩..."
- 手动压缩也走同一 `POST /compress` 端点
- 自动压缩：后端推送 `compression_started` / `compression_done` 事件

**3.4 前端阻止发消息**

压缩期间：
- `isCompressing` 状态为 true
- 输入框 placeholder 显示 "正在压缩对话历史..."
- 发送按钮置灰

**3.5 鎏金动画**

压缩进行时指示器的动画：

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

环形边框、百分比文字、分类条从左到右依次鎏金流动。压缩完成后回退到绿/橙/红对应颜色。

---

### Phase 4：压缩算法改进

**4.1 LLM 摘要 prompt 优化**

当前 `_generate_llm_summary()` 只传最后 10 条 older messages，截取前 200 字符。改进为结构化提取：

- 传入 older_messages 的完整内容（合理长度内）
- 要求 LLM 输出结构化摘要：
  ```
  ## 用户意图和偏好
  ## 已做决策
  ## 角色状态变化
  ## 伏笔/悬念
  ## 待办事项
  ```

**4.2 消息分层保留**

压缩时对 older messages 分层处理：
- 保留：system 消息、含角色设定/情节转折的关键消息
- 摘要：一般对话、查询结果
- 丢弃：纯确认（"好的"、"继续"）、已被后续操作覆盖的中间结果

**4.3 LLM 压缩的并发处理**

- 压缩耗时 > 3 秒时前端显示进度
- 压缩期间 session 锁定，防止并发修改

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
| Phase 1 | 流式 usage 提取 | 高 | 小 |
| Phase 2 | 前端消息流内占用指示器 | 高 | 中 |
| Phase 3 | 统一压缩 + 鎏金动画 + 阻止发送 | 中 | 中 |
| Phase 4 | 压缩算法改进 | 中 | 中 |
| Phase 5 | LiteLLM 接入 | 低 | 大 |

## 涉及文件

| 文件 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| `backend/core/llm_service.py` | 改 | — | — | — | LiteLLM 替代 |
| `backend/core/agent_loop.py` | 改 | — | 改 | — | — |
| `backend/chat/session_manager.py` | 改 | 改 | — | 改 | — |
| `backend/sessions/router.py` | — | 改 | 改 | — | — |
| `frontend/src/services/wsEditorService.ts` | 改 | — | 改 | — | — |
| `frontend/src/services/sessionService.ts` | — | — | 改 | — | — |
| `frontend/src/pages/editor/EditorPage.tsx` | — | 改 | 改 | — | — |
| `frontend/src/pages/editor/EditorPage.module.css` | — | 改 | 改 | — | — |
