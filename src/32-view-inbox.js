// The inbox is a view rather than a modal: it is somewhere you work through a
// backlog, and a modal cannot stay open beside the notes it is about. The finance
// hub will embed the same render method as one of its tabs.
class FinanceInboxView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._refreshTimer = null;
  }

  getViewType() { return FINANCE_INBOX_VIEW; }
  getDisplayText() { return "Categorisation inbox"; }
  getIcon() { return "inbox"; }

  async onOpen() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (_ftSelfWrites.has(file.path)) return;
        if (!file?.path?.startsWith(normalizePath(`${this.plugin.settings.dailyNotesFolder}/`))) return;
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this.refresh(), 500);
      })
    );
    await this.refresh();
  }

  async onClose() {
    clearTimeout(this._refreshTimer);
  }

  async refresh() {
    try {
      await this.plugin.renderCategorisationInboxInto(this.contentEl);
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: `The inbox failed to render: ${error?.message || error}`,
      });
    }
  }
}

