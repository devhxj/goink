export type WorkflowStatus = 'initialized' | 'generating' | 'completed' | 'failed'

export interface WorkflowGenerateRequest {
  chapter_number: number
  target_length?: number
  style?: string
}

export interface WorkflowGenerateResponse {
  task_id: string
  chapter_number: number
  status: WorkflowStatus
  workflow_type: string
  message: string
}

export interface WorkflowState {
  task_id: string
  status: WorkflowStatus
  iteration: number
  max_iterations: number
  generated_content_length: number
  review_result: {
    approved: boolean
    feedback: string
    score: number
  } | null
  consistency_result: {
    passed: boolean
    issues: any[]
  } | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowTask {
  task_id: string
  task_type: string
  status: WorkflowStatus
  created_at: string
  updated_at: string | null
  error: string | null
}

export interface WorkflowHealth {
  langgraph_available: boolean
  workflow_ready: boolean
  components: {
    context_builder: string
    consistency_checker: string
    vector_store: string
    writer_agent: string
    reviewer_agent: string
    memory_saver: string
  }
}
