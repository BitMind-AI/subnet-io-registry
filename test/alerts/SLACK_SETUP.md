# Setting Up Slack Notifications

This guide will help you set up Slack notifications for the subnet-io-registry-alerts service.

## Option 1: Using Slack Webhooks (Recommended)

Slack webhooks are the simplest way to send notifications to a Slack channel.

1. **Create a Slack App**:
   - Go to [https://api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" and select "From scratch"
   - Name your app (e.g., "Subnet Registry Alerts") and select your workspace
   - Click "Create App"

2. **Enable Incoming Webhooks**:
   - In the left sidebar, click on "Incoming Webhooks"
   - Toggle "Activate Incoming Webhooks" to On
   - Click "Add New Webhook to Workspace"
   - Select the channel where you want to receive notifications
   - Click "Allow"

3. **Copy the Webhook URL**:
   - After allowing, you'll be redirected back to the Incoming Webhooks page
   - Copy the Webhook URL (it should look like `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`)

4. **Update Your .env File**:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
   ```

## Option 2: Using Slack Bot Token

If you need more advanced features, you can use a Slack Bot Token.

1. **Create a Slack App** (if you haven't already):
   - Go to [https://api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" and select "From scratch"
   - Name your app and select your workspace
   - Click "Create App"

2. **Add Bot Token Scopes**:
   - In the left sidebar, click on "OAuth & Permissions"
   - Scroll down to "Scopes" and add the following Bot Token Scopes:
     - `chat:write`
     - `chat:write.public`

3. **Install the App to Your Workspace**:
   - Scroll up to the top of the "OAuth & Permissions" page
   - Click "Install to Workspace"
   - Review the permissions and click "Allow"

4. **Copy the Bot Token**:
   - After installation, you'll be redirected back to the OAuth & Permissions page
   - Copy the "Bot User OAuth Token" (it should start with `xoxb-`)

5. **Get the Channel ID**:
   - In Slack, right-click on the channel where you want to receive notifications
   - Select "Copy Link"
   - The channel ID is the last part of the URL (e.g., `C01234ABCDE`)

6. **Update Your .env File**:
   ```
   SLACK_BOT_TOKEN=xoxb-your-token-here
   SLACK_CHANNEL_ID=C01234ABCDE
   ```

## Testing Your Slack Integration

After setting up either the webhook URL or bot token, you can test the integration by running:

```bash
cd test/alerts
npm run build
npm start -- --now
```

If everything is set up correctly, you should receive a notification in your Slack channel with the test results.
