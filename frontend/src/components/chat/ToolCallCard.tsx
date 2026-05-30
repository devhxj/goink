import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  toolName: string
  displayText: string
  status: 'executing' | 'completed' | 'failed'
  error?: string
}

export default function ToolCallCard({ toolName, displayText, status, error }: Props) {
  return (
    <div className={`flex items-center gap-2 py-1 px-2 rounded text-xs ${
      status === 'executing' ? 'bg-muted/50' : ''
    }`}>
      {status === 'executing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
      {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
      {status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}

      <span className="text-muted-foreground truncate flex-1">
        {displayText || toolName}
      </span>

      <span className={`shrink-0 ${
        status === 'executing' ? 'text-muted-foreground' :
        status === 'completed' ? 'text-emerald-600' :
        'text-red-500'
      }`}>
        {status === 'executing' ? '处理中' : status === 'completed' ? '完成' : '失败'}
      </span>

      {error && (
        <span className="text-red-400 text-[10px] truncate">{error.slice(0, 80)}</span>
      )}
    </div>
  )
}
