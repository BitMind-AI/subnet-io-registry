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
 * @param results Test results to include in the notification
 * @param config Configuration object
 * @param isDetailedReport Whether to generate a detailed report
 * @param consoleOnly If true, only log to console even if Slack is configured
 */
export async function sendSlackNotification(
  results: TestResult[],
  config: Config,
  isDetailedReport: boolean = false,
  consoleOnly: boolean = false
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
        text: isDetailedReport
          ? '📊 Detailed Subnet API Test Report'
          : '🔍 Subnet API Test Report',
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

  // Add detailed performance metrics if this is a detailed report
  if (isDetailedReport) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Detailed Performance Metrics*',
      },
    })

    // Group by subnet for performance reporting
    const subnetGroups: Record<string, TestResult[]> = {}
    for (const result of results) {
      if (!subnetGroups[result.subnetId]) {
        subnetGroups[result.subnetId] = []
      }
      subnetGroups[result.subnetId].push(result)
    }

    // Add performance metrics for each subnet
    for (const [subnetId, subnetResults] of Object.entries(subnetGroups)) {
      // Calculate subnet-specific metrics
      const subnetAvgTime =
        subnetResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) /
        subnetResults.length

      const slowestEndpoint = [...subnetResults].sort(
        (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
      )[0]

      const fastestEndpoint = [...subnetResults].sort(
        (a, b) => (a.responseTime || 0) - (b.responseTime || 0)
      )[0]

      const subnetPassRate = Math.round(
        (subnetResults.filter((r) => r.success).length / subnetResults.length) *
          100
      )

      // Add subnet summary
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subnet ${subnetId}*:\n• Endpoints tested: ${
            subnetResults.length
          }\n• Pass rate: ${subnetPassRate}%\n• Avg response time: ${formatDuration(
            subnetAvgTime
          )}`,
        },
      })

      // Add all endpoints for this subnet
      const sortedEndpoints = [...subnetResults].sort(
        (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
      )

      let endpointsList = ''
      for (const result of sortedEndpoints) {
        const status = result.success ? '✅' : '❌'
        endpointsList += `${status} ${result.endpoint.path} - ${formatDuration(
          result.responseTime || 0
        )} ${!result.success ? `(${result.error || 'Error'})` : ''}\n`
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: endpointsList,
        },
      })
    }
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
    // Always log detailed results to console if consoleOnly is true
    if (consoleOnly || (!config.slackWebhookUrl && !config.slackBotToken)) {
      // Log to console
      if (consoleOnly) {
        console.log('Logging test results to console (--skip-slack mode):')
      } else {
        console.log(
          'No Slack configuration provided, logging results to console:'
        )
      }
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
      // Add detailed performance metrics if this is a detailed report
      if (isDetailedReport) {
        console.log('\n=== DETAILED PERFORMANCE METRICS ===')

        // Group by subnet for performance reporting
        const subnetGroups: Record<string, TestResult[]> = {}
        for (const result of results) {
          if (!subnetGroups[result.subnetId]) {
            subnetGroups[result.subnetId] = []
          }
          subnetGroups[result.subnetId].push(result)
        }

        // Log performance metrics for each subnet
        for (const [subnetId, subnetResults] of Object.entries(subnetGroups)) {
          // Calculate subnet-specific metrics
          const subnetAvgTime =
            subnetResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) /
            subnetResults.length

          const slowestEndpoint = [...subnetResults].sort(
            (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
          )[0]

          const fastestEndpoint = [...subnetResults].sort(
            (a, b) => (a.responseTime || 0) - (b.responseTime || 0)
          )[0]

          const subnetPassRate = Math.round(
            (subnetResults.filter((r) => r.success).length /
              subnetResults.length) *
              100
          )

          console.log(`\nSubnet ${subnetId}:`)
          console.log(`• Endpoints tested: ${subnetResults.length}`)
          console.log(`• Pass rate: ${subnetPassRate}%`)
          console.log(`• Avg response time: ${formatDuration(subnetAvgTime)}`)
          console.log(
            `• Slowest: ${slowestEndpoint.endpoint.path} (${formatDuration(
              slowestEndpoint.responseTime || 0
            )})`
          )
          console.log(
            `• Fastest: ${fastestEndpoint.endpoint.path} (${formatDuration(
              fastestEndpoint.responseTime || 0
            )})`
          )

          // List all endpoints with their response times
          console.log('\nAll endpoints:')
          // Sort by response time (slowest first)
          const sortedEndpoints = [...subnetResults].sort(
            (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
          )

          for (const result of sortedEndpoints) {
            const status = result.success ? '✅' : '❌'
            console.log(
              `${status} ${result.endpoint.path} - ${formatDuration(
                result.responseTime || 0
              )} ${!result.success ? `(${result.error || 'Error'})` : ''}`
            )
          }
        }
      }

      console.log('\nReport generated at', new Date().toISOString())
      console.log('=====================')
    } else if (!consoleOnly && config.slackWebhookUrl) {
      // Use webhook URL
      await axios.post(config.slackWebhookUrl, { blocks })
      console.log('Slack notification sent via webhook')
    } else if (!consoleOnly && config.slackBotToken && config.slackChannelId) {
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
    }
  } catch (error: any) {
    console.error(
      'Failed to send notification:',
      error.message || String(error)
    )
  }
}
