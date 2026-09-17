// Merging replaces "Remove completely" as the answer to a duplicate. Removing
// hid a bill's name while its payments went on existing, uncounted; merging
// makes the name an alias of the bill it really was, so the history joins up.
class MergeBillModal extends Modal {
  constructor(app, plugin, item, bills, onDone) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.bills = (bills || []).filter((bill) => bill.billId && bill.billId !== item.billId);
    this.onDone = onDone;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: `Merge ${this.item.label} into…` });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Its name becomes an alias of the bill you pick, so its payments count toward that one. Your daily notes do not change.",
    });

    const search = contentEl.createEl("input", { type: "text", attr: { placeholder: "Find a bill", "aria-label": "Find a bill" } });
    const list = contentEl.createDiv({ cls: "finance-tracker-holiday-results" });

    const render = () => {
      list.empty();
      const needle = String(search.value || "").toLowerCase();
      const matches = this.bills.filter((bill) => !needle || bill.label.toLowerCase().includes(needle));
      if (!matches.length) {
        list.createDiv({ cls: "finance-tracker-empty", text: "No bill matches." });
        return;
      }
      for (const bill of matches) {
        const row = list.createDiv({ cls: "finance-tracker-holiday-result" });
        row.createDiv({ cls: "finance-tracker-holiday-result-title", text: bill.label });
        row.createDiv({
          cls: "finance-tracker-holiday-result-path",
          text: `${cadenceLabel(bill.cadence)} · ${core.formatCurrency(bill.lastAmount, this.plugin.settings.defaultCurrency)} · ${bill.count} payment${bill.count === 1 ? "" : "s"}`,
        });
        row.addEventListener("click", async () => {
          try {
            await this.plugin.mergeBillInto(this.item, bill.billId);
            new Notice(`${this.item.label} now counts toward ${bill.label}.`);
            this.close();
            if (typeof this.onDone === "function") await this.onDone();
          } catch (error) {
            new Notice(`Merge failed: ${error.message}`);
          }
        });
      }
    };
    search.addEventListener("input", render);
    render();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Adding a bill by hand, for one that has not been logged yet — the car
// registration due next August — or one you would rather set up than wait for.
class AddBillModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onSaved = options.onSaved;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Add a bill" });
    const known = await this.plugin.collectKnownSuggestions();

    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const nameInput = row("Name").createEl("input", { type: "text", attr: { placeholder: "Claude", "aria-label": "Bill name" } });
    this.nameSuggest = new FinanceSuggest(nameInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        if (!needle) return [];
        return known.merchants
          .filter((merchant) => merchant.name.toLowerCase().includes(needle))
          .slice(0, 6)
          .map((merchant) => ({ value: merchant.name, label: merchant.name, kind: "merchant" }));
      },
    });

    const cadenceSelect = row("How often").createEl("select", { attr: { "aria-label": "Cadence" } });
    for (const [value, label] of [["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]]) {
      cadenceSelect.createEl("option", { text: label, value });
    }
    cadenceSelect.value = "monthly";

    const amountInput = row("Amount").createEl("input", {
      type: "number",
      attr: { step: "0.01", inputmode: "decimal", placeholder: "34.00", "aria-label": "Amount" },
    });

    const dueSelect = row("Due").createEl("select", { attr: { "aria-label": "Due rule" } });
    for (const [value, label] of [["after-last", "Counted from the last payment"], ["day-of-month", "On a day of the month"], ["nth-weekday", "On a weekday of the month"]]) {
      dueSelect.createEl("option", { text: label, value });
    }
    dueSelect.value = "after-last";

    const dayRow = row("Day");
    const dayInput = dayRow.createEl("input", { type: "number", attr: { min: "1", max: "31", placeholder: "26", "aria-label": "Day of month" } });
    const weekdayRow = row("Which");
    const ordinalSelect = weekdayRow.createEl("select", { attr: { "aria-label": "Which weekday" } });
    for (const [value, label] of [["1", "First"], ["2", "Second"], ["3", "Third"], ["4", "Fourth"], ["-1", "Last"]]) {
      ordinalSelect.createEl("option", { text: label, value });
    }
    const weekdaySelect = weekdayRow.createEl("select", { attr: { "aria-label": "Weekday" } });
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((label, index) => {
      weekdaySelect.createEl("option", { text: label, value: String(index) });
    });

    const syncDueRows = () => {
      dayRow.toggleClass("is-hidden", dueSelect.value !== "day-of-month");
      weekdayRow.toggleClass("is-hidden", dueSelect.value !== "nth-weekday");
    };
    dueSelect.addEventListener("change", syncDueRows);
    syncDueRows();

    const firstDueInput = row("First due").createEl("input", { type: "date", attr: { "aria-label": "First due date" } });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Optional. Set it for a bill that has never been paid, so it knows when to start.",
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Add bill", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error("Give the bill a name.");
        const dueRule =
          dueSelect.value === "day-of-month"
            ? { type: "day-of-month", day: Math.min(31, Math.max(1, Number(dayInput.value) || 1)) }
            : dueSelect.value === "nth-weekday"
              ? { type: "nth-weekday", ordinal: Number(ordinalSelect.value), weekday: Number(weekdaySelect.value) }
              : { type: "after-last" };
        const amount = core.parseNumber(amountInput.value);
        const bill = await this.plugin.addBill({
          name,
          cadence: cadenceSelect.value,
          amount: Number.isFinite(amount) && amount > 0 ? amount : null,
          dueRule,
          firstDue: core.parseIsoDate(firstDueInput.value) || null,
        });
        new Notice(`Added ${bill.name}.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(error.message);
        save.disabled = false;
      }
    });
    window.setTimeout(() => nameInput.focus(), 0);
  }

  onClose() {
    this.nameSuggest?.destroy();
    this.contentEl.empty();
  }
}

