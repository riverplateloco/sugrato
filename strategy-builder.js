const { ethers } = require('ethers');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class StrategyBuilder extends EventEmitter {
    constructor(tradingEngine, sinclaveEngine, config, telegramNotifications = null) {
        super();
        this.tradingEngine = tradingEngine;
        this.sinclaveEngine = sinclaveEngine;
        this.config = config;
        this.telegramNotifications = telegramNotifications;
        
        // Strategy storage
        this.customStrategies = new Map(); // strategyId -> strategy config
        this.activeStrategies = new Map(); // strategyId -> execution state
        this.strategyPositions = new Map(); // strategyId -> positions array
        this.priceHistory = new Map(); // tokenAddress -> price history for DIP detection
        this.monitoringIntervals = new Map(); // strategyId -> interval ID
        
        // File paths
        this.strategiesPath = path.join(process.cwd(), 'custom-strategies.json');
        this.strategyPositionsPath = path.join(process.cwd(), 'strategy-positions.json');
        
        // WLD token address
        this.WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';
        
        // Load existing strategies
        this.loadStrategies();
        
        console.log('🎯 Strategy Builder initialized');
    }
    
    // Create a new custom strategy
    createStrategy(config) {
        const strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const strategy = {
            id: strategyId,
            name: config.name || `Strategy for ${config.tokenSymbol}`,
            
            // Pair configuration
            baseToken: this.WLD_ADDRESS, // Always WLD
            targetToken: config.targetToken,
            tokenSymbol: config.tokenSymbol,
            
            // Trading parameters
            dipThreshold: config.dipThreshold || 15, // % drop to trigger buy
            profitTarget: config.profitTarget || 1, // % gain to trigger sell (legacy/simple mode)
            tradeAmount: config.tradeAmount || 0.1, // WLD amount per trade
            maxSlippage: config.maxSlippage || 1, // Max slippage %
            
            // Enhanced Profit Range Settings
            enableProfitRange: config.enableProfitRange || false,
            profitRangeMin: config.profitRangeMin || config.profitTarget || 1, // Min % to start selling
            profitRangeMax: config.profitRangeMax || (config.profitTarget || 1) * 2, // Max % to finish selling
            profitRangeSteps: config.profitRangeSteps || 3, // Number of partial sells in range
            profitRangeMode: config.profitRangeMode || 'linear', // 'linear', 'aggressive', 'conservative'
            
            // Enhanced DIP detection settings
            priceCheckInterval: config.priceCheckInterval || 3000, // 3 seconds for more frequent checks
            dipTimeframe: config.dipTimeframe || 300000, // Default: 5 minutes (300000ms)
            dipTimeframeLabel: this.getTimeframeLabel(config.dipTimeframe || 300000),
            
            // Historical price analysis settings
            enableHistoricalComparison: config.enableHistoricalComparison || false,
            historicalTimeframes: config.historicalTimeframes || {
                '5min': 300000,    // 5 minutes
                '1hour': 3600000,  // 1 hour  
                '6hour': 21600000, // 6 hours
                '24hour': 86400000, // 24 hours
                '7day': 604800000  // 7 days
            },
            
            // Strategy state
            isActive: false,
            autoSellEnabled: true, // Always enable auto-sell by default
            autoSellMode: 'aggressive', // 'conservative', 'normal', 'aggressive'
            createdAt: Date.now(),
            lastExecuted: null,
            
            // Smart volatility management
            volatilityProfile: 'normal', // 'low', 'normal', 'high', 'extreme'
            priceHistory: [], // Store recent price history for volatility analysis
            maxHistoryLength: 50, // Keep last 50 price points
            lastVolatilityCheck: 0,
            
            // DCA (Dollar Cost Averaging) Configuration
            dcaConfig: config.dcaConfig || {
                enabled: false,
                levels: 0,
                spreadRange: 0,
                positionSizeMultiplier: 0
            },
            
            // Enhanced DIP buying system with configurable levels
            dipBuyingLevels: config.dipBuyingLevels || [
                {
                    level: 1,
                    dipThreshold: config.dipThreshold || 15,        // First buy at 15% dip
                    buyAmount: config.tradeAmount || 0.1,          // Initial buy amount
                    description: 'Initial DIP buy',
                    executed: false
                },
                {
                    level: 2,
                    dipThreshold: (config.dipThreshold || 15) * 1.5,  // Second buy at 22.5% dip
                    buyAmount: (config.tradeAmount || 0.1) * 1.5,     // 1.5x initial amount
                    description: 'Enhanced DIP buy (1.5x)',
                    executed: false
                },
                {
                    level: 3,
                    dipThreshold: (config.dipThreshold || 15) * 2,    // Third buy at 30% dip
                    buyAmount: (config.tradeAmount || 0.1) * 2,       // 2x initial amount
                    description: 'Major DIP buy (2x)',
                    executed: false
                },
                {
                    level: 4,
                    dipThreshold: (config.dipThreshold || 15) * 3,    // Fourth buy at 45% dip
                    buyAmount: (config.tradeAmount || 0.1) * 3,       // 3x initial amount
                    description: 'Extreme DIP buy (3x)',
                    executed: false
                }
            ],
            
            // Smart DIP buying thresholds (adaptive based on volatility)
            smartDipThresholds: {
                small: config.dipThreshold || 15,      // 15% - normal dip
                medium: (config.dipThreshold || 15) * 2, // 30% - significant dip  
                large: (config.dipThreshold || 15) * 3,  // 45% - major dip
                extreme: (config.dipThreshold || 15) * 4 // 60% - extreme dip
            },
            
            // Smart SELL thresholds (adaptive based on volatility)
            smartSellThresholds: {
                quick: (config.profitRangeMin || config.profitTarget || 1) * 0.5,    // 50% of target - quick profit
                normal: (config.profitRangeMin || config.profitTarget || 1),         // 100% of target - normal profit
                good: (config.profitRangeMin || config.profitTarget || 1) * 2,       // 200% of target - good profit
                excellent: (config.profitRangeMin || config.profitTarget || 1) * 5,  // 500% of target - excellent profit
                extreme: (config.profitRangeMin || config.profitTarget || 1) * 10    // 1000% of target - extreme profit
            },
            
            // Position sizing based on dip severity
            smartPositionSizing: {
                small: config.tradeAmount * 0.5,        // 50% size for small dips
                medium: config.tradeAmount * 1.0,       // 100% size for medium dips
                large: config.tradeAmount * 1.5,        // 150% size for large dips
                extreme: config.tradeAmount * 2.0       // 200% size for extreme dips
            },
            
            // Volatility tracking
            priceAboveAverageCount: 0,
            priceAboveAverageThreshold: 5,
            lastPriceCheck: 0,
            
            // Performance tracking
            totalTrades: 0,
            successfulTrades: 0,
            totalProfit: 0,
            positions: []
        };
        
        // Initialize smart thresholds
        this.updateSmartThresholds(strategy);
        
        // Generate DCA levels if DCA is enabled
        if (strategy.dcaConfig.enabled && strategy.dcaConfig.levels > 0) {
            strategy.dcaLevels = [];
            
            for (let i = 1; i <= strategy.dcaConfig.levels; i++) {
                const dcaLevel = {
                    level: i,
                    dipThreshold: strategy.dipThreshold + (strategy.dcaConfig.spreadRange * i),
                    buyAmount: strategy.tradeAmount * (strategy.dcaConfig.positionSizeMultiplier === 0 ? 1 : strategy.dcaConfig.positionSizeMultiplier + 1),
                    description: `DCA Level ${i} (${strategy.dcaConfig.spreadRange}% spread)`,
                    executed: false,
                    isDCALevel: true
                };
                strategy.dcaLevels.push(dcaLevel);
            }
            
            console.log(`📈 DCA Levels Generated: ${strategy.dcaLevels.length} levels`);
            strategy.dcaLevels.forEach(level => {
                console.log(`   Level ${level.level}: ${level.dipThreshold.toFixed(1)}% dip → ${level.buyAmount.toFixed(3)} WLD`);
            });
        }
        
        this.customStrategies.set(strategyId, strategy);
        this.saveStrategies();
        
        console.log(`✅ Smart Strategy Created: ${strategy.name} (${strategyId})`);
        console.log(`   📊 Pair: WLD → ${config.tokenSymbol}`);
        console.log(`   🧠 Volatility Profile: ${strategy.volatilityProfile} (adaptive)`);
        console.log(`   📉 Base DIP Trigger: ${config.dipThreshold}% (smart scaling enabled)`);
        console.log(`   📈 Base Profit Target: ${strategy.profitRangeMin}% (smart scaling enabled)`);
        console.log(`   💰 Base Trade Amount: ${config.tradeAmount} WLD (smart sizing enabled)`);
        console.log(`   ⏱️ Price Checks: Every ${strategy.priceCheckInterval / 1000}s`);
        console.log(`   🚀 Auto-Sell: ENABLED (immediate on profit target)`);
        
        if (strategy.enableProfitRange) {
            console.log(`   📊 Profit Range Mode: ${strategy.profitRangeMin}% - ${strategy.profitRangeMax}% (${strategy.profitRangeSteps} steps, ${strategy.profitRangeMode})`);
        }
        
        console.log(`🧠 Smart Features Enabled:`);
        console.log(`   📊 Volatility Analysis: Real-time market adaptation`);
        console.log(`   📉 Smart DIP Buying: 4-tier system (Small→Medium→Large→Extreme)`);
        console.log(`   📈 Smart Profit Taking: 5-tier system (Quick→Normal→Good→Excellent→Extreme)`);
        console.log(`   💰 Dynamic Position Sizing: Adapts to DIP severity`);
        console.log(`   🛡️ Average Price Protection: Only buys below average`);
        console.log(`   🚀 Enhanced DIP Buying: ${strategy.dipBuyingLevels.length} configurable levels`);
        console.log(`   💰 DIP Buy Amounts: ${strategy.dipBuyingLevels.map(l => `${l.buyAmount} WLD`).join(' → ')}`);
        
        if (strategy.dcaConfig.enabled) {
            console.log(`   📈 DCA Enabled: ${strategy.dcaConfig.levels} levels, ${strategy.dcaConfig.spreadRange}% spread`);
            console.log(`   💰 DCA Position Multiplier: ${strategy.dcaConfig.positionSizeMultiplier === 0 ? 'Same amount' : `${strategy.dcaConfig.positionSizeMultiplier + 1}x amount`}`);
        }
        
        return strategy;
    }
    
    // Helper method to convert timeframe to readable label
    getTimeframeLabel(timeframeMs) {
        const minutes = timeframeMs / 60000;
        const hours = minutes / 60;
        const days = hours / 24;
        
        if (days >= 1) {
            return `${days}d`;
        } else if (hours >= 1) {
            return `${hours}h`;
        } else {
            return `${minutes}min`;
        }
    }
    
    // Start monitoring a strategy
    startStrategy(strategyId, walletObject) {
        const strategy = this.customStrategies.get(strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${strategyId} not found`);
        }
        
        if (strategy.isActive) {
            throw new Error(`Strategy ${strategy.name} is already active`);
        }
        
        strategy.isActive = true;
        strategy.walletObject = walletObject;
        
        // Initialize enhanced price history storage with SMA tracking
        if (!this.priceHistory.has(strategy.targetToken)) {
            this.priceHistory.set(strategy.targetToken, {
                prices: [], // Array of {timestamp, price} objects
                maxHistoryAge: 604800000, // Keep 7 days for full SMA analysis
                smaCache: {
                    '5min': { values: [], average: 0 },
                    '1hour': { values: [], average: 0 },
                    '6hour': { values: [], average: 0 },
                    '24hour': { values: [], average: 0 },
                    '1day': { values: [], average: 0 },
                    '7day': { values: [], average: 0 }
                },
                lastSMAUpdate: 0
            });
        }
        
        // Start monitoring interval
        const intervalId = setInterval(async () => {
            try {
                await this.monitorStrategy(strategyId);
            } catch (error) {
                console.error(`❌ Error monitoring strategy ${strategy.name}:`, error.message);
            }
        }, strategy.priceCheckInterval);
        
        this.monitoringIntervals.set(strategyId, intervalId);
        this.activeStrategies.set(strategyId, {
            startTime: Date.now(),
            lastCheck: null,
            checksPerformed: 0
        });
        
        console.log(`🚀 Started strategy: ${strategy.name}`);
        console.log(`   🔄 Monitoring every ${strategy.priceCheckInterval / 1000} seconds`);
        console.log(`   📊 Looking for ${strategy.dipThreshold}% DIP from highest price in ${strategy.dipTimeframeLabel}`);
        console.log(`   📈 Historical tracking: ${strategy.enableHistoricalComparison ? 'ENABLED' : 'DISABLED'}`);
        console.log(`   ⏳ WAITING for price drop - will NOT buy until DIP detected`);
        
        this.saveStrategies();
        return strategy;
    }
    
    // Stop monitoring a strategy
    stopStrategy(strategyId) {
        const strategy = this.customStrategies.get(strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${strategyId} not found`);
        }
        
        strategy.isActive = false;
        
        // Clear monitoring interval
        const intervalId = this.monitoringIntervals.get(strategyId);
        if (intervalId) {
            clearInterval(intervalId);
            this.monitoringIntervals.delete(strategyId);
        }
        
        this.activeStrategies.delete(strategyId);
        
        console.log(`🛑 Stopped strategy: ${strategy.name}`);
        this.saveStrategies();
        return strategy;
    }
    
    // Monitor a strategy for DIP opportunities and profit targets
    async monitorStrategy(strategyId) {
        const strategy = this.customStrategies.get(strategyId);
        const activeState = this.activeStrategies.get(strategyId);
        
        if (!strategy || !activeState) return;
        
        activeState.lastCheck = Date.now();
        activeState.checksPerformed++;
        
        try {
            // Get current price using HoldStation SDK
            const currentPrice = await this.getCurrentPrice(strategy.targetToken);
            
            // Store price in enhanced history
            const priceHistoryData = this.priceHistory.get(strategy.targetToken);
            const priceHistory = priceHistoryData.prices;
            
            priceHistory.push({
                timestamp: Date.now(),
                price: currentPrice
            });
            
            // Clean old history (keep maxHistoryAge for historical analysis)
            const cutoffTime = Date.now() - priceHistoryData.maxHistoryAge;
            while (priceHistory.length > 0 && priceHistory[0].timestamp < cutoffTime) {
                priceHistory.shift();
            }
            
            // Update SMA calculations (every 30 seconds to avoid excessive computation)
            if (Date.now() - priceHistoryData.lastSMAUpdate > 30000) {
                this.updateSMACalculations(strategy.targetToken, priceHistoryData);
                priceHistoryData.lastSMAUpdate = Date.now();
            }
            
            // Check for open positions first
            const openPositions = strategy.positions.filter(p => p.status === 'open');
            
            if (openPositions.length > 0) {
                // Monitor existing positions for profit targets
                for (const position of openPositions) {
                    await this.checkPositionForProfit(strategy, position);
                }
            } else {
                // Look for smart DIP buying opportunities with volatility analysis
                await this.checkForSmartDipOpportunity(strategy, priceHistory, currentPrice);
            }
            
            // Brief status update every 2 checks (~10 seconds)
            if (activeState.checksPerformed % 2 === 0) {
                const timeRunning = Math.floor((Date.now() - activeState.startTime) / 1000);
                
                if (openPositions.length === 0) {
                    // Show enhanced DIP waiting status
                    if (priceHistory.length >= 2) {
                        // Get prices for the specific DIP timeframe
                        const dipTimeframePrices = this.getPricesInTimeframe(priceHistory, strategy.dipTimeframe);
                        const highestPrice = Math.max(...dipTimeframePrices.map(p => p.price));
                        const currentDrop = ((highestPrice - currentPrice) / highestPrice) * 100;
                        const dipTriggerPrice = highestPrice * (1 - strategy.dipThreshold / 100);
                        
                        // Add SMA context and historical context if enabled
                        let smaContext = '';
                        let historicalContext = '';
                        
                        if (strategy.enableHistoricalComparison && priceHistory.length > 10) {
                            const historical = this.getHistoricalPriceAnalysis(priceHistory, currentPrice, strategy.historicalTimeframes);
                            historicalContext = ` | ${historical.summary}`;
                        }
                        
                        // Add SMA analysis
                        const priceHistoryData = this.priceHistory.get(strategy.targetToken);
                        if (priceHistoryData && priceHistoryData.smaCache) {
                            const smaAnalysis = this.getSMAPriceAnalysis(currentPrice, priceHistoryData.smaCache);
                            smaContext = ` | SMA: ${smaAnalysis}`;
                        }
                        
                        console.log(`⏳ ${strategy.name}: Waiting for DIP | Current: ${currentPrice.toFixed(8)} | Need: ≤${dipTriggerPrice.toFixed(8)} | Drop: ${currentDrop.toFixed(2)}%/${strategy.dipThreshold}% (${strategy.dipTimeframeLabel})${historicalContext}${smaContext} | Runtime: ${timeRunning}s`);
                    } else {
                        console.log(`📊 ${strategy.name}: Building price history (${priceHistory.length}/2) | Current: ${currentPrice.toFixed(8)} WLD | Runtime: ${timeRunning}s`);
                    }
                } else {
                    // Show brief position status
                    const totalWLD = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
                    const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
                    const averagePrice = totalWLD / totalTokens;
                    const targetPrice = averagePrice * (1 + strategy.profitTarget / 100);
                    const priceVsAverage = ((currentPrice - averagePrice) / averagePrice) * 100;
                    
                    const buyStatus = currentPrice <= averagePrice ? '✅ WILL BUY' : '⏳ HOLD ONLY';
                    const sellStatus = currentPrice >= targetPrice ? '🚀 SELL NOW' : `📈 Need +${(((targetPrice - currentPrice) / currentPrice) * 100).toFixed(1)}%`;
                    
                    console.log(`💼 ${strategy.name}: ${openPositions.length} pos | Avg: ${averagePrice.toFixed(8)} | Current: ${currentPrice.toFixed(8)} (${priceVsAverage >= 0 ? '+' : ''}${priceVsAverage.toFixed(1)}%) | ${buyStatus} | ${sellStatus}`);
                }
            }
            
            // Detailed status update (every 10 checks = ~50 seconds)
            if (activeState.checksPerformed % 10 === 0) {
                console.log(`\n📊 STRATEGY STATUS: ${strategy.name}`);
                console.log(`════════════════════════════════════════════════════════════`);
                console.log(`   🔄 Checks Performed: ${activeState.checksPerformed}`);
                console.log(`   💰 Open Positions: ${openPositions.length}`);
                console.log(`   📈 Current Price: ${currentPrice.toFixed(8)} WLD per ${strategy.targetTokenSymbol}`);
                
                if (openPositions.length === 0) {
                    // No positions yet - show DIP detection status
                    console.log(`   🎯 WAITING FOR INITIAL DIP BUY:`);
                    
                    if (priceHistory.length >= 2) {
                        const highestPrice = Math.max(...priceHistory.map(p => p.price));
                        const currentDrop = ((highestPrice - currentPrice) / highestPrice) * 100;
                        const remainingDrop = strategy.dipThreshold - currentDrop;
                        const dipTriggerPrice = highestPrice * (1 - strategy.dipThreshold / 100);
                        
                        console.log(`   📊 Highest Price (${strategy.dipTimeframe/1000}s): ${highestPrice.toFixed(8)} WLD`);
                        console.log(`   📉 DIP Trigger Price: ${dipTriggerPrice.toFixed(8)} WLD (${strategy.dipThreshold}% drop)`);
                        console.log(`   📈 Current Drop: ${currentDrop.toFixed(2)}%`);
                        
                        if (remainingDrop > 0) {
                            console.log(`   ⏳ Need ${remainingDrop.toFixed(2)}% MORE drop to trigger initial buy`);
                            console.log(`   🎯 Waiting for price ≤ ${dipTriggerPrice.toFixed(8)} WLD`);
                        } else {
                            console.log(`   ✅ DIP threshold REACHED! Checking buy conditions...`);
                        }
                    } else {
                        console.log(`   📊 Building price history... (${priceHistory.length}/2 data points needed)`);
                        console.log(`   ⏳ Monitoring for ${strategy.dipTimeframe/1000}s to detect price patterns`);
                    }
                } else {
                    // Show average price strategy status
                    const totalWLD = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
                    const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
                    const averagePrice = totalWLD / totalTokens;
                    const targetPrice = averagePrice * (1 + strategy.profitTarget / 100);
                    
                    console.log(`   💼 MANAGING ${openPositions.length} POSITIONS:`);
                    console.log(`   💰 Total Investment: ${totalWLD.toFixed(6)} WLD`);
                    console.log(`   📊 Average Price: ${averagePrice.toFixed(8)} WLD per ${strategy.targetTokenSymbol}`);
                    console.log(`   🎯 Profit Target: ${targetPrice.toFixed(8)} WLD per ${strategy.targetTokenSymbol}`);
                    
                    // Price comparison analysis
                    const priceVsAverage = ((currentPrice - averagePrice) / averagePrice) * 100;
                    const priceVsTarget = ((currentPrice - targetPrice) / targetPrice) * 100;
                    
                    console.log(`   📈 Price vs Average: ${priceVsAverage >= 0 ? '+' : ''}${priceVsAverage.toFixed(2)}%`);
                    
                    if (currentPrice <= averagePrice) {
                        console.log(`   ✅ WILL BUY on next ${strategy.dipThreshold}% DIP (price below average)`);
                        
                        // Show DIP trigger info for additional buys
                        if (priceHistory.length >= 2) {
                            const highestPrice = Math.max(...priceHistory.map(p => p.price));
                            const currentDrop = ((highestPrice - currentPrice) / highestPrice) * 100;
                            const dipTriggerPrice = highestPrice * (1 - strategy.dipThreshold / 100);
                            const remainingDrop = strategy.dipThreshold - currentDrop;
                            
                            if (remainingDrop > 0) {
                                console.log(`   📉 Next DIP buy at: ${dipTriggerPrice.toFixed(8)} WLD (need ${remainingDrop.toFixed(2)}% more drop)`);
                            } else {
                                console.log(`   🚨 DIP DETECTED! Ready to buy more and improve average`);
                            }
                        }
                    } else {
                        console.log(`   ⏳ HOLDING ONLY (price above average - no buying)`);
                        console.log(`   📊 Will buy again when price drops to: ${averagePrice.toFixed(8)} WLD`);
                    }
                    
                    if (currentPrice >= targetPrice) {
                        console.log(`   🚀 PROFIT TARGET REACHED! Will sell ALL positions`);
                        console.log(`   💹 Expected profit: ${priceVsTarget.toFixed(2)}% above target`);
                    } else {
                        const profitNeeded = ((targetPrice - currentPrice) / currentPrice) * 100;
                        console.log(`   📈 Need ${profitNeeded.toFixed(2)}% price increase for profit target`);
                        console.log(`   🎯 Sell trigger: ${targetPrice.toFixed(8)} WLD per ${strategy.targetTokenSymbol}`);
                    }
                }
                
                console.log(`════════════════════════════════════════════════════════════`);
            }
            
        } catch (error) {
            console.error(`❌ Error monitoring strategy ${strategy.name}:`, error.message);
        }
    }
    
    // Helper method to get prices within a specific timeframe
    getPricesInTimeframe(priceHistory, timeframeMs) {
        const cutoffTime = Date.now() - timeframeMs;
        return priceHistory.filter(p => p.timestamp >= cutoffTime);
    }
    
    // Helper method to format time ago
    formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return `${seconds}s ago`;
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
    
    // Get historical price analysis for multiple timeframes
    getHistoricalPriceAnalysis(priceHistory, currentPrice, timeframes) {
        const analysis = {
            periods: {},
            summary: '',
            recommendations: []
        };
        
        for (const [period, timeframeMs] of Object.entries(timeframes)) {
            const periodPrices = this.getPricesInTimeframe(priceHistory, timeframeMs);
            
            if (periodPrices.length > 0) {
                const prices = periodPrices.map(p => p.price);
                const highest = Math.max(...prices);
                const lowest = Math.min(...prices);
                const average = prices.reduce((a, b) => a + b, 0) / prices.length;
                
                const dropFromHigh = ((highest - currentPrice) / highest) * 100;
                const riseFromLow = ((currentPrice - lowest) / lowest) * 100;
                const vsAverage = ((currentPrice - average) / average) * 100;
                
                analysis.periods[period] = {
                    highest,
                    lowest,
                    average,
                    dropFromHigh,
                    riseFromLow,
                    vsAverage,
                    dataPoints: periodPrices.length
                };
                
                // Generate recommendations
                if (dropFromHigh > 10) {
                    analysis.recommendations.push(`Strong DIP vs ${period} high (-${dropFromHigh.toFixed(1)}%)`);
                }
                if (riseFromLow < 5) {
                    analysis.recommendations.push(`Near ${period} low (+${riseFromLow.toFixed(1)}%)`);
                }
            }
        }
        
        // Create summary
        const mainPeriods = ['5min', '1hour', '6hour'];
        const summaryParts = [];
        
        for (const period of mainPeriods) {
            if (analysis.periods[period]) {
                const data = analysis.periods[period];
                if (Math.abs(data.vsAverage) > 2) {
                    const direction = data.vsAverage > 0 ? '+' : '';
                    summaryParts.push(`${period}:${direction}${data.vsAverage.toFixed(1)}%`);
                }
            }
        }
        
        analysis.summary = summaryParts.length > 0 ? summaryParts.join(' ') : 'Near averages';
        
        return analysis;
    }
    
    // Update SMA calculations for all timeframes
    updateSMACalculations(tokenAddress, priceHistoryData) {
        const now = Date.now();
        const priceHistory = priceHistoryData.prices;
        
        // SMA timeframes in milliseconds
        const smaTimeframes = {
            '5min': 5 * 60 * 1000,      // 5 minutes
            '1hour': 60 * 60 * 1000,    // 1 hour
            '6hour': 6 * 60 * 60 * 1000, // 6 hours
            '24hour': 24 * 60 * 60 * 1000, // 24 hours
            '1day': 24 * 60 * 60 * 1000,   // 1 day (same as 24hour)
            '7day': 7 * 24 * 60 * 60 * 1000 // 7 days
        };
        
        // Calculate SMA for each timeframe
        for (const [period, timeframeMs] of Object.entries(smaTimeframes)) {
            const cutoffTime = now - timeframeMs;
            
            // Get prices within this timeframe
            const periodPrices = priceHistory.filter(p => p.timestamp >= cutoffTime);
            
            if (periodPrices.length > 0) {
                const prices = periodPrices.map(p => p.price);
                const sum = prices.reduce((a, b) => a + b, 0);
                const average = sum / prices.length;
                
                priceHistoryData.smaCache[period] = {
                    values: prices,
                    average: average,
                    dataPoints: prices.length,
                    timeframe: timeframeMs,
                    lastUpdate: now
                };
            }
        }
    }
    
    // Get SMA price analysis summary
    getSMAPriceAnalysis(currentPrice, smaCache) {
        const periods = ['5min', '1hour', '6hour'];
        const summaryParts = [];
        
        for (const period of periods) {
            const sma = smaCache[period];
            if (sma && sma.average > 0 && sma.dataPoints >= 3) {
                const vsAverage = ((currentPrice - sma.average) / sma.average) * 100;
                if (Math.abs(vsAverage) > 1) { // Only show significant differences
                    const direction = vsAverage > 0 ? '+' : '';
                    summaryParts.push(`${period}:${direction}${vsAverage.toFixed(1)}%`);
                }
            }
        }
        
        return summaryParts.length > 0 ? summaryParts.join(' ') : 'Near SMAs';
    }
    
    // Get detailed SMA analysis for a token
    getDetailedSMAAnalysis(tokenAddress, currentPrice) {
        const priceHistoryData = this.priceHistory.get(tokenAddress);
        if (!priceHistoryData || !priceHistoryData.smaCache) {
            return null;
        }
        
        const analysis = {
            currentPrice,
            smaComparisons: {},
            buySignals: [],
            sellSignals: [],
            overallSignal: 'NEUTRAL'
        };
        
        const smaCache = priceHistoryData.smaCache;
        let bullishCount = 0;
        let bearishCount = 0;
        
        // Analyze each SMA period
        for (const [period, sma] of Object.entries(smaCache)) {
            if (sma.average > 0 && sma.dataPoints >= 3) {
                const vsAverage = ((currentPrice - sma.average) / sma.average) * 100;
                const isBullish = currentPrice > sma.average;
                const isBearish = currentPrice < sma.average;
                
                analysis.smaComparisons[period] = {
                    smaValue: sma.average,
                    percentDifference: vsAverage,
                    isBullish,
                    isBearish,
                    dataPoints: sma.dataPoints,
                    signal: isBullish ? 'BUY' : isBearish ? 'SELL' : 'NEUTRAL'
                };
                
                if (isBullish) {
                    bullishCount++;
                    if (Math.abs(vsAverage) > 2) {
                        analysis.sellSignals.push(`Above ${period} SMA by ${vsAverage.toFixed(1)}%`);
                    }
                } else if (isBearish) {
                    bearishCount++;
                    if (Math.abs(vsAverage) > 2) {
                        analysis.buySignals.push(`Below ${period} SMA by ${Math.abs(vsAverage).toFixed(1)}%`);
                    }
                }
            }
        }
        
        // Determine overall signal
        const totalSignals = bullishCount + bearishCount;
        if (totalSignals > 0) {
            const bullishRatio = bullishCount / totalSignals;
            if (bullishRatio >= 0.7) {
                analysis.overallSignal = 'STRONG_SELL'; // Price above most SMAs
            } else if (bullishRatio >= 0.5) {
                analysis.overallSignal = 'WEAK_SELL';
            } else if (bullishRatio <= 0.3) {
                analysis.overallSignal = 'STRONG_BUY'; // Price below most SMAs
            } else {
                analysis.overallSignal = 'WEAK_BUY';
            }
        }
        
        return analysis;
    }
    
    // Check if current price is good for buying based on SMA
    isSMABuySignal(tokenAddress, currentPrice) {
        const analysis = this.getDetailedSMAAnalysis(tokenAddress, currentPrice);
        if (!analysis) return false;
        
        return analysis.overallSignal === 'STRONG_BUY' || analysis.overallSignal === 'WEAK_BUY';
    }
    
    // Check if current price is good for selling based on SMA
    isSMASellSignal(tokenAddress, currentPrice) {
        const analysis = this.getDetailedSMAAnalysis(tokenAddress, currentPrice);
        if (!analysis) return false;
        
        return analysis.overallSignal === 'STRONG_SELL' || analysis.overallSignal === 'WEAK_SELL';
    }
    
    // Get current price for a token (WLD per token)
    async getCurrentPrice(tokenAddress) {
        if (this.sinclaveEngine) {
            try {
                // Get price using reverse swap quote: 1 token → WLD
                const quote = await this.sinclaveEngine.getHoldStationQuote(
                    tokenAddress,
                    this.WLD_ADDRESS,
                    1, // 1 token
                    '0x0000000000000000000000000000000000000001' // dummy receiver
                );
                
                if (quote && quote.expectedOutput) {
                    return parseFloat(quote.expectedOutput);
                }
            } catch (error) {
                console.log(`⚠️ Enhanced price discovery failed: ${error.message}`);
            }
        }
        
        // Fallback to standard engine
        const priceData = await this.tradingEngine.getTokenPrice(tokenAddress);
        return priceData.price;
    }
    
    // Check for smart DIP buying opportunity with volatility-based analysis
    async checkForSmartDipOpportunity(strategy, priceHistory, currentPrice) {
        if (priceHistory.length < 2) {
            return; // Need at least 2 price points
        }
        
        // Calculate our current average price from existing positions
        const openPositions = strategy.positions.filter(p => p.status === 'open');
        let averagePrice = null;
        
        if (openPositions.length > 0) {
            const totalWLD = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
            const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
            averagePrice = totalWLD / totalTokens;
            
            // SMART AVERAGE PRICE PROTECTION: Only buy if it improves our average
            if (currentPrice >= averagePrice) {
                console.log(`   🚫 Smart Protection: Current price (${currentPrice.toFixed(8)}) >= Average (${averagePrice.toFixed(8)})`);
                console.log(`   📊 Will wait for price below average to improve position`);
                return;
            }
            
            console.log(`   📉 Smart Opportunity: Current price below average - can improve position!`);
        }
        
        // Get prices within the DIP detection timeframe
        const dipTimeframePrices = this.getPricesInTimeframe(priceHistory, strategy.dipTimeframe);
        
        if (dipTimeframePrices.length === 0) {
            return; // No prices in timeframe yet
        }
        
        // Find the highest price in the timeframe
        const highestPrice = Math.max(...dipTimeframePrices.map(p => p.price));
        const dipPercent = ((highestPrice - currentPrice) / highestPrice) * 100;
        
        console.log(`🧠 Smart DIP Analysis:`);
        console.log(`   📊 Highest in ${strategy.dipTimeframeLabel}: ${highestPrice.toFixed(8)} WLD`);
        console.log(`   📊 Current Price: ${currentPrice.toFixed(8)} WLD`);
        console.log(`   📊 DIP Detected: ${dipPercent.toFixed(2)}%`);
        console.log(`   📊 Volatility Profile: ${strategy.volatilityProfile}`);
        
        // Use smart DIP buying logic
        const position = await this.executeSmartDipBuy(strategy, currentPrice, dipPercent);
        
        if (position) {
            console.log(`✅ Smart DIP buy completed! Position: ${position.id}`);
            
            // Update average price if we had existing positions
            if (averagePrice && openPositions.length > 0) {
                const newTotalWLD = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0) + position.entryAmountWLD;
                const newTotalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0) + position.entryAmountToken;
                const newAveragePrice = newTotalWLD / newTotalTokens;
                const improvement = ((averagePrice - newAveragePrice) / averagePrice) * 100;
                
                console.log(`📊 Average Price Improvement:`);
                console.log(`   📈 Previous Average: ${averagePrice.toFixed(8)} WLD`);
                console.log(`   📉 New Average: ${newAveragePrice.toFixed(8)} WLD`);
                console.log(`   ✅ Improvement: ${improvement.toFixed(2)}%`);
            }
        }
    }
    
    // Legacy DIP opportunity check (kept for compatibility)
    async checkForDipOpportunity(strategy, priceHistory, currentPrice) {
        if (priceHistory.length < 2) {
            return; // Need at least 2 price points
        }
        
        // Calculate our current average price from existing positions
        const openPositions = strategy.positions.filter(p => p.status === 'open');
        let averagePrice = null;
        
        if (openPositions.length > 0) {
            // Calculate weighted average price from all open positions
            let totalWLD = 0;
            let totalTokens = 0;
            
            openPositions.forEach(pos => {
                totalWLD += pos.entryAmountWLD;
                totalTokens += pos.entryAmountToken;
            });
            
            // Average price = total WLD spent / total tokens received
            averagePrice = totalWLD / totalTokens;
            
            console.log(`📊 Current Average Price: ${averagePrice.toFixed(8)} WLD per token`);
            console.log(`📊 Current Market Price: ${currentPrice.toFixed(8)} WLD per token`);
            
            // CRITICAL: Only buy if current price is AT OR BELOW our average price
            if (currentPrice > averagePrice) {
                console.log(`⚠️  Price Protection: Current price (${currentPrice.toFixed(8)}) is HIGHER than average (${averagePrice.toFixed(8)})`);
                console.log(`   🚫 NOT buying - we only buy when price is same or lower than our average`);
                console.log(`   📊 We maintain our position and wait for:`);
                console.log(`      • Price to drop to/below average: ${averagePrice.toFixed(8)} WLD`);
                console.log(`      • OR profit target reached: ${(averagePrice * (1 + strategy.profitTarget / 100)).toFixed(8)} WLD`);
                return;
            }
            
            console.log(`✅ Price Protection: Current price (${currentPrice.toFixed(8)}) is LOWER than average (${averagePrice.toFixed(8)})`);
            console.log(`   📉 This will IMPROVE our average price - good DIP buy opportunity!`);
        }
        
        // Get prices within the specific DIP detection timeframe
        const dipTimeframePrices = this.getPricesInTimeframe(priceHistory, strategy.dipTimeframe);
        
        if (dipTimeframePrices.length === 0) {
            return; // No prices in timeframe yet
        }
        
        // Find the highest price in the DIP detection timeframe
        const highestPrice = Math.max(...dipTimeframePrices.map(p => p.price));
        const highestPriceTime = dipTimeframePrices.find(p => p.price === highestPrice).timestamp;
        
        // Calculate percentage drop from highest price in timeframe
        const priceDrop = ((highestPrice - currentPrice) / highestPrice) * 100;
        
        if (priceDrop >= strategy.dipThreshold) {
            console.log(`\n🚨 DIP DETECTED for ${strategy.name}!`);
            console.log(`════════════════════════════════════════════════════════════`);
            console.log(`   📊 DIP Analysis (${strategy.dipTimeframeLabel} timeframe):`);
            console.log(`      📈 Highest Price: ${highestPrice.toFixed(8)} WLD (${this.formatTimeAgo(highestPriceTime)})`);
            console.log(`      📉 Current Price: ${currentPrice.toFixed(8)} WLD`);
            console.log(`      📊 Price Drop: ${priceDrop.toFixed(2)}% (Target: ${strategy.dipThreshold}%)`);
            console.log(`      🎯 DIP Trigger: ${(highestPrice * (1 - strategy.dipThreshold / 100)).toFixed(8)} WLD`);
            console.log(`      📋 Data Points: ${dipTimeframePrices.length} prices in ${strategy.dipTimeframeLabel}`);
            
            if (averagePrice) {
                const avgComparison = ((currentPrice - averagePrice) / averagePrice) * 100;
                console.log(`   📊 Average Price Protection:`);
                console.log(`      📊 Current Average: ${averagePrice.toFixed(8)} WLD`);
                console.log(`      📈 Price vs Average: ${avgComparison >= 0 ? '+' : ''}${avgComparison.toFixed(2)}%`);
                console.log(`      ${currentPrice <= averagePrice ? '✅ APPROVED: Price below average - will improve average' : '❌ BLOCKED: Price above average - maintaining discipline'}`);
            } else {
                console.log(`   🎯 Initial Position: No average price yet - first buy opportunity`);
            }
            
            console.log(`   💰 Trade Details:`);
            console.log(`      💵 Amount: ${strategy.tradeAmount} WLD → ${strategy.targetTokenSymbol}`);
            console.log(`      📊 Max Slippage: ${strategy.maxSlippage}%`);
            console.log(`════════════════════════════════════════════════════════════`);
            console.log(`   🚀 Executing DIP buy...`);
            
            await this.executeDipBuy(strategy, currentPrice, averagePrice);
        }
    }
    
    // Execute a DIP buy trade with AVERAGE PRICE TRACKING and LIQUIDITY ANALYSIS
    async executeDipBuy(strategy, entryPrice, previousAveragePrice) {
        try {
            console.log(`🔄 Executing DIP buy: ${strategy.tradeAmount} WLD → ${strategy.targetTokenSymbol}`);
            
            // Analyze liquidity depth to optimize trade amount
            console.log(`🔍 Checking liquidity depth for optimal trade size...`);
            const liquidityAnalysis = await this.sinclaveEngine.analyzeLiquidityDepth(
                this.WLD_ADDRESS,
                strategy.targetToken,
                strategy.maxSlippage
            );
            
            // Determine optimal trade amount
            let optimalAmount = strategy.tradeAmount;
            if (liquidityAnalysis.maxAmount < strategy.tradeAmount) {
                console.log(`⚠️  Liquidity Warning: Requested ${strategy.tradeAmount} WLD exceeds optimal amount`);
                console.log(`   📊 Maximum for ${strategy.maxSlippage}% slippage: ${liquidityAnalysis.maxAmount} WLD`);
                console.log(`   🎯 Adjusting trade amount to: ${liquidityAnalysis.maxAmount} WLD`);
                optimalAmount = liquidityAnalysis.maxAmount;
            } else {
                console.log(`✅ Liquidity Check: ${strategy.tradeAmount} WLD is within optimal range`);
                console.log(`   📊 Pool can handle up to: ${liquidityAnalysis.maxAmount} WLD at ${strategy.maxSlippage}% slippage`);
            }
            
            // Execute the trade using Sinclave Enhanced Engine with optimal amount
            const result = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                this.WLD_ADDRESS,
                strategy.targetToken,
                optimalAmount,
                strategy.maxSlippage
            );
            
            if (result && result.success) {
                const tokensReceived = parseFloat(result.tokensReceived || result.amountOut || 0);
                const actualEntryPrice = optimalAmount / tokensReceived; // Actual price paid (using optimal amount)
                
                // Create position record
                const position = {
                    id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    strategyId: strategy.id,
                    tokenAddress: strategy.targetToken,
                    status: 'open',
                    
                    // Entry data
                    entryPrice: actualEntryPrice, // Use actual executed price
                    entryAmountWLD: optimalAmount, // Use actual amount traded
                    entryAmountToken: tokensReceived,
                    entryTimestamp: Date.now(),
                    entryTxHash: result.transactionHash || result.txHash,
                    
                    // Target data
                    profitTarget: strategy.profitTarget,
                    targetPrice: entryPrice * (1 + strategy.profitTarget / 100),
                    
                    // Performance tracking
                    unrealizedPnL: 0,
                    unrealizedPnLPercent: 0
                };
                
                strategy.positions.push(position);
                strategy.totalTrades++;
                strategy.lastExecuted = Date.now();
                
                // Calculate new average price after this purchase
                const allPositions = strategy.positions.filter(p => p.status === 'open');
                const totalWLD = allPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
                const totalTokens = allPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
                const newAveragePrice = totalWLD / totalTokens;
                const newTargetPrice = newAveragePrice * (1 + strategy.profitTarget / 100);
                
                console.log(`✅ DIP buy executed successfully!`);
                console.log(`   📊 Position: ${position.id}`);
                console.log(`   💰 Entry: ${optimalAmount} WLD → ${position.entryAmountToken.toFixed(6)} tokens`);
                console.log(`   📈 Entry Price: ${actualEntryPrice.toFixed(8)} WLD per token`);
                
                if (optimalAmount !== strategy.tradeAmount) {
                    console.log(`   ⚖️  Liquidity Adjusted: ${strategy.tradeAmount} WLD → ${optimalAmount} WLD`);
                    console.log(`   📊 Reason: Pool liquidity limited for ${strategy.maxSlippage}% slippage`);
                }
                
                if (previousAveragePrice) {
                    console.log(`   📊 Previous Avg: ${previousAveragePrice.toFixed(8)} WLD per token`);
                    console.log(`   📊 New Average: ${newAveragePrice.toFixed(8)} WLD per token`);
                    const improvement = ((previousAveragePrice - newAveragePrice) / previousAveragePrice) * 100;
                    console.log(`   📉 Average improved by: ${improvement.toFixed(2)}%`);
                } else {
                    console.log(`   📊 Initial Average: ${newAveragePrice.toFixed(8)} WLD per token`);
                }
                
                console.log(`   🎯 New Profit Target: ${newTargetPrice.toFixed(8)} WLD per token (${strategy.profitTarget}%)`);
                console.log(`   💼 Total Positions: ${allPositions.length}`);
                console.log(`   💰 Total Investment: ${totalWLD.toFixed(6)} WLD`);
                console.log(`   🧾 TX: ${position.entryTxHash}`);
                
                this.saveStrategies();
                this.emit('dipBuyExecuted', { strategy, position, result });
                
            } else {
                throw new Error('DIP buy execution failed');
            }
            
        } catch (error) {
            console.error(`❌ DIP buy failed for ${strategy.name}:`, error.message);
            this.emit('dipBuyFailed', { strategy, error: error.message });
        }
    }
    
    // Enhanced position monitoring with PROFIT RANGE support
    async checkPositionForProfit(strategy, position) {
        try {
            // Calculate current average price from all open positions
            const openPositions = strategy.positions.filter(p => p.status === 'open');
            let totalWLD = 0;
            let totalTokens = 0;
            
            openPositions.forEach(pos => {
                totalWLD += pos.entryAmountWLD;
                totalTokens += pos.entryAmountToken;
            });
            
            const averagePrice = totalWLD / totalTokens;
            
            // Get current market price using a small test amount
            const testQuote = await this.sinclaveEngine.getHoldStationQuote(
                strategy.targetToken,
                this.WLD_ADDRESS,
                1, // 1 token to get price per token
                strategy.walletObject.address
            );
            
            if (testQuote && testQuote.expectedOutput) {
                const currentPrice = parseFloat(testQuote.expectedOutput); // WLD per token
                
                // Calculate total portfolio value at current price
                const totalCurrentValue = totalTokens * currentPrice;
                const unrealizedPnL = totalCurrentValue - totalWLD;
                const unrealizedPnLPercent = (unrealizedPnL / totalWLD) * 100;
                
                // Update position data
                position.unrealizedPnL = unrealizedPnL;
                position.unrealizedPnLPercent = unrealizedPnLPercent;
                
                if (strategy.enableProfitRange) {
                    // ENHANCED PROFIT RANGE MODE
                    await this.handleProfitRange(strategy, openPositions, currentPrice, averagePrice, totalWLD, totalTokens, unrealizedPnLPercent);
                } else {
                    // LEGACY SIMPLE PROFIT TARGET MODE
                    const targetPrice = averagePrice * (1 + strategy.profitTarget / 100);
                    
                    console.log(`📊 Portfolio Status for ${strategy.name} (Simple Mode):`);
                    console.log(`   📊 Average Price: ${averagePrice.toFixed(8)} WLD per token`);
                    console.log(`   📊 Current Price: ${currentPrice.toFixed(8)} WLD per token`);
                    console.log(`   📊 Target Price: ${targetPrice.toFixed(8)} WLD per token`);
                    console.log(`   💰 Total Investment: ${totalWLD.toFixed(6)} WLD`);
                    console.log(`   📈 Current Value: ${totalCurrentValue.toFixed(6)} WLD`);
                    console.log(`   💹 Unrealized P&L: ${unrealizedPnL.toFixed(6)} WLD (${unrealizedPnLPercent.toFixed(2)}%)`);
                    
                    // Check if profit target is reached BASED ON AVERAGE PRICE
                    if (currentPrice >= targetPrice) {
                        console.log(`🎯 PROFIT TARGET REACHED for ${strategy.name}!`);
                        console.log(`   📊 Current price (${currentPrice.toFixed(8)}) >= Target (${targetPrice.toFixed(8)})`);
                        console.log(`   📊 Portfolio profit: ${unrealizedPnLPercent.toFixed(2)}% (Target: ${strategy.profitTarget}%)`);
                        console.log(`   💰 Expected return: ${totalCurrentValue.toFixed(6)} WLD`);
                        console.log(`   🚀 Executing profit sell for ALL positions...`);
                        
                        // Sell ALL positions since we calculate profit based on average
                        await this.executeProfitSellAll(strategy, openPositions, currentPrice);
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ Error checking position ${position.id}:`, error.message);
        }
    }
    
    // Handle sophisticated profit range selling
    async handleProfitRange(strategy, openPositions, currentPrice, averagePrice, totalWLD, totalTokens, unrealizedPnLPercent) {
        try {
            // Check if strategy is completed (auto-sell executed)
            if (strategy.status === 'completed' || strategy.autoSellExecuted) {
                console.log(`✅ Strategy "${strategy.name}" already completed with auto-sell. Stopping monitoring.`);
                return;
            }
            
            // Analyze volatility and update smart thresholds
            this.analyzeVolatility(strategy, currentPrice);
            
            // Initialize profit range tracking if not exists
            if (!strategy.profitRangeState) {
                strategy.profitRangeState = {
                    sellSteps: [],
                    totalSold: 0,
                    remainingPositions: [...openPositions]
                };
                
                // Calculate sell steps based on range and mode
                this.calculateProfitRangeSteps(strategy);
            }
            
            // Update trigger prices based on current average price
            const rangeState = strategy.profitRangeState;
            rangeState.sellSteps.forEach(step => {
                if (!step.executed) {
                    step.triggerPrice = averagePrice * (1 + step.profitPercent / 100);
                    step.expectedTokens = totalTokens * (step.sellPercentage / 100);
                }
            });
            const minPrice = averagePrice * (1 + strategy.profitRangeMin / 100);
            const maxPrice = averagePrice * (1 + strategy.profitRangeMax / 100);
            
            console.log(`📊 Portfolio Status for ${strategy.name} (Profit Range Mode):`);
            console.log(`   📊 Average Price: ${averagePrice.toFixed(8)} WLD per token`);
            console.log(`   📊 Current Price: ${currentPrice.toFixed(8)} WLD per token`);
            console.log(`   📊 Profit Range: ${strategy.profitRangeMin}% - ${strategy.profitRangeMax}%`);
            console.log(`   📊 Price Range: ${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)} WLD`);
            console.log(`   💰 Total Investment: ${totalWLD.toFixed(6)} WLD`);
            console.log(`   📈 Current Value: ${(totalTokens * currentPrice).toFixed(6)} WLD`);
            console.log(`   💹 Unrealized P&L: ${unrealizedPnLPercent.toFixed(2)}%`);
            
            // Smart profit selling based on volatility-adjusted thresholds
            const smartSell = this.analyzeSmartSellOpportunity(strategy, unrealizedPnLPercent);
            
            if (smartSell.shouldSell) {
                console.log(`🧠 Smart Sell Analysis: ${smartSell.level.toUpperCase()} PROFIT DETECTED!`);
                console.log(`   📊 Volatility Profile: ${strategy.volatilityProfile}`);
                console.log(`   📊 Current Profit: ${unrealizedPnLPercent.toFixed(2)}%`);
                console.log(`   📊 Sell Threshold: ${smartSell.threshold.toFixed(2)}%`);
                console.log(`   📊 Profit Level: ${smartSell.level.toUpperCase()}`);
                console.log(`   🚀 ${smartSell.urgency.toUpperCase()} PRIORITY AUTO-SELL!`);
                
                await this.executeImmediateProfitSell(strategy, openPositions, currentPrice, unrealizedPnLPercent, smartSell.reason);
            } else {
                // Show how close we are to profit range
                const progressToRange = ((currentPrice - averagePrice) / (minPrice - averagePrice)) * 100;
                console.log(`   ⏳ Progress to Range: ${Math.max(0, progressToRange).toFixed(1)}% (need ${((minPrice - currentPrice) / currentPrice * 100).toFixed(2)}% more)`);
            }
            
        } catch (error) {
            console.error(`❌ Error handling profit range:`, error.message);
        }
    }
    
    // Calculate profit range sell steps
    calculateProfitRangeSteps(strategy) {
        const rangeState = strategy.profitRangeState;
        const steps = strategy.profitRangeSteps;
        const minPercent = strategy.profitRangeMin;
        const maxPercent = strategy.profitRangeMax;
        
        rangeState.sellSteps = [];
        
        for (let i = 0; i < steps; i++) {
            let profitPercent, sellPercentage;
            
            // Calculate profit percentage for this step
            if (strategy.profitRangeMode === 'linear') {
                // Even distribution across range
                profitPercent = minPercent + (maxPercent - minPercent) * (i + 1) / steps;
                sellPercentage = 100 / steps; // Sell equal portions
            } else if (strategy.profitRangeMode === 'aggressive') {
                // More selling early in the range
                profitPercent = minPercent + (maxPercent - minPercent) * Math.pow((i + 1) / steps, 0.5);
                sellPercentage = i === 0 ? 50 : (100 - 50) / (steps - 1); // 50% first, then split remainder
            } else if (strategy.profitRangeMode === 'conservative') {
                // More selling later in the range
                profitPercent = minPercent + (maxPercent - minPercent) * Math.pow((i + 1) / steps, 2);
                sellPercentage = i === steps - 1 ? 50 : (100 - 50) / (steps - 1); // Split most, 50% at end
            }
            
            const step = {
                stepNumber: i + 1,
                profitPercent: profitPercent,
                triggerPrice: 0, // Will be calculated when positions exist
                sellPercentage: sellPercentage,
                expectedTokens: 0, // Will be calculated when positions exist
                executed: false,
                executedAt: null,
                actualTokensSold: 0,
                actualWLDReceived: 0
            };
            
            rangeState.sellSteps.push(step);
        }
        
        console.log(`📊 Profit Range Steps Calculated (${strategy.profitRangeMode} mode):`);
        rangeState.sellSteps.forEach(step => {
            console.log(`   Step ${step.stepNumber}: ${step.profitPercent.toFixed(1)}% profit → Sell ${step.sellPercentage.toFixed(1)}%`);
        });
    }
    
    // Execute a specific profit range step
    async executeProfitRangeStep(strategy, step, currentPrice) {
        try {
            const openPositions = strategy.positions.filter(p => p.status === 'open');
            const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
            const tokensToSell = totalTokens * (step.sellPercentage / 100);
            
            console.log(`🚀 Executing Profit Range Step ${step.stepNumber}...`);
            console.log(`   📊 Selling ${tokensToSell.toFixed(6)} tokens (${step.sellPercentage}% of ${totalTokens.toFixed(6)})`);
            
            // Execute the partial sell
            const sellResult = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                strategy.targetToken,
                this.WLD_ADDRESS,
                tokensToSell,
                strategy.maxSlippage
            );
            
            if (sellResult.success) {
                step.executed = true;
                step.executedAt = Date.now();
                step.actualTokensSold = tokensToSell;
                step.actualWLDReceived = parseFloat(sellResult.amountOut);
                
                // Update positions proportionally
                const sellRatio = tokensToSell / totalTokens;
                openPositions.forEach(pos => {
                    const soldFromPosition = pos.entryAmountToken * sellRatio;
                    pos.entryAmountToken -= soldFromPosition;
                    pos.entryAmountWLD -= pos.entryAmountWLD * sellRatio;
                    
                    if (pos.entryAmountToken < 0.000001) {
                        pos.status = 'closed';
                        pos.exitPrice = currentPrice;
                        pos.exitTimestamp = Date.now();
                    }
                });
                
                // Update strategy stats
                strategy.totalTrades++;
                strategy.successfulTrades++;
                strategy.totalProfit += step.actualWLDReceived - (tokensToSell / currentPrice); // Approximate profit
                
                console.log(`✅ Profit Range Step ${step.stepNumber} Executed Successfully!`);
                console.log(`   💰 Sold: ${step.actualTokensSold.toFixed(6)} tokens`);
                console.log(`   💰 Received: ${step.actualWLDReceived.toFixed(6)} WLD`);
                console.log(`   📊 Remaining Positions: ${openPositions.filter(p => p.status === 'open').length}`);
                
                // Send Telegram notification if available
                if (this.telegramNotifications) {
                    await this.telegramNotifications.notifyTradeExecution({
                        type: 'sell',
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        amount: step.actualTokensSold.toFixed(6),
                        outputAmount: step.actualWLDReceived.toFixed(6),
                        price: currentPrice.toFixed(8),
                        reason: `Profit Range Step ${step.stepNumber} (${step.profitPercent.toFixed(1)}% profit)`,
                        profit: (step.actualWLDReceived - (tokensToSell / currentPrice)).toFixed(4),
                        profitPercent: step.profitPercent.toFixed(1)
                    });
                }
                
                this.saveStrategies();
                
            } else {
                console.log(`❌ Profit Range Step ${step.stepNumber} Failed: ${sellResult.error}`);
            }
            
        } catch (error) {
            console.error(`❌ Error executing profit range step:`, error.message);
        }
    }
    
    // Analyze market volatility and update strategy profile
    analyzeVolatility(strategy, currentPrice) {
        try {
            // Add current price to history
            strategy.priceHistory.push({
                price: currentPrice,
                timestamp: Date.now()
            });
            
            // Keep only recent history
            if (strategy.priceHistory.length > strategy.maxHistoryLength) {
                strategy.priceHistory = strategy.priceHistory.slice(-strategy.maxHistoryLength);
            }
            
            // Need at least 10 data points for analysis
            if (strategy.priceHistory.length < 10) {
                return strategy.volatilityProfile;
            }
            
            // Calculate price changes and volatility
            const prices = strategy.priceHistory.map(h => h.price);
            const priceChanges = [];
            
            for (let i = 1; i < prices.length; i++) {
                const change = ((prices[i] - prices[i-1]) / prices[i-1]) * 100;
                priceChanges.push(Math.abs(change));
            }
            
            // Calculate average volatility
            const avgVolatility = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
            const maxChange = Math.max(...priceChanges);
            const recentChanges = priceChanges.slice(-5); // Last 5 changes
            const recentAvgVolatility = recentChanges.reduce((sum, change) => sum + change, 0) / recentChanges.length;
            
            // Determine volatility profile
            let newProfile = 'normal';
            
            if (maxChange > 100 || recentAvgVolatility > 50) {
                newProfile = 'extreme'; // Extreme volatility: >100% single move or >50% average
            } else if (maxChange > 50 || recentAvgVolatility > 25) {
                newProfile = 'high'; // High volatility: >50% single move or >25% average
            } else if (maxChange > 20 || recentAvgVolatility > 10) {
                newProfile = 'normal'; // Normal volatility: >20% single move or >10% average
            } else {
                newProfile = 'low'; // Low volatility: <20% moves and <10% average
            }
            
            // Update profile if changed
            if (newProfile !== strategy.volatilityProfile) {
                console.log(`📊 Volatility Profile Changed: ${strategy.volatilityProfile} → ${newProfile}`);
                console.log(`   📊 Max Change: ${maxChange.toFixed(2)}%`);
                console.log(`   📊 Avg Volatility: ${avgVolatility.toFixed(2)}%`);
                console.log(`   📊 Recent Avg: ${recentAvgVolatility.toFixed(2)}%`);
                
                strategy.volatilityProfile = newProfile;
                this.updateSmartThresholds(strategy);
            }
            
            return newProfile;
            
        } catch (error) {
            console.error(`❌ Error analyzing volatility:`, error.message);
            return strategy.volatilityProfile;
        }
    }
    
    // Update smart thresholds based on volatility profile
    updateSmartThresholds(strategy) {
        const profile = strategy.volatilityProfile;
        const baseDip = strategy.dipThreshold || 15;
        const baseProfit = strategy.profitRangeMin;
        
        console.log(`🧠 Updating Smart Thresholds for ${profile} volatility...`);
        
        switch (profile) {
            case 'low':
                // In low volatility, be more conservative
                strategy.smartDipThresholds = {
                    small: baseDip * 0.5,     // 7.5% - smaller dips
                    medium: baseDip * 1.0,    // 15% - normal dips
                    large: baseDip * 1.5,     // 22.5% - larger dips
                    extreme: baseDip * 2.0    // 30% - extreme for low vol
                };
                strategy.smartSellThresholds = {
                    quick: baseProfit * 0.3,  // 30% of target
                    normal: baseProfit * 0.7, // 70% of target
                    good: baseProfit * 1.5,   // 150% of target
                    excellent: baseProfit * 3, // 300% of target
                    extreme: baseProfit * 5   // 500% of target
                };
                break;
                
            case 'normal':
                // Standard thresholds
                strategy.smartDipThresholds = {
                    small: baseDip * 1.0,     // 15% - normal dip
                    medium: baseDip * 2.0,    // 30% - significant dip
                    large: baseDip * 3.0,     // 45% - major dip
                    extreme: baseDip * 4.0    // 60% - extreme dip
                };
                strategy.smartSellThresholds = {
                    quick: baseProfit * 0.5,  // 50% of target
                    normal: baseProfit * 1.0, // 100% of target
                    good: baseProfit * 2.0,   // 200% of target
                    excellent: baseProfit * 5, // 500% of target
                    extreme: baseProfit * 10  // 1000% of target
                };
                break;
                
            case 'high':
                // In high volatility, be more aggressive
                strategy.smartDipThresholds = {
                    small: baseDip * 1.5,     // 22.5% - bigger small dips
                    medium: baseDip * 3.0,    // 45% - bigger medium dips
                    large: baseDip * 4.5,     // 67.5% - major dips
                    extreme: baseDip * 6.0    // 90% - extreme dips
                };
                strategy.smartSellThresholds = {
                    quick: baseProfit * 0.7,  // 70% of target
                    normal: baseProfit * 1.5, // 150% of target
                    good: baseProfit * 3.0,   // 300% of target
                    excellent: baseProfit * 7, // 700% of target
                    extreme: baseProfit * 15  // 1500% of target
                };
                break;
                
            case 'extreme':
                // In extreme volatility, maximize opportunities
                strategy.smartDipThresholds = {
                    small: baseDip * 2.0,     // 30% - bigger small dips
                    medium: baseDip * 4.0,    // 60% - significant dips
                    large: baseDip * 6.0,     // 90% - major dips
                    extreme: baseDip * 8.0    // 120% - extreme dips (can go below zero)
                };
                strategy.smartSellThresholds = {
                    quick: baseProfit * 1.0,  // 100% of target
                    normal: baseProfit * 2.0, // 200% of target
                    good: baseProfit * 5.0,   // 500% of target
                    excellent: baseProfit * 10, // 1000% of target
                    extreme: baseProfit * 25  // 2500% of target
                };
                break;
        }
        
        console.log(`   📉 DIP Thresholds: Small: ${strategy.smartDipThresholds.small}%, Medium: ${strategy.smartDipThresholds.medium}%, Large: ${strategy.smartDipThresholds.large}%, Extreme: ${strategy.smartDipThresholds.extreme}%`);
        console.log(`   📈 SELL Thresholds: Quick: ${strategy.smartSellThresholds.quick}%, Normal: ${strategy.smartSellThresholds.normal}%, Good: ${strategy.smartSellThresholds.good}%, Excellent: ${strategy.smartSellThresholds.excellent}%, Extreme: ${strategy.smartSellThresholds.extreme}%`);
    }
    
    // Analyze smart sell opportunity based on volatility-adjusted thresholds
    analyzeSmartSellOpportunity(strategy, profitPercent) {
        try {
            const thresholds = strategy.smartSellThresholds;
            
            // Determine sell level and urgency
            if (profitPercent >= thresholds.extreme) {
                return {
                    shouldSell: true,
                    level: 'extreme',
                    threshold: thresholds.extreme,
                    urgency: 'emergency',
                    reason: 'extreme_profit_jump'
                };
            } else if (profitPercent >= thresholds.excellent) {
                return {
                    shouldSell: true,
                    level: 'excellent',
                    threshold: thresholds.excellent,
                    urgency: 'immediate',
                    reason: 'excellent_profit'
                };
            } else if (profitPercent >= thresholds.good) {
                return {
                    shouldSell: true,
                    level: 'good',
                    threshold: thresholds.good,
                    urgency: 'high',
                    reason: 'good_profit'
                };
            } else if (profitPercent >= thresholds.normal) {
                return {
                    shouldSell: true,
                    level: 'normal',
                    threshold: thresholds.normal,
                    urgency: 'medium',
                    reason: 'profit_target_reached'
                };
            } else if (profitPercent >= thresholds.quick) {
                return {
                    shouldSell: true,
                    level: 'quick',
                    threshold: thresholds.quick,
                    urgency: 'low',
                    reason: 'quick_profit'
                };
            } else {
                return {
                    shouldSell: false,
                    level: 'none',
                    threshold: thresholds.quick,
                    urgency: 'none',
                    reason: 'profit_insufficient'
                };
            }
            
        } catch (error) {
            console.error(`❌ Error analyzing smart sell opportunity:`, error.message);
            return {
                shouldSell: false,
                level: 'error',
                threshold: 0,
                urgency: 'none',
                reason: 'analysis_error'
            };
        }
    }
    
    // Smart DIP detection and buying logic
    async executeSmartDipBuy(strategy, currentPrice, dipPercent) {
        try {
            console.log(`🧠 Smart DIP Analysis for ${strategy.name}:`);
            console.log(`   📊 Current DIP: ${dipPercent.toFixed(2)}%`);
            console.log(`   📊 Volatility Profile: ${strategy.volatilityProfile}`);
            
            let dipLevel = 'none';
            let buyAmount = 0;
            let urgency = 'normal';
            
            // Determine DIP level and appropriate response
            if (dipPercent >= strategy.smartDipThresholds.extreme) {
                dipLevel = 'extreme';
                buyAmount = strategy.smartPositionSizing.extreme;
                urgency = 'immediate';
                console.log(`🚨🚨 EXTREME DIP DETECTED! 🚨🚨`);
            } else if (dipPercent >= strategy.smartDipThresholds.large) {
                dipLevel = 'large';
                buyAmount = strategy.smartPositionSizing.large;
                urgency = 'high';
                console.log(`🚨 LARGE DIP DETECTED! 🚨`);
            } else if (dipPercent >= strategy.smartDipThresholds.medium) {
                dipLevel = 'medium';
                buyAmount = strategy.smartPositionSizing.medium;
                urgency = 'medium';
                console.log(`⚡ MEDIUM DIP DETECTED! ⚡`);
            } else if (dipPercent >= strategy.smartDipThresholds.small) {
                dipLevel = 'small';
                buyAmount = strategy.smartPositionSizing.small;
                urgency = 'low';
                console.log(`📉 Small DIP detected`);
            } else {
                console.log(`   📊 DIP not significant enough for action (${dipPercent.toFixed(2)}% < ${strategy.smartDipThresholds.small}%)`);
                return null;
            }
            
            console.log(`   📊 DIP Level: ${dipLevel.toUpperCase()}`);
            console.log(`   📊 Buy Amount: ${buyAmount.toFixed(6)} WLD`);
            console.log(`   📊 Urgency: ${urgency.toUpperCase()}`);
            console.log(`   🚀 Executing smart DIP buy...`);
            
            // Execute the buy
            const result = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                this.WLD_ADDRESS,
                strategy.targetToken,
                buyAmount,
                strategy.maxSlippage
            );
            
            if (result.success) {
                const tokensReceived = parseFloat(result.amountOut);
                
                // Create position record
                const position = {
                    id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    entryPrice: currentPrice,
                    entryAmountWLD: buyAmount,
                    entryAmountToken: tokensReceived,
                    entryTimestamp: Date.now(),
                    dipLevel: dipLevel,
                    dipPercent: dipPercent,
                    volatilityProfile: strategy.volatilityProfile,
                    status: 'open'
                };
                
                strategy.positions.push(position);
                strategy.totalTrades++;
                strategy.lastTradeTimestamp = Date.now();
                
                console.log(`✅ Smart DIP Buy Executed Successfully!`);
                console.log(`   💰 Spent: ${buyAmount.toFixed(6)} WLD`);
                console.log(`   📈 Received: ${tokensReceived.toFixed(6)} tokens`);
                console.log(`   📊 Entry Price: ${currentPrice.toFixed(8)} WLD per token`);
                console.log(`   📊 Position ID: ${position.id}`);
                
                // Send Telegram notification
                if (this.telegramNotifications) {
                    await this.telegramNotifications.notifyTradeExecution({
                        type: 'buy',
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        amount: buyAmount.toFixed(6),
                        outputAmount: tokensReceived.toFixed(6),
                        price: currentPrice.toFixed(8),
                        reason: `Smart ${dipLevel.toUpperCase()} DIP Buy (${dipPercent.toFixed(1)}% dip, ${strategy.volatilityProfile} volatility)`,
                        dipLevel: dipLevel,
                        volatility: strategy.volatilityProfile
                    });
                }
                
                this.saveStrategies();
                return position;
                
            } else {
                console.log(`❌ Smart DIP Buy Failed: ${result.error}`);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error in smart DIP buy:`, error.message);
            return null;
        }
    }
    
    // Execute immediate profit sell when profit target is reached
    async executeImmediateProfitSell(strategy, openPositions, currentPrice, profitPercent, reason = 'profit_target_reached') {
        try {
            // Get reason-specific messaging
            const reasonMessages = {
                'profit_target_reached': {
                    title: '🎯 STANDARD AUTO-SELL',
                    description: 'Profit target reached'
                },
                'excess_profit': {
                    title: '⚡ EXCESS PROFIT AUTO-SELL',
                    description: 'Profit significantly exceeded target (3x)'
                },
                'high_profit_exceeded': {
                    title: '🚨 HIGH PROFIT AUTO-SELL',
                    description: 'Very high profit detected (5x target)'
                },
                'extreme_profit_jump': {
                    title: '🚨🚨 EMERGENCY PROFIT TAKING',
                    description: 'Extreme profit jump detected (10x+ target)'
                }
            };
            
            const message = reasonMessages[reason] || reasonMessages['profit_target_reached'];
            const profitMultiplier = (profitPercent / strategy.profitRangeMin).toFixed(1);
            
            console.log(`${message.title} EXECUTING...`);
            console.log(`   📊 Reason: ${message.description}`);
            console.log(`   📊 Current Profit: ${profitPercent.toFixed(2)}%`);
            console.log(`   📊 Target Profit: ${strategy.profitRangeMin}%`);
            console.log(`   📊 Profit Multiplier: ${profitMultiplier}x target`);
            
            const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
            const totalInvested = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
            
            console.log(`   💰 Selling ALL: ${totalTokens.toFixed(6)} tokens`);
            console.log(`   📊 Original Investment: ${totalInvested.toFixed(6)} WLD`);
            console.log(`   📊 Expected Value: ${(totalTokens * currentPrice).toFixed(6)} WLD`);
            
            // Execute complete sell
            const sellResult = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                strategy.targetToken,
                this.WLD_ADDRESS,
                totalTokens,
                strategy.maxSlippage
            );
            
            if (sellResult.success) {
                const wldReceived = parseFloat(sellResult.amountOut);
                const realizedProfit = wldReceived - totalInvested;
                const realizedProfitPercent = (realizedProfit / totalInvested) * 100;
                
                // Close all positions
                openPositions.forEach(pos => {
                    pos.status = 'closed';
                    pos.exitPrice = currentPrice;
                    pos.exitTimestamp = Date.now();
                    pos.exitReason = reason;
                    pos.realizedPnL = (pos.entryAmountToken * currentPrice) - pos.entryAmountWLD;
                    pos.realizedPnLPercent = (pos.realizedPnL / pos.entryAmountWLD) * 100;
                });
                
                // Update strategy stats
                strategy.totalTrades++;
                strategy.successfulTrades++;
                strategy.totalProfit += realizedProfit;
                strategy.lastTradeTimestamp = Date.now();
                
                console.log(`🎉 AUTO-SELL COMPLETED SUCCESSFULLY!`);
                console.log(`   💰 Sold: ${totalTokens.toFixed(6)} tokens`);
                console.log(`   💰 Received: ${wldReceived.toFixed(6)} WLD`);
                console.log(`   🎯 Realized Profit: ${realizedProfit.toFixed(6)} WLD (${realizedProfitPercent.toFixed(2)}%)`);
                console.log(`   📊 All positions closed automatically`);
                
                // Send Telegram notification
                if (this.telegramNotifications) {
                    await this.telegramNotifications.notifyTradeExecution({
                        type: 'sell',
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        amount: totalTokens.toFixed(6),
                        outputAmount: wldReceived.toFixed(6),
                        price: currentPrice.toFixed(8),
                        reason: `Auto-Sell: Profit Target Reached (${profitPercent.toFixed(1)}%)`,
                        profit: realizedProfit.toFixed(4),
                        profitPercent: realizedProfitPercent.toFixed(1)
                    });
                    
                    await this.telegramNotifications.notifyProfitAlert({
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        entryPrice: totalInvested / totalTokens,
                        currentPrice: currentPrice,
                        amount: totalTokens,
                        currentValue: wldReceived,
                        unrealizedPnL: realizedProfit,
                        strategy: `${strategy.name} (Auto-Sell Complete)`
                    }, realizedProfitPercent);
                }
                
                this.saveStrategies();
                
                // Mark strategy as completed since all positions are sold
                strategy.status = 'completed';
                strategy.completionReason = reason;
                strategy.finalProfit = realizedProfit;
                strategy.finalProfitPercent = realizedProfitPercent;
                strategy.autoSellExecuted = true;
                strategy.autoSellTimestamp = Date.now();
                
                console.log(`✅ Strategy "${strategy.name}" completed with auto-sell`);
                
            } else {
                console.log(`❌ Auto-Sell Failed: ${sellResult.error}`);
                console.log(`   🔄 Will retry on next price check...`);
            }
            
        } catch (error) {
            console.error(`❌ Error in immediate auto-sell:`, error.message);
        }
    }
    
    // Execute emergency profit sell when profit exceeds 2x target
    async executeEmergencyProfitSell(strategy, openPositions, currentPrice, profitPercent) {
        try {
            console.log(`🚨 EMERGENCY PROFIT TAKING ACTIVATED!`);
            console.log(`   📊 Profit: ${profitPercent.toFixed(2)}% (Target was: ${strategy.profitRangeMax}%)`);
            
            const totalTokens = openPositions.reduce((sum, pos) => sum + pos.entryAmountToken, 0);
            const totalInvested = openPositions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
            
            console.log(`   💰 Selling ALL remaining: ${totalTokens.toFixed(6)} tokens`);
            console.log(`   📊 Original Investment: ${totalInvested.toFixed(6)} WLD`);
            
            // Execute complete sell
            const sellResult = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                strategy.targetToken,
                this.WLD_ADDRESS,
                totalTokens,
                strategy.maxSlippage
            );
            
            if (sellResult.success) {
                const wldReceived = parseFloat(sellResult.amountOut);
                const realizedProfit = wldReceived - totalInvested;
                const realizedProfitPercent = (realizedProfit / totalInvested) * 100;
                
                // Close all positions
                openPositions.forEach(pos => {
                    pos.status = 'closed';
                    pos.exitPrice = currentPrice;
                    pos.exitTimestamp = Date.now();
                    pos.exitReason = 'emergency_profit_taking';
                    pos.realizedPnL = (pos.entryAmountToken * currentPrice) - pos.entryAmountWLD;
                    pos.realizedPnLPercent = (pos.realizedPnL / pos.entryAmountWLD) * 100;
                });
                
                // Update strategy stats
                strategy.totalTrades++;
                strategy.successfulTrades++;
                strategy.totalProfit += realizedProfit;
                strategy.lastTradeTimestamp = Date.now();
                
                console.log(`🎉 EMERGENCY PROFIT TAKING SUCCESSFUL!`);
                console.log(`   💰 Sold: ${totalTokens.toFixed(6)} tokens`);
                console.log(`   💰 Received: ${wldReceived.toFixed(6)} WLD`);
                console.log(`   🎯 Realized Profit: ${realizedProfit.toFixed(6)} WLD (${realizedProfitPercent.toFixed(2)}%)`);
                console.log(`   📊 All positions closed`);
                
                // Send Telegram notification
                if (this.telegramNotifications) {
                    await this.telegramNotifications.notifyTradeExecution({
                        type: 'sell',
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        amount: totalTokens.toFixed(6),
                        outputAmount: wldReceived.toFixed(6),
                        price: currentPrice.toFixed(8),
                        reason: `Emergency Profit Taking (${profitPercent.toFixed(1)}% profit)`,
                        profit: realizedProfit.toFixed(4),
                        profitPercent: realizedProfitPercent.toFixed(1)
                    });
                    
                    await this.telegramNotifications.notifyProfitAlert({
                        tokenSymbol: strategy.targetTokenSymbol || strategy.name,
                        entryPrice: totalInvested / totalTokens,
                        currentPrice: currentPrice,
                        amount: totalTokens,
                        currentValue: wldReceived,
                        unrealizedPnL: realizedProfit,
                        strategy: `${strategy.name} (Emergency Exit)`
                    }, realizedProfitPercent);
                }
                
                this.saveStrategies();
                
                // Mark strategy as completed
                strategy.status = 'completed';
                strategy.completionReason = 'emergency_profit_taking';
                strategy.finalProfit = realizedProfit;
                strategy.finalProfitPercent = realizedProfitPercent;
                
            } else {
                console.log(`❌ Emergency Profit Taking Failed: ${sellResult.error}`);
            }
            
        } catch (error) {
            console.error(`❌ Error in emergency profit taking:`, error.message);
        }
    }
    
    // Execute profit sell for ALL positions (based on average price strategy)
    async executeProfitSellAll(strategy, positions, currentPrice) {
        try {
            // Calculate total tokens to sell
            let totalTokensToSell = 0;
            positions.forEach(pos => {
                totalTokensToSell += pos.entryAmountToken;
            });
            
            console.log(`🔄 Executing profit sell: ${totalTokensToSell} ${strategy.targetTokenSymbol} → WLD`);
            console.log(`   📊 Selling ${positions.length} positions at average profit target`);
            
            // Execute the reverse trade for ALL tokens
            const result = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                strategy.targetToken,
                this.WLD_ADDRESS,
                totalTokensToSell,
                strategy.maxSlippage
            );
            
            if (result && result.success) {
                const wldReceived = parseFloat(result.tokensReceived || result.amountOut || 0);
                const totalInvested = positions.reduce((sum, pos) => sum + pos.entryAmountWLD, 0);
                const realizedPnL = wldReceived - totalInvested;
                const realizedPnLPercent = (realizedPnL / totalInvested) * 100;
                
                // Mark ALL positions as closed
                positions.forEach(pos => {
                    pos.status = 'closed';
                    pos.exitPrice = currentPrice;
                    pos.exitAmountWLD = (pos.entryAmountWLD / totalInvested) * wldReceived; // Proportional
                    pos.exitTimestamp = Date.now();
                    pos.exitTxHash = result.transactionHash || result.txHash;
                    pos.realizedPnL = pos.exitAmountWLD - pos.entryAmountWLD;
                    pos.realizedPnLPercent = (pos.realizedPnL / pos.entryAmountWLD) * 100;
                });
                
                // Update strategy statistics
                strategy.successfulTrades++;
                strategy.totalProfit += realizedPnL;
                strategy.lastExecuted = Date.now();
                
                console.log(`✅ Profit sell executed successfully!`);
                console.log(`   📊 Sold: ${totalTokensToSell} tokens → ${wldReceived.toFixed(6)} WLD`);
                console.log(`   💰 Total Invested: ${totalInvested.toFixed(6)} WLD`);
                console.log(`   💹 Realized P&L: ${realizedPnL.toFixed(6)} WLD (${realizedPnLPercent.toFixed(2)}%)`);
                console.log(`   🧾 TX: ${result.transactionHash || result.txHash}`);
                
                this.saveStrategies();
                this.emit('profitSellExecuted', { strategy, positions, result, realizedPnL });
                
            } else {
                throw new Error('Profit sell execution failed');
            }
            
        } catch (error) {
            console.error(`❌ Profit sell failed for ${strategy.name}:`, error.message);
            this.emit('profitSellFailed', { strategy, error: error.message });
        }
    }

    // Execute profit sell (legacy - keeping for compatibility)
    async executeProfitSell(strategy, position, expectedWLDReturn) {
        try {
            console.log(`🔄 Executing profit sell: ${position.entryAmountToken} ${strategy.targetTokenSymbol} → WLD`);
            
            // Execute the reverse trade
            const result = await this.sinclaveEngine.executeOptimizedSwap(
                strategy.walletObject,
                strategy.targetToken,
                this.WLD_ADDRESS,
                position.entryAmountToken,
                strategy.maxSlippage
            );
            
            if (result && result.success) {
                const actualWLDReceived = parseFloat(result.tokensReceived || result.amountOut || 0);
                const realizedPnL = actualWLDReceived - position.entryAmountWLD;
                const realizedPnLPercent = (realizedPnL / position.entryAmountWLD) * 100;
                
                // Update position
                position.status = 'closed';
                position.exitTimestamp = Date.now();
                position.exitTxHash = result.transactionHash || result.txHash;
                position.exitAmountWLD = actualWLDReceived;
                position.realizedPnL = realizedPnL;
                position.realizedPnLPercent = realizedPnLPercent;
                
                // Update strategy stats
                strategy.successfulTrades++;
                strategy.totalProfit += realizedPnL;
                
                console.log(`✅ Profit sell executed successfully!`);
                console.log(`   💰 Return: ${actualWLDReceived.toFixed(6)} WLD`);
                console.log(`   📊 Profit: ${realizedPnL.toFixed(6)} WLD (${realizedPnLPercent.toFixed(2)}%)`);
                console.log(`   🧾 TX: ${position.exitTxHash}`);
                
                this.saveStrategies();
                this.emit('profitSellExecuted', { strategy, position, result });
                
            } else {
                throw new Error('Profit sell execution failed');
            }
            
        } catch (error) {
            console.error(`❌ Profit sell failed for position ${position.id}:`, error.message);
            this.emit('profitSellFailed', { strategy, position, error: error.message });
        }
    }
    
    // Get all strategies
    getAllStrategies() {
        return Array.from(this.customStrategies.values());
    }
    
    // Get active strategies
    getActiveStrategies() {
        return Array.from(this.customStrategies.values()).filter(s => s.isActive);
    }
    
    // Check if a strategy is active
    isStrategyActive(strategyId) {
        const strategy = this.customStrategies.get(strategyId);
        return strategy && strategy.isActive === true;
    }
    
    // Get positions for a specific strategy
    getStrategyPositions(strategyId) {
        return this.strategyPositions.get(strategyId) || [];
    }
    
    // Get all positions across all strategies
    getAllPositions() {
        const allPositions = [];
        for (const positions of this.strategyPositions.values()) {
            allPositions.push(...positions);
        }
        return allPositions;
    }
    
    // Reset DIP buying levels for a strategy (called when position is closed)
    resetDipBuyingLevels(strategyId) {
        const strategy = this.customStrategies.get(strategyId);
        if (strategy && strategy.dipBuyingLevels) {
            strategy.dipBuyingLevels.forEach(level => {
                level.executed = false;
            });
            console.log(`🔄 Reset DIP buying levels for strategy: ${strategy.name}`);
        }
    }
    
    // Get strategy by ID
    getStrategy(strategyId) {
        return this.customStrategies.get(strategyId);
    }
    
    // Delete strategy
    deleteStrategy(strategyId) {
        const strategy = this.customStrategies.get(strategyId);
        if (!strategy) {
            throw new Error(`Strategy ${strategyId} not found`);
        }
        
        // Stop if active
        if (strategy.isActive) {
            this.stopStrategy(strategyId);
        }
        
        this.customStrategies.delete(strategyId);
        this.saveStrategies();
        
        console.log(`🗑️ Deleted strategy: ${strategy.name}`);
        return true;
    }
    
    // Save strategies to file
    saveStrategies() {
        try {
            const strategiesData = {};
            for (const [id, strategy] of this.customStrategies.entries()) {
                // Don't save wallet object (contains private key)
                const { walletObject, ...safeStrategy } = strategy;
                strategiesData[id] = safeStrategy;
            }
            
            fs.writeFileSync(this.strategiesPath, JSON.stringify(strategiesData, null, 2));
        } catch (error) {
            console.error('❌ Error saving strategies:', error.message);
        }
    }
    
    // Load strategies from file
    loadStrategies() {
        try {
            if (fs.existsSync(this.strategiesPath)) {
                const strategiesData = JSON.parse(fs.readFileSync(this.strategiesPath, 'utf8'));
                for (const [id, strategy] of Object.entries(strategiesData)) {
                    this.customStrategies.set(id, strategy);
                }
                console.log(`📂 Loaded ${Object.keys(strategiesData).length} custom strategies`);
            }
        } catch (error) {
            console.error('❌ Error loading strategies:', error.message);
        }
    }
    
    // Get strategy statistics
    getStrategyStatistics() {
        const strategies = this.getAllStrategies();
        const activeStrategies = strategies.filter(s => s.isActive);
        const stoppedStrategies = strategies.filter(s => !s.isActive);
        
        // Safely calculate totals with fallback values
        const totalTrades = strategies.reduce((sum, s) => sum + (s.totalTrades || 0), 0);
        const successfulTrades = strategies.reduce((sum, s) => sum + (s.successfulTrades || 0), 0);
        const failedTrades = strategies.reduce((sum, s) => sum + ((s.totalTrades || 0) - (s.successfulTrades || 0)), 0);
        const totalProfit = strategies.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
        
        // Calculate success rate and average profit per trade safely
        const successRate = totalTrades > 0 ? (successfulTrades / totalTrades * 100) : 0;
        const averageProfitPerTrade = totalTrades > 0 ? (totalProfit / totalTrades) : 0;
        
        // Find best performing strategy
        let bestPerformingStrategy = null;
        if (strategies.length > 0) {
            bestPerformingStrategy = strategies.reduce((best, current) => {
                const currentProfit = current.totalProfit || 0;
                const bestProfit = best ? (best.totalProfit || 0) : 0;
                return currentProfit > bestProfit ? current : best;
            }, null);
        }
        
        return {
            totalStrategies: strategies.length,
            activeStrategies: activeStrategies.length,
            stoppedStrategies: stoppedStrategies.length,
            totalTrades,
            successfulTrades,
            failedTrades,
            successRate: successRate,
            totalProfit: totalProfit,
            averageProfitPerTrade: averageProfitPerTrade,
            bestPerformingStrategy: bestPerformingStrategy ? {
                name: bestPerformingStrategy.name || 'Unknown',
                profit: bestPerformingStrategy.totalProfit || 0
            } : null,
            strategies: strategies.map(s => ({
                id: s.id,
                name: s.name,
                tokenSymbol: s.tokenSymbol || 'Unknown',
                isActive: s.isActive || false,
                totalTrades: s.totalTrades || 0,
                successfulTrades: s.successfulTrades || 0,
                totalProfit: (s.totalProfit || 0),
                openPositions: (s.positions || []).filter(p => p.status === 'open').length
            }))
        };
    }
}

module.exports = StrategyBuilder;