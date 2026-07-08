import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { WindowGetBounds, WindowIsMaximised, WindowToggleMaximise } from '@/lib/novelist/runtime'
import {
  DEFAULT_WINDOW_SETTINGS,
  clampWindowSettings,
  safeScreenBounds,
  windowSettingsFromViewport,
} from '@/lib/layout'
import type { layout } from '@/lib/novelist/types'

export function useWindowState() {
  const app = useApp()
  const [isMaximised, setIsMaximised] = useState(false)
  const previousSettingsRef = useRef<layout.WindowSettings>(DEFAULT_WINDOW_SETTINGS)
  const maximisedRef = useRef(false)

  useEffect(() => {
    maximisedRef.current = isMaximised
  }, [isMaximised])

  const captureWindowSettings = useCallback(async (maximized = maximisedRef.current) => {
    const screenBounds = safeScreenBounds()
    const fallback = windowSettingsFromViewport({
      previous: previousSettingsRef.current,
      maximized,
      screenBounds,
    })

    try {
      const bounds = await WindowGetBounds()
      return clampWindowSettings(
        {
          ...bounds,
          maximized,
        },
        screenBounds,
      )
    } catch {
      return fallback
    }
  }, [])

  const saveWindowSettings = useCallback(async (maximized = maximisedRef.current) => {
    const payload = await captureWindowSettings(maximized)
    try {
      const saved = await app.SaveWindowSettings(payload)
      previousSettingsRef.current = clampWindowSettings(saved, safeScreenBounds())
    } catch {
      // Window state persistence is best-effort and should not block startup or writing.
    }
  }, [app, captureWindowSettings])

  const toggleMaximise = useCallback(async () => {
    const optimistic = !maximisedRef.current
    setIsMaximised(optimistic)
    try {
      await WindowToggleMaximise()
      const confirmed = await WindowIsMaximised()
      setIsMaximised(confirmed)
      await saveWindowSettings(confirmed)
    } catch {
      setIsMaximised(optimistic)
      await saveWindowSettings(optimistic)
    }
  }, [saveWindowSettings])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [settings, runtimeMaximized] = await Promise.all([
          app.GetWindowSettings(),
          WindowIsMaximised().catch(() => null),
        ])
        if (cancelled) return
        const saved = clampWindowSettings(settings, safeScreenBounds())
        previousSettingsRef.current = saved
        const nextMaximized = typeof runtimeMaximized === 'boolean' ? runtimeMaximized : saved.maximized
        setIsMaximised(nextMaximized)
      } catch {
        if (!cancelled) {
          previousSettingsRef.current = DEFAULT_WINDOW_SETTINGS
        }
      }
    })()
    return () => { cancelled = true }
  }, [app])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let timer: ReturnType<typeof window.setTimeout> | null = null
    const queueSave = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        void saveWindowSettings()
      }, 500)
    }
    const saveBeforeUnload = () => {
      void saveWindowSettings()
    }
    window.addEventListener('resize', queueSave)
    window.addEventListener('beforeunload', saveBeforeUnload)
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('resize', queueSave)
      window.removeEventListener('beforeunload', saveBeforeUnload)
    }
  }, [saveWindowSettings])

  return {
    isMaximised,
    toggleMaximise,
    saveWindowSettings,
  }
}
