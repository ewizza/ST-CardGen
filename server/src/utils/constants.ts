// Time constants
export const ONE_SECOND_MS = 1000
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
export const ONE_DAY_MS = 24 * ONE_HOUR_MS

// Job cleanup intervals
export const JOB_RETENTION_TIME = ONE_HOUR_MS
export const CLEANUP_INTERVAL = 10 * ONE_MINUTE_MS

// Request limits
export const MAX_REQUEST_SIZE = '25mb'
export const DEFAULT_TIMEOUT_MS = 30 * ONE_SECOND_MS

// Retry configuration
export const MAX_REGENERATE_ATTEMPTS = 3
export const RAW_RESPONSE_LIMIT = 8000

// Content rating options
export const CONTENT_RATINGS = {
  SFW: 'sfw',
  NSFW_ALLOWED: 'nsfw_allowed',
} as const

// Default negative prompts by content rating
export const DEFAULT_NEGATIVE_PROMPTS = {
  [CONTENT_RATINGS.SFW]: 
    'lowres, blurry, jpeg artifacts, bad anatomy, extra limbs, extra fingers, missing fingers, bad hands, bad face, deformed, mutated, out of frame, watermark, signature, text, logo, nudity, explicit sexual content',
  [CONTENT_RATINGS.NSFW_ALLOWED]:
    'lowres, blurry, jpeg artifacts, bad anatomy, extra limbs, extra fingers, missing fingers, bad hands, bad face, deformed, mutated, out of frame, watermark, signature, text, logo',
} as const
