import { useCallback, useState } from 'react'
import { AlertTriangle, Check, Clipboard, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyTextToClipboard } from '@/lib/clipboard'
import type { diagnostics } from '@/lib/novelist/types'
import { cn } from '@/lib/utils'

type CopyState = 'idle' | 'copied' | 'failed'

interface ErrorCalloutProps {
  message: string
  diagnostic?: diagnostics.CopyableDiagnostic | null
  title?: string
  className?: string
  compact?: boolean
  retrying?: boolean
  retryLabel?: string
  onRetry?: () => void
  onClose?: () => void
}

export default function ErrorCallout({
  message,
  diagnostic,
  title = '操作失败',
  className,
  compact = false,
  retrying = false,
  retryLabel = '重试',
  onRetry,
  onClose,
}: ErrorCalloutProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const copyDiagnostic = useCallback(async () => {
    if (!diagnostic) return
    try {
      await copyTextToClipboard(JSON.stringify(diagnostic, null, 2))
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }, [diagnostic])

  const copyLabel = copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制诊断'

  return (
    <section
      role="alert"
      className={cn(
        'border border-danger-border bg-danger-bg text-foreground',
        compact ? 'px-2.5 py-2 text-xs' : 'px-3 py-3 text-sm',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className={cn('mt-0.5 shrink-0 text-destructive', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        <div className="min-w-0 flex-1">
          {title && <div className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>{title}</div>}
          <div className={cn('break-words', title ? 'mt-0.5' : '')}>{message}</div>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size={compact ? 'icon-xs' : 'icon-sm'}
            aria-label="关闭错误提示"
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X />
          </Button>
        )}
      </div>

      {(diagnostic || onRetry) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {diagnostic && (
            <Button
              type="button"
              variant="outline"
              size={compact ? 'xs' : 'sm'}
              onClick={() => { void copyDiagnostic() }}
              aria-label="复制错误诊断"
            >
              {copyState === 'copied' ? <Check /> : <Clipboard />}
              {copyLabel}
            </Button>
          )}
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size={compact ? 'xs' : 'sm'}
              onClick={onRetry}
              disabled={retrying}
            >
              <RefreshCw className={retrying ? 'animate-spin' : ''} />
              {retryLabel}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
