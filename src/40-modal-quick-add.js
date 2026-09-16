class QuickAddTransactionModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.date = core.parseIsoDate(options.date || "") || core.todayIsoLocal();
    this.dateFromNote = false;
    // Optionally pre-fill the date from the daily note that is open right now.
    if (!options.date && plugin.settings.quickAddUseNoteDate) {
      const activeFile = app.workspace.getActiveFile();
      const prefix = normalizePath(`${plugin.settings.dailyNotesFolder}/`);
      if (activeFile && activeFile.path.startsWith(prefix)) {
        const noteDate = core.extractNoteDate("", activeFile.path) || plugin.dailyNoteDateFromFileName(activeFile.name);
        if (noteDate) {
          this.date = noteDate;
          this.dateFromNote = true;
        }
      }
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-quick-add");
    contentEl.createEl("h3", { text: "Quick add transaction" });
    if (this.plugin.settings.tripModeActive) {
      contentEl.createDiv({
        cls: "finance-quick-add-trip",
        text: "Trip mode is on — this entry defaults to the trip tag and trip currency.",
      });
    }

    const input = contentEl.createEl("input", {
      type: "text",
      cls: "finance-quick-add-input",
      attr: { placeholder: "12 nobu restaurants   ·   58 USD : 83.64 obsidian sync   ·   24 dinner split=2   ·   4.50 coffee @yesterday" },
    });

    // Suggestions derived from logging history: categories, merchants, people.
    // Arrows cycle, Tab accepts, Esc closes; Enter always submits the entry.
    const known = await this.plugin.collectKnownSuggestions();
    this._known = known;

    // Fingerprints of what is already on this date, so a double-tap on the same
    // purchase can be flagged before it becomes a second bullet.
    try {
      const sameDay = await this.plugin.collectTransactionsForRange({ start: this.date, end: this.date });
      this._todayFingerprints = new Set(sameDay.map((entry) => core.transactionFingerprint(entry)));
    } catch (_error) {
      this._todayFingerprints = new Set();
    }
    const popup = contentEl.createDiv({ cls: "finance-quick-add-suggestions" });
    popup.hide();
    let suggestions = [];
    let highlighted = 0;

    const hideSuggestions = () => {
      suggestions = [];
      highlighted = 0;
      popup.empty();
      popup.hide();
    };

    const currentToken = () => {
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos);
      const match = before.match(/(\S+)$/);
      return { token: match ? match[1] : "", start: match ? pos - match[1].length : pos, end: pos };
    };

    const buildSuggestions = (token) => {
      const lower = token.toLowerCase();
      if (!token || /^\$?-?[\d.,]+$/.test(token) || /^@/.test(token) || /^split=/i.test(lower)) return [];
      const out = [];
      if (/^owed=/i.test(lower)) {
        const query = lower.slice(5).replace(/^\W*/, "");
        for (const person of known.people) {
          if (!query || person.displayName.toLowerCase().startsWith(query) || person.person.startsWith(query)) {
            out.push({ kind: "person", text: `owed=${person.displayName}:`, label: `owed=${person.displayName}:$…` });
          }
        }
        return out.slice(0, 6);
      }
      const isTag = token.startsWith("#");
      const query = isTag ? lower.slice(1) : lower;
      if (!query) return [];
      for (const path of known.categories) {
        const matches = path.startsWith(query) || path.split("/").some((segment) => segment.startsWith(query));
        if (!matches) continue;
        out.push({ kind: "category", text: isTag ? `#${path}` : path, label: path });
        if (out.length >= (isTag || token.includes("/") ? 6 : 3)) break;
      }
      if (!isTag && !token.includes("/")) {
        for (const merchant of known.merchants) {
          const name = merchant.name.toLowerCase();
          if (!(name.startsWith(query) || name.split(/\s+/).some((word) => word.startsWith(query)))) continue;
          out.push({
            kind: "merchant",
            text: merchant.name,
            label: merchant.name,
            category: merchant.category,
          });
          if (out.length >= 6) break;
        }
      }
      return out.slice(0, 6);
    };

    const renderSuggestions = () => {
      popup.empty();
      if (!suggestions.length) {
        popup.hide();
        return;
      }
      popup.show();
      suggestions.forEach((suggestion, index) => {
        const row = popup.createDiv({ cls: `finance-quick-add-suggestion${index === highlighted ? " is-highlighted" : ""}` });
        row.createSpan({ cls: "finance-quick-add-suggestion-kind", text: suggestion.kind });
        row.createSpan({ text: suggestion.label });
        if (suggestion.kind === "merchant" && suggestion.category) {
          row.createSpan({ cls: "finance-quick-add-suggestion-hint", text: ` → ${suggestion.category}` });
        }
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          acceptSuggestion(suggestion);
        });
      });
    };

    const updateSuggestions = () => {
      const { token } = currentToken();
      suggestions = buildSuggestions(token);
      highlighted = 0;
      renderSuggestions();
    };

    const acceptSuggestion = (suggestion) => {
      const { start, end } = currentToken();
      let insert = suggestion.text;
      if (suggestion.kind === "merchant" && suggestion.category) {
        const parsedNow = core.parseQuickAddInput(input.value, known.categories, { defaultCurrency: this.plugin.settings.defaultCurrency });
        if (!parsedNow.category) insert = `${suggestion.text} #${suggestion.category}`;
      }
      const trailing = suggestion.kind === "person" ? "" : " ";
      input.value = `${input.value.slice(0, start)}${insert}${trailing}${input.value.slice(end)}`;
      const caret = start + insert.length + trailing.length;
      input.setSelectionRange(caret, caret);
      input.focus();
      hideSuggestions();
      update();
    };

    const preview = contentEl.createDiv({ cls: "finance-quick-add-preview" });

    const dateRow = contentEl.createDiv({ cls: "finance-quick-add-daterow" });
    dateRow.createSpan({ text: "Date " });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = this.date;
    if (this.dateFromNote) {
      dateRow.createSpan({ cls: "finance-quick-add-keep", text: " from the open note" });
    }
    dateInput.addEventListener("change", () => {
      this.date = core.parseIsoDate(dateInput.value) || this.date;
      update();
    });

    const duplicateWarning = contentEl.createDiv({ cls: "finance-quick-add-duplicate is-hidden" });

    const buttons = contentEl.createDiv({ cls: "finance-quick-add-buttons" });
    const keepOpenLabel = buttons.createEl("label", { cls: "finance-quick-add-keep" });
    const keepOpen = keepOpenLabel.createEl("input", { type: "checkbox" });
    keepOpenLabel.appendText(" Keep open for next entry");
    const submit = buttons.createEl("button", { text: "Add", cls: "mod-cta" });

    const parseCurrent = () => {
      const parsed = core.parseQuickAddInput(input.value, known.categories, { defaultCurrency: this.plugin.settings.defaultCurrency });
      let date = this.date;
      if (parsed.dateToken) {
        const resolved = this.plugin.resolveDateToken(parsed.dateToken);
        if (resolved) {
          date = resolved;
          this.date = resolved;
          dateInput.value = resolved;
        }
      }
      return { parsed, date };
    };

    const update = () => {
      const { parsed, date } = parseCurrent();
      const home = this.plugin.settings.defaultCurrency;

      // A foreign amount on its own cannot be converted without a stored rate,
      // and guessing one would be worse than asking. Say which half is missing.
      if (parsed.needsConvertedAmount) {
        preview.setText(
          `${core.formatCurrencyWithCode(parsed.originalAmount, parsed.originalCurrency)} — now add what it cost in ${home}, e.g. "${parsed.originalAmount} ${parsed.originalCurrency} : 83.64"`
        );
        preview.removeClass("is-ready");
        submit.disabled = true;
        return;
      }
      if (!Number.isFinite(parsed.amount)) {
        preview.setText("Type an amount to begin…");
        preview.removeClass("is-ready");
        submit.disabled = true;
        return;
      }

      const category = parsed.category || "uncategorized";
      const bits = [core.formatCurrency(parsed.amount, home)];
      if (parsed.originalCurrency) {
        bits.push(
          `${core.formatCurrencyWithCode(parsed.originalAmount, parsed.originalCurrency)}${
            parsed.impliedRate ? ` @ ${parsed.impliedRate}` : ""
          }`
        );
      }
      bits.push(core.displayCategoryPath(category));
      if (parsed.merchant) bits.push(parsed.merchant);
      const owedPreview = core.buildOwedSharesFromTokens(parsed.amount, parsed.splitCount, parsed.owedTokens || []);
      if (owedPreview.length) {
        bits.push(`my share ${core.formatCurrency(parsed.amount - owedPreview.reduce((sum, item) => sum + item.amount, 0), home)}`);
      }
      bits.push(date);
      preview.setText(bits.join("  ·  "));
      preview.addClass("is-ready");
      submit.disabled = false;

      // Same amount, same merchant, same day, already logged — almost always a
      // double-tap rather than a real second purchase.
      const fingerprint = core.transactionFingerprint({ date, amount: parsed.amount, merchant: parsed.merchant });
      const isDuplicate = Boolean(parsed.merchant) && this._todayFingerprints?.has(fingerprint);
      duplicateWarning.toggleClass("is-hidden", !isDuplicate);
      if (isDuplicate) {
        duplicateWarning.setText(`Already logged today: ${core.formatCurrency(parsed.amount, home)} at ${parsed.merchant}. Add anyway?`);
      }
    };

    const commit = async () => {
      const { parsed, date } = parseCurrent();
      if (!Number.isFinite(parsed.amount)) return;
      submit.disabled = true;
      try {
        await this.plugin.handleCaptureExpense(
          {
            amount: parsed.amount,
            category: parsed.category || "uncategorized",
            currency: this.plugin.settings.defaultCurrency,
            date,
            merchant: parsed.merchant,
            name: parsed.merchant,
            originalAmount: parsed.originalAmount,
            originalCurrency: parsed.originalCurrency,
            originalRateKey: parsed.originalCurrency,
            // Both amounts were typed, so no stored rate is involved and trip
            // mode must not re-convert this entry.
            fxProvided: Boolean(parsed.originalCurrency),
            owedTokens: parsed.owedTokens || [],
            splitCount: parsed.splitCount,
            source: "quick-add",
          },
          // `force` because this modal does its own duplicate warning above and
          // the user has just answered it by pressing the button. A deliberate
          // human action is never silently dropped by the cross-method check.
          { notify: true, method: "quick-add", force: true }
        );
        input.value = "";
        update();
        if (keepOpen.checked) {
          input.focus();
        } else {
          this.close();
        }
      } catch (error) {
        new Notice(`Quick add failed: ${error.message}`);
        submit.disabled = false;
      }
    };

    input.addEventListener("input", () => {
      update();
      updateSuggestions();
    });
    input.addEventListener("blur", () => window.setTimeout(hideSuggestions, 150));
    input.addEventListener("keydown", (event) => {
      if (suggestions.length) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          highlighted = (highlighted + 1) % suggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          // First Enter (like Tab) accepts the highlighted suggestion; once the
          // popup has nothing open, a second Enter falls through below and
          // submits the entry instead.
          event.preventDefault();
          acceptSuggestion(suggestions[highlighted]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          hideSuggestions();
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        hideSuggestions();
        commit();
      }
    });
    submit.addEventListener("click", () => commit());

    update();
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

