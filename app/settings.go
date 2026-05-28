package app

import (
	"novel/internal/config"
)

// ── 设置 ──────────────────────────────────────────────────

// GetSettings 返回运行时配置。
func (a *App) GetSettings() (*config.AppSettings, error) {
	return a.settings, nil
}

// SaveSettings 保存运行时配置。
func (a *App) SaveSettings(apiKey, defaultModel string) error {
	a.settings.APIKey = apiKey
	a.settings.DefaultModel = defaultModel
	return config.SaveSettings(a.db, a.settings)
}
