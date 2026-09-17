// Edits a recurring bill's amount, and optionally schedules a future price
// change (an exact date, applied automatically once it arrives) instead of
// waiting for the next logged entry to redefine the price.
class EditRecurringItemModal extends Modal {
  constructor(app, plugin, item, onSaved) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onSaved = onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    const item = this.item;
    contentEl.createEl("h3", { text: `Edit ${item.label}` });

    // A bill note has an identity the old registry row never did: a name, the
    // other names its payments arrive under, and a rule for when it falls due.
    const billFields = item.billId ? this.renderBillIdentityFields(contentEl, item) : null;

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    amountInput.value = String(item.lastAmount ?? "");

    const nextDueRow = contentEl.createDiv({ cls: "finance-edit-row" });
    nextDueRow.createEl("label", { text: "Next due" });
    const nextDueInput = nextDueRow.createEl("input", { type: "date" });
    nextDueInput.value = item.nextDue || "";
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Corrects the due-date schedule directly — logging or skipping a cycle normally keeps it on track by itself.",
    });

    const variableLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const variableCheckbox = variableLabel.createEl("input", { type: "checkbox" });
    variableCheckbox.checked = Boolean(item.variable);
    variableLabel.appendText(" Variable amount (e.g. a utility bill)");
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Projects off the average of recent payments instead of the last one, and Log now prompts for the actual amount each time.",
    });

    const scheduleLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const scheduleCheckbox = scheduleLabel.createEl("input", { type: "checkbox" });
    scheduleCheckbox.checked = Boolean(item.nextAmount && item.changeDate);
    scheduleLabel.appendText(" Price changes on a future date");

    const scheduleFields = contentEl.createDiv({ cls: "finance-edit-schedule" });
    scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);

    const nextAmountRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    nextAmountRow.createEl("label", { text: "New amount" });
    const nextAmountInput = nextAmountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    nextAmountInput.value = String(item.nextAmount ?? "");

    const changeDateRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    changeDateRow.createEl("label", { text: "Changes on" });
    const changeDateInput = changeDateRow.createEl("input", { type: "date" });
    changeDateInput.value = item.changeDate || "";

    const hasTerm = Boolean(item.endDate) || (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null);
    const termLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const termCheckbox = termLabel.createEl("input", { type: "checkbox" });
    termCheckbox.checked = hasTerm;
    termLabel.appendText(" This bill stops eventually");

    const termFields = contentEl.createDiv({ cls: "finance-edit-schedule" });
    termFields.toggleClass("is-hidden", !hasTerm);
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "For a fixed-term contract or an instalment plan. Fill either one — the bill retires itself and moves to Archived when it runs out.",
    });

    const endDateRow = termFields.createDiv({ cls: "finance-edit-row" });
    endDateRow.createEl("label", { text: "Ends on" });
    const endDateInput = endDateRow.createEl("input", { type: "date" });
    endDateInput.value = item.endDate || "";

    const paymentsRow = termFields.createDiv({ cls: "finance-edit-row" });
    paymentsRow.createEl("label", { text: "Payments left" });
    const paymentsInput = paymentsRow.createEl("input", { type: "number", attr: { step: "1", min: "0" } });
    paymentsInput.value = Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null ? String(item.paymentsLeft) : "";

    // Live schedule preview. A price change is easy to mis-set by a few days —
    // the date decides which cycles are still billed at the old price, and that
    // is invisible from two input boxes. This lays the upcoming cycles out with
    // the price each one will actually be charged at, and updates as you type.
    const previewSection = contentEl.createDiv({ cls: "finance-edit-preview" });
    const previewHeading = previewSection.createEl("h4", { text: "Upcoming payments" });
    const previewSummary = previewSection.createDiv({ cls: "finance-edit-preview-summary" });
    const previewGrid = previewSection.createDiv({ cls: "finance-edit-preview-grid" });
    const currency = core.normalizeCurrency(this.plugin.settings.defaultCurrency);
    const today = core.todayIsoLocal();

    const shortDate = (iso) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

    const renderPreview = () => {
      previewGrid.empty();
      previewSummary.empty();
      const scheduling = scheduleCheckbox.checked && nextAmountInput.value && changeDateInput.value;
      const terming = termCheckbox.checked;
      const schedule = core.buildRecurringSchedule(item, {
        amount: core.parseNumber(amountInput.value),
        changeDate: scheduling ? core.parseIsoDate(changeDateInput.value) : null,
        count: 8,
        endDate: terming ? core.parseIsoDate(endDateInput.value) || null : null,
        nextAmount: scheduling ? core.parseNumber(nextAmountInput.value) : null,
        nextDue: core.parseIsoDate(nextDueInput.value) || item.nextDue,
        paymentsLeft: terming ? core.parseNumber(paymentsInput.value) : null,
        referenceDate: today,
      });

      previewHeading.setText(`Upcoming payments · ${cadenceLabel(item.cadence)}`);

      if (!schedule.occurrences.length) {
        previewSummary.createSpan({ text: "No upcoming payments — check the next due date and the bill's terms." });
        return;
      }

      for (const occurrence of schedule.occurrences) {
        const cell = previewGrid.createDiv({ cls: "finance-edit-preview-cell" });
        if (occurrence.isNewPrice) cell.addClass("is-new-price");
        // The first cycle at the new price is the one worth spotting at a glance.
        if (occurrence.date === schedule.changeOccurrence) cell.addClass("is-change");
        cell.createDiv({ cls: "finance-edit-preview-date", text: shortDate(occurrence.date) });
        cell.createDiv({
          cls: "finance-edit-preview-amount",
          text: core.formatCurrency(occurrence.amount, currency),
        });
      }

      if (schedule.changeOccurrence) {
        const before = schedule.beforeChange;
        const oldPrice = core.formatCurrency(core.parseNumber(amountInput.value) || 0, currency);
        const newPrice = core.formatCurrency(schedule.nextAmount || 0, currency);
        previewSummary.createSpan({
          text: before.count
            ? `${before.count} more payment${before.count === 1 ? "" : "s"} at ${oldPrice} (${core.formatCurrency(before.total, currency)}), then ${newPrice} from ${shortDate(schedule.changeOccurrence)}.`
            : `Every upcoming payment is already at the new ${newPrice}, from ${shortDate(schedule.changeOccurrence)}.`,
        });
      } else if (scheduling) {
        // The change is real but lands beyond the previewed cycles.
        previewSummary.createSpan({
          text: `The new price does not apply to any of the next ${schedule.occurrences.length} payments — it starts ${shortDate(core.parseIsoDate(changeDateInput.value) || today)}.`,
        });
      } else {
        previewSummary.createSpan({
          text: `${schedule.occurrences.length} upcoming payment${schedule.occurrences.length === 1 ? "" : "s"} at ${core.formatCurrency(schedule.occurrences[0].amount, currency)}.`,
        });
      }

      if (schedule.finishReason) {
        previewSummary.createSpan({
          cls: "finance-edit-preview-note",
          text: schedule.finishesOn
            ? ` Last payment ${shortDate(schedule.finishesOn)}, then the bill retires.`
            : " The bill has no payments left.",
        });
      }
    };

    scheduleCheckbox.addEventListener("change", () => {
      scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);
      renderPreview();
    });

    termCheckbox.addEventListener("change", () => {
      termFields.toggleClass("is-hidden", !termCheckbox.checked);
      renderPreview();
    });

    for (const input of [amountInput, nextDueInput, nextAmountInput, changeDateInput, endDateInput, paymentsInput]) {
      input.addEventListener("input", renderPreview);
      input.addEventListener("change", renderPreview);
    }
    renderPreview();

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const patch = {
          amount: core.parseNumber(amountInput.value),
          nextDue: core.parseIsoDate(nextDueInput.value) || null,
          variable: variableCheckbox.checked,
        };
        if (billFields) {
          Object.assign(patch, billFields.read());
          // For a bill, next due is a correction, not a field to re-save: pinning
          // the date it already had would turn a derived schedule into a fixed one.
          if (patch.nextDue === (item.nextDue || null)) delete patch.nextDue;
        }
        if (scheduleCheckbox.checked && nextAmountInput.value && changeDateInput.value) {
          patch.nextAmount = core.parseNumber(nextAmountInput.value);
          patch.changeDate = core.parseIsoDate(changeDateInput.value);
        } else {
          patch.nextAmount = null;
          patch.changeDate = null;
        }
        if (termCheckbox.checked) {
          patch.endDate = core.parseIsoDate(endDateInput.value) || null;
          const left = core.parseNumber(paymentsInput.value);
          patch.paymentsLeft = Number.isFinite(left) && left >= 0 ? Math.floor(left) : null;
        } else {
          patch.endDate = null;
          patch.paymentsLeft = null;
        }
        await this.plugin.updateRecurringItem(item, patch);
        new Notice(`${item.label} updated`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  renderBillIdentityFields(contentEl, item) {
    const bill = item.bill || {};
    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const nameInput = row("Name").createEl("input", { type: "text", attr: { "aria-label": "Bill name" } });
    nameInput.value = bill.name || item.label || "";

    const aliasInput = row("Also paid as").createEl("input", {
      type: "text",
      attr: { placeholder: "CLAUDE.AI SUBSCRIPTION, Anthropic", "aria-label": "Aliases" },
    });
    aliasInput.value = (bill.aliases || []).join(", ");
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Other names this bill's payments arrive under, separated by commas — how a bank feed or a differently worded entry is recognised as this bill.",
    });

    const dueSelect = row("Due").createEl("select", { attr: { "aria-label": "Due rule" } });
    for (const [value, label] of [["after-last", "Counted from the last payment"], ["day-of-month", "On a day of the month"], ["nth-weekday", "On a weekday of the month"]]) {
      dueSelect.createEl("option", { text: label, value });
    }
    dueSelect.value = bill.dueRule?.type || "after-last";

    const dayRow = row("Day");
    const dayInput = dayRow.createEl("input", { type: "number", attr: { min: "1", max: "31", "aria-label": "Day of month" } });
    dayInput.value = bill.dueRule?.type === "day-of-month" ? String(bill.dueRule.day) : "";

    const weekdayRow = row("Which");
    const ordinalSelect = weekdayRow.createEl("select", { attr: { "aria-label": "Which weekday" } });
    for (const [value, label] of [["1", "First"], ["2", "Second"], ["3", "Third"], ["4", "Fourth"], ["-1", "Last"]]) {
      ordinalSelect.createEl("option", { text: label, value });
    }
    const weekdaySelect = weekdayRow.createEl("select", { attr: { "aria-label": "Weekday" } });
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((label, index) => {
      weekdaySelect.createEl("option", { text: label, value: String(index) });
    });
    if (bill.dueRule?.type === "nth-weekday") {
      ordinalSelect.value = String(bill.dueRule.ordinal);
      weekdaySelect.value = String(bill.dueRule.weekday);
    }

    const syncDueRows = () => {
      dayRow.toggleClass("is-hidden", dueSelect.value !== "day-of-month");
      weekdayRow.toggleClass("is-hidden", dueSelect.value !== "nth-weekday");
    };
    dueSelect.addEventListener("change", syncDueRows);
    syncDueRows();

    const reminderInput = row("Remind me").createEl("input", {
      type: "number",
      attr: { min: "0", max: "60", "aria-label": "Reminder days" },
    });
    reminderInput.value = String(bill.reminderDays ?? 3);
    contentEl.createEl("p", { cls: "finance-edit-hint", text: "Days before the due date this bill moves into Due soon." });

    return {
      read: () => ({
        name: nameInput.value.trim() || bill.name,
        aliases: aliasInput.value
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        dueRule:
          dueSelect.value === "day-of-month"
            ? { type: "day-of-month", day: Math.min(31, Math.max(1, Number(dayInput.value) || 1)) }
            : dueSelect.value === "nth-weekday"
              ? { type: "nth-weekday", ordinal: Number(ordinalSelect.value), weekday: Number(weekdaySelect.value) }
              : { type: "after-last" },
        reminderDays: Math.max(0, Number(reminderInput.value) || 0),
      }),
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// "Log now" for a Variable bill (a fluctuating utility, say) prompts for the
// actual amount instead of silently repeating the last/average one — logging
// a made-up fixed number for something that genuinely varies would just be
// wrong in the daily note.
class LogVariableBillModal extends Modal {
  constructor(app, plugin, item, onLogged) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onLogged = onLogged;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    const item = this.item;
    const currency = item.currency || this.plugin.settings.defaultCurrency;
    contentEl.createEl("h3", { text: `Log ${item.label}` });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: `This bill is variable — enter today's actual amount (recent average: ${core.formatCurrency(item.averageAmount ?? item.lastAmount, currency)}).`,
    });

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    amountInput.value = String(item.averageAmount ?? item.lastAmount ?? "");

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const logButton = buttons.createEl("button", { text: "Log", cls: "mod-cta" });
    logButton.addEventListener("click", async () => {
      logButton.disabled = true;
      try {
        const amount = core.parseNumber(amountInput.value);
        const logDate = await this.plugin.logRecurringNow(item, amount);
        new Notice(`Logged ${item.label} for ${logDate}`);
        this.close();
        if (typeof this.onLogged === "function") await this.onLogged();
      } catch (error) {
        new Notice(`Could not log ${item.label}: ${error.message}`);
        logButton.disabled = false;
      }
    });
    window.setTimeout(() => amountInput.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

