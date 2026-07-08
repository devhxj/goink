import { useState } from 'react'
import ErrorCallout from '@/components/shared/ErrorCallout'
import { buildCopyableDiagnostic, diagnosticMessage } from '@/lib/diagnostics'
import type { diagnostics } from '@/lib/novelist/types'

interface Props {
  open: boolean
  novelId?: number | null
  novelTitle: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function NovelDeleteDialog({ open, novelId = null, novelTitle, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [errorDiagnostic, setErrorDiagnostic] = useState<diagnostics.CopyableDiagnostic | null>(null)

  function handleClose() {
    setConfirmText('')
    setDeleting(false)
    onClose()
  }

  if (!open) return null

  const canDelete = confirmText === novelTitle

  async function handleDelete() {
    if (!canDelete || deleting) return
    setDeleting(true)
    setError('')
    setErrorDiagnostic(null)
    try {
      await onConfirm()
    } catch (e: unknown) {
      const fallbackMessage = '删除作品失败'
      setError(diagnosticMessage(e, fallbackMessage))
      setErrorDiagnostic(buildCopyableDiagnostic({
        error: e,
        fallbackMessage,
        operation: 'DeleteNovel',
        bridgeMethod: 'DeleteNovel',
        detail: {
          phase: 'delete_novel_dialog',
          novel_id: novelId ?? null,
          title: novelTitle,
        },
      }))
    } finally {
      setDeleting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') handleClose()
    if (e.key === 'Enter' && canDelete) handleDelete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-background rounded-xl shadow-2xl border w-[420px] max-w-[90vw] p-6">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          ✕
        </button>

        <h2 className="text-base font-semibold text-destructive mb-3">删除作品</h2>

        {error && (
          <ErrorCallout
            compact
            title="删除作品失败"
            message={error}
            diagnostic={errorDiagnostic}
            className="mb-3 rounded-md"
            onClose={() => {
              setError('')
              setErrorDiagnostic(null)
            }}
          />
        )}

        <p className="text-sm text-muted-foreground mb-1">
          删除后书籍文件和所有章节将<b className="text-foreground">永久丢失</b>，不可恢复。
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          请输入书名 <b className="text-foreground">{novelTitle}</b> 确认删除：
        </p>

        <input
          type="text" value={confirmText} autoFocus
          onChange={e => setConfirmText(e.target.value)}
          placeholder="输入书名确认"
          className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mb-5"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="h-9 px-4 rounded-md text-sm border hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="h-9 px-4 rounded-md text-sm bg-destructive text-destructive-foreground hover:bg-destructive/85 transition-colors disabled:opacity-50"
          >
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
