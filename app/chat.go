package app

import "fmt"

// Chat 是对话入口。agent loop 实现后替换此实现。
func (a *App) Chat(sessionID int64, message string) (string, error) {
	return "", fmt.Errorf("agent loop 暂未实现")
}
