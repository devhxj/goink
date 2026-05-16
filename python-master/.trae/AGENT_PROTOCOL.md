# AI小说生成系统 - 开发Agent协作协议

## 文档信息

- **版本**: v2.7.0
- **创建时间**: 2026-03-27
- **最后更新**: 2026-03-28
- **适用范围**: 四个开发Agent的协作规范

***

## 1. 目标系统简介

### 1.1 我们要开发什么？

**AI小说生成系统** - 一个能够利用外部AI API高效生成小说的系统。

**核心特性**:

- **长期连载**: 持续生成新篇章，保持连贯性
- **多书管理**: 方便管理多本小说
- **可视化追踪**: 追踪每本小说的进度
- **多Agent协作**: 目标系统内部采用多Agent架构

**目标系统Agent架构**（第二层，未来实现）:

| Agent名称 | 职责           |
| ------- | ------------ |
| 主控Agent | 调度、索引、章节管理   |
| 写作Agent | 具体章节编写，保证连贯性 |
| 审核Agent | 章节审核、伏笔管理    |
| 记忆Agent | RAG检索、上下文构建  |

**详细规划**: 见 [system-plan.md](documents/system-plan.md)

***

## 2. 两层Agent概念

### 2.1 架构说明

| 层级      | 类型        | 说明                              |
| ------- | --------- | ------------------------------- |
| **第一层** | 开发Agent   | agent\_1\~agent\_4，负责开发AI小说生成系统 |
| **第二层** | 目标系统Agent | 主控Agent、写作Agent、审核Agent、记忆Agent |

**本文档仅针对第一层开发Agent的协作规范。**

### 2.2 开发Agent角色定义

| Agent ID | 角色名称         | 职责                 | 工作目录        |
| -------- | ------------ | ------------------ | ----------- |
| agent\_1 | 前端开发Agent    | 前端开发、UI实现          | `frontend/` |
| agent\_2 | 后端开发Agent    | 后端开发、API实现         | `backend/`  |
| agent\_3 | Review Agent | 代码审查、质量检查、执行Commit | 全项目         |
| agent\_4 | 主调度Agent     | 项目协调、API文档维护、进度监控  | 全项目         |

***

## 3. 协作架构

### 3.1 协作流程图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户（你）                             │
│                    - 最终决策者                               │
│                    - 跨Agent信息转达                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │前端Agent │    │后端Agent │    │Review    │
    │(agent_1) │    │(agent_2) │    │Agent     │
    │          │    │          │    │(agent_3) │
    └────┬─────┘    └────┬─────┘    └────┬─────┘
         │               │               │
         │  完成开发     │  完成开发     │
         │  请求Review   │  请求Review   │
         └──────►用户◄───┘               │
                    │                    │
                    │  转达Review请求    │
                    └───────────────────►│
                                         │
                    ◄────────────────────┘
                    │  返回评审结果
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    修改代码              通过→Commit
```

### 3.2 核心原则

1. **用户为中心**: 所有跨Agent协作都通过用户转达
2. **API First**: 前后端基于API文档并行开发
3. **Review机制**: 仅Review Agent有权限执行Commit
4. **文件通信**: Agent通过文件系统记录状态和通信

***

## 4. 文件结构

```
.trae/
├── AGENT_PROTOCOL.md           # 本文件：核心协作协议
│
├── agents/                     # Agent配置文件
│   ├── main-agent.json
│   ├── frontend-agent.json
│   ├── backend-agent.json
│   └── review-agent.json
│
├── progress/                   # 进度追踪
│   ├── main/
│   │   ├── progress.md
│   │   └── memory.json
│   ├── frontend/
│   │   ├── progress.md
│   │   └── memory.json
│   ├── backend/
│   │   ├── progress.md
│   │   └── memory.json
│   └── review/
│       ├── progress.md
│       ├── memory.json
│       └── review-requests.md
│
├── communication/              # 跨Agent通信
│   ├── notifications.md        # 通知队列
│   └── handoffs.md             # 任务交接记录
│
└── documents/                  # 项目文档
    ├── system-plan.md          # 目标系统规划
    ├── api-specification.md    # API文档
    └── technical/              # 技术文档
        ├── jwt-authentication.md
        └── frontend-backend-guide.md
```

***

## 5. Agent详细职责

### 5.1 主调度Agent (agent\_4)

**核心职责**:

- 项目整体协调和任务分配
- API文档维护和变更管理
- 进度监控和风险管理
- 处理争议上报

**工作流程**:

```
启动项目
    ↓
创建API文档和协作规范
    ↓
启动其他Agent
    ↓
持续监控项目进度
    ↓
    ├─ 处理API变更请求
    ├─ 协调前后端对齐
    └─ 处理争议上报
    ↓
定期汇总进度上报用户
```

### 5.2 前端开发Agent (agent\_1)

**核心职责**:

- 前端项目架构搭建
- UI组件开发
- API客户端实现
- 前端测试

**工作流程**:

```
读取API文档
    ↓
创建TypeScript类型定义
    ↓
实现API客户端
    ↓
开发UI组件
    ↓
本地测试
    ↓
完成开发 → 请求用户转达Review
    ↓
    ├─ 接受评审意见 → 修改代码
    └─ 拒绝评审意见 → 上报用户
    ↓
Review通过 → 等待Commit
```

### 5.3 后端开发Agent (agent\_2)

**核心职责**:

- 后端项目架构搭建
- API接口实现
- 业务逻辑开发
- 数据库操作

**工作流程**:

```
读取API文档
    ↓
创建数据库模型
    ↓
实现API接口
    ↓
编写单元测试
    ↓
本地测试
    ↓
完成开发 → 请求用户转达Review
    ↓
    ├─ 接受评审意见 → 修改代码
    └─ 拒绝评审意见 → 上报用户
    ↓
Review通过 → 等待Commit
```

### 5.4 Review Agent (agent\_3)

**核心职责**:

- 代码质量审查
- 架构设计审查
- 安全性检查
- 执行Git Commit

**审查标准**:

| 类别   | 标准项                            |
| ---- | ------------------------------ |
| 代码质量 | PEP 8/ESLint规范、类型注解、文档字符串、错误处理 |
| 架构设计 | 模块化、单一职责、依赖注入、配置分离             |
| 安全性  | API认证、SQL注入防护、XSS防护、CSRF保护     |
| 性能   | 数据库索引、连接池、缓存策略、查询优化            |

**工作流程**:

```
接收用户转达的Review请求
    ↓
读取review-requests.md
    ↓
标记请求状态为"处理中"
    ↓
启动评审流程
    ├─ 检查代码质量
    ├─ 检查架构设计
    ├─ 检查安全性
    └─ 检查测试覆盖
    ↓
写入评审报告
    ↓
通知用户评审结果
    ↓
    ├─ 通过 → 执行Commit → 清理请求
    └─ 需修改 → 等待修改 → 验证 → Commit
```

***

## 6. Review请求机制

### 6.1 请求触发条件

当Agent认为代码达到可提交程度时：

1. 功能完整实现
2. 本地测试通过
3. 符合代码规范
4. 已更新相关文档

### 6.3 请求流程

```
Agent完成开发
    ↓
写入请求元数据到 review-requests.md
    ↓
通知用户："我已完成[任务]，请转达Review请求"
    ↓
用户切换到Review Agent会话
    ↓
用户发送："检查Review请求并处理"
    ↓
Review Agent执行评审
    ↓
详细评审结果直接输出给用户
    ↓
用户决定是否转发给开发Agent
    ↓
Review Agent更新review-requests.md状态
```

### 6.4 请求元数据格式（review-requests.md）

**只存储元数据，不存储详细评审内容：**

```markdown
### REQ-YYYYMMDD-XXX

**基本信息**
- 请求ID: REQ-YYYYMMDD-XXX
- 请求时间: YYYY-MM-DDTHH:MM:SSZ
- 请求Agent: agent_X (角色名称)
- 任务ID: task_XXX
- 状态: PENDING | APPROVED | REJECTED

**代码范围**
- 文件路径1
- 文件路径2

**完成内容摘要**
1. 完成的功能1
2. 完成的功能2

**处理结果**
- 处理时间: YYYY-MM-DDTHH:MM:SSZ
- 评审结果: APPROVED | REJECTED
- 提交哈希: (如已提交)
```

### 6.5 详细评审结果输出

**Review Agent直接输出给用户，不写入文件**

**必须使用代码块输出Markdown格式，方便用户复制转发：**

````
```markdown
════════════════════════════════════════════════════════════
                    📋 Review Report
════════════════════════════════════════════════════════════
请求ID: REQ-YYYYMMDD-XXX
任务: task_XXX

【代码质量】
- ✅ 符合规范
- ⚠️ 需要改进: xxx

【架构设计】
- ✅ 模块化设计良好
- ✅ 单一职责原则

【安全性】
- ✅ JWT认证实现正确
- ⚠️ 建议添加: xxx

【总体评价】
结果: APPROVED / REJECTED
评分: 8/10

【修改建议】（如需修改）
1. 具体建议1
2. 具体建议2

【Commit信息】（如通过）
[模块名] 完成任务：任务描述
...
════════════════════════════════════════════════════════════
````

```

### 6.6 用户操作

**收到评审结果后：**
- **通过**: 告诉Review Agent "提交代码"
- **需修改**: 转发评审结果给开发Agent
- **有疑问**: 直接与Review Agent讨论

### 6.6 请求清理机制

- **历史记录上限**: 最多保留3个已完成的请求
- **清理时机**: 每次Commit完成后
- **清理流程**: 统计已完成请求数量，超过3个则删除最早的

### 6.7 文件操作权限

**review-requests.md 操作权限：**

| Agent | 权限 | 说明 |
|-------|------|------|
| 前端Agent | 只能添加 | 只能追加新请求，不能修改/删除 |
| 后端Agent | 只能添加 | 只能追加新请求，不能修改/删除 |
| Review Agent | 完全权限 | 可以添加、修改状态、删除历史记录 |
| 主调度Agent | 只读 | 只能查看，不能修改 |

**目的**: 防止Agent之间互相删除请求，确保请求记录完整性

---

## 7. Git Commit机制

### 7.1 Commit权限

**仅Review Agent有权限执行Commit**

### 7.2 Commit流程

```
Review Agent评审通过
    ↓
准备Commit
    ↓
提供中英文两个版本的commit信息给用户审核
    ↓
用户确认后提交英文版本
    ↓
更新progress.md和memory.json
    ↓
清理review-requests.md
```

### 7.3 Commit文件范围

**Review Agent commit时必须包含以下文件：**

| 文件类型 | 路径 | 说明 |
|----------|------|------|
| 代码文件 | 相关代码目录 | 本次开发的代码 |
| 进度文件 | `.trae/progress/{agent}/progress.md` | 发起请求Agent的进度 |
| 记忆文件 | `.trae/progress/{agent}/memory.json` | 发起请求Agent的记忆 |
| Review队列 | `.trae/progress/review/review-requests.md` | Review请求记录 |
| Review进度 | `.trae/progress/review/progress.md` | Review Agent进度 |
| Review记忆 | `.trae/progress/review/memory.json` | Review Agent记忆 |

**示例：后端Agent发起的请求通过后，commit应包含：**
```
backend/                          # 代码
.trae/progress/backend/           # 后端Agent进度
.trae/progress/review/            # Review Agent相关
```

### 7.4 Commit信息格式

```

\[模块名] 完成任务：任务描述

- 变更内容：
  1. 具体变更1
  2. 具体变更2
- 影响范围：影响的模块或功能

Reviewed-by: Review Agent (agent\_3)

```

### 7.5 分支策略

- **统一使用main分支**，不创建其他分支
- 所有commit直接提交到main分支

---

## 8. 用户操作指南

### 8.1 多会话使用方式

**需要4个会话窗口**:
```

会话1: 前端Agent (agent\_1)
会话2: 后端Agent (agent\_2)
会话3: Review Agent (agent\_3)
会话4: 主调度Agent (agent\_4)

```

### 8.2 典型工作流程

#### 场景1: 前端开发完成，请求Review
```

1. 用户在会话1（前端）发送：
   "前端开发完成，提交Review请求"
2. 前端Agent执行：
   - 更新progress.md
   - 写入review-requests.md
   - 回复："我已完成\[任务]，请转达Review请求"
3. 用户切换到会话3（Review）发送：
   "检查Review请求并处理"
4. Review Agent执行：
   - 读取review-requests.md
   - 评审代码
   - 写入评审报告
   - 提交代码（如果通过）

```

#### 场景2: API变更协调
```

1. 用户在会话1（前端）发送：
   "需要变更API，请求协调"
2. 前端Agent执行：
   - 写入通知到notifications.md
   - 回复："已提交API变更请求"
3. 用户切换到会话4（主调度）发送：
   "检查通知并处理API变更"
4. 主调度Agent执行：
   - 读取notifications.md
   - 评估变更
   - 更新API文档
   - 写入通知
5. 用户切换到会话2（后端）发送：
   "检查通知，实现API变更"
6. 后端Agent执行：
   - 读取通知
   - 实现API变更

```

### 8.3 常用指令模板

| Agent | 指令示例 |
|-------|----------|
| 前端Agent | "开始开发[功能名称]"<br>"前端开发完成，提交Review"<br>"检查是否有评审报告" |
| 后端Agent | "开始开发[功能名称]"<br>"后端开发完成，提交Review"<br>"检查API变更通知" |
| Review Agent | "检查Review请求"<br>"评审[请求ID]"<br>"提交代码" |
| 主调度Agent | "检查项目进度"<br>"检查通知"<br>"处理API变更请求" |

---

## 9. 争议处理机制

### 9.1 争议类型

1. **技术方案争议**: 对技术实现方案有不同意见
2. **代码风格争议**: 对代码风格规范有不同理解
3. **评审意见争议**: 认为评审意见不合理

### 9.2 处理流程

```

Agent拒绝评审意见
↓
在progress.md中说明拒绝理由
↓
通知用户："我不同意评审意见，理由是..."
↓
用户裁决
↓
├─ 维持原评审意见 → Agent执行修改
├─ 修改评审意见 → Review Agent更新意见
└─ 取消评审意见 → Review Agent通过代码
↓
执行裁决结果

````

---

## 10. 文件格式规范

### 10.1 progress.md格式

```markdown
# [Agent名称] - 进度追踪

## Agent信息
- Agent ID: agent_X
- 角色: [角色名称]
- 创建时间: YYYY-MM-DD

## 当前任务
- 任务ID: task_XXX
- 任务描述: [描述]
- 状态: 进行中 | 待Review | 已完成

## 任务列表

### 阶段X: [阶段名称]
- [x] task_001: 任务描述 ✅ (完成时间)
- [ ] task_002: 任务描述 ← 当前任务

## 已完成任务
### task_XXX - 任务名称
- 完成时间: YYYY-MM-DD
- 关键成果: [描述]
````

### 10.2 memory.json格式

**精简版 - 只存储核心信息：**

```json
{
  "agent_id": "agent_X",
  "agent_name": "Agent名称",
  "created_at": "YYYY-MM-DDTHH:MM:SSZ",
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "completed_task_ids": ["task_001", "task_002"],
  "current_task": "task_XXX",
  "pending_tasks": ["task_XXX"],
  "key_decisions": ["决策1", "决策2"]
}
```

**详细信息放progress.md，不存memory.json：**

- 文件列表 → 从git获取
- API端点 → 从代码获取
- 问题解决方案 → progress.md
- 详细描述 → progress.md

***

## 11. 上下文窗口管理

### 11.1 压缩触发条件

**上下文窗口小于80%时，禁止压缩**

| 上下文使用率 | 操作          |
| ------ | ----------- |
| < 80%  | 禁止压缩，继续正常工作 |
| ≥ 80%  | 可以考虑压缩      |

### 11.2 压缩后恢复流程

**压缩完成后，必须重新读取：**

```
压缩完成
    ↓
读取 memory.json
    ↓
读取 progress.md
    ↓
继续工作
```

**必须读取的文件：**

1. `.trae/progress/{agent}/memory.json` - 当前任务状态
2. `.trae/progress/{agent}/progress.md` - 详细进度信息
3. `.trae/AGENT_PROTOCOL.md` - 协作协议（可选）

### 11.3 压缩注意事项

- 压缩前确认当前任务状态
- 压缩后第一件事是读取记忆文件
- 不要在压缩后凭记忆工作，必须重新读取

***

## 12. 终端管理

### 12.1 终端分配

**每个Agent使用专用终端，避免冲突：**

| 终端 | 分配Agent | 用途 |
|------|-----------|------|
| 终端1 | 前端Agent | npm run dev、npm run build等 |
| 终端2 | 后端Agent | uvicorn、pytest等 |
| 终端3 | Review Agent | git操作、代码检查 |
| 终端4 | 主调度Agent | 项目管理命令 |
| 终端5 | 备用 | 用户手动操作 |

### 12.2 终端使用规则

1. **专用原则**: 每个Agent只使用分配给自己的终端
2. **避免抢占**: 不要使用其他Agent正在运行的终端
3. **长进程处理**: 
   - 开发服务器等长进程使用 `blocking: false`
   - 短命令使用 `blocking: true`

### 12.3 终端命令示例

```
# 前端Agent启动开发服务器
RunCommand(
  command="npm run dev",
  blocking=false,
  target_terminal="terminal_1"
)

# 后端Agent启动API服务器
RunCommand(
  command="uvicorn app.main:app --reload",
  blocking=false,
  target_terminal="terminal_2"
)
```

---

## 13. 开发测试脚本管理

- **临时测试脚本**: 放在 `dev_test/` 目录，已加入 `.gitignore`
- **CI测试脚本**: 放在 `tests/` 目录，纳入版本控制
- **命名规范**:
  - 临时测试：`dev_test/test_*.py`
  - CI测试：`tests/test_*.py`

***

## 14. 成功标准

### 14.1 代码质量标准

- [ ] 符合代码规范（PEP 8 / ESLint）
- [ ] 有完整的类型注解
- [ ] 有文档字符串
- [ ] 有单元测试
- [ ] 测试覆盖率 ≥ 80%

### 14.2 API质量标准

- [ ] 符合RESTful规范
- [ ] 有完整的错误处理
- [ ] 有JWT认证
- [ ] 有API文档

### 14.3 协作质量标准

- [ ] 及时更新进度文件
- [ ] 及时响应通知
- [ ] 遵守协作规范
- [ ] 无阻塞问题超过24小时

***

## 15. 版本历史

### v2.7.0 (2026-03-28)
- 新增终端管理规则：每个Agent使用专用终端
- 避免多Agent抢占同一终端的问题

### v2.6.0 (2026-03-28)
- 新增Commit文件范围规则：必须包含发起Agent的进度和记忆文件
- 确保进度追踪和代码同步提交

### v2.5.0 (2026-03-28)

- 新增自检要求：前端构建、后端语法检查
- 自检通过才能发起Review请求

### v2.3.0 (2026-03-28)

- 精简memory.json格式，只存储核心信息
- 详细信息放progress.md或从git获取
- Review结果必须用代码块输出Markdown

### v2.2.0 (2026-03-28)

- 简化Review机制：详细结果直接输出给用户
- review-requests.md只存储元数据
- 用户作为信息转达中心

### v2.1.0 (2026-03-28)

- 添加目标系统简介章节
- 明确两层Agent架构
- 添加system-plan.md引用

### v2.0.0 (2026-03-28)

- 整合AGENT\_PROTOCOL.md、workflow-overview\.md、frontend-backend-collaboration.md
- 简化协作流程，明确用户中心角色
- 重新组织文件结构
- 精简文档，消除冗余

### v1.0.0 (2026-03-27)

- 初始版本

