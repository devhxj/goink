package app

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"novel/internal/config"
	"novel/internal/storage"
)

// GetAppConfig 返回当前运行时配置信息（供前端诊断）。
func (a *App) GetAppConfig() map[string]any {
	if a.cfg == nil {
		return map[string]any{"initialized": false}
	}
	return map[string]any{
		"initialized": true,
		"data_dir":    a.cfg.DataDir,
	}
}

// UpdateDataDir 更改数据目录并重新初始化所有运行时模块。
//
// TODO: 实现数据迁移——更改目录时自动将旧目录中的数据文件移动到新目录。
// 同盘用 os.Rename（原子），跨盘用递归拷贝+进度回调，目标非空时弹确认框。
func (a *App) UpdateDataDir(newPath string) error {
	if newPath == "" {
		return fmt.Errorf("数据目录路径不能为空")
	}

	// 关闭旧数据库
	if a.db != nil {
		if err := storage.Close(a.db); err != nil {
			return fmt.Errorf("关闭旧数据库失败: %w", err)
		}
		a.db = nil
	}

	// 保存新配置
	if err := config.Save(newPath); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	// 重新加载并初始化
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("加载新配置失败: %w", err)
	}

	a.initWithConfig(cfg)
	a.logger.Info("数据目录已更改", "data_dir", cfg.DataDir)
	return nil
}

// GetPlatform 返回平台信息，供前端决定默认路径等行为。
func (a *App) GetPlatform() map[string]any {
	info := map[string]any{
		"os":          runtime.GOOS,
		"defaultPath": defaultDataDir(),
	}
	return info
}

// defaultDataDir 根据平台返回默认数据目录。
// Windows: 检测 D/E 盘是否存在，否则回退到用户目录。
// 其他平台: ~/.goink。
func defaultDataDir() string {
	if runtime.GOOS == "windows" {
		for _, drive := range []string{"D:", "E:", "C:"} {
			root := drive + string(filepath.Separator)
			if _, err := os.Stat(root); err == nil {
				return filepath.Join(root, "Goink")
			}
		}
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".goink")
}
