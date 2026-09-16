// Answers "are two of my capture methods logging the same thing?" from the
// capture ledger rather than from guesswork about what each Shortcut covers.
class CaptureOverlapModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Capture method overlap" });

    const active = core.CAPTURE_METHODS.filter((method) => this.plugin.isCaptureMethodEnabled(method));
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: active.length
        ? `Active methods: ${active.map((method) => core.captureMethodLabel(method)).join(", ")}. Quick add and hand-typed bullets always work.`
        : "No capture methods are turned on — only quick add and hand-typed bullets will log anything.",
    });

    const overlap = this.plugin.captureOverlapReport(60);
    if (!overlap.length) {
      contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No two methods have captured the same transaction in the last 60 days. Nothing is overlapping.",
      });
    } else {
      contentEl.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "These pairs have captured the same transaction. That is fine while duplicate handling is on — but if one pair dominates, you are paying for a method you could turn off.",
      });
      const table = contentEl.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Methods", "Collisions", "Most recent"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const pair of overlap) {
        const row = body.createEl("tr");
        row.createEl("td", { text: pair.channels.map((channel) => core.describeCaptureChannel(channel)).join("  ↔  ") });
        row.createEl("td", { text: String(pair.count) });
        row.createEl("td", {
          text: pair.sample
            ? `${pair.sample.date} · ${core.formatCurrency(pair.sample.amount, this.plugin.settings.defaultCurrency)}${pair.sample.merchant ? ` · ${pair.sample.merchant}` : ""}`
            : pair.lastDate,
        });
      }
    }

    const handling = this.plugin.settings.crossMethodDuplicates || "skip";
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: `Duplicate handling is set to "${handling}". Detection only ever compares captures from different methods, so two identical purchases down the same method are still logged as two.`,
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BankReconcileModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.dateOrder = "DMY";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-reconcile");
    contentEl.createEl("h3", { text: "Reconcile bank / Wise CSV" });
    contentEl.createEl("p", {
      cls: "finance-reconcile-hint",
      text: "Paste an exported statement CSV. Spending rows are matched against what you have already logged; unmatched charges can be sent to your capture inbox.",
    });

    const orderRow = contentEl.createDiv({ cls: "finance-reconcile-order" });
    orderRow.createSpan({ text: "Date format " });
    const orderSelect = orderRow.createEl("select");
    for (const [value, label] of [["DMY", "DD/MM/YYYY (ANZ, AU)"], ["MDY", "MM/DD/YYYY (US)"], ["YMD", "YYYY-MM-DD"]]) {
      const option = orderSelect.createEl("option", { text: label });
      option.value = value;
    }
    orderSelect.value = this.dateOrder;
    orderSelect.addEventListener("change", () => {
      this.dateOrder = orderSelect.value;
    });

    const textarea = contentEl.createEl("textarea", {
      cls: "finance-reconcile-input",
      attr: { rows: "10", placeholder: "Date,Amount,Description\n08/06/2026,-12.50,NOBU SYDNEY\n..." },
    });

    const results = contentEl.createDiv({ cls: "finance-reconcile-results" });

    const buttons = contentEl.createDiv({ cls: "finance-reconcile-buttons" });
    const analyseBtn = buttons.createEl("button", { text: "Analyse", cls: "mod-cta" });
    analyseBtn.addEventListener("click", async () => {
      results.empty();
      try {
        const summary = await this.plugin.reconcileBankCsv(textarea.value, { dateOrder: this.dateOrder });
        this.renderSummary(results, summary);
      } catch (error) {
        results.setText(`Reconcile failed: ${error.message}`);
      }
    });
  }

  renderSummary(container, summary) {
    container.empty();
    container.createEl("div", {
      cls: "finance-reconcile-counts",
      text: `${summary.rows.length} spending rows · ${summary.matched.length} already logged · ${summary.missing.length} not logged`,
    });
    if (!summary.missing.length) {
      container.createEl("p", { text: "Everything in this statement is already logged. ✅" });
      return;
    }
    const list = container.createEl("ul", { cls: "finance-reconcile-missing" });
    for (const row of summary.missing) {
      const item = list.createEl("li");
      item.setText(`${row.date}  ${core.formatCurrency(row.amount, row.currency)}  ${row.merchant || ""}`);
    }
    const sendBtn = container.createEl("button", {
      text: `Send ${summary.missing.length} missing charge${summary.missing.length === 1 ? "" : "s"} to capture inbox`,
      cls: "mod-cta",
    });
    sendBtn.addEventListener("click", async () => {
      sendBtn.disabled = true;
      try {
        const count = await this.plugin.sendRowsToInbox(summary.missing);
        new Notice(`Finance: queued ${count} charge${count === 1 ? "" : "s"} to the capture inbox`);
        this.close();
      } catch (error) {
        new Notice(`Could not queue charges: ${error.message}`);
        sendBtn.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

