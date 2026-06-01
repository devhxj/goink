package mcp_tools

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"novel/internal/git"
)

// ── edit ──────────────────────────────────────────────────

// EditArgs 是 edit 工具的参数。
type EditArgs struct {
	Path       string `json:"path" jsonschema:"required,description=要编辑的文件路径。章节文件格式为 chapters/001.md（三位数字），故事状态为 goink.md" validate:"required"`
	ChangeType string `json:"change_type" jsonschema:"required,enum=full_replace,enum=search_replace,enum=line_range_replace,description=编辑方式。full_replace：全文替换；search_replace：查找并替换指定文本；line_range_replace：替换指定行范围" validate:"required,oneof=full_replace search_replace line_range_replace"`
	SearchText string `json:"search_text" jsonschema:"description=要查找的原文片段（search_replace 时必填）。请从文件中精确复制" validate:"omitempty"`
	NewContent string `json:"new_content" jsonschema:"description=新内容。full_replace 时为完整全文；search_replace 时为替换后的文本；line_range_replace 时为插入的新行" validate:"omitempty"`
	ReplaceAll bool   `json:"replace_all" jsonschema:"description=是否替换所有匹配项。默认 false（仅替换第一个匹配）" validate:"omitempty"`
	StartLine  int    `json:"start_line" jsonschema:"description=起始行号 1-based 含此行（line_range_replace 时必填）" validate:"omitempty,min=1"`
	EndLine    int    `json:"end_line" jsonschema:"description=结束行号 1-based 含此行（line_range_replace 时必填）" validate:"omitempty,min=1"`
	Reason     string `json:"reason" jsonschema:"description=修改原因，供人类审阅" validate:"omitempty"`
}

// EditTool 编辑文件（章节或故事状态），支持全文替换、查找替换、行范围替换。
// 修改在内存中完成后生成 git diff 提交审批，通过后写入文件。
type EditTool struct{}

func (t *EditTool) Name() string           { return "edit" }
func (t *EditTool) Description() string    { return editDescription }
func (t *EditTool) Category() ToolCategory { return CategoryWritingAssistant }

func (t *EditTool) JSONSchema() json.RawMessage { return SchemaOf(EditArgs{}) }
func (t *EditTool) ExposeToLLM() bool           { return true }
func (t *EditTool) NewArgs() any                { return &EditArgs{} }

func (t *EditTool) Execute(ctx context.Context, args any, tc ToolContext) (*ToolResult, error) {
	a := args.(*EditArgs)

	// 1. 校验路径格式
	if !validPath(a.Path) {
		return &ToolResult{Success: false, Error: "无效文件路径，支持 chapters/001.md ~ chapters/999999.md 和 goink.md"}, nil
	}

	// 2. 读取当前文件
	current, err := git.ReadFile(tc.NovelID, a.Path)
	if err != nil {
		return &ToolResult{Success: false, Error: fmt.Sprintf("读取文件失败: %s", err.Error())}, nil
	}

	// 3. 根据 change_type 生成新内容
	proposed, err := applyChange(a, current)
	if err != nil {
		return &ToolResult{Success: false, Error: fmt.Sprintf("编辑操作失败: %s", err.Error())}, nil
	}

	if proposed == current {
		return &ToolResult{
			Success: true,
			Data:    map[string]any{"path": a.Path, "message": "内容未变化，跳过"},
		}, nil
	}

	// 4. 生成 git diff
	repo, err := git.New(tc.NovelID)
	if err != nil {
		return nil, fmt.Errorf("open git repo: %w", err)
	}
	diff, err := repo.DiffContent(a.Path, proposed)
	if err != nil {
		return nil, fmt.Errorf("compute diff: %w", err)
	}

	// 5. 审批（阻塞等待用户确认）
	if tc.Approver != nil {
		approval, err := tc.Approver.RequestApproval(ctx, tc.ToolID, map[string]any{
			"path":        a.Path,
			"diff":        diff,
			"change_type": a.ChangeType,
			"reason":      a.Reason,
		})
		if err != nil {
			return &ToolResult{Success: false, Error: "审批异常: " + err.Error(), BreakLoop: true}, nil
		}
		if !approval.Approved {
			msg := "用户拒绝了修改"
			if approval.Feedback != "" {
				msg += ": " + approval.Feedback
			}
			return &ToolResult{Success: false, Error: msg, BreakLoop: true}, nil
		}
	}

	// 6. 写入文件
	if err := git.WriteFile(tc.NovelID, a.Path, proposed); err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}

	// 7. inject 维护提醒（章节全量替换且 >500 字时）
	var injects []InjectMessage
	if a.ChangeType == "full_replace" && isChapterPath(a.Path) && len([]rune(proposed)) > 500 {
		chapNum := parseChapterNum(a.Path)
		injects = []InjectMessage{{
			Role:    "user",
			Content: fmt.Sprintf("你刚刚完成了第%d章的全量替换。请执行以下维护操作：\n1. 检查并更新角色设定（性格变化、新能力、身份转变等）\n2. 更新故事时间线（伏笔回收、新伏笔记录、章节计划推进）\n3. 更新读者认知（新悬念、已回收悬念）\n4. 更新故事弧线节点进度\n完成后向用户汇报修改摘要。", chapNum),
		}}
	}

	display := a.Path
	if isChapterPath(a.Path) {
		display = fmt.Sprintf("第%d章", parseChapterNum(a.Path))
	}

	return &ToolResult{
		Success: true,
		Data: map[string]any{
			"path":        a.Path,
			"display":     display,
			"diff":        diff,
			"change_type": a.ChangeType,
		},
		Inject: injects,
	}, nil
}

// ── 编辑操作 ──────────────────────────────────────────────

func applyChange(a *EditArgs, current string) (string, error) {
	switch a.ChangeType {
	case "full_replace":
		return a.NewContent, nil

	case "search_replace":
		if a.SearchText == "" {
			return "", fmt.Errorf("search_replace 模式需要提供 search_text")
		}
		result, found := searchReplace(current, a.SearchText, a.NewContent, a.ReplaceAll)
		if !found {
			return "", fmt.Errorf("未找到匹配文本，请用精确文本重试")
		}
		return result, nil

	case "line_range_replace":
		if a.StartLine <= 0 || a.EndLine <= 0 {
			return "", fmt.Errorf("line_range_replace 模式需要提供 start_line 和 end_line")
		}
		if a.StartLine > a.EndLine {
			return "", fmt.Errorf("start_line 不能大于 end_line")
		}
		return lineRangeReplace(current, a.StartLine, a.EndLine, a.NewContent)

	default:
		return "", fmt.Errorf("未知的 change_type: %s", a.ChangeType)
	}
}

// searchReplace 在 content 中查找 searchText 并替换为 newContent。
// replaceAll=false 时仅替换第一个匹配。返回修改后的内容和是否找到匹配。
func searchReplace(content, searchText, newContent string, replaceAll bool) (string, bool) {
	searchText = strings.TrimRight(searchText, "\n")

	// 精确匹配
	if strings.Contains(content, searchText) {
		n := 1
		if replaceAll {
			n = -1
		}
		return strings.Replace(content, searchText, newContent, n), true
	}

	// TrimSpace 兜底：LLM 多复制了首尾空白时仍能匹配
	trimmedSearch := strings.TrimSpace(searchText)
	if trimmedSearch != searchText && strings.Contains(content, trimmedSearch) {
		n := 1
		if replaceAll {
			n = -1
		}
		return strings.Replace(content, trimmedSearch, newContent, n), true
	}

	return "", false
}

// lineRangeReplace 替换 [startLine, endLine] 区间（1-based，含两端）。
func lineRangeReplace(content string, startLine, endLine int, newContent string) (string, error) {
	lines := strings.Split(content, "\n")
	if startLine < 1 || endLine > len(lines) {
		return "", fmt.Errorf("行号超出范围: start=%d end=%d 总行数=%d", startLine, endLine, len(lines))
	}

	var result []string
	result = append(result, lines[:startLine-1]...)
	if newContent != "" {
		result = append(result, strings.Split(newContent, "\n")...)
	}
	result = append(result, lines[endLine:]...)
	return strings.Join(result, "\n"), nil
}

// ── 路径校验 ──────────────────────────────────────────────

var pathRe = regexp.MustCompile(`^(chapters/\d{1,6}\.md|goink\.md)$`)

func validPath(p string) bool {
	return pathRe.MatchString(p)
}

func isChapterPath(p string) bool {
	return strings.HasPrefix(p, "chapters/")
}

func parseChapterNum(p string) int {
	var n int
	fmt.Sscanf(p, "chapters/%d.md", &n)
	return n
}

// ── 工具描述 ──────────────────────────────────────────────

const editDescription = `编辑小说文件（章节正文或故事状态 goink.md）。支持三种编辑模式：

1. **full_replace** — 全文替换整个文件。new_content 为完整的替换后内容。
2. **search_replace** — 查找并替换指定文本。search_text 为要查找的原文片段（请从文件中精确复制），new_content 为替换后的文本。replace_all=false（默认）仅替换第一个匹配项，replace_all=true 替换所有匹配。
3. **line_range_replace** — 替换指定行范围。start_line 和 end_line 为 1-based 行号（含两端），new_content 为插入的新内容。

路径格式：
- chapters/001.md ~ chapters/999999.md（三位数字补齐的章节文件）
- goink.md（故事状态文档）
只接受上述相对路径。
所有修改会先生成 git diff 提交用户审批，审批通过后才写入文件。被拒绝则本轮对话终止。`

// ── 注册 ──────────────────────────────────────────────────

// RegisterEditingTools 注册编辑类工具。
func RegisterEditingTools(r *Registry) {
	r.Register(&EditTool{})
}
