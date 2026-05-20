// ============================================
// StockPulse - US Mega & Large Cap Stock Tracker
// Live data from Yahoo Finance
// ============================================

let stocksData = [];

// ============================================
// Utility Functions
// ============================================

function formatPrice(price) {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(mcap) {
    if (mcap >= 1000) {
        return '$' + (mcap / 1000).toFixed(2) + 'T';
    }
    return '$' + mcap.toFixed(0) + 'B';
}

function calcDrawdown(price, ath) {
    if (ath <= 0) return 0;
    return ((ath - price) / ath) * 100;
}

function getDrawdownLevel(pct) {
    if (pct <= 0) return 0;      // At ATH
    if (pct <= 5) return 1;      // Near ATH
    if (pct <= 20) return 2;     // Moderate
    return 3;                     // Deep
}

function getDrawdownClass(pct) {
    if (pct <= 0) return 'at-ath';
    if (pct <= 5) return 'near-ath';
    if (pct <= 20) return 'moderate';
    return 'deep';
}

function getAvatarColor(sector) {
    const colors = {
        'Technology': { bg: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' },
        'Financials': { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' },
        'Healthcare': { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e' },
        'Consumer Cyclical': { bg: 'rgba(251, 146, 60, 0.12)', color: '#fb923c' },
        'Consumer Defensive': { bg: 'rgba(234, 179, 8, 0.12)', color: '#eab308' },
        'Energy': { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' },
        'Industrials': { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' },
        'Communication': { bg: 'rgba(20, 184, 166, 0.12)', color: '#14b8a6' },
        'Materials': { bg: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' },
        'Utilities': { bg: 'rgba(132, 204, 22, 0.12)', color: '#84cc16' },
        'Real Estate': { bg: 'rgba(217, 119, 6, 0.12)', color: '#d97706' },
    };
    return colors[sector] || { bg: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8' };
}

// ============================================
// State
// ============================================
let currentFilter = 'all';
let currentSort = 'marketcap';
let sortAscending = false;
let searchQuery = '';
let shortlistedStocks = [];

// ============================================
// DOM Elements
// ============================================
const stockTableBody = document.getElementById('stockTableBody');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const sortOrderBtn = document.getElementById('sortOrderBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');

// Deactivated Modals
const deactivatedModalOverlay = document.getElementById('deactivatedModalOverlay');
const deactivatedModalClose = document.getElementById('deactivatedModalClose');
const deactivatedBtn = document.getElementById('deactivatedBtn');
const deactivateStockBtn = document.getElementById('deactivateStockBtn');
const shortlistStockBtn = document.getElementById('shortlistStockBtn');
const deactivatedList = document.getElementById('deactivatedList');
const deactivatedEmpty = document.getElementById('deactivatedEmpty');

// Add Stock Modal
const addStockBtn = document.getElementById('addStockBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const addStockModalOverlay = document.getElementById('addStockModalOverlay');
const addStockModalClose = document.getElementById('addStockModalClose');
const addStockForm = document.getElementById('addStockForm');
const submitAddStockBtn = document.getElementById('submitAddStockBtn');

let activeModalTicker = null;

// Search & Filter states
const noResults = document.getElementById('noResults');
const tableContainer = document.querySelector('.table-container');
const lastUpdatedEl = document.getElementById('lastUpdated');

// ============================================
// Data Fetching
// ============================================

async function fetchShortlistedStocks() {
    try {
        const res = await fetch('/api/shortlisted');
        if (res.ok) {
            const data = await res.json();
            shortlistedStocks = data.shortlisted || [];
            if (currentFilter === 'shortlisted') {
                renderTable();
            }
        }
    } catch (e) {
        console.error('Failed to load shortlisted stocks', e);
    }
}

async function fetchStockData(silent = false) {
    if (!silent) showLoading(true);
    try {
        const response = await fetch('/api/stocks');
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();

        if (data.error) {
            throw new Error(data.message || data.error);
        }

        stocksData = data.stocks || [];
        stocksData.forEach(s => {
            if (s.mcap >= 200) s.cap = 'mega';
            else if (s.mcap >= 10) s.cap = 'large';
            else if (s.mcap >= 2) s.cap = 'mid';
            else if (s.mcap >= 0.3) s.cap = 'small';
            else if (s.mcap >= 0.05) s.cap = 'micro';
            else s.cap = 'nano';
        });

        // Update last-updated timestamp
        if (data.timestamp) {
            const ts = new Date(data.timestamp);
            lastUpdatedEl.textContent = `Updated: ${ts.toLocaleString()}`;
        }

        renderFilters();
        renderTable();
    } catch (err) {
        console.error('Failed to fetch stock data:', err);
        if (!silent) showError(err.message);
    } finally {
        if (!silent) showLoading(false);
    }
}

function showLoading(visible) {
    const loader = document.getElementById('loadingOverlay');
    if (loader) {
        loader.style.display = visible ? 'flex' : 'none';
    }
}

function showError(message) {
    stockTableBody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center; padding:60px 20px; color:var(--text-muted);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom:16px; display:block; margin-left:auto; margin-right:auto; color:var(--red-400);">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:8px;">Failed to load stock data</p>
                <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:20px;">${message}</p>
                <button onclick="fetchStockData()" style="padding:10px 24px; background:var(--accent); color:white; border:none; border-radius:var(--radius-sm); cursor:pointer; font-weight:600; font-family:var(--font-family);">
                    Retry
                </button>
            </td>
        </tr>
    `;
}

// ============================================
// Core Rendering
// ============================================

function getFilteredAndSortedStocks() {
    let stocks = stocksData.map(s => ({
        ...s,
        drawdown: calcDrawdown(s.price, s.ath),
        drawdownLevel: getDrawdownLevel(calcDrawdown(s.price, s.ath))
    }));

    // Apply search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        stocks = stocks.filter(s =>
            s.ticker.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.sector.toLowerCase().includes(q)
        );
    }

    // Apply filter
    switch (currentFilter) {
        case 'ath':
            stocks = stocks.filter(s => s.drawdown <= 0);
            break;
        case 'near':
            stocks = stocks.filter(s => s.drawdown > 0 && s.drawdown <= 5);
            break;
        case 'deep':
            stocks = stocks.filter(s => s.drawdown > 20);
            break;
        case 'below200dma':
            stocks = stocks.filter(s => s.below200DMA === true);
            break;
        case 'shortlisted':
            stocks = stocks.filter(s => shortlistedStocks.includes(s.ticker));
            break;
        default:
            if (currentFilter.startsWith('sector:')) {
                const sectorStr = currentFilter.replace('sector:', '');
                stocks = stocks.filter(s => s.sector === sectorStr);
            } else if (currentFilter.startsWith('cap:')) {
                const capStr = currentFilter.replace('cap:', '');
                stocks = stocks.filter(s => s.cap === capStr);
            }
            break;
    }

    // Apply sort
    stocks.sort((a, b) => {
        let comparison = 0;
        switch (currentSort) {
            case 'marketcap':
                comparison = b.mcap - a.mcap;
                break;
            case 'drawdown':
                comparison = a.drawdown - b.drawdown;
                break;
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'sector':
                comparison = a.sector.localeCompare(b.sector);
                break;
            case 'price':
                comparison = b.price - a.price;
                break;
            case 'cagr5Y':
                comparison = (b.cagr5Y ?? -Infinity) - (a.cagr5Y ?? -Infinity);
                break;
            case 'cagr10Y':
                comparison = (b.cagr10Y ?? -Infinity) - (a.cagr10Y ?? -Infinity);
                break;
        }
        return sortAscending ? -comparison : comparison;
    });

    return stocks;
}

function renderFilters() {
    const filterGroup = document.getElementById('filterGroupPrimary');
    if (!filterGroup) return;

    // Get unique sectors
    const sectors = [...new Set(stocksData.map(s => s.sector))].filter(Boolean).sort();

    // Get unique caps
    const caps = [...new Set(stocksData.map(s => s.cap))].filter(Boolean);
    const capOrder = ['mega', 'large', 'mid', 'small', 'micro', 'nano'];
    caps.sort((a, b) => {
        let indexA = capOrder.indexOf(a.toLowerCase());
        let indexB = capOrder.indexOf(b.toLowerCase());
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        return indexA - indexB;
    });

    const isSectorFilter = currentFilter.startsWith('sector:');
    if (isSectorFilter && !sectors.includes(currentFilter.replace('sector:', ''))) {
        currentFilter = 'all'; // Reset if sector no longer exists
    }

    const isCapFilter = currentFilter.startsWith('cap:');
    if (isCapFilter && !caps.includes(currentFilter.replace('cap:', ''))) {
        currentFilter = 'all'; // Reset if cap no longer exists
    }

    let html = `<button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all" id="filterAll">All</button>`;
    
    sectors.forEach(sector => {
        const filterVal = 'sector:' + sector;
        const isActive = currentFilter === filterVal;
        html += `<button class="filter-btn ${isActive ? 'active' : ''}" data-filter="${filterVal}">${sector}</button>`;
    });

    caps.forEach(cap => {
        const filterVal = 'cap:' + cap;
        const isActive = currentFilter === filterVal;
        const capLabel = cap.charAt(0).toUpperCase() + cap.slice(1) + ' Cap';
        html += `<button class="filter-btn ${isActive ? 'active' : ''}" data-filter="${filterVal}">${capLabel}</button>`;
    });

    html += `<button class="filter-btn ${currentFilter === 'shortlisted' ? 'active' : ''}" data-filter="shortlisted" id="filterShortlisted">Shortlisted</button>`;

    filterGroup.innerHTML = html;
}

function renderTable() {
    const stocks = getFilteredAndSortedStocks();

    if (stocks.length === 0) {
        tableContainer.style.display = 'none';
        noResults.style.display = 'flex';
        return;
    }

    tableContainer.style.display = 'block';
    noResults.style.display = 'none';

    stockTableBody.innerHTML = stocks.map((stock, index) => {
        const drawdown = stock.drawdown;
        const drawdownClass = getDrawdownClass(drawdown);
        const level = stock.drawdownLevel;
        const avatarColors = getAvatarColor(stock.sector);
        const barWidth = Math.min(drawdown, 60) / 60 * 100; // cap visual at 60%

        let priceChangeClass = '';
        let changePct = 0;
        if (stock.previousClose > 0) {
            changePct = ((stock.price - stock.previousClose) / stock.previousClose) * 100;
        }

        if (stock.price > stock.previousClose) priceChangeClass = 'price-up';
        else if (stock.price < stock.previousClose) priceChangeClass = 'price-down';

        const changeStr = (changePct > 0 ? '+' : '') + changePct.toFixed(2) + '%';
        const isShortlisted = shortlistedStocks.includes(stock.ticker);
        const tickerDecoration = isShortlisted ? '<span style="color: var(--yellow-400); margin-right: 4px;">★</span>' : '';

        return `
            <tr data-ticker="${stock.ticker}" onclick="openModal('${stock.ticker}')">
                <td class="col-rank"><span class="rank-num">${index + 1}</span></td>
                <td class="col-stock">
                    <div class="stock-info">
                        <div class="stock-avatar" style="background:${avatarColors.bg};color:${avatarColors.color}">
                            ${stock.ticker.substring(0, 3)}
                        </div>
                        <div class="stock-details">
                            <span class="stock-ticker">${tickerDecoration}${stock.ticker}</span>
                            <div class="stock-name-row">
                                <span class="stock-name">${stock.name}</span>
                                <a href="https://www.tradingview.com/chart/?symbol=${stock.ticker}" target="_blank" class="tv-btn" onclick="event.stopPropagation()" aria-label="Open in TradingView" title="Open in TradingView">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="7" y1="17" x2="17" y2="7"></line>
                                        <polyline points="7 7 17 7 17 17"></polyline>
                                    </svg>
                                </a>
                                <button type="button" class="tv-btn" onclick="openSipModalForStock(event, '${stock.ticker}')" aria-label="Calculate SIP" title="Calculate SIP" style="background: none; border: none; padding: 0; cursor: pointer;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="1" x2="12" y2="23"></line>
                                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="col-sector"><span class="sector-badge" style="background:${avatarColors.bg};color:${avatarColors.color};border-color:${avatarColors.color}33">${stock.sector}</span></td>
                <td class="col-cap"><span class="cap-badge cap-${stock.cap}">${stock.cap}</span></td>
                <td class="col-mcap">
                    <div class="price-container">
                        <span class="price-cell">${formatMarketCap(stock.mcap)}</span>
                        ${stock.pe ? `<span class="prev-close-cell">P/E: ${stock.pe}</span>` : `<span class="prev-close-cell" style="opacity:0.5">P/E: —</span>`}
                    </div>
                </td>
                <td class="col-price">
                    <div class="price-container">
                        <span class="price-cell ${priceChangeClass}">${formatPrice(stock.price)} <span style="font-size: 0.75em; opacity: 0.9; margin-left: 4px;">${changeStr}</span></span>
                        <span class="prev-close-cell">Close: ${formatPrice(stock.previousClose)}</span>
                    </div>
                </td>
                <td class="col-ath"><span class="ath-cell">${formatPrice(stock.ath)}</span></td>
                <td class="col-drawdown">
                    <span class="drawdown-cell ${drawdownClass}">
                        ${drawdown <= 0 ? '🟢 ATH' : '-' + drawdown.toFixed(2) + '%'}
                    </span>
                </td>
                <td class="col-dma" style="text-align: center;">
                    <span class="dma-cell ${stock.below200DMA === true ? 'price-down' : (stock.below200DMA === false ? 'price-up' : '')}">
                        ${stock.below200DMA === true ? 'Yes' : (stock.below200DMA === false ? 'No' : '—')}
                    </span>
                </td>
                <td class="col-cagr">
                    <span class="cagr-cell ${stock.cagr5Y === null ? '' : (stock.cagr5Y >= 0 ? 'cagr-pos' : 'cagr-neg')}">
                        ${stock.cagr5Y === null || isNaN(stock.cagr5Y) ? '—' : (stock.cagr5Y >= 0 ? '+' : '') + stock.cagr5Y.toFixed(2) + '%'}
                    </span>
                </td>
                <td class="col-cagr">
                    <span class="cagr-cell ${stock.cagr10Y === null ? '' : (stock.cagr10Y >= 0 ? 'cagr-pos' : 'cagr-neg')}">
                        ${stock.cagr10Y === null || isNaN(stock.cagr10Y) ? '—' : (stock.cagr10Y >= 0 ? '+' : '') + stock.cagr10Y.toFixed(2) + '%'}
                    </span>
                </td>
                <td class="col-bar">
                    <div class="drawdown-bar">
                        <div class="drawdown-bar-fill level-${level}" style="width:${drawdown <= 0 ? 100 : Math.max(100 - barWidth, 5)}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateSummary();
}

function updateSummary() {
    const allStocks = stocksData.map(s => ({
        ...s,
        drawdown: calcDrawdown(s.price, s.ath)
    }));

    const total = allStocks.length;
    const atAth = allStocks.filter(s => s.drawdown <= 0).length;
    const nearAth = allStocks.filter(s => s.drawdown > 0 && s.drawdown <= 5).length;
    const deepDrawdown = allStocks.filter(s => s.drawdown > 20).length;
    const avgDrawdown = total > 0
        ? allStocks.reduce((sum, s) => sum + Math.max(s.drawdown, 0), 0) / total
        : 0;

    animateCounter('totalStocksValue', total);
    animateCounter('athCountValue', atAth);
    animateCounter('nearAthValue', nearAth);
    animateCounter('deepDrawdownValue', deepDrawdown);
    document.getElementById('avgDrawdownValue').textContent = avgDrawdown.toFixed(1) + '%';
}

function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const duration = 600;
    const steps = 30;
    const increment = (target - current) / steps;
    let step = 0;

    const interval = setInterval(() => {
        step++;
        if (step >= steps) {
            el.textContent = target;
            clearInterval(interval);
        } else {
            el.textContent = Math.round(current + increment * step);
        }
    }, duration / steps);
}

// ============================================
// Modal
// ============================================

async function fetchNews(ticker) {
    const newsContainer = document.getElementById('modalNewsList');
    if (!newsContainer) return;

    newsContainer.innerHTML = '<div class="news-loading"><span>Loading latest news...</span></div>';

    try {
        const response = await fetch(`/api/news/${ticker}`);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        if (!data.news || data.news.length === 0) {
            newsContainer.innerHTML = '<div class="news-loading">No recent news found.</div>';
            return;
        }

        newsContainer.innerHTML = data.news.slice(0, 4).map(item => {
            const date = new Date(item.providerPublishTime * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            return `
                <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-item">
                    <span class="news-title">${item.title}</span>
                    <div class="news-meta">
                        <span>${item.publisher || 'Yahoo Finance'}</span>
                        <span>•</span>
                        <span>${date}</span>
                    </div>
                </a>
            `;
        }).join('');
    } catch (err) {
        newsContainer.innerHTML = '<div class="news-error">Failed to load news.</div>';
        console.error('Failed to fetch news:', err);
    }
}

function openModal(ticker) {
    const stock = stocksData.find(s => s.ticker === ticker);
    if (!stock) return;

    activeModalTicker = ticker;

    const drawdown = calcDrawdown(stock.price, stock.ath);
    const dollarsBelow = stock.ath - stock.price;
    const recoveryNeeded = drawdown > 0 ? ((stock.ath / stock.price - 1) * 100) : 0;

    document.getElementById('modalTicker').textContent = stock.ticker;
    document.getElementById('modalName').textContent = stock.name;
    const modalSectorEl = document.getElementById('modalSector');
    modalSectorEl.textContent = stock.sector;
    const avatarColors = getAvatarColor(stock.sector);
    modalSectorEl.style.background = avatarColors.bg;
    modalSectorEl.style.color = avatarColors.color;
    modalSectorEl.style.borderColor = avatarColors.color + '33';
    document.getElementById('modalPrice').textContent = formatPrice(stock.price);

    const isShortlisted = shortlistedStocks.includes(ticker);
    if (shortlistStockBtn) {
        shortlistStockBtn.textContent = isShortlisted ? 'Remove from Shortlist' : 'Shortlist';
        shortlistStockBtn.style.background = isShortlisted ? 'var(--accent)' : 'var(--bg-tertiary)';
        shortlistStockBtn.style.color = isShortlisted ? '#fff' : 'var(--accent)';
    }

    let modalChangePct = 0;
    if (stock.previousClose > 0) {
        modalChangePct = ((stock.price - stock.previousClose) / stock.previousClose) * 100;
    }
    const modalChangeStr = (modalChangePct > 0 ? '+' : '') + modalChangePct.toFixed(2) + '%';
    const modalPriceChangeEl = document.getElementById('modalPriceChange');
    if (modalPriceChangeEl) {
        modalPriceChangeEl.textContent = modalChangeStr;
        modalPriceChangeEl.className = modalChangePct > 0 ? 'price-up' : (modalChangePct < 0 ? 'price-down' : '');
    }

    document.getElementById('modalAth').textContent = formatPrice(stock.ath);

    const drawdownEl = document.getElementById('modalDrawdown');
    drawdownEl.textContent = drawdown <= 0 ? '🟢 At ATH' : '-' + drawdown.toFixed(2) + '%';
    drawdownEl.className = 'metric-value' + (drawdown <= 0 ? ' at-ath-modal' : '');

    document.getElementById('modalMcap').textContent = formatMarketCap(stock.mcap);
    const modalPeEl = document.getElementById('modalPe');
    if (modalPeEl) modalPeEl.textContent = stock.pe ? `P/E: ${stock.pe}` : 'P/E: —';
    document.getElementById('modalDollarBelow').textContent = drawdown <= 0 ? '—' : formatPrice(dollarsBelow);
    document.getElementById('modalRecovery').textContent = drawdown <= 0 ? '—' : '+' + recoveryNeeded.toFixed(2) + '%';

    const formatCagr = (val) => (val === null || isNaN(val)) ? '—' : (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
    const getCagrClass = (val) => (val === null || isNaN(val)) ? '' : (val >= 0 ? 'price-up' : 'price-down');

    const cagr1El = document.getElementById('modalCagr1Y');
    const cagr3El = document.getElementById('modalCagr3Y');
    const cagr5El = document.getElementById('modalCagr5Y');
    const cagr10El = document.getElementById('modalCagr10Y');

    if (cagr1El) { cagr1El.textContent = formatCagr(stock.cagr1Y); cagr1El.className = 'detail-value ' + getCagrClass(stock.cagr1Y); }
    if (cagr3El) { cagr3El.textContent = formatCagr(stock.cagr3Y); cagr3El.className = 'detail-value ' + getCagrClass(stock.cagr3Y); }
    if (cagr5El) { cagr5El.textContent = formatCagr(stock.cagr5Y); cagr5El.className = 'detail-value ' + getCagrClass(stock.cagr5Y); }
    if (cagr10El) { cagr10El.textContent = formatCagr(stock.cagr10Y); cagr10El.className = 'detail-value ' + getCagrClass(stock.cagr10Y); }

    // Viz bar
    const fillPct = stock.ath > 0 ? (stock.price / stock.ath) * 100 : 0;
    document.getElementById('modalBarFill').style.width = fillPct + '%';
    document.getElementById('modalBarMarker').style.left = fillPct + '%';
    document.getElementById('modalMarkerLabel').textContent = formatPrice(stock.price);
    document.getElementById('modalVizAth').textContent = formatPrice(stock.ath);

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Fetch news
    fetchNews(ticker);
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// Event Listeners
// ============================================

// Search
function updateClearButtonVisibility() {
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        if (searchQuery) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    }
}

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    updateClearButtonVisibility();
    renderTable();
});

const clearSearchBtn = document.getElementById('clearSearchBtn');
if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        updateClearButtonVisibility();
        searchInput.focus();
        renderTable();
    });
}

// Keyboard shortcut (Cmd+K / Ctrl+K)
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }
    
    // Alt+A to open Add Stock modal
    if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (typeof addStockBtn !== 'undefined' && addStockBtn) addStockBtn.click();
    }
    
    // Alt+S to open SIP Calculator
    if (e.altKey && e.key.toLowerCase() === 's') {
        const sipCalcBtn = document.getElementById('sipCalcBtn');
        e.preventDefault();
        if (sipCalcBtn) sipCalcBtn.click();
    }
    if (e.key === 'Escape') {
        if (modalOverlay.classList.contains('active')) {
            closeModal();
        } else {
            searchInput.blur();
            searchInput.value = '';
            searchQuery = '';
            updateClearButtonVisibility();
            renderTable();
        }
    }
});

// Filter buttons
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (btn) {
        // Remove active from all buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        // Set this button as active
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTable();
    }
});

// Sort
sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderTable();
});

sortOrderBtn.addEventListener('click', () => {
    sortAscending = !sortAscending;
    sortOrderBtn.classList.toggle('desc', sortAscending);
    renderTable();
});

// Modal
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

// Refresh button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        fullDataCache = null; // This only affects server-side, but signal intent
        fetchStockData();
    });
}

// Export to Excel (CSV)
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
        const stocks = getFilteredAndSortedStocks();
        if (stocks.length === 0) return;

        const headers = [
            'Ticker', 'Name', 'Sector', 'Cap', 'Market Cap ($)', 'P/E', 
            'Current Price ($)', 'Previous Close ($)', 'All-Time High ($)', 
            '% From ATH', 'Below 200 DMA', '5Y CAGR (%)', '10Y CAGR (%)'
        ];
        
        let csvContent = headers.join(',') + '\n';
        
        stocks.forEach(stock => {
            const row = [
                stock.ticker,
                `"${stock.name.replace(/"/g, '""')}"`,
                stock.sector,
                stock.cap,
                stock.mcap,
                stock.pe || '',
                stock.price,
                stock.previousClose || '',
                stock.ath,
                stock.drawdown ? stock.drawdown.toFixed(2) : '0',
                stock.below200DMA === true ? 'Yes' : (stock.below200DMA === false ? 'No' : ''),
                stock.cagr5Y !== null && !isNaN(stock.cagr5Y) ? stock.cagr5Y.toFixed(2) : '',
                stock.cagr10Y !== null && !isNaN(stock.cagr10Y) ? stock.cagr10Y.toFixed(2) : ''
            ];
            csvContent += row.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'stockpulse_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// ----------------------------------------------------
// Deactivated Stocks Logic
// ----------------------------------------------------

async function toggleStockStatus(ticker, active, btnElement = null) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = active ? 'Reactivating...' : 'Deactivating...';
        btnElement.style.opacity = '0.5';
    }

    try {
        const res = await fetch('/api/stocks/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, active })
        });
        const data = await res.json();
        if (data.success) {
            if (!active) {
                // Optimistically remove from main table data
                stocksData = stocksData.filter(s => s.ticker !== ticker);
                renderTable();
            }
            fetchStockData(true); // Background refresh
            return true;
        }
    } catch (e) {
        console.error('Failed to toggle stock', e);
    }

    if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = active ? 'Reactivate' : 'Deactivate';
        btnElement.style.opacity = '1';
    }
    return false;
}

if (deactivateStockBtn) {
    deactivateStockBtn.addEventListener('click', async () => {
        if (!activeModalTicker) return;
        const success = await toggleStockStatus(activeModalTicker, false, deactivateStockBtn);
        if (success) {
            closeModal();
            deactivateStockBtn.disabled = false;
            deactivateStockBtn.textContent = 'Deactivate';
            deactivateStockBtn.style.opacity = '1';
        } else {
            alert('Failed to deactivate stock.');
        }
    });
}

if (shortlistStockBtn) {
    shortlistStockBtn.addEventListener('click', async () => {
        if (!activeModalTicker) return;
        const isCurrentlyShortlisted = shortlistedStocks.includes(activeModalTicker);

        // Optimistic UI update
        if (isCurrentlyShortlisted) {
            shortlistedStocks = shortlistedStocks.filter(t => t !== activeModalTicker);
        } else {
            shortlistedStocks.push(activeModalTicker);
        }

        // Update button visual
        const currentlyShortlisted = shortlistedStocks.includes(activeModalTicker);
        shortlistStockBtn.textContent = currentlyShortlisted ? 'Remove from Shortlist' : 'Shortlist';
        shortlistStockBtn.style.background = currentlyShortlisted ? 'var(--accent)' : 'var(--bg-tertiary)';
        shortlistStockBtn.style.color = currentlyShortlisted ? '#fff' : 'var(--accent)';

        // Refresh table if needed
        if (currentFilter === 'shortlisted') {
            renderTable();
        }

        try {
            const res = await fetch('/api/shortlisted/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: activeModalTicker, shortlisted: !isCurrentlyShortlisted })
            });
            const data = await res.json();
            if (data.success) {
                shortlistedStocks = data.shortlisted;
                if (currentFilter === 'shortlisted' || currentlyShortlisted !== shortlistedStocks.includes(activeModalTicker)) {
                    renderTable();
                }
            }
        } catch (e) {
            console.error('Failed to toggle shortlist status', e);
        }
    });
}

let allDeactivatedStocks = [];
let deactivatedSearchQuery = '';

async function loadDeactivatedStocks() {
    try {
        const res = await fetch('/api/deactivated');
        const data = await res.json();
        allDeactivatedStocks = data.stocks || [];
        renderDeactivatedStocks();
    } catch (e) {
        console.error('Failed to load deactivated stocks', e);
        deactivatedList.innerHTML = '<div style="color:var(--red-400)">Error loading list</div>';
    }
}

function renderDeactivatedStocks() {
    deactivatedList.innerHTML = '';
    
    let stocksToRender = allDeactivatedStocks;
    if (deactivatedSearchQuery) {
        const q = deactivatedSearchQuery.toLowerCase();
        stocksToRender = stocksToRender.filter(s => 
            s.ticker.toLowerCase().includes(q) || 
            s.sector.toLowerCase().includes(q)
        );
    }

    if (stocksToRender.length === 0) {
        if (allDeactivatedStocks.length === 0) {
            deactivatedEmpty.textContent = 'No deactivated stocks.';
        } else {
            deactivatedEmpty.textContent = 'No stocks match your search.';
        }
        deactivatedList.style.display = 'none';
        deactivatedEmpty.style.display = 'block';
        return;
    }

    deactivatedList.style.display = 'flex';
    deactivatedEmpty.style.display = 'none';

    stocksToRender.forEach(stock => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px 16px';
        item.style.background = 'var(--bg-tertiary)';
        item.style.borderRadius = 'var(--radius-md)';

        const info = document.createElement('div');
        info.innerHTML = `<strong>${stock.ticker}</strong> <span style="color:var(--text-muted); font-size: 0.85em; margin-left:8px;">${stock.sector} - ${stock.cap}</span>`;

        const btn = document.createElement('button');
        btn.textContent = 'Reactivate';
        btn.style.padding = '6px 12px';
        btn.style.background = 'var(--green-500)';
        btn.style.color = 'black';
        btn.style.border = 'none';
        btn.style.borderRadius = 'var(--radius-sm)';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = '600';
        btn.style.fontSize = '0.8rem';

        btn.onclick = async () => {
            const success = await toggleStockStatus(stock.ticker, true, btn);
            if (success) {
                loadDeactivatedStocks(); // Reload list
            }
        };

        item.appendChild(info);
        item.appendChild(btn);
        deactivatedList.appendChild(item);
    });
}

const deactivatedSearchInput = document.getElementById('deactivatedSearchInput');
if (deactivatedSearchInput) {
    deactivatedSearchInput.addEventListener('input', (e) => {
        deactivatedSearchQuery = e.target.value;
        renderDeactivatedStocks();
    });
}

if (deactivatedBtn) {
    deactivatedBtn.addEventListener('click', () => {
        if (deactivatedSearchInput) {
            deactivatedSearchInput.value = '';
            deactivatedSearchQuery = '';
        }
        loadDeactivatedStocks();
        deactivatedModalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

if (deactivatedModalClose) {
    deactivatedModalClose.addEventListener('click', () => {
        deactivatedModalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });
}

deactivatedModalOverlay.addEventListener('click', (e) => {
    if (e.target === deactivatedModalOverlay) {
        deactivatedModalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ----------------------------------------------------
// Add Stock Logic
// ----------------------------------------------------

if (addStockBtn) {
    addStockBtn.addEventListener('click', () => {
        addStockModalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.getElementById('addTicker').focus();
    });
}

if (addStockModalClose) {
    addStockModalClose.addEventListener('click', () => {
        addStockModalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });
}

// Modal no longer closes when clicking outside overlay
// addStockModalOverlay.addEventListener('click', (e) => {
//     if (e.target === addStockModalOverlay) {
//         addStockModalOverlay.classList.remove('active');
//         document.body.style.overflow = '';
//     }
// });

if (addStockForm) {
    addStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tickersRaw = document.getElementById('addTicker').value;
        const tickers = tickersRaw.split(',').map(t => t.trim()).filter(t => t);

        if (tickers.length === 0) return;

        submitAddStockBtn.disabled = true;
        submitAddStockBtn.textContent = tickers.length > 1 ? 'Adding Stocks...' : 'Adding...';
        submitAddStockBtn.style.opacity = '0.7';

        try {
            const res = await fetch('/api/stocks/add-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickers })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                addStockForm.reset();
                addStockModalOverlay.classList.remove('active');
                document.body.style.overflow = '';

                // Show loading spinner for adding net-new stock that has no cache
                fetchStockData(false);
            } else {
                alert(data.error || 'Failed to add stock');
            }
        } catch (e) {
            console.error('Add stock error', e);
            alert('Failed to add stock. Please try again.');
        } finally {
            submitAddStockBtn.disabled = false;
            submitAddStockBtn.textContent = 'Add Stock';
            submitAddStockBtn.style.opacity = '1';
        }
    });
}

// ============================================
// Theme Toggle
// ============================================

function initTheme() {
    const saved = localStorage.getItem('stockpulse-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        // Default to light
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('stockpulse-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('stockpulse-theme', 'light');
    }
}

// Apply theme immediately (before DOMContentLoaded) to prevent flash
initTheme();

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

// ============================================
// SIP Calculator Logic
// ============================================
const sipCalcBtn = document.getElementById('sipCalcBtn');
const sipModalOverlay = document.getElementById('sipModalOverlay');
const sipModalClose = document.getElementById('sipModalClose');
const sipStockSelect = document.getElementById('sipStockSelect');
const sipDurationSelect = document.getElementById('sipDurationSelect');
const calculateSipBtn = document.getElementById('calculateSipBtn');

const sipResultsContainer = document.getElementById('sipResultsContainer');
const sipInvested = document.getElementById('sipInvested');
const sipFinalValue = document.getElementById('sipFinalValue');
const sipCagr = document.getElementById('sipCagr');
const sipLoading = document.getElementById('sipLoading');
const sipError = document.getElementById('sipError');

window.openSipModal = function(ticker = null) {
    // Populate stocks dropdown
    sipStockSelect.innerHTML = '';
    const sortedStocks = [...stocksData].sort((a, b) => a.ticker.localeCompare(b.ticker));
    if (sortedStocks.length === 0) {
        sipStockSelect.innerHTML = '<option disabled>No stocks available</option>';
    } else {
        const preselectedTicker = ticker || activeModalTicker;
        sortedStocks.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.ticker;
            opt.textContent = `${s.ticker} - ${s.name}`;
            if (s.ticker === preselectedTicker) opt.selected = true;
            sipStockSelect.appendChild(opt);
        });
    }
    
    // Reset results area
    sipResultsContainer.style.display = 'none';
    sipError.style.display = 'none';
    sipLoading.style.display = 'none';

    sipModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.openSipModalForStock = function(event, ticker) {
    event.stopPropagation();
    window.openSipModal(ticker);
};

if (sipCalcBtn) {
    sipCalcBtn.addEventListener('click', () => {
        window.openSipModal();
    });
}

if (sipModalClose) {
    sipModalClose.addEventListener('click', () => {
        sipModalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });
}

if (calculateSipBtn) {
    calculateSipBtn.addEventListener('click', async () => {
        const ticker = sipStockSelect.value;
        const years = sipDurationSelect.value;
        if (!ticker) return;

        sipLoading.style.display = 'block';
        sipResultsContainer.style.display = 'none';
        sipError.style.display = 'none';
        calculateSipBtn.disabled = true;

        try {
            const res = await fetch(`/api/sip/${ticker}?years=${years}`);
            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to calculate SIP.');
            }

            sipInvested.textContent = '$' + data.invested.toLocaleString();
            sipFinalValue.textContent = '$' + data.finalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            const cagrColor = data.cagr >= 0 ? 'var(--green-500)' : 'var(--red-400)';
            sipCagr.innerHTML = `<span style="color: ${cagrColor}">${data.cagr >= 0 ? '+' : ''}${data.cagr.toFixed(2)}%</span>`;

            const tbody = document.getElementById('sipTableBody');
            if (tbody && data.installments) {
                tbody.innerHTML = data.installments.map(inst => {
                    const dateStr = new Date(inst.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                    const diffColor = inst.difference >= 0 ? 'var(--green-500)' : 'var(--red-400)';
                    const diffSign = inst.difference >= 0 ? '+' : '';
                    return `
                        <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-primary);">
                            <td style="padding: 10px; color: var(--text-primary);">${dateStr}</td>
                            <td style="padding: 10px; text-align: right; color: var(--text-primary);">$${inst.price.toFixed(2)}</td>
                            <td style="padding: 10px; text-align: right; color: var(--text-primary);">$${inst.currentPrice.toFixed(2)}</td>
                            <td style="padding: 10px; text-align: right; color: ${diffColor};">
                                ${diffSign}$${inst.difference.toFixed(2)}
                            </td>
                        </tr>
                    `;
                }).reverse().join(''); // Reverse to show latest first
            }

            sipLoading.style.display = 'none';
            sipResultsContainer.style.display = 'block';
        } catch (err) {
            sipLoading.style.display = 'none';
            sipError.textContent = err.message;
            sipError.style.display = 'block';
        } finally {
            calculateSipBtn.disabled = false;
        }
    });
}

// ============================================
// Go to Top Button
// ============================================
const goToTopBtn = document.getElementById('goToTopBtn');

if (goToTopBtn) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            goToTopBtn.classList.add('visible');
        } else {
            goToTopBtn.classList.remove('visible');
        }
    });

    goToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    fetchShortlistedStocks();
    fetchStockData();
});
