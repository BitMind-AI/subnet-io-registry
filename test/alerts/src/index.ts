import cron from 'node-cron'
import { loadConfig, validateConfig } from './config'
import { generateTestCases } from './discovery'
import { runTests } from './executor'
import { sendSlackNotification } from './notifier'

/**
 * Main function to run tests and send notifications
 */
async function main() {
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

    // Send notification if there are failures or if always notify is enabled
    if (failedTests.length > 0 || config.alwaysNotify) {
      console.log('Sending Slack notification...')
      await sendSlackNotification(results, config)
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

  if (process.argv.includes('--now')) {
    // Run immediately if --now flag is provided
    console.log('Running tests immediately...')
    main()
  } else {
    // Schedule using cron
    console.log(`Scheduling tests with cron: ${config.testSchedule}`)
    cron.schedule(config.testSchedule, () => {
      console.log(`Running scheduled tests at ${new Date().toISOString()}`)
      main()
    })

    console.log('Test service started. Press Ctrl+C to exit.')
  }
}

export { main }
