/**
 * Normalize message example input
 * Converts arrays to newline-separated strings
 * 
 * @param value - Message example (string or array)
 * @returns Normalized string
 */
export function normalizeMes(value: any): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join('\n\n')
  if (typeof value === 'string') return value
  return ''
}

/**
 * Normalize tags input
 * Converts various formats to string array
 * 
 * @param value - Tags (string, array, or unknown)
 * @returns Array of trimmed, non-empty tag strings
 */
export function normalizeTags(value: unknown): string[] {
  if (!value) return []
  
  if (Array.isArray(value)) {
    return value
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  
  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
  
  return []
}

/**
 * Normalize whitespace in strings
 * Collapses multiple spaces and trims
 * 
 * @param value - Input string
 * @returns Normalized string
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
