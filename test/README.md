# Subnet IO Registry Test Suite

This directory contains automated testing tools for the subnet-io-registry.

## Available Test Tools

### Alerts Service

The `alerts` directory contains an automated test and alert service that:

- Tests all endpoints in all subnets
- Validates responses against example responses
- Sends Slack notifications with test results (optional)
- Can be scheduled to run at regular intervals
- Runs tests in parallel for efficiency

#### Usage

```bash
cd test/alerts
npm install
npm run build
```

To run tests immediately:

```bash
npm start -- --now
```

To start the scheduled service:

```bash
npm start
```

#### Configuration

Create a `.env` file based on the `.env.example` file:

```bash
cp .env.example .env
```

Edit the `.env` file to configure:

- Test frequency (cron expression)
- API base URL and token
- Slack notifications (optional)
- Test timeout and retry settings

#### Slack Notifications

For detailed instructions on setting up Slack notifications, see [SLACK_SETUP.md](alerts/SLACK_SETUP.md).

## Adding New Tests

When adding new subnets or endpoints to the registry, the test service will automatically discover and test them based on the API definitions and example request/response pairs.

## Troubleshooting

If you encounter issues with the tests:

1. Check that your API token is valid
2. Verify that the example request/response pairs are valid JSON
3. Ensure the API base URL is correct
4. Check the console output for detailed error messages
