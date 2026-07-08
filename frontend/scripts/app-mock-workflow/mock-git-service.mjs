export function createMockGitService() {
  function createDefaultGitMockFixtures() {
    const gitCommitIds = {
      rename: 'cccccccccccccccccccccccccccccccccccccccc',
      delete: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      add: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      initial: '9999999999999999999999999999999999999999',
    }
    const commits = [
      {
        commit_id: gitCommitIds.rename,
        short_commit_id: 'ccccccc',
        author_name: 'Mock Author',
        author_email: 'mock@example.com',
        message: 'rename rain clue chapter',
        committed_at: '2026-07-05T12:10:00.000Z',
        changed_file_count: 3,
        insertions: 6,
        deletions: 2,
      },
      {
        commit_id: gitCommitIds.delete,
        short_commit_id: 'bbbbbbb',
        author_name: 'Mock Author',
        author_email: 'mock@example.com',
        message: 'delete obsolete note',
        committed_at: '2026-07-05T12:08:00.000Z',
        changed_file_count: 1,
        insertions: 0,
        deletions: 2,
      },
      {
        commit_id: gitCommitIds.add,
        short_commit_id: 'aaaaaaa',
        author_name: 'Mock Author',
        author_email: 'mock@example.com',
        message: 'add outline seed',
        committed_at: '2026-07-05T12:06:00.000Z',
        changed_file_count: 1,
        insertions: 5,
        deletions: 0,
      },
      {
        commit_id: gitCommitIds.initial,
        short_commit_id: '9999999',
        author_name: 'Mock Author',
        author_email: 'mock@example.com',
        message: 'initial import',
        committed_at: '2026-07-05T12:00:00.000Z',
        changed_file_count: 1,
        insertions: 12,
        deletions: 0,
      },
    ]
    const commitFilesByCommitId = {
      [gitCommitIds.rename]: [
        {
          path: 'chapters/renamed-rain.md',
          old_path: 'chapters/rain.md',
          change_type: 'renamed',
          additions: 3,
          deletions: 1,
          binary: false,
        },
        {
          path: 'notes/rhythm.md',
          old_path: null,
          change_type: 'modified',
          additions: 3,
          deletions: 1,
          binary: false,
        },
        {
          path: 'covers/rain.bin',
          old_path: null,
          change_type: 'modified',
          additions: 0,
          deletions: 0,
          binary: true,
        },
      ],
      [gitCommitIds.delete]: [
        {
          path: 'notes/deleted.md',
          old_path: null,
          change_type: 'deleted',
          additions: 0,
          deletions: 2,
          binary: false,
        },
      ],
      [gitCommitIds.add]: [
        {
          path: 'chapters/new-outline.md',
          old_path: null,
          change_type: 'added',
          additions: 5,
          deletions: 0,
          binary: false,
        },
      ],
      [gitCommitIds.initial]: [
        {
          path: 'novelist.md',
          old_path: null,
          change_type: 'modified',
          additions: 12,
          deletions: 0,
          binary: false,
        },
      ],
    }
    const diffsByCommitAndPath = {
      [`${gitCommitIds.rename}:chapters/renamed-rain.md`]: {
        commit_id: gitCommitIds.rename,
        path: 'chapters/renamed-rain.md',
        old_path: 'chapters/rain.md',
        change_type: 'renamed',
        diff_text: 'diff --git a/chapters/rain.md b/chapters/renamed-rain.md\nsimilarity index 78%\nrename from chapters/rain.md\nrename to chapters/renamed-rain.md\n@@\n-old rain clue\n+new rain clue',
        truncated: false,
        binary: false,
        original_content: 'old rain clue\n桌面水痕仍未解释。',
        modified_content: 'new rain clue\n桌面水痕被重新排列。',
      },
      [`${gitCommitIds.rename}:notes/rhythm.md`]: {
        commit_id: gitCommitIds.rename,
        path: 'notes/rhythm.md',
        old_path: null,
        change_type: 'modified',
        diff_text: 'diff --git a/notes/rhythm.md b/notes/rhythm.md\n@@\n-短句。\n+短句推进，动作留白。',
        truncated: true,
        binary: false,
        original_content: '短句。\n雨声停在窗外。',
        modified_content: '短句推进，动作留白。\n雨声停在窗外。',
      },
      [`${gitCommitIds.rename}:covers/rain.bin`]: {
        commit_id: gitCommitIds.rename,
        path: 'covers/rain.bin',
        old_path: null,
        change_type: 'modified',
        diff_text: '',
        truncated: false,
        binary: true,
        original_content: null,
        modified_content: null,
      },
      [`${gitCommitIds.delete}:notes/deleted.md`]: {
        commit_id: gitCommitIds.delete,
        path: 'notes/deleted.md',
        old_path: null,
        change_type: 'deleted',
        diff_text: 'diff --git a/notes/deleted.md b/notes/deleted.md\ndeleted file mode 100644\n@@\n-旧笔记将被删除。\n-它不再参与线索。',
        truncated: false,
        binary: false,
        original_content: '旧笔记将被删除。\n它不再参与线索。',
        modified_content: null,
      },
      [`${gitCommitIds.add}:chapters/new-outline.md`]: {
        commit_id: gitCommitIds.add,
        path: 'chapters/new-outline.md',
        old_path: null,
        change_type: 'added',
        diff_text: 'diff --git a/chapters/new-outline.md b/chapters/new-outline.md\nnew file mode 100644\n@@\n+新的章节纲要。\n+保留水痕、门缝和停顿。',
        truncated: false,
        binary: false,
        original_content: null,
        modified_content: '新的章节纲要。\n保留水痕、门缝和停顿。',
      },
      [`${gitCommitIds.initial}:novelist.md`]: {
        commit_id: gitCommitIds.initial,
        path: 'novelist.md',
        old_path: null,
        change_type: 'modified',
        diff_text: 'diff --git a/novelist.md b/novelist.md\n@@\n+## 当前状态\n+林岚正在调查旧城门。',
        truncated: false,
        binary: false,
        original_content: null,
        modified_content: '## 当前状态\n林岚正在调查旧城门。',
      },
    }

    return {
      commits,
      commitFilesByCommitId,
      diffsByCommitAndPath,
    }
  }

  function getGitCommits(state, input = {}) {
    const page = Math.max(1, Number(input?.page ?? 1))
    const size = Math.max(1, Math.min(100, Number(input?.size ?? 20)))
    const cursorCommitId = String(input?.cursor_commit_id ?? '')
    const commits = state.gitCommits.map(cloneJson)
    const startIndex = cursorCommitId
      ? Math.max(0, commits.findIndex((commit) => commit.commit_id === cursorCommitId) + 1)
      : (page - 1) * size
    const items = commits.slice(startIndex, startIndex + size)
    return pagedResult(items, page, size, commits.length)
  }

  function getGitCommitFiles(state, input = {}) {
    const commitId = String(input?.commit_id ?? '')
    return (state.gitCommitFilesByCommitId[commitId] ?? []).map(cloneJson)
  }

  function getGitFileDiff(state, input = {}) {
    const commitId = String(input?.commit_id ?? '')
    const filePath = String(input?.path ?? '')
    const diff = state.gitDiffsByCommitAndPath[`${commitId}:${filePath}`]
    if (!diff) {
      throw new Error(`Unknown Git diff fixture for ${commitId}:${filePath}`)
    }
    return cloneJson(diff)
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function pagedResult(items, page, size, total) {
    return {
      items,
      total,
      page,
      size,
      total_pages: Math.max(1, Math.ceil(total / size)),
    }
  }

  return {
    createDefaultGitMockFixtures,
    getGitCommitFiles,
    getGitCommits,
    getGitFileDiff,
  }
}

export const {
  createDefaultGitMockFixtures,
  getGitCommitFiles,
  getGitCommits,
  getGitFileDiff,
} = createMockGitService()
