// --- Stocks: a holding's page, the watchlist, dividends ---------------------------

const TICKER_RANGES = [
  ["1M", 1],
  ["3M", 3],
  ["6M", 6],
  ["1Y", 12],
  ["2Y", 24],
];

// One ticker, held or watched: its price over time with your trades marked on
// it, your average cost as a line, and what you hold. Everything drawn comes
// from the cache the portfolio already keeps — opening this never fetches.
class TickerDetailModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.ticker = core.normalizeTicker(options.ticker || "");
    this.onChanged = options.onChanged;
    this.months = 6;
  }

  async onOpen() {
    this.modalEl?.addClass?.("finance-wide-modal");
    await this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-ticker-detail");
    const plugin = this.plugin;
    const ticker = this.ticker;
    const model = await plugin.buildPortfolioModel();
    const row = model.value.rows.find((item) => item.ticker === ticker) || null;
    const watching = (model.portfolio.watchlist || []).includes(ticker);
    const quote = model.quotes[ticker] || null;
    const history = model.cache.history?.[ticker] || [];
    const currency = quote?.currency || row?.currency || (core.tickerMarket(ticker) === "US" ? "USD" : "AUD");
    const trades = model.portfolio.trades.filter((trade) => trade.ticker === ticker);

    const header = contentEl.createDiv({ cls: "finance-ticker-header" });
    header.createEl("h2", { text: ticker });
    const described = [quote?.name, quote?.exchange].filter((bit) => bit && bit !== ticker);
    if (described.length) header.createDiv({ cls: "finance-tracker-budget-meta", text: described.join(" · ") });

    const price = Number(quote?.price);
    const previous = Number(quote?.previousClose);
    const priceLine = contentEl.createDiv({ cls: "finance-ticker-price" });
    if (price > 0) {
      priceLine.createSpan({ cls: "finance-ticker-price-value", text: core.formatCurrencyWithCode(price, currency) });
      if (previous > 0) {
        const change = price - previous;
        const pct = ((change / previous) * 100).toFixed(2);
        priceLine.createSpan({
          cls: `finance-ticker-price-change ${change >= 0 ? "is-positive" : "is-negative"}`,
          text: ` ${change >= 0 ? "+" : "−"}${core.formatCurrencyWithCode(Math.abs(change), currency)} (${change >= 0 ? "+" : ""}${pct}%) today`,
        });
      }
      if (quote?.stale) priceLine.createSpan({ cls: "finance-portfolio-stale", text: " old" });
    } else {
      priceLine.createSpan({
        cls: "finance-tracker-budget-meta",
        text: "No price yet. Choose Yahoo or a Google Sheet in Settings → Portfolio, or type one into the portfolio note's price_overrides.",
      });
    }

    const chips = contentEl.createDiv({ cls: "finance-hub-chips finance-ticker-ranges" });
    for (const [label, months] of TICKER_RANGES) {
      const chip = chips.createEl("button", { cls: "finance-hub-chip", text: label, attr: { "aria-pressed": String(months === this.months) } });
      if (months === this.months) chip.addClass("is-active");
      chip.addEventListener("click", async () => {
        this.months = months;
        await this.render();
      });
    }
    this.drawChart(contentEl.createDiv({ cls: "finance-ticker-chart" }), {
      history,
      trades,
      currency,
      averageCost: row && row.currency === currency ? row.averageCostNative : null,
      dividends: model.cache.dividends?.[ticker] || [],
      source: model.source,
    });

    if (row) {
      const firstBought = row.parcels.map((parcel) => parcel.acquired).sort()[0] || "";
      renderStatCards(contentEl, [
        { label: "Units", value: String(Number(row.units.toFixed(4))) },
        { label: "Value", value: row.valueAud === null ? "—" : core.formatCurrency(row.valueAud, "AUD") },
        { label: "Average cost", value: core.formatCurrencyWithCode(row.averageCostNative, row.currency) },
        {
          label: "Gain",
          value: row.gainAud === null ? "—" : core.formatCurrency(row.gainAud, "AUD"),
          hint: row.gainPct === null ? "" : `${row.gainPct > 0 ? "+" : ""}${row.gainPct}%`,
          cls: row.gainAud < 0 ? "is-over" : "",
        },
        ...(firstBought ? [{ label: "Held since", value: firstBought }] : []),
      ]);
      const parcels = contentEl.createDiv({ cls: "finance-tracker-chart-card" });
      parcels.createEl("h4", { text: "Parcels" });
      for (const parcel of row.parcels) {
        parcels.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${parcel.acquired} · ${Number(parcel.units.toFixed(4))} units · cost ${core.formatCurrency(parcel.costAud, "AUD")}${
            parcel.discountEligible ? " · held 12 months+" : ""
          }`,
        });
      }
      if (row.realisedAud) parcels.createDiv({ cls: "finance-tracker-budget-meta", text: `Realised so far: ${core.formatCurrency(row.realisedAud, "AUD")}` });
      if (row.accounts.length) parcels.createDiv({ cls: "finance-tracker-budget-meta", text: `Held with ${row.accounts.join(", ")}` });
    } else {
      contentEl.createDiv({
        cls: "finance-tracker-budget-meta",
        text: watching ? "On your watchlist. You don't hold any." : "You don't hold any, and it isn't on your watchlist.",
      });
    }

    const paid = (model.cache.dividends?.[ticker] || []).slice(-4).reverse();
    if (paid.length) {
      const section = contentEl.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Recent dividends" });
      for (const dividend of paid) {
        section.createDiv({ cls: "finance-tracker-budget-meta", text: `ex ${dividend.date} · ${core.formatCurrencyWithCode(dividend.amount, currency)} a unit` });
      }
    }

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(actions, "Log trade", () => {
      this.close();
      plugin.openLogTrade({ ticker, onSaved: this.onChanged });
    }, { primary: true, opensModal: true });
    if (!row) {
      addAction(actions, watching ? "Remove from watchlist" : "Add to watchlist", async () => {
        if (watching) await plugin.removeFromWatchlist(ticker);
        else await plugin.addToWatchlist(ticker);
        if (typeof this.onChanged === "function") await this.onChanged();
        await this.render();
      }, { errorPrefix: "Watchlist" });
    }
    const link = actions.createEl("a", {
      cls: "finance-ticker-link external-link",
      text: "Open on Yahoo Finance",
      attr: { href: core.yahooQuoteUrl(ticker), target: "_blank", rel: "noopener" },
    });
    link.setAttribute("aria-label", `${ticker} on Yahoo Finance, in your browser`);

    contentEl.createDiv({
      cls: "finance-tracker-budget-meta finance-portfolio-disclaimer",
      text: "Arithmetic on your own records and published prices, not financial or tax advice.",
    });
  }

  drawChart(host, options) {
    const points = core.sliceHistory(options.history, this.months);
    if (points.length < 2) {
      host.createDiv({
        cls: "finance-tracker-empty",
        text: options.source === "yahoo"
          ? "No price history yet. It arrives with the next price refresh."
          : "The chart needs past prices, which come from Yahoo. Typed prices and a sheet only give today's.",
      });
      return;
    }
    const W = 640;
    const H = 220;
    const pad = 12;
    const closes = points.map((point) => point.close);
    const levels = [...closes];
    if (options.averageCost > 0) levels.push(options.averageCost);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    const span = max - min || 1;
    const x = (index) => pad + (index * (W - pad * 2)) / (points.length - 1);
    const y = (value) => H - pad - ((value - min) / span) * (H - pad * 2);
    const indexFor = (date) => {
      const found = points.findIndex((point) => point.date >= date);
      return found === -1 ? points.length - 1 : found;
    };

    const svg = host.createSvg("svg", {
      cls: ["finance-ticker-svg"],
      attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": `Price over ${this.months} months` },
    });
    if (options.averageCost > 0) {
      const level = y(options.averageCost).toFixed(1);
      svg.createSvg("line", { cls: ["finance-ticker-cost-line"], attr: { x1: pad, x2: W - pad, y1: level, y2: level } });
    }
    const rising = closes[closes.length - 1] >= closes[0];
    svg.createSvg("polyline", {
      cls: ["finance-ticker-line", rising ? "is-up" : "is-down"],
      attr: { points: points.map((point, index) => `${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ") },
    });

    const first = points[0].date;
    for (const dividend of options.dividends || []) {
      if (dividend.date < first || dividend.date > points[points.length - 1].date) continue;
      const cx = x(indexFor(dividend.date)).toFixed(1);
      const tick = svg.createSvg("line", { cls: ["finance-ticker-dividend"], attr: { x1: cx, x2: cx, y1: H - pad, y2: H - pad + 6, "data-kind": "dividend" } });
      tick.createSvg("title").textContent = `Ex-dividend ${dividend.date}: ${core.formatCurrencyWithCode(dividend.amount, options.currency)} a unit`;
    }
    const verbs = { buy: "Bought", sell: "Sold", drp: "Reinvested", split: "Split" };
    for (const trade of options.trades || []) {
      if (trade.date < first) continue;
      const index = indexFor(trade.date);
      const level = trade.price > 0 && trade.currency === options.currency ? trade.price : points[index].close;
      const marker = svg.createSvg("circle", {
        cls: ["finance-ticker-trade", `is-${trade.type}`],
        attr: { cx: x(index).toFixed(1), cy: y(level).toFixed(1), r: 5, "data-kind": trade.type },
      });
      marker.createSvg("title").textContent = `${verbs[trade.type] || trade.type} ${trade.units}${
        trade.price > 0 ? ` at ${core.formatCurrencyWithCode(trade.price, trade.currency)}` : ""
      } on ${trade.date}`;
    }

    const axis = host.createDiv({ cls: "finance-tracker-line-axis" });
    axis.createSpan({ text: `${first} · ${core.formatCurrencyWithCode(points[0].close, options.currency)}` });
    axis.createSpan({
      text: `${points[points.length - 1].date} · ${core.formatCurrencyWithCode(points[points.length - 1].close, options.currency)}`,
    });
    const legend = host.createDiv({ cls: "finance-tracker-budget-meta finance-ticker-legend" });
    const bits = [];
    if (options.averageCost > 0) bits.push(`dashed line: your average cost, ${core.formatCurrencyWithCode(options.averageCost, options.currency)}`);
    if ((options.trades || []).some((trade) => trade.date >= first)) bits.push("dots: your trades");
    if ((options.dividends || []).some((dividend) => dividend.date >= first)) bits.push("ticks: ex-dividend dates");
    if (bits.length) legend.setText(`${bits.join(" · ")}.`);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class AddToWatchlistModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onSaved = options.onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Add to watchlist" });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Follow a share or ETF without owning it. It's saved in the portfolio note's watchlist property.",
    });
    const row = contentEl.createDiv({ cls: "finance-edit-row" });
    row.createEl("label", { text: "Ticker" });
    const input = row.createEl("input", { type: "text", attr: { placeholder: "VGS.AX or MSFT", "aria-label": "Ticker" } });
    const found = new Map();
    let pending = "";
    this.suggest = new FinanceSuggest(input, {
      scope: this.scope,
      getItems: (query) => {
        const key = String(query || "").trim().toLowerCase();
        if (key.length >= 2 && !found.has(key) && pending !== key) {
          pending = key;
          this.plugin
            .searchTickers(query)
            .then((results) => {
              found.set(key, results);
              if (String(input.value || "").trim().toLowerCase() === key) this.suggest.refresh();
            })
            .catch(() => found.set(key, []));
        }
        return (found.get(key) || []).slice(0, 8).map((result) => ({ value: result.symbol, label: result.symbol, kind: result.exchange || "", hint: result.name || "" }));
      },
    });
    contentEl.createEl("p", { cls: "finance-edit-hint", text: "ASX tickers end in .AX; US tickers are written plain." });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Add", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const ticker = core.normalizeTicker(input.value);
        const added = await this.plugin.addToWatchlist(ticker);
        new Notice(added ? `${ticker} is on your watchlist.` : `${ticker} was already on your watchlist.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Couldn't add it: ${error.message}`);
        save.disabled = false;
      }
    });
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.suggest?.destroy();
    this.contentEl.empty();
  }
}

class LogDividendModal extends Modal {
  constructor(app, plugin, item, options = {}) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onSaved = options.onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    const item = this.item;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: `Log a dividend: ${item.ticker}` });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: `Ex-date ${item.exDate}: ${item.units} units × ${core.formatCurrencyWithCode(item.perUnit, item.currency)} = ${core.formatCurrencyWithCode(
        item.amountNative,
        item.currency
      )}. Change the amount to what was actually paid in, in ${this.plugin.settings.defaultCurrency}.`,
    });
    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amount = amountRow.createEl("input", { type: "number", attr: { step: "0.01", inputmode: "decimal", "aria-label": "Amount" } });
    amount.value = item.amountAud === null ? "" : String(item.amountAud);
    const dateRow = contentEl.createDiv({ cls: "finance-edit-row" });
    dateRow.createEl("label", { text: "Paid on" });
    const date = dateRow.createEl("input", { type: "date", attr: { "aria-label": "Paid on" } });
    date.value = item.suggestedDate;
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "It's logged in that day's note as dividend income. If it was reinvested, log the new units as a dividend reinvestment trade too.",
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Log dividend", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await this.plugin.logDividend(item, core.parseNumber(amount.value), date.value);
        new Notice(`Logged the ${item.ticker} dividend.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Couldn't log it: ${error.message}`);
        save.disabled = false;
      }
    });
    window.setTimeout(() => amount.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}
