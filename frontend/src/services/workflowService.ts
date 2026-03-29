import apiClient from './apiClient'
import type { ApiResponse, PaginatedResponse } from '@/types/api'
import type {
  WorkflowGenerateRequest,
  WorkflowGenerateResponse,
  WorkflowState,
  WorkflowTask,
  WorkflowHealth,
} from '@/types/workflow'

export const workflowApi = {
  generateChapter: async (
    novelId: number,
    data: WorkflowGenerateRequest
  ): Promise<ApiResponse<WorkflowGenerateResponse>> => {
    return apiClient.post(
      `/workflows/novels/${novelId}/chapters/${data.chapter_number}/generate`,
      null,
      {
        params: {
          target_length: data.target_length,
          style: data.style,
        },
      }
    )
  },

  getTaskStatus: async (taskId: string): Promise<ApiResponse<WorkflowState>> => {
    return apiClient.get(`/workflows/tasks/${taskId}/status`)
  },

  listNovelWorkflows: async (
    novelId: number,
    params?: {
      status?: string
      page?: number
      page_size?: number
    }
  ): Promise<ApiResponse<PaginatedResponse<WorkflowTask>>> => {
    return apiClient.get(`/workflows/novels/${novelId}/workflows`, { params })
  },

  checkHealth: async (): Promise<ApiResponse<WorkflowHealth>> => {
    return apiClient.get('/workflows/health')
  },
}
