// Correcting one entry. This was the weakest screen in the plugin: a plain text
// box for the category with twelve flat chips beside it, no way to change the
// date, and no way to say "and the other four from this shop as well" — so the
// backlog was fixed one line at a time, or not at all.
class EditTransactionModal extends Modal {
  constructor(app, plugin, entry, options = {}) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
    this.onSaved = options.onSaved;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Edit transaction" });

    const entry = this.entry;
    const currency = core.normalizeCurrency(entry.currency || this.plugin.settings.defaultCurrency);
    const known = await this.plugin.collectKnownSuggestions();
    const siblings = await this.plugin.findSiblingUncategorised(entry);

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", {
      type: "number",
      // A phone keyboard with a decimal point on it.
      attr: { step: "0.01", inputmode: "decimal" },
    });
    amountInput.value = String(entry.amount ?? "");

    const dateRow = contentEl.createDiv({ cls: "finance-edit-row" });
    dateRow.createEl("label", { text: "Date" });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = entry.date || core.todayIsoLocal();
    const dateHint = contentEl.createEl("p", { cls: "finance-edit-hint", text: "" });
    const updateDateHint = () => {
      const next = core.parseIsoDate(dateInput.value);
      dateHint.setText(
        next && next !== entry.date
          ? `The entry moves to ${next}'s note, and both totals are rewritten.`
          : "Changing this moves the entry to that day's note."
      );
    };
    dateInput.addEventListener("change", updateDateHint);
    updateDateHint();

    contentEl.createEl("label", { cls: "finance-edit-label", text: "Category" });
    const picker = new CategoryPicker(contentEl, {
      categories: known.categories,
      value: entry.category === "uncategorized" ? "" : entry.category,
    });

    const merchantRow = contentEl.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text" });
    merchantInput.value = entry.merchant || "";
    const merchantSuggest = new FinanceSuggest(merchantInput, {
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        return known.merchants
          .filter((merchant) => !needle || merchant.name.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((merchant) => ({
            value: merchant.name,
            label: merchant.name,
            kind: "merchant",
            hint: merchant.category ? core.displayCategoryPath(merchant.category) : "",
          }));
      },
      onChoose: (item) => {
        // Accepting a known merchant fills in how it was last filed, unless a
        // category has already been chosen here.
        if (!picker.getValue() && item.hint) picker.setValue(core.normalizeCategoryPath(item.hint));
      },
    });

    let applySiblings = null;
    if (siblings.length) {
      const label = contentEl.createEl("label", { cls: "finance-edit-remember" });
      applySiblings = label.createEl("input", { type: "checkbox" });
      applySiblings.checked = true;
      label.appendText(
        ` Apply to ${siblings.length} other uncategorised entr${siblings.length === 1 ? "y" : "ies"} from this merchant`
      );
    }

    // Ticked by default, because remembering is almost always right — except
    // where this shop has already been filed two different ways on purpose.
    const conflicted = await this.plugin.merchantHasConflictingHistory(entry.merchant);
    const rememberLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const rememberCheckbox = rememberLabel.createEl("input", { type: "checkbox" });
    rememberCheckbox.checked = !conflicted;
    rememberLabel.appendText(
      conflicted
        ? " Remember this merchant → category (you have filed it more than one way)"
        : " Remember this merchant → category"
    );

    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: `Logged as ${core.formatCurrency(entry.amount, currency)} on ${entry.date} in ${String(entry.filePath || "").split("/").pop()}.`,
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const deleteButton = buttons.createEl("button", { text: "Delete", cls: "mod-warning" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const category = picker.getValue() || "uncategorized";
        const merchant = merchantInput.value.trim();
        const patch = { amount: core.parseNumber(amountInput.value), category, merchant };
        const nextDate = core.parseIsoDate(dateInput.value);

        if (nextDate && nextDate !== entry.date) {
          await this.plugin.moveTransactionEntry(entry, nextDate, patch);
        } else {
          await this.plugin.updateTransactionEntry(entry, patch);
        }

        let alsoFiled = 0;
        if (applySiblings?.checked && category !== "uncategorized") {
          alsoFiled = await this.plugin.applyCategoryToEntries(siblings, category);
        }
        if (rememberCheckbox.checked && merchant && category !== "uncategorized") {
          await this.plugin.rememberMerchantCategory(merchant, category);
        }

        new Notice(alsoFiled ? `Updated, and filed ${alsoFiled} more from this merchant.` : "Transaction updated");
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;
      try {
        await this.plugin.deleteTransactionEntry(entry);
        new Notice("Transaction deleted");
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Delete failed: ${error.message}`);
        deleteButton.disabled = false;
      }
    });

    this._suggests = [merchantSuggest, picker];
  }

  onClose() {
    for (const component of this._suggests || []) component.destroy?.();
    this.contentEl.empty();
  }
}

