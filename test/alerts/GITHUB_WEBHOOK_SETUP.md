# Setting Up GitHub Webhooks for Subnet IO Registry Alerts

This guide provides detailed instructions on how to set up GitHub webhooks to automatically update your subnet-io-registry alerts service when changes are pushed to the repository.

## Prerequisites

- A running subnet-io-registry alerts service
- Administrative access to the GitHub repository
- A server with a public IP address or domain name
- Port 9000 (or your configured port) open on your server's firewall

## Step 1: Configure Your Alerts Service

1. Edit your `.env` file to enable the webhook:

   ```
   WEBHOOK_ENABLED=true
   WEBHOOK_SECRET=your-secure-random-string  # Use a strong random string
   WEBHOOK_PORT=9000  # Or another port of your choice
   REPO_PATH=/path/to/subnet-io-registry  # Full path to your repository
   ```

   > **Security Tip**: Generate a secure random string for your webhook secret:
   > ```bash
   > openssl rand -hex 20
   > ```

2. Start your alerts service with webhook support:

   ```bash
   npm start
   ```

   Or if you only want to run the webhook server:

   ```bash
   npm run start:webhook
   ```

3. Verify that the webhook server is running by checking the logs:

   ```
   Webhook server listening on port 9000
   Repository path: /path/to/subnet-io-registry
   ```

## Step 2: Configure Your Server's Firewall

Ensure that the webhook port is open on your server's firewall:

### For UFW (Ubuntu/Debian):

```bash
sudo ufw allow 9000/tcp
sudo ufw status
```

### For firewalld (CentOS/RHEL):

```bash
sudo firewall-cmd --permanent --add-port=9000/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

## Step 3: Set Up the GitHub Webhook

1. Go to your GitHub repository
2. Click on "Settings" in the top navigation bar
3. Select "Webhooks" from the left sidebar
4. Click "Add webhook"
5. Configure the webhook:
   - **Payload URL**: `http://your-server-ip:9000` (or your domain)
   - **Content type**: `application/json`
   - **Secret**: The same value you set for `WEBHOOK_SECRET` in your `.env` file
   - **SSL verification**: Enable if you're using HTTPS
   - **Which events would you like to trigger this webhook?**: Select "Just the push event"
   - **Active**: Check this box

6. Click "Add webhook"

![GitHub Webhook Configuration](https://docs.github.com/assets/cb-33734/mw-1440/images/help/webhooks/webhook-endpoint.webp)

## Step 4: Test the Webhook

1. In GitHub, go to your newly created webhook
2. Scroll down to "Recent Deliveries"
3. Click "Redeliver" to send a test payload
4. Check your server logs to verify that the webhook was received and processed

Alternatively, make a small change to your repository and push it:

```bash
# Make a small change
echo "# Test webhook" >> README.md

# Commit and push
git add README.md
git commit -m "Test webhook"
git push
```

## Step 5: Secure Your Webhook (Optional but Recommended)

For production environments, it's recommended to use HTTPS for your webhook. You can set up Nginx as a reverse proxy with Let's Encrypt SSL certificates:

1. Install Nginx and Certbot:

   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. Configure Nginx as a reverse proxy:

   Create a file at `/etc/nginx/sites-available/webhook`:

   ```nginx
   server {
       listen 80;
       server_name webhook.yourdomain.com;  # Replace with your domain

       location / {
           proxy_pass http://localhost:9000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Enable the site and get SSL certificates:

   ```bash
   sudo ln -s /etc/nginx/sites-available/webhook /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d webhook.yourdomain.com
   ```

4. Update your GitHub webhook URL to use HTTPS:
   - `https://webhook.yourdomain.com`

## Troubleshooting

### Webhook Not Receiving Events

1. Check that your server is publicly accessible on the webhook port
   ```bash
   # From another machine
   curl -v http://your-server-ip:9000
   ```

2. Verify that the webhook server is running
   ```bash
   ps aux | grep node
   ```

3. Check server logs for errors
   ```bash
   npm start -- --webhook-only
   ```

### Invalid Signature Errors

If you see "Invalid webhook signature" errors:

1. Verify that the `WEBHOOK_SECRET` in your `.env` file exactly matches the secret in GitHub
2. Check for any whitespace or special characters that might be causing issues
3. Regenerate the secret and update both your `.env` file and GitHub webhook

### Repository Update Failures

If the webhook receives events but fails to update the repository:

1. Check that the `REPO_PATH` in your `.env` file is correct
2. Verify that the user running the service has permission to pull from the repository
3. Check for any Git authentication issues
4. Try running the update script manually:
   ```bash
   ./start.sh update
   ```

## Advanced Configuration

### Running Behind a Proxy

If your server is behind a proxy, you may need to configure the webhook to work with the proxy:

1. Set up your proxy to forward requests to your webhook server
2. Make sure the proxy preserves the `X-Hub-Signature` header
3. Update your GitHub webhook URL to point to your proxy

### Using a Different Port

To use a different port:

1. Update the `WEBHOOK_PORT` in your `.env` file
2. Update your firewall rules to allow traffic on the new port
3. Update your GitHub webhook URL to use the new port
4. If using Nginx, update the proxy_pass directive to point to the new port

## Security Best Practices

1. **Use HTTPS**: Always use HTTPS for production webhooks
2. **Strong Secret**: Use a long, random string for your webhook secret
3. **Firewall Rules**: Only allow traffic to the webhook port from GitHub's IP ranges
4. **Regular Updates**: Keep your Node.js and dependencies updated
5. **Validate Payloads**: The webhook server validates signatures, but you can add additional validation
6. **Limit Permissions**: Run the service with minimal required permissions
