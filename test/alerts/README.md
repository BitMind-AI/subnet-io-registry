# Subnet IO Registry Alerts

Automated test and alert service for subnet endpoints. This service tests all endpoints in the subnet-io-registry and sends Slack notifications with the results.

## Features

- Tests all endpoints in all subnets
- Validates responses against example responses
- Sends Slack notifications with test results
- Configurable test frequency via cron expression
- Retry logic for transient failures
- Parallel test execution for efficiency

## Installation

1. Install dependencies:

```bash
cd test/alerts
npm install
```

2. Create a `.env` file based on the `.env.example` file:

```bash
cp .env.example .env
```

3. Edit the `.env` file and add your configuration:

```
# Test frequency (cron expression)
TEST_SCHEDULE=0 */6 * * *  # Run every 6 hours

# Slack configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
# OR
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C12345678

# API configuration
BITMIND_API_BASE_URL=https://api.bitmind.ai/oracle/v1
BITMIND_API_TOKEN=your_api_token

# Test settings
TEST_TIMEOUT_MS=30000
TEST_RETRY_COUNT=3
ALWAYS_NOTIFY=false  # Set to true to send notifications even when all tests pass
```

## Usage

### Build the project

```bash
npm run build
```

### Run tests immediately

```bash
npm start -- --now
```

### Start the scheduled service

```bash
npm start
```

## How It Works

1. The service loads all subnet API definitions from the `subnets` directory
2. It generates test cases based on the example request/response pairs
3. It executes the tests in parallel using Promise.all
4. It validates the responses against the example responses
5. It sends a Slack notification with the test results

## Slack Notification Format

The Slack notification includes:

- Test summary (total tests, passed, failed, pass rate)
- Failed test details grouped by subnet
- Average response time
- Timestamp

## Development

### Project Structure

```
test/alerts/
├── src/
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration loading
│   ├── discovery.ts       # Endpoint discovery
│   ├── executor.ts        # Test execution
│   ├── validator.ts       # Response validation
│   ├── notifier.ts        # Slack notifications
│   └── types.ts           # Type definitions
├── package.json
├── tsconfig.json
└── .env.example
```

### Running in Development Mode

```bash
npm run dev
```
