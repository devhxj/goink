package git

import (
	"fmt"
	"os"
	"path/filepath"

	"novel/internal/config"
)

// ── 文件路径 ──────────────────────────────────────────────

func ChapterPath(num int) string {
	return fmt.Sprintf("chapters/%03d.md", num)
}

func GoinkPath() string {
	return "goink.md"
}

// ── 文件读写 ──────────────────────────────────────────────
// 文件不存在的时候返回错误，调用方可以针对文件不存在返回空内容，底层工具保持通用，不直接返回空。

func ReadChapter(novelID int64, num int) (string, error) {
	return readFile(novelID, ChapterPath(num))
}

func WriteChapter(novelID int64, num int, content string) error {
	return writeFile(novelID, ChapterPath(num), content)
}

func ReadGoink(novelID int64) (string, error) {
	return readFile(novelID, GoinkPath())
}

func WriteGoink(novelID int64, content string) error {
	return writeFile(novelID, GoinkPath(), content)
}

func novelDir(novelID int64) (string, error) {
	cfg := config.Get()
	if cfg == nil {
		return "", fmt.Errorf("git: config not initialized")
	}
	return cfg.NovelDirPath(novelID), nil
}

func readFile(novelID int64, relPath string) (string, error) {
	dir, err := novelDir(novelID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(dir, relPath))
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %s", os.ErrNotExist, relPath)
		}
		return "", fmt.Errorf("git: read %s: %w", relPath, err)
	}
	return string(data), nil
}

func writeFile(novelID int64, relPath, content string) error {
	dir, err := novelDir(novelID)
	if err != nil {
		return err
	}
	fullPath := filepath.Join(dir, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("git: mkdir for %s: %w", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("git: write %s: %w", relPath, err)
	}
	return nil
}
