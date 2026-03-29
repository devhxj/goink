import apiClient from './apiClient'
import type { ApiResponse } from '@/types/api'
import type {
  GenerationTypesResponse,
  ChapterGenerateRequest,
  DialogueGenerateRequest,
  DescriptionGenerateRequest,
  OutlineGenerateRequest,
  SummaryGenerateRequest,
  CharacterProfileGenerateRequest,
  CustomGenerateRequest,
  TextGenerationResult,
} from '@/types/textGeneration'

export const textGenerationApi = {
  getGenerationTypes: async (): Promise<ApiResponse<GenerationTypesResponse>> => {
    return apiClient.get('/text/generation-types')
  },

  generateChapter: async (
    novelId: number,
    data: ChapterGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/chapter`, null, {
      params: data,
    })
  },

  generateDialogue: async (
    novelId: number,
    data: DialogueGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/dialogue`, null, {
      params: data,
    })
  },

  generateDescription: async (
    novelId: number,
    data: DescriptionGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/description`, null, {
      params: data,
    })
  },

  generateOutline: async (
    novelId: number,
    data: OutlineGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/outline`, null, {
      params: data,
    })
  },

  generateSummary: async (
    novelId: number,
    data: SummaryGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/summary`, null, {
      params: data,
    })
  },

  generateCharacterProfile: async (
    novelId: number,
    data: CharacterProfileGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/character-profile`, null, {
      params: data,
    })
  },

  generateCustom: async (
    novelId: number,
    data: CustomGenerateRequest
  ): Promise<ApiResponse<TextGenerationResult>> => {
    return apiClient.post(`/text/novels/${novelId}/generate/custom`, null, {
      params: data,
    })
  },
}
