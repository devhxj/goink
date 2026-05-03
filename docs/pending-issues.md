# 待解决问题追踪

## 1. 小说级大纲从未创建

**问题**：NovelCreativeProfile 模型中有故事大纲字段（premise, theme, beginning, middle, climax, ending），但从未被填充过——数据库中全是 NULL。

**原因**：
- 没有 UI 入口让用户填写
- update_creative_profile 工具理论上能更新，但 AI 从未被指示填这些字段
- _format_creative_profile_for_prompt 之前也没输出这些字段（已修复）

**需要做的**：
- [ ] 小说创建流程加"故事大纲"步骤（可选填写）
- [ ] 或让 AI 在第一次对话时主动询问并调 update_creative_profile 填入
- [ ] 考虑是否需要单独的"故事大纲编辑"页面

**优先级**：中（不影响当前功能，但填了能显著提升创作质量）
