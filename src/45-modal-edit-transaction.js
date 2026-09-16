class EditTransactionModal extends Modal {
  constructor(app, plugin, entry) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Edit transaction" });
    const entry = this.entry;

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    amountInput.value = String(entry.amount ?? "");

    const catRow = contentEl.createDiv({ cls: "finance-edit-row" });
    catRow.createEl("label", { text: "Category" });
    const catInput = catRow.createEl("input", { type: "text" });
    catInput.value = entry.category || "uncategorized";

    const chips = contentEl.createDiv({ cls: "finance-edit-chips" });
    const known = await this.plugin.collectKnownSuggestions();
    for (const option of known.categories.slice(0, 12)) {
      const chip = chips.createEl("button", { cls: "finance-edit-chip", text: core.displayCategoryPath(option) });
      chip.addEventListener("click", () => {
        catInput.value = option;
      });
    }

    const merchantRow = contentEl.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text" });
    merchantInput.value = entry.merchant || "";

    const rememberLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const rememberCheckbox = rememberLabel.createEl("input", { type: "checkbox" });
    rememberLabel.appendText(" Remember this merchant → category");

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const deleteButton = buttons.createEl("button", { text: "Delete", cls: "mod-warning" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const patch = {
          amount: core.parseNumber(amountInput.value),
          category: core.normalizeCategoryPath(catInput.value) || "uncategorized",
          merchant: merchantInput.value.trim(),
        };
        await this.plugin.updateTransactionEntry(entry, patch);
        if (rememberCheckbox.checked && patch.merchant && patch.category && patch.category !== "uncategorized") {
          await this.plugin.rememberMerchantCategory(patch.merchant, patch.category);
        }
        new Notice("Transaction updated");
        this.close();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      try {
        await this.plugin.deleteTransactionEntry(entry);
        new Notice("Transaction deleted");
        this.close();
      } catch (error) {
        new Notice(`Delete failed: ${error.message}`);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

