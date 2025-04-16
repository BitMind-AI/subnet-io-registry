import axios from 'axios'
import { Config, TestResult } from './types'

/**
 * Format currency for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Send a Slack notification with test results
 */
export async function sendSlackNotification(
  results: TestResult[],
  config: Config
): Promise<void> {
  const failedTests = results.filter((result) => !result.success)
  const passedTests = results.filter((result) => result.success)

  // Calculate statistics
  const totalTests = results.length
  const passRate =
    totalTests > 0 ? Math.round((passedTests.length / totalTests) * 100) : 0
  const avgResponseTime =
    results.reduce((sum, result) => sum + (result.responseTime || 0), 0) /
    totalTests

  // Create message blocks
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔍 Subnet API Test Report',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Test Summary*\n• Total tests: ${totalTests}\n• Passed: ${
          passedTests.length
        } (${passRate}%)\n• Failed: ${
          failedTests.length
        }\n• Average response time: ${formatDuration(avgResponseTime)}`,
      },
    },
  ]

  // Add failed test details if any
  if (failedTests.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Failed Tests*',
      },
    })

    // Group failed tests by subnet
    const failuresBySubnet: Record<string, TestResult[]> = {}
    for (const test of failedTests) {
      if (!failuresBySubnet[test.subnetId]) {
        failuresBySubnet[test.subnetId] = []
      }
      failuresBySubnet[test.subnetId].push(test)
    }

    // Add each subnet's failures
    for (const [subnetId, failures] of Object.entries(failuresBySubnet)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subnet ${subnetId}*:\n${failures
            .map(
              (test) =>
                `• ${test.endpoint.path} - ${test.error || 'Unknown error'} (${
                  test.statusCode || 'No status code'
                })`
            )
            .join('\n')}`,
        },
      })
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ *All tests passed successfully!*',
      },
    })
  }

  // Add timestamp
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `_Report generated at ${new Date().toISOString()}_`,
    },
  })

  // Send to Slack or log to console
  try {
    if (config.slackWebhookUrl) {
      // Use webhook URL
      await axios.post(config.slackWebhookUrl, { blocks })
      console.log('Slack notification sent via webhook')
    } else if (config.slackBotToken && config.slackChannelId) {
      // Use Slack API
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: config.slackChannelId,
          blocks,
        },
        {
          headers: {
            Authorization: `Bearer ${config.slackBotToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
      console.log('Slack notification sent via API')
    } else {
      // No Slack configuration, just log to console
      console.log(
        'No Slack configuration provided, logging results to console:'
      )
      console.log('=== TEST RESULTS ===')
      console.log(`Total tests: ${totalTests}`)
      console.log(`Passed: ${passedTests.length} (${passRate}%)`)
      console.log(`Failed: ${failedTests.length}`)
      console.log(`Average response time: ${formatDuration(avgResponseTime)}`)

      if (failedTests.length > 0) {
        console.log('\n=== FAILED TESTS ===')
        // Group failed tests by subnet
        const failuresBySubnet: Record<string, TestResult[]> = {}
        for (const test of failedTests) {
          if (!failuresBySubnet[test.subnetId]) {
            failuresBySubnet[test.subnetId] = []
          }
          failuresBySubnet[test.subnetId].push(test)
        }

        // Log each subnet's failures
        for (const [subnetId, failures] of Object.entries(failuresBySubnet)) {
          console.log(`\nSubnet ${subnetId}:`)
          for (const test of failures) {
            console.log(
              `• ${test.endpoint.path} - ${test.error || 'Unknown error'} (${
                test.statusCode || 'No status code'
              })`
            )
          }
        }
      } else {
        console.log('\n✅ All tests passed successfully!')
      }
      console.log('\nReport generated at', new Date().toISOString())
      console.log('=====================')
    }
  } catch (error: any) {
    console.error(
      'Failed to send notification:',
      error.message || String(error)
    )
  }
}
