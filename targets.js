document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('stockTableBody');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const sortOrderBtn = document.getElementById('sortOrderBtn');
    const themeToggle = document.getElementById('themeToggle');
    const goToTopBtn = document.getElementById('goToTopBtn');

    let targetData = [];
    let currentSort = 'upside';
    let sortAscending = false;
    let currentSearch = '';

    // ==========================================
    // Formatting Helpers
    // ==========================================
    function formatCurrency(value) {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    function formatPercent(value) {
        if (value === null || value === undefined) return '-';
        return value.toFixed(1) + '%';
    }

    function formatRating(rating) {
        if (!rating) return '-';
        // Capitalize first letter
        const formatted = rating.replace(/_/g, ' ');
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    function getUpsideStyle(upside) {
        if (upside === null || upside === undefined) return '';
        if (upside > 10) return 'color: var(--green-400); background: var(--green-glow);';
        if (upside > 0) return 'color: var(--yellow-400); background: rgba(250, 204, 21, 0.1);';
        return 'color: var(--red-400); background: rgba(248, 113, 113, 0.1);';
    }

    // ==========================================
    // Fetch Data
    // ==========================================
    async function fetchTargets() {
        loadingOverlay.style.display = 'flex';
        try {
            const response = await fetch('/api/targets');
            const data = await response.json();
            targetData = data.targets || [];
            renderTable();
        } catch (error) {
            console.error('Error fetching targets:', error);
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--red-400);">Failed to load data. Please try again later.</td></tr>';
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    // ==========================================
    // Render Table
    // ==========================================
    function renderTable() {
        let filtered = targetData.filter(stock => {
            if (!currentSearch) return true;
            return stock.ticker.toLowerCase().includes(currentSearch.toLowerCase()) ||
                   (stock.sector && stock.sector.toLowerCase().includes(currentSearch.toLowerCase()));
        });

        filtered.sort((a, b) => {
            let valA, valB;
            switch (currentSort) {
                case 'upside':
                    valA = a.upsideMean !== null ? a.upsideMean : -Infinity;
                    valB = b.upsideMean !== null ? b.upsideMean : -Infinity;
                    break;
                case 'upside_high':
                    valA = (a.targetHigh && a.currentPrice) ? ((a.targetHigh / a.currentPrice) - 1) : -Infinity;
                    valB = (b.targetHigh && b.currentPrice) ? ((b.targetHigh / b.currentPrice) - 1) : -Infinity;
                    break;
                case 'name':
                    valA = a.ticker;
                    valB = b.ticker;
                    break;
                case 'sector':
                    valA = a.sector || '';
                    valB = b.sector || '';
                    break;
                case 'rating':
                    const ratingOrder = { 'strong_buy': 5, 'buy': 4, 'hold': 3, 'underperform': 2, 'sell': 1 };
                    valA = ratingOrder[a.recommendation] || 0;
                    valB = ratingOrder[b.recommendation] || 0;
                    break;
                default:
                    valA = a.upsideMean || 0;
                    valB = b.upsideMean || 0;
            }

            if (valA < valB) return sortAscending ? -1 : 1;
            if (valA > valB) return sortAscending ? 1 : -1;
            return 0;
        });

        tableBody.innerHTML = '';

        if (filtered.length === 0) {
            noResults.style.display = 'flex';
        } else {
            noResults.style.display = 'none';
            filtered.forEach((stock, index) => {
                const tr = document.createElement('tr');
                
                function formatTarget(current, target) {
                    if (!target) return '-';
                    let html = `<span>${formatCurrency(target)}</span>`;
                    if (current && target) {
                        const upside = ((target / current) - 1) * 100;
                        const style = getUpsideStyle(upside);
                        const sign = upside > 0 ? '+' : '';
                        html += `<span style="margin-left: 8px; padding: 2px 6px; font-size: 0.8em; border-radius: 4px; font-weight: 600; ${style}">${sign}${formatPercent(upside)}</span>`;
                    }
                    return `<div style="display: flex; align-items: center; justify-content: flex-start;">${html}</div>`;
                }

                tr.innerHTML = `
                    <td class="col-rank">${index + 1}</td>
                    <td>
                        <div class="stock-info">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span class="ticker" style="font-weight: 700; font-size: 0.92rem;">${stock.ticker}</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${stock.name || ''}</span>
                            </div>
                        </div>
                    </td>
                    <td class="col-sector"><span class="sector-badge">${stock.sector || 'Unknown'}</span></td>
                    <td style="font-weight:600;">${formatCurrency(stock.currentPrice)}</td>
                    <td>${formatTarget(stock.currentPrice, stock.targetLow)}</td>
                    <td style="color:var(--accent); font-weight:500;">${formatTarget(stock.currentPrice, stock.targetMean)}</td>
                    <td>${formatTarget(stock.currentPrice, stock.targetHigh)}</td>
                    <td style="text-transform: capitalize;">${formatRating(stock.recommendation)} <span style="color:var(--text-muted); font-size: 0.85em;">(${stock.analysts || 0})</span></td>
                `;
                tableBody.appendChild(tr);
            });
        }
    }

    // ==========================================
    // Event Listeners
    // ==========================================
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderTable();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderTable();
    });

    sortOrderBtn.addEventListener('click', () => {
        sortAscending = !sortAscending;
        sortOrderBtn.style.transform = sortAscending ? 'rotate(180deg)' : 'none';
        renderTable();
    });

    // Theme logic
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    
    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Go to top
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            goToTopBtn.classList.add('visible');
        } else {
            goToTopBtn.classList.remove('visible');
        }
    });

    goToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Init
    fetchTargets();
});
