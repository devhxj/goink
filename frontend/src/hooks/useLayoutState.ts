import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import {
  DEFAULT_LAYOUT_SETTINGS,
  clampLayoutSettings,
  normalizeLayoutSettings,
} from '@/lib/layout'
import type { layout as layoutTypes } from '@/lib/novelist/types'

export function useLayoutState() {
  const app = useApp()
  const [layout, setLayout] = useState<layoutTypes.LayoutSettings>(() => clampLayoutSettings(DEFAULT_LAYOUT_SETTINGS))
  const preferredLayoutRef = useRef<layoutTypes.LayoutSettings>(DEFAULT_LAYOUT_SETTINGS)
  const effectiveLayoutRef = useRef<layoutTypes.LayoutSettings>(layout)

  useEffect(() => {
    effectiveLayoutRef.current = layout
  }, [layout])

  const applyPreferredLayout = useCallback((next: Partial<layoutTypes.LayoutSettings>) => {
    const preferred = normalizeLayoutSettings({
      ...preferredLayoutRef.current,
      ...next,
    })
    preferredLayoutRef.current = preferred
    const effective = clampLayoutSettings(preferred)
    setLayoutIfChanged(setLayout, effective)
    return effective
  }, [])

  const commitLayout = useCallback(async (next?: Partial<layoutTypes.LayoutSettings>) => {
    const effective = next ? applyPreferredLayout(next) : effectiveLayoutRef.current
    const payload = normalizeLayoutSettings(effective)
    preferredLayoutRef.current = payload
    setLayoutIfChanged(setLayout, payload)
    try {
      await app.SaveLayoutSettings(payload)
    } catch {
      // Layout persistence should not interrupt the writing surface.
    }
  }, [app, applyPreferredLayout])

  const setSidebarWidth = useCallback((width: number) => {
    applyPreferredLayout({ sidebar_width: width })
  }, [applyPreferredLayout])

  const setChatPanelWidth = useCallback((width: number) => {
    applyPreferredLayout({ chat_panel_width: width })
  }, [applyPreferredLayout])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await app.GetLayoutSettings()
        if (cancelled) return
        const preferred = normalizeLayoutSettings(settings)
        preferredLayoutRef.current = preferred
        setLayoutIfChanged(setLayout, clampLayoutSettings(preferred))
      } catch {
        if (!cancelled) {
          preferredLayoutRef.current = DEFAULT_LAYOUT_SETTINGS
          setLayoutIfChanged(setLayout, clampLayoutSettings(DEFAULT_LAYOUT_SETTINGS))
        }
      }
    })()
    return () => { cancelled = true }
  }, [app])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let frame = 0
    const handleResize = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setLayoutIfChanged(setLayout, clampLayoutSettings(preferredLayoutRef.current))
      })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return {
    layout,
    setSidebarWidth,
    setChatPanelWidth,
    commitLayout,
  }
}

function setLayoutIfChanged(
  setLayout: React.Dispatch<React.SetStateAction<layoutTypes.LayoutSettings>>,
  next: layoutTypes.LayoutSettings,
) {
  setLayout((current) => areLayoutsEqual(current, next) ? current : next)
}

function areLayoutsEqual(a: layoutTypes.LayoutSettings, b: layoutTypes.LayoutSettings): boolean {
  return a.sidebar_width === b.sidebar_width &&
    a.chat_panel_width === b.chat_panel_width &&
    a.metadata_panel_width === b.metadata_panel_width
}
