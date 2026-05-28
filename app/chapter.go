package app

import (
	"novel/internal/chapter"
)

// ── 章节 ──────────────────────────────────────────────────

// GetChapters 返回指定小说的章节列表。
func (a *App) GetChapters(novelID int64) ([]chapter.Chapter, error) {
	result, err := a.chapter.ListByNovel(a.ctx, novelID, chapter.ListByNovelOptions{})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}
