# 前端对齐文档 — 后端 Phase 1-5 改造

> 本文档描述后端改造完成后，前端需要对齐的所有变更。
> 后端计划文档：[story-timeline-system-plan.md](../.trae/documents/story-timeline-system-plan.md)

---

## 一、新增功能：故事时间线系统 (Story Timeline)

### 1.1 核心概念

后端新增了统一的 **故事时间线** 系统，将伏笔、章节规划、用户指令整合为一条按时间排序的时间线。

**每本小说维护独立的时间线**，类似"超长待办事项板"。前端需要新增一个独立的 **「故事追踪」** 页面/路由。

### 1.2 时间线条目类型 (TimelineEntry.category)

| 分类值 | 中文名 | 说明 | 前端展示建议 |
|--------|--------|------|-------------|
| `foreshadowing` | 伏笔/钩子 | 本章埋下的待回收线索 | 📌 图标，高亮显示 |
| `chapter_plan` | 章节安排 | 下章/近期/远期的写作规划 | 📋 图标 |
| `plot_node` | 情节节点 | 关键事件里程碑 | 🔗 图标 |
| `user_directive` | 用户指令 | 作者主动注入的创作规则 | 💬 图标 |

### 1.3 条目状态 (TimelineEntry.status)

| 状态值 | 中文名 | 操作按钮 |
|--------|--------|----------|
| `pending` | 待处理 | → 激活 / 解决 / 放弃 |
| `active` | 当前活跃 | → 完成 / 推迟 / 解决 |
| `completed` | 已完成 | （只读） |
| `resolved` | 已解决（伏笔回收） | （只读） |
| `abandoned` | 已放弃 | → 重新激活 |
| `deferred` | 已推迟 | → 激活 |

### 1.4 时间范围 (TimelineEntry.time_horizon)

| 范围值 | 含义 | 颜色标识建议 |
|--------|------|-------------|
| `next` | 下一章 | 绿色/紧急 |
| `near_term` | 近期(3-5章) | 黄色/关注 |
| `long_term` | 远期方向 | 灰色/背景 |
| `undefined` | 未确定 | 默认色 |

---

## 二、API 端点变更

### 2.1 新增端点 — 时间线系统 (`/api/v1/timeline/`)

所有端点都需要携带认证头 `Authorization: Bearer <token>`。

#### 获取时间线列表
```
GET /api/v1/timeline/novels/{novel_id}
Query Params:
  - page: 页码 (默认1)
  - page_size: 每页数量 (默认20, 最大100)
  - category: 筛选分类 (foreshadowing/plot_node/chapter_plan/user_directive)
  - status: 筛选状态 (pending/active/completed/resolved/abandoned/deferred)
  - time_horizon: 筛选时间范围 (next/near_term/long_term/undefined)
  - search: 搜索关键词（匹配标题和描述）
  - sort_by: 排序字段 (默认created_at)
  - sort_order: 排序方向 (desc/asc)

Response:
{
  "success": true,
  "data": {
    "items": [TimelineEntryResponse, ...],
    "total": 42,
    "page": 1,
    "page_size": 20
  }
}
```

#### 添加条目
```
POST /api/v1/timeline/novels/{novel_id}/entries
Body:
{
  "category": "foreshadowing",        // 必填
  "title": "神秘钥匙",                  // 必填
  "description": "主角在码头捡到一把旧钥匙...",
  "detail_json": { ... },              // 结构化详情（因category而异）
  "target_chapter": 8,                 // 目标章节号（可选）
  "time_horizon": "near_term",         // 时间范围（可选）
  "importance": 4,                     // 重要度 1-5
  "source_chapter_id": 7,             // 来源章节ID（可选）
  "tags": ["主线", "悬疑"]            // 标签列表（可选）
}

Response:
{
  "success": true,
  "data": TimelineEntryResponse
}
```

#### 更新条目
```
PUT /api/v1/timeline/novels/{novel_id}/entries/{entry_id}
Body:
{
  "title": "修改后的标题",
  "description": "新的描述",
  "status": "active",
  "importance": 5,
  "target_chapter": 10,
  ...
}
// 注意：每次更新 version+1，last_editor="user"
// 如果之前是AI创建的，original_ai_output 会保存原始内容
```

#### 更新状态（解决/完成）
```
PATCH /api/v1/timeline/novels/{novel_id}/entries/{entry_id}/status
Body:
{
  "resolved_chapter_id": 12,    // 解决时的关联章节（可选）
  "resolution_notes": "在第12章中回收"
}
```

#### 删除条目
```
DELETE /api/v1/timeline/novels/{novel_id}/entries/{entry_id}
```

#### 获取AI上下文用精简时间线
```
GET /api/v1/timeline/novels/{novel_id}/context?current_chapter=7&max_entries=15
// 这个是给AI生成时用的，前端一般不需要直接调用
// 但如果要做"预览AI看到什么"的功能可以用这个
```

#### 手动触发从章节提取时间线条目
```
POST /api/v1/timeline/novels/{novel_id}/auto-extract?chapter_id={id}
// 手动触发从已有章节内容中提取伏笔/规划
```

#### 获取统计信息
```
GET /api/v1/timeline/novels/{novel_id}/stats
Response:
{
  "success": true,
  "data": {
    "foreshadowing": 8,    // 未解决伏笔数
    "chapter_plan": 3,     // 未完成规划数
    "user_directive": 2     // 活跃指令数
  }
}
```

### 2.2 废弃/迁移端点

以下旧端点已废弃，返回 `deprecated: true` + 重定向提示：

| 旧端点 | 新端点 | 说明 |
|--------|--------|------|
| `GET /api/v1/consistency/novels/{id}/foreshadowings` | `GET /api/v1/timeline/novels/{id}?category=foreshadowing` | 伏笔列表 |
| `GET /api/v1/consistency/novels/{id}/foreshadowings/statistics` | `GET /api/v1/timeline/novels/{id}/stats` | 伏笔统计 |
| `POST /api/v1/consistency/novels/{id}/foreshadowings` | `POST /api/v1/timeline/novels/{id}/entries` (category=foreshadowing) | 创建伏笔 |
| `PUT /api/v1/consistency/novels/{id}/foreshadowings/{fid}` | `PUT /api/v1/timeline/novels/{id}/entries/{eid}` | 更新伏笔 |
| `POST .../foreshadowings/{fid}/resolve` | `PATCH .../entries/{eid}/status` | 解决伏笔 |
| `POST .../foreshadowings/{fid}/abandon` | `PATCH .../entries/{eid}/status` (status=abandoned) | 放弃伏笔 |
| `GET .../foreshadowings/unresolved` | `GET .../timeline/...?category=foreshadowing&status=pending` | 未解决伏笔 |

**建议：** 前端应尽快将所有对上述旧端点的调用替换为新端点。旧端点暂时保留兼容（返回重定向提示），后续版本可能移除。

---

## 三、数据模型变更

### 3.1 TimelineEntry 完整字段

```typescript
interface TimelineEntry {
  id: number;
  novel_id: number;
  category: 'foreshadowing' | 'plot_node' | 'chapter_plan' | 'user_directive';
  status: 'pending' | 'active' | 'completed' | 'resolved' | 'abandoned' | 'deferred';
  title: string;                    // 必填，最长255字符
  description: string | null;
  detail_json: object | null;       // 结构化详情（因category而异）
  target_chapter: number | null;   // 目标章节号
  time_horizon: string | null;     // next/near_term/long_term/undefined
  importance: number;              // 1-5
  source: string;                   // ai_generated/user_created/user_edited
  source_chapter_id: number | null;
  resolved_chapter_id: number | null;
  related_entry_ids: number[] | null;
  tags: string[] | null;
  version: number;                 // 版本号（每次编辑+1）
  last_editor: string | null;      // "ai" 或 "user"
  original_ai_output: object | null; // AI原始输出（用户修改前）
  extra_metadata: object | null;
  created_at: string;              // ISO 8601
  updated_at: string;
  resolved_at: string | null;
}
```

### 3.2 detail_json 因 category 而异的结构

```typescript
// category === 'foreshadowing'
interface ForeshadowingDetail {
  foreshadowing_type: 'plot' | 'character' | 'item' | 'mystery';
  hint_text: string;           // 埋下的具体暗示内容
  expected_resolution: string;  // 预期的回收方式
  resolution_notes?: string;   // 解决说明（status=resolved时有）
}

// category === 'chapter_plan'
interface ChapterPlanDetail {
  plan_type: 'next_chapter' | 'near_term' | 'long_term';
  raw_plan: string;            // AI输出的原始规划文本
  key_events?: string[];
  focus_characters?: string[];
  scene_goal?: string;
  tone_hint?: string;
}

// category === 'user_directive'
interface UserDirectiveDetail {
  original_message: string;   // 用户的原始话述
  intent_type: 'style_rule' | 'plot_direction' | 'character_arc' | 'constraint';
  applies_from_chapter?: number;
}
```

### 3.3 UserCreativeProfile（新增）

```typescript
interface UserCreativeProfile {
  id: number;
  user_id: number;
  global_writing_style: string | null;     // 全局写作风格习惯
  preferred_sentence_length: string | null; // short/medium/long
  default_pov: string | null;               // 第一人称/第三人称...
  global_must_keep: string[] | null;        // 全局必须保留项
  global_must_avoid: string[] | null;       // 全局必须避免项
  extra_metadata: object | null;
  created_at: string;
  updated_at: string;
}
```

### 3.4 NovelCreativeProfile 变更

现有模型不变，但 get_creative_profile 的返回结构变为：

```typescript
interface CreativeProfileResponse {
  user_global: {                          // 新增！作者全局偏好
    global_writing_style: string | null;
    preferred_sentence_length: string | null;
    default_pov: string | null;
    global_must_keep: string[];
    global_must_avoid: string[];
    exists: boolean;
  };
  novel_specific: {                      // 本书专属偏好（原有字段）
    author_intent: string | null;
    preferred_tone: string | null;
    collaboration_style: string;
    scene_planning_notes: string | null;
    must_keep: string[];
    must_avoid: string[];
    long_term_goals: string[];
    exists: boolean;
  };
  merged: {                             // 合并后的去重结果
    must_keep: string[];                // 全局+本书合并去重
    must_avoid: string[];
  };
  profile_summary: string;               // 注入给AI的精简摘要文本
}
```

---

## 四、MCP 工具变更（影响AI行为）

### 4.1 新增工具（5个）

| 工具名 | 功能 | AI何时使用 |
|--------|------|-----------|
| `get_story_timeline` | 查询完整时间线 | 需要全面了解规划/伏笔时 |
| `add_timeline_entry` | 添加时间线条目 | 章节生成后自动提取、用户要求记录想法时 |
| `update_timeline_entry` | 更新条目 | AI修正规划、应用户要求修改时 |
| `resolve_timeline_entry` | 解决条目 | 伏笔回收、规划完成时 |
| `get_timeline_context` | 获取精简上下文 | **每次生成章节前应调用** |

### 4.2 修改的工具

| 工具名 | 变更 | 影响 |
|--------|------|------|
| `generate_chapter_draft` | description 增加 overwrite_existing 警告 | AI不再二次调用失败 |
| `apply_edit` | 新增 search_replace 模式 | AI更倾向使用部分编辑 |
| `start_edit_session` | description 增加"复用提示" | AI不重复创建会话 |
| `get_creative_profile` | 返回双层结构(user_global + novel_specific) | AI能看到全局+本书偏好 |
| `update_creative_profile` | 支持 global_writing_style 写入全局；must_keep/must_avoid 上限15条 | 偏好不会无限膨胀 |
| `get_foreshadowing_status` | 内部改为查 TimelineEntry | 无外部变化 |

---

## 五、章节生成流程变更

### 5.1 新流程（Phase 1 改造后）

```
用户请求生成第N章
    ↓
AI 输出正文 + 结构化尾部标记：
---【第N章完结】---
【本章埋下的伏笔/钩子】
- ...
【下章安排】
- ...
【近期规划】
- ...
【远期方向】
- ...
    ↓
ChapterPostProcessor 处理：
  ① 结尾完整性检测 → 不完整则 LLM 补全末尾
  ② 解析结构化信息
  ③ 自动写入 TimelineEntry 表（source=ai_generated）
    ↓
返回生成结果（附带 timeline_summary）
```

**前端注意：** 章节生成完成后，可以额外请求 `/timeline/stats` 展示"本次生成了X条新伏笔/Y个新规划"。

### 5.2 上下文注入变更

每次AI对话/生成时，system_prompt 中新增一个 section：

```
【故事时间线 - 第N章相关】

【未回收伏笔】(8条)
- [神秘钥匙] (状态:pending, 目标章节:8, 重要度:4) 主角在码头捡到...

【章节规划】(3条)
- [第8章安排] (状态:pending, 目标章节:8, 重要度:4) ...

【用户指令】(2条)
- [风格规则] (状态:active, 重要度:5) ...
```

---

## 六、前端需要新增的功能

### 6.1 故事追踪页面（核心新页面）

**路由建议：** `/novel/:id/tracker` 或 `/novel/:id/timeline`

**页面布局建议：**

```
┌──────────────────────────────────────────────────────┐
│  📖 《书名》— 故事追踪                    [+添加条目] │
├──────────────────────────────────────────────────────┤
│  [全部] [📌伏笔] [📋规划] [💬指令] [🔗情节]          │
│  [全部状态] [待处理] [进行中] [已完成] [已放弃]       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ 时间线视图（按 target_chapter 排序）──────────┐ │
│  │                                                  │ │
│  │  ○── 第5章 ────────── 第8章 ──── 第12章 ─→    │ │
│  │      │                 │           │            │ │
│  │  📌 神秘钥匙         📌 密信      📌 钥匙孔     │ │
│  │  (pending, ⭐4)     (resolved)   (pending)     │ │
│  │                      │                           │ │
│  │  📋 第6章方向       📋 第8章安排                │ │
│  │  (completed)        (pending, ⭐4)              │ │
│  │                                                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  ── 或列表视图 ───────────────────────────────────── │
│  │ # │ 类型 │ 标题 │ 状态 │ 目标章节 │ 重要度 │ 操作 │ │
│  ├─────┼──────┼──────────┼────────┼──────────┼──────┼──────┤ │
│  │ 1  │ 📌   │ 神秘钥匙  │ pending │    8     │  ⭐4  │ ✏️✅│ │
│  │ 2  │ 📋   │ 第8章安排  │ pending │    8     │  ⭐4  │ ✏️✅│ │
│  │ 3  │ 💬   │ 风格规则   │ active  │    -     │  ⭐5  │ ✏️⏸│ │
│  └─────┴──────┴──────────┴────────┴──────────┴──────┴──────┘ │
└──────────────────────────────────────────────────────┘
```

**交互功能：**
- 点击条目 → 弹出编辑面板（可修改所有字段）
- 编辑后显示版本对比（original_ai_output vs 当前）
- 批量操作：批量标记完成/推迟/放弃
- 状态流转按钮（pending→active→completed/resolved）
- 拖拽排序（调整 target_chapter）
- 筛选器组合（分类 × 状态 × 时间范围 × 关键词搜索）

### 6.2 编辑体验优化（与AI协作）

**search_replace 模式的使用场景：**
- 当用户在对话中说"把这段改成xxx"时，AI 会使用 search_replace 模式调用 apply_edit
- 前端的编辑预览界面需要支持显示 diff（已支持，无需改动）
- 前端可以在编辑历史中标注使用了哪种模式

### 6.3 创作偏好管理增强

**需要新增/修改的UI：**

1. **偏好设置页面拆分：**
   - 「我的写作习惯」（全局）— 对应 `UserCreativeProfile`
   - 「这本书的风格」（单书）— 对应 `NovelCreativeProfile`

2. **防膨胀提示：**
   - 当 must_keep/must_avoid 接近 15 条上限时，前端显示警告
   - 提供"整理/合并相似项"按钮

3. **双层偏好可视化：**
   - 在设置页面明确区分哪些是全局规则、哪些是本书专属
   - 合并后的 `merged` 结果以只读方式展示给用户确认

---

## 七、WebSocket 消息变更

### 7.1 章节生成完成消息扩展

现有的 `chapter_generation_complete` 消息可增加字段：

```json
{
  "type": "chapter_generation_complete",
  "data": {
    "chapter_id": 123,
    "chapter_number": 7,
    "word_count": 3500,
    "post_process_info": {              // 新增
      "was_truncated": false,
      "ending_completed": false,
      "structured_info_detected": true,
      "timeline_entries_created": [     // 新增
        {"id": 45, "category": "foreshadowing", "title": "神秘钥匙"},
        {"id": 46, "category": "chapter_plan", "title": "第8章安排"},
        {"id": 47, "category": "chapter_plan", "title": "近期规划-9章"}
      ]
    }
  }
}
```

前端收到此消息后可以：
- 显示"本次生成了 3 条时间线追踪记录"
- 引导用户前往追踪页面查看

---

## 八、迁移检查清单

### 前端必须做的事

- [ ] **新增故事追踪页面** (`/novel/:id/tracker`)
  - [ ] 时间线列表/时间轴视图切换
  - [ ] CRUD 操作（添加/编辑/删除/状态变更）
  - [ ] 筛选器（分类/状态/时间范围/关键词）
  - [ ] 版本对比查看（AI原始 vs 用户修改）
  - [ ] 统计概览卡片

- [ ] **替换旧的伏笔API调用**
  - [ ] 所有 `/consistency/.../foreshadowings/*` → `/timeline/...` 对应端点
  - [ ] 移除对已删除的 `foreshadowing` schemas 的依赖

- [ ] **创作偏好设置页拆分**
  - [ ] 区分全局偏好 vs 单书偏好
  - [ ] 展示合并后的最终效果
  - [ ] 上限警告（接近15条时提示）

- [ ] **章节生成完成后的引导**
  - [ ] 展示 post_process 信息
  - [ ] 提供跳转到追踪页面的入口

### 可选优化

- [ ] 追踪页面支持拖拽排序
- [ ] 追踪页面导出为 Markdown/PDF
- [ ] 追踪页面与AI对话联动（选中条目发送给AI讨论）
- [ ] 伏笔回收率图表/仪表盘

---

## 九、向后兼容性说明

| 变更项 | 兼容性 | 说明 |
|--------|--------|------|
| timeline API | ✅ 新增，不影响现有功能 | 纯增量 |
| 旧 foreshadowing API | ⚠️ 已废弃，返回重定向 | 建议尽快替换 |
| creative_profile 返回格式 | ⚠️ 结构变化 | 新增 user_global 字段，保持向后兼容 |
| chapter_post_processor | ✅ 透明处理 | 前端无感知，仅内部逻辑 |
| edit_tools search_replace | ✅ 新增模式 | 向后兼容，旧模式仍可用 |
| WebSocket 消息 | ✅ 新增字段 | 旧字段不变，新增可选字段 |
