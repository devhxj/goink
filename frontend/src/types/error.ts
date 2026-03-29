export interface AppError {
  error?: {
    message?: string
    code?: string
  }
  message?: string
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as AppError
    return e.error?.message || e.message || '操作失败'
  }
  return '操作失败'
}
