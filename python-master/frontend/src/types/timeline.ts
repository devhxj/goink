export type TimelineEntryCategory = 'foreshadowing' | 'plot_node' | 'chapter_plan' | 'user_directive'
export type TimelineEntryStatus = 'pending' | 'active' | 'completed' | 'resolved' | 'abandoned' | 'deferred'
export type TimeHorizon = 'next' | 'near_term' | 'long_term' | 'undefined'
export type EntrySource = 'ai_generated' | 'user_created' | 'user_edited'

export interface ForeshadowingDetail {
  foreshadowing_type: 'plot' | 'character' | 'item' | 'mystery'
  hint_text: string
  expected_resolution: string
  resolution_notes?: string
}

export interface ChapterPlanDetail {
  plan_type: 'next_chapter' | 'near_term' | 'long_term'
  raw_plan: string
  key_events?: string[]
  focus_characters?: string[]
  scene_goal?: string
  tone_hint?: string
}

export interface UserDirectiveDetail {
  original_message: string
  intent_type: 'style_rule' | 'plot_direction' | 'character_arc' | 'constraint'
  applies_from_chapter?: number
}

export type DetailJson = ForeshadowingDetail | ChapterPlanDetail | UserDirectiveDetail | Record<string, unknown>

export interface TimelineEntry {
  id: number
  novel_id: number
  category: TimelineEntryCategory
  status: TimelineEntryStatus
  title: string
  description: string | null
  detail_json: Record<string, unknown> | null
  target_chapter: number | null
  time_horizon: TimeHorizon | null
  importance: number
  source: EntrySource
  source_chapter_id: number | null
  resolved_chapter_id: number | null
  related_entry_ids: number[] | null
  tags: string[] | null
  version: number
  last_editor: string | null
  original_ai_output: Record<string, unknown> | null
  extra_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface TimelineEntryCreate {
  category: TimelineEntryCategory
  title: string
  description?: string
  detail_json?: Record<string, unknown>
  target_chapter?: number
  time_horizon?: TimeHorizon
  importance?: number
  source_chapter_id?: number
  tags?: string[]
}

export interface TimelineEntryUpdate {
  title?: string
  description?: string
  status?: TimelineEntryStatus
  detail_json?: Record<string, any>
  target_chapter?: number
  time_horizon?: TimeHorizon
  importance?: number
  tags?: string[]
}

export interface TimelineEntryStatusUpdate {
  status?: TimelineEntryStatus
  resolved_chapter_id?: number
  resolution_notes?: string
}

export interface TimelineStats {
  foreshadowing: number
  chapter_plan: number
  user_directive: number
}

export interface TimelineContextEntry {
  id: number
  category: TimelineEntryCategory
  title: string
  status: TimelineEntryStatus
  target_chapter: number | null
  importance: number
  summary: string
}

export interface UserCreativeProfile {
  id: number
  user_id: number
  global_writing_style: string | null
  preferred_sentence_length: string | null
  default_pov: string | null
  global_must_keep: string[] | null
  global_must_avoid: string[] | null
  extra_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CreativeProfileResponse {
  user_global: {
    global_writing_style: string | null
    preferred_sentence_length: string | null
    default_pov: string | null
    global_must_keep: string[]
    global_must_avoid: string[]
    exists: boolean
  }
  novel_specific: {
    author_intent: string | null
    preferred_tone: string | null
    collaboration_style: string
    scene_planning_notes: string | null
    must_keep: string[]
    must_avoid: string[]
    long_term_goals: string[]
    exists: boolean
  }
  merged: {
    must_keep: string[]
    must_avoid: string[]
  }
  profile_summary: string
}
