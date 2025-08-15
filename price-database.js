const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PriceDatabase extends EventEmitter {
    constructor(sinclaveEngine, config) {
        super();
        this.sinclaveEngine = sinclaveEngine;
        this.config = config;
        
        // Core settings
        this.WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';
        this.updateInterval = 30000; // Update every 30 seconds
        this.maxHistoryAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        // File paths
        this.priceDbPath = path.join(process.cwd(), 'price-database.json');
        this.triggersPath = path.join(process.cwd(), 'price-triggers.json');
        
        // In-memory data structures
        this.priceData = new Map(); // tokenAddress -> price history
        this.activeTriggers = new Map(); // triggerId -> trigger config
        this.trackedTokens = new Set(); // Set of token addresses to track
        
        // Background monitoring
        this.isRunning = false;
        this.monitoringInterval = null;
        
        // Load existing data
        this.loadPriceDatabase();
        this.loadTriggers();
        
        console.log('📊 Price Database initialized');
        
        // Logging callback for smart logging
        this.loggingCallback = null;
    }
    
    // Set logging callback
    setLoggingCallback(callback) {
        this.loggingCallback = callback;
    }
    
    // Smart logging method
    log(message, type = 'info') {
        if (this.loggingCallback) {
            this.loggingCallback(message, type);
        } else {
            console.log(message);
        }
    }
    
    // Validate token address format
    isValidTokenAddress(tokenAddress) {
        if (!tokenAddress || typeof tokenAddress !== 'string') {
            return false;
        }
        
        // Check if it's a valid Ethereum address format
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        return addressRegex.test(tokenAddress);
    }
    
    // Add token to tracking list
    addToken(tokenAddress, tokenInfo = {}) {
        // Validate token address
        if (!this.isValidTokenAddress(tokenAddress)) {
            console.log(`❌ Invalid token address format: ${tokenAddress}`);
            return false;
        }
        
        if (tokenAddress.toLowerCase() === this.WLD_ADDRESS.toLowerCase()) {
            console.log(`⚠️  Cannot track WLD as it's the base currency`);
            return false; // Don't track WLD against itself
        }
        
        const key = tokenAddress.toLowerCase();
        
        // Check if already tracking
        if (this.trackedTokens.has(key)) {
            console.log(`⚠️  Token ${tokenInfo.symbol || tokenAddress} is already being tracked`);
            return false;
        }
        
        this.trackedTokens.add(key);
        
        // Initialize price history if not exists
        if (!this.priceData.has(key)) {
            this.priceData.set(key, {
                address: tokenAddress,
                symbol: tokenInfo.symbol || 'Unknown',
                name: tokenInfo.name || 'Unknown Token',
                prices: [], // Array of {timestamp, price, volume?} objects
                smaCache: {
                    '5min': { values: [], average: 0, lastUpdate: 0 },
                    '1hour': { values: [], average: 0, lastUpdate: 0 },
                    '6hour': { values: [], average: 0, lastUpdate: 0 },
                    '24hour': { values: [], average: 0, lastUpdate: 0 },
                    '1day': { values: [], average: 0, lastUpdate: 0 },
                    '7day': { values: [], average: 0, lastUpdate: 0 }
                },
                lastPriceUpdate: 0,
                currentPrice: 0,
                priceChange24h: 0,
                volatility: 0,
                priceSource: 'none',
                consecutiveFailures: 0,
                lastFailure: 0,
                addedAt: Date.now(),
                // Enhanced with discovery price tracking
                discoveryPrice: tokenInfo.discoveryPrice || tokenInfo.baselinePrice || 0,
                discoveryTimestamp: tokenInfo.discoveryTimestamp || tokenInfo.discoveryDate || Date.now(),
                baselineAveragePrice: tokenInfo.baselineAveragePrice || tokenInfo.baselinePrice || 0,
                discoveryPriceInfo: tokenInfo.discoveryPriceInfo || null,
                priceHistory: tokenInfo.priceHistory || []
            });
        }
        
        console.log(`✅ Added ${tokenInfo.symbol || tokenAddress} to price tracking`);
        return true;
    }
    
    // Remove token from tracking
    removeToken(tokenAddress) {
        this.trackedTokens.delete(tokenAddress.toLowerCase());
        console.log(`📉 Removed ${tokenAddress} from price tracking`);
    }
    
    // Start background price monitoring
    startBackgroundMonitoring() {
        if (this.isRunning) {
            console.log('📊 Price monitoring already running');
            return;
        }
        
        this.isRunning = true;
        console.log('🚀 Starting background price monitoring...');
        console.log(`   📊 Update interval: ${this.updateInterval / 1000}s`);
        console.log(`   🪙 Tracking ${this.trackedTokens.size} tokens`);
        console.log(`   🎯 Active triggers: ${this.activeTriggers.size}`);
        
        // Start monitoring loop
        this.monitoringInterval = setInterval(async () => {
            await this.updateAllPrices();
        }, this.updateInterval);
        
        // Initial price update
        setTimeout(() => this.updateAllPrices(), 2000);
        
        console.log('✅ Background price monitoring started');
    }
    
    // Stop background monitoring
    stopBackgroundMonitoring() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        // Save data before stopping
        this.savePriceDatabase();
        
        console.log('🛑 Background price monitoring stopped');
    }
    
    // Update prices for all tracked tokens
    async updateAllPrices() {
        if (this.trackedTokens.size === 0) {
            return;
        }
        
        const updatePromises = [];
        const tokensArray = Array.from(this.trackedTokens);
        
        this.log(`📊 Updating prices for ${tokensArray.length} tokens...`, 'price');
        
        // Update prices in parallel for better performance
        for (const tokenAddress of tokensArray) {
            updatePromises.push(this.updateTokenPrice(tokenAddress));
        }
        
        try {
            const results = await Promise.allSettled(updatePromises);
            
            // Count successful and failed updates more accurately
            let successful = 0;
            let failed = 0;
            let cached = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    if (result.value === true) {
                        successful++;
                    } else if (result.value === false) {
                        failed++;
                    } else {
                        cached++; // Used cached price
                    }
                } else {
                    failed++;
                    console.log(`❌ Price update failed for token ${index}: ${result.reason}`);
                }
            });
            
            // Display results with better formatting
            if (successful > 0 || cached > 0) {
                this.log(`📊 Price update complete: ✅ ${successful} fresh, 🔄 ${cached} cached, ❌ ${failed} failed`, 'price');
            } else {
                this.log(`⚠️  Price update: All ${failed} tokens failed - check network connection and token addresses`, 'error');
            }
            
            // Only proceed with dependent operations if we have some price data
            if (successful > 0 || cached > 0) {
                try {
                    // Update SMA calculations
                    await this.updateAllSMACalculations();
                    
                    // Check triggers
                    await this.checkAllTriggers();
                } catch (dependentError) {
                    console.log(`⚠️  Error in dependent operations: ${dependentError.message}`);
                }
            }
            
            // Save to disk every 5 minutes (but only if we have data)
            if (Date.now() % 300000 < this.updateInterval && (successful > 0 || cached > 0)) {
                try {
                    this.savePriceDatabase();
                } catch (saveError) {
                    console.log(`⚠️  Error saving price database: ${saveError.message}`);
                }
            }
            
            // Cleanup problematic tokens every hour
            if (Date.now() % 3600000 < this.updateInterval) {
                try {
                    this.cleanupProblematicTokens();
                } catch (cleanupError) {
                    console.log(`⚠️  Error during token cleanup: ${cleanupError.message}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Unexpected error in price update cycle:', error.message);
        }
    }
    
    // Update price for a specific token
    async updateTokenPrice(tokenAddress) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        if (!priceData) return;
        
        let currentPrice = null;
        let priceSource = 'unknown';
        const timestamp = Date.now();
        
        // Try multiple methods to get price, with fallbacks
        try {
            // Method 1: Try HoldStation SDK with error handling
            try {
                const quote = await this.sinclaveEngine.getHoldStationQuote(
                    tokenAddress,
                    this.WLD_ADDRESS,
                    1, // 1 token
                    '0x0000000000000000000000000000000000000001' // dummy receiver
                );
                
                if (quote && quote.expectedOutput && parseFloat(quote.expectedOutput) > 0) {
                    currentPrice = parseFloat(quote.expectedOutput);
                    priceSource = 'HoldStation';
                    console.log(`✅ Price updated via HoldStation: ${priceData.symbol} = ${currentPrice.toFixed(8)} WLD`);
                }
            } catch (holdStationError) {
                console.log(`⚠️  HoldStation failed for ${priceData.symbol}: ${holdStationError.message}`);
                
                // Method 2: Try direct trading engine as fallback
                try {
                    if (this.tradingEngine && typeof this.tradingEngine.getTokenPrice === 'function') {
                        const enginePrice = await this.tradingEngine.getTokenPrice(tokenAddress);
                        if (enginePrice && enginePrice.price > 0) {
                            currentPrice = enginePrice.price;
                            priceSource = 'TradingEngine';
                            console.log(`✅ Price updated via TradingEngine: ${priceData.symbol} = ${currentPrice.toFixed(8)} WLD`);
                        }
                    }
                } catch (engineError) {
                    console.log(`⚠️  TradingEngine failed for ${priceData.symbol}: ${engineError.message}`);
                }
                
                // Method 3: Use last known price with staleness warning
                if (!currentPrice && priceData.currentPrice > 0) {
                    const timeSinceLastUpdate = timestamp - priceData.lastPriceUpdate;
                    const hoursStale = timeSinceLastUpdate / (1000 * 60 * 60);
                    
                    if (hoursStale < 24) { // Only use if less than 24 hours old
                        currentPrice = priceData.currentPrice;
                        priceSource = `Cached (${hoursStale.toFixed(1)}h old)`;
                        console.log(`⚠️  Using cached price for ${priceData.symbol}: ${currentPrice.toFixed(8)} WLD (${hoursStale.toFixed(1)}h old)`);
                    }
                }
            }
            
            // If we got a valid price from any source, update the data
            if (currentPrice && currentPrice > 0) {
                // Add to price history
                priceData.prices.push({
                    timestamp,
                    price: currentPrice,
                    source: priceSource
                });
                
                // Update current price and metadata
                priceData.currentPrice = currentPrice;
                priceData.lastPriceUpdate = timestamp;
                priceData.priceSource = priceSource;
                priceData.consecutiveFailures = 0; // Reset failure count on success
                
                // Calculate 24h price change
                const price24hAgo = this.getPriceAtTime(tokenAddress, timestamp - 86400000); // 24 hours ago
                if (price24hAgo > 0) {
                    priceData.priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
                }
                
                // Clean old data
                this.cleanOldPriceData(tokenAddress);
                
                // Emit price update event
                this.emit('priceUpdate', {
                    tokenAddress,
                    symbol: priceData.symbol,
                    price: currentPrice,
                    timestamp,
                    change24h: priceData.priceChange24h,
                    source: priceSource
                });
                
                return true; // Success
                
            } else {
                // No valid price obtained from any source
                priceData.consecutiveFailures = (priceData.consecutiveFailures || 0) + 1;
                priceData.lastFailure = timestamp;
                
                console.log(`❌ Failed to get price for ${priceData.symbol} (${priceData.consecutiveFailures} consecutive failures)`);
                
                // If too many failures, consider removing from tracking
                if (priceData.consecutiveFailures >= 10) {
                    console.log(`⚠️  ${priceData.symbol} has failed ${priceData.consecutiveFailures} times - consider removing from tracking`);
                }
                
                return false; // Failure
            }
            
        } catch (error) {
            console.error(`❌ Unexpected error updating price for ${tokenAddress}:`, error.message);
            
            // Track failure
            priceData.consecutiveFailures = (priceData.consecutiveFailures || 0) + 1;
            priceData.lastFailure = timestamp;
            
            return false;
        }
    }
    
    // Clean old price data to manage memory
    cleanOldPriceData(tokenAddress) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        if (!priceData) return;
        
        const cutoffTime = Date.now() - this.maxHistoryAge;
        const originalLength = priceData.prices.length;
        
        priceData.prices = priceData.prices.filter(p => p.timestamp >= cutoffTime);
        
        if (priceData.prices.length < originalLength) {
            console.log(`🧹 Cleaned ${originalLength - priceData.prices.length} old price records for ${priceData.symbol}`);
        }
    }
    
    // Check for and handle problematic tokens
    cleanupProblematicTokens() {
        const tokensToRemove = [];
        const currentTime = Date.now();
        
        for (const [tokenAddress, priceData] of this.priceData.entries()) {
            // Remove tokens that have been failing for more than 24 hours
            if (priceData.consecutiveFailures >= 20) {
                const timeSinceLastSuccess = currentTime - (priceData.lastPriceUpdate || 0);
                const hoursSinceSuccess = timeSinceLastSuccess / (1000 * 60 * 60);
                
                if (hoursSinceSuccess > 24) {
                    console.log(`🗑️  Removing problematic token ${priceData.symbol} (${priceData.consecutiveFailures} failures over ${hoursSinceSuccess.toFixed(1)}h)`);
                    tokensToRemove.push(tokenAddress);
                }
            }
        }
        
        // Remove problematic tokens
        for (const tokenAddress of tokensToRemove) {
            this.removeToken(tokenAddress);
        }
        
        if (tokensToRemove.length > 0) {
            console.log(`🧹 Cleaned up ${tokensToRemove.length} problematic tokens`);
        }
    }
    
    // Get health status of price monitoring
    getHealthStatus() {
        const totalTokens = this.trackedTokens.size;
        let healthyTokens = 0;
        let unhealthyTokens = 0;
        let staleTokens = 0;
        
        const currentTime = Date.now();
        const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours
        
        for (const [tokenAddress, priceData] of this.priceData.entries()) {
            const timeSinceUpdate = currentTime - (priceData.lastPriceUpdate || 0);
            const failures = priceData.consecutiveFailures || 0;
            
            if (failures === 0 && timeSinceUpdate < staleThreshold) {
                healthyTokens++;
            } else if (failures > 5) {
                unhealthyTokens++;
            } else if (timeSinceUpdate > staleThreshold) {
                staleTokens++;
            }
        }
        
        return {
            totalTokens,
            healthyTokens,
            unhealthyTokens,
            staleTokens,
            healthPercentage: totalTokens > 0 ? (healthyTokens / totalTokens * 100) : 0
        };
    }
    
    // Update SMA calculations for all tokens
    async updateAllSMACalculations() {
        for (const [tokenAddress, priceData] of this.priceData) {
            this.calculateSMAs(tokenAddress, priceData);
        }
    }
    
    // Calculate SMAs for a token
    calculateSMAs(tokenAddress, priceData) {
        const now = Date.now();
        
        // SMA timeframes in milliseconds
        const smaTimeframes = {
            '5min': 5 * 60 * 1000,
            '1hour': 60 * 60 * 1000,
            '6hour': 6 * 60 * 60 * 1000,
            '24hour': 24 * 60 * 60 * 1000,
            '1day': 24 * 60 * 60 * 1000,
            '7day': 7 * 24 * 60 * 60 * 1000
        };
        
        for (const [period, timeframeMs] of Object.entries(smaTimeframes)) {
            const cutoffTime = now - timeframeMs;
            
            // Get prices within this timeframe
            const periodPrices = priceData.prices.filter(p => p.timestamp >= cutoffTime);
            
            if (periodPrices.length >= 3) { // Need at least 3 data points
                const prices = periodPrices.map(p => p.price);
                const sum = prices.reduce((a, b) => a + b, 0);
                const average = sum / prices.length;
                
                priceData.smaCache[period] = {
                    values: prices,
                    average: average,
                    dataPoints: prices.length,
                    timeframe: timeframeMs,
                    lastUpdate: now
                };
            }
        }
    }
    
    // Get current price for a token
    getCurrentPrice(tokenAddress) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        return priceData ? priceData.currentPrice : 0;
    }
    
    // Get price at specific time (or closest available)
    getPriceAtTime(tokenAddress, timestamp) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        if (!priceData || priceData.prices.length === 0) return 0;
        
        // Find closest price to the requested timestamp
        let closestPrice = priceData.prices[0];
        let minTimeDiff = Math.abs(priceData.prices[0].timestamp - timestamp);
        
        for (const price of priceData.prices) {
            const timeDiff = Math.abs(price.timestamp - timestamp);
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestPrice = price;
            }
        }
        
        return closestPrice.price;
    }
    
    // Get price change percentage over a time period
    getPriceChange(tokenAddress, timeframeMs) {
        const currentPrice = this.getCurrentPrice(tokenAddress);
        const pastPrice = this.getPriceAtTime(tokenAddress, Date.now() - timeframeMs);
        
        if (currentPrice === 0 || pastPrice === 0) return 0;
        
        return ((currentPrice - pastPrice) / pastPrice) * 100;
    }
    
    // Get SMA for a token and timeframe
    getSMA(tokenAddress, timeframe) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        if (!priceData || !priceData.smaCache[timeframe]) return 0;
        
        return priceData.smaCache[timeframe].average;
    }
    
    // Create a price trigger
    createTrigger(config) {
        const triggerId = `trigger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const trigger = {
            id: triggerId,
            name: config.name || `${config.action} ${config.tokenSymbol} trigger`,
            tokenAddress: config.tokenAddress.toLowerCase(),
            tokenSymbol: config.tokenSymbol,
            
            // Trigger conditions
            action: config.action, // 'buy' or 'sell'
            condition: config.condition, // 'price_drop', 'price_rise', 'below_sma', 'above_sma'
            threshold: config.threshold, // Percentage or absolute value
            timeframe: config.timeframe || 300000, // Time window for condition (5 minutes default)
            
            // Trade parameters
            amount: config.amount || 0.1, // WLD amount for buy, token amount for sell
            maxSlippage: config.maxSlippage || 2,
            
            // State
            isActive: true,
            createdAt: Date.now(),
            lastChecked: 0,
            triggerCount: 0,
            maxTriggers: config.maxTriggers || 1, // How many times this trigger can fire
            
            // Wallet
            walletAddress: config.walletAddress
        };
        
        this.activeTriggers.set(triggerId, trigger);
        this.saveTriggers();
        
        console.log(`🎯 Created trigger: ${trigger.name}`);
        console.log(`   📊 Condition: ${trigger.condition} ${trigger.threshold}% in ${this.formatTimeframe(trigger.timeframe)}`);
        console.log(`   💰 Action: ${trigger.action} ${trigger.amount} ${trigger.action === 'buy' ? 'WLD' : trigger.tokenSymbol}`);
        
        return trigger;
    }
    
    // Check all active triggers
    async checkAllTriggers() {
        if (this.activeTriggers.size === 0) return;
        
        for (const [triggerId, trigger] of this.activeTriggers) {
            if (trigger.isActive && trigger.triggerCount < trigger.maxTriggers) {
                await this.checkTrigger(trigger);
            }
        }
    }
    
    // Check a specific trigger
    async checkTrigger(trigger) {
        try {
            trigger.lastChecked = Date.now();
            
            const currentPrice = this.getCurrentPrice(trigger.tokenAddress);
            if (currentPrice === 0) return; // No price data available
            
            let conditionMet = false;
            let conditionDetails = '';
            
            switch (trigger.condition) {
                case 'price_drop':
                    const priceChange = this.getPriceChange(trigger.tokenAddress, trigger.timeframe);
                    conditionMet = priceChange <= -Math.abs(trigger.threshold);
                    conditionDetails = `Price dropped ${Math.abs(priceChange).toFixed(2)}% (need ${trigger.threshold}%)`;
                    break;
                    
                case 'price_rise':
                    const priceRise = this.getPriceChange(trigger.tokenAddress, trigger.timeframe);
                    conditionMet = priceRise >= trigger.threshold;
                    conditionDetails = `Price rose ${priceRise.toFixed(2)}% (need ${trigger.threshold}%)`;
                    break;
                    
                case 'below_sma':
                    const smaValue = this.getSMA(trigger.tokenAddress, trigger.timeframe);
                    if (smaValue > 0) {
                        const belowSMA = ((smaValue - currentPrice) / smaValue) * 100;
                        conditionMet = belowSMA >= trigger.threshold;
                        conditionDetails = `Price ${belowSMA.toFixed(2)}% below SMA (need ${trigger.threshold}%)`;
                    }
                    break;
                    
                case 'above_sma':
                    const smaValueAbove = this.getSMA(trigger.tokenAddress, trigger.timeframe);
                    if (smaValueAbove > 0) {
                        const aboveSMA = ((currentPrice - smaValueAbove) / smaValueAbove) * 100;
                        conditionMet = aboveSMA >= trigger.threshold;
                        conditionDetails = `Price ${aboveSMA.toFixed(2)}% above SMA (need ${trigger.threshold}%)`;
                    }
                    break;
            }
            
            if (conditionMet) {
                console.log(`🚨 TRIGGER ACTIVATED: ${trigger.name}`);
                console.log(`   📊 ${conditionDetails}`);
                console.log(`   💰 Executing ${trigger.action} order...`);
                
                await this.executeTrigger(trigger);
            }
            
        } catch (error) {
            console.error(`❌ Error checking trigger ${trigger.name}:`, error.message);
        }
    }
    
    // Execute a trigger
    async executeTrigger(trigger) {
        try {
            // Find wallet object (this would need to be passed from main bot)
            const wallet = this.findWalletByAddress(trigger.walletAddress);
            if (!wallet) {
                console.log(`❌ Wallet not found for trigger: ${trigger.walletAddress}`);
                return;
            }
            
            let result;
            
            if (trigger.action === 'buy') {
                // Execute buy order
                result = await this.sinclaveEngine.executeOptimizedSwap(
                    wallet,
                    this.WLD_ADDRESS,
                    trigger.tokenAddress,
                    trigger.amount,
                    trigger.maxSlippage
                );
            } else if (trigger.action === 'sell') {
                // Execute sell order
                result = await this.sinclaveEngine.executeOptimizedSwap(
                    wallet,
                    trigger.tokenAddress,
                    this.WLD_ADDRESS,
                    trigger.amount,
                    trigger.maxSlippage
                );
            }
            
            if (result && result.success) {
                trigger.triggerCount++;
                
                console.log(`✅ TRIGGER EXECUTED SUCCESSFULLY!`);
                console.log(`   💰 ${trigger.action === 'buy' ? 'Bought' : 'Sold'}: ${result.amountOut} ${trigger.action === 'buy' ? trigger.tokenSymbol : 'WLD'}`);
                console.log(`   🧾 TX Hash: ${result.txHash}`);
                console.log(`   🎯 Trigger count: ${trigger.triggerCount}/${trigger.maxTriggers}`);
                
                // Deactivate if max triggers reached
                if (trigger.triggerCount >= trigger.maxTriggers) {
                    trigger.isActive = false;
                    console.log(`🛑 Trigger deactivated (max executions reached)`);
                }
                
                // Emit trigger execution event
                this.emit('triggerExecuted', {
                    trigger,
                    result,
                    timestamp: Date.now()
                });
                
            } else {
                console.log(`❌ TRIGGER EXECUTION FAILED: ${result ? result.error : 'Unknown error'}`);
            }
            
            this.saveTriggers();
            
        } catch (error) {
            console.error(`❌ Error executing trigger:`, error.message);
        }
    }
    
    // Get price statistics for a token
    getPriceStats(tokenAddress) {
        const priceData = this.priceData.get(tokenAddress.toLowerCase());
        if (!priceData) return null;
        
        return {
            symbol: priceData.symbol,
            currentPrice: priceData.currentPrice,
            change24h: priceData.priceChange24h,
            change5min: this.getPriceChange(tokenAddress, 5 * 60 * 1000),
            change1hour: this.getPriceChange(tokenAddress, 60 * 60 * 1000),
            change6hour: this.getPriceChange(tokenAddress, 6 * 60 * 60 * 1000),
            sma5min: this.getSMA(tokenAddress, '5min'),
            sma1hour: this.getSMA(tokenAddress, '1hour'),
            sma6hour: this.getSMA(tokenAddress, '6hour'),
            sma24hour: this.getSMA(tokenAddress, '24hour'),
            lastUpdate: priceData.lastPriceUpdate,
            dataPoints: priceData.prices.length
        };
    }
    
    // Load price database from disk
    loadPriceDatabase() {
        try {
            if (fs.existsSync(this.priceDbPath)) {
                const data = JSON.parse(fs.readFileSync(this.priceDbPath, 'utf8'));
                
                // Restore price data
                if (data.priceData) {
                    for (const [tokenAddress, priceInfo] of Object.entries(data.priceData)) {
                        this.priceData.set(tokenAddress, priceInfo);
                        this.trackedTokens.add(tokenAddress);
                    }
                }
                
                console.log(`📊 Loaded price database: ${this.priceData.size} tokens, ${this.getTotalPricePoints()} price points`);
            }
        } catch (error) {
            console.error('❌ Error loading price database:', error.message);
        }
    }
    
    // Save price database to disk
    savePriceDatabase() {
        try {
            const data = {
                version: '1.0',
                timestamp: Date.now(),
                priceData: Object.fromEntries(this.priceData),
                trackedTokens: Array.from(this.trackedTokens)
            };
            
            fs.writeFileSync(this.priceDbPath, JSON.stringify(data, null, 2));
            console.log(`💾 Saved price database: ${this.priceData.size} tokens`);
        } catch (error) {
            console.error('❌ Error saving price database:', error.message);
        }
    }
    
    // Load triggers from disk
    loadTriggers() {
        try {
            if (fs.existsSync(this.triggersPath)) {
                const data = JSON.parse(fs.readFileSync(this.triggersPath, 'utf8'));
                
                if (data.triggers) {
                    for (const [triggerId, trigger] of Object.entries(data.triggers)) {
                        this.activeTriggers.set(triggerId, trigger);
                    }
                }
                
                console.log(`🎯 Loaded ${this.activeTriggers.size} price triggers`);
            }
        } catch (error) {
            console.error('❌ Error loading triggers:', error.message);
        }
    }
    
    // Save triggers to disk
    saveTriggers() {
        try {
            const data = {
                version: '1.0',
                timestamp: Date.now(),
                triggers: Object.fromEntries(this.activeTriggers)
            };
            
            fs.writeFileSync(this.triggersPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving triggers:', error.message);
        }
    }
    
    // Helper methods
    getTotalPricePoints() {
        let total = 0;
        for (const [, priceData] of this.priceData) {
            total += priceData.prices.length;
        }
        return total;
    }
    
    formatTimeframe(timeframeMs) {
        const minutes = timeframeMs / (60 * 1000);
        const hours = minutes / 60;
        const days = hours / 24;
        
        if (days >= 1) return `${days}d`;
        if (hours >= 1) return `${hours}h`;
        return `${minutes}min`;
    }
    
    findWalletByAddress(address) {
        // This method would need to be implemented to find wallet by address
        // It should be connected to the main bot's wallet system
        return null;
    }
    
    // Get baseline average price for a token (from discovery)
    getBaselineAveragePrice(tokenAddress) {
        const key = tokenAddress.toLowerCase();
        const priceData = this.priceData.get(key);
        
        if (priceData && priceData.baselineAveragePrice > 0) {
            return {
                price: priceData.baselineAveragePrice,
                discoveryPrice: priceData.discoveryPrice,
                discoveryTimestamp: priceData.discoveryTimestamp,
                discoveryPriceInfo: priceData.discoveryPriceInfo,
                source: 'discovery_baseline'
            };
        }
        
        return null;
    }
    
    // Get discovery price information for a token
    getDiscoveryPriceInfo(tokenAddress) {
        const key = tokenAddress.toLowerCase();
        const priceData = this.priceData.get(key);
        
        if (priceData && priceData.discoveryPrice > 0) {
            return {
                discoveryPrice: priceData.discoveryPrice,
                discoveryTimestamp: priceData.discoveryTimestamp,
                discoveryPriceInfo: priceData.discoveryPriceInfo,
                baselineAveragePrice: priceData.baselineAveragePrice,
                priceHistory: priceData.priceHistory || []
            };
        }
        
        return null;
    }
    
    // Calculate price performance since discovery
    getPricePerformanceSinceDiscovery(tokenAddress) {
        const key = tokenAddress.toLowerCase();
        const priceData = this.priceData.get(key);
        
        if (!priceData || !priceData.discoveryPrice || !priceData.currentPrice) {
            return null;
        }
        
        const discoveryPrice = priceData.discoveryPrice;
        const currentPrice = priceData.currentPrice;
        const priceChange = ((currentPrice - discoveryPrice) / discoveryPrice) * 100;
        const timeSinceDiscovery = Date.now() - priceData.discoveryTimestamp;
        
        return {
            discoveryPrice,
            currentPrice,
            priceChange,
            priceChangePercent: priceChange,
            timeSinceDiscovery,
            timeSinceDiscoveryFormatted: this.formatTimeframe(timeSinceDiscovery),
            performance: priceChange > 0 ? 'positive' : priceChange < 0 ? 'negative' : 'neutral'
        };
    }
    
    // Get status summary
    getStatus() {
        return {
            isRunning: this.isRunning,
            trackedTokens: this.trackedTokens.size,
            activeTriggers: Array.from(this.activeTriggers.values()).filter(t => t.isActive).length,
            totalTriggers: this.activeTriggers.size,
            totalPricePoints: this.getTotalPricePoints(),
            updateInterval: this.updateInterval,
            lastUpdate: Math.max(...Array.from(this.priceData.values()).map(p => p.lastPriceUpdate || 0)),
            tokensWithDiscoveryPrices: Array.from(this.priceData.values()).filter(p => p.discoveryPrice > 0).length
        };
    }
}

module.exports = PriceDatabase;