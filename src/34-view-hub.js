// The finance hub: one place for everything beyond logging. Each tab renders
// what a code block or the sidebar already renders, so a fix to one shows up in
// both, and the blocks keep working inside notes.
class FinanceHubView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = "today";
    this.budgetPeriod = "";
    this.reviewPeriod = "week";
    this.reviewAnchor = "";
    this._renderId = 0;
    this._opened = false;
  }

  getViewType() { return FINANCE_HUB_VIEW; }
  getDisplayText() { return "Finance"; }
  getIcon() { return "wallet"; }

  getState() {
    const base = typeof super.getState === "function" ? super.getState() : {};
    return { ...base, tab: this.tab, reviewPeriod: this.reviewPeriod, budgetPeriod: this.budgetPeriod };
  }

  async setState(state, result) {
    if (state && FINANCE_HUB_TABS.some((tab) => tab.id === state.tab)) this.tab = state.tab;
    if (state?.reviewPeriod) this.reviewPeriod = state.reviewPeriod;
    if (typeof state?.budgetPeriod === "string") this.budgetPeriod = state.budgetPeriod;
    if (typeof super.setState === "function") await super.setState(state, result);
    if (this._opened) await this.render({ resetScroll: true });
  }

  async onOpen() {
    this._opened = true;
    await this.render();
  }

  async onClose() {
    this._opened = false;
    this._renderId += 1;
  }

  async showTab(id) {
    if (!FINANCE_HUB_TABS.some((tab) => tab.id === id)) return;
    this.tab = id;
    this.app.workspace?.requestSaveLayout?.();
    await this.render({ resetScroll: true });
  }

  // Called when notes change. Typing into a field in the hub (a category
  // search, say) must not be wiped by a refresh, so that waits for focus to
  // leave.
  refresh() {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || "");
    if (typing && typeof this.contentEl.contains === "function" && this.contentEl.contains(active)) {
      if (!this._waitingForBlur) {
        this._waitingForBlur = true;
        active.addEventListener(
          "blur",
          () => {
            this._waitingForBlur = false;
            window.setTimeout(() => this.refresh(), 0);
          },
          { once: true }
        );
      }
      return Promise.resolve();
    }
    return this.render();
  }

  async render(options = {}) {
    const renderId = ++this._renderId;
    const root = this.contentEl;
    const scrollTop = options.resetScroll ? 0 : Number(root.scrollTop) || 0;
    root.empty();
    root.addClass("finance-hub");

    const nav = root.createDiv({ cls: "finance-hub-tabs", attr: { role: "tablist" } });
    let inboxButton = null;
    for (const tab of FINANCE_HUB_TABS) {
      const selected = tab.id === this.tab;
      const button = nav.createEl("button", {
        cls: "finance-hub-tab",
        text: tab.label,
        attr: { role: "tab", "aria-selected": String(selected), "data-tab": tab.id },
      });
      if (selected) button.addClass("is-active");
      if (tab.id === "inbox") inboxButton = button;
      button.addEventListener("click", () => this.showTab(tab.id));
    }

    const body = root.createDiv({ cls: "finance-hub-body" });
    try {
      await this.plugin.renderHubTab(this.tab, body, this);
    } catch (error) {
      if (renderId !== this._renderId) return;
      body.empty();
      body.createDiv({ cls: "finance-tracker-empty", text: `This tab failed to render: ${error?.message || error}` });
    }
    if (renderId !== this._renderId) return;
    if (scrollTop) root.scrollTop = scrollTop;

    // The badge is worked out after the tab so it never holds the tab up.
    try {
      const count = await this.plugin.countInboxItems();
      if (renderId === this._renderId && count > 0 && inboxButton) {
        inboxButton.createSpan({ cls: "finance-hub-badge", text: count > 99 ? "99+" : String(count) });
        inboxButton.setAttribute("aria-label", `Inbox, ${count} waiting`);
      }
    } catch (_error) {
      // A missing badge is not worth an error on top of the tab.
    }
  }
}
