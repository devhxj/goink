import apiClient from './apiClient'
import type { ApiResponse } from '@/types/api'
import type { PlotProgress } from '@/types/progress'

export const progressApi = {
  getPlotProgress: async (novelId: number): Promise<ApiResponse<PlotProgress>> => {
    return apiClient.get(`/planning/novels/${novelId}/progress`)
  },
}
