#!/bin/bash

echo "🔧 Fixing ALGORITMIT v4.0 Dependencies..."
echo "=========================================="

cd /opt/algoritmit-v4.0-trading-bot

echo "📦 Installing missing dependencies..."

# Install core dependencies
npm install ethers@^6.9.0

# Install HoldStation dependencies
npm install @holdstation/worldchain-ethers-v6@^4.0.29
npm install @holdstation/worldchain-sdk@^4.0.29

# Install WorldCoin dependencies
npm install @worldcoin/minikit-js@^1.9.6

# Install additional required packages
npm install axios@^1.6.0
npm install chalk@^4.1.2
npm install figlet@^1.7.0
npm install inquirer@^8.2.6
npm install node-cron@^3.0.3
npm install ora@^5.4.1
npm install ws@^8.14.2

echo "✅ Dependencies installed successfully!"
echo ""
echo "🚀 Now you can start the bot:"
echo "npm start"
echo ""
echo "📁 Current directory: $(pwd)"
echo "📦 Dependencies: $(ls node_modules | wc -l) packages installed"