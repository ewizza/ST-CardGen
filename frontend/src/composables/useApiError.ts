import { ref } from 'vue'
import { ApiError as HttpApiError } from '@/services/http'

export interface ApiError {
  message: string
  code?: string
  details?: any
  scope?: string
}

/**
 * Composable for managing API error state
 * Provides utilities for setting, clearing, and displaying errors
 * 
 * @returns {Object} Error management utilities
 */
export function useApiError() {
  const error = ref<ApiError | null>(null)
  const isError = ref(false)

  const setError = (message: string, code?: string, details?: any, scope?: string) => {
    error.value = { message, code, details, scope }
    isError.value = true
  }

  const clearError = () => {
    error.value = null
    isError.value = false
  }

  const handleError = (e: any, defaultMessage = 'An error occurred') => {
    // Preferred: errors thrown by httpJson()
    if (e instanceof HttpApiError) {
      setError(e.message, e.code, e.details)
      return
    }

    // Backend structured error: { ok:false, error:{ code, message, details? } }
    if (e?.ok === false && e?.error && typeof e.error === 'object') {
      setError(e.error.message, e.error.code, e.error.details)
      return
    }

    // Legacy shape (keep just in case): { ok:false, error: string, errorCode, errorDetails? }
    if (typeof e?.error === 'string') {
      setError(e.error, e.errorCode ?? e.code, e.errorDetails ?? e.details)
      return
    }

    if (e?.message) {
      setError(e.message)
      return
    }

    setError(defaultMessage)
  }

  return {
    error,
    isError,
    setError,
    clearError,
    handleError,
  }
}


