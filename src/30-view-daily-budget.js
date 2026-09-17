class DailyBudgetView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DAILY_BUDGET_VIEW; }
  getDisplayText() { return "Daily budget"; }
  getIcon() { return "coins"; }

  // Note changes reach this view through the plugin's single, debounced
  // refresh (notifyFinanceDataChanged), shared with the hub and open blocks.
  async onOpen() {
    await this.refresh();
  }

  async onClose() {}

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

