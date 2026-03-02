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

// ============================================
// DOM Elements
// ============================================
const stockTableBody = document.getElementById('stockTableBody');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const sortOrderBtn = document.getElementById('sortOrderBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const noResults = document.getElementById('noResults');
const tableContainer = document.querySelector('.table-container');
const lastUpdatedEl = document.getElementById('lastUpdated');

// ============================================
// Data Fetching
// ============================================

async function fetchStockData() {
    showLoading(true);
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

        // Update last-updated timestamp
        if (data.timestamp) {
            const ts = new Date(data.timestamp);
            lastUpdatedEl.textContent = `Updated: ${ts.toLocaleString()}`;
        }

        renderTable();
    } catch (err) {
        console.error('Failed to fetch stock data:', err);
        showError(err.message);
    } finally {
        showLoading(false);
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
        case 'tech':
            stocks = stocks.filter(s => s.sector === 'Technology');
            break;
        case 'health':
            stocks = stocks.filter(s => s.sector === 'Healthcare');
            break;
        case 'mega':
            stocks = stocks.filter(s => s.cap === 'mega');
            break;
        case 'large':
            stocks = stocks.filter(s => s.cap === 'large');
            break;
        case 'ath':
            stocks = stocks.filter(s => s.drawdown <= 0);
            break;
        case 'near':
            stocks = stocks.filter(s => s.drawdown > 0 && s.drawdown <= 5);
            break;
        case 'deep':
            stocks = stocks.filter(s => s.drawdown > 20);
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
            case 'price':
                comparison = b.price - a.price;
                break;
        }
        return sortAscending ? -comparison : comparison;
    });

    return stocks;
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
        if (stock.price > stock.previousClose) priceChangeClass = 'price-up';
        else if (stock.price < stock.previousClose) priceChangeClass = 'price-down';

        return `
            <tr data-ticker="${stock.ticker}" onclick="openModal('${stock.ticker}')">
                <td class="col-rank"><span class="rank-num">${index + 1}</span></td>
                <td class="col-stock">
                    <div class="stock-info">
                        <div class="stock-avatar" style="background:${avatarColors.bg};color:${avatarColors.color}">
                            ${stock.ticker.substring(0, 3)}
                        </div>
                        <div class="stock-details">
                            <span class="stock-ticker">${stock.ticker}</span>
                            <span class="stock-name">${stock.name}</span>
                        </div>
                    </div>
                </td>
                <td class="col-sector"><span class="sector-badge">${stock.sector}</span></td>
                <td class="col-cap"><span class="cap-badge cap-${stock.cap}">${stock.cap}</span></td>
                <td class="col-mcap"><span class="price-cell">${formatMarketCap(stock.mcap)}</span></td>
                <td class="col-price">
                    <div class="price-container">
                        <span class="price-cell ${priceChangeClass}">${formatPrice(stock.price)}</span>
                        <span class="prev-close-cell">Close: ${formatPrice(stock.previousClose)}</span>
                    </div>
                </td>
                <td class="col-ath"><span class="ath-cell">${formatPrice(stock.ath)}</span></td>
                <td class="col-drawdown">
                    <span class="drawdown-cell ${drawdownClass}">
                        ${drawdown <= 0 ? '🟢 ATH' : '-' + drawdown.toFixed(2) + '%'}
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

function openModal(ticker) {
    const stock = stocksData.find(s => s.ticker === ticker);
    if (!stock) return;

    const drawdown = calcDrawdown(stock.price, stock.ath);
    const dollarsBelow = stock.ath - stock.price;
    const recoveryNeeded = drawdown > 0 ? ((stock.ath / stock.price - 1) * 100) : 0;

    document.getElementById('modalTicker').textContent = stock.ticker;
    document.getElementById('modalName').textContent = stock.name;
    document.getElementById('modalSector').textContent = stock.sector;
    document.getElementById('modalPrice').textContent = formatPrice(stock.price);
    document.getElementById('modalAth').textContent = formatPrice(stock.ath);

    const drawdownEl = document.getElementById('modalDrawdown');
    drawdownEl.textContent = drawdown <= 0 ? '🟢 At ATH' : '-' + drawdown.toFixed(2) + '%';
    drawdownEl.className = 'metric-value' + (drawdown <= 0 ? ' at-ath-modal' : '');

    document.getElementById('modalMcap').textContent = formatMarketCap(stock.mcap);
    document.getElementById('modalCategory').textContent = stock.cap === 'mega' ? 'Mega Cap (>$200B)' : 'Large Cap ($10B-$200B)';
    document.getElementById('modalDollarBelow').textContent = drawdown <= 0 ? '—' : formatPrice(dollarsBelow);
    document.getElementById('modalRecovery').textContent = drawdown <= 0 ? '—' : '+' + recoveryNeeded.toFixed(2) + '%';

    // Viz bar
    const fillPct = stock.ath > 0 ? (stock.price / stock.ath) * 100 : 0;
    document.getElementById('modalBarFill').style.width = fillPct + '%';
    document.getElementById('modalBarMarker').style.left = fillPct + '%';
    document.getElementById('modalMarkerLabel').textContent = formatPrice(stock.price);
    document.getElementById('modalVizAth').textContent = formatPrice(stock.ath);

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
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
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active from all buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        // Set this button as active
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTable();
    });
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

// ============================================
// Theme Toggle
// ============================================

function initTheme() {
    const saved = localStorage.getItem('stockpulse-theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
        document.documentElement.removeAttribute('data-theme');
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
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    fetchStockData();
});
