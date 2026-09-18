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
      text: "Settings follow the finance hub's areas. Everything here can also be changed later without losing anything you've logged.",
    });

    // Jump links to each section, filled in once they exist: the tab is long,
    // and on a phone scrolling to Portfolio took a while.
    const nav = containerEl.createDiv({ cls: "finance-settings-nav" });
    const sections = [];
    const addSection = (title, description) => {
      sections.push(containerEl.createEl("h3", { text: title }));
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

    addSection("General", "Applies everywhere: totals, dashboards, the sidebar and the hub.");

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

    const hubActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(hubActions, "Open finance hub", () => this.plugin.activateHubView(), { primary: true, opensModal: true });

    addSection("Capture", "How transactions get into your daily notes.");

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

    containerEl.createEl("h4", { text: "Capture methods" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Every method below can run at the same time. Quick add and hand-typed bullets always work and are not listed.",
    });

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

    addSection(
      "Categories",
      "Merchant → category rules. A rule matches a capture's merchant exactly, or as a whole chunk inside it, so \"woolworths\" also covers \"Woolworths/cnr Brisbane H\". Add or edit one below, or tick \"Remember this merchant\" when you categorise a transaction; remove one here if it guesses wrong."
    );

    new Setting(containerEl)
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

    this.renderMerchantMapList(containerEl.createDiv({ cls: "finance-tracker-goal-list" })).catch(() => {});

    addSection(
      "Budgets and reviews",
      "Budgets live in a table in the budgets note. Weekly and monthly finance-dashboard blocks show every review section; show: and hide: in a block choose which."
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

    const budgetActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(budgetActions, "Open budgets note", () => this.plugin.openBudgetNote(), {
      primary: true,
      errorPrefix: "Opening budgets note",
    });

    addSection(
      "Bills and runway",
      "Bills are the notes in the Bills folder, matched to payments tagged like #log/spending/subscriptions/monthly/spotify. Until you convert, they are detected from those tags."
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
          .addOption("amountDesc", "Amount (highest first)")
          .addOption("amountAsc", "Amount (lowest first)")
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
      text: "Detected bills. Untick Active to pause one — it moves to the Archived section of the recurring payments block, where it can be resumed or removed for good. Auto-log logs it automatically on its due day. Both are saved on the bill's own note (or, before you convert to bill notes, in the registry table of the recurring payments note).",
    });
    const recurringListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderRecurringList(recurringListEl).catch(() => {});
    const recurringActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(recurringActions, "Open recurring payments note", () => this.plugin.openRecurringNote(), {
      primary: true,
      errorPrefix: "Opening recurring payments note",
    });
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

    containerEl.createEl("h4", { text: "Runway" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "How much you need available to be safe for a chosen period, worked out from the bills above. Choose the account it comes out of and runway says whether that account's latest balance covers it. Show it with the Runway block, or at the bottom of the Bills tab.",
    });

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

    new Setting(containerEl)
      .setName("Account")
      .setDesc("Where your bills and spending come out of. Runway compares itself with this account's latest balance snapshot: covered, or short by how much.")
      .addDropdown((dropdown) => {
        const current = this.plugin.settings.runwayAccount || "";
        dropdown.addOption("", "None");
        if (current) dropdown.addOption(current, current);
        dropdown.setValue(current);
        this.plugin
          .collectAllTransactions()
          .then((entries) => {
            for (const account of core.summarizeBalanceSnapshots(entries).accounts) {
              if (account.key !== current) dropdown.addOption(account.key, account.key);
            }
            dropdown.setValue(current);
          })
          .catch(() => {});
        dropdown.onChange(async (value) => {
          this.plugin.settings.runwayAccount = value;
          await this.plugin.saveSettings();
          this.plugin.refreshDailyBudgetView();
          this.renderRunwayStatus(runwayStatus).catch(() => {});
        });
      });

    const runwayStatus = containerEl.createDiv({ cls: "finance-tracker-vault-status" });
    this.renderRunwayStatus(runwayStatus).catch(() => {});

    addSection("Goals and trips", "Savings goals are envelopes tracked in your notes. Any goal with a target and a due date shows what to set aside each week, and prompts you when it's due or done. The finance hub's Goals & trips tab does all of this too.");
    containerEl.createEl("h4", { text: "Savings goals" });
    const savingsActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(savingsActions, "New goal", () => {
      this.plugin.openNewGoal(async () => this.display());
    }, { primary: true, opensModal: true });

    const savingsGoalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(savingsGoalListEl, "savings").catch(() => {});

    // Trips: the notes, plus trip mode, in one place. Trip mode used to be its
    // own section further down, which read as a separate feature rather than a
    // switch belonging to the trip you just picked.
    containerEl.createEl("h4", { text: "Trips" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text:
      "Save for several trips at once — each note below can be active simultaneously. Spending counts as trip spending automatically when the note date falls inside a trip's start and end dates. Archiving a finished trip freezes its savings steps and spending record into the note.",
    });

    const tripActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(tripActions, "New or existing trip", () => {
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

    addSection(
      "Portfolio",
      "Shares and ETFs, from the Trades table in your portfolio note. Figures are arithmetic on your own records, not financial or tax advice."
    );

    new Setting(containerEl)
      .setName("Price source")
      .setDesc(
        "Where share prices come from. Typed prices make no network requests. A Google Sheet and Yahoo both fetch over the internet, only when the portfolio is opened or refreshed, and only the tickers you hold are sent."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Typed in the portfolio note")
          .addOption("sheet", "A published Google Sheet")
          .addOption("yahoo", "Yahoo Finance (unofficial)")
          .setValue(this.plugin.settings.priceSource || "manual")
          .onChange(async (value) => {
            this.plugin.settings.priceSource = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    const source = this.plugin.settings.priceSource || "manual";
    if (source === "sheet") {
      new Setting(containerEl)
        .setName("Sheet link")
        .setDesc("In Google Sheets: File → Share → Publish to web → the sheet → Comma-separated values → Publish, then paste the link here.")
        .addText((text) =>
          text
            .setPlaceholder("https://docs.google.com/spreadsheets/d/e/…/pub?output=csv")
            .setValue(this.plugin.settings.priceSheetUrl || "")
            .onChange(async (value) => {
              this.plugin.settings.priceSheetUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );
      const help = containerEl.createEl("details", { cls: "finance-tracker-advanced" });
      help.createEl("summary", { text: "Set up the sheet" });
      help.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "Copy this into cell A1 of a new Google Sheet. It has a row for each ticker you hold and each foreign currency, with the formulas already written.",
      });
      const template = help.createEl("textarea", { cls: "finance-price-sheet-template", attr: { rows: "6", readonly: "readonly" } });
      this.plugin
        .loadPortfolio()
        .then((portfolio) => {
          const tickers = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)));
          const currencies = Array.from(new Set(portfolio.trades.map((trade) => trade.currency)));
          template.value = core.buildPriceSheetTemplate(tickers.length ? tickers : ["VAS.AX", "AAPL"], currencies.length ? currencies : ["USD"]);
        })
        .catch(() => {});
    }
    if (source === "yahoo") {
      containerEl.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "Yahoo's price feed is free but unofficial: it can refuse requests or change without notice. When it refuses, the plugin backs off and keeps showing the last prices it fetched, marked as old.",
      });
    }
    if (source !== "manual") {
      new Setting(containerEl)
        .setName("Refresh at most every (minutes)")
        .setDesc("Opening the portfolio refreshes prices when they are older than this.")
        .addText((text) =>
          text.setValue(String(this.plugin.settings.priceRefreshMinutes || 60)).onChange(async (value) => {
            const minutes = Number(value);
            this.plugin.settings.priceRefreshMinutes = Number.isFinite(minutes) && minutes >= 5 ? Math.floor(minutes) : 60;
            await this.plugin.saveSettings();
          })
        );
    }

    const portfolioActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(portfolioActions, "Open portfolio", () => this.plugin.openPortfolioNote(), { primary: true, errorPrefix: "Opening the portfolio" });

    addSection("Files and setup", "Where the plugin keeps its notes, and the guided setup, which creates any starter notes that are missing and never overwrites one.");
    const setupActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(setupActions, "Set up finance notes", () => new SetupWizardModal(this.app, this.plugin).open(), {
      opensModal: true,
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


    for (const heading of sections) {
      const link = nav.createEl("button", { cls: "finance-settings-nav-link", text: heading.textContent || heading.text || "" });
      link.addEventListener("click", () => heading.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
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
      const currency = this.plugin.settings.defaultCurrency;
      const balance = runway.balance
        ? runway.balance.status === "covered"
          ? ` ${runway.accountLabel} covers it with ${core.formatCurrency(runway.balance.difference, currency)} to spare.`
          : ` ${runway.accountLabel} is short by ${core.formatCurrency(Math.abs(runway.balance.difference), currency)}.`
        : "";
      statusEl.setText(
        runway.target > 0
          ? `Right now: keep ${core.formatCurrency(runway.target, currency)} available for the next ${runway.period}, with ${runway.occurrences.length} bill${
              runway.occurrences.length === 1 ? "" : "s"
            } due by ${runway.windowEnd}.${balance}`
          : `No bills fall inside the next ${runway.period}, so there is nothing to set aside yet.`
      );
    } catch (error) {
      statusEl.empty();
      statusEl.addClass("is-warning");
      statusEl.setText(`Could not work out your runway: ${error.message}`);
    }
  }

  // The merchant map was remove-only, and its empty state said the checkbox was
  // the only way in — which stopped being true when learning from history
  // shipped. You can add and edit rules here, and ask what a given descriptor
  // would be filed as before it arrives.
  async renderMerchantMapList(listEl) {
    listEl.empty();
    const plugin = this.plugin;
    const known = await plugin.collectKnownSuggestions();

    const categoryItems = (query) => {
      const needle = core.normalizeCategoryPath(query);
      const out = known.categories
        .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
        .slice(0, 8)
        .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
      if (needle && !known.categories.includes(needle)) {
        out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
      }
      return out;
    };

    const addCard = listEl.createDiv({ cls: "finance-tracker-budget-card" });
    addCard.createDiv({ cls: "finance-tracker-budget-title", text: "Add a rule" });
    const merchantRow = addCard.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text", attr: { placeholder: "Woolworths", "aria-label": "Merchant" } });
    new FinanceSuggest(merchantInput, {
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        return known.merchants
          .filter((merchant) => !needle || merchant.name.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((merchant) => ({ value: merchant.name, label: merchant.name, kind: "merchant" }));
      },
    });
    const categoryRow = addCard.createDiv({ cls: "finance-edit-row" });
    categoryRow.createEl("label", { text: "Category" });
    const categoryInput = categoryRow.createEl("input", { type: "text", attr: { placeholder: "food/groceries", "aria-label": "Rule category" } });
    new FinanceSuggest(categoryInput, { getItems: categoryItems });
    addAction(
      addCard.createDiv({ cls: "finance-tracker-header-actions" }),
      "Add rule",
      async () => {
        await plugin.rememberMerchantCategory(merchantInput.value, categoryInput.value);
        await this.renderMerchantMapList(listEl);
      },
      { primary: true, errorPrefix: "Adding the rule" }
    );

    const testCard = listEl.createDiv({ cls: "finance-tracker-budget-card" });
    testCard.createDiv({ cls: "finance-tracker-budget-title", text: "What would this be filed as?" });
    const testInput = testCard.createEl("input", {
      type: "text",
      attr: { placeholder: "SQ * Milk N Mochi Pty Ltd", "aria-label": "Test a merchant" },
    });
    const testResult = testCard.createDiv({ cls: "finance-tracker-budget-meta", text: "Paste a merchant exactly as your bank sends it." });
    const runTest = async () => {
      const value = testInput.value.trim();
      if (!value) {
        testResult.setText("Paste a merchant exactly as your bank sends it.");
        return;
      }
      const suggestion = await plugin.suggestCategoryForMerchant(value);
      const reason = plugin.describeSuggestionSource(suggestion.source);
      testResult.setText(
        suggestion.category
          ? `${core.displayCategoryPath(suggestion.category)} — ${reason}. Grouped as "${core.merchantRootKey(value)}".`
          : `Nothing matches, so it would be logged uncategorised. Grouped as "${core.merchantRootKey(value)}".`
      );
    };
    testInput.addEventListener("input", () => runTest());
    testInput.addEventListener("change", () => runTest());

    const entries = Object.entries(plugin.settings.merchantMap || {}).sort((left, right) => left[0].localeCompare(right[0]));
    if (!entries.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No rules yet. Add one above, tick \"remember this merchant\" when filing an entry, or let the plugin follow how you filed a merchant last time.",
      });
      return;
    }

    listEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: `${entries.length} rule${entries.length === 1 ? "" : "s"}. A rule beats what your notes say, so this is where you overrule a bad precedent.`,
    });

    for (const [merchant, category] of entries) {
      const setting = new Setting(listEl).setName(merchant);
      setting.addText((text) => {
        text.setValue(category).onChange(async (value) => {
          const next = core.normalizeCategoryPath(value);
          if (!next) return;
          plugin.settings.merchantMap = { ...plugin.settings.merchantMap, [merchant]: next };
          plugin._merchantSources = null;
          await plugin.saveSettings();
        });
        new FinanceSuggest(text.inputEl, { getItems: categoryItems });
      });
      setting.addButton((button) =>
        button.setButtonText("Remove").onClick(async () => {
          await plugin.forgetMerchantCategory(merchant);
          await this.renderMerchantMapList(listEl);
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
    // Every bill in the author's registry said Auto-log "yes" while the master
    // switch was off, so nothing was ever auto-logged and nothing said so.
    if (!this.plugin.settings.autoLogRecurring) {
      listEl.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Auto-log is switched off above, so the Auto-log ticks below have no effect until you turn it on.",
      });
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
        await this.plugin.updateRecurringItem(item, { active: currentCheckbox.checked });
        await this.renderRecurringList(listEl);
      });

      const autoLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Auto-log" } });
      const autoCheckbox = autoLabel.createEl("input", { type: "checkbox" });
      autoCheckbox.checked = item.autoLog !== false;
      autoCheckbox.addEventListener("change", async () => {
        autoCheckbox.disabled = true;
        await this.plugin.updateRecurringItem(item, { autoLog: autoCheckbox.checked });
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

