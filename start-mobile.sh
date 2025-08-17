#!/bin/bash

# Get the machine's IP address on the local network
IP=$(ip addr show | grep -E "inet.*wl|inet.*eth" | head -1 | awk '{print $2}' | cut -d'/' -f1)

if [ -z "$IP" ]; then
    IP="localhost"
fi

echo "========================================="
echo "    AI Media Studio - Mobile Setup"
echo "========================================="
echo ""
echo "Server will be available at:"
echo ""
echo "  Desktop:  http://localhost:5174"
echo "  Mobile:   http://$IP:5174"
echo ""
echo "For mobile access:"
echo "1. Connect your phone to the same WiFi"
echo "2. Open the mobile URL above in your browser"
echo "3. The server API runs on port 8787"
echo ""
echo "Starting development servers..."
echo "========================================="

# Set the API URL for mobile access
export VITE_API_BASE_URL="http://$IP:8787"

# Start the development server
pnpm dev