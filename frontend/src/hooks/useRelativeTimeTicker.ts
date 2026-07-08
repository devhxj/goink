import { useEffect, useMemo, useState } from 'react'
import { nextRelativeTimeRefreshDelay } from '@/lib/time'

export function useRelativeTimeTicker(values: readonly unknown[], enabled = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const valuesKey = values.map(value => String(value ?? '')).join('\u001f')
  const normalizedValues = useMemo(
    () => valuesKey ? valuesKey.split('\u001f') : [],
    [valuesKey],
  )

  useEffect(() => {
    if (!enabled || normalizedValues.length === 0) return

    const delay = normalizedValues.reduce(
      (current, value) => Math.min(current, nextRelativeTimeRefreshDelay(value, { now: nowMs })),
      30 * 60 * 1000,
    )
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [enabled, normalizedValues, nowMs])

  return nowMs
}
