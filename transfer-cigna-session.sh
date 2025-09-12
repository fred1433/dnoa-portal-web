#!/bin/bash

# Script to transfer Cigna session to production server
# Usage: ./transfer-cigna-session.sh

echo "🔄 Cigna Session Transfer Tool"
echo "==============================="

# Check if session file exists
if [ ! -f ".cigna-session/storageState.json" ]; then
    echo "❌ No session file found at .cigna-session/storageState.json"
    echo "   Please login to Cigna locally first with: node test-cigna.js"
    exit 1
fi

# Get file size
SIZE=$(ls -lh .cigna-session/storageState.json | awk '{print $5}')
echo "✅ Found session file ($SIZE)"

# Create base64 encoded version
echo "📦 Encoding session..."
base64 -i .cigna-session/storageState.json -o cigna-session.b64

echo ""
echo "📋 Instructions for Render deployment:"
echo "--------------------------------------"
echo "1. Go to Render dashboard and open Shell"
echo ""
echo "2. Run these commands:"
echo "   mkdir -p .cigna-session"
echo "   cat > .cigna-session/storageState.json.b64"
echo "   [Paste content from cigna-session.b64 file]"
echo "   [Press Ctrl+D to save]"
echo "   base64 -d .cigna-session/storageState.json.b64 > .cigna-session/storageState.json"
echo "   rm .cigna-session/storageState.json.b64"
echo ""
echo "3. Verify with:"
echo "   ls -la .cigna-session/"
echo "   # Should show storageState.json with ~29KB size"
echo ""
echo "📄 Base64 content saved to: cigna-session.b64"
echo "   You can now copy its content to paste on Render"
echo ""
echo "✨ Session will persist for ~30 days after transfer"