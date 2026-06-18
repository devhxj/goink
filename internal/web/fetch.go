package web

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/PuerkitoBio/goquery"
)

const (
	fetchTimeout   = 30 * time.Second
	fetchMaxChars  = 32000
	fetchMaxBytes  = 10 << 20 // 10 MB
	fetchUserAgent = "Goink/1.0 (AI writing assistant; web fetch tool)"
)

// FetchResult 是网页抓取结果。
type FetchResult struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Text  string `json:"text"`
}

// Fetch 抓取指定 URL 的网页内容，清洗后返回 markdown。
func Fetch(rawURL string) (*FetchResult, error) {
	u, err := parseAndValidate(rawURL)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Timeout: fetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("重定向次数过多")
			}
			if err := validateHost(req.URL.Host); err != nil {
				return fmt.Errorf("重定向目标不安全: %w", err)
			}
			return nil
		},
	}

	req, err := http.NewRequest("GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", fetchUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, fetchMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}
	if len(body) > fetchMaxBytes {
		return nil, fmt.Errorf("网页过大，超过 %d MB", fetchMaxBytes>>20)
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("解析 HTML 失败: %w", err)
	}

	title := strings.TrimSpace(doc.Find("title").First().Text())

	doc.Find("script, style, nav, iframe, noscript, svg, head, footer, " +
		"[role=\"navigation\"], [role=\"banner\"], [role=\"contentinfo\"], " +
		".sidebar, .nav, .footer, .header, .menu, .ad, .advertisement").Remove()

	contentSel := doc.Find("body")
	if contentSel.Length() == 0 {
		contentSel = doc.Find("html")
	}

	contentHTML, err := contentSel.Html()
	if err != nil {
		return nil, fmt.Errorf("提取正文失败: %w", err)
	}

	converter := md.NewConverter("", true, nil)
	text, err := converter.ConvertString(contentHTML)
	if err != nil {
		return nil, fmt.Errorf("转换 markdown 失败: %w", err)
	}

	text = strings.TrimSpace(text)
	if len([]rune(text)) > fetchMaxChars {
		runes := []rune(text)
		text = string(runes[:fetchMaxChars]) + "\n\n...[内容已截断]"
	}

	return &FetchResult{
		URL:   rawURL,
		Title: title,
		Text:  text,
	}, nil
}

func parseAndValidate(rawURL string) (*url.URL, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("URL 格式无效: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("仅支持 http/https")
	}
	if u.Host == "" {
		return nil, fmt.Errorf("URL 缺少主机名")
	}
	if u.User != nil {
		return nil, fmt.Errorf("URL 不允许包含用户信息")
	}
	if err := validateHost(u.Host); err != nil {
		return nil, err
	}
	return u, nil
}

func validateHost(host string) error {
	// 去掉端口
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}

	// 阻止云 metadata 端点
	blocked := map[string]bool{
		"169.254.169.254":            true,
		"metadata.google.internal":   true,
		"metadata.tencentyun.com":    true,
		"100.100.100.200":            true,
	}
	if blocked[host] {
		return fmt.Errorf("禁止访问该地址")
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("DNS 解析失败: %w", err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("DNS 解析无结果")
	}

	for _, ip := range ips {
		if isPrivate(ip) {
			return fmt.Errorf("禁止访问内网地址: %s", ip)
		}
	}

	return nil
}

func isPrivate(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsPrivate()
}
