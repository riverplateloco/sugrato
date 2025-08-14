#!/bin/bash

# =============================================================================
# INSTALLATION TEST SCRIPT
# =============================================================================
# Tests the novice trading bot installation
# Run this after installation to verify everything works
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
INSTALL_DIR="$HOME/worldchain-trading-bot"
TEST_RESULTS=()

# Test functions
test_file_exists() {
    local file="$1"
    local description="$2"
    
    if [ -f "$INSTALL_DIR/$file" ]; then
        echo -e "${GREEN}✅ $description${NC}"
        TEST_RESULTS+=("PASS: $description")
        return 0
    else
        echo -e "${RED}❌ $description${NC}"
        TEST_RESULTS+=("FAIL: $description")
        return 1
    fi
}

test_directory_exists() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$INSTALL_DIR/$dir" ]; then
        echo -e "${GREEN}✅ $description${NC}"
        TEST_RESULTS+=("PASS: $description")
        return 0
    else
        echo -e "${RED}❌ $description${NC}"
        TEST_RESULTS+=("FAIL: $description")
        return 1
    fi
}

test_command() {
    local command="$1"
    local description="$2"
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $description${NC}"
        TEST_RESULTS+=("PASS: $description")
        return 0
    else
        echo -e "${RED}❌ $description${NC}"
        TEST_RESULTS+=("FAIL: $description")
        return 1
    fi
}

test_node_modules() {
    local module="$1"
    local description="$2"
    
    if [ -d "$INSTALL_DIR/node_modules/$module" ]; then
        echo -e "${GREEN}✅ $description${NC}"
        TEST_RESULTS+=("PASS: $description")
        return 0
    else
        echo -e "${RED}❌ $description${NC}"
        TEST_RESULTS+=("FAIL: $description")
        return 1
    fi
}

# Main test function
run_tests() {
    echo -e "${CYAN}🧪 RUNNING INSTALLATION TESTS${NC}"
    echo "=================================="
    echo ""
    
    # Check if installation directory exists
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}❌ Installation directory not found: $INSTALL_DIR${NC}"
        echo -e "${YELLOW}Please run the installer first:${NC}"
        echo "curl -fsSL https://raw.githubusercontent.com/your-username/worldchain-trading-bot/main/novice-trading-bot-installer.sh | bash"
        exit 1
    fi
    
    echo -e "${BLUE}📁 Testing file structure...${NC}"
    
    # Test core files
    test_file_exists "package.json" "package.json exists"
    test_file_exists "worldchain-trading-bot-novice.js" "Main bot file exists"
    test_file_exists "config.json" "Configuration file exists"
    test_file_exists ".env.template" "Environment template exists"
    test_file_exists "README.md" "README exists"
    
    echo ""
    echo -e "${BLUE}📦 Testing dependencies...${NC}"
    
    # Test node_modules
    test_directory_exists "node_modules" "node_modules directory exists"
    test_node_modules "axios" "axios dependency installed"
    test_node_modules "chalk" "chalk dependency installed"
    test_node_modules "inquirer" "inquirer dependency installed"
    
    echo ""
    echo -e "${BLUE}🔧 Testing functionality...${NC}"
    
    # Test Node.js execution
    cd "$INSTALL_DIR"
    test_command "node --version" "Node.js is executable"
    test_command "npm --version" "npm is executable"
    
    # Test package.json validity
    test_command "npm run --silent" "package.json is valid"
    
    # Test bot file syntax
    test_command "node -c worldchain-trading-bot-novice.js" "Bot file has valid syntax"
    
    echo ""
    echo -e "${BLUE}📊 Test Results Summary${NC}"
    echo "=========================="
    
    local pass_count=0
    local fail_count=0
    
    for result in "${TEST_RESULTS[@]}"; do
        if [[ $result == PASS:* ]]; then
            ((pass_count++))
        else
            ((fail_count++))
        fi
    done
    
    echo -e "${GREEN}Passed: $pass_count${NC}"
    if [ $fail_count -gt 0 ]; then
        echo -e "${RED}Failed: $fail_count${NC}"
    fi
    
    echo ""
    
    if [ $fail_count -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! Installation is working correctly.${NC}"
        echo ""
        echo -e "${CYAN}Next steps:${NC}"
        echo "1. cd $INSTALL_DIR"
        echo "2. cp .env.template .env"
        echo "3. Edit .env with your settings"
        echo "4. npm start"
    else
        echo -e "${YELLOW}⚠️  Some tests failed. Please check the installation.${NC}"
        echo ""
        echo -e "${CYAN}Troubleshooting:${NC}"
        echo "1. Check the installation log"
        echo "2. Verify system requirements"
        echo "3. Try reinstalling"
        echo "4. Check GitHub issues for help"
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_tests
fi