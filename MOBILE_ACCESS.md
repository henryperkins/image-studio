# Mobile Device Access Guide

## Problem
When accessing the AI Media Studio from a mobile device, image generation fails because the mobile device cannot connect to `localhost:8787`.

## Solution

### Option 1: Automatic Detection (Already Implemented)
The app now automatically detects when it's being accessed from a non-localhost address and updates the API URL accordingly. Simply:

1. Find your computer's local IP address:
   - **Windows**: Run `ipconfig` and look for IPv4 Address
   - **Mac/Linux**: Run `ifconfig` or `ip addr`
   - Example: `192.168.1.100` or `10.0.0.5`

2. Start both the web and API servers:
   ```bash
   pnpm dev
   ```

3. On your mobile device:
   - Connect to the same WiFi network as your computer
   - Open your browser and navigate to: `http://YOUR_COMPUTER_IP:5175`
   - Example: `http://192.168.1.100:5175`

### Option 2: Manual Configuration
Create a `.env` file in the `web` directory:

```bash
cd web
cp .env.example .env
```

Edit `.env` and set:
```
VITE_API_BASE_URL=http://YOUR_COMPUTER_IP:8787
```

Then restart the development server.

## Troubleshooting

### Connection Failed Error
If you see "Connection failed. On mobile?" error, check:

1. **Same Network**: Ensure both devices are on the same WiFi network
2. **Firewall**: Your firewall may be blocking port 8787
   - Windows: Allow Node.js through Windows Defender Firewall
   - Mac: Check System Preferences > Security & Privacy > Firewall
3. **Server Running**: Ensure the API server is running on port 8787
4. **Correct IP**: Verify you're using the correct IP address

### Finding Your IP Address
The web console will show: `🔗 API Base URL: http://YOUR_IP:8787`

### Port Already in Use
If you see "address already in use 0.0.0.0:8787":
```bash
# Find and kill the process using port 8787
lsof -i :8787  # Mac/Linux
netstat -ano | findstr :8787  # Windows

# Then kill the process
kill -9 PID  # Mac/Linux
taskkill /PID PID /F  # Windows
```

## Security Note
This setup is for development only. Never expose your development server to the public internet without proper security measures.