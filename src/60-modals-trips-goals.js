class HolidayBudgetModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.didComplete = false;
    this.query = "";
    this.createForm = {
      endDate: core.addDays(core.todayIsoLocal(), 7) || core.todayIsoLocal(),
      holidayKey: "",
      name: "",
      startDate: core.todayIsoLocal(),
    };
  }

  getMatchingFiles() {
    const query = this.query.trim().toLowerCase();
    const files = this.plugin.getHolidayBudgetFiles();
    if (!query) return files;
    return files.filter((file) => file.basename.toLowerCase().includes(query));
  }

  async chooseFile(file) {
    this.didComplete = true;
    this.plugin.settings.activeHolidayBudgetPath = file.path;
    await this.plugin.saveSettings();
    await this.app.workspace.getLeaf(true).openFile(file);
    if (typeof this.onComplete === "function") {
      await this.onComplete(file);
    }
    this.close();
  }

  updateCreateDefaults() {
    const name = this.query.trim();
    this.createForm.name = name;
    this.createForm.holidayKey = core.normalizeHolidayKey(this.createForm.holidayKey || "") || guessHolidayTagFromName(name || "Trip");
  }

  async createFromForm() {
    this.updateCreateDefaults();
    const holidayName = String(this.createForm.name || "").trim();
    if (!holidayName) return;
    this.didComplete = true;
    const file = await this.plugin.createOrOpenHolidayBudget({
      endDate: this.createForm.endDate,
      holidayKey: this.createForm.holidayKey,
      name: holidayName,
      startDate: this.createForm.startDate,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") {
        await this.onComplete(file);
      }
    }
    this.close();
  }

  renderResults() {
    this.resultsEl.empty();
    const matches = this.getMatchingFiles();

    if (matches.length) {
      for (const file of matches) {
        const row = this.resultsEl.createDiv({ cls: "finance-tracker-holiday-result" });
        row.createDiv({ cls: "finance-tracker-holiday-result-title", text: file.basename });
        row.createDiv({ cls: "finance-tracker-holiday-result-path", text: file.path });
        row.addEventListener("click", async () => {
          await this.chooseFile(file);
        });
      }
      return;
    }

    const trimmed = this.query.trim();
    if (!trimmed) {
      this.resultsEl.createDiv({
        cls: "finance-tracker-empty",
        text: "Search for an existing trip budget, or type a new trip name to create one.",
      });
      if (this.createPanelEl) {
        this.createPanelEl.empty();
      }
      return;
    }

    this.updateCreateDefaults();
    const createRow = this.resultsEl.createDiv({ cls: "finance-tracker-holiday-result is-create" });
    createRow.createDiv({ cls: "finance-tracker-holiday-result-title", text: `Create "${trimmed}"` });
    createRow.createDiv({
      cls: "finance-tracker-holiday-result-path",
      text: normalizePath(`${this.plugin.settings.budgetsFolderPath}/${appendBudgetSuffix(trimmed)}.md`),
    });
    createRow.addEventListener("click", async () => {
      await this.createFromForm();
    });

    if (this.createPanelEl) {
      this.renderCreatePanel();
    }
  }

  renderCreatePanel() {
    if (!this.createPanelEl) return;
    this.createPanelEl.empty();
    if (!this.query.trim()) return;

    this.updateCreateDefaults();
    this.createPanelEl.createEl("h3", { text: "New trip details" });
    this.createPanelEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Set the tracking tag and trip dates now so the trip budget note is ready to use immediately.",
    });

    const nameSetting = new Setting(this.createPanelEl).setName("Trip name").setDesc("This is the budget note title and file name.");
    nameSetting.addText((text) => {
      text.setPlaceholder("Japan 2026").setValue(this.createForm.name).onChange((value) => {
        this.createForm.name = value;
      });
    });

    const tagSetting = new Setting(this.createPanelEl)
      .setName("Trip tracking tag")
      .setDesc("Used by the holiday dashboard to match tags like #log/spending/2026/japan/flights.");
    tagSetting.addText((text) => {
      text.setPlaceholder("2026/japan").setValue(this.createForm.holidayKey).onChange((value) => {
        this.createForm.holidayKey = core.normalizeHolidayKey(value) || guessHolidayTagFromName(this.createForm.name || this.query);
      });
    });

    const startSetting = new Setting(this.createPanelEl).setName("Start date").setDesc("Saved as a date property in the trip budget note.");
    startSetting.addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.createForm.startDate).onChange((value) => {
        this.createForm.startDate = core.parseIsoDate(value) || core.todayIsoLocal();
      });
    });

    const endSetting = new Setting(this.createPanelEl).setName("End date").setDesc("Saved as a date property in the trip budget note.");
    endSetting.addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.createForm.endDate).onChange((value) => {
        this.createForm.endDate = core.parseIsoDate(value) || this.createForm.startDate;
      });
    });

    const actions = this.createPanelEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create trip budget" });
    createButton.addEventListener("click", async () => {
      await this.createFromForm();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select or create a trip" });
    const intro = contentEl.createEl("p", {
      text: "Search an existing trip budget. If nothing matches, choose the create option to start a new one inside your budgets folder.",
    });
    intro.addClass("finance-tracker-settings-section-copy");

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Japan 2026",
    });
    input.addClass("finance-tracker-holiday-input");
    input.addEventListener("input", () => {
      this.query = input.value || "";
      this.renderResults();
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && this.query.trim()) {
        event.preventDefault();
        const matches = this.getMatchingFiles();
        if (matches.length) {
          await this.chooseFile(matches[0]);
          return;
        }
        await this.createFromForm();
      }
    });

    this.resultsEl = contentEl.createDiv({ cls: "finance-tracker-holiday-results" });
    this.createPanelEl = contentEl.createDiv({ cls: "finance-tracker-holiday-create-panel" });
    this.renderResults();
    window.setTimeout(() => input.focus(), 0);
  }

  async onClose() {
    if (!this.didComplete && typeof this.onComplete === "function") {
      await this.onComplete(null);
    }
  }
}

class ExchangeRateModal extends Modal {
  constructor(app, plugin, budgetFile, holidayMeta, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.budgetFile = budgetFile;
    this.holidayMeta = holidayMeta;
    this.onSubmit = onSubmit;
    this.form = {
      endDate: holidayMeta?.endDate || core.todayIsoLocal(),
      rate: "",
      scope: "flat",
      sourceCurrency: "",
      startDate: holidayMeta?.startDate || core.todayIsoLocal(),
      targetCurrency: holidayMeta?.currency || plugin.settings.defaultCurrency,
    };
  }

  togglePeriodFields() {
    if (!this.periodFieldsEl) return;
    this.periodFieldsEl.style.display = this.form.scope === "period" ? "" : "none";
  }

  async submit() {
    const payload = {
      endDate: this.form.endDate,
      rate: Number(this.form.rate),
      scope: this.form.scope,
      sourceCurrency: this.form.sourceCurrency,
      startDate: this.form.startDate,
      targetCurrency: this.form.targetCurrency,
    };
    this.close();
    await this.onSubmit(payload);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Add exchange rate: ${this.budgetFile.basename}` });

    new Setting(contentEl)
      .setName("Rate scope")
      .setDesc("Choose whether this rate applies to the whole trip or only a date range.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("flat", "Whole holiday")
          .addOption("period", "Date range")
          .setValue(this.form.scope)
          .onChange((value) => {
            this.form.scope = value;
            this.togglePeriodFields();
          })
      );

    new Setting(contentEl)
      .setName("Source currency")
      .setDesc("Examples: JPY, JPY CASH, USD.")
      .addText((text) =>
        text.setPlaceholder("JPY").setValue(this.form.sourceCurrency).onChange((value) => {
          this.form.sourceCurrency = value.trim().toUpperCase();
        })
      );

    new Setting(contentEl)
      .setName("Target currency")
      .setDesc("Defaults to the holiday note currency.")
      .addText((text) =>
        text.setPlaceholder(this.holidayMeta?.currency || this.plugin.settings.defaultCurrency).setValue(this.form.targetCurrency).onChange((value) => {
          this.form.targetCurrency = value.trim().toUpperCase() || (this.holidayMeta?.currency || this.plugin.settings.defaultCurrency);
        })
      );

    new Setting(contentEl)
      .setName("Rate")
      .setDesc("How much 1 unit of the source currency is worth in the target currency.")
      .addText((text) =>
        text.setPlaceholder("0.00877").setValue(this.form.rate).onChange((value) => {
          this.form.rate = value.trim();
        })
      );

    this.periodFieldsEl = contentEl.createDiv();

    new Setting(this.periodFieldsEl)
      .setName("Period start")
      .setDesc("Start date for this dated override.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.startDate).onChange((value) => {
          this.form.startDate = core.parseIsoDate(value) || this.holidayMeta?.startDate || core.todayIsoLocal();
        });
      });

    new Setting(this.periodFieldsEl)
      .setName("Period end")
      .setDesc("End date for this dated override.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.endDate).onChange((value) => {
          this.form.endDate = core.parseIsoDate(value) || this.holidayMeta?.endDate || this.form.startDate;
        });
      });

    this.togglePeriodFields();

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const cancelButton = actions.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", async () => {
      this.close();
      await this.onSubmit(null);
    });
    const saveButton = actions.createEl("button", { text: "Save rate" });
    saveButton.addEventListener("click", async () => {
      await this.submit();
    });
  }
}

class SavingsGoalModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.form = {
      dueDate: "",
      goalKey: "",
      name: "",
    };
  }

  async submit() {
    const name = String(this.form.name || "").trim();
    if (!name) return;
    const file = await this.plugin.createOrOpenSavingsGoal({
      dueDate: this.form.dueDate,
      goalKey: this.form.goalKey || buildGoalKeyFromName(name),
      name,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") {
        await this.onComplete(file);
      }
    }
    this.close();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create savings goal" });

    new Setting(contentEl)
      .setName("Goal name")
      .setDesc("For example House Deposit or Rainy Day Fund.")
      .addText((text) =>
        text.setPlaceholder("House Deposit").onChange((value) => {
          this.form.name = value;
          this.form.goalKey = buildGoalKeyFromName(value);
        })
      );

    new Setting(contentEl)
      .setName("Goal key")
      .setDesc("Used by tags like #log/income/house-deposit.")
      .addText((text) =>
        text.setPlaceholder("house-deposit").setValue(this.form.goalKey).onChange((value) => {
          this.form.goalKey = core.normalizeCategoryPath(value) || buildGoalKeyFromName(this.form.name);
        })
      );

    new Setting(contentEl)
      .setName("Due date")
      .setDesc("Optional target date for calculating required savings per period.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.dueDate).onChange((value) => {
          this.form.dueDate = core.parseIsoDate(value) || "";
        });
      });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create goal note" });
    createButton.addEventListener("click", async () => {
      await this.submit();
    });
  }
}

// Guided first-time setup: picks the folders, then creates the starter notes
// (budgets, dashboard, recurring payments, goals) from templates embedded in
// the plugin. Never overwrites an existing note, so it is safe to re-run.
class SetupWizardModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.form = {
      createBudgets: true,
      createDashboard: true,
      createGoals: true,
      createRecurring: true,
      currency: plugin.settings.defaultCurrency || "AUD",
      dailyNotesFolder: plugin.settings.dailyNotesFolder || "",
      budgetsFolder: plugin.settings.budgetsFolderPath || "Utility/Budgets",
      financeFolder: String(plugin.settings.captureInboxFolder || "Utility/Finance/Inbox").replace(/\/?Inbox\/?$/i, "") || "Utility/Finance",
      recurringNoteName: plugin.settings.recurringNoteName || DEFAULT_SETTINGS.recurringNoteName,
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Finance Tracker setup" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Three questions, then the starter notes are created for you. Everything is plain markdown you can move or edit later, and nothing you already have is overwritten.",
    });

    contentEl.createEl("h3", { text: "1. Where things live" });

    new Setting(contentEl)
      .setName("Daily notes folder")
      .setDesc("Where your daily notes are. Detected from the Journals or Daily notes plugin when possible.")
      .addText((text) =>
        text.setPlaceholder("Journal/Daily").setValue(this.form.dailyNotesFolder).onChange((value) => {
          this.form.dailyNotesFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Budgets folder")
      .setDesc("Budget, goal, and trip notes are stored here.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets").setValue(this.form.budgetsFolder).onChange((value) => {
          this.form.budgetsFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Finance folder")
      .setDesc("Dashboard and goals notes, the capture inbox, and the merchant map go here.")
      .addText((text) =>
        text.setPlaceholder("Utility/Finance").setValue(this.form.financeFolder).onChange((value) => {
          this.form.financeFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Currency")
      .setDesc("Used for totals and new captures.")
      .addText((text) =>
        text.setPlaceholder("AUD").setValue(this.form.currency).onChange((value) => {
          this.form.currency = value.trim().toUpperCase();
        })
      );

    new Setting(contentEl)
      .setName("Recurring payments note name")
      .setDesc("Filename for the bill-management note, inside the budgets folder. Changeable later in settings.")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.recurringNoteName).setValue(this.form.recurringNoteName).onChange((value) => {
          this.form.recurringNoteName = value.trim();
        })
      );

    contentEl.createEl("h3", { text: "2. Starter notes to create" });

    const noteToggles = [
      ["createBudgets", "💸 Budgets", "A budget table with example rows — edit the limits to make them yours."],
      ["createDashboard", "📊 Finance dashboard", "Weekly and monthly dashboards, net worth, forecast, and a sample query."],
      ["createRecurring", "🔁 Recurring payments", "The bill management page: due dates, log/skip, and your runway."],
      ["createGoals", "🎯 Goals", "The goals overview with one-tap contributions."],
    ];
    for (const [key, name, desc] of noteToggles) {
      new Setting(contentEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((toggle) =>
          toggle.setValue(this.form[key]).onChange((value) => {
            this.form[key] = value;
          })
        );
    }

    contentEl.createEl("h3", { text: "3. Create" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "After this, log your first expense with the Quick add transaction command — today's daily note is created automatically.",
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const skipButton = actions.createEl("button", { text: "Not now" });
    skipButton.addEventListener("click", () => this.close());
    const createButton = actions.createEl("button", { text: "Create starter notes", cls: "mod-cta" });
    createButton.addEventListener("click", async () => {
      createButton.disabled = true;
      try {
        await this.runSetup();
        this.close();
      } catch (error) {
        new Notice(`Setup failed: ${error.message}`);
        createButton.disabled = false;
      }
    });
  }

  async runSetup() {
    const plugin = this.plugin;
    if (this.form.dailyNotesFolder) plugin.settings.dailyNotesFolder = this.form.dailyNotesFolder;
    if (this.form.budgetsFolder) plugin.settings.budgetsFolderPath = this.form.budgetsFolder;
    plugin.settings.recurringNoteName = this.form.recurringNoteName || DEFAULT_SETTINGS.recurringNoteName;
    plugin.settings.defaultCurrency = core.normalizeCurrency(this.form.currency, plugin.settings.defaultCurrency);
    const financeFolder = (this.form.financeFolder || "Utility/Finance").replace(/\/+$/, "");
    plugin.settings.captureInboxFolder = normalizePath(`${financeFolder}/Inbox`);
    plugin.settings.merchantMapPath = normalizePath(`${financeFolder}/Merchant Map.md`);
    plugin.settings.budgetArchiveFolderPath = normalizePath(`${plugin.settings.budgetsFolderPath}/Archive`);
    await plugin.saveSettings();

    await plugin.ensureBudgetInfrastructure();
    await plugin.ensureFolder(plugin.settings.captureInboxFolder);

    const created = [];
    let openTarget = null;
    if (this.form.createBudgets) {
      const file = await plugin.ensureBudgetNote();
      created.push(file.basename);
    }
    if (this.form.createRecurring) {
      const file = await plugin.ensureTextFile(plugin.getRecurringNotePath(), () => plugin.buildRecurringNoteContent());
      created.push(file.basename);
    }
    if (this.form.createGoals) {
      const file = await plugin.ensureTextFile(
        normalizePath(`${financeFolder}/🎯 Goals.md`),
        () => plugin.buildGoalsNoteContent()
      );
      created.push(file.basename);
    }
    if (this.form.createDashboard) {
      const file = await plugin.ensureTextFile(
        normalizePath(`${financeFolder}/📊 Finance Dashboard.md`),
        () => plugin.buildDashboardNoteContent()
      );
      created.push(file.basename);
      openTarget = file;
    }

    new Notice(created.length ? `Finance Tracker is ready: ${created.join(", ")}` : "Settings saved.");
    if (openTarget) {
      await this.app.workspace.getLeaf(true).openFile(openTarget);
    }
  }

  onClose() {
    // Persist settings even on "Not now" so a fresh install is only greeted once.
    this.plugin.saveSettings().catch(() => {});
    this.contentEl.empty();
  }
}

// Contributions and withdrawals share one dialog: the same goal, amount and
// date, differing only in the tag written and, for a withdrawal, what the money
// was spent on. The goal is typed with autocomplete rather than picked from a
// dropdown, which on a phone meant scrolling a native picker of every goal.
class ContributeGoalModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.goalKey = core.normalizeCategoryPath(options.goalKey || "");
    this.mode = options.mode === "withdraw" ? "withdraw" : "contribute";
    this.onDone = options.onDone;
    this.form = { amount: "", date: core.todayIsoLocal(), note: "" };
    this.goals = [];
  }

  findGoal(text) {
    const needle = String(text || "").trim().toLowerCase();
    if (!needle) return null;
    return (
      this.goals.find((goal) => goal.goalName.toLowerCase() === needle) ||
      this.goals.find((goal) => goal.goalKey === core.normalizeCategoryPath(needle)) ||
      null
    );
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl?.setText?.("");
    const heading = contentEl.createEl("h2");
    const copy = contentEl.createEl("p", { cls: "finance-tracker-settings-section-copy" });

    this.goals = (await this.plugin.collectSavingsGoalDefinitions()).filter((goal) => !goal.isLegacyRunwayNote);
    if (!this.goals.length) {
      heading.setText("Contribute to a goal");
      contentEl.createDiv({ cls: "finance-tracker-empty", text: "No goals yet. Create one with New goal in the hub, or the Create savings goal command." });
      return;
    }
    const known = await this.plugin.collectKnownSuggestions();

    const modeRow = contentEl.createDiv({ cls: "finance-hub-chips finance-goal-mode" });
    const modeButtons = {};
    for (const [key, label] of [["contribute", "Contribute"], ["withdraw", "Withdraw"]]) {
      modeButtons[key] = modeRow.createEl("button", { cls: "finance-hub-chip", text: label });
      modeButtons[key].addEventListener("click", () => {
        this.mode = key;
        sync();
      });
    }

    const goalRow = contentEl.createDiv({ cls: "finance-edit-row" });
    goalRow.createEl("label", { cls: "finance-edit-label", text: "Goal" });
    const goalInput = goalRow.createEl("input", { type: "text", attr: { placeholder: "Start typing a goal", "aria-label": "Goal" } });
    const preset = this.goals.find((goal) => goal.goalKey === this.goalKey) || (this.goals.length === 1 ? this.goals[0] : null);
    goalInput.value = preset ? preset.goalName : "";
    this.goalSuggest = new FinanceSuggest(goalInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = String(query || "").trim().toLowerCase();
        return this.goals
          .filter((goal) => !needle || goal.goalName.toLowerCase().includes(needle) || goal.goalKey.includes(core.normalizeCategoryPath(needle)))
          .map((goal) => ({ value: goal.goalName, label: goal.goalName, kind: goal.goalType === "holiday" ? "trip" : "goal", hint: goal.goalKey }));
      },
    });

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { cls: "finance-edit-label", text: "Amount" });
    const amountInput = amountRow.createEl("input", {
      type: "number",
      attr: { step: "0.01", min: "0", inputmode: "decimal", placeholder: "150", "aria-label": "Amount" },
    });
    amountInput.addEventListener("input", () => {
      this.form.amount = amountInput.value;
    });

    const categoryLabel = contentEl.createEl("label", { cls: "finance-edit-label", text: "Spent on" });
    const categoryHost = contentEl.createDiv({ cls: "finance-contribute-category" });
    const picker = new CategoryPicker(categoryHost, { categories: known.categories, value: "", scope: this.scope });
    this.picker = picker;

    const dateRow = contentEl.createDiv({ cls: "finance-edit-row" });
    dateRow.createEl("label", { cls: "finance-edit-label", text: "Date" });
    const dateInput = dateRow.createEl("input", { type: "date", attr: { "aria-label": "Date" } });
    dateInput.value = this.form.date;
    dateInput.addEventListener("input", () => {
      this.form.date = core.parseIsoDate(dateInput.value) || core.todayIsoLocal();
    });

    const noteRow = contentEl.createDiv({ cls: "finance-edit-row" });
    noteRow.createEl("label", { cls: "finance-edit-label", text: "Note" });
    const noteInput = noteRow.createEl("input", { type: "text", attr: { placeholder: "Optional", "aria-label": "Note" } });
    noteInput.addEventListener("input", () => {
      this.form.note = noteInput.value;
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const saveButton = actions.createEl("button", { cls: "mod-cta" });

    const sync = () => {
      const withdrawing = this.mode === "withdraw";
      heading.setText(withdrawing ? "Withdraw from a goal" : "Contribute to a goal");
      copy.setText(
        withdrawing
          ? "Logs spending paid from the goal, like `- $80.00 #log/spending/goal/roadbike/repairs`. It lowers what the goal has saved and stays out of your home spending."
          : "Logs a contribution like `- $150.00 #log/income/roadbike`. The goal is an envelope tracked in your notes, so no money has to move between accounts."
      );
      for (const [key, button] of Object.entries(modeButtons)) {
        button.toggleClass("is-active", key === this.mode);
        button.setAttribute("aria-pressed", String(key === this.mode));
      }
      categoryLabel.toggleClass("is-hidden", !withdrawing);
      categoryHost.toggleClass("is-hidden", !withdrawing);
      saveButton.setText(withdrawing ? "Log withdrawal" : "Log contribution");
    };
    sync();

    saveButton.addEventListener("click", async () => {
      const goal = this.findGoal(goalInput.value);
      if (!goal) {
        new Notice("Choose one of your goals first.");
        return;
      }
      const amount = core.parseNumber(this.form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        new Notice("Enter an amount first.");
        return;
      }
      saveButton.disabled = true;
      try {
        const money = core.formatCurrency(amount, goal.currency || this.plugin.settings.defaultCurrency);
        if (this.mode === "withdraw") {
          await this.plugin.logGoalWithdrawal(goal.goalKey, goal.goalName, amount, this.form.date, this.form.note, picker.getValue());
          new Notice(`Logged ${money} taken from ${goal.goalName}`);
        } else {
          await this.plugin.logGoalContribution(goal.goalKey, goal.goalName, amount, this.form.date, this.form.note);
          new Notice(`Logged ${money} to ${goal.goalName}`);
        }
        if (typeof this.onDone === "function") await this.onDone();
        this.close();
      } catch (error) {
        new Notice(`${this.mode === "withdraw" ? "Withdrawal" : "Contribution"} failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    window.setTimeout(() => (preset ? amountInput : goalInput).focus(), 0);
  }

  onClose() {
    this.goalSuggest?.destroy();
    this.picker?.destroy?.();
    this.contentEl.empty();
  }
}

class SettleUpModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Settle up split expenses" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Settling logs the repayment as income and marks that person's owed entries settled in your daily notes.",
    });
    const list = contentEl.createDiv({ cls: "finance-tracker-budget-list" });
    list.createDiv({ cls: "finance-tracker-empty", text: "Loading balances…" });

    const entries = await this.plugin.collectAllTransactions();
    const summary = core.summarizeSplitBalances(entries);
    const open = summary.people.filter((person) => person.outstanding > 0);
    list.empty();

    if (!open.length) {
      list.createDiv({ cls: "finance-tracker-empty", text: "Nothing outstanding — everyone is settled up." });
      return;
    }

    for (const person of open) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
      row.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${person.displayName} owes ${core.formatCurrency(person.outstanding, this.plugin.settings.defaultCurrency)}`,
      });
      row.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${person.entries.filter((item) => !item.settled).length} open entr${person.entries.filter((item) => !item.settled).length === 1 ? "y" : "ies"} · tap to settle`,
      });
      row.addEventListener("click", async () => {
        row.addClass("is-uncategorized");
        try {
          await this.plugin.settleUpWithPerson(person.person, person.displayName, person.outstanding);
          this.close();
        } catch (error) {
          new Notice(`Settle up failed: ${error.message}`);
        }
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BalanceSnapshotModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.rows = [];
    this.accountOptions = [];
    this.onSaved = options.onSaved;
  }

  addRow(container, account = "", amount = "") {
    const row = container.createDiv({ cls: "finance-edit-row" });
    const accountInput = row.createEl("input", { type: "text", attr: { placeholder: "anz-plus", "aria-label": "Account" } });
    accountInput.value = account;
    // Accounts already snapshotted, and the ones captures say money came from, so
    // "anz-plus" is picked rather than retyped as "anz plus" and split in two.
    const suggest = new FinanceSuggest(accountInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        return this.accountOptions
          .filter((option) => !needle || option.includes(needle))
          .filter((option) => !this.rows.some((other) => other.accountInput !== accountInput && core.normalizeCategoryPath(other.accountInput.value) === option))
          .map((option) => ({ value: option, label: option, kind: "account" }));
      },
    });
    this.suggests = [...(this.suggests || []), suggest];
    const amountInput = row.createEl("input", { type: "number", attr: { step: "0.01", placeholder: "5230", inputmode: "decimal", "aria-label": "Balance" } });
    amountInput.value = amount === "" ? "" : String(amount);
    this.rows.push({ accountInput, amountInput });
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Snapshot balances" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Logs one bullet per account into today's note, like `- $5,230.00 #log/balance/anz-plus`. Accounts you have snapshotted before are pre-filled with their last balance.",
    });

    const rowsHost = contentEl.createDiv();
    const entries = await this.plugin.collectAllTransactions();
    const summary = core.summarizeBalanceSnapshots(entries);
    const ledgerSources = (this.plugin.settings.captureLedger || [])
      .map((record) => core.normalizeCategoryPath(record?.source || ""))
      .filter((sourceName) => sourceName && !["manual", "quick-add", "csv-reconcile", "apple-pay"].includes(sourceName));
    this.accountOptions = Array.from(new Set([...summary.accounts.map((account) => account.key), ...ledgerSources])).sort();
    for (const account of summary.accounts) {
      this.addRow(rowsHost, account.key, account.latest?.amount ?? "");
    }
    if (!summary.accounts.length) {
      this.addRow(rowsHost);
    }

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const addButton = actions.createEl("button", { text: "Add account" });
    addButton.addEventListener("click", () => this.addRow(rowsHost));
    const saveButton = actions.createEl("button", { text: "Log snapshot", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      const lines = [];
      for (const row of this.rows) {
        const account = row.accountInput.value.trim();
        const amount = core.parseNumber(row.amountInput.value);
        if (!account || !Number.isFinite(amount)) continue;
        lines.push(core.buildBalanceSnapshotLine(account, amount));
      }
      if (!lines.length) {
        new Notice("Add at least one account with a balance first.");
        return;
      }
      saveButton.disabled = true;
      try {
        await this.plugin.appendFinanceLines(core.todayIsoLocal(), lines);
        new Notice(`Logged ${lines.length} balance snapshot${lines.length === 1 ? "" : "s"}`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Snapshot failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  onClose() {
    for (const suggest of this.suggests || []) suggest.destroy();
    this.contentEl.empty();
  }
}

