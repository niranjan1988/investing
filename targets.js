document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('stockTableBody');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const sortSelect = document.getElementById('sortSelect');
    const sortOrderBtn = document.getElementById('sortOrderBtn');
    const themeToggle = document.getElementById('themeToggle');
    const goToTopBtn = document.getElementById('goToTopBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');

    let targetData = [];
    let currentSort = 'upside';
    let sortAscending = false;
    let currentSearch = '';
    let bucketsData = {};
    let currentBucket = null;

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
    async function toggleBucketStock(bucketName, ticker, add) {
        try {
            const res = await fetch('/api/buckets/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucket: bucketName, ticker, add })
            });
            const data = await res.json();
            if (data.success) {
                bucketsData = data.buckets;
                renderBucketBar();
                if (currentBucket) {
                    renderTable();
                }
            }
        } catch (e) {
            console.error('Failed to toggle bucket stock', e);
        }
    }

    async function fetchBuckets() {
        try {
            const response = await fetch('/api/buckets');
            const data = await response.json();
            bucketsData = data.buckets || {};
            renderBucketBar();
        } catch (error) {
            console.error('Error fetching buckets:', error);
        }
    }

    function renderBucketBar() {
        const bucketBar = document.getElementById('bucketBar');
        const pillsContainer = document.getElementById('bucketPillsContainer');
        if (!bucketBar || !pillsContainer) return;

        const bucketNames = Object.keys(bucketsData);

        if (bucketNames.length === 0) {
            bucketBar.style.display = 'none';
            pillsContainer.innerHTML = '';
            return;
        }

        bucketBar.style.display = 'flex';
        pillsContainer.innerHTML = bucketNames.map(name => {
            const activeTickers = bucketsData[name].filter(ticker => targetData.some(s => s.ticker === ticker));
            const count = activeTickers.length;
            const isActive = currentBucket === name;
            return `
                <button class="bucket-pill ${isActive ? 'active' : ''}" data-bucket="${name}">
                    ${name}
                    <span class="bucket-count">${count}</span>
                </button>
            `;
        }).join('');
    }

    async function fetchTargets() {
        loadingOverlay.style.display = 'flex';
        try {
            const response = await fetch('/api/targets');
            const data = await response.json();
            targetData = data.targets || [];
            renderBucketBar();
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
    function getFilteredAndSortedTargets() {
        let filtered = targetData.filter(stock => {
            if (currentBucket && (!bucketsData[currentBucket] || !bucketsData[currentBucket].includes(stock.ticker))) {
                return false;
            }
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
                case 'upside_low':
                    valA = (a.targetLow && a.currentPrice) ? ((a.targetLow / a.currentPrice) - 1) : -Infinity;
                    valB = (b.targetLow && b.currentPrice) ? ((b.targetLow / b.currentPrice) - 1) : -Infinity;
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

        return filtered;
    }

    function renderTable() {
        const filtered = getFilteredAndSortedTargets();

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
                            <div style="display: flex; flex-direction: column; gap: 2px; width: 100%;">
                                <div class="stock-name-row" style="display: flex; align-items: center; gap: 6px;">
                                    <span class="ticker" style="font-weight: 700; font-size: 0.92rem;">${stock.ticker}</span>
                                    <button type="button" class="tv-btn" onclick="event.stopPropagation(); window.open('https://www.tradingview.com/chart/?symbol=${stock.ticker}', '_blank')" aria-label="Open in TradingView" title="Open in TradingView" style="background: none; border: none; padding: 0; cursor: pointer; color: inherit;">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">
                                            <line x1="7" y1="17" x2="17" y2="7"></line>
                                            <polyline points="7 7 17 7 17 17"></polyline>
                                        </svg>
                                    </button>
                                    <button type="button" class="tv-btn bucket-add-btn" data-dropdown-ticker="${stock.ticker}" aria-label="Add to Bucket" title="Add to Bucket" style="background: none; border: none; padding: 0; cursor: pointer; color: inherit; position: relative;">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">
                                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                            <line x1="12" y1="11" x2="12" y2="17"></line>
                                            <line x1="9" y1="14" x2="15" y2="14"></line>
                                        </svg>
                                    </button>
                                </div>
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
        if (clearSearchBtn) {
            if (currentSearch) {
                clearSearchBtn.classList.add('visible');
            } else {
                clearSearchBtn.classList.remove('visible');
            }
        }
        renderTable();
    });

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentSearch = '';
            clearSearchBtn.classList.remove('visible');
            renderTable();
            searchInput.focus();
        });
    }

    // Keyboard shortcut for search
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
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

    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', () => {
            const filtered = getFilteredAndSortedTargets();
            if (filtered.length === 0) return;

            const headers = [
                'Ticker', 'Name', 'Sector', 'Current Price ($)', 'Low Target ($)',
                'Mean Target ($)', 'High Target ($)', 'Analyst Rating', 'Upside (%)'
            ];

            let csvContent = headers.join(',') + '\n';

            filtered.forEach(stock => {
                const nameStr = stock.name ? `"${stock.name.replace(/"/g, '""')}"` : '';
                const upside = stock.currentPrice && stock.targetMean ? (((stock.targetMean / stock.currentPrice) - 1) * 100).toFixed(2) : '';
                const row = [
                    stock.ticker,
                    nameStr,
                    stock.sector || '',
                    stock.currentPrice || '',
                    stock.targetLow || '',
                    stock.targetMean || '',
                    stock.targetHigh || '',
                    stock.recommendation || '',
                    upside
                ];
                csvContent += row.join(',') + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'stockpulse_targets_export.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const tableBucketDropdown = document.getElementById('tableBucketDropdown');
    const tableBucketDropdownList = document.getElementById('tableBucketDropdownList');
    let activeDropdownTicker = null;

    document.addEventListener('click', (e) => {
        const pill = e.target.closest('.bucket-pill');
        if (pill) {
            const name = pill.dataset.bucket;
            if (currentBucket === name) {
                currentBucket = null;
            } else {
                currentBucket = name;
            }
            renderBucketBar();
            renderTable();
            return;
        }

        // Table row bucket add button
        const bucketAddBtn = e.target.closest('.bucket-add-btn');
        if (bucketAddBtn && tableBucketDropdown) {
            e.stopPropagation();
            activeDropdownTicker = bucketAddBtn.dataset.dropdownTicker;

            // Render options
            const bucketNames = Object.keys(bucketsData);
            if (bucketNames.length === 0) {
                tableBucketDropdownList.innerHTML = '<div style="padding: 8px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">No buckets found</div>';
            } else {
                tableBucketDropdownList.innerHTML = bucketNames.map(name => {
                    const isIn = bucketsData[name].includes(activeDropdownTicker);
                    return `<button class="dropdown-item ${isIn ? 'in-bucket' : ''}" data-dropdown-bucket="${name}">${name}</button>`;
                }).join('');
            }

            // Position
            const rect = bucketAddBtn.getBoundingClientRect();
            tableBucketDropdown.style.display = 'block';

            setTimeout(() => {
                tableBucketDropdown.classList.add('active');
                tableBucketDropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;

                const dropdownWidth = tableBucketDropdown.offsetWidth || 160;
                if (rect.left + dropdownWidth > window.innerWidth) {
                    tableBucketDropdown.style.left = `${rect.right + window.scrollX - dropdownWidth}px`;
                } else {
                    tableBucketDropdown.style.left = `${rect.left + window.scrollX}px`;
                }
            }, 10);

            return;
        }

        // Dropdown item click
        const dropdownItem = e.target.closest('.dropdown-item');
        if (dropdownItem && activeDropdownTicker) {
            e.stopPropagation();
            const bucketName = dropdownItem.dataset.dropdownBucket;
            const isIn = bucketsData[bucketName].includes(activeDropdownTicker);

            // Optimistic UI
            if (isIn) {
                dropdownItem.classList.remove('in-bucket');
            } else {
                dropdownItem.classList.add('in-bucket');
            }

            toggleBucketStock(bucketName, activeDropdownTicker, !isIn);
            return;
        }

        // Close dropdown on outside click
        if (tableBucketDropdown && tableBucketDropdown.classList.contains('active')) {
            tableBucketDropdown.classList.remove('active');
            setTimeout(() => {
                tableBucketDropdown.style.display = 'none';
            }, 150);
        }
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
    fetchBuckets();
    fetchTargets();
});
