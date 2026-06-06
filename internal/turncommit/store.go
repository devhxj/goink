package turncommit

import (
	"context"
	"fmt"
	"log/slog"

	"gorm.io/gorm"
)

// Store 管理 turn_commits 表的读写。
type Store struct {
	DB     *gorm.DB
	logger *slog.Logger
}

// NewStore 创建 Store 实例。
func NewStore(db *gorm.DB, logger *slog.Logger) *Store {
	return &Store{DB: db, logger: logger}
}

// ListForRollback 查询 [targetTurn, lastTurn] 区间内所有 git commit，
// 按 turn_id ASC, id ASC 返回（即时间正序，传给 Revert 时外部会逆序）。
// 与 storage.RollbackTo 的语义和签名完全对齐。
func (s *Store) ListForRollback(ctx context.Context, sessionID string, targetTurn int) ([]TurnCommit, error) {
	var lastTurn int
	if err := s.DB.WithContext(ctx).
		Raw("SELECT last_turn_id FROM sessions WHERE session_id = ?", sessionID).
		Scan(&lastTurn).Error; err != nil {
		return nil, fmt.Errorf("turncommit store: get last_turn_id: %w", err)
	}
	if lastTurn < targetTurn {
		return nil, nil
	}

	var commits []TurnCommit
	if err := s.DB.WithContext(ctx).
		Where("session_id = ? AND turn_id >= ? AND turn_id <= ?", sessionID, targetTurn, lastTurn).
		Order("turn_id ASC, id ASC").
		Find(&commits).Error; err != nil {
		return nil, fmt.Errorf("turncommit store: list for rollback: %w", err)
	}
	return commits, nil
}
