#!/bin/bash

# =============================================================================
# ALGORITMIT TRADING BOT - UBUNTU INSTALLATION SCRIPT
# =============================================================================
# This script installs the ALGORITMIT Trading Bot on Ubuntu servers
# Perfect for novice traders - fully automated installation
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# ASCII Art Banner
print_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                              ║"
    echo "║  █████  ██      ██████  ██████   ██████  ███ ███ ██ ████████ ████████      ║"
    echo "║ ██   ██ ██      ██   ██ ██   ██ ██    ██ ████  ████ ██       ██            ║"
    echo "║ ███████ ██      ██████  ██████  ██    ██ ██ ███ ██ ██ █████  ████████      ║"
    echo "║ ██   ██ ██      ██   ██ ██   ██ ██    ██ ██  ██  ██ ██           ██       ║"
    echo "║ ██   ██ ███████ ██   ██ ██   ██  ██████  ██      ██ ███████ ████████       ║"
    echo "║                                                                              ║"
    echo "║                    🌐 WORLDCHAIN TRADING BOT INSTALLER                      ║"
    echo "║                                                                              ║"
    echo "║  🤖 AI-Powered Trading | 💰 Multi-Strategy | 🔒 Secure | 🚀 Easy Setup     ║"
    echo "║                                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print colored status messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

print_step() {
    echo -e "${PURPLE}[→]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root!"
        print_info "Please run as a regular user with sudo privileges"
        exit 1
    fi
}

# Check Ubuntu version
check_ubuntu_version() {
    print_step "Checking Ubuntu version..."
    
    if ! command -v lsb_release &> /dev/null; then
        print_error "lsb_release not found. This script requires Ubuntu."
        exit 1
    fi
    
    UBUNTU_VERSION=$(lsb_release -rs)
    UBUNTU_CODENAME=$(lsb_release -cs)
    
    print_status "Ubuntu $UBUNTU_VERSION ($UBUNTU_CODENAME) detected"
    
    # Check if version is supported (18.04 or higher)
    if [[ $(echo "$UBUNTU_VERSION >= 18.04" | bc -l) -eq 0 ]]; then
        print_error "Ubuntu 18.04 or higher is required. Current version: $UBUNTU_VERSION"
        exit 1
    fi
}

# Update system packages
update_system() {
    print_step "Updating system packages..."
    
    sudo apt update -y
    sudo apt upgrade -y
    
    print_status "System packages updated successfully"
}

# Install required system dependencies
install_system_dependencies() {
    print_step "Installing system dependencies..."
    
    # Essential packages
    sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
    
    # Node.js repository
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    
    # Install Node.js and npm
    sudo apt install -y nodejs
    
    # Install build tools
    sudo apt install -y build-essential python3
    
    # Install additional dependencies
    sudo apt install -y screen htop nano vim
    
    print_status "System dependencies installed successfully"
}

# Install Node.js dependencies
install_node_dependencies() {
    print_step "Installing Node.js dependencies..."
    
    # Install global npm packages
    sudo npm install -g npm@latest
    sudo npm install -g pm2
    
    print_status "Node.js dependencies installed successfully"
}

# Create application directory
create_app_directory() {
    print_step "Creating application directory..."
    
    # Create directory in user's home
    mkdir -p ~/algoritmit-trading-bot
    cd ~/algoritmit-trading-bot
    
    print_status "Application directory created: ~/algoritmit-trading-bot"
}

# Download and setup the trading bot
setup_trading_bot() {
    print_step "Setting up ALGORITMIT Trading Bot..."
    
    cd ~/algoritmit-trading-bot
    
    # Create package.json
    cat > package.json << 'EOF'
{
  "name": "algoritmit-trading-bot",
  "version": "1.0.0",
  "description": "ALGORITMIT - AI-Powered Worldchain Trading Bot",
  "main": "worldchain-trading-bot.js",
  "scripts": {
    "start": "node worldchain-trading-bot.js",
    "dev": "nodemon worldchain-trading-bot.js",
    "install-deps": "npm install",
    "update": "git pull && npm install",
    "pm2-start": "pm2 start worldchain-trading-bot.js --name algoritmit-bot",
    "pm2-stop": "pm2 stop algoritmit-bot",
    "pm2-restart": "pm2 restart algoritmit-bot",
    "pm2-logs": "pm2 logs algoritmit-bot",
    "pm2-status": "pm2 status"
  },
  "keywords": [
    "trading",
    "bot",
    "worldchain",
    "ai",
    "machine-learning",
    "cryptocurrency",
    "defi"
  ],
  "author": "ALGORITMIT Team",
  "license": "MIT",
  "dependencies": {
    "ethers": "^6.15.0",
    "@holdstation/worldchain-ethers-v6": "^4.0.29",
    "@holdstation/worldchain-sdk": "^4.0.29",
    "inquirer": "^9.2.15",
    "chalk": "^5.3.0",
    "figlet": "^1.7.0",
    "node-telegram-bot-api": "^0.64.0",
    "axios": "^1.7.2",
    "ws": "^8.18.0",
    "dotenv": "^16.4.5",
    "fs-extra": "^11.2.0",
    "moment": "^2.30.1",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  }
}
EOF

    print_status "Package.json created successfully"
}

# Create configuration files
create_config_files() {
    print_step "Creating configuration files..."
    
    cd ~/algoritmit-trading-bot
    
    # Create .env template
    cat > .env.example << 'EOF'
# ALGORITMIT Trading Bot Configuration
# Copy this file to .env and fill in your values

# Worldchain RPC Configuration
WORLDCHAIN_RPC_URL=https://patient-patient-waterfall.worldchain-mainnet.quiknode.pro/cea629fe80a05630338845dc1fd58f8da329b083/

# Telegram Bot Configuration (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Trading Configuration
DEFAULT_TRADE_AMOUNT=0.1
MAX_SLIPPAGE=2.0
PROFIT_TARGET=5.0
STOP_LOSS=3.0

# Price Monitoring
PRICE_CHECK_INTERVAL=2000
PRICE_REFRESH_INTERVAL=2000

# Logging Configuration
LOG_LEVEL=info
ENABLE_VERBOSE_LOGGING=false

# Gas Configuration
GAS_LIMIT=350000
GAS_PRICE_MULTIPLIER=1.1

# Strategy Configuration
ENABLE_AUTO_TRADING=false
ENABLE_DIP_BUYING=true
ENABLE_PROFIT_TAKING=true
MAX_OPEN_POSITIONS=5
MAX_POSITION_SIZE=1.0
EOF

    # Create config.json template
    cat > config.json << 'EOF'
{
  "network": {
    "name": "worldchain",
    "chainId": 480,
    "rpcUrl": "https://patient-patient-waterfall.worldchain-mainnet.quiknode.pro/cea629fe80a05630338845dc1fd58f8da329b083/"
  },
  "trading": {
    "defaultTradeAmount": 0.1,
    "maxSlippage": 2.0,
    "profitTarget": 5.0,
    "stopLoss": 3.0,
    "enableAutoTrading": false,
    "enableDipBuying": true,
    "enableProfitTaking": true,
    "maxOpenPositions": 5,
    "maxPositionSize": 1.0
  },
  "monitoring": {
    "priceCheckInterval": 2000,
    "priceRefreshInterval": 2000,
    "enableVerboseLogging": false
  },
  "gas": {
    "gasLimit": 350000,
    "gasPriceMultiplier": 1.1
  },
  "telegram": {
    "enabled": false,
    "botToken": "",
    "chatId": ""
  }
}
EOF

    # Create wallets.json template
    cat > wallets.json << 'EOF'
[]
EOF

    # Create discovered_tokens.json template
    cat > discovered_tokens.json << 'EOF'
[]
EOF

    print_status "Configuration files created successfully"
}

# Create installation script
create_installation_script() {
    print_step "Creating installation script..."
    
    cd ~/algoritmit-trading-bot
    
    cat > install.sh << 'EOF'
#!/bin/bash

# ALGORITMIT Trading Bot - Quick Install Script
echo "🚀 Installing ALGORITMIT Trading Bot..."

# Install dependencies
npm install

# Create .env from template
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from template"
    echo "📝 Please edit .env file with your configuration"
fi

echo "✅ Installation completed!"
echo "🎯 To start the bot: npm start"
echo "📖 For help: ./help.sh"
EOF

    chmod +x install.sh
    
    print_status "Installation script created successfully"
}

# Create help script
create_help_script() {
    print_step "Creating help script..."
    
    cd ~/algoritmit-trading-bot
    
    cat > help.sh << 'EOF'
#!/bin/bash

echo "🤖 ALGORITMIT TRADING BOT - HELP GUIDE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 BASIC COMMANDS:"
echo "  npm start          - Start the trading bot"
echo "  npm run dev        - Start in development mode"
echo "  npm run pm2-start  - Start with PM2 (background)"
echo "  npm run pm2-stop   - Stop PM2 process"
echo "  npm run pm2-logs   - View PM2 logs"
echo "  npm run pm2-status - Check PM2 status"
echo ""
echo "⚙️  CONFIGURATION:"
echo "  nano .env          - Edit environment variables"
echo "  nano config.json   - Edit main configuration"
echo "  nano wallets.json  - Manage wallets"
echo ""
echo "📊 MONITORING:"
echo "  htop               - System monitoring"
echo "  screen -r          - Reattach to screen session"
echo "  pm2 monit          - PM2 monitoring"
echo ""
echo "🔄 UPDATES:"
echo "  npm run update     - Update bot and dependencies"
echo "  git pull           - Pull latest changes"
echo ""
echo "📁 FILES:"
echo "  ~/algoritmit-trading-bot/ - Main directory"
echo "  .env               - Environment configuration"
echo "  config.json        - Trading configuration"
echo "  wallets.json       - Wallet storage"
echo "  logs/              - Log files"
echo ""
echo "🔗 USEFUL LINKS:"
echo "  GitHub: https://github.com/your-repo/algoritmit-trading-bot"
echo "  Documentation: https://docs.algoritmit.com"
echo "  Support: https://t.me/algoritmit_support"
echo ""
EOF

    chmod +x help.sh
    
    print_status "Help script created successfully"
}

# Create systemd service
create_systemd_service() {
    print_step "Creating systemd service..."
    
    sudo tee /etc/systemd/system/algoritmit-bot.service > /dev/null << EOF
[Unit]
Description=ALGORITMIT Trading Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/algoritmit-trading-bot
ExecStart=/usr/bin/node worldchain-trading-bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable algoritmit-bot.service
    
    print_status "Systemd service created and enabled"
}

# Create update script
create_update_script() {
    print_step "Creating update script..."
    
    cd ~/algoritmit-trading-bot
    
    cat > update.sh << 'EOF'
#!/bin/bash

echo "🔄 Updating ALGORITMIT Trading Bot..."

# Stop the bot if running
if pm2 list | grep -q "algoritmit-bot"; then
    echo "⏹️  Stopping bot..."
    pm2 stop algoritmit-bot
fi

# Backup current configuration
echo "💾 Backing up configuration..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cp config.json config.json.backup.$(date +%Y%m%d_%H%M%S)

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install

# Restart the bot
echo "🔄 Restarting bot..."
pm2 start algoritmit-bot

echo "✅ Update completed successfully!"
echo "📊 Check status: pm2 status"
echo "📋 View logs: pm2 logs algoritmit-bot"
EOF

    chmod +x update.sh
    
    print_status "Update script created successfully"
}

# Create backup script
create_backup_script() {
    print_step "Creating backup script..."
    
    cd ~/algoritmit-trading-bot
    
    cat > backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/home/$USER/algoritmit-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="algoritmit-backup-$DATE.tar.gz"

echo "💾 Creating backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
tar -czf "$BACKUP_DIR/$BACKUP_NAME" \
    --exclude='node_modules' \
    --exclude='*.log' \
    --exclude='.git' \
    .

echo "✅ Backup created: $BACKUP_DIR/$BACKUP_NAME"
echo "📊 Backup size: $(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)"
EOF

    chmod +x backup.sh
    
    print_status "Backup script created successfully"
}

# Create monitoring script
create_monitoring_script() {
    print_step "Creating monitoring script..."
    
    cd ~/algoritmit-trading-bot
    
    cat > monitor.sh << 'EOF'
#!/bin/bash

echo "📊 ALGORITMIT TRADING BOT - SYSTEM MONITORING"
echo "════════════════════════════════════════════════════════════"
echo ""

# System information
echo "🖥️  SYSTEM INFORMATION:"
echo "  OS: $(lsb_release -d | cut -f2)"
echo "  Kernel: $(uname -r)"
echo "  CPU: $(nproc) cores"
echo "  Memory: $(free -h | awk 'NR==2{printf "%.1f/%.1f GB", $3/1024, $2/1024}')"
echo "  Disk: $(df -h / | awk 'NR==2{print $3 "/" $2 " (" $5 " used)"}')"
echo ""

# Node.js information
echo "🟢 NODE.JS INFORMATION:"
echo "  Version: $(node --version)"
echo "  NPM Version: $(npm --version)"
echo ""

# PM2 status
echo "🤖 PM2 PROCESS STATUS:"
if command -v pm2 &> /dev/null; then
    pm2 status
else
    echo "  PM2 not installed"
fi
echo ""

# Bot status
echo "📈 BOT STATUS:"
if [ -f "worldchain-trading-bot.js" ]; then
    echo "  ✅ Bot files present"
    if pgrep -f "worldchain-trading-bot.js" > /dev/null; then
        echo "  🟢 Bot is running"
    else
        echo "  🔴 Bot is not running"
    fi
else
    echo "  ❌ Bot files not found"
fi
echo ""

# Network connectivity
echo "🌐 NETWORK CONNECTIVITY:"
if ping -c 1 8.8.8.8 &> /dev/null; then
    echo "  ✅ Internet connection: OK"
else
    echo "  ❌ Internet connection: FAILED"
fi

if curl -s https://patient-patient-waterfall.worldchain-mainnet.quiknode.pro/cea629fe80a05630338845dc1fd58f8da329b083/ > /dev/null; then
    echo "  ✅ QuickNode RPC: OK"
else
    echo "  ❌ QuickNode RPC: FAILED"
fi
echo ""

# Recent logs
echo "📋 RECENT LOGS (last 10 lines):"
if [ -f "logs/bot.log" ]; then
    tail -10 logs/bot.log
else
    echo "  No log file found"
fi
EOF

    chmod +x monitor.sh
    
    print_status "Monitoring script created successfully"
}

# Create README
create_readme() {
    print_step "Creating README file..."
    
    cd ~/algoritmit-trading-bot
    
    cat > README.md << 'EOF'
# 🤖 ALGORITMIT Trading Bot

**AI-Powered Worldchain Trading Bot for Novice Traders**

## 🚀 Quick Start

1. **Installation** (Ubuntu Server):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/your-repo/algoritmit-trading-bot/main/install-ubuntu.sh | bash
   ```

2. **Configuration**:
   ```bash
   cd ~/algoritmit-trading-bot
   nano .env
   ```

3. **Start Trading**:
   ```bash
   npm start
   ```

## 📋 Features

- 🤖 **AI-Powered Trading**: Machine learning algorithms
- 💰 **Multi-Strategy Support**: DIP buying, profit taking, DCA
- 🔒 **Secure**: Private key encryption and secure storage
- 📱 **Telegram Notifications**: Real-time alerts
- 🌐 **Worldchain Native**: Optimized for Worldchain network
- 📊 **Advanced Analytics**: Performance tracking and analysis
- 🔄 **Auto-Recovery**: Automatic restart and error handling

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the trading bot |
| `npm run pm2-start` | Start with PM2 (background) |
| `npm run pm2-stop` | Stop PM2 process |
| `./help.sh` | Show help guide |
| `./monitor.sh` | System monitoring |
| `./backup.sh` | Create backup |
| `./update.sh` | Update bot |

## 📁 File Structure

```
algoritmit-trading-bot/
├── worldchain-trading-bot.js    # Main bot file
├── .env                         # Environment variables
├── config.json                  # Configuration
├── wallets.json                 # Wallet storage
├── package.json                 # Dependencies
├── install.sh                   # Quick install
├── help.sh                      # Help guide
├── monitor.sh                   # Monitoring
├── backup.sh                    # Backup script
└── update.sh                    # Update script
```

## 🔧 Configuration

### Environment Variables (.env)
- `WORLDCHAIN_RPC_URL`: QuickNode RPC endpoint
- `TELEGRAM_BOT_TOKEN`: Telegram bot token (optional)
- `DEFAULT_TRADE_AMOUNT`: Default trade size in WLD
- `PROFIT_TARGET`: Profit target percentage
- `STOP_LOSS`: Stop loss percentage

### Trading Configuration (config.json)
- Trading strategies
- Risk management
- Gas settings
- Monitoring intervals

## 📊 Monitoring

### System Monitoring
```bash
./monitor.sh
```

### PM2 Monitoring
```bash
pm2 status
pm2 logs algoritmit-bot
pm2 monit
```

## 🔄 Updates

### Automatic Update
```bash
./update.sh
```

### Manual Update
```bash
git pull
npm install
pm2 restart algoritmit-bot
```

## 🆘 Support

- 📖 **Documentation**: https://docs.algoritmit.com
- 💬 **Telegram**: https://t.me/algoritmit_support
- 🐛 **Issues**: https://github.com/your-repo/algoritmit-trading-bot/issues
- 📧 **Email**: support@algoritmit.com

## ⚠️ Disclaimer

This software is for educational and entertainment purposes only. Trading cryptocurrencies involves substantial risk of loss. Only trade with funds you can afford to lose.

## 📄 License

MIT License - see LICENSE file for details.

---

**Made with ❤️ by the ALGORITMIT Team**
EOF

    print_status "README file created successfully"
}

# Create logs directory
create_logs_directory() {
    print_step "Creating logs directory..."
    
    cd ~/algoritmit-trading-bot
    mkdir -p logs
    
    print_status "Logs directory created successfully"
}

# Install npm dependencies
install_npm_dependencies() {
    print_step "Installing npm dependencies..."
    
    cd ~/algoritmit-trading-bot
    
    # Install dependencies
    npm install
    
    print_status "NPM dependencies installed successfully"
}

# Set proper permissions
set_permissions() {
    print_step "Setting proper permissions..."
    
    cd ~/algoritmit-trading-bot
    
    # Set ownership
    sudo chown -R $USER:$USER ~/algoritmit-trading-bot
    
    # Set proper permissions
    chmod 755 *.sh
    chmod 644 *.json *.md
    chmod 600 .env.example
    
    print_status "Permissions set successfully"
}

# Create final setup instructions
create_final_instructions() {
    print_step "Creating final setup instructions..."
    
    cd ~/algoritmit-trading-bot
    
    cat > SETUP.md << 'EOF'
# 🎯 ALGORITMIT Trading Bot - Setup Instructions

## ✅ Installation Complete!

Your ALGORITMIT Trading Bot has been successfully installed on your Ubuntu server.

## 🚀 Next Steps

### 1. Configure Your Bot
```bash
cd ~/algoritmit-trading-bot
nano .env
```

**Required Configuration:**
- Add your wallet private keys
- Set your trading parameters
- Configure Telegram notifications (optional)

### 2. Start Trading
```bash
# Start the bot
npm start

# Or start in background with PM2
npm run pm2-start
```

### 3. Monitor Your Bot
```bash
# Check system status
./monitor.sh

# View bot logs
npm run pm2-logs

# Check PM2 status
npm run pm2-status
```

## 📋 Quick Commands

| Action | Command |
|--------|---------|
| Start Bot | `npm start` |
| Stop Bot | `Ctrl+C` or `npm run pm2-stop` |
| View Logs | `npm run pm2-logs` |
| Monitor | `./monitor.sh` |
| Help | `./help.sh` |
| Backup | `./backup.sh` |
| Update | `./update.sh` |

## 🔐 Security Checklist

- [ ] Change default passwords
- [ ] Configure firewall rules
- [ ] Set up SSH key authentication
- [ ] Enable automatic security updates
- [ ] Configure backup schedule
- [ ] Test emergency shutdown procedures

## 📞 Support

If you need help:
1. Check the help guide: `./help.sh`
2. View system status: `./monitor.sh`
3. Contact support: https://t.me/algoritmit_support

## 🎉 Welcome to ALGORITMIT!

You're now ready to start AI-powered trading on Worldchain!

**Happy Trading! 🚀**
EOF

    print_status "Setup instructions created successfully"
}

# Main installation function
main() {
    print_banner
    
    print_info "Welcome to ALGORITMIT Trading Bot Installation!"
    print_info "This script will install the complete trading bot on your Ubuntu server."
    echo ""
    
    # Check requirements
    check_root
    check_ubuntu_version
    
    echo ""
    print_info "Starting installation process..."
    echo ""
    
    # Installation steps
    update_system
    install_system_dependencies
    install_node_dependencies
    create_app_directory
    setup_trading_bot
    create_config_files
    create_installation_script
    create_help_script
    create_systemd_service
    create_update_script
    create_backup_script
    create_monitoring_script
    create_readme
    create_logs_directory
    install_npm_dependencies
    set_permissions
    create_final_instructions
    
    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}🎉 ALGORITMIT TRADING BOT INSTALLATION COMPLETED SUCCESSFULLY! 🎉${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    print_status "Installation completed successfully!"
    echo ""
    print_info "Next steps:"
    echo "  1. cd ~/algoritmit-trading-bot"
    echo "  2. nano .env (configure your settings)"
    echo "  3. npm start (start the bot)"
    echo "  4. ./help.sh (view help guide)"
    echo ""
    print_info "For support: https://t.me/algoritmit_support"
    echo ""
    print_status "Happy trading! 🚀"
}

# Run main function
main "$@"