import assert from 'node:assert/strict'
import { newAppPage } from './app-harness.mjs'
import { settingsFixture } from './mock-bridge.mjs'
import {
  assertBridgeCallCount,
  bridgeCallCount,
  expectVisible,
  waitForBridgeCall,
} from './page-helpers.mjs'

export async function verifyLayoutPersistenceWorkflow(page, browser, url, consoleErrors, pageErrors) {
  await expectVisible(page.getByText('全局回归小说'), 'layout workspace title')
  await expectVisible(page.getByRole('separator', { name: '调整侧边栏宽度' }), 'sidebar resize separator')
  await expectVisible(page.getByRole('separator', { name: '调整对话面板宽度' }), 'chat resize separator')

  await assertPanelWidth(page, '调整侧边栏宽度', 280, 2, 'initial sidebar width')
  await assertPanelWidth(page, '调整对话面板宽度', 360, 2, 'initial chat width')

  await dragSeparator(page, '调整侧边栏宽度', 80)
  await waitForLayoutSave(page, { sidebar_width: 360, chat_panel_width: 360 })
  await assertPanelWidth(page, '调整侧边栏宽度', 360, 2, 'dragged sidebar width')

  await dragSeparator(page, '调整对话面板宽度', -80)
  await waitForLayoutSave(page, { sidebar_width: 360, chat_panel_width: 440 })
  await assertPanelWidth(page, '调整对话面板宽度', 440, 2, 'dragged chat width')
  await assertWorkspacePanelsDoNotOverlap(page, 'desktop layout after drag')

  await page.getByTitle('最大化').click()
  await page.waitForFunction(
    () => window.__appMockState.calls.some((call) =>
      call.method === 'SaveWindowSettings' &&
      call.args[0]?.maximized === true &&
      call.args[0]?.width >= 800 &&
      call.args[0]?.height >= 600),
    null,
    { timeout: 12_000 },
  )
  await expectVisible(page.getByTitle('还原'), 'maximized title button')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectVisible(page.getByText('全局回归小说'), 'layout workspace after reload')
  await assertPanelWidth(page, '调整侧边栏宽度', 360, 2, 'persisted sidebar width after reload')
  await assertPanelWidth(page, '调整对话面板宽度', 440, 2, 'persisted chat width after reload')

  const saveLayoutCallsBeforeCompact = await bridgeCallCount(page, 'SaveLayoutSettings')
  await page.setViewportSize({ width: 900, height: 720 })
  await page.waitForFunction(() => {
    const widthFor = (label) => {
      const separator = document.querySelector(`[role="separator"][aria-label="${label}"]`)
      const panel = separator?.closest('aside')
      return panel ? Math.round(panel.getBoundingClientRect().width) : 0
    }
    const widths = {
      sidebar: widthFor('调整侧边栏宽度'),
      chat: widthFor('调整对话面板宽度'),
    }
    return widths.sidebar + widths.chat <= 593 &&
      widths.sidebar >= 220 &&
      widths.chat >= 280
  }, null, { timeout: 12_000 })
  const compactWidths = await layoutPanelWidths(page)
  assert(compactWidths.sidebar + compactWidths.chat <= 593, `compact layout should preserve content budget, got ${JSON.stringify(compactWidths)}`)
  await assertWorkspacePanelsDoNotOverlap(page, 'compact layout after viewport shrink')
  assert.equal(
    await bridgeCallCount(page, 'SaveLayoutSettings'),
    saveLayoutCallsBeforeCompact,
    'automatic compact clamping must not overwrite the persisted user layout',
  )

  const corruptPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: true,
    settings: {
      ...settingsFixture(42),
      sidebar_width: 'not-a-width',
      chat_panel_width: 'not-a-width',
      metadata_panel_width: 'bad-metadata-width',
      window_x: 9999999,
      window_y: -9999999,
      window_width: 100,
      window_height: 200,
      window_maximized: true,
    },
  }, { width: 1280, height: 820 }, 'layout-corrupt-settings')
  await corruptPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(corruptPage.getByText('全局回归小说'), 'workspace after corrupt layout settings')
  await assertPanelWidth(corruptPage, '调整侧边栏宽度', 280, 2, 'corrupt sidebar width fallback')
  await assertPanelWidth(corruptPage, '调整对话面板宽度', 360, 2, 'corrupt chat width fallback')
  await assertWorkspacePanelsDoNotOverlap(corruptPage, 'layout after corrupt settings fallback')
  await assertBridgeCallCount(corruptPage, 'SaveContent', 0)
  await corruptPage.close()

  await page.getByRole('separator', { name: '调整侧边栏宽度' }).press('ArrowLeft')
  await waitForBridgeCall(page, 'SaveLayoutSettings')
  await page.getByTitle('还原').click()
  await page.waitForFunction(
    () => window.__appMockState.calls.some((call) =>
      call.method === 'SaveWindowSettings' &&
      call.args[0]?.maximized === false),
    null,
    { timeout: 12_000 },
  )

  await assertBridgeCallCount(page, 'SetChatPanelWidth', 0)
  await assertBridgeCallCount(page, 'SaveContent', 0)
}

async function dragSeparator(page, label, deltaX) {
  const handle = page.getByRole('separator', { name: label })
  const box = await handle.boundingBox()
  assert(box, `Expected separator ${label} to have a bounding box.`)
  const startX = label.includes('侧边栏')
    ? box.x + Math.min(1, box.width / 2)
    : box.x + Math.max(1, box.width - 1)
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(startX + deltaX, startY, { steps: 8 })
  await page.mouse.up()
}

async function waitForLayoutSave(page, expected) {
  await page.waitForFunction(
    (expected) => window.__appMockState.calls.some((call) => {
      if (call.method !== 'SaveLayoutSettings') return false
      return Object.entries(expected).every(([key, value]) => call.args[0]?.[key] === value)
    }),
    expected,
    { timeout: 12_000 },
  )
}

async function assertPanelWidth(page, label, expected, tolerance, description) {
  const actual = await panelWidthBySeparator(page, label)
  assert(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${description} to be ${expected}px +/- ${tolerance}px, got ${actual}px.`,
  )
}

async function panelWidthBySeparator(page, label) {
  return await page.getByRole('separator', { name: label }).evaluate((separator) => {
    const panel = separator.closest('aside')
    return panel ? Math.round(panel.getBoundingClientRect().width) : 0
  })
}

async function layoutPanelWidths(page) {
  return await page.evaluate(() => {
    const widthFor = (label) => {
      const separator = document.querySelector(`[role="separator"][aria-label="${label}"]`)
      const panel = separator?.closest('aside')
      return panel ? Math.round(panel.getBoundingClientRect().width) : 0
    }
    return {
      sidebar: widthFor('调整侧边栏宽度'),
      chat: widthFor('调整对话面板宽度'),
    }
  })
}

async function assertWorkspacePanelsDoNotOverlap(page, description) {
  const result = await page.evaluate(() => {
    const sideHandle = document.querySelector('[role="separator"][aria-label="调整侧边栏宽度"]')
    const chatHandle = document.querySelector('[role="separator"][aria-label="调整对话面板宽度"]')
    const sidebar = sideHandle?.closest('aside')?.getBoundingClientRect()
    const chat = chatHandle?.closest('aside')?.getBoundingClientRect()
    if (!sidebar || !chat) return { ok: false, reason: 'missing panel box' }
    if (sidebar.right > chat.left) {
      return { ok: false, reason: `panels overlap: sidebar right ${sidebar.right}, chat left ${chat.left}` }
    }
    const chatButtons = Array.from(chatHandle.closest('aside')?.querySelectorAll('button') ?? [])
      .filter((button) => (button.textContent ?? '').includes('历史') || (button.textContent ?? '').includes('新对话'))
    const clippedButton = chatButtons.find((button) => {
      const box = button.getBoundingClientRect()
      return box.left < chat.left || box.right > chat.right
    })
    if (clippedButton) return { ok: false, reason: `chat action clipped: ${clippedButton.textContent}` }
    return { ok: true, reason: '' }
  })
  assert.equal(result.ok, true, `${description} should not overlap or clip panel controls: ${result.reason}`)
}
