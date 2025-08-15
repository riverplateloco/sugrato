const { ethers } = require('ethers');
const EventEmitter = require('events');

class TradingStrategy extends EventEmitter {
    constructor(tradingEngine, config, sinclaveEngine = null, telegramNotifications = null) {
        super();
        this.tradingEngine = tradingEngine;
        this.sinclaveEngine = sinclaveEngine; // Enhanced engine for better execution
        this.config = config;
        this.telegramNotifications = telegramNotifications;
        
        // Strategy configuration with defaults
        this.strategyConfig = {
            // Main strategy settings
            profitTarget: parseFloat(process.env.PROFIT_TARGET) || 1.0, // 1% profit target
            dipBuyThreshold: parseFloat(process.env.DIP_BUY_THRESHOLD) || 1.0, // Buy on 1% dip
            maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 1.0, // Max 1% slippage
            
            // Monitoring settings
            priceCheckInterval: parseInt(process.env.PRICE_CHECK_INTERVAL) || 3000, // 3 seconds
            enableDipBuying: process.env.ENABLE_DIP_BUYING === 'true' || false,
            enableAutoSell: process.env.ENABLE_AUTO_SELL === 'true' || true,
            
            // Risk management
            maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 100, // Max WLD per position
            maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
            stopLossThreshold: parseFloat(process.env.STOP_LOSS_THRESHOLD) || -5.0, // 5% stop loss
            
            // Advanced settings
            trailingStop: parseFloat(process.env.TRAILING_STOP) || 0.5, // 0.5% trailing stop
            enableTrailingStop: process.env.ENABLE_TRAILING_STOP === 'true' || false,
            minProfitForTrailing: parseFloat(process.env.MIN_PROFIT_FOR_TRAILING) || 2.0, // 2% min profit to enable trailing
        };
        
        // Position tracking
        this.positions = new Map(); // tokenAddress -> position data
        this.priceHistory = new Map(); // tokenAddress -> price history array
        this.monitoringIntervals = new Map(); // tokenAddress -> interval ID
        this.walletObjects = new Map(); // walletAddress -> full wallet object (for sell trades)
        this.positionLocks = new Map(); // tokenAddress -> boolean (prevent concurrent sells)
        
        // Strategy state
        this.isRunning = false;
        this.totalProfit = 0;
        this.totalTrades = 0;
        this.successfulTrades = 0;
        
        // WLD token address
        this.WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';
        
        console.log('🎯 Trading Strategy initialized with configuration:', this.strategyConfig);
        if (this.sinclaveEngine) {
            console.log('✅ Sinclave Enhanced Engine available for optimal execution');
        } else {
            console.log('⚠️ Using standard trading engine (consider upgrading to Enhanced)');
        }
    }

    // Set wallet objects for the strategy (called from main bot)
    setWalletObjects(wallets) {
        this.walletObjects.clear();
        if (Array.isArray(wallets)) {
            wallets.forEach(wallet => {
                if (wallet.address) {
                    this.walletObjects.set(wallet.address, wallet);
                }
            });
            console.log(`🔑 ${wallets.length} wallet objects set for strategic trading`);
        }
    }
    
    // Get wallet object by address
    getWalletObject(address) {
        return this.walletObjects.get(address);
    }

    // Start the strategy system
    async startStrategy() {
        if (this.isRunning) {
            console.log('⚠️ Strategy is already running');
            return;
        }
        
        this.isRunning = true;
        console.log('🚀 Starting Trading Strategy System...');
        
        // Load existing positions
        await this.loadPositions();
        
        // Start monitoring existing positions
        for (const [tokenAddress, position] of this.positions) {
            if (position.status === 'open') {
                this.startPositionMonitoring(tokenAddress);
            }
        }
        
        this.emit('strategyStarted');
        console.log('✅ Trading Strategy System is now active');
    }

    // Stop the strategy system
    async stopStrategy() {
        if (!this.isRunning) {
            console.log('⚠️ Strategy is not running');
            return;
        }
        
        this.isRunning = false;
        console.log('🛑 Stopping Trading Strategy System...');
        
        // Stop all monitoring intervals
        for (const [tokenAddress, intervalId] of this.monitoringIntervals) {
            clearInterval(intervalId);
            console.log(`📊 Stopped monitoring ${tokenAddress}`);
        }
        
        this.monitoringIntervals.clear();
        
        // Save positions
        await this.savePositions();
        
        this.emit('strategyStopped');
        console.log('✅ Trading Strategy System stopped');
    }

    // Execute a buy trade and open a position (ENHANCED WITH SINCLAVE ENGINE)
    async executeBuyTrade(wallet, tokenAddress, amountWLD, currentPrice = null) {
        try {
            console.log(`🔄 Executing BUY trade: ${amountWLD} WLD -> ${tokenAddress}`);
            
            // Store the wallet object for later use in sell trades
            this.walletObjects.set(wallet.address, wallet);
            
            // Validate position limits
            if (this.positions.size >= this.strategyConfig.maxOpenPositions) {
                throw new Error(`Maximum open positions (${this.strategyConfig.maxOpenPositions}) reached`);
            }
            
            if (amountWLD > this.strategyConfig.maxPositionSize) {
                throw new Error(`Position size (${amountWLD}) exceeds maximum (${this.strategyConfig.maxPositionSize})`);
            }
            
            // Use Sinclave Enhanced Engine if available for better execution
            let result;
            if (this.sinclaveEngine) {
                console.log('🚀 Using Sinclave Enhanced Engine for optimal execution...');
                
                // Execute with enhanced engine (handles slippage and liquidity checks internally)
                result = await this.sinclaveEngine.executeOptimizedSwap(
                    wallet,
                    this.WLD_ADDRESS,
                    tokenAddress,
                    amountWLD,
                    this.strategyConfig.maxSlippage
                );
                
                if (!result.success) {
                    throw new Error(`Enhanced trade execution failed: ${result.error}`);
                }
                
                console.log(`✅ Enhanced trade completed in ${result.executionTime}ms`);
                
            } else {
                // Fallback to standard engine with price checks
                console.log('⚠️ Using standard trading engine (liquidity may be limited)');
                
                // Get current price quote if not provided
                if (!currentPrice) {
                    const priceData = await this.tradingEngine.getTokenPrice(tokenAddress);
                    currentPrice = priceData.price;
                }
                
                // Check slippage before executing
                const quote = await this.getSwapQuote(this.WLD_ADDRESS, tokenAddress, amountWLD);
                const slippage = this.calculateSlippage(quote.expectedPrice, currentPrice);
                
                if (Math.abs(slippage) > this.strategyConfig.maxSlippage) {
                    throw new Error(`Slippage too high: ${slippage.toFixed(2)}% (max: ${this.strategyConfig.maxSlippage}%)`);
                }
                
                // Execute the trade with standard engine
                result = await this.tradingEngine.executeSwap(
                    wallet,
                    this.WLD_ADDRESS,
                    tokenAddress,
                    amountWLD,
                    this.strategyConfig.maxSlippage
                );
                
                if (!result.success) {
                    throw new Error(`Trade execution failed: ${result.error}`);
                }
            }
            
            // Create position record (works with both engines)
            // Calculate the ACTUAL executed swap rate from the trade results
            const actualTokensReceived = parseFloat(result.amountOut || result.tokensReceived || 0);
            const actualWLDSpent = parseFloat(amountWLD);
            const executedRate = actualTokensReceived / actualWLDSpent; // tokens per WLD
            
            const calculatedPrice = currentPrice || (result.tokensReceived && result.tokensSpent ? 
                parseFloat(result.tokensSpent) / parseFloat(result.tokensReceived) : 0);
            
            const position = {
                id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                tokenAddress: tokenAddress,
                walletAddress: wallet.address,
                status: 'open',
                
                // Entry data (CRITICAL: Record actual executed swap)
                entryAmountWLD: actualWLDSpent, // WLD we spent
                entryAmountToken: actualTokensReceived, // Tokens we received
                executedRate: executedRate, // Actual rate: tokens per WLD
                entryTimestamp: Date.now(),
                entryTxHash: result.txHash || result.transactionHash,
                
                // For profit calculation: We need 1% more WLD back than we spent
                // If we spent 0.1 WLD, we need 0.101 WLD back to achieve 1% profit
                profitTargetWLD: actualWLDSpent * (1 + this.strategyConfig.profitTarget / 100),
                stopLossWLD: actualWLDSpent * (1 + this.strategyConfig.stopLossThreshold / 100),
                
                // Current data (updated by monitoring)
                currentWLDValue: actualWLDSpent, // Initially equal to what we spent
                currentValue: actualWLDSpent, // For compatibility
                unrealizedPnL: 0, // No profit/loss initially
                unrealizedPnLPercent: 0,
                canExecuteReverseSwap: false, // Will be updated by monitoring
                
                // Strategy data
                profitTarget: this.strategyConfig.profitTarget,
                stopLoss: this.strategyConfig.stopLossThreshold,
                highestWLDValue: actualWLDSpent, // Track highest WLD value for trailing stop
                trailingStopWLDValue: null,
                
                // Legacy compatibility
                entryPrice: calculatedPrice,
                currentPrice: calculatedPrice,
                highestPrice: calculatedPrice,
                trailingStopPrice: null,
                
                // Trade history
                trades: [{
                    type: 'buy',
                    timestamp: Date.now(),
                    amountWLD: actualWLDSpent,
                    amountToken: actualTokensReceived,
                    executedRate: executedRate,
                    txHash: result.txHash || result.transactionHash,
                    gasUsed: result.gasUsed || 'N/A',
                    price: calculatedPrice // Legacy compatibility
                }]
            };
            
            // Store position
            this.positions.set(tokenAddress, position);
            await this.savePositions();
            
            // Start monitoring this position
            this.startPositionMonitoring(tokenAddress);
            
            // Update statistics
            this.totalTrades++;
            
            console.log(`✅ Position opened: ${position.id}`);
            console.log(`📊 Entry: ${actualWLDSpent} WLD → ${actualTokensReceived} tokens`);
            console.log(`📊 Executed Rate: 1 WLD = ${executedRate.toFixed(6)} tokens`);
            console.log(`🎯 Profit Target: ${position.profitTargetWLD.toFixed(6)} WLD (${this.strategyConfig.profitTarget}% profit)`);
            console.log(`🛑 Stop Loss: ${position.stopLossWLD.toFixed(6)} WLD (${this.strategyConfig.stopLossThreshold}% loss)`);
            console.log(`📊 Monitoring will check reverse swap quotes every ${this.strategyConfig.priceCheckInterval/1000}s`);
            
            // Send Telegram notification if configured
            if (this.telegramNotifications) {
                await this.telegramNotifications.notifyTradeExecution({
                    type: 'buy',
                    tokenSymbol: tokenAddress.slice(0, 8) + '...',
                    amount: actualWLDSpent,
                    outputAmount: actualTokensReceived.toFixed(6),
                    price: executedRate.toFixed(8),
                    gasUsed: result.gasUsed || 'N/A',
                    executionTime: result.executionTime || 'N/A'
                });
            }
            
            this.emit('positionOpened', position);
            return position;
            
        } catch (error) {
            console.error(`❌ Buy trade failed:`, error.message);
            this.emit('tradeError', { type: 'buy', error: error.message });
            throw error;
        }
    }

    // Execute a sell trade and close a position (ENHANCED WITH SINCLAVE ENGINE)
    async executeSellTrade(tokenAddress, reason = 'manual') {
        try {
            const position = this.positions.get(tokenAddress);
            if (!position) {
                console.log(`❌ DEBUG: No position found for token ${tokenAddress}`);
                console.log(`❌ DEBUG: Available positions:`, Array.from(this.positions.keys()));
                throw new Error('No position found for this token');
            }
            if (position.status !== 'open') {
                console.log(`❌ DEBUG: Position status is '${position.status}', not 'open'`);
                console.log(`❌ DEBUG: Position details:`, {
                    id: position.id,
                    status: position.status,
                    tokenAddress: position.tokenAddress,
                    walletAddress: position.walletAddress
                });
                throw new Error(`Position status is '${position.status}', expected 'open'`);
            }
            
            console.log(`🔄 Executing SELL trade: ${position.entryAmountToken} tokens -> WLD (${reason})`);
            
            // Get the wallet object for the position
            const wallet = this.walletObjects.get(position.walletAddress);
            if (!wallet) {
                throw new Error(`Wallet object not found for position with wallet address: ${position.walletAddress}`);
            }
            
            // Use Sinclave Enhanced Engine if available for better execution
            let result;
            let currentPrice = 0; // Initialize currentPrice to avoid undefined errors
            
            if (this.sinclaveEngine) {
                console.log('🚀 Using Sinclave Enhanced Engine for optimal sell execution...');
                
                // Execute with enhanced engine
                result = await this.sinclaveEngine.executeOptimizedSwap(
                    wallet,
                    tokenAddress,
                    this.WLD_ADDRESS,
                    position.entryAmountToken,
                    this.strategyConfig.maxSlippage
                );
                
                if (!result.success) {
                    throw new Error(`Enhanced sell execution failed: ${result.error}`);
                }
                
                console.log(`✅ Enhanced sell completed in ${result.executionTime}ms`);
                
                // Calculate currentPrice from the executed trade result
                if (result.amountOut && position.entryAmountToken) {
                    currentPrice = parseFloat(result.amountOut) / position.entryAmountToken;
                } else {
                    // Fallback: get price from quote
                    try {
                        currentPrice = await this.getCurrentTokenPrice(tokenAddress);
                    } catch (error) {
                        console.log(`⚠️ Could not get current price, using entry price as fallback`);
                        currentPrice = position.entryPrice || 0;
                    }
                }
                
            } else {
                // Fallback to standard engine
                console.log('⚠️ Using standard trading engine for sell (liquidity may be limited)');
                
                // Get current price
                try {
                    currentPrice = await this.getCurrentTokenPrice(tokenAddress);
                } catch (error) {
                    console.log(`⚠️ Could not get current price, using entry price as fallback`);
                    currentPrice = position.entryPrice || 0;
                }
                
                // Execute the sell trade
                result = await this.tradingEngine.executeSwap(
                    wallet,
                    tokenAddress,
                    this.WLD_ADDRESS,
                    position.entryAmountToken,
                    this.strategyConfig.maxSlippage
                );
                
                if (!result.success) {
                    throw new Error(`Sell execution failed: ${result.error}`);
                }
            }
            
            // Calculate final P&L
            const exitAmountWLD = parseFloat(result.amountOut);
            const realizedPnL = exitAmountWLD - position.entryAmountWLD;
            const realizedPnLPercent = (realizedPnL / position.entryAmountWLD) * 100;
            
            // Update position
            position.status = 'closed';
            position.exitPrice = currentPrice;
            position.exitAmountWLD = exitAmountWLD;
            position.exitTimestamp = Date.now();
            position.exitTxHash = result.txHash;
            position.realizedPnL = realizedPnL;
            position.realizedPnLPercent = realizedPnLPercent;
            position.closeReason = reason;
            
            // Add exit trade to history
            position.trades.push({
                type: 'sell',
                timestamp: Date.now(),
                price: currentPrice,
                amountWLD: exitAmountWLD,
                amountToken: position.entryAmountToken,
                txHash: result.txHash,
                gasUsed: result.gasUsed,
                reason: reason
            });
            
            // Stop monitoring
            this.stopPositionMonitoring(tokenAddress);
            
            // Update statistics
            this.totalProfit += realizedPnL;
            if (realizedPnL > 0) {
                this.successfulTrades++;
            }
            
            // Save positions
            await this.savePositions();
            
            console.log(`✅ Position closed: ${position.id}`);
            console.log(`📊 Exit: ${position.entryAmountToken} tokens -> ${exitAmountWLD} WLD at ${currentPrice.toFixed(8)} WLD/token`);
            
            // Color code P&L: Green for profit, Red for loss
            const pnlColor = realizedPnLPercent >= 0 ? '\x1b[32m' : '\x1b[31m'; // Green or Red
            const resetColor = '\x1b[0m'; // Reset color
            console.log(`${pnlColor}💰 P&L: ${realizedPnL.toFixed(4)} WLD (${realizedPnLPercent.toFixed(2)}%)${resetColor}`);
            
            // Send Telegram notification if configured
            if (this.telegramNotifications) {
                await this.telegramNotifications.notifyTradeExecution({
                    type: 'sell',
                    tokenSymbol: tokenAddress.slice(0, 8) + '...',
                    amount: position.entryAmountToken.toFixed(6),
                    outputAmount: exitAmountWLD.toFixed(6),
                    price: currentPrice.toFixed(8),
                    gasUsed: result.gasUsed || 'N/A',
                    executionTime: result.executionTime || 'N/A',
                    profit: realizedPnL.toFixed(4),
                    profitPercent: realizedPnLPercent.toFixed(2),
                    reason: reason
                });
            }
            
            this.emit('positionClosed', position);
            return position;
            
        } catch (error) {
            console.error(`❌ Sell trade failed:`, error.message);
            this.emit('tradeError', { type: 'sell', error: error.message });
            throw error;
        }
    }

    // Start monitoring a position
    startPositionMonitoring(tokenAddress) {
        if (this.monitoringIntervals.has(tokenAddress)) {
            console.log(`⚠️ Already monitoring ${tokenAddress}`);
            return;
        }
        
        console.log(`📊 Starting price monitoring for ${tokenAddress}`);
        
        const intervalId = setInterval(async () => {
            try {
                await this.monitorPosition(tokenAddress);
            } catch (error) {
                console.error(`❌ Monitoring error for ${tokenAddress}:`, error.message);
            }
        }, this.strategyConfig.priceCheckInterval);
        
        this.monitoringIntervals.set(tokenAddress, intervalId);
    }

    // Stop monitoring a position
    stopPositionMonitoring(tokenAddress) {
        const intervalId = this.monitoringIntervals.get(tokenAddress);
        if (intervalId) {
            clearInterval(intervalId);
            this.monitoringIntervals.delete(tokenAddress);
            console.log(`📊 Stopped monitoring ${tokenAddress}`);
        }
    }

    // Monitor a single position (ENHANCED WITH REVERSE SWAP QUOTES)
    async monitorPosition(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position) {
            console.log(`❌ DEBUG: Monitoring stopped - no position found for ${tokenAddress}`);
            console.log(`❌ DEBUG: Available positions:`, Array.from(this.positions.keys()));
            this.stopPositionMonitoring(tokenAddress);
            return;
        }
        if (position.status !== 'open') {
            console.log(`❌ DEBUG: Monitoring stopped - position status is '${position.status}' for ${tokenAddress}`);
            this.stopPositionMonitoring(tokenAddress);
            return;
        }
        
        // Skip if position is already being processed
        if (this.positionLocks.get(tokenAddress)) {
            console.log(`⏳ DEBUG: Position ${position.id} is locked, skipping monitoring cycle`);
            return;
        }
        
        try {
            // CRITICAL: Use reverse swap quotes to check actual sellable value
            // This tells us exactly how much WLD we'd get back for our tokens
            let currentWLDValue = 0;
            let canExecuteReverseSwap = false;
            
            if (this.sinclaveEngine) {
                try {
                    // Get reverse swap quote: TOKEN → WLD
                    const reverseQuote = await this.sinclaveEngine.getHoldStationQuote(
                        tokenAddress,
                        this.WLD_ADDRESS,
                        position.entryAmountToken, // All our tokens
                        position.walletAddress
                    );
                    
                    if (reverseQuote && reverseQuote.expectedOutput) {
                        currentWLDValue = parseFloat(reverseQuote.expectedOutput);
                        canExecuteReverseSwap = true;
                        console.log(`📊 Position ${position.id}: ${position.entryAmountToken} tokens → ${currentWLDValue.toFixed(6)} WLD`);
                    }
                } catch (enhancedError) {
                    console.log(`⚠️ Enhanced reverse quote failed: ${enhancedError.message}`);
                    // Fall back to standard price calculation
                }
            }
            
            // Fallback: Use current price calculation if reverse quote fails
            if (!canExecuteReverseSwap) {
                const currentPrice = await this.getCurrentTokenPrice(tokenAddress);
                currentWLDValue = position.entryAmountToken * currentPrice;
                console.log(`📊 Position ${position.id}: Estimated value ${currentWLDValue.toFixed(6)} WLD (price-based)`);
            }
            
            // Calculate P&L based on actual swap values
            // Initial: position.entryAmountWLD WLD → position.entryAmountToken tokens
            // Current: position.entryAmountToken tokens → currentWLDValue WLD
            const unrealizedPnL = currentWLDValue - position.entryAmountWLD;
            const unrealizedPnLPercent = (unrealizedPnL / position.entryAmountWLD) * 100;
            
            // Update position data
            position.currentWLDValue = currentWLDValue; // How much WLD we'd get back
            position.currentValue = currentWLDValue; // For compatibility
            position.unrealizedPnL = unrealizedPnL;
            position.unrealizedPnLPercent = unrealizedPnLPercent;
            position.canExecuteReverseSwap = canExecuteReverseSwap;
            
            // Store in history with swap-based data
            if (!this.priceHistory.has(tokenAddress)) {
                this.priceHistory.set(tokenAddress, []);
            }
            const history = this.priceHistory.get(tokenAddress);
            history.push({
                timestamp: Date.now(),
                wldValue: currentWLDValue, // Actual WLD we'd get back
                pnl: unrealizedPnL,
                pnlPercent: unrealizedPnLPercent,
                canExecuteSwap: canExecuteReverseSwap
            });
            
            // Keep only last 100 history entries
            if (history.length > 100) {
                history.shift();
            }
            
            // Send Telegram alerts for significant profit/loss changes
            if (this.telegramNotifications) {
                if (unrealizedPnLPercent >= 10) { // 10%+ profit
                    await this.telegramNotifications.notifyProfitAlert(position, unrealizedPnLPercent);
                } else if (unrealizedPnLPercent <= -5) { // 5%+ loss
                    await this.telegramNotifications.notifyLossAlert(position, unrealizedPnLPercent);
                }
                
                // Send position updates for significant changes (every 5% change)
                const lastAlert = this.lastProfitAlert?.get(tokenAddress) || 0;
                if (Math.abs(unrealizedPnLPercent - lastAlert) >= 5) {
                    await this.telegramNotifications.notifyPositionUpdate({
                        tokenSymbol: tokenAddress.slice(0, 8) + '...',
                        entryPrice: position.entryAmountWLD / position.entryAmountToken,
                        currentPrice: currentWLDValue / position.entryAmountToken,
                        amount: position.entryAmountToken,
                        currentValue: currentWLDValue,
                        unrealizedPnL: unrealizedPnL,
                        strategy: 'Main Strategy'
                    });
                    
                    // Track last alert level
                    if (!this.lastProfitAlert) this.lastProfitAlert = new Map();
                    this.lastProfitAlert.set(tokenAddress, unrealizedPnLPercent);
                }
            }
            
            // Check for profit target (using actual swap quotes)
            if (unrealizedPnLPercent >= position.profitTarget) {
                console.log(`🎯 PROFIT TARGET REACHED! ${unrealizedPnLPercent.toFixed(2)}% >= ${position.profitTarget}%`);
                console.log(`💰 Expected return: ${currentWLDValue.toFixed(6)} WLD (profit: ${unrealizedPnL.toFixed(6)} WLD)`);
                
                if (canExecuteReverseSwap) {
                    // Check if position is already being sold
                    if (this.positionLocks.get(tokenAddress)) {
                        console.log(`⏳ Position ${position.id} is already being processed, skipping...`);
                        return;
                    }
                    
                    // Lock the position to prevent concurrent sells
                    this.positionLocks.set(tokenAddress, true);
                    console.log(`🔒 Locking position ${position.id} for sell execution`);
                    
                    try {
                        console.log(`🚀 Executing profitable reverse swap...`);
                        await this.executeSellTrade(tokenAddress, 'profit_target');
                    } finally {
                        // Always unlock the position, even if sell fails
                        this.positionLocks.delete(tokenAddress);
                        console.log(`🔓 Unlocked position ${position.id}`);
                    }
                } else {
                    console.log(`⚠️ Cannot execute reverse swap, monitoring continues...`);
                }
                return;
            }
            
            // Check for stop loss (with floating-point tolerance)
            const stopLossTolerance = 0.01; // 0.01% tolerance for floating-point precision
            if (unrealizedPnLPercent <= (position.stopLoss + stopLossTolerance)) {
                console.log(`🛑 STOP LOSS TRIGGERED! ${unrealizedPnLPercent.toFixed(2)}% <= ${position.stopLoss}%`);
                console.log(`💸 Expected return: ${currentWLDValue.toFixed(6)} WLD (loss: ${Math.abs(unrealizedPnL).toFixed(6)} WLD)`);
                console.log(`🔍 DEBUG - Entry: ${position.entryAmountWLD.toFixed(6)} WLD, Current: ${currentWLDValue.toFixed(6)} WLD`);
                console.log(`🔍 DEBUG - Stop Loss Threshold: ${position.stopLoss}%, Actual Loss: ${unrealizedPnLPercent.toFixed(2)}%`);
                
                if (canExecuteReverseSwap) {
                    // Check if position is already being sold
                    if (this.positionLocks.get(tokenAddress)) {
                        console.log(`⏳ Position ${position.id} is already being processed, skipping...`);
                        return;
                    }
                    
                    // Lock the position to prevent concurrent sells
                    this.positionLocks.set(tokenAddress, true);
                    console.log(`🔒 Locking position ${position.id} for stop loss execution`);
                    
                    try {
                        console.log(`🚨 Executing stop loss reverse swap...`);
                        await this.executeSellTrade(tokenAddress, 'stop_loss');
                    } finally {
                        // Always unlock the position, even if sell fails
                        this.positionLocks.delete(tokenAddress);
                        console.log(`🔓 Unlocked position ${position.id}`);
                    }
                } else {
                    console.log(`⚠️ Cannot execute reverse swap, monitoring continues...`);
                }
                return;
            }
            
            // Update trailing stop logic (using swap-based values)
            if (currentWLDValue > (position.highestWLDValue || position.entryAmountWLD)) {
                position.highestWLDValue = currentWLDValue;
                
                // Update trailing stop if enabled and profitable enough
                if (this.strategyConfig.enableTrailingStop && 
                    unrealizedPnLPercent >= this.strategyConfig.minProfitForTrailing) {
                    const trailingStopPercent = this.strategyConfig.trailingStop / 100;
                    position.trailingStopWLDValue = currentWLDValue * (1 - trailingStopPercent);
                    console.log(`📈 New trailing stop: ${position.trailingStopWLDValue.toFixed(6)} WLD`);
                }
            }
            
            // Check trailing stop
            if (position.trailingStopWLDValue && currentWLDValue <= position.trailingStopWLDValue) {
                console.log(`📉 TRAILING STOP TRIGGERED! ${currentWLDValue.toFixed(6)} <= ${position.trailingStopWLDValue.toFixed(6)} WLD`);
                
                if (canExecuteReverseSwap) {
                    console.log(`🔄 Executing trailing stop reverse swap...`);
                    await this.executeSellTrade(tokenAddress, 'trailing_stop');
                } else {
                    console.log(`⚠️ Cannot execute reverse swap, monitoring continues...`);
                }
                return;
            }
            
            // Periodic status update (every 10 checks, roughly 50 seconds)
            const historyLength = history.length;
            if (historyLength % 10 === 0) {
                console.log(`📊 Position ${position.id} status:`);
                console.log(`   💰 Entry: ${position.entryAmountWLD} WLD → ${position.entryAmountToken} tokens`);
                console.log(`   📈 Current: ${position.entryAmountToken} tokens → ${currentWLDValue.toFixed(6)} WLD`);
                
                // Color code P&L: Green for profit, Red for loss
                const pnlColor = unrealizedPnLPercent >= 0 ? '\x1b[32m' : '\x1b[31m'; // Green or Red
                const resetColor = '\x1b[0m'; // Reset color
                console.log(`   ${pnlColor}📊 P&L: ${unrealizedPnL.toFixed(6)} WLD (${unrealizedPnLPercent.toFixed(2)}%)${resetColor}`);
                
                console.log(`   🎯 Target: ${position.profitTarget}% | 🛑 Stop: ${position.stopLoss}%`);
                console.log(`   🔄 Swap Available: ${canExecuteReverseSwap ? '✅' : '❌'}`);
                
                // Show stop loss proximity
                const stopLossDistance = Math.abs(unrealizedPnLPercent - position.stopLoss);
                if (unrealizedPnLPercent < 0) { // Only show when in loss
                    console.log(`   🛑 Stop Loss Distance: ${stopLossDistance.toFixed(2)}% (${unrealizedPnLPercent.toFixed(2)}% vs ${position.stopLoss}%)`);
                }
            }
            
            await this.savePositions();
            
        } catch (error) {
            console.error(`❌ Error monitoring position ${tokenAddress}:`, error.message);
        }
    }

    // Check if trading conditions are met
    async checkTradingConditions(tokenAddress, position) {
        const { unrealizedPnLPercent, currentPrice, trailingStopPrice } = position;
        
        // Check profit target
        if (this.strategyConfig.enableAutoSell && unrealizedPnLPercent >= this.strategyConfig.profitTarget) {
            console.log(`🎯 Profit target reached for ${tokenAddress}: ${unrealizedPnLPercent.toFixed(2)}%`);
            await this.executeSellTrade(tokenAddress, 'profit_target');
            return;
        }
        
        // Check stop loss (with floating-point tolerance)
        const stopLossTolerance = 0.01; // 0.01% tolerance for floating-point precision
        if (unrealizedPnLPercent <= (this.strategyConfig.stopLossThreshold + stopLossTolerance)) {
            console.log(`🛑 Stop loss triggered for ${tokenAddress}: ${unrealizedPnLPercent.toFixed(2)}%`);
            await this.executeSellTrade(tokenAddress, 'stop_loss');
            return;
        }
        
        // Check trailing stop
        if (this.strategyConfig.enableTrailingStop && trailingStopPrice && 
            currentPrice <= trailingStopPrice) {
            console.log(`📉 Trailing stop triggered for ${tokenAddress}: ${currentPrice.toFixed(8)} <= ${trailingStopPrice.toFixed(8)}`);
            await this.executeSellTrade(tokenAddress, 'trailing_stop');
            return;
        }
        
        // Check DIP buying opportunity (if enabled and we don't have a position)
        if (this.strategyConfig.enableDipBuying) {
            await this.checkDipBuyingOpportunity(tokenAddress);
        }
    }

    // Check for DIP buying opportunities
    async checkDipBuyingOpportunity(tokenAddress) {
        try {
            // Get price history for this token
            const history = this.priceHistory.get(tokenAddress);
            if (!history || history.length < 10) {
                return; // Need more price data
            }
            
            // Calculate average price over last 10 data points
            const recentPrices = history.slice(-10);
            const avgPrice = recentPrices.reduce((sum, item) => sum + item.price, 0) / recentPrices.length;
            const currentPrice = history[history.length - 1].price;
            
            // Check if current price is a dip
            const dipPercent = ((avgPrice - currentPrice) / avgPrice) * 100;
            
            if (dipPercent >= this.strategyConfig.dipBuyThreshold) {
                console.log(`📉 DIP detected for ${tokenAddress}: ${dipPercent.toFixed(2)}% below average`);
                
                // Emit DIP opportunity event (let the user decide)
                this.emit('dipOpportunity', {
                    tokenAddress,
                    currentPrice,
                    avgPrice,
                    dipPercent
                });
            }
            
        } catch (error) {
            console.error(`❌ Error checking DIP opportunity for ${tokenAddress}:`, error.message);
        }
    }

    // Get current token price by simulating a sell quote (ENHANCED)
    async getCurrentTokenPrice(tokenAddress) {
        try {
            // Use Sinclave Enhanced Engine for better price discovery if available
            if (this.sinclaveEngine) {
                try {
                    // Use HoldStation SDK for accurate price discovery
                    const quote = await this.sinclaveEngine.getHoldStationQuote(
                        tokenAddress, 
                        this.WLD_ADDRESS, 
                        1, // 1 token
                        '0x0000000000000000000000000000000000000001' // dummy receiver
                    );
                    
                    if (quote && quote.expectedOutput) {
                        const price = parseFloat(quote.expectedOutput);
                        return price > 0 ? price : 0;
                    }
                } catch (enhancedError) {
                    console.log(`⚠️ Enhanced price discovery failed: ${enhancedError.message}`);
                    // Fall back to standard method
                }
            }
            
            // Fallback to standard quote method
            const quote = await this.getSwapQuote(tokenAddress, this.WLD_ADDRESS, 1);
            return quote.pricePerToken;
        } catch (error) {
            console.error(`❌ Error getting current price for ${tokenAddress}:`, error.message);
            throw new Error(`No liquidity found for this pair`);
        }
    }

    // Get swap quote (ENHANCED WITH FALLBACK)
    async getSwapQuote(tokenIn, tokenOut, amountIn) {
        try {
            // Try enhanced engine first if available
            if (this.sinclaveEngine) {
                try {
                    const quote = await this.sinclaveEngine.getHoldStationQuote(
                        tokenIn, 
                        tokenOut, 
                        amountIn, 
                        '0x0000000000000000000000000000000000000001' // dummy receiver
                    );
                    
                    if (quote && quote.expectedOutput) {
                        const expectedOutput = parseFloat(quote.expectedOutput);
                        const pricePerToken = tokenOut === this.WLD_ADDRESS ? expectedOutput / amountIn : amountIn / expectedOutput;
                        
                        return {
                            amountIn,
                            expectedOutput,
                            pricePerToken,
                            expectedPrice: pricePerToken,
                            fee: 0.2, // HoldStation fee
                            slippage: 0.5, // Default slippage
                            provider: 'HoldStation'
                        };
                    }
                } catch (enhancedError) {
                    console.log(`⚠️ Enhanced quote failed: ${enhancedError.message}, using fallback`);
                }
            }
            
            // Fallback to standard engine
            const priceData = await this.tradingEngine.getTokenPrice(tokenOut);
            
            // Calculate expected output
            const expectedOutput = amountIn * priceData.price;
            const pricePerToken = tokenOut === this.WLD_ADDRESS ? priceData.price : 1 / priceData.price;
            
            return {
                amountIn,
                expectedOutput,
                pricePerToken,
                expectedPrice: priceData.price,
                fee: priceData.fee,
                slippage: 0, // Would be calculated based on liquidity
                provider: 'Uniswap'
            };
        } catch (error) {
            throw new Error(`Quote failed: ${error.message}`);
        }
    }

    // Calculate slippage
    calculateSlippage(expectedPrice, actualPrice) {
        return ((expectedPrice - actualPrice) / expectedPrice) * 100;
    }

    // Get strategy statistics
    getStrategyStats() {
        const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'open');
        const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'closed');
        
        const totalUnrealizedPnL = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
        const totalRealizedPnL = closedPositions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
        
        return {
            isRunning: this.isRunning,
            totalPositions: this.positions.size,
            openPositions: openPositions.length,
            closedPositions: closedPositions.length,
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            successRate: this.totalTrades > 0 ? (this.successfulTrades / this.totalTrades) * 100 : 0,
            totalUnrealizedPnL,
            totalRealizedPnL,
            totalPnL: totalUnrealizedPnL + totalRealizedPnL,
            config: this.strategyConfig
        };
    }

    // Get all positions
    getAllPositions() {
        return Array.from(this.positions.values());
    }

    // Get position by token address
    getPosition(tokenAddress) {
        return this.positions.get(tokenAddress);
    }

    // Update strategy configuration
    updateConfig(newConfig) {
        this.strategyConfig = { ...this.strategyConfig, ...newConfig };
        console.log('⚙️ Strategy configuration updated:', newConfig);
        this.emit('configUpdated', this.strategyConfig);
    }

    // Save positions to file
    async savePositions() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const positionsData = {
                positions: Object.fromEntries(this.positions),
                priceHistory: Object.fromEntries(this.priceHistory),
                stats: this.getStrategyStats(),
                lastUpdated: new Date().toISOString()
            };
            
            const filePath = path.join(__dirname, 'strategy_positions.json');
            fs.writeFileSync(filePath, JSON.stringify(positionsData, null, 2));
            
        } catch (error) {
            console.error('❌ Error saving positions:', error.message);
        }
    }

    // Load positions from file
    async loadPositions() {
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, 'strategy_positions.json');
            
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (data.positions) {
                    this.positions = new Map(Object.entries(data.positions));
                }
                
                if (data.priceHistory) {
                    this.priceHistory = new Map(Object.entries(data.priceHistory));
                }
                
                console.log(`📊 Loaded ${this.positions.size} positions from storage`);
            }
            
        } catch (error) {
            console.error('❌ Error loading positions:', error.message);
        }
    }

    // Close all open positions
    async closeAllPositions(reason = 'manual_close_all') {
        const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'open');
        
        console.log(`🔄 Closing ${openPositions.length} open positions...`);
        
        for (const position of openPositions) {
            try {
                await this.executeSellTrade(position.tokenAddress, reason);
                console.log(`✅ Closed position for ${position.tokenAddress}`);
            } catch (error) {
                console.error(`❌ Failed to close position for ${position.tokenAddress}:`, error.message);
            }
        }
        
        console.log('✅ All positions closed');
    }
}

module.exports = TradingStrategy;