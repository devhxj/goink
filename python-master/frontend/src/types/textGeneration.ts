export type GenerationType = 'chapter' | 'dialogue' | 'description' | 'outline' | 'summary' | 'character_profile'

export type GenerationStyle = 'narrative' | 'descriptive' | 'dialogue' | 'poetic' | 'dramatic' | 'natural' | 'vivid'

export interface GenerationTypeInfo {
  value: GenerationType
  label: string
}

export interface GenerationStyleInfo {
  value: GenerationStyle
  label: string
}

export interface GenerationTypesResponse {
  types: GenerationTypeInfo[]
  styles: GenerationStyleInfo[]
}

export interface ChapterGenerateRequest {
  chapter_number: number
  target_length?: number
  style?: GenerationStyle
}

export interface DialogueGenerateRequest {
  characters: string[]
  context: string
  style?: GenerationStyle
}

export interface DescriptionGenerateRequest {
  subject: string
  style?: GenerationStyle
}

export interface OutlineGenerateRequest {
  premise: string
  genre: string
  total_chapters?: number
  style?: GenerationStyle
}

export interface SummaryGenerateRequest {
  content: string
  max_length?: number
}

export interface CharacterProfileGenerateRequest {
  name: string
  role: string
  novel_context: string
  style?: GenerationStyle
}

export interface CustomGenerateRequest {
  prompt: string
  generation_type?: GenerationType
  style?: GenerationStyle
  target_length?: number
  temperature?: number
}

export interface TextGenerationResult {
  content: string
  word_count: number
  generation_time: number
  model_used: string
}
