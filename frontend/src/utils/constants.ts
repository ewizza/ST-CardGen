// Time constants
export const ONE_SECOND_MS = 1000
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
export const ONE_DAY_MS = 24 * ONE_HOUR_MS

// Common languages for character generation
export const COMMON_LANGUAGES = [
  'auto',
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Russian',
  'Japanese',
  'Korean',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Arabic',
] as const

// API endpoints
export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  CHARACTER_GENERATE: '/api/character/generate',
  CHARACTER_FILL_MISSING: '/api/character/fill-missing',
  CHARACTER_REGENERATE: '/api/character/regenerate',
  IMAGE_GENERATE: '/api/image/generate',
  LIBRARY_SAVE: '/api/library/save',
} as const

// Default values
export const DEFAULTS = {
  POV: 'third',
  THEME: 'dark',
  LIBRARY_FORMAT: 'png',
  AUTO_IMAGE: true,
} as const
