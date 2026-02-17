import type { ApiErrorResponse } from '@/types/api'

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
    public httpStatus?: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Type guard for API error responses
 */
function isApiErrorResponse(json: any): json is ApiErrorResponse {
  return (
    json &&
    typeof json === 'object' &&
    json.ok === false &&
    json.error &&
    typeof json.error === 'object'
  )
}

/**
 * Make HTTP request with JSON response
 * Throws ApiError on failure for better type safety
 * 
 * @param input - Request URL or RequestInfo
 * @param init - Request init options
 * @returns Parsed JSON response
 * @throws {ApiError} On API error or network failure
 */
export async function httpJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response
  
  try {
    res = await fetch(input, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch (e: any) {
    // Network failure reaching the server
    throw new ApiError(
      e.message || 'Network request failed',
      'NETWORK_ERROR',
      undefined,
      undefined
    )
  }

  const text = await res.text().catch(() => '')
  
  if (!text) {
    if (!res.ok) {
      throw new ApiError(
        `HTTP ${res.status} ${res.statusText}`.trim(),
        'HTTP_ERROR',
        undefined,
        res.status
      )
    }
    throw new ApiError('Empty JSON response', 'EMPTY_RESPONSE')
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    if (!res.ok) {
      throw new ApiError(
        `HTTP ${res.status} ${res.statusText}`,
        'INVALID_JSON',
        { rawResponse: text.slice(0, 500) },
        res.status
      )
    }
    throw new ApiError('Invalid JSON response', 'INVALID_JSON', {
      rawResponse: text.slice(0, 500),
    })
  }

  // Handle API error format
  if (isApiErrorResponse(json)) {
    throw new ApiError(
      json.error.message,
      json.error.code,
      json.error.details,
      json.httpStatus ?? res.status
    )
  }

  if (!res.ok) {
    throw new ApiError(
      `HTTP ${res.status} ${res.statusText}`,
      'HTTP_ERROR',
      json,
      res.status
    )
  }

  return json as T
}

/**
 * GET request helper
 */
export async function get<T>(url: string): Promise<T> {
  return httpJson<T>(url, { method: 'GET' })
}

/**
 * POST request helper
 */
export async function post<T>(url: string, body?: any): Promise<T> {
  return httpJson<T>(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * PUT request helper
 */
export async function put<T>(url: string, body?: any): Promise<T> {
  return httpJson<T>(url, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * DELETE request helper
 */
export async function del<T>(url: string): Promise<T> {
  return httpJson<T>(url, { method: 'DELETE' })
}
