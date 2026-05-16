# AI 小说创作系统 — 全面改进计划 v2

> 基于后端代码深度分析，整合伏笔追踪、情节规划、创作偏好优化、编辑体验改进等全部需求。
>
> **v2 更新：** 明确删除旧 Foreshadowing 表用 TimelineEntry 替代；增加用户通过对话驱动AI修改规划的交互流程。

***

## 一、现状诊断总结

### 1.1 已有基础设施

| 模块                                     | 完成度        | 关键文件                                                                                                                                                                                   | 说明                                                                                                                                 |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **伏笔模型 Foreshadowing**                 | ⚠️ 有API但分散 | [`foreshadowing/models.py`](backend/app/foreshadowing/models.py), [`consistency/router.py`](backend/app/consistency/router.py), [`agents/reviewer.py`](backend/app/agents/reviewer.py) | 模型+Schema完整；CRUD API 嵌在 consistency/router 中；Agent管理在 reviewer.py 中；上下文注入在 generation/service.py 中。**问题：功能分散在3个模块，无独立服务层，与规划系统割裂** |
| **情节规划 PlotLine/PlotNode/PlotOutline** | ✅ 完整       | [`planning/models.py`](backend/app/planning/models.py), [`planning/service.py`](backend/app/planning/service.py), [`planning/router.py`](backend/app/planning/router.py)               | 情节线+节点+大纲三层结构，有前置依赖(prerequisites)和后果(consequences)，**保留不动**                                                                       |
| **创作偏好 NovelCreativeProfile**          | ✅ 可用       | [`novels/models.py:39-58`](backend/app/novels/models.py#L39-L58)                                                                                                                       | per-novel 的 must\_keep/must\_avoid/long\_term\_goals，**无 per-user 层**                                                              |
| **副本编辑 EditSession**                   | ✅ 完整       | [`editor/service.py`](backend/app/editor/service.py), [`mcp/editing_tools.py`](backend/app/mcp/editing_tools.py)                                                                       | start→apply→accept/reject 流程，支持 partial\_edit 但**AI 使用门槛高**                                                                        |
| **上下文构建 ContextBuilder**               | ✅ 可用       | [`core/context_builder.py`](backend/app/core/context_builder.py)                                                                                                                       | RAG + 前文摘要 + 角色 + 情节事件 + 创作偏好，已携带 unresolved\_foreshadowings                                                                       |
| **章节生成流水线**                            | ✅ 可用       | [`generation/service.py`](backend/app/generation/service.py), [`mcp/novel_tools.py`](backend/app/mcp/novel_tools.py)                                                                   | 支持 LangGraph 工作流和直接 Agent 模式，**生成后无结构化后处理**                                                                                        |

### 1.2 核心问题清单

| #  | 问题                          | 严重度  | 现状                                                              |
| -- | --------------------------- | ---- | --------------------------------------------------------------- |
| P1 | 伏笔功能分散在3个模块，与规划割裂           | 🔴 高 | CRUD在consistency/router，管理在reviewer，注入在generation/service，无统一入口 |
| P2 | 缺乏统一的"故事时间线"视图              | 🔴 高 | 伏笔、章节安排、用户指令各管各的，无法按时间轴统一查看和管理                                  |
| P3 | 章节生成后无"结尾标记+未来规划+伏笔提取"流程    | 🔴 高 | 直接保存，无后处理                                                       |
| P4 | 章节内容截断（一句话没说完就断了）           | 🟡 中 | 无完整性校验                                                          |
| P5 | overwrite\_existing 需要二次调用  | 🟡 中 | AI 第一次不知道章节已存在                                                  |
| P6 | partial\_edit AI 不倾向使用      | 🟡 中 | 需要行号，步骤多，描述不够引导                                                 |
| P7 | 创作偏好只有 per-novel 无 per-user | 🟡 中 | 无法区分"这本书的风格"vs"我个人的写作习惯"                                        |
| P8 | 创作偏好可能盲目膨胀                  | 🟢 低 | merge\_with\_existing=true 默认追加，无去重上限                           |

***

## 二、核心新功能：故事时间线系统 (Story Timeline)

### 2.1 设计理念

将**伏笔(Foreshadowing)**、**情节规划(Plot Planning)**、**用户意图(User Intent)** 三者统一为一条按时间排序的**故事时间线**。每本小说维护一个独立的时间线，类似一个"超长待办事项板"。

```
┌─────────────────────────────────────────────────────────────┐
│                  故事时间线 (Story Timeline)                   │
│                                                               │
│  ○── 已完成 ──●── 当前(第N章) ──○── 近期规划 ──○── 远期愿景   │
│                                                               │
│  时间线条目类型：                                               │
│  ├─ 📌 伏笔/钩子 (Foreshadowing)     → 待回收/已回收/已放弃    │
│  ├─ 📋 情节节点 (Plot Node)          → 计划中/进行中/已完成     │
│  ├─ 🎯 章节安排 (Chapter Plan)       → 下一章/近期/远期        │
│  └─ 💬 用户指令 (User Directive)     → 作者主动注入的规划       │
│                                                               │
│  数据来源：                                                    │
│  ├─ AI 章节生成后自动提取                                      │
│  ├─ 用户在追踪页面手动编辑                                      │
│  └─ 用户对话中主动告知的规划                                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据模型设计

新建统一的 `TimelineEntry` 模型作为时间线的核心条目：

```python
class TimelineEntryCategory(str, Enum):
    FORESHADOWING = "foreshadowing"    # 伏笔/钩子
    PLOT_NODE = "plot_node"            # 情节节点
    CHAPTER_PLAN = "chapter_plan"      # 章节安排
    USER_DIRECTIVE = "user_directive"  # 用户指令

class TimelineEntryStatus(str, Enum):
    PENDING = "pending"          # 待处理
    ACTIVE = "active"            # 当前活跃/进行中
    COMPLETED = "completed"      # 已完成
    RESOLVED = "resolved"        # 已解决（伏笔回收）
    ABANDONED = "abandoned"      # 已放弃
    DEFERRED = "deferred"        # 推迟

class TimelineEntry(Base):
    """故事时间线条目 - 统一管理伏笔/规划/用户指令"""
    __tablename__ = "timeline_entries"

    id: int = Column(Integer, primary_key=True)
    novel_id: int = Column(Integer, ForeignKey("novels.id", ondelete="CASCADE"), nullable=False, index=True)

    # 分类与状态
    category: str = Column(String(50), nullable=False, index=True)  # TimelineEntryCategory
    status: str = Column(String(50), default=TimelineEntryStatus.PENDING.value, index=True)

    # 内容
    title: str = Column(String(255), nullable=False)
    description: Optional[str] = Column(Text)
    detail_json: Optional[Dict[str, Any]] = Column(JSON)  # 结构化详情（因category而异）

    # 时间定位
    target_chapter: Optional[int] = Column(Integer, index=True)  # 目标章节号（NULL=未确定或全局）
    time_horizon: Optional[str] = Column(String(20))  # next / near_term / long_term / undefined

    # 重要性与来源
    importance: int = Column(Integer, default=3)  # 1-5
    source: str = Column(String(50), default="ai")  # ai_generated / user_created / user_edited
    source_chapter_id: Optional[int] = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"))

    # 关联与追踪
    resolved_chapter_id: Optional[int] = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"))
    related_entry_ids: Optional[List[int]] = Column(JSON)  # 关联的其他条目ID
    tags: Optional[List[str]] = Column(JSON)

    # 版本控制（支持用户修改AI输出）
    version: int = Column(Integer, default=1)
    last_editor: Optional[str] = Column(String(50))  # "ai" / "user"
    original_ai_output: Optional[Dict[str, Any]] = Column(JSON)  # AI原始输出（用户修改前）

    # 元数据
    extra_metadata: Optional[Dict[str, Any]] = Column(JSON)

    created_at: datetime = Column(TIMESTAMP, server_default=func.now())
    updated_at: datetime = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    resolved_at: Optional[datetime] = Column(TIMESTAMP)
```

### 2.3 detail\_json 因 category 而异的结构

```python
# category == "foreshadowing" 时：
{
    "foreshadowing_type": "plot|character|item|mystery",
    "hint_text": "埋下的具体暗示内容",
    "expected_resolution": "预期的回收方式"
}

# category == "chapter_plan" 时：
{
    "plan_type": "next_chapter|near_term|long_term",
    "key_events": ["事件1", "事件2"],
    "focus_characters": ["角色A", "角色B"],
    "scene_goal": "本章目标",
    "tone_hint": "语气提示"
}

# category == "user_directive" 时：
{
    "original_message": "用户的原始话述",
    "intent_type": "style_rule|plot_direction|character_arc|constraint",
    "applies_from_chapter": N,
}
```

### 2.4 与现有系统的关系（v2 架构决策）

**核心决策：删除 Foreshadowing 旧表，用 TimelineEntry 完全替代。保留 PlotLine/PlotNode 不动。**

```
                    ┌──────────────────────┐
                    │   TimelineEntry      │  ← 新建：统一时间线（替代 Foreshadowing）
                    │  (故事时间线条目)      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
    │  ❌ Foreshadowing│ │ PlotNode    │ │ NovelCreative    │
    │  (删除，迁移到   │ │ (保留不动)   │ │ Profile (增强)   │
    │   TimelineEntry) │ │             │ │                 │
    └─────────────────┘ └──────┬──────┘ └────────┬─────────┘
                             │                   │
                             ▼                   ▼
              TimelineEntry 可选关联     注入到上下文
              plot_node_id 外键          作为 author_preferences
```

**为什么删 Foreshadowing 但保留 PlotLine/PlotNode？**

| 维度    | Foreshadowing                                   | PlotLine/PlotNode           |
| ----- | ----------------------------------------------- | --------------------------- |
| 定位    | "埋了什么坑" — 轻量级标记                                 | "故事怎么发展" — 结构化规划            |
| 复杂度   | 单表扁平结构                                          | 三层嵌套（线→节点→依赖）               |
| 功能重叠度 | **100%被TimelineEntry覆盖**                        | **不重叠** — 是细粒度情节编排          |
| 现有使用  | 分散在3个模块，维护成本高                                   | 独立完整模块，运行良好                 |
| 决策    | **删除**，迁移到 TimelineEntry.category=foreshadowing | **保留**，可选与 TimelineEntry 关联 |

**Foreshadowing 迁移清单（需要改的代码）：**

| 当前位置                                                                                                                                               | 迁移方式                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`consistency/router.py:50-92`](backend/app/consistency/router.py#L50-L92) 的 `list_foreshadows` / `create_foreshadowing` / `resolve_foreshadowing` | **删除**这些路由，功能由 `timeline/router.py` 接管                                     |
| [`agents/reviewer.py:193-239`](backend/app/agents/reviewer.py#L193-L239) 的 `_manage_foreshadowing()` 及 `_list/create/resolve` 方法                   | **重写**为调用 `TimelineService`                                                |
| [`generation/service.py:266-285`](backend/app/generation/service.py#L266-L285) 的 `unresolved_foreshadowings` 查询                                    | **改为**查询 `TimelineEntry.where(category='foreshadowing', status='pending')` |
| [`core/database.py:52`](backend/app/core/database.py#L52) 的 `from app.foreshadowing.models import Foreshadowing`                                   | **删除**此行                                                                   |
| [`main.py`](backend/app/main.py) 的 `from app.foreshadowing.models import Foreshadowing`                                                            | **删除**此行                                                                   |
| `foreshadowing/` 整个目录                                                                                                                              | **删除**（或保留文件但不再引用）                                                         |

### 2.5 用户驱动AI修改规划的交互流程

用户可以通过两种方式修改时间线条目：

#### 方式A：手动编辑（前端追踪页面）

```
用户在追踪页面点击条目 → 编辑内容 → 保存 → last_editor=user, version+1
→ AI下次获取上下文时看到用户修改后的版本
```

#### 方式B：通过对话让AI修改（推荐体验）

```
用户："我觉得第5章的那个伏笔不太对，改成主角在码头捡到一把旧钥匙吧"
  → AI理解意图 → 调用 update_timeline_entry(entry_id=xx, ...)
  → 版本递增，记录 original_ai_output
  → AI回复："已帮你更新了「神秘钥匙」这条伏笔：
     原：在书架发现一封密信 → 改：在码头捡到一把旧钥匙
     你可以在追踪页面查看和进一步调整"
```

**关键设计：**

- `update_timeline_entry` MCP 工具同时支持 AI 调用和用户前端调用
- 每次更新都保留 `original_ai_output`，可追溯"AI原始想法 vs 最终决定"
- AI 主动建议修改时需征询用户确认（通过对话自然完成）
- 前端编辑和AI修改共享同一数据源，无冲突

***

## 三、MCP 工具设计：时间线系统

### 3.1 新增 MCP 工具列表

| 工具名                      | 功能           | 说明                                           |
| ------------------------ | ------------ | -------------------------------------------- |
| `get_story_timeline`     | 获取故事时间线      | 按 target\_chapter/time\_horizon 排序返回，支持分页和筛选 |
| `add_timeline_entry`     | 添加时间线条目      | AI生成后自动调用，或用户手动添加                            |
| `update_timeline_entry`  | 更新时间线条目      | 用户修改AI输出后调用，记录版本变化                           |
| `resolve_timeline_entry` | 解决/完成条目      | 伏笔回收、章节完成时调用                                 |
| `get_timeline_context`   | 获取上下文用的精简时间线 | 给AI生成章节时注入的精选子集                              |

### 3.2 get\_timeline\_context — 智能上下文注入

这是核心工具，用于在每次章节生成时给AI提供**适量的**时间线信息：

```python
# 参数设计
{
    "current_chapter": int,           # 当前章节号
    "max_entries": int = 15,           # 最大返回条数
    "include_categories": list,        # 包含的分类
    "time_horizon_filter": list        # 过滤的时间范围
}

# 返回逻辑（智能筛选）：
# 1. 所有 status=active 或 pending 且 target_chapter <= current_chapter + 3 的条目
# 2. 所有 unresolved 的 foreshadowing（按重要性降序，取前8条）
# 3. 最近更新的 3 条 user_directive
# 4. next_chapter 类型的 chapter_plan（如果有）
# 总量控制在 max_entries 以内
```

**AI如果觉得不够，可以再调** **`get_story_timeline`** **查更多。**

### 3.3 add\_timeline\_entry — AI 自动提取

章节生成完成后，由后端 `ChapterPostProcessor` 调用此工具（内部调用，非AI直接调用），将AI输出的结构化信息入库。

***

## 四、章节生成后处理流水线 (ChapterPostProcessor)

### 4.1 流程图

```
章节正文生成完成 (full_content)
         │
         ▼
  ┌─ 步骤1：结尾完整性检测 ─┐
  │  检查最后一句是否完整     │
  │  不完整 → LLM补全末尾    │
  └──────────┬──────────────┘
             │
  ┌─ 步骤2：结构化信息解析 ─┐
  │  从正文中提取/让LLM输出：  │
  │  ├─ 【第X章完结】标记     │
  │  ├─ 未来规划列表          │
  │  └─ 伏笔/钩子列表        │
  └──────────┬──────────────┘
             │
  ┌─ 步骤3：时间线自动入库 ─┐
  │  调用 add_timeline_entry │
  │  批量写入 TimelineEntry  │
  │  source = "ai_generated" │
  └──────────┬──────────────┘
             │
  ┌─ 步骤4：章节摘要更新 ──┐
  │  _generate_chapter_summary│
  │  _update_chapter_memory   │
  └──────────┬──────────────┘
             │
             ▼
       返回生成结果（附带 timeline_summary）
```

### 4.2 结尾完整性检测规则

```python
def is_ending_complete(text: str) -> bool:
    """
    检测文本结尾是否完整：
    1. 最后一个字符是中文句号/感叹号/问号/省略号
    2. 最后一个引号是否闭合
    3. 最后一段长度 > 10 个字符（排除意外截断）
    4. 不以逗号、顿号、分号等未完结标点结束
    """
```

### 4.3 提示词改造：要求AI输出结构化尾部

在 [prompt\_templates.py](backend/app/core/prompt_templates.py) 的 CHAPTER 系统提示词中追加：

```
【章节输出格式要求】
请在正文结束后，严格按以下格式输出结构化收尾信息：

---【第{chapter_number}章完结】---

【本章埋下的伏笔/钩子】（如有）
- 标题：xxx | 类型：plot/character/item | 预期回收方式：xxx

【下章安排】
- 核心事件：xxx
- 涉及角色：xxx
- 场景目标：xxx

【近期规划】（未来3-5章）
- 第N章：xxx
- 第N+1章：xxx

【远期方向】（如有）
- xxx
```

***

## 五、其他改进点详细方案

### 5.1 overwrite\_existing 前置警告（P5）

**改动位置：**

- [`mcp/novel_tools.py`](backend/app/mcp/novel_tools.py) — `GenerateChapterDraftTool.description`
- [`core/edit_mode.py`](backend/app/core/edit_mode.py) — AGENT 模式 system\_prompt

**具体改动：**

GenerateChapterDraftTool 的 description 改为：

```
"直接创建并生成一个新章节正文。... ⚠️ 重要：如果目标章节号已有内容，
必须传 overwrite_existing=true 否则会报错。建议在调用前先确认章节状态。"
```

EditMode.AGENT 的 system\_prompt 追加：

```
"调用 generate_chapter_draft 时：如果目标章节已有内容需要覆盖重写，
务必设置 overwrite_existing=true，否则会失败需要二次调用。"
```

### 5.2 部分编辑体验优化（P6）

**5.2.1 新增 search\_replace 模式**

在 ApplyEditTool 中新增 change\_type 选项：

```python
# 在 parameters_schema 的 change_type enum 中增加：
"search_replace"  # 文本搜索替换模式（无需行号）

# 新增可选参数：
"search_text": {
    "type": "string",
    "description": "要搜索的原文片段（search_replace模式必填）"
}
```

执行逻辑：

1. 在 working\_content 中搜索 search\_text
2. 找到后用 new\_content 替换
3. 如果找到多处，替换第一处；如果找不到，报错提示

**5.2.2 工具描述强化引导**

ApplyEditTool.description 改写为：

```
"应用编辑到副本内容。... 选择变更类型的建议：
- full_replace：你有完整的修改后全文，且改动幅度超过30%
- partial_edit：你知道精确的行号范围，只改其中几段
- search_replace：你知道要改的是哪段原文（推荐，最方便）
- insert/delete：在指定位置插入或删除
..."
```

**5.2.3 system\_prompt 引导**

EditMode.AGENT 的 prompt 中追加编辑策略：

```
"编辑章节时的最佳实践：
1. 如果你有完整的修改后内容且改动较大（>30%），使用 apply_edit 的 full_replace 模式
2. 如果只改几段话，优先使用 search_replace 模式（提供原文片段+替换内容）
3. 不要重复调用 start_edit_session，已有会话可直接 apply_edit
4. 编辑前先 read_chapter_for_edit 了解当前内容"
```

### 5.3 创作偏好双层架构（P7）

**当前问题：** 只有 `NovelCreativeProfile`（per-novel），无法区分：

- 这本书的独特风格（如"这本是赛博朋克黑色风格"）
- 作者的全局写作习惯（如"我喜欢短句"、"我讨厌华丽辞藻"）

**方案：新增** **`UserCreativeProfile`（per-user）**

```python
class UserCreativeProfile(Base):
    """作者全局创作偏好"""
    __tablename__ = "user_creative_profiles"

    id: int = Column(Integer, primary_key=True)
    user_id: int = Column(Integer, unique=True, nullable=False, index=True)

    global_writing_style: Optional[str] = Column(Text)      # 全局写作风格习惯
    preferred_sentence_length: Optional[str] = Column(String(50))  # short/medium/long
    default_pov: Optional[str] = Column(String(50))          # 第一人称/第三人称...
    global_must_keep: Optional[List[str]] = Column(JSON)     # 全局必须保留项
    global_must_avoid: Optional[List[str]] = Column(JSON)    # 全局必须避免项
    extra_metadata: Optional[Dict[str, Any]] = Column(JSON)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
```

**上下文注入顺序：**

```
system_prompt
  ├── UserCreativeProfile（作者全局偏好）← 最底层
  ├── NovelCreativeProfile（这本书的偏好）← 中层，可覆盖全局
  └── TimelineEntry context（当前相关时间线）← 最上层，最具体
```

### 5.4 创作偏好防膨胀机制（P8）

**改动 UpdateCreativeProfileTool：**

1. must\_keep / must\_avoid 列表上限设为 **每类 15 条**
2. 超出时自动合并语义相近的条目（可用 LLM 辅助去重）
3. 每次 update 后重新生成 llm\_brief（精简版摘要 ≤ 500 字）
4. tool description 中明确告知 AI："保持简洁，定期整理合并，不要无限追加"

***

## 六、前端追踪页面需求（供前端参考）

### 6.1 页面定位

独立的「故事追踪」页签/路由，不在文章末尾。

### 6.2 页面功能

| 功能          | 说明                                   |
| ----------- | ------------------------------------ |
| **时间线视图**   | 按章节号/时间排序的横向或纵向时间线，显示所有条目            |
| **分类筛选**    | 按伏笔/章节规划/情节节点/用户指令筛选                 |
| **状态筛选**    | 按待处理/活跃/已完成/已解决筛选                    |
| **条目编辑**    | 用户可点击任意条目修改内容，修改后 `last_editor=user` |
| **版本对比**    | 显示 AI 原始输出 vs 用户修改后的差异               |
| **批量操作**    | 批量标记完成/推迟/放弃                         |
| **AI 对话集成** | 选中条目后可"发送给AI讨论"，作为对话上下文              |

### 6.3 API 端点（新增）

```
GET    /api/v1/timeline/{novel_id}                    # 获取时间线
POST   /api/v1/timeline/{novel_id}/entries            # 添加条目
PUT    /api/v1/timeline/{novel_id}/entries/{entry_id} # 更新条目
PATCH  /api/v1/timeline/{novel_id}/entries/{entry_id}/status  # 更新状态
DELETE /api/v1/timeline/{novel_id}/entries/{entry_id} # 删除条目
GET    /api/v1/timeline/{novel_id}/context             # 获取AI上下文用精简版
POST   /api/v1/timeline/{novel_id}/auto-extract       # 从章节内容自动提取（手动触发）
```

***

## 七、实施步骤（按优先级排序）

### Phase 1：基础修复（P0 — 影响核心体验） ✅ **已完成**

#### Step 1.1：overwrite\_existing 前置警告 ✅

- [x] 修改 `GenerateChapterDraftTool.description`，加粗警告
- [x] 修改 `EditMode.AGENT` system\_prompt，加入 overwrite 规则
- **涉及文件：** [`mcp/novel_tools.py`](backend/app/mcp/novel_tools.py), [`core/edit_mode.py`](backend/app/core/edit_mode.py)
- **预估工作量：** 小

#### Step 1.2：结尾截断检测+补全 ✅

- [x] 新建 `core/chapter_post_processor.py`，实现 `is_ending_complete()` 和 `complete_ending()`
- [x] 在 `_execute_streaming_chapter_draft` 中接入后处理
- **涉及文件：** 新建 `core/chapter_post_processor.py`，修改 [`core/ws_chat.py`](backend/app/core/ws_chat.py)
- **预估工作量：** 中

#### Step 1.3：提示词结构化改造 ✅

- [x] 修改 CHAPTER 类型系统提示词，加入结构化尾部输出要求
- **涉及文件：** [`core/prompt_templates.py`](backend/app/core/prompt_templates.py)
- **预估工作量：** 小

### Phase 2：故事时间线核心系统（P0 — 核心新功能） ✅ **已完成**

#### Step 2.1：数据模型 ✅

- [x] 新建 `timeline/models.py` — `TimelineEntry` 模型
- [x] 新建 `timeline/schemas.py` — Pydantic 验证模型
- [x] 新建 `timeline/__init__.py`
- [x] 在 `Novel.models` 中添加 relationship
- [x] 在 `database.py init_db()` 中注册（使用 create_all）
- **涉及文件：** 新建 `timeline/` 模块目录, 修改 [`novels/models.py`](backend/app/novels/models.py), [`core/database.py`](backend/app/core/database.py)

#### Step 2.2：Service 层 ✅

- [x] 新建 `timeline/service.py` — `TimelineService`
  - [x] `get_timeline()` — 分页查询，支持多维度筛选排序
  - [x] `add_entry()` — 添加条目，自动设置 version=1, source
  - [x] `update_entry()` — 更新条目，版本递增，保留 original\_ai\_output
  - [x] `resolve_entry()` — 标记解决/完成
  - [x] `get_context_for_generation()` — 智能筛选返回给AI的上下文子集
  - [x] `auto_extract_from_chapter()` — 从章节内容+AI输出中自动提取时间线条目
  - [x] `_build_context_summary()` — 构建上下文摘要文本
  - [x] `_parse_foreshadowing_text()` — 解析伏笔文本
  - [x] `get_unresolved_count()` — 统计各分类未完成数量
- **涉及文件：** 新建 `timeline/service.py`

#### Step 2.3：HTTP API（Router） ✅

- [x] 新建 `timeline/router.py` — RESTful API (8个端点)
- [x] 在 [`main.py`](backend/app/main.py) 中注册路由
- **涉及文件：** 新建 `timeline/router.py`, 修改 [`main.py`](backend/app/main.py)

#### Step 2.4：MCP 工具 ✅

- [x] 新建 `mcp/timeline_tools.py` — 5个MCP工具
  - [x] `get_story_timeline` — AI查询完整时间线
  - [x] `add_timeline_entry` — AI添加条目
  - [x] `update_timeline_entry` — 更新（含用户修改场景）
  - [x] `resolve_timeline_entry` — 解决条目
  - [x] `get_timeline_context` — 获取精简上下文（AI生成时调用）
- [x] 在 `mcp/server.py` 中注册（5个tool wrapper）
- [x] 在 `mcp/registry.py` 中注册到 registry
- [x] 在 `EditModeConfig.MODE_ALLOWED_TOOLS` 中添加新工具
- **涉及文件：** 新建 `mcp/timeline_tools.py`, 修改 [`mcp/server.py`](backend/app/mcp/server.py), [`mcp/registry.py`](backend/app/mcp/registry.py), [`core/edit_mode.py`](backend/app/core/edit_mode.py)

#### Step 2.5：章节生成后处理接入 ✅

- [x] 完善 `ChapterPostProcessor.process()`：
  - [x] 解析AI输出的结构化尾部信息
  - [x] 调用 `TimelineService.auto_extract_from_chapter()`
  - [x] 批量写入 TimelineEntry，返回 created entries 列表
- [x] 修改 `_execute_streaming_chapter_draft` 接入后处理
- [ ] 修改 `ChapterGenerationService.generate_chapter()` 接入
- **涉及文件：** 修改 [`core/chapter_post_processor.py`](backend/app/core/chapter_post_processor.py), [`core/ws_chat.py`](backend/app/core/ws_chat.py), [`generation/service.py`](backend/app/generation/service.py)
- **预估工作量：** 大

#### Step 2.6：上下文注入集成 ✅

- [x] 修改 `ContextBuilder.build_writing_context()` — 注入时间线上下文（新增 `_get_timeline_context()` 方法）
- [x] 时间线上下文作为【故事时间线】section 自动拼入写作上下文
- **涉及文件：** [`core/context_builder.py`](backend/app/core/context_builder.py)

### Phase 3：编辑体验优化（P1） ✅ **已完成**

#### Step 3.1：部分编辑增强 ✅

- [x] `ApplyEditTool` 增加 `search_replace` 模式和 `search_text` 参数
- [x] 重写 `ApplyEditTool` 和 `StartEditSessionTool` 的 description
- [x] `EditMode.AGENT` prompt 追加编辑最佳实践
- **涉及文件：** [`mcp/editing_tools.py`](backend/app/mcp/editing_tools.py), [`core/edit_mode.py`](backend/app/core/edit_mode.py)

### Phase 4：创作偏好增强（P1） ✅ **已完成**

#### Step 4.1：双层偏好架构 ✅

- [x] 新建 `UserCreativeProfile` 模型（在 novels/models.py 中）
- [x] 修改 `get_creative_profile` MCP工具支持双层查询（user_global + novel_specific + merged）
- [x] 修改 `update_creative_profile` MCP工具支持双层写入（global_writing_style → UserCreativeProfile）
- [x] 注册到 database.py 和 main.py
- **涉及文件：** [`novels/models.py`](backend/app/novels/models.py), [`mcp/novel_tools.py`](backend/app/mcp/novel_tools.py), [`core/database.py`](backend/app/core/database.py), [`main.py`](backend/app/main.py)

#### Step 4.2：防膨胀机制 ✅

- [x] `UpdateCreativeProfileTool` 增加 `_enforce_limit()` 方法，must_keep/must_avoid 上限15条
- [x] description 中引导 AI 正确更新（保持简洁、不要无限追加）
- [x] execute 中强制调用 `_enforce_limit()` 做最终截断
- **涉及文件：** [`mcp/novel_tools.py`](backend/app/mcp/novel_tools.py)

### Phase 5：Foreshadowing 迁移与清理（P1） ✅ **已完成**

#### Step 5.1：Foreshadowing 功能迁移到 TimelineEntry ✅

- [x] `consistency/router.py` — 删除6个伏笔CRUD路由，改为重定向提示（保留 check 一致性检查）
- [x] `agents/reviewer.py` — `_list_foreshadowing` / `_create_foreshadowing` / `_resolve_foreshadowing` 重写为使用 TimelineEntry
- [x] `generation/service.py` — `_prepare_context()` 中 unresolved\_foreshadowings 查询改为 TimelineEntry 查询
- [x] `consistency/service.py` — `check_foreshadowing_status()` 改为使用 TimelineEntry
- **涉及文件：** [`consistency/router.py`](backend/app/consistency/router.py), [`agents/reviewer.py`](backend/app/agents/reviewer.py), [`generation/service.py`](backend/app/generation/service.py), [`consistency/service.py`](backend/app/consistency/service.py)

#### Step 5.2：清理 Foreshadowing 引用 ✅

- [x] `core/database.py` — 移除 `from app.foreshadowing.models import Foreshadowing`
- [x] `main.py` — 移除 `from app.foreshadowing.models import Foreshadowing`
- [x] 删除 `foreshadowing/` 目录（models.py, schemas.py, \_\_init\_\_.py）
- **涉及文件：** [`core/database.py`](backend/app/core/database.py), [`main.py`](backend/app/main.py)

### Phase 6：端到端测试（P2）

#### Step 6.1：完整链路测试

- [ ] 章节生成 → 后处理(结尾检测+结构化解析) → 时间线自动入库 → 上下文注入 → 下一章生成
- [ ] 用户对话 → AI调用 update\_timeline\_entry → 版本更新 → 前端展示变更
- [ ] 前端手动编辑时间线条目 → AI下次获取上下文时看到修改后的版本
- [ ] MCP工具调用的手动/AI测试（get\_story\_timeline / add / update / resolve / get\_timeline\_context）

***

## 八、文件变更总览

| 操作     | 文件路径                                 | 说明                                              |
| ------ | ------------------------------------ | ----------------------------------------------- |
| **新建** | `app/timeline/__init__.py`           | 时间线模块                                           |
| **新建** | `app/timeline/models.py`             | TimelineEntry 模型（替代 Foreshadowing）              |
| **新建** | `app/timeline/schemas.py`            | Pydantic 验证模型                                   |
| **新建** | `app/timeline/service.py`            | TimelineService（核心业务逻辑）                         |
| **新建** | `app/timeline/router.py`             | RESTful API（替代 consistency/router 中的伏笔API）      |
| **新建** | `app/core/chapter_post_processor.py` | 章节后处理流水线                                        |
| **新建** | `app/mcp/timeline_tools.py`          | 时间线MCP工具集（5个工具）                                 |
| **修改** | `app/core/prompt_templates.py`       | 结构化尾部输出要求                                       |
| **修改** | `app/core/edit_mode.py`              | AGENT prompt 增强 + 新工具权限                         |
| **修改** | `app/core/context_builder.py`        | 注入时间线上下文（替代 foreshadowings 查询）                  |
| **修改** | `app/core/ws_chat.py`                | 接入后处理 + 上下文增强                                   |
| **修改** | `app/mcp/novel_tools.py`             | overwrite警告 + 偏好防膨胀                             |
| **修改** | `app/mcp/editing_tools.py`           | search\_replace模式 + 描述重写                        |
| **修改** | `app/mcp/server.py`                  | 注册新 timeline 工具                                 |
| **修改** | `app/generation/service.py`          | 接入后处理；foreshadowing查询改为TimelineEntry            |
| **修改** | `app/main.py`                        | 注册 timeline router；移除 Foreshadowing import      |
| **修改** | `app/core/database.py`               | 移除 Foreshadowing import，添加 TimelineEntry import |
| **修改** | `app/agents/reviewer.py`             | \_manage\_foreshadowing 重写为调用 TimelineService   |
| **修改** | `app/consistency/router.py`          | 删除伏笔相关路由（已迁移到 timeline/router）                  |
| **修改** | `app/consistency/service.py`         | 一致性检查中的伏笔查询改为 TimelineEntry                     |
| **修改** | `app/novels/models.py`               | 可能新增 UserCreativeProfile                        |
| **删除** | `app/foreshadowing/`                 | 整个目录（已被 TimelineEntry 替代）                       |

***

## 九、关键设计决策记录

| 决策点               | 选择                             | 理由                                                                      |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Foreshadowing 表   | **删除，用 TimelineEntry 替代**      | 功能分散在3个模块维护成本高；TimelineEntry 的 foreshadowing category 完全覆盖；追求最优解不保留历史包袱 |
| PlotLine/PlotNode | **保留不动**                       | 细粒度情节规划（节点+依赖关系），与伏笔定位不同，已有完整服务层运行良好                                    |
| 时间线 vs 分离系统       | 统一时间线                          | 降低复杂度，单一数据源，便于前端展示和AI查询                                                 |
| AI输出结构化方式         | 尾部标记而非单独调用                     | 减少一次LLM调用，自然融入生成过程                                                      |
| 上下文注入策略           | 固定精选+按需查询                      | 平衡token成本和信息完整性：默认给15条精选，AI可按需 `get_story_timeline` 查更多                 |
| 用户修改追踪            | version + original\_ai\_output | 支持回溯和对比，了解AI与人的分歧，便于学习用户偏好                                              |
| 部分编辑改善            | 自研 search\_replace 而非第三方MCP    | 与现有edit\_session体系深度集成，无需额外依赖                                           |
| 规划修改交互            | 对话驱动 + 手动编辑双通道                 | 用户可直接告诉AI"改一下那个规划"，AI调用update工具完成；也可在前端手动改                              |

***

## 十、v2 变更摘要（相对 v1）

| 变更项                 | v1 方案        | v2 方案              | 原因                                             |
| ------------------- | ------------ | ------------------ | ---------------------------------------------- |
| Foreshadowing 表     | 保留，双向同步      | **删除**，直接替代        | 追求最优解，减少维护成本                                   |
| PlotLine/PlotNode   | 保留兼容         | **保留不变**（明确）       | 与时间线定位不同，无重叠                                   |
| 用户修改规划              | 仅手动编辑        | **对话驱动 + 手动编辑双通道** | 用户要求可通过对话让AI改                                  |
| Foreshadowing 完成度诊断 | "仅模型+Schema" | 修正为"有API但分散"       | 深入代码后发现 consistency/router 和 reviewer.py 中已有实现 |

