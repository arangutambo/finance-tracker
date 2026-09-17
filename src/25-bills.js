// --- Bills list -----------------------------------------------------------------
// Plugin methods for the bill-notes model, kept out of the main class body, which
// was already six thousand lines. Attached to the prototype so they read exactly
// like any other method.

Object.assign(FinanceTrackerPlugin.prototype, {
  // Which heading a bill sits under. "Due soon" uses the bill's own reminder
  // window, so a bill you want a week's notice for shows up a week out.
  billGroupFor(item, referenceDate) {
    if (item.status === "overdue" || item.status === "due") return "overdue";
    if (!item.nextDue) return "later";
    const lead = Math.max(Number(item.reminderDays) || 0, 3);
    if (item.daysUntilDue !== null && item.daysUntilDue <= lead) return "soon";
    if (item.nextDue.slice(0, 7) === referenceDate.slice(0, 7)) return "month";
    return "later";
  },

  // Tiny inline price history: the amounts already exist, and a bill creeping up
  // is exactly the thing a list of today's prices hides.
  renderBillSparkline(host, amounts) {
    const values = (amounts || []).filter((value) => Number(value) > 0);
    if (values.length < 2) return;
    const width = 64;
    const height = 18;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * (width - 2) + 1;
        const y = height - 2 - ((value - min) / span) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const svg = host.createSvg("svg", {
      cls: ["finance-bill-spark"],
      attr: { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": "Recent amounts" },
    });
    svg.createSvg("polyline", { cls: ["finance-bill-spark-line"], attr: { points } });
  },

  async renderBillsBlock(source, el, ctx, recurring) {
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const rerender = () => this.renderRecurringBlock(source, el, ctx);
    const dueNext30Days = core.fromCents(
      core.sumRecurringDueWithin(recurring, referenceDate, core.addDays(referenceDate, 30)).totalCents
    );

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-bills" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Bills" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Add bill", () => this.openAddBill({ onSaved: rerender }), { opensModal: true });
    addAction(
      headerActions,
      "Log all due",
      async () => {
        await this.logDueRecurringPayments({ notify: true });
        await rerender();
      },
      { primary: true, errorPrefix: "Logging due bills" }
    );

    const live = recurring.items.filter((item) => item.active);
    renderStatCards(wrapper, [
      { label: "Per month", value: core.formatCurrency(recurring.totals.monthly, currency) },
      { label: "Per year", value: core.formatCurrency(recurring.totals.yearly, currency) },
      { label: "Due next 30 days", value: core.formatCurrency(dueNext30Days, currency) },
      { label: "Running bills", value: String(live.length) },
    ]);

    const groups = [
      ["overdue", "Overdue"],
      ["soon", "Due soon"],
      ["month", "Later this month"],
      ["later", "Later"],
    ];
    for (const [key, title] of groups) {
      const items = live.filter((item) => this.billGroupFor(item, referenceDate) === key);
      if (!items.length) continue;
      const section = wrapper.createDiv({ cls: `finance-tracker-chart-card finance-bills-group is-${key}` });
      section.createEl("h4", { text: `${title} (${items.length})` });
      for (const item of items) this.renderBillRow(section, item, { currency, referenceDate, rerender, live });
    }

    this.renderRecurringCalendar(wrapper, recurring, currency, referenceDate, {
      months: core.parseNumber(config.months),
      weeks: core.parseNumber(config.weeks),
    });

    const ignored = new Set(this.settings.ignoredBillSuggestions || []);
    const suggestions = (recurring.suggestions || []).filter((suggestion) => !ignored.has(suggestion.id));
    if (suggestions.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-suggestions" });
      section.createEl("h4", { text: `Looks recurring (${suggestions.length})` });
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Logged under a bill tag, but no bill claims them. Track one to give it a note, or add it to an existing bill.",
      });
      for (const suggestion of suggestions) this.renderBillSuggestion(section, suggestion, { currency, rerender, live });
    }

    const ended = recurring.items.filter((item) => !item.active);
    if (ended.length) {
      const details = wrapper.createEl("details", { cls: "finance-tracker-chart-card finance-tracker-archived" });
      details.createEl("summary", { text: `Ended and paused (${ended.length})` });
      for (const item of ended) this.renderEndedBill(details, item, { currency, rerender, live });
    }

    const runway = await this.computeRunwayState(referenceDate, { recurring, entries: await this.collectAllTransactions() });
    this.renderRunwaySection(wrapper, runway, currency);
  },

  renderBillRow(host, item, context) {
    const { currency, rerender, live } = context;
    const row = host.createDiv({ cls: "finance-tracker-budget-card finance-bill-row" });
    if (item.status === "overdue") row.addClass("is-overdue");

    const top = row.createDiv({ cls: "finance-bill-row-top" });
    const title = renderRowTitle(top, item.label, core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency));
    title.addClass("finance-bill-row-title");
    this.renderBillSparkline(top, item.recentAmounts);

    const when =
      item.status === "overdue"
        ? `overdue since ${item.nextDue}`
        : item.status === "due"
          ? "due today"
          : item.daysUntilDue === 1
            ? "due tomorrow"
            : `due ${item.nextDue}`;
    const bits = [cadenceLabel(item.cadence), when];
    if (item.variable) bits.push("varies");
    if (item.nextAmount > 0 && item.changeDate) bits.push(`${core.formatCurrency(item.nextAmount, currency)} from ${item.changeDate}`);
    if (item.endDate) bits.push(`ends ${item.endDate}`);
    if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) bits.push(`${item.paymentsLeft} left`);
    row.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });

    const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
    const isDue = item.status === "overdue" || item.status === "due";
    addAction(
      actions,
      "Mark paid",
      async () => {
        if (item.variable) {
          new LogVariableBillModal(this.app, this, item, rerender).open();
          return;
        }
        const date = await this.logRecurringNow(item);
        new Notice(`Logged ${item.label} for ${date}`);
        await rerender();
      },
      { primary: isDue, errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
    );

    // Everything else is one tap away rather than five buttons wide.
    const more = actions.createEl("button", { cls: "finance-bill-more", text: "⋯", attr: { "aria-label": "More actions" } });
    more.addEventListener("click", (event) => this.openBillMenu(event, item, { rerender, live }));
  },

  openBillMenu(event, item, context) {
    const { rerender, live } = context;
    const menu = new Menu();
    const add = (title, icon, run) =>
      menu.addItem((menuItem) =>
        menuItem
          .setTitle(title)
          .setIcon(icon)
          .onClick(async () => {
            try {
              await run();
              await rerender();
            } catch (error) {
              new Notice(`${title} failed: ${error.message}`);
            }
          })
      );

    if (item.nextDue) {
      add("Push a week", "calendar-plus", async () => {
        const nextDue = core.addDays(item.nextDue, 7);
        await this.updateRecurringItem(item, { nextDue });
        new Notice(`${item.label} now due ${nextDue}`);
      });
      add("Skip this cycle", "skip-forward", async () => {
        await this.logRecurringSkip(item);
        new Notice(`Skipped ${item.label} for ${item.nextDue}`);
      });
    }
    menu.addItem((menuItem) =>
      menuItem.setTitle("Edit").setIcon("pencil").onClick(() => new EditRecurringItemModal(this.app, this, item, rerender).open())
    );
    if (item.billId) {
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Merge into another bill…")
          .setIcon("merge")
          .onClick(() => this.openMergeBill(item, live, rerender))
      );
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Open note")
          .setIcon("file-text")
          .onClick(async () => {
            const file = this.app.vault.getAbstractFileByPath(item.notePath);
            if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
          })
      );
    }
    menu.addSeparator();
    add("Pause", "pause", () => this.updateRecurringItem(item, { active: false }));
    add("End now", "square", () => this.updateRecurringItem(item, { endDate: item.lastDate || core.todayIsoLocal() }));

    if (typeof menu.showAtMouseEvent === "function" && event) menu.showAtMouseEvent(event);
    return menu;
  },

  renderBillSuggestion(host, suggestion, context) {
    const { currency, rerender, live } = context;
    const card = host.createDiv({ cls: "finance-tracker-budget-card" });
    renderRowTitle(card, suggestion.name, core.formatCurrency(suggestion.lastAmount, currency));
    card.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${cadenceLabel(suggestion.cadence)} · ${suggestion.count} payment${suggestion.count === 1 ? "" : "s"} · last ${suggestion.lastDate}`,
    });
    const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(
      actions,
      "Track",
      async () => {
        await this.createBillFromSuggestion(suggestion);
        new Notice(`Now tracking ${suggestion.name}.`);
        await rerender();
      },
      { primary: true, errorPrefix: "Tracking" }
    );
    if (live.length) {
      addAction(
        actions,
        "Add to a bill…",
        () => this.openMergeBill({ label: suggestion.name, merchant: suggestion.merchants[0], name: suggestion.id }, live, rerender),
        { opensModal: true }
      );
    }
    addAction(
      actions,
      "Ignore",
      async () => {
        this.settings.ignoredBillSuggestions = Array.from(new Set([...(this.settings.ignoredBillSuggestions || []), suggestion.id]));
        await this.saveSettings();
        await rerender();
      },
      { errorPrefix: "Ignoring" }
    );
  },

  renderEndedBill(host, item, context) {
    const { currency, rerender, live } = context;
    const row = host.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row is-paused" });
    renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, currency));
    const reason =
      item.finishedReason === "end-date"
        ? `ended ${item.endDate}`
        : item.finishedReason === "payments"
          ? "all payments made"
          : "paused";
    row.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${cadenceLabel(item.cadence)} · ${reason} · ${item.count} payment${item.count === 1 ? "" : "s"}`,
    });
    const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(
      actions,
      item.finished ? "Restart" : "Resume",
      async () => {
        await this.updateRecurringItem(item, { active: true, ...(item.finished ? { endDate: null, paymentsLeft: null } : {}) });
        await rerender();
      },
      { primary: !item.finished, errorPrefix: `Resuming ${item.label}` }
    );
    if (item.billId && live.length) {
      addAction(actions, "Merge into…", () => this.openMergeBill(item, live, rerender), { opensModal: true });
    }
  },

  async createBillFromSuggestion(suggestion) {
    const bill = {
      id: core.normalizeBillId(suggestion.name) || suggestion.id,
      name: suggestion.name,
      aliases: Array.from(new Set([suggestion.id, ...(suggestion.merchants || [])])).filter(
        (alias) => core.normalizeBillId(alias) !== core.normalizeBillId(suggestion.name)
      ),
      cadence: suggestion.cadence,
      dueRule: { type: "after-last" },
      amount: suggestion.lastAmount,
      amountModel: "fixed",
      reminderDays: 3,
      active: true,
      autoLog: false,
      nextAmount: null,
      changeDate: null,
      endDate: null,
      paymentsLeft: null,
      nextDueOverride: null,
      skipped: [],
      startDate: suggestion.firstDate || null,
      currency: this.settings.defaultCurrency,
    };
    await this.saveBill(bill);
    return bill;
  },

  // A bill added by hand. With a first due date and no payments yet, that date is
  // the schedule's starting point; the override clears itself on the first
  // payment, like any other.
  async addBill({ name, cadence, amount = null, dueRule = { type: "after-last" }, firstDue = null }) {
    const id = core.normalizeBillId(name);
    if (!id) throw new Error("Give the bill a name.");
    if (!core.normalizeCadence(cadence)) throw new Error("Pick how often it is paid.");
    if (await this.findBill(id)) throw new Error(`There is already a bill called ${name}.`);
    const bill = {
      id,
      name: String(name).trim(),
      aliases: [],
      cadence: core.normalizeCadence(cadence),
      dueRule,
      amount,
      amountModel: "fixed",
      reminderDays: 3,
      active: true,
      autoLog: false,
      nextAmount: null,
      changeDate: null,
      endDate: null,
      paymentsLeft: null,
      nextDueOverride: firstDue,
      skipped: [],
      startDate: null,
      currency: this.settings.defaultCurrency,
    };
    await this.saveBill(bill);
    this.refreshDailyBudgetView();
    return bill;
  },

  describeDueRule(rule, cadence) {
    const ordinal = (value) => {
      const n = Number(value);
      const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
      return `${n}${suffix}`;
    };
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (rule?.type === "day-of-month") return `on the ${ordinal(rule.day)} of the month`;
    if (rule?.type === "nth-weekday") {
      const which = { 1: "first", 2: "second", 3: "third", 4: "fourth", "-1": "last" }[String(rule.ordinal)] || "first";
      return `on the ${which} ${weekdays[rule.weekday] || "Monday"}`;
    }
    return `${cadenceLabel(cadence).toLowerCase()}, counted from the last payment`;
  },

  // The block inside a bill note: what it costs, when it is next due, its price
  // history and every payment linked to it. The note is the bill, so this is
  // where a bill is looked at on its own.
  async renderBillBlock(source, el, ctx) {
    el.empty();
    const referenceDate = core.todayIsoLocal();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-bill-note" });
    const rerender = () => this.renderBillBlock(source, el, ctx);

    const recurring = await this.detectRecurring(referenceDate);
    const item = (recurring.items || []).find((entry) => entry.notePath === ctx.sourcePath);
    if (!item) {
      const merged = (await this.loadBills({ includeMerged: true })).find((bill) => bill.notePath === ctx.sourcePath);
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: merged?.mergedInto
          ? `Merged into ${merged.mergedInto}. Payments under this name count toward that bill now.`
          : "These properties do not describe a bill yet — it needs at least a bill_id and a cadence.",
      });
      return;
    }

    const status =
      item.status === "finished"
        ? item.finishedReason === "payments" ? "All payments made" : `Ended ${item.endDate}`
        : !item.active
          ? "Paused"
          : item.status === "overdue"
            ? `Overdue since ${item.nextDue}`
            : item.status === "due"
              ? "Due today"
              : item.nextDue ? `Due ${item.nextDue}` : "No due date yet";

    renderStatCards(wrapper, [
      { label: "Next payment", value: core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency) },
      { label: "When", value: status, cls: item.status === "overdue" ? "is-over" : "" },
      { label: "Per month", value: core.formatCurrency(item.monthlyCost, currency) },
      { label: "Payments logged", value: String(item.count) },
    ]);

    const about = [this.describeDueRule(item.dueRule, item.cadence)];
    if (item.variable) about.push("amount varies");
    if (item.bill?.aliases?.length) about.push(`also known as ${item.bill.aliases.join(", ")}`);
    wrapper.createDiv({ cls: "finance-tracker-budget-meta", text: about.join(" · ") });

    if (item.active) {
      const actions = wrapper.createDiv({ cls: "finance-tracker-header-actions" });
      addAction(
        actions,
        "Mark paid",
        async () => {
          if (item.variable) {
            new LogVariableBillModal(this.app, this, item, rerender).open();
            return;
          }
          const date = await this.logRecurringNow(item);
          new Notice(`Logged ${item.label} for ${date}`);
          await rerender();
        },
        { primary: item.status === "overdue" || item.status === "due", errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
      );
      if (item.nextDue) {
        addAction(
          actions,
          "Skip this cycle",
          async () => {
            await this.logRecurringSkip(item);
            await rerender();
          },
          { errorPrefix: "Skipping" }
        );
      }
      addAction(actions, "Edit", () => new EditRecurringItemModal(this.app, this, item, rerender).open(), { opensModal: true });
    }

    const history = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const heading = history.createDiv({ cls: "finance-bill-row-top" });
    heading.createEl("h4", { text: "Payments" });
    this.renderBillSparkline(heading, item.payments.map((payment) => payment.amount).slice(-12));

    if (!item.payments.length) {
      history.createDiv({ cls: "finance-tracker-empty", text: "Nothing logged against this bill yet." });
    } else {
      const table = history.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Date", "Amount", "As written"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const payment of item.payments.slice().reverse().slice(0, 24)) {
        const row = body.createEl("tr");
        row.createEl("td", { text: payment.date });
        row.createEl("td", { text: core.formatCurrency(payment.amount, currency), cls: "is-numeric" });
        row.createEl("td", { text: payment.merchant || "" });
      }
    }

    if (item.skipped?.length) {
      wrapper.createDiv({ cls: "finance-tracker-budget-meta", text: `Skipped: ${item.skipped.join(", ")}` });
    }
  },

  // A card capture that is really a bill payment is filed under the bill. The
  // bank sends "CLAUDE.AI SUBSCRIPTION" with no category; the bill knows its
  // alias, its amount and when it is due.
  async matchCaptureToBill(expense) {
    const recurring = await this.detectRecurring(expense.date);
    if (!recurring.billsMode) return null;
    return core.findBillForPayment(
      { date: expense.date, amount: expense.amount, merchant: expense.merchant },
      recurring.items
    );
  },

  async undoLastBillMatch() {
    const last = this._lastBillMatch;
    if (!last) return false;
    this._lastBillMatch = null;
    const entries = await this.collectTransactionsForRange({ start: last.date, end: last.date });
    const entry = entries.find(
      (candidate) =>
        candidate.category === last.category &&
        Math.abs(candidate.amount - last.amount) < 0.005 &&
        (candidate.merchant || "") === (last.merchant || "")
    );
    if (!entry) return false;
    await this.updateTransactionEntry(entry, { category: "uncategorized" });
    return true;
  },

  openMergeBill(item, live, onDone) {
    const modal = new MergeBillModal(this.app, this, item, live, onDone);
    modal.open();
    return modal;
  },

  openAddBill(options = {}) {
    const modal = new AddBillModal(this.app, this, options);
    modal.open();
    return modal;
  },
});

