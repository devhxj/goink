import { useState, useCallback } from 'react'
import { ArrowUp, Square, Check, X } from 'lucide-react'

interface ApprovalState {
  path: string
  changeType: string
}

interface Props {
  disabled: boolean
  isLoading: boolean
  placeholder: string
  onSend: (message: string) => void
  onStop: () => void
  approval: ApprovalState | null
  onApprove: (feedback: string) => void
  onReject: (feedback: string) => void
}

export default function ChatInput({ disabled, isLoading, placeholder, onSend, onStop, approval, onApprove, onReject }: Props) {
  const [hasContent, setHasContent] = useState(false)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const textarea = e.currentTarget as HTMLTextAreaElement
      const value = textarea.value.trim()
      if (value && !disabled) {
        onSend(value)
        textarea.value = ''
        textarea.style.height = 'auto'
        setHasContent(false)
      }
    }
  }, [disabled, onSend])

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = 'auto'
    target.style.height = Math.min(target.scrollHeight, 180) + 'px'
    setHasContent(target.value.trim().length > 0)
  }, [])

  const handleSendClick = useCallback(() => {
    const textarea = document.getElementById('chat-input-textarea') as HTMLTextAreaElement | null
    if (!textarea) return
    const value = textarea.value.trim()
    if (value && !disabled) {
      onSend(value)
      textarea.value = ''
      textarea.style.height = 'auto'
      setHasContent(false)
    }
  }, [disabled, onSend])

  const handleStopClick = useCallback(() => {
    onStop()
  }, [onStop])

  const getFeedback = () => {
    const textarea = document.getElementById('chat-input-textarea') as HTMLTextAreaElement | null
    return textarea?.value.trim() ?? ''
  }

  const clearFeedback = () => {
    const textarea = document.getElementById('chat-input-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      textarea.value = ''
      textarea.style.height = 'auto'
      setHasContent(false)
    }
  }

  const handleApproveClick = useCallback(() => {
    const fb = getFeedback()
    clearFeedback()
    onApprove(fb)
  }, [onApprove])

  const handleRejectClick = useCallback(() => {
    const fb = getFeedback()
    clearFeedback()
    onReject(fb)
  }, [onReject])

  // 审批模式
  if (approval) {
    return (
      <div className="px-4 pt-2 shrink-0">
        <div className="flex items-end gap-2 bg-amber-50/50 rounded-2xl border border-amber-200 px-2 py-2">
          <textarea
            id="chat-input-textarea"
            placeholder="反馈（可选）..."
            disabled={false}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleApproveClick()
              }
            }}
            onInput={handleInput}
            className="flex-1 bg-transparent resize-none text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 py-2 px-2 min-h-[28px] max-h-[180px]"
          />
          <button
            onClick={handleRejectClick}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            拒绝
          </button>
          <button
            onClick={handleApproveClick}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            批准
          </button>
        </div>
      </div>
    )
  }

  // 正常模式
  return (
    <div className="px-4 pt-2 shrink-0">
      <div className="flex items-end gap-2 bg-muted/30 rounded-2xl border px-2 py-2">
        <textarea
          id="chat-input-textarea"
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className="flex-1 bg-transparent resize-none text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 disabled:text-muted-foreground/40 py-2 px-2 min-h-[28px] max-h-[180px]"
        />
        {isLoading && !hasContent ? (
          <button
            onClick={handleStopClick}
            className="w-[52px] h-[36px] min-w-[52px] flex items-center justify-center rounded-xl bg-red-500 text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/30 shrink-0"
          >
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button
            disabled={disabled || !hasContent}
            onClick={handleSendClick}
            className="w-[52px] h-[36px] min-w-[52px] flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/20 transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-amber-500/30 disabled:bg-muted disabled:text-muted-foreground/40 disabled:shadow-none disabled:hover:translate-y-0 shrink-0"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
