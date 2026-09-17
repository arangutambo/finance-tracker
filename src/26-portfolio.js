// --- Portfolio -------------------------------------------------------------------
// Trades live in a portfolio note; prices come from the source chosen in settings
// — typed by hand, a published Google Sheet, or Yahoo — and every fetched price is
// cached, so the portfolio still renders offline or while a source is refusing.
//
// Network use is opt-in: with the price source left on "typed prices", nothing
// here makes a request.

const PORTFOLIO_BLOCK = "finance-portfolio";
const YAHOO_THROTTLE_MS = 400;

Object.assign(FinanceTrackerPlugin.prototype, {
  getPortfolioNotePath() {
    return normalizePath(this.settings.portfolioNotePath || DEFAULT_SETTINGS.portfolioNotePath);
  },

  buildPortfolioNoteContent() {
    return [
      "---",
      "# Prices you type in always win, e.g. VAS.AX=103.42, AAPL=229.10",
      "price_overrides: ",
      "# AUD per unit of a foreign currency, e.g. USD=1.51",
      "fx_rates: ",
      "---",
      "",
      "# 📈 Portfolio",
      "",
      "Figures here are arithmetic on the trades below, for your own records — not",
      "financial or tax advice.",
      "",
      "```finance-portfolio",
      "```",
      "",
      "## Trades",
      "",
      "Type is buy, sell, drp (dividend reinvestment) or split. For a split, Units is",
      "the ratio: 2 for a 2-for-1, 0.5 for a 1-for-2 consolidation. For a trade in",
      "another currency, AUD cost is what actually left your account, fees included.",
      "Log dividends in your daily notes as `#log/income/dividend/<ticker>`.",
      "",
      "| Date | Type | Ticker | Units | Price | Fees | Currency | AUD cost | Account | Note |",
      "| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |",
      "",
    ].join("\n");
  },

  async ensurePortfolioNote() {
    const path = this.getPortfolioNotePath();
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    return this.ensureTextFile(path, () => this.buildPortfolioNoteContent());
  },

  async loadPortfolio() {
    const file = this.app.vault.getAbstractFileByPath(this.getPortfolioNotePath());
    if (!(file instanceof TFile)) return { exists: false, trades: [], warnings: [], overrides: {}, fxOverrides: {} };
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = parseFrontmatter(content);
    const { trades, warnings } = core.parseTradesTable(content);
    const fxOverrides = {};
    for (const [currency, rate] of Object.entries(core.parsePriceOverrides(frontmatter.fx_rates || ""))) {
      fxOverrides[core.normalizeCurrency(currency)] = rate;
    }
    return {
      exists: true,
      content,
      file,
      trades,
      warnings,
      overrides: core.parsePriceOverrides(frontmatter.price_overrides || ""),
      fxOverrides,
    };
  },

  marketCache() {
    const cache = this.settings.marketCache && typeof this.settings.marketCache === "object" ? this.settings.marketCache : {};
    cache.quotes = cache.quotes || {};
    cache.history = cache.history || {};
    cache.fx = cache.fx || {};
    cache.fxHistory = cache.fxHistory || {};
    cache.dividends = cache.dividends || {};
    this.settings.marketCache = cache;
    return cache;
  },

  // Typed prices first, then the cache, marked stale when it is old.
  portfolioQuotes(portfolio) {
    const cache = this.marketCache();
    const quotes = core.markStaleQuotes(cache.quotes, {
      maxAgeMinutes: Math.max(60, Number(this.settings.priceRefreshMinutes) || 60) * 2,
    });
    for (const [ticker, price] of Object.entries(portfolio?.overrides || {})) {
      quotes[ticker] = { ...(quotes[ticker] || {}), price, source: "manual", stale: false };
    }
    return quotes;
  },

  portfolioFx(portfolio) {
    return { ...this.marketCache().fx, ...(portfolio?.fxOverrides || {}) };
  },

  async requestJson(url) {
    const response = await requestUrl({ url, method: "GET", throw: false, headers: { Accept: "application/json" } });
    return { status: response.status, json: response.json, text: response.text };
  },

  // Refreshes prices from the chosen source. Respects the refresh interval and
  // any backoff a source has earned by refusing; `force` skips the interval but
  // never the backoff, since hammering a source that is refusing only extends it.
  async refreshPrices(options = {}) {
    const source = this.settings.priceSource || "manual";
    const cache = this.marketCache();
    const now = Date.now();
    if (source === "manual") return { skipped: "manual" };

    if (cache.backoffUntil && Date.parse(cache.backoffUntil) > now) {
      return { skipped: "backoff", until: cache.backoffUntil, error: cache.lastError || "" };
    }
    const intervalMs = Math.max(5, Number(this.settings.priceRefreshMinutes) || 60) * 60 * 1000;
    if (!options.force && cache.lastRefresh && now - Date.parse(cache.lastRefresh) < intervalMs) {
      return { skipped: "fresh" };
    }

    const portfolio = options.portfolio || (await this.loadPortfolio());
    const tickers = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)));
    const currencies = Array.from(new Set(portfolio.trades.map((trade) => trade.currency).filter((currency) => currency !== "AUD")));
    if (!tickers.length) return { skipped: "no-trades" };

    const result = source === "sheet" ? await this.refreshFromSheet(cache) : await this.refreshFromYahoo(cache, tickers, currencies);
    cache.lastRefresh = new Date().toISOString();
    if (result.refused) {
      const backoff = core.nextBackoff(cache.failures || 0);
      cache.failures = backoff.failures;
      cache.backoffUntil = backoff.until;
      cache.lastError = result.error;
    } else if (!result.error) {
      cache.failures = 0;
      cache.backoffUntil = "";
      cache.lastError = "";
    } else {
      cache.lastError = result.error;
    }
    await this.saveSettings();
    return result;
  },

  async refreshFromSheet(cache) {
    const url = String(this.settings.priceSheetUrl || "").trim();
    if (!url) return { updated: 0, error: "Add the published sheet's CSV link in settings first." };
    const response = await requestUrl({ url, method: "GET", throw: false });
    if (response.status === 429 || response.status >= 500) return { updated: 0, refused: true, error: `The sheet answered ${response.status}.` };
    if (response.status >= 400) return { updated: 0, error: `The sheet answered ${response.status} — check it is published as CSV.` };
    const parsed = core.parseSheetPrices(response.text);
    if (parsed.error) return { updated: 0, error: parsed.error };
    const fetchedAt = new Date().toISOString();
    for (const [ticker, quote] of Object.entries(parsed.quotes)) {
      cache.quotes[ticker] = { ...quote, source: "sheet", fetchedAt };
    }
    Object.assign(cache.fx, parsed.fx);
    return { updated: Object.keys(parsed.quotes).length };
  },

  async refreshFromYahoo(cache, tickers, currencies) {
    let updated = 0;
    const errors = [];
    const fetchedAt = () => new Date().toISOString();
    const pause = () => new Promise((resolve) => setTimeout(resolve, this._yahooThrottleMs ?? YAHOO_THROTTLE_MS));

    const fetchChart = async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div`;
      const response = await this.requestJson(url);
      if (response.status === 429 || response.status >= 500) return { refused: true, status: response.status };
      if (response.status >= 400) return { error: `${symbol}: ${response.status}` };
      return core.parseYahooChart(response.json);
    };

    for (const [index, ticker] of tickers.entries()) {
      if (index) await pause();
      const chart = await fetchChart(ticker);
      if (chart.refused) {
        return { updated, refused: true, error: `Yahoo refused requests (${chart.status}). Cached prices are shown until it recovers.` };
      }
      if (chart.error || !chart.quote) {
        errors.push(chart.error || `${ticker}: no price`);
        continue;
      }
      cache.quotes[ticker] = { ...chart.quote, source: "yahoo", fetchedAt: fetchedAt() };
      cache.history[ticker] = chart.history;
      cache.dividends[ticker] = chart.dividends;
      updated += 1;
    }

    for (const currency of currencies) {
      await pause();
      // AUDUSD=X is US dollars per Australian dollar; the portfolio wants the
      // reverse, AUD per unit of the foreign currency.
      const chart = await fetchChart(`AUD${currency}=X`);
      if (chart.refused) return { updated, refused: true, error: `Yahoo refused requests (${chart.status}).` };
      if (!chart.quote?.price) continue;
      cache.fx[currency] = Number((1 / chart.quote.price).toFixed(6));
      cache.fxHistory[currency] = chart.history.map((point) => ({ date: point.date, audPerUnit: Number((1 / point.close).toFixed(6)) }));
    }

    return { updated, error: errors.join("; ") };
  },

  // Tickers for autocomplete: those already traded, plus Yahoo's search when it is
  // the chosen source and is not in backoff.
  async searchTickers(query) {
    const needle = core.normalizeTicker(query);
    const portfolio = await this.loadPortfolio();
    const own = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)))
      .filter((ticker) => !needle || ticker.includes(needle))
      .map((ticker) => ({ symbol: ticker, name: this.marketCache().quotes[ticker]?.name || "", exchange: core.tickerMarket(ticker), type: "" }));

    const cache = this.marketCache();
    const blocked = cache.backoffUntil && Date.parse(cache.backoffUntil) > Date.now();
    if (this.settings.priceSource !== "yahoo" || blocked || String(query || "").trim().length < 2) return own;

    const response = await this.requestJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(String(query).trim())}&quotesCount=8&newsCount=0`
    );
    if (response.status !== 200) return own;
    const found = core.parseYahooSearch(response.json).filter((result) => !own.some((item) => item.symbol === result.symbol));
    return [...own, ...found];
  },

  // Everything the portfolio block draws, in one place.
  async buildPortfolioModel(referenceDate = core.todayIsoLocal()) {
    const portfolio = await this.loadPortfolio();
    const fx = this.portfolioFx(portfolio);
    const quotes = this.portfolioQuotes(portfolio);
    const holdings = core.buildHoldings(portfolio.trades, { fx, referenceDate });
    const value = core.valuePortfolio(holdings, quotes, fx);
    const dividends = core.summarizeDividends(await this.collectAllTransactions(), holdings, { referenceDate });
    const cache = this.marketCache();
    const series = core.buildPortfolioValueSeries(portfolio.trades, cache.history, cache.fxHistory, {
      end: referenceDate,
      fx,
      stepDays: 7,
    });

    // Money in and out, for an annualised return: buys out, sales and dividends
    // in, and what is held now as if sold today.
    const cashflows = [];
    for (const trade of portfolio.trades) {
      if (trade.type === "split") continue;
      const gross = trade.units * trade.price;
      const rate = trade.currency === "AUD" ? 1 : Number(fx[trade.currency]) || 0;
      if (trade.type === "buy") cashflows.push({ date: trade.date, amount: -(trade.audCost ?? (gross + trade.fees) * rate) });
      if (trade.type === "sell") cashflows.push({ date: trade.date, amount: trade.audCost ?? (gross - trade.fees) * rate });
    }
    for (const row of dividends.rows) for (const payment of row.payments) cashflows.push({ date: payment.date, amount: payment.amount });
    if (value.totals.valueAud > 0) cashflows.push({ date: referenceDate, amount: value.totals.valueAud });

    return {
      cache,
      dividends,
      holdings,
      portfolio,
      quotes,
      series,
      source: this.settings.priceSource || "manual",
      value,
      xirr: core.computeXirr(cashflows),
    };
  },
});

