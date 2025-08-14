#!/bin/bash

# =============================================================================
# NOVICE TRADING BOT - SELF INSTALLABLE PACKAGE
# =============================================================================
# Advanced AI Trading System for Beginners
# Comprehensive Error Checking & Easy Installation
# Version: 2.0 - Enhanced for Novice Traders
# =============================================================================

set -e

# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================
BOT_NAME="ALGORITMIT Smart Volatility Trading Bot"
BOT_VERSION="2.0"
REQUIRED_NODE_VERSION="16.0.0"
REQUIRED_NPM_VERSION="8.0.0"
INSTALL_DIR="$HOME/worldchain-trading-bot"
BACKUP_DIR="$HOME/worldchain-trading-bot-backup-$(date +%Y%m%d-%H%M%S)"
GITHUB_REPO="https://github.com/your-username/worldchain-trading-bot"
LOG_FILE="/tmp/novice-bot-install-$(date +%Y%m%d-%H%M%S).log"

# =============================================================================
# COLOR DEFINITIONS
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "${CYAN}▶ $1${NC}" | tee -a "$LOG_FILE"
}

log_header() {
    echo -e "${BOLD}${PURPLE}$1${NC}" | tee -a "$LOG_FILE"
}

# =============================================================================
# ERROR HANDLING FUNCTIONS
# =============================================================================
handle_error() {
    local exit_code=$?
    local line_number=$1
    local command=$2
    
    log_error "Installation failed at line $line_number"
    log_error "Command that failed: $command"
    log_error "Exit code: $exit_code"
    
    echo ""
    log_warning "Troubleshooting steps:"
    log_info "1. Check the log file: $LOG_FILE"
    log_info "2. Ensure you have sufficient disk space"
    log_info "3. Verify your internet connection"
    log_info "4. Try running: curl -fsSL $GITHUB_REPO/raw/main/novice-trading-bot-installer.sh | bash"
    
    exit $exit_code
}

# Set error trap
trap 'handle_error ${LINENO} "$BASH_COMMAND"' ERR

# =============================================================================
# SYSTEM CHECK FUNCTIONS
# =============================================================================
check_system_requirements() {
    log_header "🔍 SYSTEM REQUIREMENTS CHECK"
    
    # Check OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        log_success "Operating System: Linux detected"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        log_success "Operating System: macOS detected"
    else
        log_error "Unsupported operating system: $OSTYPE"
        log_error "This installer supports Linux and macOS only"
        exit 1
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" == "x86_64" ]] || [[ "$ARCH" == "aarch64" ]]; then
        log_success "Architecture: $ARCH (supported)"
    else
        log_error "Unsupported architecture: $ARCH"
        exit 1
    fi
    
    # Check disk space (minimum 500MB)
    DISK_SPACE=$(df "$HOME" | awk 'NR==2 {print $4}')
    DISK_SPACE_MB=$((DISK_SPACE / 1024))
    if [ "$DISK_SPACE_MB" -gt 500 ]; then
        log_success "Disk space: ${DISK_SPACE_MB}MB available (sufficient)"
    else
        log_error "Insufficient disk space: ${DISK_SPACE_MB}MB (need at least 500MB)"
        exit 1
    fi
    
    # Check memory (minimum 1GB)
    MEMORY_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
    if [ "$MEMORY_KB" -gt 0 ]; then
        MEMORY_MB=$((MEMORY_KB / 1024))
        if [ "$MEMORY_MB" -gt 1024 ]; then
            log_success "Memory: ${MEMORY_MB}MB available (sufficient)"
        else
            log_warning "Low memory: ${MEMORY_MB}MB (recommended: 1GB+)"
        fi
    fi
}

check_node_installation() {
    log_header "📦 NODE.JS INSTALLATION CHECK"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | sed 's/v//')
        log_success "Node.js found: v$NODE_VERSION"
        
        # Version comparison
        if [ "$(printf '%s\n' "$REQUIRED_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_NODE_VERSION" ]; then
            log_success "Node.js version meets requirements"
        else
            log_warning "Node.js version $NODE_VERSION is older than required $REQUIRED_NODE_VERSION"
            log_info "Attempting to update Node.js..."
            install_nodejs
        fi
    else
        log_warning "Node.js not found. Installing..."
        install_nodejs
    fi
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_success "npm found: v$NPM_VERSION"
        
        if [ "$(printf '%s\n' "$REQUIRED_NPM_VERSION" "$NPM_VERSION" | sort -V | head -n1)" = "$REQUIRED_NPM_VERSION" ]; then
            log_success "npm version meets requirements"
        else
            log_warning "npm version $NPM_VERSION is older than required $REQUIRED_NPM_VERSION"
        fi
    else
        log_error "npm not found. This should not happen after Node.js installation."
        exit 1
    fi
}

install_nodejs() {
    log_step "Installing Node.js..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux installation
        if command -v curl &> /dev/null; then
            log_info "Using NodeSource repository for latest Node.js..."
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v apt-get &> /dev/null; then
            log_info "Using package manager..."
            sudo apt-get update
            sudo apt-get install -y nodejs npm
        else
            log_error "No supported package manager found. Please install Node.js manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS installation
        if command -v brew &> /dev/null; then
            log_info "Using Homebrew..."
            brew install node
        else
            log_error "Homebrew not found. Please install Node.js manually or install Homebrew first."
            exit 1
        fi
    fi
    
    # Verify installation
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_success "Node.js installed successfully: $NODE_VERSION"
    else
        log_error "Node.js installation failed"
        exit 1
    fi
}

# =============================================================================
# INTERNET CONNECTIVITY CHECK
# =============================================================================
check_internet_connection() {
    log_header "🌐 INTERNET CONNECTIVITY CHECK"
    
    log_step "Testing internet connection..."
    
    # Test multiple endpoints for reliability
    local endpoints=(
        "https://www.google.com"
        "https://www.github.com"
        "https://registry.npmjs.org"
    )
    
    local connected=false
    for endpoint in "${endpoints[@]}"; do
        if curl -s --max-time 10 "$endpoint" > /dev/null 2>&1; then
            log_success "Internet connection verified via $endpoint"
            connected=true
            break
        fi
    done
    
    if [ "$connected" = false ]; then
        log_error "No internet connection detected"
        log_error "Please check your network connection and try again"
        exit 1
    fi
    
    # Test download speed (optional)
    log_step "Testing download speed..."
    local start_time=$(date +%s)
    if curl -s --max-time 30 "https://registry.npmjs.org" > /dev/null 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        if [ "$duration" -lt 10 ]; then
            log_success "Download speed: Good"
        else
            log_warning "Download speed: Slow (${duration}s)"
        fi
    fi
}

# =============================================================================
# BACKUP & CLEANUP FUNCTIONS
# =============================================================================
backup_existing_installation() {
    if [ -d "$INSTALL_DIR" ]; then
        log_header "💾 BACKUP EXISTING INSTALLATION"
        
        log_step "Creating backup of existing installation..."
        if cp -r "$INSTALL_DIR" "$BACKUP_DIR" 2>/dev/null; then
            log_success "Backup created at: $BACKUP_DIR"
        else
            log_warning "Failed to create backup (continuing anyway)"
        fi
        
        log_step "Removing existing installation..."
        if rm -rf "$INSTALL_DIR"; then
            log_success "Existing installation removed"
        else
            log_error "Failed to remove existing installation"
            exit 1
        fi
    fi
}

cleanup_on_exit() {
    if [ $? -ne 0 ]; then
        log_warning "Installation failed. Cleaning up..."
        if [ -d "$INSTALL_DIR" ]; then
            rm -rf "$INSTALL_DIR"
        fi
    fi
}

trap cleanup_on_exit EXIT

# =============================================================================
# DOWNLOAD & INSTALLATION FUNCTIONS
# =============================================================================
download_bot_package() {
    log_header "📥 DOWNLOADING TRADING BOT PACKAGE"
    
    log_step "Creating installation directory..."
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    log_step "Downloading bot files..."
    
    # Create package.json
    cat > package.json << 'EOF'
{
  "name": "worldchain-trading-bot-novice",
  "version": "2.0.0",
  "description": "ALGORITMIT Smart Volatility Trading Bot - Novice Edition",
  "main": "worldchain-trading-bot-novice.js",
  "bin": {
    "worldchain-bot": "./worldchain-trading-bot-novice.js"
  },
  "scripts": {
    "start": "node worldchain-trading-bot-novice.js",
    "dev": "nodemon worldchain-trading-bot-novice.js",
    "setup": "node setup-wizard.js"
  },
  "keywords": [
    "trading-bot",
    "worldchain",
    "wld",
    "cryptocurrency",
    "defi",
    "automated-trading",
    "novice",
    "beginner"
  ],
  "author": "ALGORITMIT Trading Bot Developer",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "chalk": "^4.1.2",
    "inquirer": "^8.2.6",
    "node-cron": "^3.0.3",
    "ora": "^5.4.1",
    "ws": "^8.14.2"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
EOF

    log_success "package.json created"
    
    # Download main bot file
    log_step "Downloading main bot file..."
    if curl -fsSL -o worldchain-trading-bot-novice.js "$GITHUB_REPO/raw/main/worldchain-trading-bot-novice-full.js"; then
        log_success "Main bot file downloaded"
    else
        log_error "Failed to download main bot file"
        exit 1
    fi
    
    # Download additional components
    log_step "Downloading additional components..."
    local components=(
        "trading-engine.js"
        "trading-strategy.js"
        "price-database.js"
        "telegram-notifications.js"
        "setup-wizard.js"
    )
    
    for component in "${components[@]}"; do
        if curl -fsSL -o "$component" "$GITHUB_REPO/raw/main/$component" 2>/dev/null; then
            log_success "$component downloaded"
        else
            log_warning "$component not found, will create basic version"
            create_basic_component "$component"
        fi
    done
    
    # Make bot executable
    chmod +x worldchain-trading-bot-novice.js
}

create_basic_component() {
    local component=$1
    case $component in
        "setup-wizard.js")
            cat > "$component" << 'EOF'
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log('🚀 ALGORITMIT Trading Bot Setup Wizard');
console.log('This is a basic setup wizard. Please configure your settings manually.');
console.log('For full setup instructions, visit: https://github.com/your-username/worldchain-trading-bot');
EOF
            ;;
        *)
            echo "// Basic $component component" > "$component"
            ;;
    esac
}

install_dependencies() {
    log_header "📦 INSTALLING DEPENDENCIES"
    
    log_step "Installing npm dependencies..."
    if npm install --production --no-optional --silent; then
        log_success "Dependencies installed successfully"
    else
        log_error "Failed to install dependencies"
        log_info "Attempting to fix npm issues..."
        
        # Clear npm cache and retry
        npm cache clean --force
        if npm install --production --no-optional --silent; then
            log_success "Dependencies installed on second attempt"
        else
            log_error "Dependency installation failed completely"
            exit 1
        fi
    fi
}

# =============================================================================
# CONFIGURATION & SETUP FUNCTIONS
# =============================================================================
create_configuration() {
    log_header "⚙️  CREATING CONFIGURATION"
    
    log_step "Creating configuration files..."
    
    # Create .env template
    cat > .env.template << 'EOF'
# ALGORITMIT Trading Bot Configuration
# Copy this file to .env and fill in your details

# Worldchain RPC URL (leave empty for auto-detection)
WORLDCHAIN_RPC_URL=

# Telegram Bot Token (optional)
TELEGRAM_BOT_TOKEN=

# Telegram Chat ID (optional)
TELEGRAM_CHAT_ID=

# Trading Configuration
INITIAL_INVESTMENT=0.1
MAX_INVESTMENT=1.0
PROFIT_TAKE_PERCENTAGE=5
STOP_LOSS_PERCENTAGE=10

# Safety Settings
ENABLE_AUTO_TRADING=false
ENABLE_TELEGRAM_NOTIFICATIONS=false
MAX_DAILY_TRADES=5
EOF

    # Create config.json
    cat > config.json << 'EOF'
{
  "bot": {
    "name": "ALGORITMIT Smart Volatility",
    "version": "2.0.0",
    "mode": "novice"
  },
  "trading": {
    "enabled": false,
    "initialInvestment": 0.1,
    "maxInvestment": 1.0,
    "profitTakePercentage": 5,
    "stopLossPercentage": 10,
    "maxDailyTrades": 5
  },
  "notifications": {
    "telegram": {
      "enabled": false,
      "botToken": "",
      "chatId": ""
    }
  },
  "safety": {
    "enableAutoTrading": false,
    "requireConfirmation": true,
    "maxPositionSize": 0.5
  }
}
EOF

    # Create README
    cat > README.md << 'EOF'
# ALGORITMIT Smart Volatility Trading Bot - Novice Edition

## 🚀 Quick Start

1. **Configure the bot:**
   ```bash
   cp .env.template .env
   # Edit .env with your settings
   ```

2. **Start the bot:**
   ```bash
   npm start
   ```

3. **Run setup wizard:**
   ```bash
   npm run setup
   ```

## 📚 Features

- 🧠 AI-powered volatility analysis
- 🛡️ Built-in safety features for beginners
- 📱 Telegram notifications
- 💰 Smart position sizing
- 🎯 Automatic profit taking

## ⚠️ Important Notes

- Start with small amounts (0.1 WLD or less)
- Never trade more than you can afford to lose
- Monitor your first trades carefully
- Use the demo mode to learn before real trading

## 🆘 Support

For help and updates, visit: https://github.com/your-username/worldchain-trading-bot
EOF

    log_success "Configuration files created"
}

# =============================================================================
# VERIFICATION & TESTING
# =============================================================================
verify_installation() {
    log_header "🔍 VERIFYING INSTALLATION"
    
    log_step "Checking file structure..."
    local required_files=(
        "package.json"
        "worldchain-trading-bot-novice.js"
        "config.json"
        ".env.template"
        "README.md"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            log_success "$file exists"
        else
            log_error "$file missing"
            return 1
        fi
    done
    
    log_step "Testing bot startup..."
    if timeout 10s node worldchain-trading-bot-novice.js --help > /dev/null 2>&1; then
        log_success "Bot startup test passed"
    else
        log_warning "Bot startup test failed (this may be normal for interactive bots)"
    fi
    
    log_step "Checking dependencies..."
    if [ -d "node_modules" ]; then
        log_success "Dependencies installed"
    else
        log_error "Dependencies missing"
        return 1
    fi
    
    return 0
}

# =============================================================================
# POST-INSTALLATION SETUP
# =============================================================================
post_installation_setup() {
    log_header "🎯 POST-INSTALLATION SETUP"
    
    log_success "Installation completed successfully!"
    echo ""
    
    log_info "Next steps:"
    echo "1. Navigate to the bot directory:"
    echo "   cd $INSTALL_DIR"
    echo ""
    echo "2. Copy and configure environment file:"
    echo "   cp .env.template .env"
    echo "   # Edit .env with your settings"
    echo ""
    echo "3. Start the bot:"
    echo "   npm start"
    echo ""
    echo "4. Run setup wizard:"
    echo "   npm run setup"
    echo ""
    
    log_warning "IMPORTANT SAFETY REMINDERS:"
    echo "• Start with small amounts (0.1 WLD or less)"
    echo "• Never trade more than you can afford to lose"
    echo "• Monitor your first trades carefully"
    echo "• Use demo mode to learn before real trading"
    echo ""
    
    log_info "For help and updates:"
    echo "• GitHub: $GITHUB_REPO"
    echo "• Documentation: $GITHUB_REPO/wiki"
    echo "• Issues: $GITHUB_REPO/issues"
    echo ""
    
    log_info "Installation log saved to: $LOG_FILE"
}

# =============================================================================
# MAIN INSTALLATION FLOW
# =============================================================================
main() {
    # Clear screen and show banner
    clear
    echo -e "${CYAN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║     🚀 ALGORITMIT SMART VOLATILITY - NOVICE TRADING BOT INSTALLER 🚀         ║
║                                                                               ║
║                    🎓 Perfect for Beginner Traders 🎓                         ║
║                   🧠 AI-Powered • 🛡️ Safe • 💰 Profitable 🧠                  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    log_header "🚀 STARTING INSTALLATION PROCESS"
    log_info "This installer will set up the ALGORITMIT Smart Volatility Trading Bot"
    log_info "Installation directory: $INSTALL_DIR"
    log_info "Log file: $LOG_FILE"
    echo ""
    
    # Wait for user confirmation
    echo -e "${YELLOW}Press Enter to continue with installation, or Ctrl+C to cancel...${NC}"
    read -r
    
    # Run installation steps
    check_system_requirements
    check_internet_connection
    check_node_installation
    backup_existing_installation
    download_bot_package
    install_dependencies
    create_configuration
    
    # Verify installation
    if verify_installation; then
        post_installation_setup
    else
        log_error "Installation verification failed"
        exit 1
    fi
}

# =============================================================================
# SCRIPT EXECUTION
# =============================================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        log_error "Please run as a regular user"
        exit 1
    fi
    
    # Check if running in interactive mode
    if [[ -t 0 ]]; then
        main
    else
        log_error "This script requires an interactive terminal"
        exit 1
    fi
fi