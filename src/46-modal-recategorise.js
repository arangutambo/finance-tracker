// Renaming a category is rarely the whole story. Bare "transport" in a real
// vault turns out to be six Translink trips, five rideshares, three scooter
// hires and one car park — one name covering four things, and the merchant is
// what tells them apart. So this asks per merchant, with an "everything" row for
// the plain rename case.
class RecategoriseModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.category = core.normalizeCategoryPath(options.category || "");
    this.rows = [];
  }

  categoryInput(host, value, onDirty) {
    const wrapper = host.createDiv({ cls: "finance-recategorise-input" });
    const input = wrapper.createEl("input", { type: "text", attr: { placeholder: "food/takeaway", "aria-label": "New category" } });
    input.value = value;
    new FinanceSuggest(input, {
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        const out = this.known.categories
          .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
          .slice(0, 8)
          .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
        if (needle && !this.known.categories.includes(needle)) {
          out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
        }
        return out;
      },
      onChoose: () => onDirty?.(),
    });
    input.addEventListener("change", () => onDirty?.());
    return input;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    // One class per argument: addClass goes to classList.add, which rejects a
    // string with a space in it — and the throw happens before anything renders,
    // leaving an empty modal.
    contentEl.addClass("finance-edit", "finance-recategorise");
    contentEl.createEl("h3", { text: "Rename or split a category" });
    this.known = await this.plugin.collectKnownSuggestions();

    const row = contentEl.createDiv({ cls: "finance-edit-row" });
    row.createEl("label", { text: "Category" });
    const input = row.createEl("input", { type: "text", attr: { placeholder: "transport", "aria-label": "Category to change" } });
    input.value = this.category;
    new FinanceSuggest(input, {
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        return this.known.categories
          .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
          .slice(0, 8)
          .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
      },
      onChoose: (item) => {
        this.category = item.value;
        this.renderBreakdown();
      },
    });
    input.addEventListener("change", () => {
      this.category = core.normalizeCategoryPath(input.value);
      this.renderBreakdown();
    });

    this.body = contentEl.createDiv({ cls: "finance-recategorise-body" });
    this.footer = contentEl.createDiv({ cls: "finance-edit-buttons" });
    if (this.category) await this.renderBreakdown();
  }

  async renderBreakdown() {
    this.body.empty();
    this.footer.empty();
    this.rows = [];
    if (!this.category) return;

    const currency = core.normalizeCurrency(this.plugin.settings.defaultCurrency);
    const { entries, groups } = await this.plugin.buildCategoryBreakdown(this.category);
    if (!entries.length) {
      this.body.createDiv({
        cls: "finance-tracker-empty",
        text: `Nothing is filed under ${core.displayCategoryPath(this.category)}.`,
      });
      return;
    }

    const total = core.roundCurrencyAmount(entries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0));
    this.body.createEl("p", {
      cls: "finance-edit-hint",
      text: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${core.formatCurrency(total, currency)} · ${groups.length} merchant${groups.length === 1 ? "" : "s"}. Change the top row to rename the lot, or a single row to split that merchant off.`,
    });

    const everything = this.body.createDiv({ cls: "finance-tracker-budget-card" });
    renderRowTitle(everything, "Everything", core.formatCurrency(total, currency));
    this.allInput = this.categoryInput(everything, this.category, () => {
      // Rows the user has not touched follow the top row.
      for (const entry of this.rows) {
        if (!entry.dirty) entry.input.value = this.allInput.value;
      }
    });

    for (const group of groups) {
      const card = this.body.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(card, group.label, core.formatCurrency(group.total, currency));
      const current = Array.from(new Set(group.entries.map((entry) => entry.category)));
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${group.count} entr${group.count === 1 ? "y" : "ies"} · now ${current.map((path) => core.displayCategoryPath(path)).join(", ")}`,
      });
      const state = { group, dirty: false, input: null };
      state.input = this.categoryInput(card, this.category, () => {
        state.dirty = true;
      });
      this.rows.push(state);
    }

    const preview = this.footer.createEl("button", { text: "Preview changes", cls: "mod-cta" });
    preview.addEventListener("click", async () => {
      preview.disabled = true;
      try {
        await this.preview();
      } catch (error) {
        new Notice(`Could not work out the changes: ${error.message}`);
        preview.disabled = false;
      }
    });
  }

  async preview() {
    const assignments = this.rows
      .map((row) => ({ entries: row.group.entries, category: core.normalizeCategoryPath(row.input.value) }))
      .filter((assignment) => assignment.category);

    // A rename only counts as a rename — and so only then follows into the
    // budgets table and the merchant rules — when every row moves together.
    const everything = core.normalizeCategoryPath(this.allInput.value);
    const isWholeRename =
      everything &&
      everything !== this.category &&
      this.rows.every((row) => core.normalizeCategoryPath(row.input.value) === everything);
    const tableRenames = isWholeRename ? [{ from: this.category, to: everything }] : [];

    const plan = await this.plugin.planCategoryAssignments(assignments, { tableRenames });
    const summary = Array.from(
      new Set(assignments.filter((a) => a.category !== this.category).map((a) => core.displayCategoryPath(a.category)))
    );

    this.close();
    new RewritePreviewModal(this.app, this.plugin, {
      title: isWholeRename ? "Rename a category" : "Split a category",
      intro: summary.length
        ? `${core.displayCategoryPath(this.category)} → ${summary.join(", ")}.${
            isWholeRename ? " The budgets table and any merchant rules follow it." : ""
          }`
        : "Nothing would change.",
      plan,
      emptyText: "Nothing to change — those entries are already filed that way.",
      applyLabel: `Update ${plan.totals.files} note${plan.totals.files === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.plugin.applyNoteRewritePlan(approved);
        const rules = tableRenames.length ? await this.plugin.renameCategoryInMerchantMap(tableRenames) : 0;
        new Notice(
          [
            `Updated ${written} note${written === 1 ? "" : "s"}`,
            rules ? `${rules} merchant rule${rules === 1 ? "" : "s"}` : "",
            skipped.length ? `${skipped.length} changed since the preview and were left alone` : "",
          ]
            .filter(Boolean)
            .join(", ") + "."
        );
      },
    }).open();
  }

  onClose() {
    this.contentEl.empty();
  }
}

