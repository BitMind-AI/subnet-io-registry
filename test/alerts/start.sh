#!/bin/bash
# Subnet IO Registry Alerts Service
# This script handles both starting and updating the service

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Function to start or restart the service
start_service() {
  echo "Starting/restarting subnet-alerts service..."
  # Check if PM2 is installed
  if command -v pm2 &> /dev/null; then
    # Use PM2 if available
    pm2 restart subnet-alerts 2>/dev/null || pm2 start npm --name "subnet-alerts" -- start
    echo "Service started with PM2"
  else
    # Fall back to regular node if PM2 is not available
    echo "PM2 not found, starting with node directly"
    nohup npm start > alerts.log 2>&1 &
    echo "Service started with PID: $!"
  fi
}

# Function to update the repository
update_repo() {
  echo "Updating repository..."
  # Go to repository root (parent directory of this script)
  cd "$(dirname "$DIR")"
  
  # Pull latest changes
  git pull
  
  # Return to the alerts directory
  cd "$DIR"
  
  # Install dependencies and build
  npm install
  npm run build
  
  echo "Repository updated successfully"
}

# Function to check if we're being called from the webhook
is_webhook_call() {
  # Check if this script is being called from the webhook server
  # by examining the parent process
  parent_cmd=$(ps -o cmd= -p $PPID)
  if [[ $parent_cmd == *"node"* && $parent_cmd == *"webhook"* ]]; then
    return 0  # True, this is a webhook call
  fi
  return 1  # False, not a webhook call
}

# Main execution
case "$1" in
  start)
    start_service
    ;;
  update)
    update_repo
    
    # Only restart the service if this is not called from the webhook
    # or if the --force-restart flag is provided
    if [[ "$2" == "--force-restart" ]] || ! is_webhook_call; then
      echo "Restarting service after update..."
      start_service
    else
      echo "Update completed. Service will not be restarted as it was called from webhook."
      echo "Changes will be applied on next manual restart or service reload."
    fi
    ;;
  webhook-update)
    # Special case for webhook updates - update without restarting
    update_repo
    echo "Repository updated by webhook. Service NOT restarted to avoid restart loops."
    ;;
  *)
    echo "Usage: $0 {start|update|webhook-update}"
    echo "  start         - Start or restart the service"
    echo "  update        - Pull latest changes and restart the service"
    echo "  webhook-update - Update repository without restarting service"
    exit 1
    ;;
esac

exit 0
