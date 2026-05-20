# Session/Message 存储重构 — 待实现设计

> 背景：Python 版重构（`refactor/llm-service` 分支）已完成代码清理和边界划定，但核心存储改造未完成即合并归档。本文档记录已做的、没做的、以及 Go 重写中应如何延续。

## 一、已完成（Python 版的成果，Go 直接参照）

### 模块重组

```
backend/sessions/          ← 独立模块
    models.py              ← ORM: ChatSession, ChatMessage
    schema.py              ← Pydantic: Session, Message
    manager.py             ← 仅剩 SessionConfig 和 MODEL_CONFIGS 两个 dataclass
    storage.py             ← session_storage 单例
    router.py              ← REST API 端点
```

- Session 从 `chat/session_manager.py` 拆到独立 `sessions/` 模块
- `SessionManager` 类全部删除（`SessionManager.add_message`、`get_messages_for_api`、`create_session`、`get_session_stats` 等全部清除）
- `SessionStorage` 保留，但取消了 `messages` 相关的批量写入逻辑（DELETE+INSERT 循环）
- 原来 518 行的 `session_manager.py` 压缩为两个 dataclass + MODEL_CONFIGS 字典

### 数据模型清理

| 改动 | 说明 |
|------|------|
| `reasoning_effort` → 顶层字段 | 从 `extra_metadata` 深渊里拉出来 |
| `subtitle` 删除 | 无用字段，LLM 标题生成取代 |
| `get_display_name()` 删除 | 前端 `title \|\| "新对话"` 就够了 |
| `message_count` 删除 | 消息不挂 Session 对象上，点数无意义 |
| `get_token_count()` 删除 | 同上了，token 走 `session.usage` |
| `get_context_usage_ratio()` 删除 | |

### 前端 WS → HTTP 迁移

| 功能 | 原来 | 现在 |
|------|------|------|
| 创建会话 | 先发 WS `create_session` 再 `chat` | 直接发 `chat`，后端内联创建 |
| 列出会话 | WS `list_sessions` | `GET /sessions/list` （分页） |
| 加载会话 | WS `load_session` | `GET /sessions/{id}` |
| 接受/拒绝编辑 | WS `accept_edit` / `reject_edit` | `POST /editor/session/{id}/accept` / `reject` |

WS 现在只保留三个：`chat`（流式对话）、`cancel`（取消任务）、`outline_approval`（审批信令）。

### 分页模型

`core/pagination.py` 已实现可复用泛型分页（PageResponse[T]、PaginationParams、PaginationDep），Go 版直接也做一个等价物即可。

---

## 二、未实现（最重要的部分，Go 必须做对）

### 2.1 核心问题回顾

Python 版历史存储架构的根问题：

1. **消息不是追加的**：`SessionStorage._save_to_db()` 每次全量 DELETE+INSERT，O(N²)。DB 不是全量历史，只是内存的快照。
2. **Session 既是运行时又是存储**：内存持有 `messages: list[Message]`，DB 是镜像，LLM context 也是镜像。三者无分离。
3. **没有 `to_api` / `to_frontend` 控制**：前端拿到 system 消息（System1/System2）、压缩摘要等不该暴露的内容。
4. **没有版本管理**：压缩后旧消息从 DB 物理删除，不可回滚。

### 2.2 新方案（已验证但未实现）

#### 核心原则

- **DB 只追加不删除**：每条消息 INSERT 一次，永久保留
- **LLM context 动态构建**：从 DB 加载时按版本 + 权限字段过滤
- **前端只拿 to_frontend=true 的消息**：system 角色不暴露

#### 字段

```sql
-- chat_messages 表
ALTER TABLE chat_messages ADD COLUMN
    version      INT NOT NULL DEFAULT 1,      -- 属于第几代上下文构建
    to_api       BOOL NOT NULL DEFAULT TRUE,   -- LLM context 是否需要此消息
    to_frontend  BOOL NOT NULL DEFAULT TRUE,   -- 前端是否需要渲染
    event_type   VARCHAR(32) NULL;             -- 事件标记: compression / interrupt / error / NULL(普通)

-- chat_sessions 表
ALTER TABLE chat_sessions ADD COLUMN
    active_version INT NOT NULL DEFAULT 1;     -- 当前活跃版本号
```

#### 索引

```sql
CREATE INDEX idx_api ON chat_messages (session_id, to_api, version, created_at);
CREATE INDEX idx_frontend ON chat_messages (session_id, to_frontend, created_at);
```

#### 四种消息类型

| | to_api=true | to_api=false |
|---|---|---|
| **to_frontend=true** | 普通对话（user/assistant） | 事件标记（压缩完成、中断、断连等） |
| **to_frontend=false** | 系统注入（压缩摘要等 LLM 需要的，不限 role） | 暂无（预留） |

`to_frontend=false` 不限于 system role。未来可能注入 user 角色的消息给 LLM 但不给用户看到（如自动补充的偏好提示）。

#### 查询路径

```sql
-- LLM context：当前版本 + to_api=true
SELECT * FROM chat_messages
WHERE session_id = ? AND to_api = TRUE AND version = ?
ORDER BY created_at;

-- 前端展示：to_frontend=true
SELECT * FROM chat_messages
WHERE session_id = ? AND to_frontend = TRUE
ORDER BY created_at;
```

#### 写入

```sql
-- 追加一条消息
INSERT INTO chat_messages (session_id, role, content, version, to_api, to_frontend, ...)
VALUES (?, ?, ?, ?, ?, ?, ...);
```

单条 INSERT，O(1)。不再有 DELETE+INSERT 的全量覆写。

#### Version 机制

- 压缩不删旧消息
- 压缩完成后 `active_version += 1`
- 保留的近期消息 UPDATE `version = active_version`
- 旧消息 version 低于 active_version，自动被 API 查询过滤
- 如果未来需要回滚，切 `active_version` 即可

---

### 2.3 三条存储方法：Go 必须实现的

Python 版砍掉了 `SessionManager` 的所有方法，但**没有实现替代者**。以下三个是 Go 版必须实现的：

```go
// 1. 保存一条消息
func (s *Storage) SaveMessage(ctx context.Context, sessionID string, msg *Message) error {
    // INSERT chat_messages 单条
    // 参数：session_id, role, content, version, to_api, to_frontend, event_type, metadata
}

// 2. 为 LLM 加载消息（带版本过滤）
func (s *Storage) LoadMessagesForAPI(ctx context.Context, sessionID string, version int) ([]*Message, error) {
    // SELECT WHERE session_id=? AND to_api=true AND version=?
    // ORDER BY created_at
}

// 3. 为前端加载消息
func (s *Storage) LoadMessagesForFrontend(ctx context.Context, sessionID string) ([]*Message, error) {
    // SELECT WHERE session_id=? AND to_frontend=true
    // ORDER BY created_at
}
```

### 2.4 Session 对象设计（关键区别）

Python 版的 `Session`（Pydantic）**不应该再持有 `messages` 字段**。Session 是纯元数据对象（id, user_id, novel_id, model, usage, title 等）。消息通过上面的三个方法从 DB 独立查询。

```
Session (元数据):
    session_id, user_id, novel_id, title, model
    reasoning_effort, edit_mode, created_at, updated_at
    active_version, usage

Message (独立存储，Session 不持有):
    id, session_id, role, content, version
    to_api, to_frontend, event_type
    created_at, token_count, extra_metadata
```

---

### 2.5 压缩（全部未实现）

Python 版把 `ContextCompressor` 整类删除了，但**没有实现替代者**。这是压缩的完整方案参考：

**触发**：`agent_loop` 循环开头检测 `usage_ratio >= 80%`

**流程**：
1. 在 messages 末尾追加一条 system 消息（压缩提示词，5 sections）
2. LLM 基于全量上下文生成结构化摘要
3. 移除刚才追加的压缩提示词
4. 重建 messages（消息保留规则）
5. 发送 WS `compression_done` 事件
6. DB 写入：插入摘要 system 消息（to_api=true, to_frontend=false）+ 插入边界事件（to_api=false, to_frontend=true, event_type=compression）
7. `active_version += 1`
8. 保留的近期消息 UPDATE `version = active_version`

**消息重建规则**：
- 保留最近 10-20 条 user 消息 + 最近 4-6 条对话（维持连贯性）
- 其余替换为摘要（system role，放在最末尾）
- 摘要每次压缩都替换为最新一条，不堆积

**异常处理**：
- 压缩失败 → 保持原 messages，下次继续尝试
- 用户取消 → messages 保持压缩前状态

**详细参考**：`python-master/docs/refactor/context-compression-design.md`

---

### 2.6 编辑协作重构（全部未实现）

当前编辑模式的问题和设计文档在 `python-master/docs/refactor/edit-collaboration.md`，核心要点：

- 用户自己编辑也应该走副本（而不是直接改原件）
- AI 编辑 + 用户手动编辑应共享同一个副本
- 副本生命周期：创建 → 修改（AI/用户） → 接受/拒绝 → 合并到原件或丢弃
- 接受/拒绝后的 `latest_pending_edit_session_id` 字段已确认无意义（一个章节只有一个活跃副本）

---

### 2.7 其他待实现项

| 项 | 优先级 | 说明 |
|----|--------|------|
| Message `to_frontend` 过滤前端消息 | 高 | system 消息不暴露给用户，详见 2.2 |
| 消息按 version 查询（API vs 前端双路径） | 高 | 详见 2.2 |
| 增量写入（单条 INSERT） | 高 | 取代 DELETE+INSERT |
| 压缩 | 高 | 详见 2.5 |
| session.usage 补全 `context_window` | 中 | 便于前端 ContextRing 恢复 |
| 编辑协作重构 | 中 | 用户编辑走副本 |
| _running_tokens 在压缩后重建 | 中 | 压缩后 token 计数不准 |
| 自动标题生成 | 中 | Python 版已实现，Go 同样需要 |

---

## 三、Go 版实现建议

### 存储层

SQLite 表结构：

```sql
CREATE TABLE sessions (
    session_id      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL DEFAULT 1,  -- 单用户
    novel_id        INTEGER NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    model           TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    reasoning_effort TEXT,
    edit_mode       TEXT NOT NULL DEFAULT 'agent',
    chapter_ids     TEXT NOT NULL DEFAULT '[]',  -- JSON array
    current_chapter_id INTEGER,
    active_version  INTEGER NOT NULL DEFAULT 1,
    usage           TEXT,                        -- JSON dict
    created_at      TEXT NOT NULL,               -- ISO8601
    updated_at      TEXT NOT NULL
);

CREATE TABLE messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(session_id),
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    to_api          INTEGER NOT NULL DEFAULT 1,
    to_frontend     INTEGER NOT NULL DEFAULT 1,
    event_type      TEXT,
    token_count     INTEGER NOT NULL DEFAULT 0,
    extra_metadata  TEXT,                        -- JSON dict
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_messages_api ON messages(session_id, to_api, version, created_at);
CREATE INDEX idx_messages_frontend ON messages(session_id, to_frontend, created_at);
```

### 三条存储方法

```go
// 保存一条消息（单条 INSERT）
func (s *Storage) SaveMessage(ctx, sessionID string, msg *Message) error

// LLM context 查询
func (s *Storage) LoadMessagesForAPI(ctx, sessionID string, opts ...QueryOption) ([]*Message, error)

// 前端展示查询
func (s *Storage) LoadMessagesForFrontend(ctx, sessionID string) ([]*Message, error)
```

### Session 元数据对象

```go
type Session struct {
    SessionID       string
    UserID          int
    NovelID         int
    Title           string
    Model           string
    ReasoningEffort string
    EditMode        string
    ChapterIDs      []int       // JSON serialized
    CurrentChapterID int
    ActiveVersion   int
    Usage           *UsageStats // JSON serialized
    CreatedAt       time.Time
    UpdatedAt       time.Time
}
```

`Session` 不持有 `Messages`。消息通过 `LoadMessagesForAPI` / `LoadMessagesForFrontend` 按需查询。

### Session 生命周期

```
用户发第一条消息
  → Session 不存在 → 创建 Session（INSERT sessions）
  → 创建第一条 Message（INSERT messages）
  → LLM 处理 → 生成消息 → SaveMessage()
  → Turn 结束 → Update session.usage

用户加载已有会话
  → LoadSession(metadata from sessions table)
  → LoadMessagesForFrontend(recent messages)
  → 前端重建历史 turns

用户继续对话
  → LLM 新的回合
  → SaveMessage() 追加每条消息
  → Turn 结束 → Update session.usage
```
