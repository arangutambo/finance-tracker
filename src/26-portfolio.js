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
      "# Tickers to follow without owning them, e.g. [VGS.AX, NDQ.AX]",
      "watchlist: ",
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
      "Dividends are logged in your daily notes as `#log/income/dividend/<ticker>`; with",
      "prices from Yahoo, the portfolio lists the ones you were paid and haven't logged.",
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
    if (!(file instanceof TFile)) return { exists: false, trades: [], warnings: [], overrides: {}, fxOverrides: {}, watchlist: [] };
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = parseFrontmatter(content);
    // Obsidian's own frontmatter reader understands block lists; ours reads the
    // one-line form, and covers the moment before the cache catches up.
    const cached = this.app.metadataCache?.getFileCache?.(file)?.frontmatter;
    const watchlistValue = cached && "watchlist" in cached ? cached.watchlist : frontmatter.watchlist;
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
      watchlist: core.parseWatchlist(watchlistValue || ""),
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

  async requestJson(url, headers = {}) {
    const response = await requestUrl({ url, method: "GET", throw: false, headers: { Accept: "application/json", ...headers } });
    let json = null;
    try {
      json = response.json;
    } catch (_error) {
      // A refusal page is HTML, and reading it as JSON throws.
    }
    return { status: response.status, json, text: response.text };
  },

  // One Yahoo request: each host in turn, with a browser's User-Agent and a
  // timeout. `refused` only when every host refused.
  async yahooJson(path) {
    let last = { status: 0, refused: true };
    for (const host of core.YAHOO_HOSTS) {
      let response;
      try {
        response = await Promise.race([
          this.requestJson(`https://${host}${path}`, { "User-Agent": core.YAHOO_USER_AGENT }),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("timed out")), this._yahooTimeoutMs ?? core.YAHOO_TIMEOUT_MS)),
        ]);
      } catch (error) {
        last = { status: 0, refused: true, error: error.message };
        continue;
      }
      if (response.status === 429 || response.status >= 500 || response.status === 0) {
        last = { status: response.status, refused: true };
        continue;
      }
      return response;
    }
    return last;
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
    const tickers = Array.from(new Set([...portfolio.trades.map((trade) => trade.ticker), ...(portfolio.watchlist || [])]));
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
      const response = await this.yahooJson(core.yahooChartPath(symbol));
      if (response.refused) return { refused: true, status: response.status };
      if (response.status === 404) return { error: `${symbol}: Yahoo doesn't know this ticker` };
      if (response.status >= 400) return { error: `${symbol}: ${response.status}` };
      return core.parseYahooChart(response.json);
    };

    for (const [index, ticker] of tickers.entries()) {
      if (index) await pause();
      const chart = await fetchChart(ticker);
      if (chart.refused) {
        return { updated, refused: true, error: `Yahoo refused requests${chart.status ? ` (${chart.status})` : ""}. Cached prices are shown until it recovers.` };
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
      if (chart.refused) return { updated, refused: true, error: `Yahoo refused requests${chart.status ? ` (${chart.status})` : ""}.` };
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

    const response = await this.yahooJson(core.yahooSearchPath(query));
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

    // Tickers followed but not held: price, today, the last month.
    const held = new Set(value.rows.map((row) => row.ticker));
    const watchlist = (portfolio.watchlist || []).filter((ticker) => !held.has(ticker)).map((ticker) => {
      const quote = quotes[ticker] || null;
      const price = Number(quote?.price);
      const previous = Number(quote?.previousClose);
      const history = cache.history[ticker] || [];
      return {
        ticker,
        name: quote?.name || "",
        currency: quote?.currency || (core.tickerMarket(ticker) === "US" ? "USD" : "AUD"),
        price: price > 0 ? price : null,
        dayChangePct: price > 0 && previous > 0 ? Number((((price - previous) / previous) * 100).toFixed(2)) : null,
        month: core.priceChangeOver(history, 1, referenceDate),
        spark: core.sliceHistory(history, 1, referenceDate),
        stale: Boolean(quote?.stale),
      };
    });

    const currencies = Object.fromEntries(Object.entries(quotes).map(([ticker, quote]) => [ticker, quote?.currency || ""]));
    const dividendsToLog = core.findUnloggedDividends({
      trades: portfolio.trades,
      dividendEvents: cache.dividends,
      entries: await this.collectAllTransactions(),
      fx,
      currencies,
      referenceDate,
      dismissed: this.settings.dismissedDividends || [],
    });

    return {
      cache,
      dividends,
      dividendsToLog,
      holdings,
      portfolio,
      quotes,
      series,
      source: this.settings.priceSource || "manual",
      value,
      watchlist,
      xirr: core.computeXirr(cashflows),
    };
  },

  async addToWatchlist(ticker) {
    const symbol = core.normalizeTicker(ticker);
    if (!symbol) throw new Error("type a ticker, like VGS.AX");
    const file = await this.ensurePortfolioNote();
    const portfolio = await this.loadPortfolio();
    if ((portfolio.watchlist || []).includes(symbol)) return false;
    const content = await this.app.vault.read(file);
    await _ftModify(this.app, file, setFrontmatterList(content, "watchlist", [...portfolio.watchlist, symbol]));
    // Fetched straight away, rather than waiting out the refresh interval.
    if ((this.settings.priceSource || "manual") !== "manual") {
      await this.refreshPrices({ force: true, portfolio: { ...portfolio, watchlist: [...portfolio.watchlist, symbol] } });
    }
    this.refreshDailyBudgetView();
    return true;
  },

  async removeFromWatchlist(ticker) {
    const symbol = core.normalizeTicker(ticker);
    const file = this.app.vault.getAbstractFileByPath(this.getPortfolioNotePath());
    if (!(file instanceof TFile)) return false;
    const portfolio = await this.loadPortfolio();
    if (!portfolio.watchlist.includes(symbol)) return false;
    const content = await this.app.vault.read(file);
    await _ftModify(this.app, file, setFrontmatterList(content, "watchlist", portfolio.watchlist.filter((item) => item !== symbol)));
    this.refreshDailyBudgetView();
    return true;
  },

  // Logs a dividend as income in the day's note, with where the figure came from.
  async logDividend(item, amount, date) {
    const value = core.roundCurrencyAmount(amount);
    if (!(value > 0)) throw new Error("the amount must be more than zero");
    const lines = [
      `- ${core.formatCurrency(value, this.settings.defaultCurrency)} ${core.dividendTag(item.ticker)}`,
      `\t- ${item.ticker} dividend, ex ${item.exDate} (${item.units} units × ${core.formatCurrencyWithCode(item.perUnit, item.currency)})`,
    ];
    const file = await this.appendFinanceLines(core.parseIsoDate(date) || core.todayIsoLocal(), lines);
    this.refreshDailyBudgetView();
    return file;
  },

  async dismissDividend(id) {
    this.settings.dismissedDividends = Array.from(new Set([...(this.settings.dismissedDividends || []), id]));
    await this.saveSettings();
    this.refreshDailyBudgetView();
  },
});

