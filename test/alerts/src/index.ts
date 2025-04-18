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
 */
async function main(
  isDetailedReport: boolean = false,
  skipSlack: boolean = false
) {
  try {
    console.log('Loading configuration...')
    const config = loadConfig()
    validateConfig(config)

    console.log('Generating test cases...')
    const testCases = generateTestCases()
    console.log(`Generated ${testCases.length} test cases`)

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

    console.log(
      `Running tests immediately with ${
        runDetailedReport ? 'detailed' : 'standard'
      } report...${skipSlack ? ' (Slack notifications disabled)' : ''}`
    )
    main(runDetailedReport, skipSlack)
  } else {
    // Check for skip-slack flag in scheduled runs
    const skipSlack = process.argv.includes('--skip-slack')

    // Schedule regular tests
    console.log(`Scheduling regular tests with cron: ${config.testSchedule}`)
    cron.schedule(config.testSchedule, () => {
      console.log(`Running scheduled tests at ${new Date().toISOString()}`)
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
