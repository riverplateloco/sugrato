const { ethers } = require('ethers');
const axios = require('axios');

class SinclaveEnhancedTradingEngine {
    constructor(provider, config) {
        this.provider = provider;
        this.config = config;
        
        // Proven working contracts from sinclave.js analysis
        this.HOLDSTATION_CONTRACT = '0x0281c83C8F53314DFF3ebE24A90ee2412A2aA970';
        this.UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
        this.QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
        
        // WLD token on Worldchain
        this.WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';
        
        // Optimized RPC endpoints (from sinclave.js)
        this.PRIMARY_RPC = 'https://worldchain-mainnet.g.alchemy.com/public';
        this.FALLBACK_RPC = process.env.ALCHEMY_API_KEY ? 
            `https://worldchain-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : 
            'https://worldchain-mainnet.drpc.org/public';
        
        // SDK component caching for speed
        this.cachedSDK = null;
        this.cachedProvider = null;
        
        // ABI definitions
        this.ERC20_ABI = [
            'function balanceOf(address owner) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
            'function name() view returns (string)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function transfer(address to, uint256 amount) returns (bool)'
        ];
        
        this.ROUTER_ABI = [
            'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)'
        ];
        
        this.QUOTER_ABI = [
            'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
        ];
        
        // Proven gas settings from sinclave.js
        this.OPTIMAL_GAS_SETTINGS = {
            baseGasPrice: ethers.parseUnits('0.001', 'gwei'), // Proven working rate
            priorityFee: ethers.parseUnits('0.0001', 'gwei'), // Minimal priority
            gasLimit: 280000 // Proven optimal gas limit
        };
        
        // Fee tiers
        this.FEE_TIERS = [500, 3000, 10000];
        
        // Bad receiver addresses to fix (from sinclave.js analysis)
        this.BAD_RECEIVERS = [
            "43222f934ea5c593a060a6d46772fdbdc2e2cff0",
            "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0"
        ];
        
        // Performance metrics
        this.metrics = {
            totalTrades: 0,
            successfulTrades: 0,
            averageExecutionTime: 0,
            gasOptimizationSavings: 0
        };
        
        console.log('🚀 Sinclave Enhanced Trading Engine initialized with proven patterns');
        
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
    
    // Initialize optimized provider with caching (from sinclave.js)
    async initializeOptimizedProvider() {
        if (this.cachedProvider) {
            return this.cachedProvider;
        }
        
        try {
            // Primary: Use fast public endpoint
            const provider = new ethers.JsonRpcProvider(this.PRIMARY_RPC, {
                chainId: 480,
                name: "worldchain"
            });
            
            // Test connection
            await provider.getBlockNumber();
            this.cachedProvider = provider;
            this.log('✅ Connected to optimized public RPC endpoint', 'holdstation');
            return provider;
            
        } catch (error) {
            console.log('⚠️ Public endpoint failed, using authenticated fallback');
            
            // Fallback: Use authenticated endpoint
            const fallbackProvider = new ethers.JsonRpcProvider(this.FALLBACK_RPC, {
                chainId: 480,
                name: "worldchain"
            });
            
            this.cachedProvider = fallbackProvider;
            return fallbackProvider;
        }
    }
    
    // Apply proven routing fix (from sinclave.js)
    applyProvenRoutingFix(quote, userWallet) {
        console.log('🔧 Applying proven WorldChain routing fix...');
        
        // Force use of proven working contract
        const originalContract = quote.to;
        quote.to = this.HOLDSTATION_CONTRACT;
        
        if (originalContract !== this.HOLDSTATION_CONTRACT) {
            console.log(`📋 Contract override: ${originalContract} → ${this.HOLDSTATION_CONTRACT}`);
        }
        
        // Apply transaction data fix for bad receivers
        if (quote.data && typeof quote.data === 'string') {
            const correctReceiver = userWallet.toLowerCase().replace("0x", "");
            let routingFixApplied = false;
            
            for (const badReceiver of this.BAD_RECEIVERS) {
                const cleanBadReceiver = badReceiver.replace("0x", "").toLowerCase();
                if (quote.data.toLowerCase().includes(cleanBadReceiver)) {
                    console.log(`🚨 Detected bad receiver: ${badReceiver}`);
                    
                    const originalData = quote.data;
                    quote.data = quote.data.replace(
                        new RegExp(cleanBadReceiver, 'gi'),
                        correctReceiver
                    );
                    
                    routingFixApplied = true;
                    console.log(`✅ Routing fixed: ${badReceiver} → ${userWallet}`);
                    console.log(`📊 Data integrity: ${originalData.length} → ${quote.data.length} bytes`);
                    break;
                }
            }
            
            if (!routingFixApplied) {
                console.log('✅ Transaction data verified - no bad receivers found');
            }
        }
        
        return quote;
    }
    
    // Calculate optimized gas settings based on sinclave.js proven patterns
    calculateOptimizedGasSettings(networkGasPrice, isReplacementTx = false) {
        // ULTRA FAST EXECUTION: Aggressive gas settings for sub-3000ms execution
        const baseGasPrice = ethers.parseUnits('0.005', 'gwei'); // Increased from 0.002 for ultra speed
        const priorityFee = ethers.parseUnits('0.002', 'gwei'); // Increased from 0.0005 for ultra speed
        
        // Use network gas if higher than our proven base (but prioritize speed)
        const networkGas = networkGasPrice || baseGasPrice;
        let finalGasPrice = networkGas > baseGasPrice ? networkGas : baseGasPrice;
        let finalPriorityFee = priorityFee;
        
        // ULTRA SPEED BOOST: Add 50% buffer for ultra-fast execution
        finalGasPrice = finalGasPrice * BigInt(150) / BigInt(100); // 50% boost
        finalPriorityFee = finalPriorityFee * BigInt(150) / BigInt(100); // 50% boost
        
        // For replacement transactions, increase by 25% for immediate processing
        if (isReplacementTx) {
            finalPriorityFee = finalPriorityFee * BigInt(125) / BigInt(100); // 25% increase
            finalGasPrice = finalGasPrice * BigInt(125) / BigInt(100);
        }
        
        return {
            maxFeePerGas: finalGasPrice + finalPriorityFee,
            maxPriorityFeePerGas: finalPriorityFee,
            gasLimit: 350000 // Increased from 300000 for guaranteed execution
        };
    }
    
    // Enhanced swap execution with sinclave.js patterns (OPTIMIZED FOR SPEED)
    async executeOptimizedSwap(wallet, tokenIn, tokenOut, amountIn, slippageTolerance = 1) {
        const startTime = Date.now();
        console.log(`🚀 Executing optimized swap: ${amountIn} tokens`);
        
        try {
            // Track total trades
            this.metrics.totalTrades++;
            
            // Step 1: Initialize optimized provider (CACHED)
            const provider = await this.initializeOptimizedProvider();
            const signer = new ethers.Wallet(wallet.privateKey, provider);
            
            // Step 2: Parallel network checks (OPTIMIZED - removed individual logging)
            const [ethBalance, feeData, currentBlock] = await Promise.all([
                provider.getBalance(signer.address),
                provider.getFeeData(),
                provider.getBlockNumber()
            ]);
            
            // Quick status update (reduced logging)
            console.log(`💰 ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);
            console.log(`⛽ Network Gas: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
            console.log(`📦 Block: ${currentBlock}`);
            
            // Step 3: Parallel token setup (FAST PATH)
            const tokenInContract = new ethers.Contract(tokenIn, this.ERC20_ABI, signer);
            const tokenOutContract = new ethers.Contract(tokenOut, this.ERC20_ABI, provider);
            
            // Get all token info in parallel + approval check
            const [tokenInDecimals, tokenOutDecimals, tokenInBalance, tokenOutBalanceBefore] = await Promise.all([
                tokenInContract.decimals(),
                tokenOutContract.decimals(),
                tokenInContract.balanceOf(signer.address),
                tokenOutContract.balanceOf(signer.address)
            ]);
            
            const amountInWei = ethers.parseUnits(amountIn.toString(), tokenInDecimals);
            
            // Quick balance check
            console.log(`📊 Token In Balance: ${ethers.formatUnits(tokenInBalance, tokenInDecimals)}`);
            console.log(`📊 Token Out Balance (Before): ${ethers.formatUnits(tokenOutBalanceBefore, tokenOutDecimals)}`);
            
            if (tokenInBalance < amountInWei) {
                throw new Error(`Insufficient balance. Have: ${ethers.formatUnits(tokenInBalance, tokenInDecimals)}, Need: ${amountIn}`);
            }
            
            // Step 4: Get optimized quote using HoldStation SDK (FAST PATH)
            console.log('📈 Getting optimized swap quote...');
            
            let quote;
            let useHoldStationSDK = false;
            
            try {
                // Attempt to use HoldStation SDK (like sinclave.js)
                quote = await this.getHoldStationQuote(tokenIn, tokenOut, amountIn, signer.address);
                useHoldStationSDK = true;
                console.log('✅ Using HoldStation SDK for optimal routing');
            } catch (error) {
                console.log(`⚠️ HoldStation SDK failed: ${error.message}`);
                console.log('🔄 Fallback: Using Uniswap V3');
                quote = await this.getUniswapQuote(tokenIn, tokenOut, amountInWei);
                useHoldStationSDK = false;
            }
            
            if (!quote || !quote.to) {
                throw new Error('No swap quote available for this trading pair');
            }
            
            console.log(`💱 Quote received: ${quote.expectedOutput || quote.addons?.outAmount || 'Unknown'} tokens expected`);
            
            // Step 5: Apply proven routing fix
            const fixedQuote = this.applyProvenRoutingFix(quote, signer.address);
            
            // Step 6: Optimize gas settings (CACHED VALUES) - ULTRA FAST
            const gasSettings = this.calculateOptimizedGasSettings(feeData.gasPrice);
            // Reduced logging for speed
            
            // Step 7: ULTRA FAST APPROVAL - Parallel check and approve
            const currentAllowance = await tokenInContract.allowance(signer.address, fixedQuote.to);
            const needsApproval = currentAllowance < amountInWei;
            
            if (needsApproval) {
                // Minimal logging for speed
                console.log('🔓 Approving token spending...');
                
                const approveTx = await tokenInContract.approve(fixedQuote.to, amountInWei, {
                    gasLimit: 60000,
                    maxFeePerGas: gasSettings.maxFeePerGas,
                    maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas
                });
                
                // Reduced logging
                console.log(`📝 Approval TX: ${approveTx.hash}`);
                
                // ULTRA FAST: No confirmation wait - proceed immediately
                // const approvalReceipt = await approveTx.wait(1);
                console.log(`✅ Approval sent, proceeding to swap`);
            } else {
                console.log('✅ Already approved - proceeding to swap');
            }
            
            // Step 8: Execute optimized swap (ULTRA FAST EXECUTION)
            console.log('🔄 Executing optimized swap with proven patterns...');
            
            let swapTx;
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    // Use replacement transaction gas settings if this is a retry
                    const finalGasSettings = retryCount > 0 ? 
                        this.calculateOptimizedGasSettings(feeData.gasPrice, true) : gasSettings;
                    
                    if (retryCount > 0) {
                        console.log(`🔄 Retry attempt ${retryCount} with higher gas prices...`);
                    }
                    
                    swapTx = await signer.sendTransaction({
                        to: fixedQuote.to,
                        data: fixedQuote.data,
                        value: fixedQuote.value || '0',
                        gasLimit: finalGasSettings.gasLimit,
                        maxFeePerGas: finalGasSettings.maxFeePerGas,
                        maxPriorityFeePerGas: finalGasSettings.maxPriorityFeePerGas
                    });
                    
                    break; // Success, exit retry loop
                    
                } catch (txError) {
                    if (txError.code === 'REPLACEMENT_UNDERPRICED' && retryCount < maxRetries) {
                        console.log(`⚠️ Replacement fee too low, retrying with higher gas (attempt ${retryCount + 1}/${maxRetries + 1})`);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms to 500ms
                        continue;
                    } else {
                        throw txError; // Re-throw if not a replacement error or max retries reached
                    }
                }
            }
            
            console.log(`🚀 Swap TX sent: ${swapTx.hash}`);
            console.log(`🔗 WorldScan: https://worldscan.org/tx/${swapTx.hash}`);
            
            // ULTRA FAST: Minimal confirmation wait
            const receipt = await swapTx.wait(1);
            
            const executionTime = Date.now() - startTime;
            
            if (receipt.status === 1) {
                console.log(`✅ Swap confirmed in block ${receipt.blockNumber}`);
                console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
                console.log(`⚡ Total execution time: ${executionTime}ms`);
                
                // MAJOR SPEED OPTIMIZATION: Skip balance check delay entirely for speed
                // The transaction is confirmed, balances are updated immediately
                
                // Step 9: Check final balances (PARALLEL - NO DELAY)
                const [tokenInBalanceAfter, tokenOutBalanceAfter] = await Promise.all([
                    tokenInContract.balanceOf(signer.address),
                    tokenOutContract.balanceOf(signer.address)
                ]);
                
                const tokensSpent = tokenInBalance - tokenInBalanceAfter;
                const tokensReceived = tokenOutBalanceAfter - tokenOutBalanceBefore;
                
                console.log('🎉 OPTIMIZED SWAP SUCCESS!');
                
                // Calculate exchange rate (streamlined)
                if (tokensSpent > 0 && tokensReceived > 0) {
                    const tokensSpentFormatted = parseFloat(ethers.formatUnits(tokensSpent, tokenInDecimals));
                    const tokensReceivedFormatted = parseFloat(ethers.formatUnits(tokensReceived, tokenOutDecimals));
                    
                    if (tokensSpentFormatted > 0) {
                        const rate = tokensReceivedFormatted / tokensSpentFormatted;
                        console.log(`📊 Exchange Rate: 1 token = ${rate.toFixed(6)} tokens`);
                    }
                }
                
                // Performance feedback - NEW ULTRA-FAST TARGETS
                if (executionTime < 2000) {
                    console.log(`🚀 ULTRA-FAST EXECUTION: ${executionTime}ms - EXCELLENT!`);
                } else if (executionTime < 4000) {
                    console.log(`⚡ FAST EXECUTION: ${executionTime}ms - GOOD`);
                } else if (executionTime < 8000) {
                    console.log(`⏳ STANDARD EXECUTION: ${executionTime}ms`);
                } else {
                    console.log(`🐌 SLOW EXECUTION: ${executionTime}ms - NEEDS OPTIMIZATION`);
                }
                
                // Update metrics
                this.metrics.successfulTrades++;
                this.metrics.totalExecutionTime += executionTime;
                
                return {
                    success: true,
                    transactionHash: swapTx.hash,
                    gasUsed: receipt.gasUsed.toString(),
                    executionTime: executionTime,
                    tokensSpent: ethers.formatUnits(tokensSpent, tokenInDecimals),
                    tokensReceived: ethers.formatUnits(tokensReceived, tokenOutDecimals),
                    blockNumber: receipt.blockNumber,
                    useHoldStationSDK: useHoldStationSDK,
                    amountOut: ethers.formatUnits(tokensReceived, tokenOutDecimals)
                };
            } else {
                throw new Error('Transaction failed');
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.metrics.failedTrades++;
            console.error(`❌ OPTIMIZED SWAP FAILED after ${executionTime}ms: ${error.message}`);
            throw new Error(`Enhanced swap execution failed: ${error.message}`);
        }
    }
    
    // Analyze liquidity depth to find maximum tradeable amount with target slippage
    async analyzeLiquidityDepth(tokenIn, tokenOut, targetSlippage = 1.0) {
        try {
            console.log(`🔍 Analyzing liquidity depth for ${targetSlippage}% slippage...`);
            
            // Test different amounts to find the maximum with acceptable slippage
            const testAmounts = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]; // WLD amounts to test
            const results = [];
            
            for (const amount of testAmounts) {
                try {
                    const quote = await this.getHoldStationQuote(tokenIn, tokenOut, amount, '0x0000000000000000000000000000000000000001');
                    
                    if (quote && quote.expectedOutput) {
                        const expectedRate = parseFloat(quote.expectedOutput) / amount; // tokens per WLD
                        
                        // Get a small reference quote to calculate slippage
                        const refQuote = await this.getHoldStationQuote(tokenIn, tokenOut, 0.01, '0x0000000000000000000000000000000000000001');
                        const refRate = parseFloat(refQuote.expectedOutput) / 0.01;
                        
                        // Calculate slippage: (referenceRate - actualRate) / referenceRate * 100
                        const slippage = ((refRate - expectedRate) / refRate) * 100;
                        
                        results.push({
                            amount: amount,
                            expectedOutput: parseFloat(quote.expectedOutput),
                            rate: expectedRate,
                            slippage: slippage,
                            acceptable: slippage <= targetSlippage
                        });
                        
                        console.log(`   📊 ${amount} WLD: ${expectedRate.toFixed(8)} rate, ${slippage.toFixed(2)}% slippage ${slippage <= targetSlippage ? '✅' : '❌'}`);
                        
                        // If slippage exceeds target, we've found our limit
                        if (slippage > targetSlippage) {
                            break;
                        }
                    }
                } catch (error) {
                    console.log(`   ❌ ${amount} WLD: Failed to get quote`);
                    break;
                }
            }
            
            // Find the maximum acceptable amount
            const acceptableResults = results.filter(r => r.acceptable);
            const maxAcceptableAmount = acceptableResults.length > 0 ? 
                Math.max(...acceptableResults.map(r => r.amount)) : 0.01;
            
            console.log(`🎯 Maximum tradeable amount: ${maxAcceptableAmount} WLD (≤${targetSlippage}% slippage)`);
            
            return {
                maxAmount: maxAcceptableAmount,
                results: results,
                recommendation: maxAcceptableAmount
            };
            
        } catch (error) {
            console.log(`❌ Liquidity analysis failed: ${error.message}`);
            return {
                maxAmount: 0.01, // Conservative fallback
                results: [],
                recommendation: 0.01
            };
        }
    }

    // Get quote using HoldStation SDK (OPTIMIZED WITH CACHING)
    async getHoldStationQuote(tokenIn, tokenOut, amountIn, receiver) {
        try {
            this.log('🚀 Attempting to initialize HoldStation SDK...', 'holdstation');
            
            // OPTIMIZATION: Cache SDK components to avoid re-initialization
            if (!this.cachedSDK) {
                // Try to dynamically import HoldStation SDK
                const { Client, Multicall3 } = await import("@holdstation/worldchain-ethers-v6");
                const { 
                    config, 
                    HoldSo, 
                    inmemoryTokenStorage, 
                    SwapHelper, 
                    TokenProvider, 
                    ZeroX,
                    setPartnerCode 
                } = await import("@holdstation/worldchain-sdk");

                // Set partner code (like sinclave.js)
                try {
                    setPartnerCode("COCOLISO_PREMIUM_2025");
                    this.log('✅ Partner code set for HoldStation SDK', 'holdstation');
                } catch (error) {
                    this.log('⚠️ Partner code already set', 'holdstation');
                }

                // Initialize client and components (CACHED)
                const provider = await this.initializeOptimizedProvider();
                const client = new Client(provider);
                config.client = client;
                config.multicall3 = new Multicall3(provider);

                // Initialize swap helper with providers
                const swapHelper = new SwapHelper(client, {
                    tokenStorage: inmemoryTokenStorage,
                });

                const tokenProvider = new TokenProvider({ client, multicall3: config.multicall3 });
                const zeroX = new ZeroX(tokenProvider, inmemoryTokenStorage);
                const worldswap = new HoldSo(tokenProvider, inmemoryTokenStorage);
                
                // Load swap providers
                swapHelper.load(zeroX);
                swapHelper.load(worldswap);

                // Cache the initialized components
                this.cachedSDK = {
                    swapHelper,
                    client,
                    tokenProvider,
                    zeroX,
                    worldswap
                };

                this.log('✅ HoldStation SDK initialized successfully', 'holdstation');
            } else {
                this.log('✅ Using cached HoldStation SDK components', 'holdstation');
            }

            // Get swap quote using cached HoldStation SDK (FAST)
            const params = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn.toString(),
                slippage: "0.5", // Optimized slippage
                fee: "0.2",      // Optimized fee
                receiver: receiver
            };
            
            this.log(`📊 Getting HoldStation quote for ${params.amountIn} tokens...`, 'holdstation');
            const quote = await this.cachedSDK.swapHelper.estimate.quote(params);

            if (!quote || !quote.to) {
                throw new Error('HoldStation SDK returned no quote for this pair');
            }

            this.log('✅ HoldStation quote received successfully', 'holdstation');
            
            return {
                to: quote.to,
                data: quote.data,
                value: quote.value || '0',
                expectedOutput: quote.addons?.outAmount || 'Unknown',
                gasEstimate: quote.gasEstimate,
                addons: quote.addons, // Include all addons for better info
                provider: 'HoldStation'
            };

        } catch (error) {
            // More specific error handling
            if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('Cannot resolve module')) {
                console.log('⚠️ HoldStation SDK packages not installed');
                console.log('💡 To use HoldStation SDK, install: ./install-holdstation-sdk.sh');
                throw new Error('HoldStation SDK packages not found - install manually or use fallback');
            } else {
                console.log(`❌ HoldStation SDK error: ${error.message}`);
                throw new Error(`HoldStation SDK failed: ${error.message}`);
            }
        }
    }
    
    // Fallback to Uniswap V3 quote
    async getUniswapQuote(tokenIn, tokenOut, amountInWei) {
        const quoterContract = new ethers.Contract(this.QUOTER_V2, this.QUOTER_ABI, this.provider);
        
        let bestQuote = null;
        let bestFee = 3000;
        
        for (const fee of this.FEE_TIERS) {
            try {
                const quote = await quoterContract.quoteExactInputSingle.staticCall(
                    tokenIn,
                    tokenOut,
                    fee,
                    amountInWei,
                    0
                );
                
                if (!bestQuote || quote > bestQuote) {
                    bestQuote = quote;
                    bestFee = fee;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!bestQuote) {
            throw new Error('No liquidity available for this pair');
        }
        
        // Create Uniswap transaction data
        const routerContract = new ethers.Contract(this.UNISWAP_V3_ROUTER, this.ROUTER_ABI, this.provider);
        const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
        
        const params = {
            tokenIn,
            tokenOut,
            fee: bestFee,
            recipient: this.provider.getSigner().address,
            deadline,
            amountIn: amountInWei,
            amountOutMinimum: (bestQuote * BigInt(995)) / BigInt(1000), // 0.5% slippage
            sqrtPriceLimitX96: 0
        };
        
        const data = routerContract.interface.encodeFunctionData('exactInputSingle', [params]);
        
        return {
            to: this.UNISWAP_V3_ROUTER,
            data: data,
            value: '0',
            expectedOutput: ethers.formatEther(bestQuote)
        };
    }
    
    // Get performance metrics (ENHANCED)
    getMetrics() {
        const successRate = this.metrics.totalTrades > 0 ? 
            (this.metrics.successfulTrades / this.metrics.totalTrades * 100).toFixed(2) : 0;
        
        const averageExecutionTime = this.metrics.successfulTrades > 0 ?
            Math.round(this.metrics.totalExecutionTime / this.metrics.successfulTrades) : 0;
        
        return {
            totalTrades: this.metrics.totalTrades,
            successfulTrades: this.metrics.successfulTrades,
            failedTrades: this.metrics.failedTrades,
            successRate: `${successRate}%`,
            averageExecutionTime: `${averageExecutionTime}ms`,
            totalExecutionTime: `${this.metrics.totalExecutionTime}ms`,
            sdkCacheHits: this.cachedSDK ? 'Cached' : 'Not Cached',
            providerCacheHits: this.cachedProvider ? 'Cached' : 'Not Cached'
        };
    }
    
    // Reset metrics
    resetMetrics() {
        this.metrics = {
            totalTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalExecutionTime: 0
        };
        console.log('📊 Performance metrics reset');
    }
    
    // Get optimization status
    getOptimizationStatus() {
        return {
            sdkCached: !!this.cachedSDK,
            providerCached: !!this.cachedProvider,
            optimizationsActive: [
                this.cachedSDK ? '✅ SDK Components Cached' : '❌ SDK Not Cached',
                this.cachedProvider ? '✅ RPC Provider Cached' : '❌ Provider Not Cached',
                '✅ Parallel Operations Enabled',
                '✅ Reduced Balance Check Delay (1s)',
                '✅ Optimized Gas Settings',
                '✅ Proven Routing Fix Applied'
            ]
        };
    }
}

module.exports = SinclaveEnhancedTradingEngine;