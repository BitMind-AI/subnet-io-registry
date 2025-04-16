import { ValidationResult } from './types'

/**
 * Validate a response against an expected response
 */
export function validateResponse(actual: any, expected: any): ValidationResult {
  if (!expected) {
    // If no expected response is provided, just check that the actual response exists
    return {
      valid: actual !== undefined && actual !== null,
      errors:
        actual === undefined || actual === null ? ['Response is empty'] : [],
    }
  }

  const errors: string[] = []

  // For array responses, just check the length for now
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return {
      valid: true,
      errors: [],
    }
  }

  // Common ID fields (not requiring exact match)
  const idFields = ['id', 'object', 'created']
  for (const field of idFields) {
    if (field in expected && !(field in actual)) {
      errors.push(`Missing field: ${field}`)
    }
  }

  // Standard output fields - check type compatibility
  const standardFields = [
    'isAI',
    'confidence',
    'predictions',
    'similarity',
    'fqdn', // AI detection fields
    'answer',
    'error',
    'segmentation_tokens',
    'deep_scan', // Text analysis fields
    'content',
    'choices',
    'usage',
    'finish_reason', // Chat/completion fields
  ]

  for (const field of standardFields) {
    if (field in expected && field in actual) {
      // For array fields just check they're both arrays
      if (Array.isArray(expected[field]) && !Array.isArray(actual[field])) {
        errors.push(`Field ${field} should be an array`)
      }
      // For boolean fields we should match exactly
      else if (
        typeof expected[field] === 'boolean' &&
        typeof actual[field] !== 'boolean'
      ) {
        errors.push(`Field ${field} should be a boolean`)
      }
      // For numeric fields just check it's a number
      else if (
        typeof expected[field] === 'number' &&
        typeof actual[field] !== 'number'
      ) {
        errors.push(`Field ${field} should be a number`)
      }
      // For string fields just check it's a string
      else if (
        typeof expected[field] === 'string' &&
        typeof actual[field] !== 'string'
      ) {
        errors.push(`Field ${field} should be a string`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
