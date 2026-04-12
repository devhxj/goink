import apiClient from './apiClient'
import type { LoginRequest, RegisterRequest, AuthResponse, RefreshTokenResponse, User } from '@/types/auth'
import type { ApiResponse } from '@/types/api'

export const authApi = {
  login: async (data: LoginRequest): Promise<ApiResponse<AuthResponse>> => {
    return apiClient.post('/auth/login', data)
  },

  register: async (data: RegisterRequest): Promise<ApiResponse<User>> => {
    return apiClient.post('/auth/register', data)
  },

  refreshToken: async (): Promise<ApiResponse<RefreshTokenResponse>> => {
    const authStorage = localStorage.getItem('auth-storage')
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage)
        const refreshToken = parsed?.state?.refreshToken
        if (refreshToken) {
          return apiClient.post('/auth/refresh', { refresh_token: refreshToken })
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e)
      }
    }
    throw new Error('No refresh token found')
  },

  getCurrentUser: async (): Promise<ApiResponse<User>> => {
    return apiClient.get('/auth/me')
  },
}
