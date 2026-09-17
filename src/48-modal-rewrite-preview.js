// A migration that edits notes shows its work first: how many notes and entries,
// a few lines before and after, anything it could not convert cleanly, and where
// the undo lives. Nothing is written until Apply is pressed, and the plan shown
// here is the exact content that gets written.
class RewritePreviewModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-rewrite-preview");
    this.modalEl?.addClass("finance-wide-modal");
    contentEl.createEl("h3", { text: this.options.title || "Review changes" });

    const plan = this.options.plan || { files: [], totals: {}, warnings: [], samples: [] };
    if (this.options.intro) {
      contentEl.createEl("p", { cls: "finance-tracker-settings-section-copy", text: this.options.intro });
    }

    if (!plan.files.length) {
      contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: this.options.emptyText || "Nothing to change — your notes are already up to date.",
      });
      const closeActions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
      const close = closeActions.createEl("button", { text: "Close" });
      close.addEventListener("click", () => this.close());
      return;
    }

    renderStatCards(contentEl, [
      { label: "Notes", value: String(plan.totals?.files || 0) },
      { label: "Entries", value: String(plan.totals?.entries || 0) },
      ...(plan.totals?.warnings
        ? [{ label: "To check after", value: String(plan.totals.warnings), cls: "is-over" }]
        : []),
    ]);

    if (plan.samples?.length) {
      const samples = contentEl.createDiv({ cls: "finance-tracker-chart-card" });
      samples.createEl("h4", { text: "Before and after" });
      for (const sample of plan.samples.slice(0, 4)) {
        const row = samples.createDiv({ cls: "finance-rewrite-sample" });
        row.createDiv({ cls: "finance-rewrite-sample-line is-before", text: String(sample.before || "").trim() });
        row.createDiv({ cls: "finance-rewrite-sample-line is-after", text: String(sample.after || "").trim() });
      }
    }

    if (plan.warnings?.length) {
      const warnings = contentEl.createEl("details", { cls: "finance-tracker-chart-card" });
      warnings.createEl("summary", {
        text: `${this.options.warningsLabel || "Lines worth checking afterwards"} (${plan.warnings.length})`,
      });
      for (const warning of plan.warnings.slice(0, 25)) {
        const row = warnings.createDiv({ cls: "finance-tracker-budget-card" });
        row.createDiv({ cls: "finance-tracker-budget-title", text: String(warning.line || "").trim() });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: [warning.path, warning.reason].filter(Boolean).join(" · "),
        });
      }
    }

    const fileList = contentEl.createEl("details", { cls: "finance-tracker-chart-card" });
    fileList.createEl("summary", { text: `Notes to change (${plan.files.length})` });
    for (const file of plan.files.slice(0, 250)) {
      fileList.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${file.path} · ${file.entries} entr${file.entries === 1 ? "y" : "ies"}`,
      });
    }

    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Obsidian's File recovery — or Sync version history — is the undo. Open one of the notes afterwards before carrying on.",
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const apply = actions.createEl("button", {
      text: this.options.applyLabel || `Update ${plan.files.length} note${plan.files.length === 1 ? "" : "s"}`,
      cls: "mod-cta",
    });
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      cancel.disabled = true;
      try {
        await this.options.onApply(plan);
        this.close();
      } catch (error) {
        new Notice(`Could not apply the changes: ${error.message}`);
        apply.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

