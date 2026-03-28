export type PlotLineType = 'main' | 'sub' | 'background'
export type PlotNodeStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'

export interface PlotOutline {
  id: number
  novel_id: number
  title: string
  description: string | null
  main_plot: string | null
  themes: string[]
  target_length: number | null
  created_at: string
  updated_at: string
}

export interface PlotLine {
  id: number
  novel_id: number
  name: string
  description: string | null
  line_type: PlotLineType
  status: string
  start_chapter: number | null
  end_chapter: number | null
  created_at: string
  updated_at: string
}

export interface PlotNode {
  id: number
  novel_id: number
  plot_line_id: number | null
  chapter_number: number | null
  title: string
  description: string | null
  status: PlotNodeStatus
  sequence: number
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface PlotProgress {
  outline: PlotOutline | null
  plot_lines: {
    total: number
    main: number
    sub: number
    character: number
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
