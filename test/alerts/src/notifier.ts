import axios from 'axios'
import { Config, TestResult } from './types'

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Get performance category based on response time
 * @param responseTime Response time in ms
 * @param avgTime Average response time for comparison
 */
function getPerformanceCategory(
  responseTime: number,
  avgTime: number
): 'fast' | 'average' | 'slow' {
  if (responseTime < avgTime * 0.7) {
    return 'fast'
  } else if (responseTime > avgTime * 1.3) {
    return 'slow'
  }
  return 'average'
}

/**
 * Get emoji for performance category
 */
function getPerformanceEmoji(category: 'fast' | 'average' | 'slow'): string {
  switch (category) {
    case 'fast':
      return '🚀'
    case 'slow':
      return '🐢'
    default:
      return '⏱️'
  }
}

/**
 * Format a table for Slack output
 */
function formatSlackTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const colWidths = headers.map((header, i) => {
    const maxContentWidth = Math.max(
      header.length,
      ...rows.map((row) => (row[i] || '').length)
    )
    return maxContentWidth + 2 // Add padding
  })

  // Create header row
  let table = '```\n'
  headers.forEach((header, i) => {
    table += header.padEnd(colWidths[i])
  })
  table += '\n'

  // Add separator
  headers.forEach((_, i) => {
    table += '-'.repeat(colWidths[i])
  })
  table += '\n'

  // Add data rows
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      table += (cell || '').padEnd(colWidths[i])
    })
    table += '\n'
  })

  table += '```'
  return table
}

/**
 * Create a Slack block divider
 */
function slackDivider(): any {
  return { type: 'divider' }
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
        } (${passRate}%) ${passRate === 100 ? '✅' : ''}\n• Failed: ${
          failedTests.length
        } ${
          failedTests.length > 0 ? '❌' : ''
        }\n• Average response time: ${formatDuration(avgResponseTime)}`,
      },
    },
    slackDivider(),
  ]

  // Add failed test details if any
  if (failedTests.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '❌ *Failed Tests*',
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

    // Add each subnet's failures as a table
    for (const [subnetId, failures] of Object.entries(failuresBySubnet)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subnet ${subnetId}*:`,
        },
      })

      // Create table headers and rows
      const headers = ['Status', 'Endpoint', 'Response Time', 'Error']
      const rows = failures.map((test) => [
        '❌',
        test.endpoint.path,
        formatDuration(test.responseTime || 0),
        test.error || 'Unknown error',
      ])

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatSlackTable(headers, rows),
        },
      })
    }

    blocks.push(slackDivider())
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ *All tests passed successfully!*',
      },
    })
    blocks.push(slackDivider())
  }

  // Add detailed performance metrics if this is a detailed report
  if (isDetailedReport) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '📈 *Detailed Performance Metrics*',
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

      const subnetPassRate = Math.round(
        (subnetResults.filter((r) => r.success).length / subnetResults.length) *
          100
      )

      // Add subnet summary with status emoji
      const statusEmoji =
        subnetPassRate === 100 ? '✅' : subnetPassRate >= 80 ? '⚠️' : '❌'

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subnet ${subnetId}* - ${statusEmoji} ${subnetPassRate}% Pass Rate\n• Endpoints tested: ${
            subnetResults.length
          }\n• Avg response time: ${formatDuration(subnetAvgTime)}`,
        },
      })

      // Create a formatted table for Slack
      // Sort by response time (slowest first)
      const sortedEndpoints = [...subnetResults].sort(
        (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
      )

      // Create table headers and rows
      const headers = ['Status', 'Endpoint', 'Response Time', 'Performance']
      const rows = sortedEndpoints.map((result) => {
        const status = result.success ? '✅' : '❌'
        const perfCategory = getPerformanceCategory(
          result.responseTime || 0,
          subnetAvgTime
        )
        const perfEmoji = getPerformanceEmoji(perfCategory)

        return [
          status,
          result.endpoint.path,
          formatDuration(result.responseTime || 0),
          `${perfEmoji} ${
            perfCategory.charAt(0).toUpperCase() + perfCategory.slice(1)
          }`,
        ]
      })

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatSlackTable(headers, rows),
        },
      })
    }

    blocks.push(slackDivider())
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

          // Create a table for all endpoints
          console.log('\nAll endpoints (sorted by response time):')

          // Sort by response time (slowest first)
          const sortedEndpoints = [...subnetResults].sort(
            (a, b) => (b.responseTime || 0) - (a.responseTime || 0)
          )

          // Find the longest path to align the table
          const longestPath = sortedEndpoints.reduce(
            (max, result) => Math.max(max, result.endpoint.path.length),
            0
          )

          // Create table header
          console.log(
            '┌─────┬' +
              '─'.repeat(longestPath + 2) +
              '┬────────────┬─────────────┬───────────────────────────┐'
          )
          console.log(
            '│ Sts │ ' +
              'Endpoint'.padEnd(longestPath) +
              ' │ Time      │ Performance │ Error                     │'
          )
          console.log(
            '├─────┼' +
              '─'.repeat(longestPath + 2) +
              '┼────────────┼─────────────┼───────────────────────────┤'
          )

          // Add each endpoint to the table
          for (const result of sortedEndpoints) {
            const status = result.success ? ' ✓  ' : ' ✗  '
            const path = result.endpoint.path.padEnd(longestPath)
            const time = formatDuration(result.responseTime || 0).padEnd(10)
            const perfCategory = getPerformanceCategory(
              result.responseTime || 0,
              subnetAvgTime
            )
            const perfEmoji = getPerformanceEmoji(perfCategory)
            const performance = `${perfEmoji} ${perfCategory.padEnd(9)}`
            const error = result.success
              ? ' '.repeat(25)
              : (result.error || 'Error').substring(0, 25).padEnd(25)

            console.log(
              `│${status}│ ${path} │ ${time} │ ${performance} │ ${error} │`
            )
          }

          // Close the table
          console.log(
            '└─────┴' +
              '─'.repeat(longestPath + 2) +
              '┴────────────┴─────────────┴───────────────────────────┘'
          )
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
