# 已知局限与潜在问题

## 1. ReaderPerspective 类型扩展性

**现状**：单表 + type 字段（known / suspense / misconception），`related_truth` 仅 misconception 使用。

**局限**：如果新增类型需要全新的专属字段（如 theory 类型需要 confidence_level），需要加列迁移。当前单表模式下，专属字段越多，NULL 列越多。

**当前评估**：三种类型覆盖读者认知核心场景，nullable 一列的代价很低。未来加类型只需 enum 值 + 可能一列 nullable 字段，迁移成本可控。暂不需要 metadata JSON 或拆表。

## 2. 小说级大纲从未初始化

**现状**：NovelCreativeProfile 中 premise, theme, beginning, middle, climax, ending 字段在数据库中全部为 NULL。无 UI 入口，AI 也从未被指示填写。

**影响**：不影响当前功能，但填入后能显著提升创作质量（上下文注入已支持这些字段）。

**需要**：小说创建流程加"故事大纲"步骤，或让 AI 在首次对话时主动询问并填入。

## 3. 上下文注入与工具调用的冗余

**现状**：system2（小说上下文快照）包含故事状态、读者认知、角色索引等信息。AI 在对话中可能调用 get_story_state、get_characters 等工具获取相同信息，导致上下文中出现重复内容。

**原因**：无法让工具检测"你已经有了"然后跳过——工具返回的是最新数据，system2 是对话开始时的快照，两者可能已不同步。如果限制 AI 不调这些工具，又会失去获取详细信息的能力。

**当前评估**：接受这个 tradeoff。system2 提供基础上下文（不调工具也知道个大概），工具提供详细/最新信息。冗余的 token 成本远小于"AI 漏调工具导致上下文缺失"的风险。
