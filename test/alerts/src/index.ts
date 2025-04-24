import cron from 'node-cron'
import { loadConfig, validateConfig } from './config'
import { generateTestCases } from './discovery'
import { runTests } from './executor'
import { sendSlackNotification } from './notifier'
import { startWebhookServer } from './webhook'

/**
 * Main function to run tests and send notifications
 * @param isDetailedReport Whether to generate a detailed report
 * @param skipSlack Whether to skip sending Slack notifications
 * @param subnetId Optional subnet ID to test only a specific subnet
 */
async function main(
  isDetailedReport: boolean = false,
  skipSlack: boolean = false,
  subnetId?: string
) {
  try {
    console.log('Loading configuration...')
    const config = loadConfig()
    validateConfig(config)

    console.log('Generating test cases...')
    const testCases = generateTestCases(subnetId)
    console.log(
      `Generated ${testCases.length} test cases${
        subnetId ? ` for subnet ${subnetId}` : ''
      }`
    )

    console.log('Running tests...')
    const results = await runTests(testCases, config)

    const failedTests = results.filter((result) => !result.success)
    const passedTests = results.filter((result) => result.success)

    console.log(
      `Tests completed: ${passedTests.length} passed, ${failedTests.length} failed`
    )

    // Check if we should send Slack notifications
    if (skipSlack) {
      console.log('Skipping Slack notifications (--skip-slack flag is set)')
      console.log('Printing test report to console instead:')
      await sendSlackNotification(results, config, isDetailedReport, true)
    } else if (
      isDetailedReport ||
      failedTests.length > 0 ||
      config.alwaysNotify
    ) {
      console.log(
        `Sending ${
          isDetailedReport ? 'detailed' : 'standard'
        } Slack notification...`
      )
      await sendSlackNotification(results, config, isDetailedReport)
    } else {
      console.log(
        'No failures and alwaysNotify is disabled, skipping notification'
      )
    }

    console.log('Done!')
  } catch (error) {
    console.error('Error running tests:', error)
    process.exit(1)
  }
}

// If running directly (not imported)
if (require.main === module) {
  const config = loadConfig()

  // Check for webhook-only mode
  if (process.argv.includes('--webhook-only')) {
    console.log('Starting in webhook-only mode')
    validateConfig(config)
    const server = startWebhookServer(config)

    if (!server) {
      console.error(
        'Failed to start webhook server. Make sure WEBHOOK_ENABLED is set to true in your .env file.'
      )
      process.exit(1)
    }
  } else if (process.argv.includes('--now')) {
    // Run immediately if --now flag is provided
    const runDetailedReport = process.argv.includes('--detailed')
    const skipSlack = process.argv.includes('--skip-slack')

    // Check for subnet flag
    const subnetArgIndex = process.argv.findIndex((arg) => arg === '--subnet')
    const subnetId =
      subnetArgIndex !== -1 && subnetArgIndex < process.argv.length - 1
        ? process.argv[subnetArgIndex + 1]
        : undefined

    console.log(
      `Running tests immediately with ${
        runDetailedReport ? 'detailed' : 'standard'
      } report...${skipSlack ? ' (Slack notifications disabled)' : ''}${
        subnetId ? ` for subnet ${subnetId}` : ''
      }`
    )
    main(runDetailedReport, skipSlack, subnetId)
  } else {
    // Check for skip-slack flag in scheduled runs
    const skipSlack = process.argv.includes('--skip-slack')

    // Schedule regular tests
    console.log(`Scheduling regular tests with cron: ${config.testSchedule}`)
    cron.schedule(config.testSchedule, () => {
      const now = new Date()

      // Get the current time components
      const minute = now.getMinutes()
      const hour = now.getHours()
      const dayOfMonth = now.getDate()
      const month = now.getMonth() + 1 // getMonth() returns 0-11
      const dayOfWeek = now.getDay() // getDay() returns 0-6 (Sunday-Saturday)

      // Parse the detailed report schedule
      const detailedParts = config.detailedReportSchedule.split(' ')

      // Simple check if the current time matches the detailed report schedule
      // This is a basic implementation and doesn't handle all cron features
      const minuteMatch =
        detailedParts[0] === '*' || detailedParts[0] === String(minute)
      const hourMatch =
        detailedParts[1] === '*' || detailedParts[1] === String(hour)
      const dayOfMonthMatch =
        detailedParts[2] === '*' || detailedParts[2] === String(dayOfMonth)
      const monthMatch =
        detailedParts[3] === '*' || detailedParts[3] === String(month)
      const dayOfWeekMatch =
        detailedParts[4] === '*' || detailedParts[4] === String(dayOfWeek)

      // If all components match, the detailed report would run now
      if (
        minuteMatch &&
        hourMatch &&
        dayOfMonthMatch &&
        monthMatch &&
        dayOfWeekMatch
      ) {
        console.log(
          `Skipping regular tests at ${now.toISOString()} because detailed report is also scheduled`
        )
        return
      }

      console.log(`Running scheduled tests at ${now.toISOString()}`)
      main(false, skipSlack)
    })

    // Schedule detailed reports
    console.log(
      `Scheduling detailed reports with cron: ${config.detailedReportSchedule}`
    )
    cron.schedule(config.detailedReportSchedule, () => {
      console.log(
        `Running scheduled detailed report at ${new Date().toISOString()}`
      )
      main(true, skipSlack)
    })

    console.log('Test service started. Press Ctrl+C to exit.')

    // Start webhook server if enabled
    if (config.webhookEnabled) {
      startWebhookServer(config)
    }
  }
}

// Add webhook command to exports
export { startWebhookServer }

export { main }
