# Checklist

## Part A: Bug修复
- [x] update_timeline_entry 不再报 Enum is not defined 错误
- [x] update_timeline_entry 能正确更新 title, description, status 等字段
- [x] update_timeline_entry 更新后 version 正确递增
- [x] get_character_detail 调用返回完整角色数据（含novel_id）
- [x] get_character_detail 不再因缺少novel_id而报错

## Part B: 权限修复
- [x] AGENT模式白名单包含 check_character_consistency
- [x] AGENT模式白名单包含 check_plot_consistency
- [x] AGENT模式白名单包含 run_full_consistency_check
- [x] AGENT模式下AI可成功调用以上3个工具并获得结果

## Part C: 人物工具设计改进
- [x] get_character_list description 包含场景引导和适用时机说明
- [x] get_character_detail description 包含写作价值说明
- [x] get_character_memory description 突出动态信息优势
- [x] get_writing_characters 聚合工具已创建并注册
- [x] get_writing_characters 一步返回角色概览+关系+动态信息
- [x] AGENT system prompt 包含【人物关系管理】指引区块

## Part D: 人物关系图系统
- [x] CharacterRelation 模型已创建并注册到数据库
- [x] CharacterRelation 包含所有规划字段（source/target/type/intensity/status/evolved_from等）
- [x] CharacterRelation schemas 验证规则完整
- [x] CharacterService.get_network() 返回正确的图结构 {nodes, edges}
- [x] CharacterService.get_character_relationships() 返回某角色的全部关系
- [x] CharacterService.evolve_relation() 正确创建演变链（evolved_from_id指向旧记录）
- [x] CharacterService.migrate_from_json() 可从旧的JSON字段迁移数据
- [x] get_character_network MCP工具可调用并返回图结构数据
- [x] get_character_relationships MCP工具可调用并返回关系列表
- [x] update_character_relation MCP工具可创建/更新/演化关系
- [x] 人物关系HTTP API端点可访问（GET/POST/PUT /relations）
- [x] 关系变化可联动生成 TimelineEntry（可选功能已接入）

## 整体验证
- [x] 所有现有MCP工具仍正常工作（无回归）
- [x] server.py 启动无报错
- [x] 数据库迁移无冲突（alembic或create_all正常执行）
