const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// ============================================
// Yahoo Finance Ticker Mapping
// ============================================
function toYahooTicker(ticker) {
    const map = { 'BRK.B': 'BRK-B' };
    return map[ticker] || ticker;
}

function fromYahooTicker(yahooTicker) {
    const map = { 'BRK-B': 'BRK.B' };
    return map[yahooTicker] || yahooTicker;
}

const fs = require('fs');

// ============================================
// Stock Universe - Technology & Healthcare Only
// ============================================
let IN_MEMORY_STOCKS = { active: [], universe: [] };

function loadStocks() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'stocks.json'), 'utf8');
        IN_MEMORY_STOCKS = JSON.parse(data);
    } catch (e) {
        console.error('Failed to load stocks.json', e);
    }
}
loadStocks();

function saveStocks() {
    try {
        fs.writeFileSync(path.join(__dirname, 'stocks.json'), JSON.stringify(IN_MEMORY_STOCKS, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save stocks.json', e);
    }
}


// ============================================
// Yahoo Finance Auth (Crumb + Cookie)
// ============================================
// Yahoo's v7 quote API now requires authentication via crumb+cookie.
// We obtain these by first hitting fc.yahoo.com for cookies,
// then fetching the crumb token.

let yahooCrumb = null;
let yahooCookies = null;
let authTime = 0;
const AUTH_TTL = 5 * 60 * 1000; // Refresh auth every 5 minutes

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getYahooAuth() {
    if (yahooCrumb && yahooCookies && (Date.now() - authTime < AUTH_TTL)) {
        return { crumb: yahooCrumb, cookies: yahooCookies };
    }

    console.log('[Yahoo] Refreshing authentication...');

    // Step 1: Get cookies from fc.yahoo.com
    const cookieResp = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': YAHOO_UA },
        redirect: 'manual',
    });
    const setCookies = cookieResp.headers.getSetCookie?.() || [];
    // Extract cookie values (join them)
    const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: Get crumb
    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
            'User-Agent': YAHOO_UA,
            'Cookie': cookieStr,
        },
    });
    const crumb = await crumbResp.text();

    if (!crumb || crumb.includes('<!DOCTYPE')) {
        throw new Error('Failed to get Yahoo Finance crumb');
    }

    yahooCrumb = crumb;
    yahooCookies = cookieStr;
    authTime = Date.now();

    console.log('[Yahoo] Authentication successful');
    return { crumb, cookies: cookieStr };
}

// ============================================
// Cache
// ============================================
const athCache = {};
const ATH_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

let fullDataCache = null;
let fullDataCacheTime = 0;
const FULL_DATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// Yahoo Finance API Functions
// ============================================

/**
 * Fetch batch quotes using v7 API with crumb authentication.
 * Returns a map of ticker -> { price, mcap, name, fiftyTwoWeekHigh }
 */
async function fetchBatchQuotes(tickers) {
    const { crumb, cookies } = await getYahooAuth();
    const yahooTickers = tickers.map(toYahooTicker);

    // Yahoo allows up to ~200 symbols per request
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${yahooTickers.join(',')}&crumb=${encodeURIComponent(crumb)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': YAHOO_UA,
            'Cookie': cookies,
        },
    });

    if (!response.ok) {
        throw new Error(`Yahoo quote API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const results = data?.quoteResponse?.result || [];

    const quoteMap = {};
    for (const q of results) {
        const ourTicker = fromYahooTicker(q.symbol);
        quoteMap[ourTicker] = {
            price: q.regularMarketPrice ?? 0,
            mcap: (q.marketCap ?? 0) / 1e9, // Convert to billions
            name: q.longName || q.shortName || ourTicker,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
            previousClose: q.regularMarketPreviousClose ?? 0,
        };
    }
    return quoteMap;
}

/**
 * Fetch ATH and historical prices for a single ticker using the v8 chart API (no auth needed).
 * Uses monthly historical data to find the all-time high and past prices.
 */
function getPriceAtYearsAgo(timestamps, closes, yearsAgo) {
    const targetTime = Date.now() / 1000 - (yearsAgo * 365.25 * 24 * 3600);
    let closestIndex = -1;
    let minDiff = Infinity;

    for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null && !isNaN(closes[i])) {
            const diff = Math.abs(timestamps[i] - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }
    }
    // Only return if we actually have data that is reasonably close (e.g. within 60 days)
    if (closestIndex !== -1 && minDiff < 60 * 24 * 3600) {
        return closes[closestIndex];
    }
    return null;
}

async function fetchATH(ticker) {
    // Check cache first
    if (athCache[ticker] && (Date.now() - athCache[ticker].time < ATH_CACHE_TTL)) {
        return athCache[ticker];
    }

    const yahooTicker = toYahooTicker(ticker);
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=max&interval=1mo`;
        const response = await fetch(url, {
            headers: { 'User-Agent': YAHOO_UA },
        });

        if (!response.ok) {
            console.warn(`[Yahoo] Chart ${response.status} for ${ticker}`);
            return null;
        }

        const data = await response.json();
        const result = data?.chart?.result?.[0];
        if (!result) return null;

        const highs = result.indicators?.quote?.[0]?.high || [];
        const validHighs = highs.filter(h => h != null && !isNaN(h));
        if (validHighs.length === 0) return null;

        let ath = Math.max(...validHighs);

        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];

        const past1Y = getPriceAtYearsAgo(timestamps, closes, 1);
        const past3Y = getPriceAtYearsAgo(timestamps, closes, 3);
        const past5Y = getPriceAtYearsAgo(timestamps, closes, 5);
        const past10Y = getPriceAtYearsAgo(timestamps, closes, 10);

        // Check if current price exceeds monthly bar highs
        const currentPrice = result.meta?.regularMarketPrice ?? 0;
        ath = Math.max(ath, currentPrice);

        // Cache
        const dataObj = { value: ath, past1Y, past3Y, past5Y, past10Y, time: Date.now() };
        athCache[ticker] = dataObj;
        return dataObj;
    } catch (err) {
        console.error(`[Yahoo] ATH error for ${ticker}:`, err.message);
        return null;
    }
}

/**
 * Fetch ATHs for all tickers with concurrency control.
 */
async function fetchAllATHs(tickers, concurrency = 8) {
    const results = {};
    const queue = [...tickers];
    let completed = 0;

    async function worker() {
        while (queue.length > 0) {
            const ticker = queue.shift();
            if (!ticker) break;
            results[ticker] = await fetchATH(ticker);
            completed++;
            if (completed % 20 === 0) {
                console.log(`[API] ATH progress: ${completed}/${tickers.length}`);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, tickers.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

// ============================================
// API Endpoint
// ============================================
app.get('/api/stocks', async (req, res) => {
    try {
        // Return cached data if fresh
        if (fullDataCache && (Date.now() - fullDataCacheTime < FULL_DATA_CACHE_TTL)) {
            return res.json(fullDataCache);
        }

        console.log('[API] Fetching fresh stock data...');
        const startTime = Date.now();
        const activeTickers = new Set(IN_MEMORY_STOCKS.active);
        const ACTIVE_STOCK_UNIVERSE = IN_MEMORY_STOCKS.universe.filter(s => activeTickers.has(s.ticker));
        const tickers = ACTIVE_STOCK_UNIVERSE.map(s => s.ticker);

        // Fetch quotes (with market cap) and ATHs in parallel
        const [quoteMap, athMap] = await Promise.all([
            fetchBatchQuotes(tickers),
            fetchAllATHs(tickers, 8),
        ]);

        // Combine data
        const stocks = ACTIVE_STOCK_UNIVERSE.map(config => {
            const quote = quoteMap[config.ticker] || {};
            const chartData = athMap[config.ticker] || {};
            const chartATH = chartData.value;
            const past1Y = chartData.past1Y;
            const past3Y = chartData.past3Y;
            const past5Y = chartData.past5Y;
            const past10Y = chartData.past10Y;

            // Use chart ATH if available, otherwise fall back to 52-week high
            const ath = chartATH || quote.fiftyTwoWeekHigh || 0;

            // Use actual current price - if at a new ATH, ath should reflect it
            const price = quote.price || 0;
            const finalATH = Math.max(ath, price);

            if (price <= 0) return null;

            function computeCAGR(current, past, duration) {
                if (!past || past <= 0 || !current || current <= 0) return null;
                return (Math.pow(current / past, 1 / duration) - 1) * 100;
            }

            return {
                ticker: config.ticker,
                name: quote.name || config.ticker,
                sector: config.sector,
                cap: config.cap,
                price: Math.round(price * 100) / 100,
                previousClose: Math.round((quote.previousClose || 0) * 100) / 100,
                mcap: Math.round(quote.mcap * 10) / 10 || 0,
                ath: Math.round(finalATH * 100) / 100,
                cagr1Y: computeCAGR(price, past1Y, 1),
                cagr3Y: computeCAGR(price, past3Y, 3),
                cagr5Y: computeCAGR(price, past5Y, 5),
                cagr10Y: computeCAGR(price, past10Y, 10),
            };
        }).filter(Boolean);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[API] Fetched ${stocks.length}/${ACTIVE_STOCK_UNIVERSE.length} stocks in ${elapsed}s`);

        const responseData = {
            stocks,
            timestamp: new Date().toISOString(),
            count: stocks.length,
        };

        // Cache
        fullDataCache = responseData;
        fullDataCacheTime = Date.now();

        res.json(responseData);
    } catch (err) {
        console.error('[API] Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch stock data', message: err.message });
    }
});

// ============================================
// News API Endpoint
// ============================================
app.get('/api/news/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker;
        const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=5`;
        const response = await fetch(url, {
            headers: { 'User-Agent': YAHOO_UA }
        });

        if (!response.ok) {
            throw new Error(`Yahoo news API returned ${response.status}`);
        }

        const data = await response.json();
        const news = data.news || [];
        res.json({ news });
    } catch (err) {
        console.error(`[API] News Error for ${req.params.ticker}:`, err.message);
        res.status(500).json({ error: 'Failed to fetch news', message: err.message });
    }
});

// ============================================
// Serve Static Files & Start
// ============================================
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// API route to change the active state of a stock
app.post('/api/stocks/toggle', (req, res) => {
    try {
        const { ticker, active } = req.body;
        if (!ticker) {
            return res.status(400).json({ error: 'Ticker is required' });
        }

        let newActive = new Set(IN_MEMORY_STOCKS.active);
        if (active) {
            newActive.add(ticker);
        } else {
            newActive.delete(ticker);
        }

        IN_MEMORY_STOCKS.active = Array.from(newActive);
        saveStocks();
        fullDataCache = null; // invalidate cache

        res.json({ success: true, active: IN_MEMORY_STOCKS.active });
    } catch (err) {
        console.error('[API] Error in toggle:', err.message);
        res.status(500).json({ error: 'Failed to toggle stock' });
    }
});

app.get('/api/deactivated', (req, res) => {
    try {
        const activeTickers = new Set(IN_MEMORY_STOCKS.active);
        const deactivated = IN_MEMORY_STOCKS.universe.filter(s => !activeTickers.has(s.ticker));
        res.json({ stocks: deactivated });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 StockPulse server running at http://localhost:${PORT}\n`);
    console.log(`   Stock universe: ${IN_MEMORY_STOCKS.universe.length} total tickers, ${IN_MEMORY_STOCKS.active.length} active`);
    console.log(`   Auth: Yahoo crumb+cookie (auto-refreshing)`);
    console.log(`   ATH source: v8 Chart API (max range monthly)`);
    console.log(`   Quotes: v7 Quote API (price + market cap)\n`);
});
