import apiClient from './apiClient'
import type { ApiResponse } from '@/types/api'
import type { GenerationType, GenerationStyle, LLMModel } from './wsGenerationService'

export interface ModelOption {
  value: LLMModel
  label: string
  description: string
}

export interface StyleOption {
  value: GenerationStyle
  label: string
  description: string
}

export interface TypeParamDefinition {
  name: string
  type: string
  required: boolean
  default?: string | number | boolean
  description?: string
}

export interface GenerationTypeDefinition {
  value: GenerationType
  label: string
  description?: string
  params: TypeParamDefinition[]
}

export interface GenerationTypesResponse {
  types: GenerationTypeDefinition[]
  models: ModelOption[]
  styles: StyleOption[]
}

export interface GenerationRequest {
  generation_type: GenerationType
  params: Record<string, unknown>
}

export interface GenerationResponse {
  task_id: string
  generation_type: GenerationType
  status: string
  note: string
}

export interface ChapterParams {
  chapter_number: number
  target_length?: number
  model?: LLMModel
  style?: GenerationStyle
  user_prompt?: string
  chapter_outline?: string
  key_events?: string[]
  focus_characters?: string[]
}

export interface DialogueParams {
  characters: string[]
  context: string
  model?: LLMModel
  style?: GenerationStyle
  user_prompt?: string
}

export interface DescriptionParams {
  subject: string
  model?: LLMModel
  style?: GenerationStyle
  user_prompt?: string
}

export interface OutlineParams {
  premise: string
  genre: string
  total_chapters?: number
  model?: LLMModel
  style?: GenerationStyle
  user_prompt?: string
}

export interface SummaryParams {
  content: string
  max_length?: number
  model?: LLMModel
}

export interface CharacterProfileParams {
  name: string
  role: string
  novel_context: string
  model?: LLMModel
  style?: GenerationStyle
  user_prompt?: string
}

export const generationApi = {
  getTypes: async (): Promise<ApiResponse<GenerationTypesResponse>> => {
    return apiClient.get('/generation/types')
  },

  getModels: async (): Promise<ApiResponse<{ models: ModelOption[] }>> => {
    return apiClient.get('/generation/models')
  },

  getStyles: async (): Promise<ApiResponse<{ styles: StyleOption[] }>> => {
    return apiClient.get('/generation/styles')
  },

  generate: async (novelId: number, request: GenerationRequest): Promise<ApiResponse<GenerationResponse>> => {
    return apiClient.post(`/generation/novels/${novelId}/generate`, request)
  },

  generateChapter: async (novelId: number, params: ChapterParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'chapter',
      params: params as unknown as Record<string, unknown>,
    })
  },

  generateDialogue: async (novelId: number, params: DialogueParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'dialogue',
      params: params as unknown as Record<string, unknown>,
    })
  },

  generateDescription: async (novelId: number, params: DescriptionParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'description',
      params: params as unknown as Record<string, unknown>,
    })
  },

  generateOutline: async (novelId: number, params: OutlineParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'outline',
      params: params as unknown as Record<string, unknown>,
    })
  },

  generateSummary: async (novelId: number, params: SummaryParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'summary',
      params: params as unknown as Record<string, unknown>,
    })
  },

  generateCharacterProfile: async (novelId: number, params: CharacterProfileParams): Promise<ApiResponse<GenerationResponse>> => {
    return generationApi.generate(novelId, {
      generation_type: 'character_profile',
      params: params as unknown as Record<string, unknown>,
    })
  },
}
