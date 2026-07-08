import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  closeOpenPages,
  diagnostics,
  frontendRoot,
  logStep,
  outputDir,
  repoRoot,
  runConfig,
  writeRunDiagnostics,
} from './app-mock-workflow/app-harness.mjs'
import { getFreePort, launchBrowser, startServer, stopProcess, waitForServer } from './app-mock-workflow/runtime.mjs'
import {
  runFullSuite,
  runSmokeSuite,
  runStressSuite,
  runUsabilitySuite,
} from './app-mock-workflow/suite-runners.mjs'

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.mkdir(path.join(outputDir, 'bridge-calls'), { recursive: true })
  await fs.mkdir(path.join(outputDir, 'traces'), { recursive: true })

  const port = await getFreePort()
  const server = startServer(port, runConfig.target, frontendRoot)
  const url = `http://127.0.0.1:${port}/`
  let browser

  try {
    logStep(`waiting for ${runConfig.target} server`)
    await waitForServer(url, server)
    browser = await launchBrowser(logStep)

    if (runConfig.suite === 'smoke') {
      await runSmokeSuite(browser, url)
    } else if (runConfig.suite === 'stress') {
      await runStressSuite(browser, url)
    } else if (runConfig.suite === 'usability') {
      await runUsabilitySuite(browser, url)
    } else {
      await runFullSuite(browser, url)
    }

    await writeRunDiagnostics()
    assert.deepEqual(diagnostics.pageErrors, [], `Unexpected page errors:\n${diagnostics.pageErrors.join('\n')}`)
    assert.deepEqual(diagnostics.consoleErrors, [], `Unexpected console errors:\n${diagnostics.consoleErrors.join('\n')}`)
    assert.deepEqual(diagnostics.failedRequests, [], `Unexpected failed requests:\n${diagnostics.failedRequests.join('\n')}`)
    console.log(`App ${runConfig.suite} mock workflow passed. Artifacts: ${path.relative(repoRoot, outputDir)}`)
  } catch (error) {
    await closeOpenPages()
    await writeRunDiagnostics().catch((diagnosticError) => {
      console.error('Failed to write diagnostics after app mock failure:', diagnosticError)
    })
    throw error
  } finally {
    await browser?.close()
    stopProcess(server)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
