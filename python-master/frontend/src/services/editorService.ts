import apiClient from './apiClient'
import type { ApiResponse } from '@/types/api'

export interface AcceptEditResponse {
  edit_session_id: string
  chapter_id: number
  change_count: number
  word_count: number
  already_processed?: boolean
  message: string
}

export interface RejectEditResponse {
  edit_session_id: string
  chapter_id: number
  already_processed?: boolean
  message: string
}

export interface ChapterEditStatus {
  has_active_edit: boolean
  edit_session_id?: string
  latest_pending_edit_session_id?: string | null
  status?: string
  change_count?: number
  working_content?: string
  original_content?: string
  diff?: Record<string, unknown>
  chapter_content?: string
  created_from_ws_session?: string
  message?: string
}

export interface ChapterForEditor {
  chapter_id: number
  chapter_number: number
  title: string
  content: string
  word_count: number
  status: string
  has_active_edit: boolean
  edit_session_id: string | null
  latest_pending_edit_session_id: string | null
  working_content: string | null
  change_count: number
}

export const editorApi = {
  acceptEdit: (editSessionId: string): Promise<ApiResponse<AcceptEditResponse>> => {
    return apiClient.post(`/editor/session/${editSessionId}/accept`)
  },

  rejectEdit: (editSessionId: string): Promise<ApiResponse<RejectEditResponse>> => {
    return apiClient.post(`/editor/session/${editSessionId}/reject`)
  },

  getEditStatus: (editSessionId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiClient.get(`/editor/session/${editSessionId}`)
  },

  getChapterEditStatus: (chapterId: number): Promise<ApiResponse<ChapterEditStatus>> => {
    return apiClient.get(`/editor/chapter/${chapterId}/status`)
  },

  getChapterForEditor: (chapterId: number): Promise<ApiResponse<ChapterForEditor>> => {
    return apiClient.get(`/editor/chapter/${chapterId}`)
  },
}
