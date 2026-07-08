import { useState, useEffect } from 'react'
import { splitFrontmatter } from '@/components/content/types'
import ErrorCallout from '@/components/shared/ErrorCallout'
import { buildCopyableDiagnostic, diagnosticMessage } from '@/lib/diagnostics'
import type { diagnostics } from '@/lib/novelist/types'

const MODE_OPTIONS = [
  { value: 'auto', label: '智能 — AI 可自主调用，用户也可 / 触发' },
  { value: 'manual', label: '指令 — 仅用户 / 手动触发，不出现在目录中' },
  { value: 'always', label: '常驻 — 会话开头自动注入，始终生效' },
]

const KNOWN_FIELDS = ['name', 'description', 'category', 'mode', 'author', 'version']

interface Props {
  content: string
  novelId?: number
  filePath?: string
  readOnly?: boolean
  onSave: (newContent: string) => Promise<void>
  onCancel: () => void
}

type SkillEditError = {
  message: string
  diagnostic: diagnostics.CopyableDiagnostic
  title: string
}

export default function SkillEditForm({ content, novelId, filePath, readOnly, onSave, onCancel }: Props) {
  const { meta, body } = splitFrontmatter(content)

  const [name, setName] = useState(meta.name || '')
  const [description, setDescription] = useState(meta.description || '')
  const [category, setCategory] = useState(meta.category || '')
  const [mode, setMode] = useState(meta.mode || 'auto')
  const [author, setAuthor] = useState(meta.author || '')
  const [version, setVersion] = useState(meta.version || '1')
  const [bodyText, setBodyText] = useState(body || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<SkillEditError | null>(null)
  const [extraFields, setExtraFields] = useState<[string, string][]>([])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { meta: m, body: b } = splitFrontmatter(content)
      setName(m.name || '')
      setDescription(m.description || '')
      setCategory(m.category || '')
      setMode(m.mode || 'auto')
      setAuthor(m.author || '')
      setVersion(m.version || '1')
      setBodyText(b || '')
      setError(null)
      const extras: [string, string][] = []
      for (const [k, v] of Object.entries(m)) {
        if (!KNOWN_FIELDS.includes(k)) {
          extras.push([k, v])
        }
      }
      setExtraFields(extras)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [content])

  if (readOnly) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">内置技能不可编辑</p>
      </div>
    )
  }

  const handleSave = async () => {
    if (saving) return
    if (!name.trim()) {
      setError(skillEditError('名称不能为空', '名称不能为空', '技能表单无效', '校验技能表单', null, { field: 'name', path: filePath }))
      return
    }
    if (!description.trim()) {
      setError(skillEditError('简介不能为空', '简介不能为空', '技能表单无效', '校验技能表单', null, { field: 'description', path: filePath }))
      return
    }

    const lines = [
      '---',
      `name: ${name.trim()}`,
      `description: ${description.trim()}`,
      `category: ${category.trim() || '未分类'}`,
      `mode: ${mode}`,
    ]
    if (author.trim()) {
      lines.push(`author: ${author.trim()}`)
    }
    lines.push(`version: ${parseInt(version) || 1}`)
    for (const [k, v] of extraFields) {
      lines.push(`${k}: ${v}`)
    }
    lines.push('---', '', bodyText.trim())
    const newContent = lines.join('\n')

    setSaving(true)
    setError(null)
    try {
      await onSave(newContent)
    } catch (e: unknown) {
      setError(skillEditError(e, '保存技能失败，请重试', '保存技能失败', '保存技能', 'SaveContent', {
        novel_id: novelId ?? null,
        path: filePath ?? '',
        source_text: newContent,
      }))
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="overflow-y-auto h-full" onKeyDown={handleKeyDown}>
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
        {error && (
          <ErrorCallout
            title={error.title}
            message={error.message}
            diagnostic={error.diagnostic}
            className="sticky top-0 z-10 rounded-md shadow-sm"
            onClose={() => setError(null)}
          />
        )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">名称 *</label>
          <input
            type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="技能名称，如 scene-beats"
            className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">简介 *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="简要描述此技能的功能和触发时机"
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">分类</label>
          <input
            type="text" value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="如：结构、风格、系统"
            className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">模式</label>
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {MODE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">作者</label>
            <input
              type="text" value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="技能创建者"
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">版本</label>
            <input
              type="number" value={version}
              onChange={e => setVersion(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">内容</label>
          <textarea
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
            placeholder="技能正文内容（markdown）"
            rows={16}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-sm border hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function skillEditError(
  error: unknown,
  fallbackMessage: string,
  title: string,
  operation: string,
  bridgeMethod: string | null,
  detail?: unknown,
): SkillEditError {
  return {
    title,
    message: diagnosticMessage(error, fallbackMessage),
    diagnostic: buildCopyableDiagnostic({
      error,
      fallbackMessage,
      operation,
      bridgeMethod,
      detail,
    }),
  }
}
