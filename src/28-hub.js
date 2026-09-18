// --- Finance hub ------------------------------------------------------------------
// What each hub tab shows. Almost all of it is the render code the blocks and
// the sidebar already use, given a fresh element and no source note.

const HUB_REVIEW_PERIODS = [
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
];

Object.assign(FinanceTrackerPlugin.prototype, {
  createHubView(leaf) {
    return new FinanceHubView(leaf, this);
  },

  openInsertBlock(editor, sourcePath = "") {
    const modal = new InsertBlockModal(this.app, this, editor, sourcePath);
    modal.open();
    return modal;
  },

  async activateHubView(tab = "") {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FINANCE_HUB_VIEW)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: FINANCE_HUB_VIEW, active: true, state: tab ? { tab } : {} });
    } else if (tab && typeof leaf.view?.showTab === "function") {
      await leaf.view.showTab(tab);
    }
    workspace.revealLeaf(leaf);
    return leaf;
  },

  async renderHubTab(tab, host, view) {
    switch (tab) {
      case "inbox":
        return this.renderHubInbox(host, view);
      case "budgets":
        return this.renderHubBudgets(host, view);
      case "bills":
        return this.renderRecurringBlock("", host.createDiv(), { sourcePath: "" });
      case "goals":
        return this.renderHubGoals(host, view);
      case "portfolio":
        return this.renderHubPortfolio(host, view);
      case "reviews":
        return this.renderHubReviews(host, view);
      default:
        return this.renderDailyBudgetCheckInto(host.createDiv(), core.todayIsoLocal(), "full", { inHub: true });
    }
  },

  // Bills that want attention now, bills still unclaimed, then the
  // categorisation inbox. Legacy vaults without bill notes get a pointer to the
  // Bills tab rather than a second copy of the old list.
  async hubBillsNeedingAttention(referenceDate = core.todayIsoLocal()) {
    const recurring = await this.detectRecurring(referenceDate);
    if (!recurring.billsMode) {
      const due = recurring.items.filter((item) => item.active !== false && (item.status === "overdue" || item.status === "due"));
      return { recurring, due, suggestions: [] };
    }
    const live = recurring.items.filter((item) => item.active);
    const due = live.filter((item) => ["overdue", "soon"].includes(this.billGroupFor(item, referenceDate)));
    const ignored = new Set(this.settings.ignoredBillSuggestions || []);
    const suggestions = (recurring.suggestions || []).filter((suggestion) => !ignored.has(suggestion.id));
    return { recurring, due, live, suggestions };
  },

  async countInboxItems() {
    const entries = await this.collectAllTransactions();
    const uncategorised = entries.filter((entry) => core.isUncategorisedEntry(entry)).length;
    const failed = typeof this.failedCaptureFiles === "function" ? this.failedCaptureFiles().length : 0;
    const bills = await this.hubBillsNeedingAttention();
    return uncategorised + failed + bills.due.length + bills.suggestions.length;
  },

  async renderHubInbox(host, view) {
    const today = core.todayIsoLocal();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const rerender = () => view.refresh();
    const { recurring, due, live, suggestions } = await this.hubBillsNeedingAttention(today);

    if (due.length || suggestions.length) {
      const wrapper = host.createDiv({ cls: "finance-tracker-dashboard finance-bills finance-hub-inbox-bills" });
      if (due.length) {
        const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-group is-overdue" });
        section.createEl("h4", { text: `Bills due (${due.length})` });
        if (recurring.billsMode) {
          for (const item of due) this.renderBillRow(section, item, { currency, referenceDate: today, rerender, live });
        } else {
          for (const item of due) {
            renderRowTitle(section.createDiv({ cls: "finance-tracker-budget-card" }), item.label, core.formatCurrency(item.nextDueAmount || item.lastAmount, currency));
          }
          addAction(section.createDiv({ cls: "finance-tracker-header-actions" }), "Open bills", () => view.showTab("bills"), { opensModal: true });
        }
      }
      if (suggestions.length) {
        const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-suggestions" });
        section.createEl("h4", { text: `Looks recurring (${suggestions.length})` });
        for (const suggestion of suggestions) this.renderBillSuggestion(section, suggestion, { currency, rerender, live });
      }
    }

    await this.renderCategorisationInboxInto(host.createDiv(), { title: "Uncategorised spending" });
  },

  async renderHubBudgets(host, view) {
    const budgets = await this.loadBudgets("default");
    const order = ["day", "week", "fortnight", "month", "bimonth", "quarter", "year"];
    const periods = Array.from(new Set(budgets.map((budget) => core.normalizeBudgetPeriod(budget.period)))).sort(
      (left, right) => order.indexOf(left) - order.indexOf(right)
    );

    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    if (!budgets.length) {
      addAction(toolbar, "Open budgets note", () => this.openDefaultBudgetNote(), { primary: true, errorPrefix: "Opening budgets note" });
      host.createDiv({
        cls: "finance-tracker-empty",
        text: "No budgets yet. Add rows to the budgets note (category, limit, period) and they show up here.",
      });
      return;
    }

    const fallback = core.normalizeBudgetPeriod(this.settings.budgetCheckPeriod || "week");
    const period = periods.includes(view.budgetPeriod) ? view.budgetPeriod : periods.includes(fallback) ? fallback : periods[0];
    this.renderHubChips(toolbar, periods.map((key) => [key, core.titleCaseSegment(key)]), period, (key) => {
      view.budgetPeriod = key;
      view.app.workspace?.requestSaveLayout?.();
      return view.render({ resetScroll: true });
    });

    await this.renderDashboard(
      [`period: ${period}`, `title: This ${period}`, "show: summary, budgets, uncategorised, trend, categories"].join("\n"),
      host.createDiv(),
      { sourcePath: "" }
    );
  },

  async renderHubGoals(host, view) {
    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    addAction(toolbar, "Withdraw", () => this.openContribute({ mode: "withdraw", onDone: () => view.refresh() }), { opensModal: true });
    addAction(toolbar, "New goal", () => this.openNewGoal(async () => view.refresh()), {
      opensModal: true,
    });
    addAction(toolbar, this.settings.tripModeActive ? "End trip mode" : "Start trip mode", async () => {
      if (this.settings.tripModeActive) await this.endTrip();
      else await this.startTrip();
      await view.refresh();
    }, { errorPrefix: "Trip mode" });

    await this.renderGoalPrompts(host, { rerender: () => view.refresh() });
    await this.renderGoalsBlock("", host.createDiv(), { sourcePath: "" });

    const today = core.todayIsoLocal();
    const trips = (await this.collectSavingsGoalDefinitions()).filter((goal) => goal.goalType === "holiday");
    if (!trips.length) return;
    const wrapper = host.createDiv({ cls: "finance-tracker-dashboard" });
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-hub-trips" });
    section.createEl("h4", { text: "Trips" });
    const activePath = this.settings.tripModeActive ? this.settings.activeTripGoalPath || "" : "";
    for (const trip of trips) {
      const row = section.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, trip.goalName, trip.file?.path === activePath ? "Trip mode on" : "");
      row.createDiv({ cls: "finance-tracker-budget-meta", text: this.describeTripTiming(trip, today) });
      const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
      if (trip.file) {
        addAction(actions, "Open note", () => this.app.workspace.getLeaf(false).openFile(trip.file), {
          errorPrefix: "Opening the trip",
        });
      }
    }
  },

  describeTripTiming(trip, today = core.todayIsoLocal()) {
    const start = core.parseIsoDate(trip.startDate || "");
    const end = core.parseIsoDate(trip.endDate || "");
    if (!start) return "No dates yet";
    if (today < start) {
      const days = core.daysBetweenInclusive(today, start) - 1;
      return `Starts ${start} · in ${days} day${days === 1 ? "" : "s"}`;
    }
    if (!end || today <= end) return `On now · since ${start}${end ? ` · until ${end}` : ""}`;
    return `Finished ${end}`;
  },

  async renderHubPortfolio(host) {
    // Opening the note creates it, and an empty portfolio already offers Log
    // trade, so the button only appears once there is a note to open.
    if (this.app.vault.getAbstractFileByPath(this.getPortfolioNotePath())) {
      const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
      addAction(toolbar, "Open portfolio note", () => this.openPortfolioNote(), { errorPrefix: "Opening the portfolio" });
    }
    await this.renderPortfolioBlock("", host.createDiv(), { sourcePath: this.getPortfolioNotePath() });
  },

  async renderHubReviews(host, view) {
    const today = core.todayIsoLocal();
    const period = HUB_REVIEW_PERIODS.some(([key]) => key === view.reviewPeriod) ? view.reviewPeriod : "week";
    const anchor = core.parseIsoDate(view.reviewAnchor) || today;
    const weekStartsOn = this.settings.weekStartsOn;
    const range = core.toPeriodRange({ period, referenceDate: anchor, weekStartsOn });
    const isCurrent = core.isDateInRange(today, range);

    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    this.renderHubChips(toolbar, HUB_REVIEW_PERIODS, period, (key) => {
      view.reviewPeriod = key;
      view.app.workspace?.requestSaveLayout?.();
      return view.render({ resetScroll: true });
    });

    const nav = toolbar.createDiv({ cls: "finance-hub-review-nav" });
    const goTo = (anchorDate) => {
      view.reviewAnchor = anchorDate;
      return view.render({ resetScroll: true });
    };
    addAction(nav, "‹", () => goTo(core.previousPeriodRange(range, { weekStartsOn }).start), { tooltip: `Previous ${period}` });
    const current = addAction(nav, `This ${period}`, () => goTo(""));
    if (isCurrent) current.disabled = true;
    addAction(nav, "›", () => goTo(core.nextPeriodRange(range, { weekStartsOn }).start), { tooltip: `Next ${period}` });

    addAction(toolbar, "Copy as text", async () => {
      const lines = await this.buildPeriodReview(period, range.start);
      const text = `${lines.join("\n")}\n`;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        new Notice("Review copied. Paste it into a note to keep it.");
      } else {
        new Notice("Copying isn't available here. Use Insert weekly review in a note instead.");
      }
    }, { errorPrefix: "Copying the review", tooltip: "Copy a frozen snapshot of this review as markdown" });

    const title = core.describePeriodTitle(range);
    await this.renderDashboard([`period: ${period}`, `title: ${title}`, "show: all"].join("\n"), host.createDiv(), {
      sourcePath: "",
      referenceDate: range.start,
    });
  },

  renderHubChips(host, options, selected, onSelect) {
    const chips = host.createDiv({ cls: "finance-hub-chips", attr: { role: "group" } });
    for (const [key, label] of options) {
      const chip = chips.createEl("button", { cls: "finance-hub-chip", text: label, attr: { "aria-pressed": String(key === selected) } });
      if (key === selected) chip.addClass("is-active");
      chip.addEventListener("click", () => (key !== selected ? onSelect(key) : undefined));
    }
    return chips;
  },

  // "Insert weekly review" / "Insert monthly review": the period is the note's
  // own — a review inserted into W19 covers week 19, not whatever week it is
  // when you get round to writing it up.
  async insertPeriodReview(editor, view, period) {
    const referenceDate = this.getReferenceDateForSource(view?.file?.path || "");
    const lines = await this.buildPeriodReview(period, referenceDate);
    editor.replaceSelection(`${lines.join("\n")}\n`);
  },
});
