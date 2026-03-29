export type PlotLineType = 'main' | 'sub' | 'character' | 'background'

export type PlotNodeStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'

export interface PlotOutline {
  id: number
  novel_id: number
  title: string
  premise: string | null
  theme: string | null
  act_structure: Record<string, any> | null
  beginning: string | null
  middle: string | null
  climax: string | null
  ending: string | null
  total_chapters: number | null
  current_chapter: number
  notes: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string | null
}

export interface PlotOutlineCreate {
  title: string
  premise?: string
  theme?: string
  act_structure?: Record<string, any>
  beginning?: string
  middle?: string
  climax?: string
  ending?: string
  total_chapters?: number
  notes?: string
  metadata?: Record<string, any>
}

export interface PlotOutlineUpdate {
  title?: string
  premise?: string
  theme?: string
  act_structure?: Record<string, any>
  beginning?: string
  middle?: string
  climax?: string
  ending?: string
  total_chapters?: number
  current_chapter?: number
  notes?: string
  metadata?: Record<string, any>
}

export interface PlotLine {
  id: number
  novel_id: number
  name: string
  description: string | null
  line_type: PlotLineType
  start_chapter: number | null
  end_chapter: number | null
  importance: number
  status: string
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string | null
}

export interface PlotLineCreate {
  name: string
  description?: string
  line_type?: PlotLineType
  start_chapter?: number
  end_chapter?: number
  importance?: number
  metadata?: Record<string, any>
}

export interface PlotLineUpdate {
  name?: string
  description?: string
  line_type?: PlotLineType
  start_chapter?: number
  end_chapter?: number
  importance?: number
  status?: string
  metadata?: Record<string, any>
}

export interface PlotNode {
  id: number
  plot_line_id: number
  novel_id: number
  title: string
  description: string | null
  chapter_number: number | null
  sequence: number
  status: PlotNodeStatus
  characters_involved: number[] | null
  prerequisites: number[] | null
  consequences: Record<string, any> | null
  notes: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string | null
}

export interface PlotNodeCreate {
  plot_line_id: number
  title: string
  description?: string
  chapter_number?: number
  sequence?: number
  characters_involved?: number[]
  prerequisites?: number[]
  consequences?: Record<string, any>
  notes?: string
  metadata?: Record<string, any>
}

export interface PlotNodeUpdate {
  title?: string
  description?: string
  chapter_number?: number
  sequence?: number
  status?: PlotNodeStatus
  characters_involved?: number[]
  prerequisites?: number[]
  consequences?: Record<string, any>
  notes?: string
  metadata?: Record<string, any>
}

export interface PlotSuggestionRequest {
  context: string
  chapter_number: number
  plot_line_id?: number
}

export interface PlotSuggestion {
  title: string
  description: string
  impact: string
  characters_involved?: number[]
}

export interface PlotSuggestionResponse {
  suggestions: PlotSuggestion[]
  reasoning: string | null
}

export interface PlotProgress {
  outline: PlotOutline | null
  plot_lines: {
    total: number
    main: number
    sub: number
    character: number
    background: number
  }
  nodes: {
    total: number
    planned: number
    in_progress: number
    completed: number
    completion_rate: number
  }
  plot_lines_detail: {
    id: number
    name: string
    line_type: string
    progress_percentage: number
    total_nodes: number
    completed: number
  }[]
}
