#!/bin/bash

# Script to transfer session via SCP to Render
# Note: You need to replace SERVICE_ID with your actual dental-portal-extractor service ID

SERVICE_ID="YOUR_SERVICE_ID_HERE"  # Replace this!

echo "📤 Transferring Cigna session to Render via SCP..."

# Copy the session file directly
scp -i ~/.ssh/id_render .cigna-session/storageState.json ${SERVICE_ID}@ssh.oregon.render.com:.cigna-session/

if [ $? -eq 0 ]; then
    echo "✅ Session transferred successfully!"
else
    echo "❌ Transfer failed. Please check your service ID."
fi