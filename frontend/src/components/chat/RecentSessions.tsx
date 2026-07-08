import { MessageSquare } from 'lucide-react'
import type { app } from '@/hooks/useApp'
import { useRelativeTimeTicker } from '@/hooks/useRelativeTimeTicker'
import { formatAbsoluteDateTime, formatInteger, formatRelativeTime } from '@/lib/time'

interface Props {
  sessions: app.SessionMeta[]
  total: number
  onSelectSession: (sessionId: string) => void
  onViewAll: () => void
}

const LOCALE = 'zh-CN'

export default function RecentSessions({ sessions, total, onSelectSession, onViewAll }: Props) {
  const nowMs = useRelativeTimeTicker(sessions.map(session => session.updated_at), sessions.length > 0)

  return (
    <div className="flex flex-col h-full">
      {sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <div className="text-xs text-muted-foreground mb-2 px-1 select-none">最近对话</div>
          <div className="space-y-0.5">
            {sessions.map(s => (
              <button
                key={s.session_id}
                onClick={() => onSelectSession(s.session_id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-muted/50 transition-colors cursor-pointer select-none"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{s.title || '新对话'}</div>
                  <div
                    className="text-[10px] text-muted-foreground mt-0.5"
                    title={formatAbsoluteDateTime(s.updated_at, { locale: LOCALE })}
                  >
                    {formatRelativeTime(s.updated_at, { now: nowMs, locale: LOCALE })}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {total > sessions.length && (
            <button
              onClick={onViewAll}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors cursor-pointer select-none"
            >
              查看全部（{formatInteger(total, { locale: LOCALE })} 个）
            </button>
          )}
        </div>
      )}
    </div>
  )
}
