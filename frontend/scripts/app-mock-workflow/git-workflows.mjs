import assert from 'node:assert/strict'
import { assertGitHistoryReadOnlyCalls } from './bridge-guardrails.mjs'
import { newAppPage } from './app-harness.mjs'
import {
  assertCopyableDiagnostic,
  assertNoSensitiveDiagnosticsVisible,
  errorAlert,
  installClipboardSpy,
  sensitiveDiagnosticDetails,
} from './diagnostic-helpers.mjs'
import { clickActivity } from './navigation-helpers.mjs'
import { expectVisible } from './page-helpers.mjs'

export async function verifyGitHistoryWorkflow(page, browser, url, consoleErrors, pageErrors) {
  await clickActivity(page, 'Git 历史')
  await expectVisible(page.getByRole('heading', { name: 'Git 历史' }), 'Git history heading')
  await expectVisible(page.getByText('4 个提交'), 'Git history total count')
  await expectVisible(page.getByText('rename rain clue chapter').first(), 'Git history first commit')
  await expectVisible(page.getByText('delete obsolete note').first(), 'Git history second commit')
  await expectVisible(page.getByText('add outline seed').first(), 'Git history third commit')

  await page.getByRole('button', { name: /rename rain clue chapter/ }).click()
  await expectVisible(page.getByText('chapters/renamed-rain.md').first(), 'renamed file entry')
  await expectVisible(page.getByText('chapters/rain.md -> chapters/renamed-rain.md').first(), 'renamed file old path marker')
  await expectVisible(page.getByText('covers/rain.bin').first(), 'binary file entry')

  await page.getByRole('button', { name: /chapters\/renamed-rain\.md/ }).click()
  await expectVisible(page.getByRole('heading', { name: 'chapters/renamed-rain.md' }), 'renamed diff heading')
  await expectVisible(page.getByText('重命名').first(), 'renamed diff badge')
  await expectVisible(page.getByText('chapters/rain.md -> chapters/renamed-rain.md').first(), 'renamed diff path')
  await expectVisible(page.getByText('old rain clue').first(), 'renamed original content')
  await expectVisible(page.getByText('new rain clue').first(), 'renamed modified content')

  await page.getByRole('button', { name: /notes\/rhythm\.md/ }).click()
  await expectVisible(page.getByRole('heading', { name: 'notes/rhythm.md' }), 'modified diff heading')
  await expectVisible(page.getByText('内容已截断'), 'truncated diff state')

  await page.getByRole('button', { name: /covers\/rain\.bin/ }).click()
  await expectVisible(page.getByRole('heading', { name: 'covers/rain.bin' }), 'binary diff heading')
  await expectVisible(page.getByText('二进制文件不展示文本 diff'), 'binary diff state')

  await page.getByRole('button', { name: /delete obsolete note/ }).click()
  await expectVisible(page.getByText('notes/deleted.md').first(), 'deleted file entry')
  await page.getByRole('button', { name: /notes\/deleted\.md/ }).click()
  await expectVisible(page.getByRole('heading', { name: 'notes/deleted.md' }), 'deleted diff heading')
  await expectVisible(page.getByText('旧笔记将被删除。').first(), 'deleted original content')
  await expectVisible(page.getByText('无修改后内容'), 'deleted modified content empty state')

  await page.getByRole('button', { name: /add outline seed/ }).click()
  await expectVisible(page.getByText('chapters/new-outline.md').first(), 'added file entry')
  await page.getByRole('button', { name: /chapters\/new-outline\.md/ }).click()
  await expectVisible(page.getByRole('heading', { name: 'chapters/new-outline.md' }), 'added diff heading')
  await expectVisible(page.getByText('新增').first(), 'added diff badge')
  await expectVisible(page.getByText('无原始内容'), 'added original content empty state')
  await expectVisible(page.getByText('新的章节纲要。').first(), 'added modified content')

  const olderCommit = page.getByText('initial import').first()
  if (!(await olderCommit.isVisible().catch(() => false))) {
    const loadOlder = page.getByRole('button', { name: '加载更早提交' })
    if (await loadOlder.isVisible().catch(() => false)) {
      await loadOlder.click()
    }
  }
  await expectVisible(olderCommit, 'older Git commit after cursor paging')
  await expectVisible(page.getByText('已到最早提交'), 'Git history end marker')

  const gitCalls = await page.evaluate(() =>
    window.__appMockState.calls
      .filter((call) => call.method === 'GetGitCommits')
      .map((call) => call.args?.[0] ?? null))
  assert(gitCalls.length >= 2, 'Git history workflow must request at least two commit pages')
  assert(
    gitCalls.some((input) => input?.cursor_commit_id === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'Git history paging must send the previous page cursor_commit_id')

  await page.getByRole('button', { name: /复制诊断|已复制|复制失败/ }).click()

  await verifyGitHistoryEmptyRepo(browser, url, consoleErrors, pageErrors)
  await verifyGitHistoryFailureRecovery(browser, url, consoleErrors, pageErrors)
  await verifyGitHistoryCompactViewport(browser, url, consoleErrors, pageErrors)
}

async function verifyGitHistoryEmptyRepo(browser, url, consoleErrors, pageErrors) {
  const page = await newAppPage(
    browser,
    consoleErrors,
    pageErrors,
    {
      initialized: true,
      gitCommits: [],
      gitCommitFilesByCommitId: {},
      gitDiffsByCommitAndPath: {},
    },
    { width: 1100, height: 780 },
    'git-empty-repo',
  )
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clickActivity(page, 'Git 历史')
  await expectVisible(page.getByText('0 个提交'), 'empty Git history count')
  await expectVisible(page.getByText('暂无 Git 提交'), 'empty Git history state')
  await assertGitHistoryReadOnlyCalls(page)
  await page.close()
}

async function verifyGitHistoryFailureRecovery(browser, url, consoleErrors, pageErrors) {
  const page = await newAppPage(
    browser,
    consoleErrors,
    pageErrors,
    {
      initialized: true,
      faults: {
        GetGitCommits: {
          mode: 'error',
          code: 'VERSION_CONTROL_ERROR',
          message: 'Git executable not found',
          details: sensitiveDiagnosticDetails(),
          retryable: true,
        },
      },
    },
    { width: 1100, height: 780 },
    'git-failure-retry',
  )
  await installClipboardSpy(page)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clickActivity(page, 'Git 历史')
  await expectVisible(page.getByText('Git executable not found'), 'Git history failure message')
  const gitAlert = errorAlert(page, 'Git executable not found')
  await assertNoSensitiveDiagnosticsVisible(page)
  await assertCopyableDiagnostic(page, gitAlert, 'GetGitCommits')
  await page.getByRole('button', { name: '重试' }).first().click()
  await expectVisible(page.getByText('rename rain clue chapter').first(), 'Git history retry recovery')
  await assertGitHistoryReadOnlyCalls(page)
  await page.close()
}

async function verifyGitHistoryCompactViewport(browser, url, consoleErrors, pageErrors) {
  const page = await newAppPage(
    browser,
    consoleErrors,
    pageErrors,
    { initialized: true },
    { width: 900, height: 720 },
    'git-compact',
  )
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await clickActivity(page, 'Git 历史')
  await expectVisible(page.getByRole('heading', { name: 'Git 历史' }), 'compact Git history heading')
  await expectVisible(page.getByText('rename rain clue chapter').first(), 'compact Git history first commit')
  await page.getByRole('button', { name: /rename rain clue chapter/ }).click()
  await expectVisible(page.getByText('chapters/renamed-rain.md').first(), 'compact Git changed file list')
  await assertGitHistoryReadOnlyCalls(page)
  await page.close()
}

export async function verifyRelativeTimeRefreshWorkflow(browser, url, consoleErrors, pageErrors) {
  const sessionId = 'relative-session-1'
  const commitId = '1111111111111111111111111111111111111111'
  const page = await newAppPage(
    browser,
    consoleErrors,
    pageErrors,
    {
      initialized: true,
      sessions: [
        {
          session_id: sessionId,
          novel_id: 42,
          title: '短时刷新会话',
          updated_at: '2026-07-05T12:09:00.000Z',
        },
      ],
      gitCommits: [
        {
          commit_id: commitId,
          short_commit_id: '1111111',
          author_name: 'Mock Author',
          author_email: 'mock@example.com',
          message: 'relative time commit',
          committed_at: '2026-07-05T12:09:00.000Z',
          changed_file_count: 1,
          insertions: 1,
          deletions: 0,
        },
      ],
      gitCommitFilesByCommitId: {
        [commitId]: [
          {
            path: 'chapters/time.md',
            old_path: null,
            change_type: 'modified',
            additions: 1,
            deletions: 0,
            binary: false,
          },
        ],
      },
      gitDiffsByCommitAndPath: {
        [`${commitId}:chapters/time.md`]: {
          path: 'chapters/time.md',
          old_path: null,
          change_type: 'modified',
          binary: false,
          truncated: false,
          original_content: '旧时间标签',
          modified_content: '新时间标签',
          diff_text: '-旧时间标签\n+新时间标签',
        },
      },
    },
    { width: 1280, height: 900 },
    'relative-time',
  )
  await page.clock.install({ time: new Date('2026-07-05T12:10:00.000Z') })
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const recentSession = page.getByRole('button', { name: /短时刷新会话/ }).first()
  await expectVisible(recentSession, 'recent session fixture')
  await expectVisible(recentSession.getByText('1分钟前'), 'recent session initial relative time')

  await page.locator('aside').getByRole('button', { name: /历史/ }).click()
  await expectVisible(page.getByText('历史会话'), 'session history panel')
  await expectVisible(page.getByText('短时刷新会话').last(), 'session history fixture')
  await expectVisible(page.getByText('1分钟前').last(), 'session history initial relative time')

  await clickActivity(page, 'Git 历史')
  const gitCommit = page.getByRole('button', { name: /relative time commit/ })
  await expectVisible(gitCommit, 'relative-time Git commit')
  await expectVisible(gitCommit.getByText('1分钟前'), 'Git initial relative time')

  await page.clock.fastForward(125_000)

  await expectVisible(recentSession.getByText('3分钟前'), 'recent session refreshed relative time')
  await expectVisible(gitCommit.getByText('3分钟前'), 'Git refreshed relative time')

  await assertGitHistoryReadOnlyCalls(page)
  await page.close()
}
