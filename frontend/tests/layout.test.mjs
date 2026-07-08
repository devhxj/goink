import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'novelist-layout-'))
const outputFile = path.join(tempDir, 'layout.mjs')

try {
  await build({
    entryPoints: ['src/lib/layout.ts'],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2023',
    logLevel: 'silent',
  })

  const {
    clampLayoutSettings,
    clampPanelWidth,
    clampWindowSettings,
    normalizeLayoutSettings,
    windowSettingsFromViewport,
  } = await import(pathToFileURL(outputFile))

  assert.deepEqual(
    normalizeLayoutSettings(null),
    { sidebar_width: 280, chat_panel_width: 360, metadata_panel_width: 320 },
    'missing layout settings use product defaults',
  )

  assert.equal(
    clampPanelWidth('399.6', 220, 640, 280),
    400,
    'panel widths accept numeric persisted strings and round to pixels',
  )

  assert.deepEqual(
    normalizeLayoutSettings({
      sidebar_width: Number.NaN,
      chat_panel_width: -10,
      metadata_panel_width: 5000,
    }),
    { sidebar_width: 280, chat_panel_width: 280, metadata_panel_width: 900 },
    'corrupt layout values fall back or clamp without throwing',
  )

  assert.deepEqual(
    clampLayoutSettings({ sidebar_width: 420, chat_panel_width: 600, metadata_panel_width: 360 }, 900),
    { sidebar_width: 312, chat_panel_width: 280, metadata_panel_width: 360 },
    'compact viewports shrink chat first, then sidebar, while preserving the content budget',
  )

  assert.deepEqual(
    clampLayoutSettings({ sidebar_width: 260, chat_panel_width: 300, metadata_panel_width: 360 }, 1440),
    { sidebar_width: 260, chat_panel_width: 300, metadata_panel_width: 360 },
    'normal desktop viewports keep valid user widths unchanged',
  )

  assert.deepEqual(
    clampWindowSettings({
      x: 5000,
      y: -50,
      width: 1200,
      height: 900,
      maximized: true,
    }, {
      availLeft: 0,
      availTop: 0,
      availWidth: 1920,
      availHeight: 1080,
    }),
    { x: 720, y: 0, width: 1200, height: 900, maximized: true },
    'window coordinates clamp to the visible screen area',
  )

  assert.deepEqual(
    clampWindowSettings({
      x: 9999999,
      y: -9999999,
      width: 100,
      height: 200,
      maximized: false,
    }),
    { x: null, y: null, width: 800, height: 600, maximized: false },
    'invalid stored window bounds fall back to safe defaults',
  )

  assert.deepEqual(
    windowSettingsFromViewport({
      previous: { x: 40, y: 60, width: 1280, height: 840, maximized: false },
      viewportWidth: 1440,
      viewportHeight: 900,
      maximized: true,
    }),
    { x: 40, y: 60, width: 1440, height: 900, maximized: true },
    'saving from viewport preserves known coordinates and updates size/maximized state',
  )
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
