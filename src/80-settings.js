class FinanceTrackerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Finance Tracker" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-intro",
      text: "Configure capture, dashboards, trips, goals, and recurring payments.",
    });

    const addSection = (title, description) => {
      containerEl.createEl("h3", { text: title });
      if (description) {
        containerEl.createEl("p", {
          cls: "finance-tracker-settings-section-copy",
          text: description,
        });
      }
    };

    // Progressive disclosure: settings that are auto-detected or set once by
    // the wizard live behind a collapsed "Advanced" block, so the default view
    // shows only what someone would actually come here to change.
    const addAdvanced = (summary, description) => {
      const details = containerEl.createEl("details", { cls: "finance-tracker-advanced" });
      details.createEl("summary", { text: summary });
      if (description) {
        details.createEl("p", { cls: "finance-tracker-settings-section-copy", text: description });
      }
      return details;
    };

    addSection("Capture", "Where spending is written, and how captured transactions are logged.");

    this.renderVaultStatus(containerEl).catch(() => {});

    new Setting(containerEl)
      .setName("Default currency")
      .setDesc("Used for rendering totals and for new captures when a currency is not supplied.")
      .addText((text) =>
        text.setPlaceholder("AUD").setValue(this.plugin.settings.defaultCurrency).onChange(async (value) => {
          this.plugin.settings.defaultCurrency = core.normalizeCurrency(value, DEFAULT_SETTINGS.defaultCurrency);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Quick add uses the open daily note's date")
      .setDesc("When quick add opens while a daily note is active, pre-fill the date from that note instead of today.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.quickAddUseNoteDate)).onChange(async (value) => {
          this.plugin.settings.quickAddUseNoteDate = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Open note after capture")
      .setDesc("Open the daily note immediately after an Apple Shortcut logs a transaction.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openDailyNoteAfterCapture).onChange(async (value) => {
          this.plugin.settings.openDailyNoteAfterCapture = value;
          await this.plugin.saveSettings();
        })
      );

    addSection(
      "Capture methods",
      "Every method below can run at the same time. Quick add and hand-typed bullets always work and are not listed."
    );

    for (const method of core.CAPTURE_METHODS) {
      new Setting(containerEl)
        .setName(core.captureMethodLabel(method))
        .setDesc(CAPTURE_METHOD_DESCRIPTIONS[method] || "")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.isCaptureMethodEnabled(method)).onChange(async (value) => {
            if (!this.plugin.settings.captureMethods || typeof this.plugin.settings.captureMethods !== "object") {
              this.plugin.settings.captureMethods = { ...DEFAULT_SETTINGS.captureMethods };
            }
            this.plugin.settings.captureMethods[method] = value;
            await this.plugin.saveSettings();
            if (method === "gist") this.plugin.scheduleGistSync();
            this.display();
          })
        );
    }

    new Setting(containerEl)
      .setName("When two methods capture the same transaction")
      .setDesc(
        "Only ever compares captures that arrived by different methods — two identical purchases down the same method are still logged as two."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("skip", "Skip the second one")
          .addOption("warn", "Log it, but tell me")
          .addOption("off", "Log everything")
          .setValue(this.plugin.settings.crossMethodDuplicates || "skip")
          .onChange(async (value) => {
            this.plugin.settings.crossMethodDuplicates = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Duplicate window (days)")
      .setDesc("How far apart two captures can be and still count as the same purchase. Bank feeds often settle a day after the tap.")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(String(this.plugin.settings.duplicateWindowDays ?? DEFAULT_SETTINGS.duplicateWindowDays))
          .onChange(async (value) => {
            const parsed = Number(String(value).trim());
            this.plugin.settings.duplicateWindowDays = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SETTINGS.duplicateWindowDays;
            await this.plugin.saveSettings();
          })
      );

    // Evidence, not guesswork: which pairs of methods have actually been
    // logging the same transactions lately.
    const overlap = this.plugin.captureOverlapReport(60);
    new Setting(containerEl)
      .setName("Overlap check")
      .setDesc(
        overlap.length
          ? `${overlap[0].channels.map((channel) => core.describeCaptureChannel(channel)).join(" and ")} have captured the same transaction ${overlap[0].count} time${overlap[0].count === 1 ? "" : "s"} in the last 60 days.`
          : "No two methods have captured the same transaction in the last 60 days."
      )
      .addButton((button) =>
        button.setButtonText("Details").onClick(() => new CaptureOverlapModal(this.app, this.plugin).open())
      );

    if (this.plugin.isCaptureMethodEnabled("gist")) {
      const gistAdvanced = addAdvanced(
        "GitHub gist capture",
        "The phone appends a capture line to a private gist; the plugin polls it and drains it. The only method that captures without opening Obsidian and still works on an Obsidian Sync vault."
      );

      new Setting(gistAdvanced)
        .setName("Gist ID")
        .setDesc("The ID from the gist URL — the part after your username.")
        .addText((text) =>
          text.setPlaceholder("a1b2c3d4…").setValue(this.plugin.settings.gistCaptureId).onChange(async (value) => {
            this.plugin.settings.gistCaptureId = value.trim();
            await this.plugin.saveSettings();
            this.plugin.scheduleGistSync();
          })
        );

      new Setting(gistAdvanced)
        .setName("Access token")
        .setDesc("A fine-grained token with only the Gists permission. Stored in this vault's data.json in plain text — treat it like a password and revoke it if the vault is ever shared.")
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder("github_pat_…").setValue(this.plugin.settings.gistCaptureToken).onChange(async (value) => {
            this.plugin.settings.gistCaptureToken = value.trim();
            await this.plugin.saveSettings();
            this.plugin.scheduleGistSync();
          });
        });

      new Setting(gistAdvanced)
        .setName("File name")
        .setDesc("The file inside the gist that captures are appended to.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.gistCaptureFilename)
            .setValue(this.plugin.settings.gistCaptureFilename)
            .onChange(async (value) => {
              this.plugin.settings.gistCaptureFilename = value.trim() || DEFAULT_SETTINGS.gistCaptureFilename;
              await this.plugin.saveSettings();
            })
        );

      new Setting(gistAdvanced)
        .setName("Check every (minutes)")
        .setDesc("How often to poll while Obsidian is open. It also syncs on launch.")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(String(this.plugin.settings.gistCapturePollMinutes ?? DEFAULT_SETTINGS.gistCapturePollMinutes))
            .onChange(async (value) => {
              const parsed = Number(String(value).trim());
              this.plugin.settings.gistCapturePollMinutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_SETTINGS.gistCapturePollMinutes;
              await this.plugin.saveSettings();
              this.plugin.scheduleGistSync();
            })
        );

      new Setting(gistAdvanced)
        .setName(this.plugin.settings.gistCaptureLastSync ? `Last synced ${new Date(this.plugin.settings.gistCaptureLastSync).toLocaleString()}` : "Never synced")
        .addButton((button) =>
          button
            .setButtonText("Sync now")
            .setCta()
            .onClick(async () => {
              await this.plugin.syncCaptureGist({ notify: true });
              this.display();
            })
        );
    }

    const captureAdvanced = addAdvanced(
      "Advanced: note format",
      "Auto-detected from the Journals or core Daily notes plugin, and set for you by first-time setup. Changing these will not rewrite notes you have already logged."
    );

    new Setting(captureAdvanced)
      .setName("Daily notes folder")
      .setDesc("Folder that stores your daily notes. The plugin follows your core Daily notes folder and infers the existing file layout from notes already in the vault.")
      .addText((text) =>
        text.setPlaceholder("Journal/Periodics/1. Daily").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (value) => {
          this.plugin.settings.dailyNotesFolder = value.trim() || DEFAULT_SETTINGS.dailyNotesFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Finance heading")
      .setDesc("Heading the plugin looks for when reading a daily note. Legacy ## Spending notes are still parsed.")
      .addText((text) =>
        text.setPlaceholder("## Finance").setValue(this.plugin.settings.spendingHeading).onChange(async (value) => {
          this.plugin.settings.spendingHeading = value.trim() || DEFAULT_SETTINGS.spendingHeading;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Spending root tag")
      .setDesc("The root task line the plugin keeps a running total on. Changing this after you have logged anything will orphan every existing note's total.")
      .addText((text) =>
        text.setPlaceholder("#log/spending").setValue(this.plugin.settings.spendingRootTag).onChange(async (value) => {
          this.plugin.settings.spendingRootTag = value.trim() || DEFAULT_SETTINGS.spendingRootTag;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Capture inbox folder")
      .setDesc("Folder an Apple Shortcut writes capture files into. The plugin drains it automatically.")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.captureInboxFolder).setValue(this.plugin.settings.captureInboxFolder).onChange(async (value) => {
          this.plugin.settings.captureInboxFolder = value.trim() || DEFAULT_SETTINGS.captureInboxFolder;
          await this.plugin.saveSettings();
        })
      );

    addSection("Dashboard", "Defaults for the dashboard block and the sidebar.");

    new Setting(containerEl)
      .setName("Default grouping")
      .setDesc("Choose whether charts default to top-level or full category paths.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("primary", "Primary category")
          .addOption("full", "Full category path")
          .setValue(this.plugin.settings.dashboardDefaultGroupBy)
          .onChange(async (value) => {
            this.plugin.settings.dashboardDefaultGroupBy = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Payment calendar range")
      .setDesc("How far ahead the recurring block's payment calendar looks. The buttons above the calendar switch it for one session.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1", "1 month")
          .addOption("3", "3 months")
          .addOption("12", "12 months")
          .setValue(String(this.plugin.settings.paymentCalendarMonths || DEFAULT_SETTINGS.paymentCalendarMonths))
          .onChange(async (value) => {
            this.plugin.settings.paymentCalendarMonths = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Week starts on")
      .setDesc("Used when the plugin calculates week and fortnight ranges.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("monday", "Monday")
          .addOption("sunday", "Sunday")
          .setValue(this.plugin.settings.weekStartsOn || DEFAULT_SETTINGS.weekStartsOn)
          .onChange(async (value) => {
            this.plugin.settings.weekStartsOn = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Budget check period")
      .setDesc("Default period used by the daily budget checker.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("week", "1 week")
          .addOption("fortnight", "1 fortnight")
          .addOption("month", "Monthly")
          .addOption("bimonth", "Bi-monthly")
          .addOption("quarter", "Quarterly")
          .addOption("year", "Yearly")
          .setValue(this.plugin.settings.budgetCheckPeriod || DEFAULT_SETTINGS.budgetCheckPeriod)
          .onChange(async (value) => {
            this.plugin.settings.budgetCheckPeriod = value;
            await this.plugin.saveSettings();
          })
      );

    const budgetActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(budgetActions, "Open budgets note", () => this.plugin.openBudgetNote(), {
      primary: true,
      errorPrefix: "Opening budgets note",
    });

    const filesAdvanced = addAdvanced("Advanced: file locations", "Set for you by first-time setup.");

    new Setting(filesAdvanced)
      .setName("Budgets folder")
      .setDesc("Folder where the default budget, trip budgets, and the recurring payments note live.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets").setValue(this.plugin.settings.budgetsFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetsFolderPath = value.trim() || DEFAULT_SETTINGS.budgetsFolderPath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(filesAdvanced)
      .setName("Budget archive folder")
      .setDesc("Trips and goals are moved here when you archive them.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets/Archive").setValue(this.plugin.settings.budgetArchiveFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetArchiveFolderPath = value.trim() || DEFAULT_SETTINGS.budgetArchiveFolderPath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(filesAdvanced)
      .setName("Recurring payments note")
      .setDesc("Filename of the bill-management note, inside the budgets folder.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.recurringNoteName)
          .setValue(this.plugin.settings.recurringNoteName)
          .onChange(async (value) => {
            this.plugin.settings.recurringNoteName = value.trim() || DEFAULT_SETTINGS.recurringNoteName;
            await this.plugin.saveSettings();
          })
      );

    new Setting(filesAdvanced)
      .setName("Budgets note name")
      .setDesc("Filename of the default budget note, inside the budgets folder.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultBudgetNoteName)
          .setValue(this.plugin.settings.defaultBudgetNoteName)
          .onChange(async (value) => {
            this.plugin.settings.defaultBudgetNoteName = value.trim() || DEFAULT_SETTINGS.defaultBudgetNoteName;
            await this.plugin.saveSettings();
          })
      );

    const merchantAdvanced = addAdvanced(
      "Advanced: merchant map",
      "Merchant → category rules. A rule matches a capture's merchant exactly, or as a whole chunk inside it, so \"woolworths\" also covers \"Woolworths/cnr Brisbane H\". Add one with the \"Remember this merchant → category\" checkbox when editing a transaction; remove one here if it guesses wrong."
    );

    new Setting(merchantAdvanced)
      .setName("Learn categories from past notes")
      .setDesc(
        "When no rule above matches, file the capture the way the same merchant was filed last time in your daily notes. Categorising a merchant by hand once is then enough to catch every later capture from it, with nothing to remember to tick. Rules above always win over history."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.learnCategoriesFromHistory !== false).onChange(async (value) => {
          this.plugin.settings.learnCategoriesFromHistory = value;
          await this.plugin.saveSettings();
        })
      );

    this.renderMerchantMapList(merchantAdvanced.createDiv({ cls: "finance-tracker-goal-list" }));

    // Trips: the notes, plus trip mode, in one place. Trip mode used to be its
    // own section further down, which read as a separate feature rather than a
    // switch belonging to the trip you just picked.
    addSection(
      "Trips",
      "Save for several trips at once — each note below can be active simultaneously. Spending counts as trip spending automatically when the note date falls inside a trip's start and end dates. Archiving a finished trip freezes its savings steps and spending record into the note."
    );

    const tripActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(tripActions, "Select or create a trip", () => {
      new HolidayBudgetModal(this.app, this.plugin, async () => this.display()).open();
    }, { primary: true, opensModal: true });
    addAction(tripActions, "Archive finished trips", async () => {
      await this.plugin.archiveFinishedHolidays({ notify: true });
      this.display();
    }, { errorPrefix: "Archiving trips" });
    addAction(
      tripActions,
      this.plugin.settings.tripModeActive ? "End trip mode" : "Start trip mode",
      async () => {
        if (this.plugin.settings.tripModeActive) await this.plugin.endTrip();
        else await this.plugin.startTrip();
        this.display();
      },
      { errorPrefix: "Trip mode" }
    );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: this.plugin.settings.tripModeActive
        ? `Trip mode is on — quick add and URL captures default to this trip's tag and currency: ${this.plugin.settings.activeTripGoalPath || this.plugin.settings.activeHolidayBudgetPath}`
        : "Trip mode is off. Turn it on while you are away and quick add will default to the trip's tag and currency.",
    });

    const goalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(goalListEl, "holiday").catch(() => {});

    addSection("Savings goals", "Create standalone savings goal notes for things like a house deposit or rainy day fund. Any goal with a target amount and a due date shows sinking-fund math automatically.");
    const savingsActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(savingsActions, "Create savings goal", () => {
      new SavingsGoalModal(this.app, this.plugin, async () => this.display()).open();
    }, { primary: true, opensModal: true });

    const savingsGoalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(savingsGoalListEl, "savings").catch(() => {});

    addSection(
      "Recurring payments",
      "Recurring bills are detected from tags whose subtag encodes the cadence, like #log/spending/subscriptions/monthly/spotify."
    );

    new Setting(containerEl)
      .setName("Recurring tag prefix")
      .setDesc("The category prefix that marks an entry as recurring. Default: subscriptions.")
      .addText((text) =>
        text.setPlaceholder("subscriptions").setValue(this.plugin.settings.recurringTagPrefix).onChange(async (value) => {
          this.plugin.settings.recurringTagPrefix = core.normalizeCategoryPath(value) || DEFAULT_SETTINGS.recurringTagPrefix;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto-log recurring payments")
      .setDesc("Master switch: log recurring items automatically on their due day. Each bill below can opt out with its Auto-log toggle.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.autoLogRecurring)).onChange(async (value) => {
          this.plugin.settings.autoLogRecurring = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sort bills by")
      .setDesc("Order for the Upcoming bills list, the sidebar's due-bills card, and the list below.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("dueDate", "Due date (overdue first)")
          .addOption("monthlyCostDesc", "Cost per month (highest first)")
          .addOption("nameAsc", "Name (A–Z)")
          .setValue(this.plugin.settings.recurringSortOrder || "dueDate")
          .onChange(async (value) => {
            this.plugin.settings.recurringSortOrder = value;
            await this.plugin.saveSettings();
            await this.renderRecurringList(recurringListEl);
          })
      );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Detected bills. Untick Active to pause one — it moves to the Archived section of the recurring payments block, where it can be resumed or removed for good. Auto-log logs it automatically on its due day. Both are stored in the registry table of the recurring payments note.",
    });
    const recurringListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderRecurringList(recurringListEl).catch(() => {});
    const recurringActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(recurringActions, "Open recurring payments note", () => this.plugin.openRecurringNote(), {
      primary: true,
      errorPrefix: "Opening recurring payments note",
    });
    addSection(
      "Runway",
      "How much you need available to be safe for a chosen period, worked out from the bills above. Read-only — there is nothing to fund and nothing to keep in sync. Show it with the Runway block, or at the bottom of the recurring payments note."
    );

    new Setting(containerEl)
      .setName("Runway period")
      .setDesc("How far ahead to cover. The figure is the bills that actually fall inside that window, not an average.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1 week", "1 week")
          .addOption("2 weeks", "2 weeks")
          .addOption("1 month", "1 month")
          .addOption("2 months", "2 months")
          .addOption("3 months", "3 months")
          .addOption("6 months", "6 months")
          .setValue(core.parseRunwayPeriod(this.plugin.settings.runwayPeriod).label)
          .onChange(async (value) => {
            this.plugin.settings.runwayPeriod = value;
            await this.plugin.saveSettings();
            this.plugin.refreshDailyBudgetView();
          })
      );

    new Setting(containerEl)
      .setName("What counts toward runway")
      .setDesc("Bills only, or bills plus your average discretionary spend over the last 90 days.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("spending", "Bills + usual spending")
          .addOption("bills", "Recurring bills only")
          .setValue(core.normalizeRunwayMode(this.plugin.settings.runwayMode))
          .onChange(async (value) => {
            this.plugin.settings.runwayMode = value;
            await this.plugin.saveSettings();
            this.plugin.refreshDailyBudgetView();
          })
      );

    const runwayStatus = containerEl.createDiv({ cls: "finance-tracker-vault-status" });
    this.renderRunwayStatus(runwayStatus).catch(() => {});

    addSection("Setup", "Re-run the guided setup to create any missing starter notes. Existing notes are never overwritten.");
    const setupActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(setupActions, "Set up finance notes", () => new SetupWizardModal(this.app, this.plugin).open(), {
      opensModal: true,
    });
  }

  // The three note-format settings are each a text box where a wrong value
  // silently yields empty dashboards and no error at all. This says out loud
  // what the plugin can currently see, which catches a misconfiguration faster
  // than any amount of setting description.
  async renderVaultStatus(containerEl) {
    const statusEl = containerEl.createDiv({ cls: "finance-tracker-vault-status" });
    statusEl.setText("Checking your vault…");
    try {
      const entries = await this.plugin.collectAllTransactions();
      const notes = new Set(entries.map((entry) => entry.filePath).filter(Boolean));
      statusEl.empty();
      if (!entries.length) {
        statusEl.addClass("is-warning");
        statusEl.setText(
          `No logged entries found yet. The plugin is reading "${this.plugin.settings.dailyNotesFolder}" and looking for a "${this.plugin.settings.spendingHeading}" heading — check those under Advanced if you expected to see something here.`
        );
        return;
      }
      statusEl.addClass("is-ok");
      const dates = entries.map((entry) => entry.date).filter(Boolean).sort();
      statusEl.setText(
        `Reading ${entries.length} entries across ${notes.size} note${notes.size === 1 ? "" : "s"}` +
          (dates.length ? ` — ${dates[0]} to ${dates[dates.length - 1]}.` : ".")
      );
    } catch (error) {
      statusEl.empty();
      statusEl.addClass("is-warning");
      statusEl.setText(`Could not read your notes: ${error.message}`);
    }
  }

  // Shows the figure the two dropdowns above produce, so the setting is not
  // abstract: you pick a period and immediately see what it costs.
  async renderRunwayStatus(statusEl) {
    statusEl.setText("Working out your runway…");
    try {
      const runway = await this.plugin.computeRunwayState(core.todayIsoLocal());
      statusEl.empty();
      statusEl.addClass(runway.target > 0 ? "is-ok" : "is-warning");
      statusEl.setText(
        runway.target > 0
          ? `Right now: keep ${core.formatCurrency(runway.target, this.plugin.settings.defaultCurrency)} available for the next ${runway.period} — ${runway.occurrences.length} bill${
              runway.occurrences.length === 1 ? "" : "s"
            } due by ${runway.windowEnd}.`
          : `No bills fall inside the next ${runway.period}, so there is nothing to set aside yet.`
      );
    } catch (error) {
      statusEl.empty();
      statusEl.addClass("is-warning");
      statusEl.setText(`Could not work out your runway: ${error.message}`);
    }
  }

  renderMerchantMapList(listEl) {
    listEl.empty();
    const entries = Object.entries(this.plugin.settings.merchantMap || {}).sort((left, right) =>
      left[0].localeCompare(right[0])
    );
    if (!entries.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No merchants learned yet — tick \"Remember this merchant → category\" when editing a transaction.",
      });
      return;
    }
    for (const [merchant, category] of entries) {
      const setting = new Setting(listEl).setName(merchant).setDesc(core.displayCategoryPath(category));
      setting.addButton((button) =>
        button.setButtonText("Remove").onClick(async () => {
          await this.plugin.forgetMerchantCategory(merchant);
          this.renderMerchantMapList(listEl);
        })
      );
    }
  }

  // Only current (non-paused) bills show here — pausing a bill moves it into
  // the Archived section of the finance-recurring block instead, where it can
  // be resumed or removed completely.
  async renderRecurringList(listEl) {
    listEl.empty();
    const recurring = await this.plugin.detectRecurring();
    const items = recurring.items.filter((item) => item.active !== false);
    if (!items.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: `No recurring payments detected yet. Log one with a cadence tag like #log/spending/${this.plugin.settings.recurringTagPrefix || "subscriptions"}/monthly/spotify.`,
      });
      return;
    }
    const scroll = listEl.createDiv({ cls: "finance-tracker-recurring-settings-scroll" });
    const header = scroll.createDiv({ cls: "finance-tracker-recurring-settings-header" });
    header.createSpan({ text: "Bill" });
    header.createSpan({ text: "Active" });
    header.createSpan({ text: "Auto-log" });
    for (const item of items) {
      const bits = [
        cadenceLabel(item.cadence),
        core.formatCurrency(item.lastAmount, item.currency || this.plugin.settings.defaultCurrency),
      ];
      if (item.nextDue) bits.push(`next due ${item.nextDue}`);
      const row = scroll.createDiv({ cls: "finance-tracker-recurring-settings-row" });
      const nameCell = row.createDiv({ cls: "finance-tracker-recurring-name" });
      nameCell.createDiv({ text: item.label });
      nameCell.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });

      const currentLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Active" } });
      const currentCheckbox = currentLabel.createEl("input", { type: "checkbox" });
      currentCheckbox.checked = true;
      currentCheckbox.addEventListener("change", async () => {
        currentCheckbox.disabled = true;
        await this.plugin.updateRecurringRegistryEntry(item, { active: currentCheckbox.checked });
        await this.renderRecurringList(listEl);
      });

      const autoLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Auto-log" } });
      const autoCheckbox = autoLabel.createEl("input", { type: "checkbox" });
      autoCheckbox.checked = item.autoLog !== false;
      autoCheckbox.addEventListener("change", async () => {
        autoCheckbox.disabled = true;
        await this.plugin.updateRecurringRegistryEntry(item, { autoLog: autoCheckbox.checked });
        autoCheckbox.disabled = false;
      });
    }
  }

  // Lists non-archived goal notes with an Active toggle (several holidays can
  // be saved for at once) and a per-note Archive button. `kind` scopes the
  // list to just trips ("holiday") or just plain savings goals ("savings") so
  // each settings section only shows its own notes — a savings goal has no
  // trip_tag and shouldn't render under Holiday budgets.
  async renderGoalList(listEl, kind = "all") {
    listEl.empty();
    const today = core.todayIsoLocal();
    const files = this.plugin.getHolidayBudgetFiles();
    const rows = [];
    for (const file of files) {
      const meta = await this.plugin.readHolidayBudgetFile(file);
      const generic = meta?.holidayKey ? null : this.plugin.parseSavingsGoalContent(await this.app.vault.cachedRead(file), file.path);
      if (!meta?.holidayKey && !generic?.goalKey) continue;
      if (meta?.archivedDate || generic?.archivedDate) continue;
      const isHoliday = Boolean(meta?.holidayKey);
      if (kind === "holiday" && !isHoliday) continue;
      if (kind === "savings" && isHoliday) continue;
      rows.push({ file, meta, generic });
    }

    if (!rows.length) {
      const emptyText =
        kind === "holiday" ? "No trips yet." : kind === "savings" ? "No savings goals yet." : "No goal or holiday notes yet.";
      listEl.createDiv({ cls: "finance-tracker-empty", text: emptyText });
      return;
    }

    for (const row of rows) {
      const isHoliday = Boolean(row.meta?.holidayKey);
      const name = isHoliday ? row.meta.holidayName : row.generic.goalName;
      const isActive = isHoliday ? row.meta.activeSavingsGoal : row.generic.activeSavingsGoal;
      const endDate = isHoliday ? row.meta.endDate : "";
      const bits = [];
      if (isHoliday) {
        bits.push(`trip ${row.meta.holidayKey}`);
        if (row.meta.startDate || endDate) bits.push(`${row.meta.startDate || "?"} to ${endDate || "?"}`);
        if (endDate && endDate < today) bits.push("ended");
      } else {
        bits.push("savings goal");
        if (row.generic.dueDate) bits.push(`due ${row.generic.dueDate}`);
      }

      const setting = new Setting(listEl).setName(name).setDesc(bits.join(" · "));
      setting.addToggle((toggle) =>
        toggle
          .setTooltip("Active — shows in the sidebar and forecast")
          .setValue(Boolean(isActive))
          .onChange(async (value) => {
            await this.plugin.setGoalActiveState(row.file, value);
          })
      );
      setting.addButton((button) =>
        button.setButtonText("Archive").onClick(async () => {
          const archivePath = await this.plugin.archiveGoalNote(row.file);
          new Notice(`Archived ${name} to ${archivePath}`);
          await this.renderGoalList(listEl, kind);
        })
      );
    }
  }
}

