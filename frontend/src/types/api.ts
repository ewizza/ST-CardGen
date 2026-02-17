/**
 * Standard API response structure
 */
export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: ApiError
}

/**
 * API error structure
 */
export interface ApiError {
  code: string
  message: string
  details?: any
}

/**
 * API error response (when ok: false)
 */
export interface ApiErrorResponse {
  ok: false
  error: ApiError
  /** Optional HTTP status echoed by backend (if present) */
  httpStatus?: number
}

/**
 * Character payload from API
 */
export interface CharacterPayload {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  tags?: string[]
  creator_notes?: string
  image_prompt?: string
  negative_prompt?: string
}

/**
 * Image generation job
 */
export interface ImageJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  result?: {
    url: string
    seed?: number
  }
  error?: string
}
