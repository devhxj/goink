# 上下文注入架构设计

## 核心理念：小说级 CLAUDE.md

类比 Claude Code 的 CLAUDE.md：
- **CLAUDE.md** = 给 Claude Code 的项目上下文，启动时注入，对话期间不更新
- **system2（小说上下文快照）** = 给创作 AI 的小说上下文，对话开始时注入，对话期间不更新

AI 不调工具也能知道"故事现在是什么情况"。想深入了解某个角色或章节？调工具。工具返回的结果自然存在于对话历史中，不需要回写 system2。

## 三层注入架构

### Layer 1: system2 — 小说上下文快照（自由聊天 + LangGraph 共用）

**时机**：对话开始时注入一次
**稳定性**：对话期间不更新，仅在上下文压缩时重新生成
**内容**：

```
## 故事状态
（当前进展、角色动态、开着的悬念 — 来自 story_state 表）

## 读者认知
（已知信息、活跃悬念、误知 — 来自 reader_perspective 表）

## 角色索引
（角色名 + 一句话状态，不需要详细档案 — 来自 characters 表摘要查询）

## 世界设定概要
（关键地点、核心设定 — 来自 creative_profile + locations 表）
```

**作用**：AI 的"小说级 CLAUDE.md"，不调工具也能知道个大概。

### Layer 2: LangGraph Node 1 — 详细上下文（大纲编写）

**时机**：LangGraph 工作流启动后，大纲生成节点之前
**内容**：
- 更完整的 RAG 检索结果（与大纲主题相关的章节片段）
- 相关章节摘要（不是最近 2-3 章，而是与当前大纲相关的所有章节）
- 时间线 pending 项（待回收伏笔、待推进节点）
- 故事弧线状态

**作用**：在 Layer 1 基础上补充"写这个大纲需要知道的详细信息"。

### Layer 3: LangGraph Node 2 — 精准上下文（正文写作）

**时机**：大纲审批通过后，正文生成节点之前
**内容**：
- 围绕大纲每个节点的精确信息
- 相关角色的完整档案（不是索引，是 detail）
- 对应章节的原文（需要呼应的具体段落）
- 地点设定详情
- 伏笔原文（需要回收的伏笔，查看埋下时的具体措辞）

**作用**：在 Layer 2 基础上精确到"写这一章具体需要什么"。

## 消息结构

```
messages = [
    system: "基础指令 + 创作偏好 + 写作规则"    ← Layer 0，永远不变
    system: "小说上下文快照"                     ← Layer 1，对话开始注入，压缩时才更新
    ... 历史对话（已冻结）                       ← 前缀缓存，不碰
    user: "当前用户输入 + RAG + 条件提醒"        ← 本轮动态
]
```

## 缓存策略

### 为什么 system2 不更新？

两种方式的缓存行为**完全相同**：

| | AI 自己调工具获取 | system2 预注入 |
|---|---|---|
| 缓存命中 | 工具结果成为前缀，后续调用命中 | system2 作为前缀，后续调用命中 |
| 状态时效性 | 工具调用时的快照，后续改动不反映 | 对话开始时的快照，后续改动不反映 |
| 额外开销 | 2-3 次工具调用的 round-trip | 0 次工具调用 |

两种方式都会在 AI 修改后变 stale。但预注入：
1. **省掉工具调用的 token 和延迟**
2. **100% 保证 AI 看到上下文**（不依赖 AI 主动调工具）
3. **格式规范统一**（不依赖 AI 决定查什么、查多少）

### system2 何时更新？

仅在**上下文压缩**时重新生成。压缩意味着对话过长需要截断，此时：
- 历史消息被压缩/摘要
- system2 需要反映最新状态（因为原始对话历史可能被压缩掉了）

### 单轮工具循环的缓存行为

```
API call 1: [system1, system2, user]
→ AI 调 get_characters(mode="detail")

API call 2: [system1, system2, user, assistant, tool_result]
→ prefix 全部命中，只有 tool_result 是新的
→ AI 调 edit_chapter

API call 3: [system1, system2, user, assistant, tool_result, assistant, tool_result]
→ prefix 全部命中
```

system2 在整个工具循环中不变 → 作为前缀的一部分 → 每次 API 调用都命中。

## 与 LangGraph 的关系

Layer 1 是 ws_chat.py 和 LangGraph 共用的基础。LangGraph 在 Layer 1 之上叠加 Layer 2/3：

```
LangGraph Chapter Workflow:
  Node 1 (Context Prep):
    → 读取已有的 system2 作为基础
    → 补充 Layer 2 详细上下文
    → 生成大纲

  Node 2 (interrupt): 大纲审批

  Node 3 (Precise Context):
    → 基于审批通过的大纲
    → 补充 Layer 3 精准上下文

  Node 4 (Generate): 写正文

  Node 5 (Post-process): 并行更新
    ├── 更新 story_state → 下次对话的 system2 会反映
    ├── 更新 reader_perspective → 下次对话的 system2 会反映
    ├── 更新 timeline
    ├── 生成摘要
    ├── 向量记忆入库
    └── Review
```

## 实现要点

### ws_chat.py 改动

1. 对话开始时，异步获取 story_state + reader_perspective + character_summary + world_summary
2. 组装为第二个 system message（system2）
3. system2 存入 session，对话期间不重新获取
4. 仅在上下文压缩时重新生成 system2

### 工具层

不需要改动。AI 调工具获得的结果自然存在于对话历史中。system2 的存在不影响工具的正常使用。

### LangGraph 节点

Node 1 和 Node 3 直接使用 MCP 工具获取 Layer 2/3 上下文，组装到 prompt 中。
