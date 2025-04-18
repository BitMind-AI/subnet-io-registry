import dotenv from 'dotenv'
import { Config } from './types'

// Load environment variables from .env file
dotenv.config()

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  return {
    // Required configuration with defaults
    testSchedule: process.env.TEST_SCHEDULE || '0 */6 * * *', // Default: every 6 hours
    detailedReportSchedule: process.env.DETAILED_REPORT_SCHEDULE || '0 0 * * *', // Default: every day at midnight
    testTimeoutMs: parseInt(process.env.TEST_TIMEOUT_MS || '30000', 10),
    testRetryCount: parseInt(process.env.TEST_RETRY_COUNT || '3', 10),
    alwaysNotify: process.env.ALWAYS_NOTIFY === 'true',

    // Required configuration without defaults (must be set in .env)
    apiBaseUrl: process.env.BITMIND_API_BASE_URL || '',
    apiToken: process.env.BITMIND_API_TOKEN || '',

    // Optional Slack configuration
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    slackChannelId: process.env.SLACK_CHANNEL_ID || '',
    slackBotToken: process.env.SLACK_BOT_TOKEN || '',

    // Webhook configuration
    webhookEnabled: process.env.WEBHOOK_ENABLED === 'true',
    webhookPort: parseInt(process.env.WEBHOOK_PORT || '9000', 10),
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    repoPath: process.env.REPO_PATH || process.cwd(),
  }
}

/**
 * Validate the configuration
 */
export function validateConfig(config: Config): void {
  const errors: string[] = []

  // Required API configuration
  if (!config.apiBaseUrl) {
    errors.push('BITMIND_API_BASE_URL is required')
  }

  if (!config.apiToken) {
    errors.push('BITMIND_API_TOKEN is required')
  }

  // Slack configuration validation
  if (config.slackBotToken && !config.slackChannelId) {
    errors.push('SLACK_CHANNEL_ID is required when using SLACK_BOT_TOKEN')
  }

  // Webhook configuration validation
  if (config.webhookEnabled) {
    if (!config.webhookSecret) {
      errors.push('WEBHOOK_SECRET is required when webhook is enabled')
    }

    if (config.webhookPort < 1024 || config.webhookPort > 65535) {
      errors.push('WEBHOOK_PORT must be between 1024 and 65535')
    }

    if (!config.repoPath) {
      errors.push('REPO_PATH is required when webhook is enabled')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`)
  }
}
