# Subnet IO Registry Alerts

Automated test and alert service for subnet endpoints. This service tests all endpoints in the subnet-io-registry and sends Slack notifications with the results.

## Features

- Tests all endpoints in all subnets
- Validates responses against example responses
- Sends Slack notifications with test results
- Configurable test frequency via cron expression
- Scheduled detailed reports with performance metrics
- GitHub webhook support for automatic updates
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

The `.env.example` file contains detailed comments about which variables are required and which have defaults. At minimum, you must set:

```
# Required API configuration
BITMIND_API_BASE_URL=https://api.bitmind.ai/oracle/v1
BITMIND_API_TOKEN=your_api_token

# At least one of these for notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
# OR
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C12345678
```

For webhook functionality, you must also set:

```
WEBHOOK_ENABLED=true
WEBHOOK_SECRET=your-secure-random-string
REPO_PATH=/path/to/subnet-io-registry
```

See `.env.example` for all available configuration options and their defaults.

## Usage

### Build the project

```bash
npm run build
```

### Service Management

```bash
# Start the service with PM2 (if available, falls back to nohup)
npm run start:pm2

# Update the repository and restart the service
npm run update
```

### Development Commands

```bash
# Run in development mode with auto-reloading
npm run dev

# Run tests immediately in development mode
npm run now                     # Run tests immediately
npm run now:detailed            # Run with detailed report
npm run now:skip-slack          # Run without sending Slack notifications
npm run now:detailed:skip-slack # Run detailed report without Slack
npm run now -- --subnet 1       # Run tests for a specific subnet (e.g., subnet 1)

# Run the compiled service directly without PM2/nohup
npm run start:dev

# Run the compiled service with specific options
npm run start:dev -- --now                     # Run tests immediately
npm run start:dev -- --now --detailed          # Run with detailed report
npm run start:dev -- --now --skip-slack        # Run without sending Slack notifications
npm run start:dev -- --now --detailed --skip-slack  # Run detailed report without Slack
npm run start:dev -- --now --subnet 1          # Run tests for a specific subnet (e.g., subnet 1)

# Start only the webhook server
npm run start:webhook
```

### Using the start.sh Script Directly

The `start.sh` script provides a convenient way to manage the service:

```bash
# Start or restart the service
./start.sh start

# Update the repository and restart the service
./start.sh update
```

## How It Works

1. The service loads all subnet API definitions from the `subnets` directory
2. It generates test cases based on the example request/response pairs
3. It executes the tests in parallel using Promise.all
4. It validates the responses against the example responses
5. It sends a Slack notification with the test results
6. If webhook is enabled, it listens for GitHub push events to automatically update

## GitHub Webhook Integration

The service includes a webhook server that can automatically update and restart the service when changes are pushed to the GitHub repository.

### Setting Up the Webhook

For detailed instructions on setting up GitHub webhooks, see [GITHUB_WEBHOOK_SETUP.md](GITHUB_WEBHOOK_SETUP.md).

Quick setup:

1. Enable the webhook in your `.env` file:
   ```
   WEBHOOK_ENABLED=true
   WEBHOOK_SECRET=your-secure-random-string  # Required - must be set to a secure value
   WEBHOOK_PORT=9000  # Optional - defaults to 9000
   REPO_PATH=/path/to/subnet-io-registry  # Required - path to your repository
   ```

2. Start the service:
   ```bash
   # Start the service (uses PM2 if available)
   npm run start:pm2

   # Start only the webhook server
   npm run start:webhook
   ```

3. Configure the webhook in GitHub (see [detailed instructions](GITHUB_WEBHOOK_SETUP.md))

### How the Webhook Works

1. When a push is made to the main branch, GitHub sends a POST request to your webhook server
2. The server verifies the request signature using your secret
3. If valid, it executes the `start.sh update` script which:
   - Pulls the latest changes from the repository
   - Installs dependencies and rebuilds the project
   - Restarts the service using PM2 (if available) or nohup

## Slack Notification Format

### Standard Report
The standard Slack notification includes:

- Test summary (total tests, passed, failed, pass rate)
- Failed test details grouped by subnet
- Average response time
- Timestamp

### Detailed Report
The detailed report includes everything in the standard report, plus:

- Per-subnet performance metrics
- Average response time for each subnet
- Pass rate for each subnet
- Fastest and slowest endpoints for each subnet
- Response time for each endpoint

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
│   ├── webhook.ts         # GitHub webhook server
│   └── types.ts           # Type definitions
├── package.json
├── tsconfig.json
└── .env.example
```

### Running in Development Mode

```bash
npm run dev
```
