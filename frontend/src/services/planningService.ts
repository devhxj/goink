import apiClient from './apiClient'
import type { ApiResponse } from '@/types/api'
import type {
  PlotOutline,
  PlotOutlineCreate,
  PlotOutlineUpdate,
  PlotLine,
  PlotLineCreate,
  PlotLineUpdate,
  PlotNode,
  PlotNodeCreate,
  PlotNodeUpdate,
  PlotSuggestionRequest,
  PlotSuggestionResponse,
  PlotProgress,
} from '@/types/planning'

export const planningApi = {
  getOutline: async (novelId: number): Promise<ApiResponse<PlotOutline | { exists: false; message: string }>> => {
    return apiClient.get(`/planning/novels/${novelId}/outline`)
  },

  createOutline: async (novelId: number, data: PlotOutlineCreate): Promise<ApiResponse<{ id: number; title: string; message: string }>> => {
    return apiClient.post(`/planning/novels/${novelId}/outline`, data)
  },

  updateOutline: async (novelId: number, data: PlotOutlineUpdate): Promise<ApiResponse<{ id: number; title: string; message: string }>> => {
    return apiClient.put(`/planning/novels/${novelId}/outline`, data)
  },

  listPlotLines: async (
    novelId: number,
    params?: { line_type?: string; status?: string }
  ): Promise<ApiResponse<{ items: PlotLine[]; total: number }>> => {
    return apiClient.get(`/planning/novels/${novelId}/plot-lines`, { params })
  },

  createPlotLine: async (
    novelId: number,
    data: PlotLineCreate
  ): Promise<ApiResponse<{ id: number; name: string; line_type: string; message: string }>> => {
    return apiClient.post(`/planning/novels/${novelId}/plot-lines`, data)
  },

  getPlotLine: async (plotLineId: number): Promise<ApiResponse<PlotLine>> => {
    return apiClient.get(`/planning/plot-lines/${plotLineId}`)
  },

  updatePlotLine: async (
    plotLineId: number,
    data: PlotLineUpdate
  ): Promise<ApiResponse<{ id: number; name: string; message: string }>> => {
    return apiClient.put(`/planning/plot-lines/${plotLineId}`, data)
  },

  deletePlotLine: async (plotLineId: number): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete(`/planning/plot-lines/${plotLineId}`)
  },

  listPlotNodes: async (
    novelId: number,
    params?: { plot_line_id?: number; chapter_number?: number; status?: string }
  ): Promise<ApiResponse<{ items: PlotNode[]; total: number }>> => {
    return apiClient.get(`/planning/novels/${novelId}/plot-nodes`, { params })
  },

  createPlotNode: async (
    novelId: number,
    data: PlotNodeCreate
  ): Promise<ApiResponse<{ id: number; title: string; status: string; message: string }>> => {
    return apiClient.post(`/planning/novels/${novelId}/plot-nodes`, data)
  },

  getPlotNode: async (nodeId: number): Promise<ApiResponse<PlotNode>> => {
    return apiClient.get(`/planning/plot-nodes/${nodeId}`)
  },

  updatePlotNode: async (
    nodeId: number,
    data: PlotNodeUpdate
  ): Promise<ApiResponse<{ id: number; title: string; status: string; message: string }>> => {
    return apiClient.put(`/planning/plot-nodes/${nodeId}`, data)
  },

  deletePlotNode: async (nodeId: number): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete(`/planning/plot-nodes/${nodeId}`)
  },

  completePlotNode: async (nodeId: number): Promise<ApiResponse<{ id: number; status: string; message: string }>> => {
    return apiClient.post(`/planning/plot-nodes/${nodeId}/complete`)
  },

  generateSuggestions: async (
    novelId: number,
    data: PlotSuggestionRequest
  ): Promise<ApiResponse<PlotSuggestionResponse>> => {
    return apiClient.post(`/planning/novels/${novelId}/suggestions`, data)
  },

  getProgress: async (novelId: number): Promise<ApiResponse<PlotProgress>> => {
    return apiClient.get(`/planning/novels/${novelId}/progress`)
  },

  getChapterNodes: async (
    novelId: number,
    chapterNumber: number
  ): Promise<ApiResponse<{ chapter_number: number; nodes: PlotNode[]; total: number }>> => {
    return apiClient.get(`/planning/novels/${novelId}/chapters/${chapterNumber}/nodes`)
  },
}
