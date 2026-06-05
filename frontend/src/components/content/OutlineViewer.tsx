import Markdown from '@/components/Markdown'

interface Props {
  content: string
}

export default function OutlineViewer({ content }: Props) {
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">暂无大纲</p>
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full p-6">
      <Markdown content={content} />
    </div>
  )
}
