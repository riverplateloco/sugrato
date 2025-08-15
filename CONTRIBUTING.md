# 🤝 Contributing to ALGORITMIT Trading Bot

Thank you for your interest in contributing to ALGORITMIT Trading Bot! We welcome contributions from the community and appreciate your help in making this project better.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

### Our Standards

- **Be respectful** and inclusive of all contributors
- **Be collaborative** and open to different viewpoints
- **Be constructive** in feedback and criticism
- **Be professional** in all interactions

## 🚀 How Can I Contribute?

### Types of Contributions

1. **🐛 Bug Reports**: Report bugs and issues
2. **💡 Feature Requests**: Suggest new features
3. **📝 Documentation**: Improve documentation
4. **🔧 Code Improvements**: Fix bugs, add features
5. **🧪 Testing**: Write tests, improve test coverage
6. **🌐 Localization**: Translate to other languages
7. **📊 Performance**: Optimize code performance

### Before You Start

- Check existing issues and pull requests
- Read the documentation thoroughly
- Test the current version of the bot
- Join our community discussions

## 🛠️ Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Git
- Ubuntu 18.04+ (for testing)

### Local Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/algoritmit-trading-bot.git
cd algoritmit-trading-bot

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Configure your settings
nano .env

# Start development mode
npm run dev
```

### Docker Development Setup

```bash
# Build development container
docker build -t algoritmit-dev .

# Run with volume mounting for development
docker run -it --rm \
  -v $(pwd):/app \
  -v /app/node_modules \
  algoritmit-dev npm run dev
```

## 🔄 Pull Request Process

### Before Submitting a PR

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly**
5. **Update documentation**
6. **Commit with clear messages**

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(trading): add DCA functionality
fix(rpc): resolve connection timeout issues
docs(readme): update installation instructions
```

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Commit messages are clear
- [ ] PR description is detailed

## 🐛 Reporting Bugs

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Test with latest version** from main branch
3. **Check documentation** for known issues
4. **Try to reproduce** the issue consistently

### Bug Report Template

```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: Ubuntu 20.04
- Node.js: 18.15.0
- Bot Version: 1.0.0
- Configuration: [relevant settings]

## Additional Information
- Screenshots/logs
- Error messages
- Related issues
```

## 💡 Suggesting Enhancements

### Enhancement Request Template

```markdown
## Enhancement Description
Clear description of the proposed feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should this work?

## Alternative Solutions
Other approaches considered

## Additional Context
- Use cases
- Examples
- Mockups
```

## 📝 Code Style Guidelines

### JavaScript/Node.js

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line length**: Max 80 characters
- **Naming**: camelCase for variables, PascalCase for classes

### Example

```javascript
const { ethers } = require('ethers');

class TradingBot {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
  }

  async start() {
    try {
      this.isRunning = true;
      console.log('Bot started successfully');
    } catch (error) {
      console.error('Failed to start bot:', error.message);
      throw error;
    }
  }
}

module.exports = TradingBot;
```

### Comments and Documentation

- **JSDoc** for functions and classes
- **Inline comments** for complex logic
- **README updates** for new features
- **API documentation** for public methods

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --grep "trading"

# Run with coverage
npm run test:coverage
```

### Writing Tests

- **Unit tests** for individual functions
- **Integration tests** for modules
- **End-to-end tests** for complete workflows
- **Mock external dependencies**

### Test Example

```javascript
const { expect } = require('chai');
const TradingBot = require('../src/trading-bot');

describe('TradingBot', () => {
  let bot;

  beforeEach(() => {
    bot = new TradingBot({
      rpcUrl: 'test-url',
      privateKey: 'test-key'
    });
  });

  describe('#start()', () => {
    it('should start the bot successfully', async () => {
      await bot.start();
      expect(bot.isRunning).to.be.true;
    });

    it('should throw error for invalid config', async () => {
      const invalidBot = new TradingBot({});
      await expect(invalidBot.start()).to.be.rejected;
    });
  });
});
```

## 📚 Documentation

### Documentation Standards

- **Clear and concise** writing
- **Code examples** for all features
- **Screenshots** for UI elements
- **Step-by-step** instructions
- **Troubleshooting** sections

### Documentation Types

1. **README.md**: Project overview and quick start
2. **API.md**: API documentation
3. **CONFIGURATION.md**: Configuration guide
4. **DEPLOYMENT.md**: Deployment instructions
5. **TROUBLESHOOTING.md**: Common issues and solutions

## 🏷️ Release Process

### Version Numbers

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Release notes written
- [ ] Docker images built
- [ ] GitHub release created

## 🎯 Areas for Contribution

### High Priority

- **Performance optimization**
- **Security improvements**
- **Bug fixes**
- **Documentation**
- **Test coverage**

### Medium Priority

- **New trading strategies**
- **UI/UX improvements**
- **Additional exchanges**
- **Mobile app**
- **Web dashboard**

### Low Priority

- **Localization**
- **Themes/skins**
- **Advanced analytics**
- **Social features**

## 📞 Getting Help

### Community Resources

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and ideas
- **Telegram**: For real-time support
- **Documentation**: For guides and tutorials

### Contact Information

- **Email**: contributors@algoritmit.com
- **Telegram**: https://t.me/algoritmit_contributors
- **Discord**: https://discord.gg/algoritmit

## 🙏 Recognition

### Contributors

We recognize all contributors in our:

- **README.md**: Top contributors
- **GitHub Contributors**: Automatic recognition
- **Release Notes**: Feature contributors
- **Documentation**: Code authors

### Contribution Levels

- **Bronze**: 1-5 contributions
- **Silver**: 6-20 contributions
- **Gold**: 21-50 contributions
- **Platinum**: 50+ contributions

---

**Thank you for contributing to ALGORITMIT Trading Bot! 🚀**

Your contributions help make cryptocurrency trading more accessible and secure for everyone.