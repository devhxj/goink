# Tasks

- [x] Task 1: 修复 `update_timeline_entry` Enum不兼容bug
  - [x] 分析 timeline_tools.py 中 models.Enum vs schemas.Enum 的混用情况
  - [x] 统一 UpdateTimelineEntryTool.execute() 中的 Enum 类型引用，确保只使用 schemas 层类型
  - [x] 同样检查 AddTimelineEntryTool 和 ResolveTimelineEntryTool 是否有类似问题
  - [x] 验证：手动构造调用参数确认不再报 Enum 错误

- [x] Task 2: 修复 `get_character_detail` server.py漏传novel_id
  - [x] 在 server.py 的 get_character_detail wrapper 函数中添加 novel_id: int 参数
  - [x] 将 novel_id 传入 _execute_tool 调用
  - [x] 验证：确认工具能正确接收 novel_id 并返回角色详情

- [x] Task 3: 将一致性检查工具加入AGENT白名单
  - [x] 在 edit_mode.py 的 MODE_ALLOWED_TOOLS.AGENT 集合中添加 check_character_consistency, check_plot_consistency, run_full_consistency_check
  - [x] 验证：确认 AGENT 模式下这3个工具可见可用

- [x] Task 4: 重写人物工具description + 新增聚合工具
  - [x] 重写 GetCharacterListTool.description（增加场景引导、行动召唤）
  - [x] 重写 GetCharacterDetailTool.description（说明写作价值、使用时机）
  - [x] 重写 GetCharacterMemoryTool.description（突出动态信息优势、修正novel_id声明）
  - [x] 新建 GetWritingCharactersTool 聚合工具（一步返回角色概览+关系网络+最近动态）
  - [x] 在 registry.py 中注册新工具
  - [x] 在 server.py 中添加新工具的 wrapper 函数
  - [x] 在 edit_mode.py 白名单中添加新工具

- [x] Task 5: AGENT system prompt 增加人物工具指引
  - [x] 在 edit_mode.py 的 AGENT system prompt 中新增【人物关系管理】区块
  - [x] 引导AI在写作前调用人物工具了解角色
  - [x] 引导AI在章节生成后更新人物关系变化

- [x] Task 6: 新建 CharacterRelation 数据模型
  - [x] 在 characters/models.py 中新建 CharacterRelation 模型（注意不用Relationship避免与sqlalchemy冲突）
  - [x] 字段完整：id, novel_id, source/target character_id, type, description, intensity, status, established_chapter_id, evolved_from_id, extra_metadata
  - [x] 添加 source/target relationship 双向 ORM relationship
  - [x] 添加复合索引 (source, target), (novel_id, type)
  - [x] 标记 Character.relationships JSON字段为 deprecated（保留不删）

- [x] Task 7: 新建 CharacterRelation schemas
  - [x] 在 characters/schemas.py 中新建 RelationStatus/RelationType 枚举 + Create/Update/Evolve/Response/NetworkResponse schemas
  - [x] 包含完整的字段验证规则

- [x] Task 8: 新建 CharacterService 服务层
  - [x] 新建 characters/service.py — CharacterService 类含8个方法
  - [x] 实现 get_network(novel_id) → 返回 {nodes:[], edges:[]} 图结构
  - [x] 实现 get_character_relationships(character_id) → 返回某角色的所有关系
  - [x] 实现 add_relation(data) → 创建关系记录
  - [x] 实现 update_relation(relation_id, data) → 更新关系
  - [x] 实现 evolve_relation(relation_id, new_data) → 关系演变（保留旧记录+创建新记录链）
  - [x] 实现 get_relation_history(char_a_id, char_b_id) → 两角色间关系演变历史
  - [x] 实现迁移方法 migrate_from_json(novel_id) → 从旧 Character.relationships JSON 迁移

- [x] Task 9: 新增人物关系MCP工具
  - [x] 新建 mcp/character_tools.py — 3个工具类 + 注册函数
  - [x] 实现 GetCharacterNetworkTool — 获取整本书的人物关系图
  - [x] 实现 GetCharacterRelationshipsTool — 获取某角色的详细关系网
  - [x] 实现 UpdateCharacterRelationTool — 创建/更新/演化关系（三种模式）
  - [x] 所有工具 description 包含场景引导和适用时机
  - [x] 在 registry.py 注册
  - [x] 在 server.py 添加 wrapper
  - [x] 在 edit_mode.py 白名单添加

- [x] Task 10: 人物关系HTTP API + 数据库注册
  - [x] 在 characters/router.py 新增6个关系API端点（列表/创建/更新/演变/网络图/单角色）
  - [x] 在 database.py 注册 CharacterRelation 模型
  - [x] main.py 确认 characters router 已注册

- [x] Task 11: 时间线与人物关系联动
  - [x] 在 CharacterService.evolve_relation() 中可选地同步创建 TimelineEntry（_create_timeline_entry_for_evolution）
  - [x] 在 get_timeline_context 中可选包含近期关系变化信息（_append_relation_changes）
  - [x] 在 ContextBuilder 中可选注入人物关系概要（_get_relation_network_context）

# Task Dependencies
- [Task 2] 无依赖，可与Task1并行 ✅
- [Task 3] 无依赖，可与Task1并行 ✅
- [Task 4] 依赖 Task 2 ✅
- [Task 5] 依赖 Task 4 ✅
- [Task 6] 无依赖，可与Task1-3并行 ✅
- [Task 7] 依赖 Task 6 ✅
- [Task 8] 依赖 Task 6, 7 ✅
- [Task 9] 依赖 Task 8 ✅
- [Task 10] 依赖 Task 6, 7 ✅
- [Task 11] 依赖 Task 8, 9 ✅
