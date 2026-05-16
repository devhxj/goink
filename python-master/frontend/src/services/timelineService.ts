import apiClient from './apiClient'
import type {
  TimelineEntry,
  TimelineEntryCreate,
  TimelineEntryUpdate,
  TimelineEntryStatusUpdate,
  TimelineStats,
  TimelineContextEntry,
} from '@/types/timeline'
import type { ApiResponse, PaginatedResponse } from '@/types/api'

export interface TimelineListParams {
  page?: number
  page_size?: number
  category?: string
  status?: string
  time_horizon?: string
  search?: string
  sort_by?: string
  sort_order?: string
}

export const timelineApi = {
  getTimelineEntries: async (
    novelId: number,
    params?: TimelineListParams
  ): Promise<ApiResponse<PaginatedResponse<TimelineEntry>>> => {
    return apiClient.get(`/timeline/novels/${novelId}`, { params })
  },

  createTimelineEntry: async (
    novelId: number,
    data: TimelineEntryCreate
  ): Promise<ApiResponse<TimelineEntry>> => {
    return apiClient.post(`/timeline/novels/${novelId}/entries`, data)
  },

  getTimelineEntry: async (
    novelId: number,
    entryId: number
  ): Promise<ApiResponse<TimelineEntry>> => {
    return apiClient.get(`/timeline/novels/${novelId}/entries/${entryId}`)
  },

  updateTimelineEntry: async (
    novelId: number,
    entryId: number,
    data: TimelineEntryUpdate
  ): Promise<ApiResponse<TimelineEntry>> => {
    return apiClient.put(`/timeline/novels/${novelId}/entries/${entryId}`, data)
  },

  updateTimelineEntryStatus: async (
    novelId: number,
    entryId: number,
    data: TimelineEntryStatusUpdate
  ): Promise<ApiResponse<TimelineEntry>> => {
    return apiClient.patch(`/timeline/novels/${novelId}/entries/${entryId}/status`, data)
  },

  deleteTimelineEntry: async (
    novelId: number,
    entryId: number
  ): Promise<ApiResponse<null>> => {
    return apiClient.delete(`/timeline/novels/${novelId}/entries/${entryId}`)
  },

  getTimelineContext: async (
    novelId: number,
    params?: { current_chapter?: number; max_entries?: number }
  ): Promise<ApiResponse<{ entries: TimelineContextEntry[] }>> => {
    return apiClient.get(`/timeline/novels/${novelId}/context`, { params })
  },

  getTimelineStats: async (novelId: number): Promise<ApiResponse<TimelineStats>> => {
    return apiClient.get(`/timeline/novels/${novelId}/stats`)
  },
}
