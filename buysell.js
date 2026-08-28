/**
 * StockPulse Buy/Sell Calculator
 */
(() => {
  "use strict";



  let portfolioStocks = [];
  let selectedStock = null;
  let currentCalculatedPct = 0;

  // DOM Elements - Theme
  const themeToggle = document.getElementById("themeToggle");

  // DOM Elements - Section 1
  const tickerSelect = document.getElementById("tickerSelect");
  const stockDetails = document.getElementById("stockDetails");
  const currentQtyEl = document.getElementById("currentQty");
  const avgBuyPriceEl = document.getElementById("avgBuyPrice");
  const allocationEl = document.getElementById("allocation");
  const purchaseQtyInput = document.getElementById("purchaseQtyInput");
  const percentageChangeEl = document.getElementById("percentageChange");

  // DOM Elements - Section 2
  const calcCurrentQtyInput = document.getElementById("calcCurrentQtyInput");
  const calcStockToBuyEl = document.getElementById("calcStockToBuy");
  const calcNewTotalQtyEl = document.getElementById("calcNewTotalQty");

  function formatNumber(num, maxDecimals = 4) {
    if (num === undefined || num === null || isNaN(num)) return "0";
    return Number(num).toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
  }

  async function initApp() {
    initTheme();

    try {
      const response = await fetch("./portfolio.json");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const rawList = Array.isArray(data.portfolio) ? data.portfolio : (Array.isArray(data) ? data : []);
      portfolioStocks = rawList.filter(item => item.Ticker && item.Name && item.Qty !== undefined);
    } catch (err) {
      console.error("Failed to load portfolio.json:", err);
      portfolioStocks = [];
    }

    populateDropdown(portfolioStocks);
    attachEventListeners();
  }

  function initTheme() {
    if (!themeToggle) return;
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      const newTheme = currentTheme === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("stockpulse-theme", newTheme);
    });
  }

  function populateDropdown(stocks) {
    tickerSelect.innerHTML = `<option value="" disabled selected>-- Select a stock --</option>`;
    const sortedStocks = [...stocks].sort((a, b) => a.Ticker.localeCompare(b.Ticker));
    sortedStocks.forEach(stock => {
      const option = document.createElement("option");
      option.value = stock.Ticker;
      option.textContent = `${stock.Ticker} - ${stock.Name}`;
      tickerSelect.appendChild(option);
    });
  }

  function selectStock(ticker) {
    const stock = portfolioStocks.find(s => s.Ticker === ticker);
    if (!stock) return;

    selectedStock = stock;

    // Section 1 details
    currentQtyEl.textContent = formatNumber(stock.Qty);
    avgBuyPriceEl.textContent = `$${formatNumber(stock["Avg Buy Price (P/S)"])}`;
    allocationEl.textContent = `${formatNumber(stock["Allocation (%)"], 2)}%`;

    stockDetails.style.display = "block";
    calculateSection1();
  }

  // Section 1: Calculate % Change from entered purchase quantity
  function calculateSection1() {
    if (!selectedStock) return;

    const currentQty = Number(selectedStock.Qty) || 0;
    const purchaseVal = parseFloat(purchaseQtyInput.value);
    const purchaseQty = (!isNaN(purchaseVal) && purchaseVal >= 0) ? purchaseVal : 0;

    if (purchaseQty === 0 || currentQty === 0) {
      currentCalculatedPct = 0;
      percentageChangeEl.textContent = "0.00%";
      percentageChangeEl.style.color = "var(--text-secondary, #64748b)";
    } else {
      currentCalculatedPct = (purchaseQty / currentQty) * 100;
      percentageChangeEl.textContent = `+${currentCalculatedPct.toFixed(2)}%`;
      percentageChangeEl.style.color = "var(--green-500, #16a34a)";
    }

    // Automatically update Section 2 with the new % change
    calculateSection2();
  }

  // Section 2: Calculate Stock to Buy using Section 2 Current Qty and Section 1 % Change
  function calculateSection2() {
    const currentQtyVal = parseFloat(calcCurrentQtyInput.value);
    const currentQty = (!isNaN(currentQtyVal) && currentQtyVal >= 0) ? currentQtyVal : 0;

    if (currentQty === 0 || currentCalculatedPct === 0) {
      calcStockToBuyEl.textContent = "0";
      calcNewTotalQtyEl.textContent = formatNumber(currentQty);
    } else {
      const stockToBuy = currentQty * (currentCalculatedPct / 100);
      const newTotal = currentQty + stockToBuy;

      calcStockToBuyEl.textContent = formatNumber(stockToBuy);
      calcNewTotalQtyEl.textContent = formatNumber(newTotal);
    }
  }

  function attachEventListeners() {
    // Section 1 listeners
    tickerSelect.addEventListener("change", (e) => {
      selectStock(e.target.value);
    });

    purchaseQtyInput.addEventListener("input", calculateSection1);

    // Section 2 listener (takes % change automatically from section 1)
    calcCurrentQtyInput.addEventListener("input", calculateSection2);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
