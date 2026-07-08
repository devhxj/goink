import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'novelist-time-'))
const outputFile = path.join(tempDir, 'time.mjs')

try {
  await build({
    entryPoints: ['src/lib/time.ts'],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2023',
    logLevel: 'silent',
  })

  const {
    formatAbsoluteDateTime,
    formatInteger,
    formatRelativeTime,
    nextRelativeTimeRefreshDelay,
  } = await import(pathToFileURL(outputFile))

  const now = Date.parse('2026-07-05T12:10:00.000Z')

  assert.equal(
    formatRelativeTime('2026-07-05T12:09:00.000Z', { now, locale: 'zh-CN' }),
    '1分钟前',
    'Chinese minute labels refresh at minute precision',
  )

  assert.equal(
    formatRelativeTime('2026-07-05T10:10:00.000Z', { now, locale: 'zh-CN' }),
    '2小时前',
    'Chinese hour labels use locale-aware relative formatting',
  )

  assert.equal(
    formatRelativeTime('2026-07-05T12:09:00.000Z', { now, locale: 'en-US' }),
    '1 minute ago',
    'English relative labels are covered for i18n-sensitive surfaces',
  )

  assert.equal(
    formatRelativeTime('2026-07-05T12:12:00.000Z', { now, locale: 'en-US' }),
    'in 2 minutes',
    'future clock skew is presented instead of producing negative past labels',
  )

  assert.equal(
    formatRelativeTime('2026-07-05T12:09:35.000Z', { now, locale: 'zh-CN' }),
    '刚刚',
    'sub-minute labels avoid noisy second-by-second churn',
  )

  assert.equal(
    formatRelativeTime('not-a-date', { now, locale: 'zh-CN' }),
    'not-a-date',
    'invalid timestamps degrade to the original value',
  )

  assert.match(
    formatAbsoluteDateTime('2026-07-05T12:09:00.000Z', { locale: 'zh-CN' }),
    /2026/,
    'absolute date tool uses Intl formatting and keeps the year visible',
  )

  assert.equal(
    formatInteger(1234567, { locale: 'en-US' }),
    '1,234,567',
    'integer formatting is locale-aware',
  )

  const subMinuteDelay = nextRelativeTimeRefreshDelay('2026-07-05T12:09:35.000Z', { now })
  assert(subMinuteDelay > 0 && subMinuteDelay <= 61_000, `sub-minute delay should wait for the next minute boundary, got ${subMinuteDelay}`)

  const minuteDelay = nextRelativeTimeRefreshDelay('2026-07-05T12:08:45.000Z', { now })
  assert(minuteDelay > 0 && minuteDelay <= 60_000, `minute delay should refresh at the next minute boundary, got ${minuteDelay}`)

  const hourDelay = nextRelativeTimeRefreshDelay('2026-07-05T10:10:00.000Z', { now })
  assert(hourDelay >= 60_000 && hourDelay <= 300_000, `hour-level delay should be slower, got ${hourDelay}`)

  assert.equal(
    nextRelativeTimeRefreshDelay('2026-06-01T12:10:00.000Z', { now }),
    30 * 60 * 1000,
    'older labels refresh at the conservative long interval',
  )
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
