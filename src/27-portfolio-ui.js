// --- Portfolio block and trade logging --------------------------------------------

Object.assign(FinanceTrackerPlugin.prototype, {
  describePriceSource(model) {
    const cache = model.cache || {};
    const when = (iso) => (iso ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
    if (model.source === "manual") return "Prices are the ones typed into this note's properties.";
    const label = model.source === "sheet" ? "your Google Sheet" : "Yahoo Finance";
    if (cache.backoffUntil && Date.parse(cache.backoffUntil) > Date.now()) {
      return `${label} is refusing requests, so the last prices fetched are shown. Trying again after ${when(cache.backoffUntil)}.`;
    }
    if (cache.lastError) return `Prices from ${label}, last refreshed ${when(cache.lastRefresh) || "never"} — ${cache.lastError}`;
    return cache.lastRefresh ? `Prices from ${label}, refreshed ${when(cache.lastRefresh)}.` : `Prices from ${label} — not fetched yet.`;
  },

  async renderPortfolioBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = core.todayIsoLocal();
    const currency = "AUD";
    const rerender = () => this.renderPortfolioBlock(source, el, ctx);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-portfolio" });

    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Portfolio" });
    const actions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(actions, "Log trade", () => this.openLogTrade({ onSaved: rerender }), { primary: true, opensModal: true });
    addAction(actions, "Add to watchlist", () => this.openAddToWatchlist({ onSaved: rerender }), { opensModal: true });

    let model = await this.buildPortfolioModel(referenceDate);
    if (!model.portfolio.exists) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "No portfolio note yet. Logging a trade creates one." });
      return;
    }
    if (model.source !== "manual") {
      addAction(
        actions,
        "Refresh prices",
        async () => {
          const result = await this.refreshPrices({ force: true, portfolio: model.portfolio });
          if (result.refused || result.error) new Notice(result.error || "Could not refresh prices.");
          await rerender();
        },
        { errorPrefix: "Refreshing prices" }
      );
      // Opening the portfolio is the moment prices are wanted, so a refresh is
      // attempted then — no background polling. The interval and any backoff
      // still apply.
      if (config.refresh !== "no") {
        const result = await this.refreshPrices({ portfolio: model.portfolio });
        if (!result.skipped) model = await this.buildPortfolioModel(referenceDate);
      }
    }

    wrapper.createDiv({ cls: "finance-tracker-budget-meta finance-portfolio-source", text: this.describePriceSource(model) });

    if (!model.portfolio.trades.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: model.watchlist.length
          ? "No trades yet. Your watchlist is below; log a trade when you buy."
          : "No trades yet. Log one, add rows to the Trades table below, or add a ticker to your watchlist to follow it first.",
      });
      this.renderWatchlist(wrapper, model, rerender);
      return;
    }

    const totals = model.value.totals;
    const signed = (amount) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${core.formatCurrency(Math.abs(amount), currency)}`;
    renderStatCards(wrapper, [
      { label: "Value", value: core.formatCurrency(totals.valueAud, currency), hint: model.value.missing.length ? `${model.value.missing.length} unpriced` : "" },
      { label: "Cost base", value: core.formatCurrency(totals.costAud, currency) },
      {
        label: "Gain",
        value: signed(totals.gainAud),
        hint: totals.gainPct === null ? "" : `${totals.gainPct > 0 ? "+" : ""}${totals.gainPct}%`,
        cls: totals.gainAud < 0 ? "is-over" : "is-down",
      },
      { label: "Today", value: signed(totals.dayChangeAud) },
      { label: "Realised", value: signed(totals.realisedAud) },
      { label: "Dividends, 12 months", value: core.formatCurrency(model.dividends.lastTwelveMonths, currency) },
      ...(model.xirr === null ? [] : [{ label: "Annualised return", value: `${(model.xirr * 100).toFixed(1)}%` }]),
    ]);

    this.renderHoldingsTable(wrapper, model, currency);
    this.renderDividendsToLog(wrapper, model, rerender);
    this.renderWatchlist(wrapper, model, rerender);

    if (model.value.missing.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `No price for ${model.value.missing.join(", ")}. Type one into this note's price_overrides (e.g. ${model.value.missing[0]}=10.50), or choose a price source in settings.`,
      });
    }

    const pricedRows = model.value.rows.filter((row) => row.valueAud > 0);
    if (pricedRows.length) {
      // The same two-ring donut the spending dashboards use: markets inside,
      // holdings outside.
      const groups = model.value.allocation.byMarket.map((market, index) => {
        const base = core.categoryBaseColor(index);
        const children = pricedRows
          .filter((row) => row.market === market.key)
          .map((row, childIndex, list) => ({
            key: row.ticker,
            label: row.ticker,
            total: row.valueAud,
            color: core.categoryShadeColor(base, childIndex, list.length),
            children: [],
          }));
        return { key: market.key, label: market.key, total: market.value, color: core.categoryShadeColor(base, 0), children };
      });
      const hierarchy = { groups, slices: groups.flatMap((group) => group.children) };
      const donut = wrapper.createDiv({ cls: "finance-portfolio-allocation" });
      this.renderPieChart(donut, hierarchy, currency, 0.06, { title: "Allocation" });
    }

    this.renderPortfolioValueChart(wrapper, model, currency, config);

    if (model.dividends.rows.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Dividends" });
      const table = section.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Ticker", "Last 12 months", "All time", "Yield on cost"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const row of model.dividends.rows) {
        const tr = body.createEl("tr");
        tr.createEl("td", { text: row.ticker });
        tr.createEl("td", { text: core.formatCurrency(row.lastTwelveMonths, currency), cls: "is-numeric" });
        tr.createEl("td", { text: core.formatCurrency(row.total, currency), cls: "is-numeric" });
        tr.createEl("td", { text: row.yieldOnCostPct === null ? "—" : `${row.yieldOnCostPct}%`, cls: "is-numeric" });
      }
    }

    const tradesSection = wrapper.createEl("details", { cls: "finance-tracker-chart-card" });
    tradesSection.createEl("summary", { text: `Trades (${model.portfolio.trades.length})` });
    const tradeTable = tradesSection.createEl("table", { cls: "finance-tracker-table" });
    const tradeHead = tradeTable.createEl("thead").createEl("tr");
    for (const label of ["Date", "Type", "Ticker", "Units", "Price", "Account"]) tradeHead.createEl("th", { text: label });
    const tradeBody = tradeTable.createEl("tbody");
    for (const trade of model.portfolio.trades.slice().reverse().slice(0, 40)) {
      const tr = tradeBody.createEl("tr");
      tr.createEl("td", { text: trade.date });
      tr.createEl("td", { text: trade.type });
      tr.createEl("td", { text: trade.ticker });
      tr.createEl("td", { text: String(trade.units), cls: "is-numeric" });
      tr.createEl("td", { text: trade.price === null ? "—" : core.formatCurrencyWithCode(trade.price, trade.currency), cls: "is-numeric" });
      tr.createEl("td", { text: trade.account || "" });
    }

    const warnings = [...model.portfolio.warnings, ...model.holdings.warnings];
    if (warnings.length) {
      const section = wrapper.createEl("details", { cls: "finance-tracker-chart-card" });
      section.createEl("summary", { text: `Rows to check (${warnings.length})` });
      for (const warning of warnings) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: [warning.ticker, warning.row ? `row ${warning.row}` : "", warning.reason].filter(Boolean).join(" · "),
        });
      }
    }

    wrapper.createDiv({
      cls: "finance-tracker-budget-meta finance-portfolio-disclaimer",
      text: "Arithmetic on your own records, not financial or tax advice. The CGT discount flag is a reminder to check, not a ruling.",
    });
  },

  renderHoldingsTable(wrapper, model, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-portfolio-holdings" });
    section.createEl("h4", { text: "Holdings" });
    const scroller = section.createDiv({ cls: "finance-portfolio-scroll" });
    const table = scroller.createEl("table", { cls: "finance-tracker-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const label of ["Holding", "Month", "Units", "Avg cost", "Price", "Value", "Gain", "Today", "Weight"]) head.createEl("th", { text: label });
    const body = table.createEl("tbody");

    for (const row of model.value.rows) {
      const tr = body.createEl("tr", { cls: "is-clickable" });
      const name = tr.createEl("td");
      name.createDiv({ text: row.ticker, cls: "finance-portfolio-ticker" });
      if (row.name && row.name !== row.ticker) name.createDiv({ text: row.name, cls: "finance-tracker-budget-meta" });
      this.renderSparkline(tr.createEl("td", { cls: "finance-portfolio-spark-cell" }), core.sliceHistory(model.cache.history?.[row.ticker], 1));
      tr.createEl("td", { text: String(Number(row.units.toFixed(4))), cls: "is-numeric" });
      tr.createEl("td", { text: core.formatCurrencyWithCode(row.averageCostNative, row.currency), cls: "is-numeric" });
      const price = tr.createEl("td", { cls: "is-numeric" });
      price.setText(row.price === null ? "—" : core.formatCurrencyWithCode(row.price, row.currency));
      if (row.stale) price.createSpan({ cls: "finance-portfolio-stale", text: " old" });
      tr.createEl("td", { text: row.valueAud === null ? "—" : core.formatCurrency(row.valueAud, currency), cls: "is-numeric" });
      const gain = tr.createEl("td", { cls: "is-numeric" });
      if (row.gainAud === null) gain.setText("—");
      else {
        gain.setText(`${core.formatCurrency(row.gainAud, currency)}${row.gainPct === null ? "" : ` (${row.gainPct}%)`}`);
        gain.addClass(row.gainAud < 0 ? "is-negative" : "is-positive");
      }
      tr.createEl("td", { text: row.dayChangePct === null ? "—" : `${row.dayChangePct}%`, cls: "is-numeric" });
      tr.createEl("td", { text: `${row.weight}%`, cls: "is-numeric" });

      // The holding's own page: chart, trades, parcels.
      tr.setAttribute("aria-label", `Open ${row.ticker}`);
      tr.addEventListener("click", () => this.openTickerDetail(row.ticker));
    }
  },

  // Today's move across your shares, for the hub's Today tab. Uses the price
  // refresh the portfolio already does, so its interval and backoff apply.
  async renderMarketToday(host) {
    const portfolio = await this.loadPortfolio();
    if (!portfolio.exists || !portfolio.trades.length) return false;
    if ((this.settings.priceSource || "manual") !== "manual") {
      await this.refreshPrices({ portfolio }).catch(() => {});
    }
    const model = await this.buildPortfolioModel();
    const totals = model.value.totals;
    if (!(totals.valueAud > 0)) return false;

    const card = host.createDiv({ cls: "finance-tracker-chart-card finance-market-today is-clickable" });
    card.setAttribute("aria-label", "Open the portfolio");
    card.createEl("h4", { text: "Shares today" });
    const day = Number(totals.dayChangeAud) || 0;
    const before = totals.valueAud - day;
    const pct = before > 0 ? Number(((day / before) * 100).toFixed(2)) : null;
    renderStatCards(card, [
      {
        label: "Today",
        value: `${day > 0 ? "+" : day < 0 ? "−" : ""}${core.formatCurrency(Math.abs(day), "AUD")}`,
        hint: pct === null ? "" : `${pct > 0 ? "+" : ""}${pct}%`,
        cls: day < 0 ? "is-over" : day > 0 ? "is-down" : "",
      },
      { label: "Value", value: core.formatCurrency(totals.valueAud, "AUD") },
    ]);
    const moved = model.value.rows.filter((row) => row.dayChangePct !== null && row.dayChangePct !== undefined);
    const bits = [];
    if (moved.length) {
      const biggest = moved.reduce((best, row) => (Math.abs(row.dayChangePct) > Math.abs(best.dayChangePct) ? row : best));
      bits.push(`Biggest move: ${biggest.ticker} ${biggest.dayChangePct > 0 ? "+" : ""}${biggest.dayChangePct}%`);
    }
    if (model.dividendsToLog.length) bits.push(`${model.dividendsToLog.length} dividend${model.dividendsToLog.length === 1 ? "" : "s"} to log`);
    if (model.value.rows.some((row) => row.stale)) bits.push("some prices are old");
    if (bits.length) card.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });
    card.addEventListener("click", () => this.activateHubView("portfolio"));
    return true;
  },

  // A month of closes as a small line, rising green or falling red.
  renderSparkline(host, points, options = {}) {
    if (!points || points.length < 2) {
      host.createSpan({ cls: "finance-tracker-budget-meta", text: "—" });
      return null;
    }
    const W = options.width || 80;
    const H = options.height || 22;
    const closes = points.map((point) => point.close);
    const min = Math.min(...closes);
    const span = Math.max(...closes) - min || 1;
    const coords = closes
      .map((close, index) => `${((index * W) / (closes.length - 1)).toFixed(1)},${(H - 2 - ((close - min) / span) * (H - 4)).toFixed(1)}`)
      .join(" ");
    const svg = host.createSvg("svg", {
      cls: ["finance-portfolio-spark", closes[closes.length - 1] >= closes[0] ? "is-up" : "is-down"],
      attr: { viewBox: `0 0 ${W} ${H}`, width: W, height: H, preserveAspectRatio: "none", role: "img", "aria-label": "Price over the last month" },
    });
    svg.createSvg("polyline", { attr: { points: coords } });
    return svg;
  },

  renderWatchlist(wrapper, model, rerender) {
    if (!model.watchlist.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-portfolio-watchlist" });
    section.createEl("h4", { text: `Watchlist (${model.watchlist.length})` });
    if (model.source === "manual" && model.watchlist.some((item) => item.price === null)) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Watchlist prices come from a price source. Choose Yahoo or a Google Sheet in Settings → Portfolio, or type prices into price_overrides.",
      });
    }
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const item of model.watchlist) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card is-clickable finance-portfolio-watch-row" });
      row.setAttribute("aria-label", `Open ${item.ticker}`);
      const left = row.createDiv({ cls: "finance-portfolio-watch-name" });
      left.createDiv({ cls: "finance-portfolio-ticker", text: item.ticker });
      if (item.name) left.createDiv({ cls: "finance-tracker-budget-meta", text: item.name });
      this.renderSparkline(row.createDiv({ cls: "finance-portfolio-watch-spark" }), item.spark);
      const right = row.createDiv({ cls: "finance-portfolio-watch-figures" });
      const price = right.createDiv({ cls: "ft-row-amount", text: item.price === null ? "—" : core.formatCurrencyWithCode(item.price, item.currency) });
      if (item.stale) price.createSpan({ cls: "finance-portfolio-stale", text: " old" });
      const bits = [];
      if (item.dayChangePct !== null) bits.push(`${item.dayChangePct > 0 ? "+" : ""}${item.dayChangePct}% today`);
      if (item.month?.pct !== null && item.month?.pct !== undefined) bits.push(`${item.month.pct > 0 ? "+" : ""}${item.month.pct}% this month`);
      if (bits.length) right.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });
      row.addEventListener("click", () => this.openTickerDetail(item.ticker, { onChanged: rerender }));
    }
  },

  // Dividends Yahoo says you were paid and haven't logged. Each is an estimate
  // until you confirm the amount that actually arrived.
  renderDividendsToLog(wrapper, model, rerender) {
    const items = model.dividendsToLog || [];
    if (!items.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-portfolio-dividends-due" });
    section.createEl("h4", { text: `Dividends to log (${items.length})` });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "From Yahoo's dividend history and the units you held before each ex-date. Check the amount against what was paid: withholding and rounding change it.",
    });
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const item of items) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, `${item.ticker} · ex ${item.exDate}`, item.amountAud === null ? core.formatCurrencyWithCode(item.amountNative, item.currency) : core.formatCurrency(item.amountAud, "AUD"));
      row.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${item.units} units × ${core.formatCurrencyWithCode(item.perUnit, item.currency)} a unit`,
      });
      const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
      addAction(actions, "Log it", () => this.openLogDividend(item, { onSaved: rerender }), { primary: true, opensModal: true });
      addAction(actions, "Dismiss", async () => {
        await this.dismissDividend(item.id);
        await rerender();
      }, { tooltip: "Don't list this dividend again" });
    }
  },

  renderPortfolioValueChart(wrapper, model, currency, config) {
    const points = model.series.filter((point) => point.valueAud > 0 || point.costAud > 0);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const header = section.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h4", { text: "Value and cost" });
    if (points.length < 2) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: model.source === "manual"
          ? "The history chart needs past prices, which typed prices do not have. It fills in once prices come from a sheet or Yahoo."
          : "Not enough price history yet.",
      });
      return;
    }

    const ranges = [["3M", 3], ["1Y", 12], ["All", 0]];
    const bar = header.createDiv({ cls: "finance-tracker-calendar-filter-bar" });
    const chartHost = section.createDiv();
    let months = Number(config.months) || 12;

    const draw = () => {
      chartHost.empty();
      const cutoff = months ? core.addMonths(core.todayIsoLocal(), -months) : "";
      const shown = points.filter((point) => !cutoff || point.date >= cutoff);
      if (shown.length < 2) {
        chartHost.createDiv({ cls: "finance-tracker-empty", text: "Not enough history in this range." });
        return;
      }
      const W = 600;
      const H = 170;
      const pad = 8;
      const values = shown.flatMap((point) => [point.valueAud, point.costAud]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const x = (index) => pad + (index * (W - pad * 2)) / (shown.length - 1);
      const y = (value) => H - pad - ((value - min) / span) * (H - pad * 2);
      const svg = chartHost.createDiv({ cls: "finance-tracker-line-chart" }).createSvg("svg", {
        cls: ["ft-line-svg"],
        attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Portfolio value against cost base" },
      });
      const line = (key) => shown.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
      svg.createSvg("polyline", { cls: ["ft-line-path", "finance-portfolio-cost-line"], attr: { points: line("costAud") } });
      svg.createSvg("polyline", { cls: ["ft-line-path"], attr: { points: line("valueAud") } });
      const last = shown[shown.length - 1];
      const axis = chartHost.createDiv({ cls: "finance-tracker-line-axis" });
      axis.createSpan({ text: shown[0].date });
      axis.createSpan({
        text: `${last.date} · value ${core.formatCurrency(last.valueAud, currency)} · cost ${core.formatCurrency(last.costAud, currency)}`,
      });
    };

    const buttons = [];
    for (const [label, count] of ranges) {
      const button = bar.createEl("button", { cls: "finance-tracker-calendar-filter-button", text: label });
      buttons.push(button);
      if (count === months) button.addClass("is-active");
      button.addEventListener("click", () => {
        months = count;
        for (const other of buttons) other.toggleClass("is-active", other === button);
        draw();
      });
    }
    draw();
  },

  // Appends a trade as a row of the Trades table, creating the note (and the
  // table) if needed. The note stays the record: this writes exactly what a
  // person would have typed.
  async appendTrade(trade) {
    const file = await this.ensurePortfolioNote();
    const content = await this.app.vault.cachedRead(file);
    const cell = (value) => (value === null || value === undefined ? "" : String(value).replace(/\|/g, "/"));
    const row = `| ${[
      trade.date,
      trade.type,
      core.normalizeTicker(trade.ticker),
      trade.units,
      trade.type === "split" ? "" : trade.price,
      trade.fees || "",
      trade.currency || "",
      trade.audCost || "",
      trade.account || "",
      trade.note || "",
    ].map(cell).join(" | ")} |`;

    const lines = String(content).split("\n");
    const headerIndex = lines.findIndex((line) => /^\s*\|/.test(line) && /\btype\b/i.test(line) && /\bticker\b/i.test(line));
    if (headerIndex < 0) {
      const trimmed = lines.join("\n").replace(/\n+$/, "");
      const table = [
        "",
        "## Trades",
        "",
        "| Date | Type | Ticker | Units | Price | Fees | Currency | AUD cost | Account | Note |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |",
        row,
        "",
      ];
      await _ftModify(this.app, file, `${trimmed}\n${table.join("\n")}`);
      return row;
    }
    let insertAt = headerIndex + 2;
    while (insertAt < lines.length && /^\s*\|/.test(lines[insertAt])) insertAt += 1;
    lines.splice(insertAt, 0, row);
    await _ftModify(this.app, file, lines.join("\n"));
    return row;
  },

  openTickerDetail(ticker, options = {}) {
    const modal = new TickerDetailModal(this.app, this, { ticker, ...options });
    modal.open();
    return modal;
  },

  openAddToWatchlist(options = {}) {
    const modal = new AddToWatchlistModal(this.app, this, options);
    modal.open();
    return modal;
  },

  openLogDividend(item, options = {}) {
    const modal = new LogDividendModal(this.app, this, item, options);
    modal.open();
    return modal;
  },

  openLogTrade(options = {}) {
    const modal = new LogTradeModal(this.app, this, options);
    modal.open();
    return modal;
  },

  async openPortfolioNote() {
    const file = await this.ensurePortfolioNote();
    await this.app.workspace.getLeaf(true).openFile(file);
  },
});

class LogTradeModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onSaved = options.onSaved;
    this.presetTicker = options.ticker || "";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Log a trade" });

    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const typeSelect = row("Type").createEl("select", { attr: { "aria-label": "Trade type" } });
    for (const [value, label] of [["buy", "Buy"], ["sell", "Sell"], ["drp", "Dividend reinvestment"], ["split", "Split or consolidation"]]) {
      typeSelect.createEl("option", { text: label, value });
    }

    const dateInput = row("Date").createEl("input", { type: "date", attr: { "aria-label": "Trade date" } });
    dateInput.value = core.todayIsoLocal();

    const tickerInput = row("Ticker").createEl("input", {
      type: "text",
      attr: { placeholder: "VAS.AX or AAPL", "aria-label": "Ticker" },
    });
    tickerInput.value = this.presetTicker;
    // Suggestions are fetched as you type; a small cache keeps each query to one
    // request, and the list is never allowed to block typing a ticker directly.
    const found = new Map();
    let pending = "";
    this.tickerSuggest = new FinanceSuggest(tickerInput, {
      scope: this.scope,
      getItems: (query) => {
        const key = String(query || "").trim().toLowerCase();
        if (key && !found.has(key) && pending !== key) {
          pending = key;
          this.plugin
            .searchTickers(query)
            .then((results) => {
              found.set(key, results);
              if (String(tickerInput.value || "").trim().toLowerCase() === key) this.tickerSuggest.refresh();
            })
            .catch(() => found.set(key, []));
        }
        return (found.get(key) || []).slice(0, 8).map((result) => ({
          value: result.symbol,
          label: result.symbol,
          kind: result.exchange || "",
          hint: result.name || "",
        }));
      },
      onChoose: (item) => {
        currencySelect.value = core.tickerMarket(item.value) === "US" ? "USD" : "AUD";
        syncCurrency();
      },
    });
    contentEl.createEl("p", { cls: "finance-edit-hint", text: "ASX tickers end in .AX; US tickers are written plain." });

    const unitsRow = contentEl.createDiv({ cls: "finance-edit-row" });
    const unitsLabel = unitsRow.createEl("label", { text: "Units" });
    const unitsInput = unitsRow.createEl("input", { type: "number", attr: { step: "any", inputmode: "decimal", "aria-label": "Units" } });
    const priceRow = row("Price");
    const priceInput = priceRow.createEl("input", { type: "number", attr: { step: "any", inputmode: "decimal", "aria-label": "Price" } });
    const feesRow = row("Brokerage");
    const feesInput = feesRow.createEl("input", { type: "number", attr: { step: "0.01", inputmode: "decimal", "aria-label": "Brokerage" } });

    const currencySelect = row("Currency").createEl("select", { attr: { "aria-label": "Currency" } });
    for (const code of ["AUD", "USD", "NZD", "GBP", "EUR"]) currencySelect.createEl("option", { text: code, value: code });
    const audRow = row("AUD cost");
    const audInput = audRow.createEl("input", {
      type: "number",
      attr: { step: "0.01", inputmode: "decimal", "aria-label": "AUD cost" },
    });
    const audHint = contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "What actually left your account in dollars, brokerage included. Without it the cost is estimated at today's rate.",
    });

    const accountInput = row("Account").createEl("input", { type: "text", attr: { placeholder: "Pearler", "aria-label": "Account" } });
    const noteInput = row("Note").createEl("input", { type: "text", attr: { "aria-label": "Note" } });

    const syncCurrency = () => {
      const foreign = currencySelect.value !== "AUD";
      audRow.toggleClass("is-hidden", !foreign);
      audHint.toggleClass("is-hidden", !foreign);
    };
    const syncType = () => {
      const split = typeSelect.value === "split";
      priceRow.toggleClass("is-hidden", split);
      feesRow.toggleClass("is-hidden", split);
      unitsLabel.setText(split ? "Ratio" : "Units");
    };
    currencySelect.addEventListener("change", syncCurrency);
    typeSelect.addEventListener("change", syncType);
    syncCurrency();
    syncType();

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Log trade", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const trade = {
          type: typeSelect.value,
          date: core.parseIsoDate(dateInput.value),
          ticker: core.normalizeTicker(tickerInput.value),
          units: core.parseNumber(unitsInput.value),
          price: typeSelect.value === "split" ? null : core.parseNumber(priceInput.value),
          fees: core.parseNumber(feesInput.value) || 0,
          currency: currencySelect.value,
          audCost: currencySelect.value === "AUD" ? null : core.parseNumber(audInput.value) || null,
          account: accountInput.value.trim(),
          note: noteInput.value.trim(),
        };
        if (!trade.date || !trade.ticker) throw new Error("A trade needs a date and a ticker.");
        if (!(trade.units > 0)) throw new Error(trade.type === "split" ? "Give the split ratio, e.g. 2 for a 2-for-1." : "Give the number of units.");
        if (trade.type !== "split" && !(trade.price >= 0)) throw new Error("Give the price per unit.");
        await this.plugin.appendTrade(trade);
        new Notice(`Logged ${trade.type} of ${trade.units} ${trade.ticker}.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(error.message);
        save.disabled = false;
      }
    });
    if (this.presetTicker) {
      currencySelect.value = core.tickerMarket(this.presetTicker) === "US" ? "USD" : "AUD";
      syncCurrency();
    }
    window.setTimeout(() => (this.presetTicker ? unitsInput : tickerInput).focus(), 0);
  }

  onClose() {
    this.tickerSuggest?.destroy();
    this.contentEl.empty();
  }
}

