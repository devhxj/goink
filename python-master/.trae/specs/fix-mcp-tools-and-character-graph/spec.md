# MCP工具全面修复 + 人物关系图系统 Spec

## Why

当前MCP工具系统存在多个阻断性问题：2个工具完全不可用（bug）、4个工具有权限限制、人物工具设计导致AI不倾向使用。同时人物关系目前以扁平JSON字段存储（`Character.relationships`），无法体现关系演变、无法与时间线联动、模型与schema类型不一致。需要一次性修复所有问题并升级为图结构的关系系统。

## What Changes

### Part A：Bug修复（P0）

1. **修复 `update_timeline_entry` Enum不兼容报错**
   - 根因：[timeline_tools.py](backend/app/mcp/timeline_tools.py) 同时从 `models` 和 `schemas` 导入同名Enum类，`UpdateTimelineEntryTool.execute()` 中混用两者
   - 方案：统一使用 `schemas` 层的 Enum 类型（Pydantic验证层），或移除对 models Enum 的直接依赖

2. **修复 `get_character_detail` server.py漏传novel_id**
   - 根因：[server.py:146](backend/app/mcp/server.py#L146) 的 wrapper 函数缺少 `novel_id` 参数
   - 方案：补上 `novel_id: int` 参数并传入 `_execute_tool`

### Part B：权限修复（P1）

3. **将一致性检查工具加入AGENT白名单**
   - 受影响工具：`check_character_consistency`, `check_plot_consistency`, `run_full_consistency_check`
   - 修改文件：[edit_mode.py](backend/app/core/edit_mode.py) 的 `MODE_ALLOWED_TOOLS.AGENT`

### Part C：人物工具设计改进（P1）

4. **重写3个人物工具的description**
   - `get_character_list`：增加场景引导、"写作前应调用"等行动召唤
   - `get_character_detail`：增加场景引导、说明返回信息的写作价值
   - `get_character_memory`：突出"动态信息"优势、修正参数声明

5. **新增聚合工具 `get_writing_characters`**
   - 一步调用返回当前小说的角色概览+关系网络+最近动态
   - 替代"先list再detail"的两步摩擦链

6. **AGENT system prompt 增加角色工具使用指引**

### Part D：人物关系图系统（P1-P2）— 新功能

7. **新建 `CharacterRelationship` 模型（图结构）**
   - 独立表替代 `Character.relationships` JSON字段
   - 字段：source/target character_id, relationship_type, description, intensity(1-5), status(active/dormant/resolved), established_chapter_id, evolved_from_id(关系演变链), extra_metadata
   - 支持有向边+双向查询+关系演变追踪

8. **新建 `characters/service.py` — CharacterService**
   - `get_network(novel_id)` → 返回图结构 {nodes: [], edges: []}
   - `get_relationships(character_id)` → 某角色的所有关系
   - `add_relationship()` / `update_relationship()` / `evolve_relationship()`
   - `get_relationship_evolution(character_a, character_b)` → 关系演变历史

9. **新增MCP工具**
   - `get_character_network` — 获取整本小说的人物关系图
   - `get_character_relationships` — 获取某角色的详细关系网
   - `update_character_relationship` — 更新/演化关系（AI根据章节内容自动调用）

10. **迁移策略**
    - 保留 `Character.relationships` JSON字段作为向后兼容（标记deprecated）
    - 提供数据迁移路径：JSON → CharacterRelationship表
    - 新工具优先读新表，旧字段降级为fallback

11. **时间线联动**
    - `established_chapter_id` 链接到章节
    - 关系变化可自动生成 TimelineEntry（category=plot_node 或 user_directive）
    - `get_timeline_context` 可选包含近期关系变化

## Impact

- Affected specs: 无前置spec依赖
- Affected code:
  - `backend/app/mcp/timeline_tools.py` — Enum修复
  - `backend/app/mcp/server.py` — novel_id注入修复
  - `backend/app/core/edit_mode.py` — 权限白名单
  - `backend/app/mcp/novel_tools.py` — description重写+新增工具
  - `backend/app/mcp/memory_tools.py` — description重写
  - `backend/app/characters/models.py` — 新增Relationship模型
  - `backend/app/characters/schemas.py` — 新增Relationship schemas
  - `backend/app/characters/service.py` — 新建服务层
  - `backend/app/characters/router.py` — 新增关系API端点
  - `backend/app/mcp/registry.py` — 注册新工具
  - `backend/app/core/database.py` — 注册新模型
  - `backend/app/main.py` — 注册新router

## ADDED Requirements

### Requirement: update_timeline_entry 工具可正常执行
系统 SHALL 确保 `update_timeline_entry` 工具在传入合法参数时能正确更新 TimelineEntry 并递增版本号。

#### Scenario: 更新时间线条目标题和描述
- **WHEN** AI调用 `update_timeline_entry(entry_id=1, title="新标题", description="新描述")`
- **THEN** 返回 success=true, data 中 version=原版本+1, title="新标题"

#### Scenario: 更新时间线条目状态
- **WHEN** AI调用 `update_timeline_entry(entry_id=1, status="completed")`
- **THEN** 返回 success=true, data 中 status="completed"，无 Enum 报错

### Requirement: get_character_detail 工具可正常返回角色详情
系统 SHALL 确保 AI 通过 MCP 调用 `get_character_detail` 时能获得完整的角色详情数据。

#### Scenario: AI查询角色详情
- **WHEN** AI调用 `get_character_detail(character_id=1)`
- **THEN** 返回包含 name, personality, abilities, relationships 的完整角色数据

### Requirement: AGENT模式可使用一致性检查工具
系统 SHALL 允许 AGENT 模式下的AI调用 check_character_consistency, check_plot_consistency, run_full_consistency_check 工具。

#### Scenario: AI在写作后检查一致性
- **WHEN** AGENT模式下的AI调用 `check_plot_consistency(novel_id=1)`
- **THEN** 工具正常执行并返回检查结果

### Requirement: AI主动使用人物工具获取写作上下文
系统 SHALL 通过增强的description和system prompt引导AI在写作前优先调用人物相关工具。

#### Scenario: AI准备生成章节时查角色
- **WHEN** AI收到"帮我写第5章"的指令
- **THEN** AI应主动调用 `get_writing_characters` 或 `get_character_list` 了解角色信息

### Requirement: 人物关系图数据模型
系统 SHALL 提供 `CharacterRelationship` 模型，支持有向图结构存储人物间关系。

#### Scenario: 创建双向关系
- **WHEN** 系统创建 A→B 的 ally 关系，intensity=4
- **THEN** 数据库中存在一条记录：source=A, target=B, type=ally, intensity=4, status=active

#### Scenario: 关系演变
- **WHEN** A和B从enemy变为ally（在第10章和解）
- **THEN** 可通过 evolved_from_id 链接到原始enemy关系记录，established_chapter_id=第10章ID

### Requirement: 人物关系图MCP工具
系统 SHALL 提供 MCP 工具让AI查询和更新人物关系图。

#### Scenario: AI获取整本书的人物关系网络
- **WHEN** AI调用 `get_character_network()`
- **THEN** 返回 {nodes: [{id, name, role}], edges: [{source, target, type, intensity}]}

#### Scenario: AI根据章节内容更新关系
- **WHEN** AI写完一章后发现两个角色关系发生变化
- **THEN** AI可调用 `update_character_relationship` 记录变化，并可联动创建 TimelineEntry

### Requirement: 时间线与人物关系联动
系统 SHALL 支持将人物关系变化反映到故事时间线中。

#### Scenario: 关系变化自动写入时间线
- **WHEN** 通过 service 层记录了重大关系变化（如敌变友）
- **THEN** 可选择性地同步创建一条 category=plot_node 的 TimelineEntry

## MODIFIED Requirements

### Requirement: Character模型的relationships字段
原有 `Character.relationships` JSON字段保留但标记为 deprecated。新代码优先使用 `CharacterRelation` 表。旧的JSON数据可通过迁移脚本转换。

### Requirement: AGENT模式system prompt
在现有system prompt的【故事时间线管理】区块附近新增【人物关系管理】指引区块。

## REMOVED Requirements

无删除需求。
