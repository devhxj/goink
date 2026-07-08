import assert from 'node:assert/strict'
import path from 'node:path'
import { newAppPage, outputDir } from './app-harness.mjs'
import { mockImportRecoveryResult } from './fixtures.mjs'
import { settingsFixture } from './mock-bridge.mjs'
import { expectVisible, waitForBridgeCall } from './page-helpers.mjs'

export async function verifyBootstrapStates(browser, url, consoleErrors, pageErrors) {
  const initPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: false,
    platformDefaultPath: 'D:\\NovelistBootstrap',
    afterInitializeNovels: [],
    afterInitializeSettings: settingsFixture(0),
  })
  await initPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(initPage.getByText('欢迎使用 Novelist'), 'initialization screen')
  await expectVisible(initPage.getByText('D:\\NovelistBootstrap'), 'default data directory')
  await initPage.getByRole('button', { name: '开始使用' }).click()
  await expectVisible(initPage.getByText('还没有作品，创建第一部吧'), 'empty bookshelf after initialization')
  await waitForBridgeCall(initPage, 'Initialize')
  await initPage.close()

  const emptyPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: true,
    novels: [],
    settings: settingsFixture(0),
  })
  await emptyPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(emptyPage.getByText('还没有作品，创建第一部吧'), 'empty workspace bookshelf')
  await expectVisible(emptyPage.getByText('选择作品开始对话'), 'chat empty novel state')
  await emptyPage.close()

  const startupRecoveryPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: true,
    importRecovery: mockImportRecoveryResult(),
  }, undefined, 'bootstrap-import-recovery')
  await startupRecoveryPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(startupRecoveryPage.getByRole('heading', { name: '导入恢复已处理' }), 'startup import recovery heading')
  await expectVisible(startupRecoveryPage.getByText('已清理 1 个未完成导入'), 'startup import recovery cleaned count')
  await expectVisible(startupRecoveryPage.getByText('1 个导入需要手动处理'), 'startup import recovery blocked count')
  await expectVisible(startupRecoveryPage.getByText('startup-blocked-import'), 'startup import recovery blocked task id')
  await startupRecoveryPage.getByRole('button', { name: '复制诊断' }).click()
  await expectVisible(startupRecoveryPage.getByRole('button', { name: '已复制' }), 'startup import recovery copied state')
  await startupRecoveryPage.screenshot({ path: path.join(outputDir, 'app-00-import-recovery.png'), fullPage: true })
  await startupRecoveryPage.close()

  const startupErrorPage = await newAppPage(browser, consoleErrors, pageErrors, {
    failIsInitialized: true,
  })
  await startupErrorPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(startupErrorPage.getByRole('heading', { name: '启动检查失败' }), 'startup failure heading')
  await expectVisible(startupErrorPage.getByText('初始化状态读取失败'), 'startup failure detail')
  await startupErrorPage.getByRole('button', { name: '重试' }).click()
  await expectVisible(startupErrorPage.getByRole('heading', { name: '启动检查失败' }), 'startup retry failure')
  await waitForBridgeCall(startupErrorPage, 'IsInitialized')
  await startupErrorPage.close()

  const corruptRecoveryPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: true,
    faults: {
      IsInitialized: [{ mode: 'malformed-response' }, { mode: 'malformed-response' }],
    },
  }, undefined, 'bootstrap-corrupt-recovery')
  await corruptRecoveryPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(corruptRecoveryPage.getByRole('heading', { name: '启动检查失败' }), 'corrupt startup failure heading')
  await expectVisible(corruptRecoveryPage.getByText(/Bridge response is missing an ok flag/), 'corrupt startup failure detail')
  await corruptRecoveryPage.screenshot({ path: path.join(outputDir, 'app-00-corrupt-startup.png'), fullPage: true })
  await corruptRecoveryPage.evaluate(() => window.__appMockState.clearFaultQueue?.('IsInitialized'))
  await corruptRecoveryPage.getByRole('button', { name: '重试' }).click()
  await expectVisible(corruptRecoveryPage.getByText('全局回归小说'), 'workspace after corrupt startup retry')
  await expectVisible(corruptRecoveryPage.getByText('AI 对话'), 'chat panel after corrupt startup retry')
  const corruptCalls = await corruptRecoveryPage.evaluate(() =>
    window.__appMockState.calls.filter((call) => call.method === 'IsInitialized').length)
  assert(corruptCalls >= 2, `Expected corrupt startup retry to call IsInitialized at least twice, got ${corruptCalls}.`)
  await corruptRecoveryPage.close()

  const bridgeUnavailablePage = await newAppPage(browser, consoleErrors, pageErrors)
  await bridgeUnavailablePage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(bridgeUnavailablePage.getByRole('heading', { name: '无法连接桌面桥接' }), 'bridge unavailable heading')
  await expectVisible(bridgeUnavailablePage.getByText('请确认正在通过 Novelist 桌面应用打开此界面'), 'bridge unavailable guidance')
  await bridgeUnavailablePage.screenshot({ path: path.join(outputDir, 'app-00-bootstrap.png'), fullPage: true })
  await bridgeUnavailablePage.close()
}

export async function verifyFixtureFaultModes(browser, url, consoleErrors, pageErrors) {
  const faultPage = await newAppPage(browser, consoleErrors, pageErrors, {
    initialized: true,
    faults: {
      FaultSlowProbe: { delayMs: 80 },
      FaultValidationProbe: { mode: 'validation', message: '模拟校验错误' },
      FaultStorageProbe: { mode: 'storage', message: '模拟存储错误' },
      FaultMalformedProbe: { mode: 'malformed-response' },
      FaultTimeoutProbe: { mode: 'timeout' },
      FaultResetProbe: { mode: 'validation', message: '一次性 fixture 错误' },
    },
  }, undefined, 'fixture-fault-modes')

  await faultPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(faultPage.getByText('全局回归小说'), 'fixture fault workspace')

  const success = await invokeProbe(faultPage, 'FaultSuccessProbe')
  assert.equal(success.ok, true, 'default fixture path should succeed')

  const slow = await invokeProbe(faultPage, 'FaultSlowProbe')
  assert.equal(slow.ok, true, 'slow fixture path should still succeed')
  assert(slow.elapsedMs >= 40, `slow fixture should delay the response, got ${slow.elapsedMs}ms`)

  const validation = await invokeProbe(faultPage, 'FaultValidationProbe')
  assert.equal(validation.ok, false, 'validation fixture should reject')
  assert.equal(validation.code, 'VALIDATION_ERROR')
  assert.match(validation.message, /模拟校验错误/)

  const storage = await invokeProbe(faultPage, 'FaultStorageProbe')
  assert.equal(storage.ok, false, 'storage fixture should reject')
  assert.equal(storage.code, 'STORAGE_ERROR')
  assert.match(storage.message, /模拟存储错误/)

  const malformed = await invokeProbe(faultPage, 'FaultMalformedProbe')
  assert.equal(malformed.ok, false, 'malformed fixture response should reject')
  assert.equal(malformed.code, 'INVALID_BRIDGE_RESPONSE')
  assert.match(malformed.message, /missing an ok flag/)

  const timeout = await invokeProbe(faultPage, 'FaultTimeoutProbe', 20)
  assert.equal(timeout.ok, false, 'timeout fixture should reject')
  assert.equal(timeout.code, 'REQUEST_TIMEOUT')
  assert.equal(timeout.retryable, true)

  const resetFailure = await invokeProbe(faultPage, 'FaultResetProbe')
  assert.equal(resetFailure.ok, false, 'reset probe should fail in the faulted page')
  await faultPage.close()

  const resetPage = await newAppPage(browser, consoleErrors, pageErrors, { initialized: true }, undefined, 'fixture-reset')
  await resetPage.goto(url, { waitUntil: 'domcontentloaded' })
  await expectVisible(resetPage.getByText('全局回归小说'), 'fixture reset workspace')
  const resetSuccess = await invokeProbe(resetPage, 'FaultResetProbe')
  assert.equal(resetSuccess.ok, true, 'fixture state must reset for a new page')
  await resetPage.close()
}

async function invokeProbe(page, method, timeoutMs = 1_000) {
  return await page.evaluate(
    async ({ method, timeoutMs }) => {
      const startedAt = performance.now()
      try {
        const result = await window.novelist.invoke(method, {}, { timeoutMs })
        return {
          ok: true,
          result,
          elapsedMs: performance.now() - startedAt,
        }
      } catch (error) {
        return {
          ok: false,
          name: error instanceof Error ? error.name : '',
          message: error instanceof Error ? error.message : String(error),
          code: typeof error === 'object' && error !== null && 'code' in error ? error.code : '',
          retryable: typeof error === 'object' && error !== null && 'retryable' in error ? error.retryable : false,
          elapsedMs: performance.now() - startedAt,
        }
      }
    },
    { method, timeoutMs },
  )
}
