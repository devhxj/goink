import axios from 'axios'
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '@/types/api'
import { authApi } from './authService'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error)
    } else {
      promise.resolve(token)
    }
  })
  failedQueue = []
}

const getAuthFromStorage = () => {
  const authStorage = localStorage.getItem('auth-storage')
  if (authStorage) {
    try {
      return JSON.parse(authStorage)?.state
    } catch (e) {
      console.error('Failed to parse auth storage:', e)
    }
  }
  return null
}

const setAccessToken = (token: string) => {
  const authStorage = localStorage.getItem('auth-storage')
  if (authStorage) {
    try {
      const parsed = JSON.parse(authStorage)
      parsed.state.accessToken = token
      localStorage.setItem('auth-storage', JSON.stringify(parsed))
    } catch (e) {
      console.error('Failed to update auth storage:', e)
    }
  }
}

const clearAuthStorage = () => {
  localStorage.removeItem('auth-storage')
}

apiClient.interceptors.request.use(
  (config) => {
    const authState = getAuthFromStorage()
    const token = authState?.accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => {
          const authState = getAuthFromStorage()
          const token = authState?.accessToken
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`
          }
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await authApi.refreshToken()
        if (res.success) {
          setAccessToken(res.data.access_token)
          
          processQueue(null, res.data.access_token)
          
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`
          }
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearAuthStorage()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    
    const apiError: ApiError = error.response?.data || {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '网络错误，请检查网络连接',
      },
    }
    
    return Promise.reject(apiError)
  }
)

export default apiClient
