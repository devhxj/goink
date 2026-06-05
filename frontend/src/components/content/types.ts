export type EditorTab = {
  id: string
  type: 'file' | 'diff'
  path: string
  title: string
  // file tab
  content?: string
  outlineContent?: string
  isDirty?: boolean
  viewMode?: 'content' | 'outline'
  // diff tab
  diff?: string
  original?: string
  modified?: string
  changeType?: string
  reason?: string
  toolId?: string
}

// 文件名格式 chapters/001.md，outlines/001.md 同理
export function chapterPath(num: number): string {
  return `chapters/${String(num).padStart(3, '0')}.md`
}

export function outlinePath(num: number): string {
  return `outlines/${String(num).padStart(3, '0')}.md`
}

export function goinkPath(): string {
  return 'goink.md'
}

export function isContentPath(p: string): boolean {
  return p.startsWith('chapters/') || p === 'goink.md'
}

export function isOutlinePath(p: string): boolean {
  return p.startsWith('outlines/')
}

export function chapterNumFromPath(p: string): number {
  let n = 0
  if (p.startsWith('chapters/')) {
    const s = p.replace('chapters/', '').replace('.md', '')
    n = parseInt(s, 10)
  } else if (p.startsWith('outlines/')) {
    const s = p.replace('outlines/', '').replace('.md', '')
    n = parseInt(s, 10)
  }
  return n || 0
}
