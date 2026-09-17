// --- Dashboard sections -----------------------------------------------------------
// The review sections of `finance-dashboard`. Each one renders nothing when it
// has nothing to say, so a quiet week doesn't fill up with empty cards. The
// numbers come from finance-core; these only lay them out.

function periodWordFor(range) {
  const period = String(range?.period || "").toLowerCase();
  return ["day", "week", "fortnight", "month", "quarter", "year"].includes(period) ? period : "period";
}

function formatSignedChange(delta, currency) {
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return `${arrow} ${core.formatCurrency(Math.abs(delta), currency)}`;
}

Object.assign(FinanceTrackerPlugin.prototype, {
  renderIncomeSection(wrapper, allEntries, currency, range, goalKeys = []) {
    const summary = core.summarizeIncomeAndSavings(allEntries, { goalKeys });
    const word = periodWordFor(range);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-income" });
    section.createEl("h4", { text: "Income and savings" });
    if (!summary.incomeCount) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `No income logged this ${word}, so there's no savings rate. Log pay as #log/income/salary to see one.`,
      });
      return;
    }
    const rate = Math.round(summary.savingsRate * 100);
    renderStatCards(section, [
      { label: "Income", value: core.formatCurrency(summary.income, currency) },
      { label: "Spent", value: core.formatCurrency(summary.spending, currency) },
      {
        label: summary.saved >= 0 ? "Saved" : "Overspent",
        value: core.formatCurrency(Math.abs(summary.saved), currency),
        cls: summary.saved < 0 ? "is-over" : "",
      },
      { label: "Savings rate", value: `${rate}%`, cls: rate < 0 ? "is-over" : "" },
    ]);
    if (summary.sources.length > 1) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `From ${summary.sources.map((row) => `${row.label} ${core.formatCurrency(row.total, currency)}`).join(" · ")}`,
      });
    }
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "Goal contributions, settle-ups and trip spending are transfers, so they're left out.",
    });
  },

  renderUncategorisedCallout(wrapper, entries, currency, range) {
    const { count, total } = core.summarizeUncategorised(entries);
    if (!count) return;
    const callout = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-callout" });
    callout.createDiv({
      cls: "finance-dashboard-callout-text",
      text: `${count} entr${count === 1 ? "y" : "ies"} this ${periodWordFor(range)} (${core.formatCurrency(total, currency)}) ${
        count === 1 ? "has" : "have"
      } no category yet, so ${count === 1 ? "it's" : "they're"} counted as Uncategorized.`,
    });
    addAction(callout.createDiv({ cls: "finance-tracker-header-actions" }), "Open inbox", () => this.activateHubView("inbox"), {
      primary: true,
      opensModal: true,
    });
  },

  renderCategoryChanges(wrapper, entries, previousEntries, currency, range) {
    const { rows, previousTotal } = core.compareCategoryTotals(entries, previousEntries, { limit: 6 });
    // Against an empty previous period every category is "new", which says
    // nothing.
    if (!rows.length || !(previousTotal > 0)) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-changes" });
    section.createEl("h4", { text: `Change vs previous ${periodWordFor(range)}` });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const row of rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      item.addClass(row.delta > 0 ? "is-up" : "is-down");
      renderRowTitle(item, row.label, formatSignedChange(row.delta, currency));
      const pct = row.pct === null ? "new" : `${row.pct >= 0 ? "+" : ""}${row.pct}%`;
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${core.formatCurrency(row.previous, currency)} → ${core.formatCurrency(row.current, currency)} (${pct})`,
      });
    }
  },

  renderTopMerchants(wrapper, entries, currency) {
    const result = core.summarizeTopMerchants(entries, { limit: 5 });
    if (!result.rows.length) return;
    const spend = entries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-merchants" });
    section.createEl("h4", { text: "Top merchants" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const row of result.rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(item, row.label, core.formatCurrency(row.total, currency));
      const share = spend > 0 ? Math.round((row.total / spend) * 100) : 0;
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${row.count} visit${row.count === 1 ? "" : "s"} · ${share}% of spending`,
      });
    }
    if (result.unnamedCount) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${result.unnamedCount} entr${result.unnamedCount === 1 ? "y" : "ies"} (${core.formatCurrency(result.unnamedTotal, currency)}) ${
          result.unnamedCount === 1 ? "has" : "have"
        } no merchant.`,
      });
    }
  },

  renderLargestTransactions(wrapper, entries, currency) {
    const rows = core.largestTransactions(entries, { limit: 5 });
    if (!rows.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-largest" });
    section.createEl("h4", { text: "Largest transactions" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const { entry, spend } of rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
      const name = core.cleanMerchantDisplay(entry.merchant || "") || entry.categoryDisplay || core.displayCategoryPath(entry.category || "uncategorized");
      renderRowTitle(item, name, core.formatCurrency(spend, currency));
      const bits = [entry.date, core.displayCategoryPath(entry.category || "uncategorized")];
      if (spend < Number(entry.amount || 0)) bits.push(`your share of ${core.formatCurrency(entry.amount, currency)}`);
      item.createDiv({ cls: "finance-tracker-budget-meta", text: bits.filter(Boolean).join(" · ") });
      item.setAttribute("aria-label", "Edit this transaction");
      item.addEventListener("click", () => this.openEditTransaction(entry));
    }
  },

  // What was paid in the period, and — for a period that isn't over yet — what
  // is still to come in it and in the one after. A past week only gets the
  // first part: "due next week" for a week in May is history, not a plan.
  async renderBillsForPeriod(wrapper, allEntries, currency, range) {
    const today = core.todayIsoLocal();
    const prefix = core.normalizeCategoryPath(this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    const recurring = await this.detectRecurring(today, prefix);
    const labels = new Map(recurring.items.map((item) => [core.normalizeCategoryPath(item.category || ""), item.label]));
    const paid = core.summarizeBillPayments(allEntries, { prefix, labels });

    let stillDue = [];
    let dueNext = [];
    let nextRange = null;
    if (range.end >= today) {
      nextRange = core.nextPeriodRange(range, { weekStartsOn: this.settings.weekStartsOn });
      const from = range.start > today ? range.start : today;
      const { occurrences } = core.sumRecurringDueWithin(recurring, from, nextRange.end);
      stillDue = occurrences.filter((occurrence) => occurrence.date <= range.end);
      dueNext = occurrences.filter((occurrence) => occurrence.date > range.end);
    }
    if (!paid.count && !stillDue.length && !dueNext.length) return;

    const word = periodWordFor(range);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-bills" });
    section.createEl("h4", { text: "Bills" });

    const group = (title, rows) => {
      section.createDiv({ cls: "finance-dashboard-subheading", text: title });
      const list = section.createDiv({ cls: "finance-tracker-budget-list" });
      for (const row of rows) {
        const item = list.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(item, row.label, core.formatCurrency(row.amount, currency));
        if (row.meta) item.createDiv({ cls: "finance-tracker-budget-meta", text: row.meta });
      }
    };

    if (paid.count) {
      group(
        `Paid this ${word}: ${core.formatCurrency(paid.total, currency)}`,
        paid.rows.map((row) => ({
          label: row.label,
          amount: row.total,
          meta: row.count > 1 ? `${row.count} payments` : row.dates[0] || "",
        }))
      );
    }
    const occurrenceRows = (list) => list.map((occurrence) => ({ label: occurrence.label, amount: occurrence.amount, meta: occurrence.date }));
    if (stillDue.length) group(`Still due this ${word}`, occurrenceRows(stillDue));
    if (dueNext.length) {
      const total = core.roundCurrencyAmount(dueNext.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0));
      group(`Due next ${word}: ${core.formatCurrency(total, currency)}`, occurrenceRows(dueNext));
    }
  },

  renderTripSpendSection(wrapper, allEntries, currency) {
    const trips = core.summarizeTripSpend(allEntries);
    if (!trips.rows.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-trips" });
    section.createEl("h4", { text: `Trip spending: ${core.formatCurrency(trips.total, currency)}` });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "Paid from trip savings, so it isn't in the totals above.",
    });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const trip of trips.rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(item, trip.label, core.formatCurrency(trip.total, currency));
      item.createDiv({ cls: "finance-tracker-budget-meta", text: `${trip.count} entr${trip.count === 1 ? "y" : "ies"}` });
    }
  },

  // Money moved into and out of shares during the period, dividends received,
  // and — when there is price history for both ends — how the value changed.
  // Never fetches: a dashboard in a weekly note is not a reason to call out.
  async renderPortfolioChange(wrapper, allEntries, currency, range) {
    const portfolio = await this.loadPortfolio();
    if (!portfolio?.exists || !portfolio.trades?.length) return;
    const today = core.todayIsoLocal();
    const model = await this.buildPortfolioModel(range.end < today ? range.end : today);
    const fx = this.portfolioFx(portfolio);
    const audValue = (trade, sign) => {
      if (Number.isFinite(trade.audCost)) return trade.audCost;
      const rate = trade.currency === "AUD" ? 1 : Number(fx[trade.currency]) || 0;
      return (trade.units * trade.price + sign * (trade.fees || 0)) * rate;
    };
    const inRange = portfolio.trades.filter((trade) => core.isDateInRange(trade.date, range));
    const bought = core.roundCurrencyAmount(inRange.filter((trade) => trade.type === "buy").reduce((sum, trade) => sum + audValue(trade, 1), 0));
    const sold = core.roundCurrencyAmount(inRange.filter((trade) => trade.type === "sell").reduce((sum, trade) => sum + audValue(trade, -1), 0));
    const dividends = core.roundCurrencyAmount(
      allEntries
        .filter((entry) => entry.entryType === "income" && core.normalizeCategoryPath(entry.category || "").startsWith("dividend/"))
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );

    const series = model.series || [];
    const pointAt = (date) => series.filter((point) => point.date <= date).pop() || null;
    const startPoint = pointAt(core.addDays(range.start, -1));
    const endPoint = pointAt(range.end);

    const cards = [];
    if (core.isDateInRange(today, range) && model.value?.totals?.valueAud > 0) {
      cards.push({ label: "Value now", value: core.formatCurrency(model.value.totals.valueAud, currency) });
    }
    if (startPoint?.complete && endPoint?.complete && startPoint.date !== endPoint.date) {
      const change = core.roundCurrencyAmount(endPoint.valueAud - startPoint.valueAud);
      cards.push({
        label: "Value change",
        value: formatSignedChange(change, currency),
        hint: bought || sold ? "includes buying and selling" : "",
      });
    }
    if (bought) cards.push({ label: "Bought", value: core.formatCurrency(bought, currency) });
    if (sold) cards.push({ label: "Sold", value: core.formatCurrency(sold, currency) });
    if (dividends) cards.push({ label: "Dividends", value: core.formatCurrency(dividends, currency) });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-portfolio" });
    section.createEl("h4", { text: "Portfolio" });
    if (cards.length) {
      renderStatCards(section, cards);
    } else {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `No trades or dividends this ${periodWordFor(range)}, and no price history to compare values with.`,
      });
    }
    section.createDiv({ cls: "finance-tracker-budget-meta", text: "For information only, not financial advice." });
  },
});
