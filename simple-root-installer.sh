#!/bin/bash

echo "🚀 ALGORITMIT v4.0 Simple Root Installer Starting..."
echo "=================================================="

# Create installation directory
echo "📁 Creating installation directory..."
mkdir -p /opt/algoritmit-v4.0-trading-bot
cd /opt/algoritmit-v4.0-trading-bot

# Create trading user if it doesn't exist
echo "👤 Setting up trading user..."
if ! id "trading" &>/dev/null; then
    useradd -m -s /bin/bash -d /home/trading trading
    echo "trading:trading123" | chpasswd
    usermod -aG sudo trading
    echo "✅ Trading user created with password: trading123"
else
    echo "ℹ️ Trading user already exists"
fi

# Install Node.js if not present
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    echo "✅ Node.js installed"
else
    echo "✅ Node.js already installed"
fi

# Create package.json
echo "📝 Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "algoritmit-smart-volatility-v4.0",
  "version": "4.0.0",
  "description": "ALGORITMIT Smart Volatility Trading Bot v4.0",
  "main": "algoritmit-v4.0-bot.js",
  "scripts": {
    "start": "node algoritmit-v4.0-bot.js",
    "setup": "node setup-wizard-v4.0.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "chalk": "^4.1.2",
    "inquirer": "^8.2.6",
    "ws": "^8.14.2"
  }
}
EOF

# Download main bot file
echo "📥 Downloading main bot file..."
curl -fsSL -o algoritmit-v4.0-bot.js https://raw.githubusercontent.com/cachitoloco/elotro/main/worldchain-trading-bot.js

# Create setup wizard
echo "🔧 Creating setup wizard..."
cat > setup-wizard-v4.0.js << 'EOF'
#!/usr/bin/env node
console.log('🚀 ALGORITMIT v4.0 Setup Wizard');
console.log('This is a basic setup wizard for the ALGORITMIT v4.0 trading bot.');
console.log('For full setup instructions, visit: https://github.com/cachitoloco/elotro');
EOF

# Create configuration files
echo "⚙️ Creating configuration files..."
cat > .env.template << 'EOF'
# ALGORITMIT v4.0 Configuration
WORLDCHAIN_RPC_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
INITIAL_INVESTMENT=0.1
MAX_INVESTMENT=1.0
ENABLE_ULTRAFAST_MODE=true
EOF

cat > config.json << 'EOF'
{
  "bot": {
    "name": "ALGORITMIT Smart Volatility v4.0",
    "version": "4.0.0",
    "mode": "ultra-fast"
  },
  "trading": {
    "enabled": false,
    "initialInvestment": 0.1,
    "maxInvestment": 1.0
  }
}
EOF

# Create README
echo "📚 Creating README..."
cat > README.md << 'EOF'
# ALGORITMIT Smart Volatility v4.0

## Quick Start

1. Switch to trading user:
   su - trading

2. Navigate to bot directory:
   cd /opt/algoritmit-v4.0-trading-bot

3. Install dependencies:
   npm install

4. Configure the bot:
   cp .env.template .env
   # Edit .env with your settings

5. Start the bot:
   npm start

## Features
- Ultra-fast execution (<3 seconds)
- AI-powered trading strategies
- Advanced risk management
- Color-coded profit tracking

For help: https://github.com/cachitoloco/elotro
EOF

# Install dependencies
echo "📦 Installing dependencies..."
npm install --silent

# Set permissions
echo "🔒 Setting permissions..."
chown -R trading:trading /opt/algoritmit-v4.0-trading-bot
chmod -R 755 /opt/algoritmit-v4.0-trading-bot

# Create start script
echo "🚀 Creating start script..."
cat > /usr/local/bin/start-algoritmit << 'EOF'
#!/bin/bash
cd /opt/algoritmit-v4.0-trading-bot
npm start
EOF

chmod +x /usr/local/bin/start-algoritmit

echo ""
echo "🎉 ALGORITMIT v4.0 Installation Complete!"
echo "=========================================="
echo ""
echo "📁 Installation directory: /opt/algoritmit-v4.0-trading-bot"
echo "👤 Trading user: trading (password: trading123)"
echo ""
echo "🚀 To start the bot:"
echo "1. su - trading"
echo "2. cd /opt/algoritmit-v4.0-trading-bot"
echo "3. npm start"
echo ""
echo "🔒 IMPORTANT: Change the trading user password!"
echo "   passwd trading"
echo ""
echo "✅ Installation successful!"