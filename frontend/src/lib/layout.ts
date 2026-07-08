import type { layout } from './novelist/types'

export const DEFAULT_LAYOUT_SETTINGS: layout.LayoutSettings = {
  sidebar_width: 280,
  chat_panel_width: 360,
  metadata_panel_width: 320,
}

export const DEFAULT_WINDOW_SETTINGS: layout.WindowSettings = {
  x: null,
  y: null,
  width: 1280,
  height: 840,
  maximized: false,
}

export const LAYOUT_LIMITS = {
  sidebar: { min: 220, max: 640, fallback: DEFAULT_LAYOUT_SETTINGS.sidebar_width },
  chat: { min: 280, max: 600, fallback: DEFAULT_LAYOUT_SETTINGS.chat_panel_width },
  metadata: { min: 240, max: 900, fallback: DEFAULT_LAYOUT_SETTINGS.metadata_panel_width },
  activityBarWidth: 48,
  minContentWidth: 260,
} as const

export const WINDOW_LIMITS = {
  width: { min: 800, max: 3840, fallback: DEFAULT_WINDOW_SETTINGS.width },
  height: { min: 600, max: 2160, fallback: DEFAULT_WINDOW_SETTINGS.height },
  maxCoordinateAbs: 100000,
} as const

export interface ScreenBounds {
  availLeft?: number
  availTop?: number
  availWidth?: number
  availHeight?: number
}

export function safeViewportWidth(fallback = DEFAULT_WINDOW_SETTINGS.width): number {
  if (typeof window === 'undefined') return fallback
  return finiteNumber(window.innerWidth, fallback)
}

export function safeViewportHeight(fallback = DEFAULT_WINDOW_SETTINGS.height): number {
  if (typeof window === 'undefined') return fallback
  return finiteNumber(window.innerHeight, fallback)
}

export function safeScreenBounds(): ScreenBounds {
  if (typeof window === 'undefined' || !window.screen) return {}
  const screenWithPosition = window.screen as Screen & {
    availLeft?: number
    availTop?: number
  }
  return {
    availLeft: optionalFiniteNumber(screenWithPosition.availLeft) ?? undefined,
    availTop: optionalFiniteNumber(screenWithPosition.availTop) ?? undefined,
    availWidth: optionalFiniteNumber(window.screen.availWidth) ?? undefined,
    availHeight: optionalFiniteNumber(window.screen.availHeight) ?? undefined,
  }
}

export function clampPanelWidth(value: unknown, min: number, max: number, fallback: number): number {
  return clampInteger(value, min, max, fallback)
}

export function normalizeLayoutSettings(input: Partial<layout.LayoutSettings> | null | undefined): layout.LayoutSettings {
  return {
    sidebar_width: clampPanelWidth(
      input?.sidebar_width,
      LAYOUT_LIMITS.sidebar.min,
      LAYOUT_LIMITS.sidebar.max,
      LAYOUT_LIMITS.sidebar.fallback,
    ),
    chat_panel_width: clampPanelWidth(
      input?.chat_panel_width,
      LAYOUT_LIMITS.chat.min,
      LAYOUT_LIMITS.chat.max,
      LAYOUT_LIMITS.chat.fallback,
    ),
    metadata_panel_width: clampPanelWidth(
      input?.metadata_panel_width,
      LAYOUT_LIMITS.metadata.min,
      LAYOUT_LIMITS.metadata.max,
      LAYOUT_LIMITS.metadata.fallback,
    ),
  }
}

export function clampLayoutSettings(
  input: Partial<layout.LayoutSettings> | null | undefined,
  viewportWidth = safeViewportWidth(),
): layout.LayoutSettings {
  const normalized = normalizeLayoutSettings(input)
  const availableWidth = Math.max(0, finiteNumber(viewportWidth, DEFAULT_WINDOW_SETTINGS.width) - LAYOUT_LIMITS.activityBarWidth)
  const minPanelWidth = LAYOUT_LIMITS.sidebar.min + LAYOUT_LIMITS.chat.min
  const maxPanelWidth = Math.max(minPanelWidth, availableWidth - LAYOUT_LIMITS.minContentWidth)
  let sidebarWidth = normalized.sidebar_width
  let chatPanelWidth = normalized.chat_panel_width
  let overflow = sidebarWidth + chatPanelWidth - maxPanelWidth

  if (overflow > 0) {
    const chatReduction = Math.min(overflow, chatPanelWidth - LAYOUT_LIMITS.chat.min)
    chatPanelWidth -= chatReduction
    overflow -= chatReduction
  }

  if (overflow > 0) {
    const sidebarReduction = Math.min(overflow, sidebarWidth - LAYOUT_LIMITS.sidebar.min)
    sidebarWidth -= sidebarReduction
  }

  return {
    sidebar_width: Math.round(sidebarWidth),
    chat_panel_width: Math.round(chatPanelWidth),
    metadata_panel_width: normalized.metadata_panel_width,
  }
}

export function clampWindowSettings(
  input: Partial<layout.WindowSettings> | null | undefined,
  screenBounds: ScreenBounds = {},
): layout.WindowSettings {
  const width = clampInteger(input?.width, WINDOW_LIMITS.width.min, WINDOW_LIMITS.width.max, WINDOW_LIMITS.width.fallback)
  const height = clampInteger(input?.height, WINDOW_LIMITS.height.min, WINDOW_LIMITS.height.max, WINDOW_LIMITS.height.fallback)

  return {
    x: clampWindowCoordinate(input?.x, width, 'x', screenBounds),
    y: clampWindowCoordinate(input?.y, height, 'y', screenBounds),
    width,
    height,
    maximized: input?.maximized === true,
  }
}

export function windowSettingsFromViewport(input: {
  previous?: Partial<layout.WindowSettings> | null
  viewportWidth?: number
  viewportHeight?: number
  maximized?: boolean
  screenBounds?: ScreenBounds
} = {}): layout.WindowSettings {
  const previous = clampWindowSettings(input.previous, input.screenBounds)
  return clampWindowSettings(
    {
      x: previous.x,
      y: previous.y,
      width: input.viewportWidth ?? safeViewportWidth(),
      height: input.viewportHeight ?? safeViewportHeight(),
      maximized: input.maximized ?? previous.maximized,
    },
    input.screenBounds,
  )
}

function clampWindowCoordinate(
  value: unknown,
  size: number,
  axis: 'x' | 'y',
  screenBounds: ScreenBounds,
): number | null {
  const coordinate = optionalFiniteNumber(value)
  if (coordinate == null || Math.abs(coordinate) > WINDOW_LIMITS.maxCoordinateAbs) return null

  const origin = optionalFiniteNumber(axis === 'x' ? screenBounds.availLeft : screenBounds.availTop) ?? 0
  const span = optionalFiniteNumber(axis === 'x' ? screenBounds.availWidth : screenBounds.availHeight)
  if (span == null || span <= 0) return Math.round(coordinate)

  const maxCoordinate = Math.max(origin, origin + span - Math.min(size, span))
  return clampInteger(coordinate, origin, maxCoordinate, origin)
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = finiteNumber(value, fallback)
  return Math.round(Math.min(max, Math.max(min, numeric)))
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function optionalFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
