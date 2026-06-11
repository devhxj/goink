package app

import (
	"novel/internal/reader"
	"novel/internal/storage"
)

// GetReaderPerspectives 返回指定小说的全部读者认知条目，按 planted_chapter 升序排列。
func (a *App) GetReaderPerspectives(novelID int64) ([]reader.ReaderPerspective, error) {
	var all []reader.ReaderPerspective
	page := 1
	for {
		result, err := a.reader.ListByNovel(a.ctx, novelID, reader.ListByNovelOptions{
			PageParams: storage.PageParams{Page: page, Size: 100},
		})
		if err != nil {
			return nil, err
		}
		all = append(all, result.Items...)
		if page >= result.TotalPages {
			break
		}
		page++
	}
	return all, nil
}
