import dotenv from 'dotenv'
import { Config } from './types'

// Load environment variables from .env file
dotenv.config()

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  return {
    testSchedule: process.env.TEST_SCHEDULE || '0 */6 * * *', // Default: every 6 hours
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    slackChannelId: process.env.SLACK_CHANNEL_ID || '',
    slackBotToken: process.env.SLACK_BOT_TOKEN || '',
    apiBaseUrl:
      process.env.BITMIND_API_BASE_URL || 'https://api.bitmind.ai/oracle/v1',
    apiToken: process.env.BITMIND_API_TOKEN || '',
    testTimeoutMs: parseInt(process.env.TEST_TIMEOUT_MS || '30000', 10),
    testRetryCount: parseInt(process.env.TEST_RETRY_COUNT || '3', 10),
    alwaysNotify: process.env.ALWAYS_NOTIFY === 'true',
  }
}

/**
 * Validate the configuration
 */
export function validateConfig(config: Config): void {
  const errors: string[] = []

  if (!config.apiToken) {
    errors.push('BITMIND_API_TOKEN is required')
  }

  // Slack configuration is optional
  if (config.slackBotToken && !config.slackChannelId) {
    errors.push('SLACK_CHANNEL_ID is required when using SLACK_BOT_TOKEN')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`)
  }
}
