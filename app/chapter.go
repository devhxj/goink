package app

import (
	"fmt"

	"novel/internal/chapter"
	"novel/internal/git"
)

// CreateChapterInput 是创建章节的入参。
type CreateChapterInput struct {
	NovelID int64  `json:"novel_id"`
	Title   string `json:"title"`
}

// SaveChapterContentInput 是保存章节正文的入参。
type SaveChapterContentInput struct {
	NovelID       int64  `json:"novel_id"`
	ChapterNumber int    `json:"chapter_number"`
	Content       string `json:"content"`
}

// ── 章节 ──────────────────────────────────────────────────

// GetChapters 返回指定小说的章节列表。
func (a *App) GetChapters(novelID int64) ([]chapter.Chapter, error) {
	result, err := a.chapter.ListByNovel(a.ctx, novelID, chapter.ListByNovelOptions{})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

// CreateChapter 创建新章节，章节号自动递增。同时创建空正文文件。
func (a *App) CreateChapter(input CreateChapterInput) (*chapter.Chapter, error) {
	latest, err := a.chapter.GetLatestNumber(a.ctx, input.NovelID)
	if err != nil {
		return nil, fmt.Errorf("failed to create chapter: %w", err)
	}

	ch := chapter.Chapter{
		NovelID:       input.NovelID,
		ChapterNumber: latest + 1,
		Title:         input.Title,
	}

	if err := a.chapter.DB.WithContext(a.ctx).Create(&ch).Error; err != nil {
		return nil, fmt.Errorf("failed to create chapter: %w", err)
	}

	if err := git.WriteChapter(input.NovelID, ch.ChapterNumber, ""); err != nil {
		return nil, fmt.Errorf("failed to create chapter: %w", err)
	}

	return &ch, nil
}

// GetChapterContent 返回章节正文。文件缺失时返回空字符串。
func (a *App) GetChapterContent(novelID int64, chapterNumber int) (string, error) {
	content, err := git.ReadChapter(novelID, chapterNumber)
	if err != nil {
		return "", nil
	}
	return content, nil
}

// SaveChapterContent 保存章节正文。
func (a *App) SaveChapterContent(input SaveChapterContentInput) error {
	if err := git.WriteChapter(input.NovelID, input.ChapterNumber, input.Content); err != nil {
		return fmt.Errorf("failed to save chapter content: %w", err)
	}
	return nil
}
