import { useCallback, useEffect, useRef, useState } from 'react'
import type { diagnostics, pattern } from '@/lib/novelist/types'
import { EventsOn } from '@/lib/novelist/events'
import { buildCopyableDiagnostic, diagnosticMessage } from '@/lib/diagnostics'

export const NARRATIVE_PATTERN_PROGRESS_EVENT = 'narrative_pattern_extraction:progress'

export type PatternExtractionUiStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface PatternExtractionUiState {
  status: PatternExtractionUiStatus
  taskId: string | null
  input: pattern.StartNarrativePatternExtractionInput | null
  progress: pattern.NarrativePatternProgress | null
  timeline: pattern.NarrativePatternProgress[]
  run: pattern.NarrativePatternRun | null
  trace: pattern.NarrativePatternTrace | null
  errorMessage: string
  errorDiagnostic: diagnostics.CopyableDiagnostic | null
}

interface UsePatternProgressOptions {
  onStart: (input: pattern.StartNarrativePatternExtractionInput) => Promise<pattern.NarrativePatternRun>
  onCancel: (input: pattern.CancelNarrativePatternExtractionInput) => Promise<pattern.NarrativePatternRun>
  onGetTrace: (input: pattern.GetNarrativePatternRunInput) => Promise<pattern.NarrativePatternTrace | null>
}

const IDLE_STATE: PatternExtractionUiState = {
  status: 'idle',
  taskId: null,
  input: null,
  progress: null,
  timeline: [],
  run: null,
  trace: null,
  errorMessage: '',
  errorDiagnostic: null,
}

export function usePatternProgress({
  onStart,
  onCancel,
  onGetTrace,
}: UsePatternProgressOptions) {
  const [state, setState] = useState<PatternExtractionUiState>(IDLE_STATE)
  const activeTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    return EventsOn<pattern.NarrativePatternProgress>(NARRATIVE_PATTERN_PROGRESS_EVENT, progress => {
      const activeTaskId = activeTaskIdRef.current
      if (!activeTaskId || progress.task_id !== activeTaskId) return

      setState(current => {
        if (current.taskId !== progress.task_id) return current
        return {
          ...current,
          progress,
          timeline: appendProgress(current.timeline, progress),
          status: statusFromProgress(progress, current.status),
        }
      })
    })
  }, [])

  const start = useCallback(async (input: pattern.StartNarrativePatternExtractionInput) => {
    activeTaskIdRef.current = input.task_id
    setState({
      status: 'running',
      taskId: input.task_id,
      input,
      progress: {
        task_id: input.task_id,
        status: 'queued',
        stage: 'queued',
        progress_completed: 0,
        progress_total: 1,
        message: '叙事模式抽取已提交，等待后端开始。',
        updated_at: new Date().toISOString(),
        llm_status: 'queued',
      },
      timeline: [],
      run: null,
      trace: null,
      errorMessage: '',
      errorDiagnostic: null,
    })

    try {
      const run = await onStart(input)
      if (activeTaskIdRef.current !== input.task_id) return run

      let trace: pattern.NarrativePatternTrace | null = null
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        trace = await onGetTrace({ task_id: input.task_id })
      }

      activeTaskIdRef.current = null
      setState(current => ({
        ...current,
        run,
        trace,
        progress: current.progress ?? progressFromRun(run),
        status: statusFromRun(run),
        errorMessage: errorMessageFromRun(run),
        errorDiagnostic: run.diagnostics?.[0] ?? null,
      }))
      return run
    } catch (error) {
      if (activeTaskIdRef.current !== input.task_id) return null

      const fallbackMessage = '叙事模式抽取失败，请重试。'
      activeTaskIdRef.current = null
      setState(current => ({
        ...current,
        status: 'error',
        errorMessage: diagnosticMessage(error, fallbackMessage),
        errorDiagnostic: buildCopyableDiagnostic({
          error,
          fallbackMessage,
          operation: 'StartNarrativePatternExtraction',
          taskId: input.task_id,
          bridgeMethod: 'StartNarrativePatternExtraction',
          detail: safePatternInputDetail(input),
        }),
      }))
      return null
    }
  }, [onGetTrace, onStart])

  const cancel = useCallback(async () => {
    const taskId = activeTaskIdRef.current
    if (!taskId) return null

    setState(current => ({
      ...current,
      status: 'cancelling',
      progress: current.progress
        ? { ...current.progress, message: '正在取消叙事模式抽取。' }
        : current.progress,
    }))

    try {
      const run = await onCancel({ task_id: taskId, reason: 'User cancelled narrative pattern extraction from the UI.' })
      if (activeTaskIdRef.current !== taskId) return run

      activeTaskIdRef.current = null
      const trace = await onGetTrace({ task_id: taskId })
      setState(current => ({
        ...current,
        run,
        trace,
        progress: current.progress ?? progressFromRun(run),
        status: statusFromRun(run),
        errorMessage: errorMessageFromRun(run),
        errorDiagnostic: run.diagnostics?.[0] ?? null,
      }))
      return run
    } catch (error) {
      if (activeTaskIdRef.current !== taskId) return null

      const fallbackMessage = '取消叙事模式抽取失败。'
      setState(current => ({
        ...current,
        status: 'running',
        errorMessage: diagnosticMessage(error, fallbackMessage),
        errorDiagnostic: buildCopyableDiagnostic({
          error,
          fallbackMessage,
          operation: 'CancelNarrativePatternExtraction',
          taskId,
          bridgeMethod: 'CancelNarrativePatternExtraction',
          detail: { phase: 'cancel_pattern_extraction' },
        }),
      }))
      return null
    }
  }, [onCancel, onGetTrace])

  const reset = useCallback(() => {
    activeTaskIdRef.current = null
    setState(IDLE_STATE)
  }, [])

  return {
    state,
    start,
    cancel,
    reset,
  }
}

function appendProgress(
  timeline: pattern.NarrativePatternProgress[],
  progress: pattern.NarrativePatternProgress,
): pattern.NarrativePatternProgress[] {
  const last = timeline.at(-1)
  if (
    last &&
    last.stage === progress.stage &&
    last.status === progress.status &&
    last.progress_completed === progress.progress_completed &&
    last.progress_total === progress.progress_total &&
    last.message === progress.message
  ) {
    return [...timeline.slice(0, -1), progress]
  }

  return [...timeline, progress].slice(-40)
}

function statusFromProgress(
  progress: pattern.NarrativePatternProgress,
  current: PatternExtractionUiStatus,
): PatternExtractionUiStatus {
  if (current === 'cancelling') return 'cancelling'
  return statusFromRunStatus(progress.status)
}

function statusFromRun(run: pattern.NarrativePatternRun): PatternExtractionUiStatus {
  return statusFromRunStatus(run.status)
}

function statusFromRunStatus(status: string): PatternExtractionUiStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'error'
    default:
      return 'running'
  }
}

function progressFromRun(run: pattern.NarrativePatternRun): pattern.NarrativePatternProgress {
  return {
    task_id: run.task_id,
    status: run.status,
    stage: run.stage,
    progress_completed: run.progress_completed,
    progress_total: run.progress_total,
    message: errorMessageFromRun(run) || '叙事模式抽取状态已更新。',
    updated_at: run.updated_at,
    llm_status: run.status,
  }
}

function errorMessageFromRun(run: pattern.NarrativePatternRun): string {
  if (run.status !== 'failed') return ''
  const first = run.diagnostics?.[0]
  if (!first) return '叙事模式抽取失败。'
  return diagnosticMessage(first.detail ? `${first.message} ${first.detail}` : first.message, '叙事模式抽取失败。')
}

function safePatternInputDetail(input: pattern.StartNarrativePatternExtractionInput): Record<string, unknown> {
  return {
    novel_id: input.novel_id,
    chapter_ranges: input.chapter_ranges,
    selected_chapter_ids: input.selected_chapter_ids,
    provider_name: input.provider_name,
    model_id: input.model_id,
    reasoning_effort: input.reasoning_effort,
    skill_name: input.skill_name,
  }
}
