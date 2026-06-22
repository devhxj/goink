package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// DiscoverModels 调用 /models 端点自动发现可用模型列表。
// 从 chatURL 推导 modelsURL（去掉 /chat/completions，拼接 /models），
// 解析标准 OpenAI 格式及 Kimi 等扩展字段。返回的 ModelInfo 中未获取到的字段留零值。
func DiscoverModels(ctx context.Context, chatURL, apiKey string) ([]ModelInfo, error) {
	baseURL := strings.TrimSuffix(chatURL, "/chat/completions")
	baseURL = strings.TrimSuffix(baseURL, "/")
	modelsURL := baseURL + "/models"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		errBody := make([]byte, 1024)
		n, _ := resp.Body.Read(errBody)
		return nil, fmt.Errorf("[%d] %s", resp.StatusCode, string(errBody[:n]))
	}

	var result struct {
		Data []struct {
			ID                string `json:"id"`
			ContextLength     int    `json:"context_length"`
			SupportsImageIn   *bool  `json:"supports_image_in"`
			SupportsVideoIn   *bool  `json:"supports_video_in"`
			SupportsReasoning *bool  `json:"supports_reasoning"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}

	models := make([]ModelInfo, 0, len(result.Data))
	for _, item := range result.Data {
		if item.ID == "" {
			continue
		}
		m := ModelInfo{
			ID:   item.ID,
			Name: modelIDToName(item.ID),
		}
		if item.ContextLength > 0 {
			m.ContextWindow = item.ContextLength
		}
		if item.SupportsReasoning != nil {
			m.SupportsThinking = *item.SupportsReasoning
		}
		if item.SupportsImageIn != nil {
			m.SupportsVision = *item.SupportsImageIn
		} else if item.SupportsVideoIn != nil && *item.SupportsVideoIn {
			m.SupportsVision = true
		}
		models = append(models, m)
	}

	return models, nil
}

// modelIDToName 将模型 ID 转为显示名称：首字母大写，- 替换为空格。
func modelIDToName(id string) string {
	s := strings.ReplaceAll(id, "-", " ")
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
