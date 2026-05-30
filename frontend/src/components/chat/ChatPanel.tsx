import { useState, useCallback, useRef, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import ChatInput from './ChatInput'

interface Props {
  novelId: number
}

const MIN_WIDTH = 280
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 360

export default function ChatPanel({ novelId }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current - delta))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const hasNovel = novelId > 0

  return (
    <aside className="shrink-0 flex flex-col bg-background border-l relative" style={{ width }}>
      {/* 拖拽手柄 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
        style={{ marginLeft: -2 }}
        onMouseDown={handleMouseDown}
      />

      {/* 标题栏 */}
      <div className="px-4 py-2.5 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI 对话</span>
      </div>

      {/* 内容区 */}
      {hasNovel ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">输入消息开始对话</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">选择作品开始对话</p>
          </div>
        </div>
      )}

      <ChatInput disabled={!hasNovel} />

      {/* 拖拽时的全局 overlay，防止选中文字 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}
    </aside>
  )
}
