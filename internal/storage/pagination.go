package storage

// PageResult 泛型分页响应，匹配 Python PageResponse 的语义。
type PageResult[T any] struct {
	Items      []T   `json:"items"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	Size       int   `json:"size"`
	TotalPages int   `json:"total_pages"`
}

// PageParams 是所有 List 方法的分页参数，零值即可直接使用（Page=0 时 normalize 为 1）。
type PageParams struct {
	Page int `json:"page"`
	Size int `json:"size"`
}

// Normalize 补全默认值并限制上限。链式调用时直接返回自身便于内联。
func (p *PageParams) Normalize() *PageParams {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Size < 1 || p.Size > 100 {
		p.Size = 20
	}
	return p
}

// NewPageResult 根据 total/size 自动计算 TotalPages。
func NewPageResult[T any](items []T, total int64, page, size int) *PageResult[T] {
	tp := 0
	if size > 0 {
		tp = int(total) / size
		if int(total)%size != 0 {
			tp++
		}
	}
	return &PageResult[T]{
		Items:      items,
		Total:      total,
		Page:       page,
		Size:       size,
		TotalPages: tp,
	}
}
