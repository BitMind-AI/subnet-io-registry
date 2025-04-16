/**
 * Types for the subnet-io-registry-alerts service
 */

// API Definition types
export interface ApiDefinition {
  baseUrl: string
  endpoints: Endpoint[]
}

export interface Endpoint {
  path: string
  externalPath: string
  method: string
  auth?: Auth
  headers?: Record<string, string>
  requestSchema?: any
}

export interface Auth {
  type: 'header' | 'body'
  key: string
  value: string
}

// Test case and result types
export interface TestCase {
  subnetId: string
  endpoint: Endpoint
  request: any
  expectedResponse?: any
}

export interface TestResult {
  subnetId: string
  endpoint: Endpoint
  success: boolean
  error?: string
  responseTime?: number
  statusCode?: number
  response?: any
  timestamp: Date
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// Configuration types
export interface Config {
  testSchedule: string
  slackWebhookUrl: string
  slackChannelId: string
  slackBotToken: string
  apiBaseUrl: string
  apiToken: string
  testTimeoutMs: number
  testRetryCount: number
  alwaysNotify: boolean
}
