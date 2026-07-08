const DEFAULT_LOCALE = 'zh-CN'
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY
const MAX_REFRESH_DELAY = 30 * MINUTE

export interface TimeFormatOptions {
  locale?: string
  now?: Date | number | string
}

export function formatRelativeTime(value: unknown, options: TimeFormatOptions = {}): string {
  const targetMs = parseTimestamp(value)
  if (targetMs == null) return fallbackTimestamp(value)

  const locale = options.locale || DEFAULT_LOCALE
  const nowMs = parseNow(options.now)
  const diffMs = targetMs - nowMs
  const absMs = Math.abs(diffMs)

  if (absMs < MINUTE) {
    return locale.startsWith('en') ? 'just now' : '刚刚'
  }

  const { amount, unit } = relativeUnit(absMs)
  const signedAmount = diffMs < 0 ? -amount : amount
  return formatRelativeUnit(signedAmount, unit, locale)
}

export function nextRelativeTimeRefreshDelay(value: unknown, options: TimeFormatOptions = {}): number {
  const targetMs = parseTimestamp(value)
  if (targetMs == null) return MINUTE

  const nowMs = parseNow(options.now)
  const absMs = Math.abs(targetMs - nowMs)

  if (absMs < MINUTE) {
    return clampRefreshDelay(MINUTE - absMs + SECOND)
  }

  if (absMs < HOUR) {
    return clampRefreshDelay(MINUTE - (absMs % MINUTE) + SECOND)
  }

  if (absMs < DAY) {
    return clampRefreshDelay(Math.min(5 * MINUTE, HOUR - (absMs % HOUR) + SECOND))
  }

  return MAX_REFRESH_DELAY
}

export function formatAbsoluteDateTime(value: unknown, options: TimeFormatOptions = {}): string {
  const targetMs = parseTimestamp(value)
  if (targetMs == null) return fallbackTimestamp(value)

  return new Intl.DateTimeFormat(options.locale || DEFAULT_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(targetMs))
}

export function formatInteger(value: number, options: TimeFormatOptions = {}): string {
  return new Intl.NumberFormat(options.locale || DEFAULT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value)
}

function parseTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const time = new Date(trimmed).getTime()
    return Number.isFinite(time) ? time : null
  }

  return null
}

function parseNow(value: Date | number | string | undefined): number {
  const parsed = value == null ? Date.now() : parseTimestamp(value)
  return parsed ?? Date.now()
}

function fallbackTimestamp(value: unknown): string {
  return value == null ? '' : String(value)
}

function relativeUnit(absMs: number): { amount: number; unit: Intl.RelativeTimeFormatUnit } {
  if (absMs < HOUR) {
    return { amount: Math.max(1, Math.floor(absMs / MINUTE)), unit: 'minute' }
  }

  if (absMs < DAY) {
    return { amount: Math.max(1, Math.floor(absMs / HOUR)), unit: 'hour' }
  }

  if (absMs < MONTH) {
    return { amount: Math.max(1, Math.floor(absMs / DAY)), unit: 'day' }
  }

  if (absMs < YEAR) {
    return { amount: Math.max(1, Math.floor(absMs / MONTH)), unit: 'month' }
  }

  return { amount: Math.max(1, Math.floor(absMs / YEAR)), unit: 'year' }
}

function formatRelativeUnit(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
  } catch {
    const unitText = fallbackUnit(unit, Math.abs(value), locale)
    if (locale.startsWith('en')) {
      return value < 0 ? `${Math.abs(value)} ${unitText} ago` : `in ${value} ${unitText}`
    }

    const numberText = new Intl.NumberFormat(locale || DEFAULT_LOCALE).format(Math.abs(value))
    return value < 0 ? `${numberText} ${unitText}前` : `${numberText} ${unitText}后`
  }
}

function fallbackUnit(unit: Intl.RelativeTimeFormatUnit, amount: number, locale: string): string {
  if (!locale.startsWith('en')) {
    switch (unit) {
      case 'minute': return '分钟'
      case 'hour': return '小时'
      case 'day': return '天'
      case 'month': return '个月'
      case 'year': return '年'
      default: return String(unit)
    }
  }

  const base = String(unit)
  return amount === 1 ? base : `${base}s`
}

function clampRefreshDelay(value: number): number {
  return Math.max(SECOND, Math.min(MAX_REFRESH_DELAY, Math.ceil(value)))
}
