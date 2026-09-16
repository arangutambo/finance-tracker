class DailyBudgetView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._refreshTimer = null;
  }

  getViewType() { return DAILY_BUDGET_VIEW; }
  getDisplayText() { return "Daily budget"; }
  getIcon() { return "coins"; }

  async onOpen() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (_ftSelfWrites.has(file.path)) return;
        const prefix = normalizePath(this.plugin.settings.dailyNotesFolder + "/");
        if (file.path.startsWith(prefix)) {
          clearTimeout(this._refreshTimer);
          this._refreshTimer = setTimeout(() => this.refresh(), 400);
        }
      })
    );
    await this.refresh();
  }

  async onClose() {
    clearTimeout(this._refreshTimer);
  }

  async refresh() {
    try {
      const today = core.todayIsoLocal();
      await this.plugin.renderDailyBudgetCheckInto(this.contentEl, today, "full");
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: "finance-tracker-empty", text: `Daily budget failed to render: ${error?.message || error}` });
    }
  }
}

