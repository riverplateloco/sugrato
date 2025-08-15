const { ethers } = require('ethers');
const axios = require('axios');

class AdvancedTradingEngine {
    constructor(provider, config) {
        this.provider = provider;
        this.config = config;
        
        // Worldchain DEX addresses
        this.UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
        this.UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
        this.QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
        
        // WLD token on Worldchain
        this.WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';
        
        // ABI definitions
        this.ROUTER_ABI = [
            'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
            'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn)'
        ];
        
        this.QUOTER_ABI = [
            'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
            'function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)'
        ];
        
        this.ERC20_ABI = [
            'function balanceOf(address owner) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
            'function name() view returns (string)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function transfer(address to, uint256 amount) returns (bool)'
        ];
        
        // Initialize contracts
        this.routerContract = new ethers.Contract(this.UNISWAP_V3_ROUTER, this.ROUTER_ABI, this.provider);
        this.quoterContract = new ethers.Contract(this.QUOTER_V2, this.QUOTER_ABI, this.provider);
        
        // Fee tiers (0.05%, 0.3%, 1%)
        this.FEE_TIERS = [500, 3000, 10000];
        
        // Price cache for high-speed trading
        this.priceCache = new Map();
        this.lastPriceUpdate = new Map();
        
        // Transaction pool for batch processing
        this.transactionQueue = [];
        this.isProcessingQueue = false;
    }

    // High-speed price fetching with caching
    async getTokenPrice(tokenAddress, useCache = true) {
        const cacheKey = `${tokenAddress}-${this.WLD_ADDRESS}`;
        const now = Date.now();
        
        // Use cache if available and fresh (within 10 seconds)
        if (useCache && this.priceCache.has(cacheKey)) {
            const lastUpdate = this.lastPriceUpdate.get(cacheKey) || 0;
            if (now - lastUpdate < 10000) {
                return this.priceCache.get(cacheKey);
            }
        }
        
        try {
            // Try multiple fee tiers to find the best price
            const prices = await Promise.all(
                this.FEE_TIERS.map(async (fee) => {
                    try {
                        const amountIn = ethers.parseEther('1'); // 1 WLD
                        const quote = await this.quoterContract.quoteExactInputSingle(
                            this.WLD_ADDRESS,
                            tokenAddress,
                            fee,
                            amountIn,
                            0
                        );
                        return {
                            fee,
                            amountOut: quote,
                            price: Number(ethers.formatEther(quote))
                        };
                    } catch (error) {
                        return null;
                    }
                })
            );
            
            // Find the best price (highest output)
            const validPrices = prices.filter(p => p !== null);
            if (validPrices.length === 0) {
                throw new Error('No liquidity found for this pair');
            }
            
            const bestPrice = validPrices.reduce((best, current) => 
                current.amountOut > best.amountOut ? current : best
            );
            
            // Cache the result
            this.priceCache.set(cacheKey, bestPrice);
            this.lastPriceUpdate.set(cacheKey, now);
            
            return bestPrice;
            
        } catch (error) {
            console.error(`Error fetching price for ${tokenAddress}:`, error.message);
            throw error;
        }
    }

    // Get real-time token prices for multiple tokens
    async getBatchPrices(tokenAddresses) {
        const pricePromises = tokenAddresses.map(address => 
            this.getTokenPrice(address).catch(error => ({
                address,
                error: error.message,
                price: 0
            }))
        );
        
        const results = await Promise.all(pricePromises);
        return results.reduce((acc, result) => {
            if (result.error) {
                acc[result.address] = { error: result.error, price: 0 };
            } else {
                acc[result.address] = result;
            }
            return acc;
        }, {});
    }

    // Execute high-speed trade
    async executeSwap(wallet, tokenIn, tokenOut, amountIn, slippageTolerance = 0.5) {
        try {
            console.log(`🔄 Executing swap: ${amountIn} tokens`);
            
            // First check if liquidity exists for this pair
            const liquidityCheck = await this.checkPairLiquidity(tokenIn, tokenOut);
            
            if (!liquidityCheck.liquidityFound) {
                const tokenInSymbol = tokenIn === this.WLD_ADDRESS ? 'WLD' : 'TOKEN';
                const tokenOutSymbol = tokenOut === this.WLD_ADDRESS ? 'WLD' : 'TOKEN';
                throw new Error(`No liquidity available for ${tokenInSymbol}/${tokenOutSymbol} pair on Worldchain. This trading pair does not exist on Uniswap V3 or has no liquidity providers.`);
            }
            
            console.log(`✅ Liquidity confirmed for trading pair`);
            
            const signer = new ethers.Wallet(wallet.privateKey, this.provider);
            
            // Get token contracts
            const tokenInContract = new ethers.Contract(tokenIn, this.ERC20_ABI, signer);
            const tokenOutContract = new ethers.Contract(tokenOut, this.ERC20_ABI, signer);
            
            // Get token decimals
            const [tokenInDecimals, tokenOutDecimals] = await Promise.all([
                tokenInContract.decimals(),
                tokenOutContract.decimals()
            ]);
            
            // Convert amount to proper units
            const amountInWei = ethers.parseUnits(amountIn.toString(), tokenInDecimals);
            
            // Get quote for the swap using available fee tiers
            let bestQuote = null;
            let bestFee = 3000; // Default to 0.3%
            
            // Use only fee tiers that have liquidity
            const availableFeeTiers = liquidityCheck.liquidityInfo
                .filter(tier => tier.hasLiquidity)
                .map(tier => tier.fee);
            
            const feeTiersToTry = availableFeeTiers.length > 0 ? availableFeeTiers : this.FEE_TIERS;
            
            for (const fee of feeTiersToTry) {
                try {
                    const quote = await this.quoterContract.quoteExactInputSingle(
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
                    // Fee tier not available, continue
                    continue;
                }
            }
            
            if (!bestQuote) {
                const tokenInSymbol = tokenIn === this.WLD_ADDRESS ? 'WLD' : 'TOKEN';
                const tokenOutSymbol = tokenOut === this.WLD_ADDRESS ? 'WLD' : 'TOKEN';
                throw new Error(`Unable to get price quote for ${tokenInSymbol}/${tokenOutSymbol} pair. The pair may have insufficient liquidity for this trade amount (${amountIn} tokens).`);
            }
            
            console.log(`💰 Best quote found at ${(bestFee / 10000).toFixed(2)}% fee tier`);
            
            // Calculate minimum amount out with slippage
            const slippageMultiplier = BigInt(Math.floor((100 - slippageTolerance) * 100));
            const amountOutMinimum = (bestQuote * slippageMultiplier) / BigInt(10000);
            
            // Check and approve token allowance
            const currentAllowance = await tokenInContract.allowance(wallet.address, this.UNISWAP_V3_ROUTER);
            
            if (currentAllowance < amountInWei) {
                console.log('Approving token spend...');
                const approveTx = await tokenInContract.approve(this.UNISWAP_V3_ROUTER, ethers.MaxUint256);
                await approveTx.wait();
                console.log('Token approved successfully');
            }
            
            // Prepare swap parameters
            const swapParams = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: bestFee,
                recipient: wallet.address,
                deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
                amountIn: amountInWei,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            };
            
            // Execute the swap
            console.log('Executing swap...');
            const routerContractWithSigner = this.routerContract.connect(signer);
            
            // Estimate gas
            const gasEstimate = await routerContractWithSigner.exactInputSingle.estimateGas(swapParams);
            const gasLimit = gasEstimate * BigInt(120) / BigInt(100); // Add 20% buffer
            
            const swapTx = await routerContractWithSigner.exactInputSingle(swapParams, {
                gasLimit: gasLimit,
                gasPrice: ethers.parseUnits(this.config.gasPrice || '20', 'gwei')
            });
            
            console.log(`Transaction submitted: ${swapTx.hash}`);
            
            // Wait for confirmation
            const receipt = await swapTx.wait();
            
            return {
                success: true,
                txHash: swapTx.hash,
                gasUsed: receipt.gasUsed.toString(),
                amountIn: ethers.formatUnits(amountInWei, tokenInDecimals),
                amountOut: ethers.formatUnits(bestQuote, tokenOutDecimals),
                fee: bestFee,
                blockNumber: receipt.blockNumber
            };
            
        } catch (error) {
            console.error('Swap execution failed:', error);
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    // Batch execute multiple trades for high-speed operation
    async executeBatchSwaps(trades) {
        const results = [];
        
        // Process trades in parallel (up to 5 at a time to avoid rate limits)
        const batchSize = 5;
        for (let i = 0; i < trades.length; i += batchSize) {
            const batch = trades.slice(i, i + batchSize);
            const batchPromises = batch.map(trade => 
                this.executeSwap(
                    trade.wallet,
                    trade.tokenIn,
                    trade.tokenOut,
                    trade.amountIn,
                    trade.slippageTolerance
                ).catch(error => ({
                    success: false,
                    error: error.message,
                    trade: trade
                }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Small delay between batches to avoid overwhelming the network
            if (i + batchSize < trades.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }

    // Monitor price changes for arbitrage opportunities
    async monitorPriceChanges(tokenAddresses, callback, interval = 3000) {
        const monitor = async () => {
            try {
                const prices = await this.getBatchPrices(tokenAddresses);
                
                // Check for significant price changes
                for (const [address, priceData] of Object.entries(prices)) {
                    if (priceData.error) continue;
                    
                    const cacheKey = `monitor_${address}`;
                    const lastPrice = this.priceCache.get(cacheKey);
                    
                    if (lastPrice && lastPrice.price) {
                        const priceChange = ((priceData.price - lastPrice.price) / lastPrice.price) * 100;
                        
                        if (Math.abs(priceChange) > 1) { // 1% change threshold
                            callback({
                                tokenAddress: address,
                                oldPrice: lastPrice.price,
                                newPrice: priceData.price,
                                change: priceChange,
                                timestamp: Date.now()
                            });
                        }
                    }
                    
                    this.priceCache.set(cacheKey, priceData);
                }
                
            } catch (error) {
                console.error('Price monitoring error:', error.message);
            }
        };
        
        // Initial run
        await monitor();
        
        // Set up interval
        const intervalId = setInterval(monitor, interval);
        
        return () => clearInterval(intervalId);
    }

    // Get optimal trading route for better prices
    async getOptimalRoute(tokenIn, tokenOut, amountIn) {
        // For now, direct swap is used, but this can be extended to multi-hop routing
        const directRoute = await this.getTokenPrice(tokenOut);
        
        return {
            route: [tokenIn, tokenOut],
            expectedOutput: directRoute.amountOut,
            fee: directRoute.fee,
            priceImpact: 0 // Would calculate based on liquidity
        };
    }

    // Calculate slippage and price impact
    calculateSlippage(expectedPrice, actualPrice) {
        return ((expectedPrice - actualPrice) / expectedPrice) * 100;
    }

    // Check if liquidity exists for a trading pair
    async checkPairLiquidity(tokenA, tokenB) {
        try {
            console.log(`🔍 Checking liquidity for pair...`);
            
            const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
            let liquidityFound = false;
            const liquidityInfo = [];
            
            for (const fee of feeTiers) {
                try {
                    const quoterContract = new ethers.Contract(this.QUOTER_V2, this.QUOTER_ABI, this.provider);
                    
                    // Try a small test amount (0.001 tokens)
                    const testAmount = ethers.parseUnits('0.001', 18);
                    
                    const quote = await quoterContract.quoteExactInputSingle.staticCall({
                        tokenIn: tokenA,
                        tokenOut: tokenB,
                        fee: fee,
                        amountIn: testAmount,
                        sqrtPriceLimitX96: 0
                    });
                    
                    if (quote && quote > 0n) {
                        liquidityFound = true;
                        liquidityInfo.push({
                            fee: fee,
                            feePercent: (fee / 10000).toFixed(2),
                            hasLiquidity: true
                        });
                        console.log(`   ✅ Liquidity found at ${(fee / 10000).toFixed(2)}% fee tier`);
                    }
                } catch (error) {
                    liquidityInfo.push({
                        fee: fee,
                        feePercent: (fee / 10000).toFixed(2),
                        hasLiquidity: false,
                        error: error.message
                    });
                    console.log(`   ❌ No liquidity at ${(fee / 10000).toFixed(2)}% fee tier`);
                }
            }
            
            return {
                liquidityFound,
                liquidityInfo,
                tokenA,
                tokenB
            };
        } catch (error) {
            console.error('Error checking pair liquidity:', error.message);
            return {
                liquidityFound: false,
                error: error.message,
                tokenA,
                tokenB
            };
        }
    }

    // Get token information
    async getTokenInfo(tokenAddress) {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, this.ERC20_ABI, this.provider);
            
            const [name, symbol, decimals] = await Promise.all([
                tokenContract.name(),
                tokenContract.symbol(),
                tokenContract.decimals()
            ]);
            
            return {
                address: tokenAddress,
                name,
                symbol,
                decimals: Number(decimals)
            };
        } catch (error) {
            throw new Error(`Failed to get token info: ${error.message}`);
        }
    }

    // Get wallet token balances
    async getWalletBalances(walletAddress, tokenAddresses) {
        const balancePromises = tokenAddresses.map(async (tokenAddress) => {
            try {
                const tokenContract = new ethers.Contract(tokenAddress, this.ERC20_ABI, this.provider);
                const [balance, decimals, symbol] = await Promise.all([
                    tokenContract.balanceOf(walletAddress),
                    tokenContract.decimals(),
                    tokenContract.symbol()
                ]);
                
                return {
                    address: tokenAddress,
                    symbol,
                    balance: ethers.formatUnits(balance, decimals),
                    balanceWei: balance.toString()
                };
            } catch (error) {
                return {
                    address: tokenAddress,
                    error: error.message,
                    balance: '0'
                };
            }
        });
        
        return await Promise.all(balancePromises);
    }

    // Advanced portfolio analytics
    async getPortfolioAnalytics(walletAddress, tokenAddresses) {
        const balances = await this.getWalletBalances(walletAddress, tokenAddresses);
        const prices = await this.getBatchPrices(tokenAddresses);
        
        let totalValue = 0;
        const holdings = [];
        
        for (const balance of balances) {
            if (balance.error || parseFloat(balance.balance) === 0) continue;
            
            const price = prices[balance.address];
            if (price && !price.error) {
                const value = parseFloat(balance.balance) * price.price;
                totalValue += value;
                
                holdings.push({
                    ...balance,
                    price: price.price,
                    value: value,
                    percentage: 0 // Will be calculated after total
                });
            }
        }
        
        // Calculate percentages
        holdings.forEach(holding => {
            holding.percentage = (holding.value / totalValue) * 100;
        });
        
        return {
            totalValue,
            holdings: holdings.sort((a, b) => b.value - a.value),
            tokenCount: holdings.length,
            lastUpdated: Date.now()
        };
    }

    // Clear price cache
    clearCache() {
        this.priceCache.clear();
        this.lastPriceUpdate.clear();
    }

    // Get cache statistics
    getCacheStats() {
        return {
            cacheSize: this.priceCache.size,
            lastUpdateCount: this.lastPriceUpdate.size,
            oldestEntry: Math.min(...Array.from(this.lastPriceUpdate.values())),
            newestEntry: Math.max(...Array.from(this.lastPriceUpdate.values()))
        };
    }
}

module.exports = AdvancedTradingEngine;