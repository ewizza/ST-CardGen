export async function httpJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
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
    throw e
  }

  const text = await res.text().catch(() => '')
  if (!text) {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`.trim())
    }
    throw new Error('Empty JSON response')
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim())
    }
    throw new Error('Invalid JSON response')
  }

  if (
    json
    && typeof json === 'object'
    && json.ok === false
    && json.error
    && typeof json.error === 'object'
  ) {
    json.errorCode = json.error.code
    json.errorDetails = json.error.details
    json.error = json.error.message
    json.httpStatus = res.status
    if (json.details === undefined) {
      json.details = json.errorDetails
    }
    return json as T
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim())
  }

  return json as T
}
