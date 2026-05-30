interface Props {
  content: string
  isStreaming: boolean
}

export default function ThinkingBlock({ content, isStreaming }: Props) {
  if (!content) return null

  return (
    <details className="group" open={isStreaming}>
      <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">
        {isStreaming ? '思考中…' : '思考过程'}
      </summary>
      <pre className="text-xs text-muted-foreground/70 whitespace-pre-wrap break-words mt-1 pl-3 border-l border-border">
        {content}
      </pre>
    </details>
  )
}
