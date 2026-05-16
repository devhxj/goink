import { Popover } from 'antd'
import type { UsageMsg } from '@/services/wsEditorService'
import styles from './ContextRing.module.css'

function ringColor(ratio: number): string {
  if (ratio >= 90) return '#e74c3c'
  if (ratio >= 80) return '#f39c12'
  return '#52c41a'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

const DETAIL_LABELS: Record<string, string> = {
  system: '系统上下文',
  user: '用户输入',
  assistant: 'AI 输出',
  tool: '工具结果',
}

function PopoverContent({ usage }: { usage: UsageMsg }) {
  const ratio = Math.min(usage.usage_ratio, 100)
  const cw = usage.context_window || 1

  return (
    <div className={styles.popover}>
      <div className={styles.popTitle}>
        上下文占用: {ratio.toFixed(1)}%
      </div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${ratio}%`, backgroundColor: ringColor(ratio) }} />
      </div>
      <div className={styles.popTotal}>
        已用: {formatTokens(usage.total_tokens)}
        {' · '}总大小: {formatTokens(cw)}
      </div>
      {usage.detail && (
        <div className={styles.breakdown}>
          {Object.entries(DETAIL_LABELS).map(([key, label]) => {
            const count = usage.detail![key as keyof typeof usage.detail] || 0
            return (
              <div key={key} className={styles.breakRow}>
                <span className={styles.breakLabel}>{label}</span>
                <span className={styles.breakTokens}>
                  {formatTokens(count)}
                  <span className={styles.breakPct}>
                    {' '}{(cw > 0 ? (count / cw * 100).toFixed(1) : '0.0')}%
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ContextRing({ usage }: { usage: UsageMsg | null }) {
  if (!usage || !usage.context_window || !usage.total_tokens) return null

  const ratio = Math.min(usage.usage_ratio, 100)
  const r = 18
  const circumference = 2 * Math.PI * r
  const offset = circumference - (ratio / 100) * circumference
  const color = ringColor(ratio)

  return (
    <Popover
      content={<PopoverContent usage={usage} />}
      trigger="hover"
      placement="topRight"
    >
      <span className={styles.ring}>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle cx={22} cy={22} r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={3} />
          <circle
            cx={22} cy={22} r={r} fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
          />
        </svg>
        <span className={styles.label} style={{ color }}>{ratio.toFixed(0)}%</span>
      </span>
    </Popover>
  )
}
