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

# Main execution
case "$1" in
  start)
    start_service
    ;;
  update)
    update_repo
    start_service
    ;;
  *)
    echo "Usage: $0 {start|update}"
    echo "  start  - Start or restart the service"
    echo "  update - Pull latest changes and restart the service"
    exit 1
    ;;
esac

exit 0
