# Chat 前端实现计划

## 一、Go 后端新增 API

Chat 功能需要前端可用的查询接口。以下 3 个方法需在 `app/` 层新增。

### 1.1 GetModels

返回所有 LLM provider 的可用模型列表，由后端决定模型能力和推理程度支持。复用已有的 `llm.AvailableModel` 类型。

```
GetModels() → []llm.AvailableModel

AvailableModel {
    Key             string    // "deepseek/deepseek-v4-pro"
    ProviderName    string    // "DeepSeek"
    ModelName       string    // "DeepSeek V4 Pro"
    ContextWindow   int       // 上下文窗口大小
    MaxOutputTokens int       // 最大输出 tokens
    ReasoningLevels []string  // 如 ["high", "max"]，空=不支持推理
    SupportsVision  bool      // 是否支持多模态
}
```

实现：`llm.Models(a.llmClient.Providers())`，一行调用。

### 1.2 GetSessions

分页查询当前小说的对话历史。

```
GetSessions(novelID int64, page int) → ([]SessionMeta, total int64)

SessionMeta {
    session_id  string
    title       string
    model       string
    updated_at  time.Time
}
```

默认 `page_size=20`，`updated_at DESC`。前端在「最近会话」栏只用 page=1 取 5 条；浮动面板取更多页。

### 1.3 GetSessionMessages

加载指定 session 的全部前端可见消息。

```
GetSessionMessages(sessionID string) → []Message
```

调用 `session.Store.GetMessagesForFrontend`（`to_frontend=true`），返回原始 Message 列表。前端自行重建 turn→segment 的嵌套结构。

### 1.4 审批相关（已就绪，无需新增）

`ApproveTool(toolID, approved, feedback)` 和 `SetApprovalMode(mode)` 已由 Wails 生成。

---

## 二、ChatPanel 可拖拽调整宽度

### 2.1 行为

- 拖拽手柄位于 ChatPanel **左边缘**，宽 4px，hover 时显示分隔线高亮
- mousedown 记录起始 X → mousemove 计算 delta → 更新宽度
- mouseup 释放，`document.body` 上绑定的监听器清理
- 拖拽过程中防止文字选中（`user-select: none` on body）

### 2.2 约束

| 参数 | 值 |
|------|-----|
| 最小值 | 280px |
| 最大值 | 600px |
| 默认值 | 360px |

宽度通过 `useState` 管理，不持久化（刷新后恢复默认）。

---

## 三、Session 历史

### 3.1 两个入口，同一个浮动面板

**入口 A — 最近会话栏**（无活跃 session 时显示）：

```
┌──────────────────┐
│  新对话           │  ← 按钮
├──────────────────┤
│  最近对话         │
│  ┌──────────────┐│
│  │ 第3章修改...  ││  ← session 条目，可点击
│  │ 大纲讨论     ││
│  │ 角色设定     ││
│  │ 情节构思     ││
│  └──────────────┘│
│  查看全部（12个）  │  ← 点击打开浮动面板
├──────────────────┤
│  （消息区域）     │
└──────────────────┘
```

- "新对话"按钮在顶部，始终可见
- 最近 4-5 条 session，按 updated_at 倒序
- 底部"查看全部（xx个）"链接

**入口 B — 历史按钮**（常驻）：

```
┌──────────────────┐
│ 📜 历史    ✨ 新对话│  ← 顶部常驻栏
├──────────────────┤
│  （消息区域）     │
└──────────────────┘
```

### 3.2 浮动面板

两个入口触发同一个浮动面板：

```
┌──────────────────┐
│ 📜 历史    ✨ 新对话│
├──────────────────┤
│ ┌──────────────┐ │
│ │🔍 搜索会话... │ │  ← 占位，不实现搜索功能
│ │──────────────│ │
│ │📝 第3章修改...│ │
│ │📝 大纲讨论    │ │  ← 可滚动
│ │📝 角色设定    │ │     高度 ~35% ChatPanel
│ │📝 情节构思    │ │     一次显示 7-8 条
│ │📝 人物关系    │ │     超出则内部滚动
│ │📝 世界观设计  │ │
│ │📝 伏笔梳理    │ │
│ │              │ │
│ └──────────────┘ │
│                  │
│  消息区域        │  ← 半透明遮罩，点击关闭面板
│                  │
├──────────────────┤
│  输入栏          │
└──────────────────┘
```

要点：
- 宽度 = ChatPanel 当前宽度（随拖拽变化）
- 高度 = ChatPanel 可视高度的 35%（`calc(var(--chat-height) * 0.35)`）
- 绝对定位，覆盖在消息区域上方
- 消息区域剩馀部分加半透明遮罩，点击遮罩关闭面板
- 面板内部 session 列表可滚动
- 点击某个 session → 关闭面板 → 加载该 session 的消息历史
- 面板右上角 × 关闭按钮
- session 列表通过 `GetSessions` 分页加载，滚动到底部加载下一页
- 面板只负责展示，选中后主区域渲染该会话的消息

### 3.3 新建对话

- "新对话"按钮创建空 session — 仅在前端设置 `activeSessionId = null`，清除消息区域显示
- 真正的 session 在用户发送第一条消息时由 `Chat()` 方法创建（后端 `loadOrCreateSession` 逻辑）
- 新对话状态下消息区域为空，底部输入框可用（"输入消息开始新对话"），模型选择器和推理程度可用

---

## 四、消息显示

### 4.1 数据结构（前端内部）

从扁平的 `Message[]` 重建嵌套结构：

```typescript
interface ConversationTurn {
  id: string
  userMessage?: string
  segments: TurnSegment[]
  status: 'streaming' | 'done' | 'failed'
}

type TurnSegment = TextSegment | ToolSegment | SubagentSegment

interface TextSegment {
  type: 'text'
  content: string           // 正文文本
  thinkingContent: string   // 思考内容
  thinkingDone: boolean     // 思考是否结束
  isStreaming: boolean      // 是否仍在流式传输
}

interface ToolSegment {
  type: 'tool'
  call: ToolCallInfo        // 工具调用信息
}

interface SubagentSegment {
  type: 'subagent'
  agentType: 'memory' | 'review'
  taskId: string
  segments: TurnSegment[]   // 子 agent 内部的 segments
  status: 'streaming' | 'done' | 'failed'
  finalText: string
}
```

### 4.2 历史消息重建逻辑

`GetSessionMessages` 返回按 `created_at ASC` 排序的扁平消息列表。重建步骤：

1. 遍历所有消息，按 `role` 分组：
   - `role=user` → 新建一个 Turn，设置 `userMessage`
   - `role=assistant, agentType=main` → 当前 Turn 追加 TextSegment（从 ExtraMetadata 提取 thinking_content、tool_calls）
   - `role=assistant, agentType!=main, parent_turn_id!=null` → 找到父 Turn，在 SubagentSegment 内追加 TextSegment
   - `role=tool` → 从 ExtraMetadata 提取 tool_call_id，匹配所属 Turn 的 ToolSegment
2. tool_calls JSON 数组每个元素生成一个 ToolSegment
3. 子 agent 的 tool 消息路由到 SubagentSegment 内部

### 4.3 消息气泡样式

**用户消息**：
- 右对齐，浅蓝色/主色调背景气泡
- 圆角：右下角直
- 字体大小 14px

**AI 文本**：
- 左对齐，无背景（或用极浅灰区分）
- Markdown 渲染（`react-markdown` + `remark-gfm`）
- 字体大小 14px，行高 1.7

**思考过程**（DeepSeek reasoning_content）：
- `<details>` 折叠元素，默认折叠
- 流式传输中：自动展开，标题显示 "思考中…" + 闪烁动画
- 思考完成：标题显示 "思考过程"，折叠
- 内容：灰色文字，`<pre>` 标签，等宽字体

**工具调用**：
- 紧凑行内卡片：图标 + display_text + 状态标签
- 状态指示：
  - executing：旋转图标 + "xxx中"
  - completed：绿色勾 + "完成"
  - failed：红色叉 + "失败"
- 失败的 tool call 末尾显示 sanitized error（截断到 120 字符）
- 图标根据 activity_kind 映射（view→眼睛, create→+, write→笔, edit→笔, memory→脑, review→勾, plan→文档）

### 4.4 子 Agent 嵌套渲染

**展开时**（子 agent 执行中）：
```
┌─ 📝 记忆分析师 ─ [执行中] ────────┐
│  （子 agent 的 thinking/cotent）    │
│  ┌ 查看 · 浏览角色列表 ─ [完成] ┐  │
│  └─────────────────────────────┘  │
│  ...                              │
└──────────────────────────────────┘
```

**折叠时**（子 agent 完成 1s 后自动折叠）：
```
┌─ 📝 记忆分析师 ─ [✓ 完成] ────────┐
└──────────────────────────────────┘
```

要点：
- 子 agent 卡片有 accent 颜色标识类型（memory=紫色调, review=绿色调）
- 内部 tool call 用更紧凑的样式（字号 12px）
- 卡片可手动展开/折叠
- 完成后延迟 1s 自动折叠

### 4.5 审批交互

当 tool call 的 phase 为 pending 且需要审批时，工具卡片显示审批按钮：

```
┌─ ⚠ 修改章节内容 ─ [等待确认] ─────┐
│  确认对第3章的修改？               │
│  [拒绝]                    [批准]  │
└──────────────────────────────────┘
```

点击批准/拒绝调用 `ApproveTool(toolID, approved, feedback)`。

### 4.6 自动滚动

- 新消息到达时自动滚底
- 用户手动上滚时不强制滚底（`isUserScrolledUp` 检测）
- AI 回复结束或用户发送新消息时重置标记

### 4.7 Markdown 渲染

引入 `react-markdown` + `remark-gfm`：
- 渲染 AI 回复中的标题、列表、代码块、粗体、斜体等
- 用户消息也通过 Markdown 渲染（处理换行）
- 不使用 `rehype-*` 插件（减小体积）

---

## 五、底部控制栏

位于输入区域下方，一行横向排列：

```
┌──────────────────────────────┐
│  [模型选择 ▼] [推理 ▼] [手动] ◉  │
└──────────────────────────────┘
```

### 5.1 模型选择

- 下拉选择器，数据来自 `GetModels()` API
- 显示模型名称（如 "DeepSeek V4 Pro"）
- 切换模型时更新 ChatInput 的 `model_id` 字段
- 首次进入使用默认模型（如 deepseek-v4-pro）

### 5.2 推理程度

- 仅当选中模型 `supports_reasoning = true` 时显示
- 下拉选项：高(high) / 最大(max)
- 使用 shadcn Select 组件（与模型选择一致）

### 5.3 审批模式

- 切换按钮：手动 / 自动
- 手动模式：工具调用需要用户确认（调用 `ApproveTool`）
- 自动模式：工具自动执行
- 调用 `SetApprovalMode(mode)`
- 视觉：类似 toggle switch

### 5.4 Usage Ring（ContextRing）

照搬 Python 版实现，用 Tailwind + SVG：

- SVG 圆环（44×44px）
  - 背景圆：`stroke="rgb(0 0 0 / 0.12)"`，线宽 3
  - 前景弧：颜色根据使用率变化
    - 0-80%：绿色 `#52c41a`
    - 80-90%：黄色 `#f39c12`
    - 90-100%：红色 `#e74c3c`
  - 旋转 -90°，stroke-linecap: round
  - dasharray = 周长，dashoffset = 周长 × (1 - ratio)
- 中心文本：百分比数字（font-size 11px, font-weight 600）
- Hover Popover（用 shadcn Popover 或纯 CSS hover 实现）：
  - 标题："上下文占用: xx.x%"
  - 进度条（同上配色）
  - "已用: XK · 总大小: XXXK"
  - 细分：system / user / assistant / tool 各角色的 token 数及占比
- 无 usage 数据时显示空状态（空圆环或隐藏）
- 数据来源：`EventUsage` 事件中的 `usage` 字段

---

## 六、流式事件处理

ChatPanel 从 WorkspaceView 接收 `novelId` prop。发送消息时调用 `Chat()`，然后监听 Wails Events。

### 6.1 发送消息流程

```
用户输入 → ChatInput → 组装消息列表 → app.Chat(chatInput)
  → 获取 ChatResult { session_id, turn_id }
  → 监听 EventsOn("agent:" + turn_id, handler)
  → handler 追加 segments 到当前 Turn
  → 收到 chat_completed → 标记 turn 完成 → EventsOff
```

当前 Go 的 `Chat()` 是同步方法，返回最终结果。流式事件通过 `EventsEmit` 在方法执行期间推送。前端需要：

1. 调用 `Chat()`（async/Promise）
2. 同步注册 `EventsOn("agent:" + turnId, ...)` 监听流式事件
3. Chat 结果返回时移除监听器

### 6.2 事件类型处理

AgentEvent 结构（Go 端 `internal/agent/events.go`）：

```typescript
interface AgentEvent {
  turn_id: number
  type: number          // AgentEventType
  data: string          // thinking/content 文本 chunk
  tool_name: string
  tool_id: string
  phase: string         // selected | executing | completed | failed
  tool_args: object
  success: boolean
  error: string
  display_text: string
  activity_kind: string
  metadata: object
  usage: object
  timestamp: string
}
```

处理逻辑：

| Event Type | 处理 |
|---|---|
| **Thinking**（0） | 当前 TextSegment 的 thinkingContent 追加 data；若 thinking 未开始则创建新 TextSegment |
| **ThinkingDone**（1） | 标记当前 TextSegment.thinkingDone=true |
| **Content**（2） | 当前 TextSegment 的 content 追加 data；若之前有 thinking 未结束则先结束 |
| **ToolCall**（3） | 按 tool_id 匹配 ToolSegment，更新 phase/status/display_text；若无匹配则新建 |
| **Usage**（4） | 更新 `lastUsage` 状态 → ContextRing 重渲染 |
| **Error**（5） | 标记当前 Turn 状态为 failed |

### 6.3 子 Agent 事件路由

- 子 agent 事件带有 `parent_task_id` 字段
- 路由到对应 Turn 的 SubagentSegment 内部更新
- 子 agent tool call 嵌套在 SubagentSegment.segments 中

---

## 七、不需要选中章节即可聊天

ChatPanel 从 WorkspaceView 接收 `novelId`：

```tsx
<ChatPanel novelId={activeNovelId} />
```

状态判断：
- `novelId === 0`（无活跃小说）：显示"选择作品开始对话"，输入框禁用
- `novelId > 0`：输入框可用，可以正常聊天

不再需要选中章节。

---

## 八、文件结构

```
frontend/src/
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx          # 主容器（拖拽、事件监听、状态管理）
│   │   ├── types.ts               # TS 类型定义（AgentEvent, Turn, TurnSegment 等）
│   │   ├── MessageBubble.tsx       # 单条消息气泡（react-markdown 渲染）
│   │   ├── ThinkingBlock.tsx       # 思考过程折叠块
│   │   ├── ToolCallCard.tsx        # 工具调用行内卡片
│   │   ├── SubagentCard.tsx        # 子 Agent 嵌套卡片
│   │   ├── SessionHistory.tsx      # 浮动历史面板
│   │   ├── RecentSessions.tsx      # 最近会话栏（入口 A）
│   │   ├── ChatInput.tsx           # 输入框 + 发送按钮
│   │   ├── ChatControls.tsx        # 底部控制栏（模型/推理/审批/UsageRing）
│   │   └── ContextRing.tsx         # SVG Token 用量圆环
│   │
│   ├── editor/
│   │   └── EditorArea.tsx
│   │
│   ├── novel/
│   │   ├── BookCover.tsx
│   │   └── SidePanel.tsx
│   │
│   └── shell/
│       ├── ActivityBar.tsx
│       ├── GitHubLink.tsx
│       └── StatusBar.tsx
│
├── hooks/
│   └── useApp.ts
│
├── views/
│   ├── InitView.tsx
│   └── WorkspaceView.tsx
│
└── lib/
    └── wailsjs/                    # Wails 自动生成（须 commit）
```

---

## 九、实施顺序

| 步骤 | 内容 | 说明 |
|------|------|------|
| **1** | Go 新增 3 个 API + 重新生成 Wails 绑定 | ✅ 已完成 |
| **2** | ChatPanel 可拖拽宽度 + 接收 novelId prop | ✅ 已完成 |
| **3** | Chat API 连通 + 流式事件 + turn/segment 渲染（含 react-markdown） | 当前进行中 |
| **4** | 底部控制栏（模型选择、推理程度、审批模式、ContextRing） | |
| **5** | Session 历史（最近会话栏 + 浮动面板 + 历史消息加载） | |
| **6** | 子 Agent 嵌套渲染 + 审批交互 | |
| **7** | 细节打磨（自动滚底已做，事件清理已做） | |

---

## 十、不做（本版）

- 消息编辑/重新生成 — Message 表 append-only
- 多 agent 切换 — 用户只和 main agent 聊天
- 搜索 session — 搜索框只占位
- 深色主题适配 — 保持浅色
- 消息操作（复制/删除） — 后续迭代
