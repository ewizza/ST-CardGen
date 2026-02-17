import type { Response } from 'express'

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = any> {
  ok: true
  data: T
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    details?: any
  }
}

/**
 * API response (union of success and error)
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse

/**
 * Express response with typed JSON
 */
export type TypedResponse<T = any> = Response<ApiResponse<T>>
