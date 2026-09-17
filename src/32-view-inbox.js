// The inbox is a view rather than a modal: it is somewhere you work through a
// backlog, and a modal cannot stay open beside the notes it is about. It is now
// the hub's Inbox tab; this standalone view is kept registered only so a
// workspace saved with it open still loads.
class FinanceInboxView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return FINANCE_INBOX_VIEW; }
  getDisplayText() { return "Categorisation inbox"; }
  getIcon() { return "inbox"; }

  async onOpen() {
    await this.refresh();
  }

  async onClose() {}

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

