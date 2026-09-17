class FinanceTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addSettingTab(new FinanceTrackerSettingTab(this.app, this));

    this.addCommand({
      id: "finance-tracker-export-csv",
      name: "Export transactions to CSV",
      callback: async () => {
        const range = {
          period: "all",
          start: "1900-01-01",
          end: "2999-12-31",
        };
        const entries = await this.collectTransactionsForRange(range);
        await this.exportEntriesToCsv(entries, "finance-transactions-all");
      },
    });

    this.addCommand({
      id: "finance-tracker-open-budgets",
      name: "Open budgets note",
      callback: async () => {
        await this.openBudgetNote();
      },
    });

    this.addCommand({
      id: "finance-tracker-add-exchange-rate",
      name: "Add trip exchange rate",
      callback: async () => {
        await this.openExchangeRateCommand();
      },
    });

    this.addCommand({
      id: "finance-tracker-create-savings-goal",
      name: "Create savings goal",
      callback: async () => {
        new SavingsGoalModal(this.app, this, async () => {}).open();
      },
    });

    if (typeof this.registerObsidianProtocolHandler === "function") {
      this.registerObsidianProtocolHandler(FINANCE_CAPTURE_ACTION, async (params) => {
        await this.handleCapture(params || {});
      });
    } else {
      console.warn("[finance-tracker] Obsidian protocol handlers are not available in this app version.");
    }

    this.registerMarkdownCodeBlockProcessor(DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderDashboard(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(HOLIDAY_DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderHolidayDashboard(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(SAVINGS_DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderSavingsDashboard(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(RECURRING_BLOCK, async (source, el, ctx) => {
      await this.renderRecurringBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(SPLITS_BLOCK, async (source, el, ctx) => {
      await this.renderSplitsBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(FORECAST_BLOCK, async (source, el, ctx) => {
      await this.renderForecastBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(NETWORTH_BLOCK, async (source, el, ctx) => {
      await this.renderNetWorthBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(QUERY_BLOCK, async (source, el, ctx) => {
      await this.renderQueryBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(GOALS_BLOCK, async (source, el, ctx) => {
      await this.renderGoalsBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(RUNWAY_BLOCK, async (source, el, ctx) => {
      await this.renderRunwayBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(BILL_BLOCK, async (source, el, ctx) => {
      await this.renderBillBlock(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(PORTFOLIO_BLOCK, async (source, el, ctx) => {
      await this.renderPortfolioBlock(source, el, ctx);
    });

    this.registerView(DAILY_BUDGET_VIEW, (leaf) => new DailyBudgetView(leaf, this));
    this.registerView(FINANCE_INBOX_VIEW, (leaf) => new FinanceInboxView(leaf, this));

    this.addRibbonIcon("coins", "Daily budget", () => this.activateDailyBudgetView());
    this.addRibbonIcon("circle-plus", "Quick add transaction", () => this.openQuickAdd());

    this._statusBarItem = this.addStatusBarItem();
    this._statusBarItem.addClass("finance-status-bar");
    this._statusBarItem.setText("💸 …");
    this._statusBarItem.addEventListener("click", () => this.openQuickAdd());

    this.addCommand({
      id: "finance-tracker-open-daily-budget",
      name: "Open daily budget",
      callback: () => this.activateDailyBudgetView(),
    });

    this.addCommand({
      id: "finance-tracker-open-inbox",
      name: "Open categorisation inbox",
      callback: () => this.activateInboxView(),
    });

    this.addCommand({
      id: "finance-tracker-quick-add",
      name: "Quick add transaction",
      callback: () => this.openQuickAdd(),
    });

    this.addCommand({
      id: "finance-tracker-drain-inbox",
      name: "Process capture inbox",
      callback: () => this.drainCaptureInbox({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-sync-gist",
      name: "Sync capture gist now",
      callback: () => this.syncCaptureGist({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-capture-overlap",
      name: "Check capture methods for overlap",
      callback: () => new CaptureOverlapModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-reconcile-csv",
      name: "Reconcile a bank CSV",
      callback: () => new BankReconcileModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-log-recurring",
      name: "Log due recurring payments",
      callback: () => this.logDueRecurringPayments({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-settle-up",
      name: "Settle up split expenses",
      callback: () => new SettleUpModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-start-trip",
      name: "Start trip",
      callback: () => this.startTrip(),
    });

    this.addCommand({
      id: "finance-tracker-end-trip",
      name: "End trip",
      callback: () => this.endTrip(),
    });

    this.addCommand({
      id: "finance-tracker-archive-finished-holidays",
      name: "Archive finished trips",
      callback: () => this.archiveFinishedHolidays({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-archive-completed-goals",
      name: "Archive completed goals",
      callback: () => this.archiveCompletedGoals({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-contribute-goal",
      name: "Contribute to a goal",
      callback: () => new ContributeGoalModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-open-recurring-note",
      name: "Open recurring payments note",
      callback: () => this.openRecurringNote(),
    });

    this.addCommand({
      id: "finance-tracker-setup",
      name: "Set up finance notes",
      callback: () => new SetupWizardModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-repair-totals",
      name: "Repair daily note totals",
      callback: () => this.repairAllDailyNoteTotals(),
    });

    this.addCommand({
      id: "finance-tracker-open-portfolio",
      name: "Open portfolio",
      callback: () => this.openPortfolioNote(),
    });

    this.addCommand({
      id: "finance-tracker-log-trade",
      name: "Log a trade",
      callback: () => this.openLogTrade(),
    });

    this.addCommand({
      id: "finance-tracker-refresh-prices",
      name: "Refresh share prices",
      callback: async () => {
        if ((this.settings.priceSource || "manual") === "manual") {
          new Notice("Prices are typed in by hand. Choose a sheet or Yahoo in settings to fetch them.");
          return;
        }
        const result = await this.refreshPrices({ force: true });
        new Notice(
          result.skipped === "backoff"
            ? `The price source is refusing requests; trying again after ${new Date(result.until).toLocaleTimeString()}.`
            : result.error || `Updated ${result.updated || 0} price${result.updated === 1 ? "" : "s"}.`
        );
      },
    });

    this.addCommand({
      id: "finance-tracker-convert-bills",
      name: "Convert recurring payments to bill notes",
      callback: () => this.openBillMigration(),
    });

    this.addCommand({
      id: "finance-tracker-tidy-recurring",
      name: "Tidy up recurring payments",
      callback: () => this.openRecurringCleanup(),
    });

    this.addCommand({
      id: "finance-tracker-recategorise",
      name: "Rename or split a category",
      callback: () => this.openRecategorise(),
    });

    this.addCommand({
      id: "finance-tracker-convert-legacy-trip-tags",
      name: "Convert legacy trip tags",
      callback: () => this.openLegacyTripTagMigration(),
    });

    this.addCommand({
      id: "finance-tracker-import-merchant-map",
      name: "Import merchant map note",
      callback: async () => {
        const added = await this.migrateMerchantMapFile({ force: true, notify: false });
        new Notice(
          added > 0
            ? `Finance: imported ${added} merchant rule${added === 1 ? "" : "s"}.`
            : "Finance: no new merchant rules to import."
        );
      },
    });

    this.addCommand({
      id: "finance-tracker-snapshot-balances",
      name: "Snapshot balances",
      callback: () => new BalanceSnapshotModal(this.app, this).open(),
    });

    // One palette entry instead of eight. Eight near-identical "Insert … block"
    // rows made the command list harder to scan for the commands that actually
    // do something, and picking a block is a choice better made in a list that
    // can describe each one.
    this.addCommand({
      id: "finance-tracker-insert-block",
      name: "Insert a finance block",
      editorCallback: (editor) => new InsertBlockModal(this.app, this, editor).open(),
    });

    this.app.workspace.onLayoutReady(() => {
      this.activateDailyBudgetView();
      this.setupCaptureInbox();
      this.setupIndexAndTotals();
      this.updateStatusBar().catch(() => {});
      if (this._freshInstall) {
        window.setTimeout(() => new SetupWizardModal(this.app, this).open(), 800);
      }
      if (this.settings.autoLogRecurring) {
        window.setTimeout(() => {
          this.logDueRecurringPayments({ notify: true, autoOnly: true }).catch((error) =>
            console.warn("[finance-tracker] auto-log recurring failed", error)
          );
        }, 3000);
      }
    });
  }

  async setupCaptureInbox() {
    try {
      if (this.settings.captureInboxFolder) {
        await this.ensureFolder(normalizePath(this.settings.captureInboxFolder));
      }
    } catch (_error) {
      // folder creation is best-effort; the Shortcut can create it on first write
    }
    const prefix = normalizePath(`${this.settings.captureInboxFolder}/`);
    const onInboxEvent = (file) => {
      if (file && file.path && _ftSelfWrites.has(file.path)) return;
      if (file && file.path && file.path.startsWith(prefix) && !file.path.includes("/_failed/")) {
        this._scheduleInboxDrain();
      }
    };
    this.registerEvent(this.app.vault.on("create", onInboxEvent));
    this.registerEvent(this.app.vault.on("modify", onInboxEvent));
    this.drainCaptureInbox({ notify: true }).catch((error) =>
      console.warn("[finance-tracker] initial inbox drain failed", error)
    );
    this.syncCaptureGist({ notify: false }).catch((error) =>
      console.warn("[finance-tracker] initial gist sync failed", error)
    );
    this.scheduleGistSync();
  }

  refreshInboxView() {
    for (const leaf of this.app.workspace.getLeavesOfType(FINANCE_INBOX_VIEW)) {
      if (typeof leaf.view?.refresh === "function") leaf.view.refresh();
    }
  }

  async activateInboxView() {
    const existing = this.app.workspace.getLeavesOfType(FINANCE_INBOX_VIEW);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: FINANCE_INBOX_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateDailyBudgetView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(DAILY_BUDGET_VIEW);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: DAILY_BUDGET_VIEW, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  onunload() {
    clearTimeout(this._inboxDrainTimer);
    clearTimeout(this._statusBarTimer);
  }

  async loadSettings() {
    const stored = await this.loadData();
    this._freshInstall = stored == null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);

    // A fresh install is born at the current schema; an existing one without a
    // recorded version predates versioning and starts at 0.
    const from = this._freshInstall ? DEFAULT_SETTINGS.schemaVersion : Number(stored?.schemaVersion) || 0;
    const pending = SETTINGS_MIGRATIONS.filter((migration) => migration.to > from);
    for (const migration of pending) {
      migration.run(this.settings, this);
      this.settings.schemaVersion = migration.to;
    }
    this.settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
    this._settingsMigratedFrom = from;
    if (pending.length) {
      console.log(`[finance-tracker] migrated settings ${from} → ${this.settings.schemaVersion}`);
      await this.saveSettings();
    }

    // Auto-detect the daily-note folder and date format from the Journals
    // community plugin or the core Daily notes plugin, falling back to the
    // manual setting when neither is configured.
    this._dailyNoteFormat = "YYYY-MM-DD";
    const journalsConfig = await this.readJournalsDailyConfig();
    const coreDailyNotesConfig = await this.readCoreDailyNotesConfig();
    const detected = journalsConfig || coreDailyNotesConfig;
    const detectedFolder = stripFolderTemplate(detected?.folder);
    if (detectedFolder) {
      const currentFolder = (this.settings.dailyNotesFolder || "").trim();
      if (!currentFolder || currentFolder === DEFAULT_SETTINGS.dailyNotesFolder) {
        this.settings.dailyNotesFolder = detectedFolder;
      }
    }
    if (detected?.format && core.formatDailyNoteName("2026-01-02", detected.format)) {
      this._dailyNoteFormat = detected.format;
    }
    // The daily-note template (Journals or core Daily notes) so a brand-new
    // daily note gets the user's real template pasted in — including running
    // it through Templater when installed — instead of a bare-bones skeleton.
    this._dailyNoteTemplatePath = String(detected?.template || "").trim();
    this.settings.budgetsFolderPath = this.settings.budgetsFolderPath || DEFAULT_SETTINGS.budgetsFolderPath;
    this.settings.budgetArchiveFolderPath = this.settings.budgetArchiveFolderPath || DEFAULT_SETTINGS.budgetArchiveFolderPath;
    this.settings.defaultBudgetNoteName = this.settings.defaultBudgetNoteName || DEFAULT_SETTINGS.defaultBudgetNoteName;
    this.settings.activeHolidayBudgetPath = this.settings.activeHolidayBudgetPath || "";
    this.settings.merchantMap = this.settings.merchantMap || {};
    // Only pre-versioning installs can still have a markdown merchant map to
    // fold in; skipping it otherwise saves a vault read on every single load.
    await this.migrateMerchantMapFile();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async readCoreDailyNotesConfig() {
    try {
      const raw = await this.app.vault.adapter.read(normalizePath(".obsidian/daily-notes.json"));
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  // Reads the Journals community plugin config and returns the first daily
  // journal's folder and date format, or null when Journals is not set up.
  // Journals folders can be per-date templates like
  // `Journal/Periodics/1. Daily/{{date:YYYY}}/{{date:MM}}` — only the static
  // prefix is a real folder, so template segments are stripped.
  async readJournalsDailyConfig() {
    try {
      const raw = await this.app.vault.adapter.read(normalizePath(".obsidian/plugins/journals/data.json"));
      const parsed = JSON.parse(raw);
      for (const journal of Object.values(parsed?.journals || {})) {
        if (journal?.write?.type !== "day") continue;
        const folder = stripFolderTemplate(journal.folder);
        if (!folder) continue;
        return {
          folder,
          format: String(journal.dateFormat || "YYYY-MM-DD").trim(),
          template: Array.isArray(journal.templates) ? journal.templates[0] : "",
        };
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  dailyNoteBaseName(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    return core.formatDailyNoteName(iso, this._dailyNoteFormat || "YYYY-MM-DD") || iso;
  }

  dailyNoteDateFromFileName(name) {
    return core.parseDailyNoteName(name, this._dailyNoteFormat || "YYYY-MM-DD");
  }

  async ensureFolder(folderPath) {
    const normalized = normalizePath(folderPath);
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  findExistingDailyNoteFile(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    const names = new Set([`${iso}.md`, `${this.dailyNoteBaseName(iso)}.md`]);
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    return (
      this.app.vault
        .getMarkdownFiles()
        .find((file) => file.path.startsWith(prefix) && names.has(file.name)) || null
    );
  }

  inferDailyNoteDirectory(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    const [year, month] = iso.split("-");
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    const example = this.app.vault
      .getMarkdownFiles()
      .find((file) => file.path.startsWith(prefix) && /\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/i.test(file.path));
    if (example) {
      return normalizePath(`${this.settings.dailyNotesFolder}/${year}/${month}`);
    }
    return normalizePath(this.settings.dailyNotesFolder);
  }

  getDailyNotePath(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    const existing = this.findExistingDailyNoteFile(iso);
    if (existing) return existing.path;
    const directory = this.inferDailyNoteDirectory(iso);
    return normalizePath(`${directory}/${this.dailyNoteBaseName(iso)}.md`);
  }

  buildMinimalDailyNote(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    return `---\ndate: ${iso}\n---\n\n## Finance\n- [ ] #log/spending 0\n`;
  }

  // Creates a brand-new daily note the same way opening it from the calendar
  // would: paste the user's real Journals/Daily-notes template — including
  // running it through Templater when installed, since these templates are
  // usually genuine Templater syntax (<% tp.file.title %> etc.), not the
  // plain {{date}} tokens core Daily notes can substitute on its own — rather
  // than silently replacing it with a bare-bones finance-only skeleton.
  async createDailyNoteFromTemplate(path, date) {
    const templatePath = String(this._dailyNoteTemplatePath || "").trim();
    if (!templatePath) return this.upsertFile(path, this.buildMinimalDailyNote(date));

    const templateFile =
      this.app.vault.getAbstractFileByPath(normalizePath(templatePath)) ||
      this.app.vault.getAbstractFileByPath(normalizePath(`${templatePath}.md`));
    if (!(templateFile instanceof TFile)) return this.upsertFile(path, this.buildMinimalDailyNote(date));

    await this.ensureFolder(normalizePath(path).split("/").slice(0, -1).join("/"));
    const file = await _ftCreate(this.app, normalizePath(path), "");

    const templater = this.app.plugins?.plugins?.["templater-obsidian"];
    if (templater?.templater?.write_template_to_file) {
      try {
        await templater.templater.write_template_to_file(templateFile, file);
        return file;
      } catch (_error) {
        // Fall through to a raw copy below — better a template with
        // unrendered <% %> tags left in than no template at all.
      }
    }
    try {
      const raw = await this.app.vault.cachedRead(templateFile);
      await _ftModify(this.app, file, raw);
    } catch (_error) {
      await _ftModify(this.app, file, this.buildMinimalDailyNote(date));
    }
    return file;
  }

  async upsertFile(path, content) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      await _ftModify(this.app,existing, content);
      return existing;
    }
    await this.ensureFolder(normalizedPath.split("/").slice(0, -1).join("/"));
    return _ftCreate(this.app,normalizedPath, content);
  }

  async ensureTextFile(path, contentBuilder) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      return existing;
    }
    const content = typeof contentBuilder === "function" ? contentBuilder() : String(contentBuilder || "");
    return this.upsertFile(normalizedPath, content);
  }

  parseCaptureParams(params) {
    const rawCurrency = String(params.currency || "").trim();
    const currencyProvided = Object.prototype.hasOwnProperty.call(params, "currency") && rawCurrency.length > 0;
    const currencyDescriptor = core.parseCurrencyDescriptor(rawCurrency || this.settings.defaultCurrency, this.settings.defaultCurrency);
    const amount = core.parseNumber(params.amount || params.total);
    if (!Number.isFinite(amount)) {
      throw new Error("Missing or invalid amount.");
    }

    const categoryFromTag = core.extractCategoryFromLogSpendingTag(`#${String(params.tag || "").replace(/^#/, "")}`);
    const category = core.normalizeCategoryPath(params.category || categoryFromTag || "") || "uncategorized";
    return {
      amount,
      category,
      currency: currencyDescriptor.currency,
      currencyProvided,
      date: core.parseIsoDate(params.date) || core.todayIsoLocal(),
      exchangeRateKey: currencyDescriptor.rateKey,
      card: String(params.card || params.pass || "").trim(),
      merchant: String(params.merchant || params.payee || params.name || "").trim(),
      name: String(params.name || params.merchant || params.payee || "").trim(),
      note: String(params.note || params.memo || "").trim(),
      originalAmount: core.parseNumber(params.originalamount || params.originalAmount),
      originalCurrency: String(params.originalcurrency || params.originalCurrency || "").trim(),
      source: String(params.source || "apple-pay").trim(),
      externalId: String(params.externalid || params.externalId || params.id || "").trim(),
      transaction: String(params.transaction || "").trim(),
      splitCount: core.parseNumber(params.split),
      owedTokens: String(params.owed || "")
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean),
    };
  }

  // True unless the user has switched this transport off in settings. Absent
  // keys read as enabled so a partial captureMethods object from an older
  // data.json can never silently disable a method someone relies on.
  isCaptureMethodEnabled(method) {
    const configured = this.settings.captureMethods;
    if (!configured || typeof configured !== "object") return DEFAULT_SETTINGS.captureMethods[method] !== false;
    if (!Object.prototype.hasOwnProperty.call(configured, method)) {
      return DEFAULT_SETTINGS.captureMethods[method] !== false;
    }
    return configured[method] !== false;
  }

  // Entry point for `obsidian://finance-capture`. Handles both a single
  // transaction (?amount=…) and a batched queue (?lines=…), which are separate
  // methods because someone may well want the queue without the per-tap open.
  async handleCapture(params) {
    const batch = String(params?.lines || params?.batch || "").trim();
    if (batch) {
      if (!this.isCaptureMethodEnabled("batch")) {
        new Notice("Finance: batched capture is turned off in settings.");
        return;
      }
      await this.handleCaptureBatch(batch);
      return;
    }

    if (!this.isCaptureMethodEnabled("url")) {
      new Notice("Finance: URL capture is turned off in settings.");
      return;
    }

    try {
      const expense = this.parseCaptureParams(params);
      const result = await this.handleCaptureExpense(expense, { notify: true, method: "url" });
      if (result.skipped) {
        new Notice(this.describeSkippedCapture(result));
      }
    } catch (error) {
      new Notice(`Finance capture failed: ${error.message}`);
    }
  }

  // Drains a queue built up on the phone and flushed in one go, so an Apple Pay
  // automation never has to foreground Obsidian per tap. Each line is the same
  // one-line format the inbox folder uses; a bad line is quarantined rather
  // than costing the rest of the batch.
  async handleCaptureBatch(raw, options = {}) {
    const method = options.method || "batch";
    const { entries, failures } = core.parseCaptureBatch(raw);
    let logged = 0;
    let duplicates = 0;
    const errors = [...failures];

    for (const params of entries) {
      try {
        const expense = this.parseCaptureParams(params);
        const result = await this.handleCaptureExpense(expense, { notify: false, method });
        if (result.skipped) duplicates += 1;
        else logged += 1;
      } catch (error) {
        errors.push({ line: core.buildInboxLine(params) || String(params), reason: error?.message || String(error) });
      }
    }

    for (const failure of errors) {
      await this.quarantineCaptureText(failure.line, failure.reason);
    }

    if (options.notify !== false) {
      const parts = [];
      if (logged) parts.push(`logged ${logged}`);
      if (duplicates) parts.push(`skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
      if (errors.length) parts.push(`${errors.length} need${errors.length === 1 ? "s" : ""} attention`);
      new Notice(`Finance: ${parts.length ? parts.join(", ") : "nothing to log"}.`);
    }
    if (logged) this.refreshDailyBudgetView();
    return { logged, duplicates, failed: errors.length };
  }

  describeSkippedCapture(result) {
    if (result?.reason === "cross-method-duplicate" && result.duplicateOf) {
      const channel = core.describeCaptureChannel(core.captureChannelKey(result.duplicateOf));
      return `Finance: already captured via ${channel} — skipped.`;
    }
    return `Finance: skipped duplicate capture (${result?.expense?.externalId || "already logged"})`;
  }

  // Single write path shared by the URL handler, the inbox drainer, and the
  // quick-add modal. Applies merchant->category guessing, holiday context, and
  // external-id de-duplication, then inserts into the routed daily note.
  async handleCaptureExpense(expenseInput, options = {}) {
    let expense = { ...expenseInput };
    const method = core.normalizeCaptureMethod(options.method || "quick-add");

    if (expense.externalId && this.isExternalIdProcessed(expense.externalId)) {
      return { skipped: true, reason: "duplicate", expense };
    }

    // Cross-method check: has another transport already captured this exact
    // purchase? Only fires across channels, so repeat purchases down the same
    // pipe are still logged (see findDuplicateCapture).
    const handling = this.settings.crossMethodDuplicates || "skip";
    let duplicateOf = null;
    if (handling !== "off" && !options.force) {
      duplicateOf = core.findDuplicateCapture(
        { ...expense, method, source: expense.source },
        this.settings.captureLedger,
        { windowDays: Number(this.settings.duplicateWindowDays) || 0 }
      );
    }
    if (duplicateOf && handling === "skip") {
      await this.recordCapture(expense, method, { skipped: true });
      return { skipped: true, reason: "cross-method-duplicate", duplicateOf, expense };
    }

    // A bill first: a capture on the right day, for the right amount, from a
    // merchant a bill knows, is that bill's payment — more specific than any
    // merchant rule, and it moves the bill's schedule on.
    let matchedBill = null;
    if ((!expense.category || expense.category === "uncategorized") && expense.merchant && options.matchBills !== false) {
      try {
        matchedBill = await this.matchCaptureToBill(expense);
      } catch (error) {
        console.warn("[finance-tracker] bill matching failed", error);
      }
      if (matchedBill) expense.category = core.normalizeCategoryPath(matchedBill.category);
    }

    if ((!expense.category || expense.category === "uncategorized") && expense.merchant) {
      const guessed = await this.guessCategoryForMerchant(expense.merchant);
      if (guessed) expense.category = guessed;
    }

    if (!Array.isArray(expense.owed) || !expense.owed.length) {
      const owed = core.buildOwedSharesFromTokens(expense.amount, expense.splitCount, expense.owedTokens || []);
      if (owed.length) expense.owed = owed;
    }

    let holidayContext = await this.findHolidayContextForDate(expense.date);
    if (!holidayContext?.holidayKey && this.settings.tripModeActive) {
      holidayContext = await this.getActiveTripContext();
    }
    if (holidayContext?.holidayKey) {
      if (this.settings.tripModeActive && holidayContext.tripCurrency && !expense.currencyProvided) {
        expense.currency = holidayContext.tripCurrency;
        expense.currencyProvided = true;
        expense.exchangeRateKey = holidayContext.tripCurrency;
      }
      expense.holidayKey = holidayContext.holidayKey;
      expense = this.applyHolidayCurrencyContext(expense, holidayContext);
      if (Number.isFinite(expense.exchangeRate) && Array.isArray(expense.owed)) {
        expense.owed = expense.owed.map((item) => ({
          ...item,
          amount: core.roundCurrencyAmount(Number(item.amount || 0) * expense.exchangeRate),
        }));
      }
    }

    const notePath = this.getDailyNotePath(expense.date);
    const file =
      this.app.vault.getAbstractFileByPath(notePath) instanceof TFile
        ? this.app.vault.getAbstractFileByPath(notePath)
        : await this.createDailyNoteFromTemplate(notePath, expense.date);

    const currentContent = await this.app.vault.cachedRead(file);
    const nextContent = core.insertTransactionIntoDailyNote(currentContent, expense, this.settings);
    await _ftModify(this.app,file, nextContent);

    if (expense.externalId) {
      await this.markExternalIdProcessed(expense.externalId);
    }
    await this.recordCapture(expense, method);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();

    // "warn" logs the entry anyway and tells you what it collided with, so a
    // genuine second purchase is never silently swallowed.
    if (duplicateOf && handling === "warn") {
      new Notice(
        `Finance: logged, but ${core.formatCurrency(expense.amount, expense.currency)} on ${expense.date} was already captured via ${core.describeCaptureChannel(core.captureChannelKey(duplicateOf))}.`
      );
    }

    const shouldOpen = options.openNote ?? this.settings.openDailyNoteAfterCapture;
    if (shouldOpen) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }

    if (matchedBill) {
      this._lastBillMatch = {
        amount: expense.amount,
        category: core.normalizeCategoryPath(expense.category),
        date: expense.date,
        merchant: expense.merchant || "",
      };
      const message = `Filed under ${matchedBill.label}.`;
      if (typeof createFragment === "function") {
        new Notice(
          createFragment((fragment) => {
            fragment.appendText(`${message} `);
            const undo = fragment.createEl("a", { text: "Undo", href: "#" });
            undo.addEventListener("click", async (event) => {
              event.preventDefault();
              const undone = await this.undoLastBillMatch();
              new Notice(undone ? "Moved back to uncategorised." : "That entry has changed since, so it was left alone.");
            });
          }),
          10000
        );
      } else {
        new Notice(message);
      }
    }

    if (options.notify) {
      new Notice(`Logged ${core.formatCurrency(expense.amount, expense.currency)} to ${expense.date}`);
    }

    return { skipped: false, file, expense, bill: matchedBill };
  }

  // The rolling record of what each transport has captured. It is kept in
  // data.json rather than read back out of the notes because the daily-note
  // bullet deliberately does not carry the capture method — and the method is
  // the whole basis of cross-method duplicate detection. Skipped duplicates are
  // recorded too: they are the evidence the overlap report runs on.
  async recordCapture(expense, method, options = {}) {
    this.settings.captureLedger = core.appendCaptureLedger(
      this.settings.captureLedger,
      {
        date: expense?.date,
        amount: expense?.amount,
        merchant: expense?.merchant || expense?.name || "",
        method,
        source: expense?.source || "",
        at: new Date().toISOString(),
        skipped: Boolean(options.skipped),
      },
      400
    );
    await this.saveSettings();
  }

  captureOverlapReport(days = 60) {
    const since = core.addDays(core.todayIsoLocal(), -Math.abs(Number(days) || 60));
    return core.summarizeCaptureOverlap(this.settings.captureLedger, { since });
  }

  isExternalIdProcessed(id) {
    const key = String(id || "").trim();
    if (!key) return false;
    return Array.isArray(this.settings.processedExternalIds) && this.settings.processedExternalIds.includes(key);
  }

  async markExternalIdProcessed(id) {
    const key = String(id || "").trim();
    if (!key) return;
    if (!Array.isArray(this.settings.processedExternalIds)) this.settings.processedExternalIds = [];
    if (this.settings.processedExternalIds.includes(key)) return;
    this.settings.processedExternalIds.push(key);
    // keep only the most recent 1000 ids so data.json stays small
    if (this.settings.processedExternalIds.length > 1000) {
      this.settings.processedExternalIds = this.settings.processedExternalIds.slice(-1000);
    }
    await this.saveSettings();
  }

  // The merchant map lives in plugin settings (data.json), not a vault file —
  // it's populated automatically by the "remember this merchant" checkbox and
  // edited/removed from Settings → Merchant map, never hand-edited as markdown.
  loadMerchantMap() {
    return new Map(Object.entries(this.settings.merchantMap || {}));
  }

  // Imports the markdown merchant map into settings. This used to run only for
  // installs that predated settings versioning, which meant a file written after
  // that point was never read at all — 30 rules sat in the author's vault being
  // ignored for a month. It now runs whenever the file is present and has not
  // been imported yet.
  //
  // It no longer deletes the note. Removing something the user wrote is not this
  // function's call to make, and the note is a useful record of where the rules
  // came from. Existing settings win, so importing twice can never clobber a
  // category that has since been corrected.
  async migrateMerchantMapFile(options = {}) {
    if (this.settings.merchantMapMigrated && !options.force) return 0;
    const path = normalizePath(this.settings.merchantMapPath || "");
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile)) {
      this.settings.merchantMapMigrated = true;
      await this.saveSettings();
      return 0;
    }

    const content = await this.app.vault.cachedRead(file);
    const imported = {};
    for (const rows of core.parseMarkdownTable(content)) {
      for (const row of rows) {
        const merchant = core.normalizeMerchant(row.merchant || row.payee || row.name || "");
        const category = core.normalizeCategoryPath(row.category || row.cat || "");
        if (merchant && category) imported[merchant] = category;
      }
    }

    const before = Object.keys(this.settings.merchantMap || {}).length;
    this.settings.merchantMap = { ...imported, ...(this.settings.merchantMap || {}) };
    this.settings.merchantMapMigrated = true;
    this._merchantSources = null;
    await this.saveSettings();
    const added = Object.keys(this.settings.merchantMap).length - before;
    if (added > 0 && options.notify !== false) {
      new Notice(
        `Finance: imported ${added} merchant rule${added === 1 ? "" : "s"} from ${file.basename}. They live in settings now, so that note can go whenever you like.`
      );
    }
    return added;
  }

  // Rules and history, plus both re-keyed by merchant root, in the shape
  // core.suggestCategoryForMerchant expects. Built once and held until a note or
  // a rule changes: a batched capture of twenty lines would otherwise rebuild
  // the whole index twenty times.
  async merchantSuggestionSources() {
    if (this._merchantSources) return this._merchantSources;
    const rules = await this.loadMerchantMap();
    const history = this.settings.learnCategoriesFromHistory === false ? new Map() : await this.loadMerchantHistory();
    this._merchantSources = {
      rules,
      history,
      rootRules: core.indexByMerchantRoot(rules),
      rootHistory: core.indexByMerchantRoot(history),
    };
    return this._merchantSources;
  }

  // What should this merchant be filed as, and why. The reason travels with the
  // answer because the inbox shows it: "how you filed it last time" is the
  // difference between a suggestion you can accept and one you have to check.
  async suggestCategoryForMerchant(merchant) {
    if (!core.normalizeMerchant(merchant)) return { category: "", source: "" };
    try {
      return core.suggestCategoryForMerchant(merchant, await this.merchantSuggestionSources());
    } catch (error) {
      // History sits behind a full vault walk, so it has far more ways to throw
      // than a map lookup does — and a throw here reaches the capture path,
      // which would quarantine the transaction. An uncategorised capture that
      // still lands beats one lost because a note somewhere is malformed.
      console.error("[finance-tracker] category suggestion failed", error);
      return { category: "", source: "" };
    }
  }

  async guessCategoryForMerchant(merchant) {
    return (await this.suggestCategoryForMerchant(merchant)).category;
  }

  describeSuggestionSource(source) {
    if (source === "rule" || source === "rule-root") return "from a merchant rule";
    if (source === "history" || source === "history-root") return "how you filed it last time";
    return "";
  }

  // Most recent categorised sighting of each merchant. Built off the same
  // per-file index the dashboards use, and dropped whenever a daily note
  // changes, so a correction takes effect on the very next capture.
  async loadMerchantHistory() {
    if (this._merchantHistory) return this._merchantHistory;
    const history = new Map();
    const recurringPrefix = core.normalizeCategoryPath(this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    for (const entry of await this.collectAllTransactions()) {
      if (entry.entryType === "balance" || entry.isIncome || entry.isGoalContribution) continue;
      // `entry.category` already has any trip prefix split off into holidayKey,
      // so a Japan 7-Eleven teaches "food/groceries", not "26/japanmidyear/…",
      // and the capture path re-applies the trip prefix only if a trip is on.
      const category = core.normalizeCategoryPath(entry.category || "");
      if (!category || category === "uncategorized") continue;
      // A bill category is not something to learn from a merchant name. Whether a
      // charge from Claude is the monthly subscription depends on its amount and
      // date, which bill matching checks; a merchant rule would file a one-off
      // $340 purchase as the $34 bill and invent a payment.
      if (category === recurringPrefix || category.startsWith(`${recurringPrefix}/`)) continue;
      const merchant = String(entry.merchant || "").trim();
      if (!merchant || /^skipped\b/i.test(merchant)) continue;
      const merchantKey = core.normalizeMerchant(merchant);
      if (!merchantKey) continue;
      const date = String(entry.date || "");
      const current = history.get(merchantKey);
      if (!current || date >= current.date) history.set(merchantKey, { category, date, name: merchant });
    }
    this._merchantHistory = history;
    return history;
  }

  // Suggestion data for quick-add autocomplete, derived from what has actually
  // been logged (plus the budget table) instead of a hand-maintained list:
  // categories by usage, merchants with their most recent category, and people
  // from owed child lines.
  async collectKnownSuggestions() {
    const entries = await this.collectAllTransactions();
    const categoryCounts = new Map();
    const merchantInfo = new Map();
    const people = new Map();

    for (const entry of entries) {
      if (entry.entryType === "balance" || entry.isIncome) {
        continue;
      }
      const category = core.normalizeCategoryPath(entry.category || "");
      if (category && category !== "uncategorized") {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      }
      const merchant = String(entry.merchant || "").trim();
      if (merchant && !/^skipped\b/i.test(merchant)) {
        const key = core.normalizeMerchant(merchant);
        const current = merchantInfo.get(key) || { name: merchant, count: 0, category: "", lastDate: "" };
        current.count += 1;
        if (String(entry.date || "") >= current.lastDate) {
          current.lastDate = String(entry.date || "");
          current.name = merchant;
          if (category && category !== "uncategorized") current.category = category;
        }
        merchantInfo.set(key, current);
      }
      for (const owed of entry.owed || []) {
        if (owed.person) people.set(owed.person, owed.displayName || core.titleCaseSegment(owed.person));
      }
    }

    try {
      for (const budget of await this.loadBudgets("default")) {
        const category = core.normalizeCategoryPath(budget.category || "");
        if (category && category !== "all" && !categoryCounts.has(category)) {
          categoryCounts.set(category, 0.5);
        }
      }
    } catch (_error) {
      // budgets note may not exist yet; history alone is fine
    }
    try {
      for (const category of (await this.loadMerchantMap()).values()) {
        if (category && !categoryCounts.has(category)) categoryCounts.set(category, 0.5);
      }
    } catch (_error) {
      // merchant map is optional
    }

    return {
      categories: Array.from(categoryCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([path]) => path),
      merchants: Array.from(merchantInfo.values()).sort((left, right) => right.count - left.count),
      people: Array.from(people.entries()).map(([person, displayName]) => ({ person, displayName })),
    };
  }

  // Compares a statement CSV against logged spending. A row counts as already
  // logged if it matches an entry by exact fingerprint (date+amount+merchant) or,
  // failing that, by date+amount alone (merchant names differ across sources).
  async reconcileBankCsv(content, options = {}) {
    const rows = core.parseBankCsv(content, {
      dateOrder: options.dateOrder || "DMY",
      defaultCurrency: this.settings.defaultCurrency,
    });
    if (!rows.length) {
      return { rows: [], matched: [], missing: [] };
    }

    const sortedDates = rows.map((row) => row.date).sort();
    const logged = await this.collectTransactionsForRange({
      period: "all",
      start: sortedDates[0],
      end: sortedDates[sortedDates.length - 1],
    });

    const byFingerprint = new Map();
    const byDateAmount = new Map();
    for (const entry of logged) {
      if (entry.isIncome || entry.isGoalContribution) continue;
      const fingerprint = core.transactionFingerprint(entry);
      byFingerprint.set(fingerprint, (byFingerprint.get(fingerprint) || 0) + 1);
      const key = `${entry.date}|${Number(entry.amount).toFixed(2)}`;
      byDateAmount.set(key, (byDateAmount.get(key) || 0) + 1);
    }

    const matched = [];
    const missing = [];
    for (const row of rows) {
      const fingerprint = core.transactionFingerprint(row);
      const dateAmountKey = `${row.date}|${Number(row.amount).toFixed(2)}`;
      if ((byFingerprint.get(fingerprint) || 0) > 0) {
        byFingerprint.set(fingerprint, byFingerprint.get(fingerprint) - 1);
        byDateAmount.set(dateAmountKey, Math.max(0, (byDateAmount.get(dateAmountKey) || 0) - 1));
        matched.push(row);
      } else if ((byDateAmount.get(dateAmountKey) || 0) > 0) {
        byDateAmount.set(dateAmountKey, byDateAmount.get(dateAmountKey) - 1);
        matched.push(row);
      } else {
        missing.push(row);
      }
    }
    return { rows, matched, missing };
  }

  // Writes statement rows as capture-inbox files (uncategorized) so the normal
  // drain + triage flow logs and categorizes them.
  async sendRowsToInbox(rows) {
    const folder = normalizePath(this.settings.captureInboxFolder || "");
    if (!folder) throw new Error("No capture inbox folder configured.");
    await this.ensureFolder(folder);
    let count = 0;
    for (const row of rows || []) {
      const line = core.buildInboxLine({
        amount: row.amount,
        category: "",
        merchant: row.merchant,
        date: row.date,
        currency: row.currency,
        source: "csv-reconcile",
        externalId: row.externalId ? `csv:${row.externalId}` : "",
      });
      const stamp = `${String(row.date || core.todayIsoLocal()).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
      await _ftCreate(this.app,normalizePath(`${folder}/reconcile-${stamp}.txt`), `${line}\n`);
      count += 1;
    }
    return count;
  }

  async updateTransactionEntry(entry, patch) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) throw new Error("Could not find the note for this entry.");
    const content = await this.app.vault.cachedRead(file);
    const newExpense = {
      amount: Number.isFinite(patch.amount) ? patch.amount : entry.amount,
      category: patch.category ?? entry.category,
      currency: entry.currency,
      date: entry.date,
      holidayKey: entry.holidayKey,
      merchant: patch.merchant ?? entry.merchant,
      note: patch.note ?? entry.note,
      originalAmount: entry.originalAmount,
      originalCurrency: entry.originalCurrency,
      originalRateKey: entry.originalRateKey,
    };
    const next = core.replaceTransactionBlock(content, entry.rawLine, newExpense, this.settings, { lineIndex: entry.lineIndex });
    if (next == null) throw new Error("Could not locate that entry (the note may have changed).");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  // One place that opens the edit modal, so every caller gets the same options
  // and a test can hold on to the instance.
  openQuickAdd(options = {}) {
    const modal = new QuickAddTransactionModal(this.app, this, options);
    modal.open();
    return modal;
  }

  openEditTransaction(entry, options = {}) {
    const modal = new EditTransactionModal(this.app, this, entry, options);
    modal.open();
    return modal;
  }

  // Moving an entry to another day means moving the bullet: it is removed from
  // one note and inserted into the other, and both running totals are rewritten
  // from what is left. The date on a capture is wrong often enough — a late-night
  // tap landing on tomorrow, a backfill typed into the wrong note — that editing
  // it by hand across two files was the most common reason to give up and leave
  // it wrong.
  async moveTransactionEntry(entry, newDate, patch = {}) {
    const date = core.parseIsoDate(newDate);
    if (!date) throw new Error("That date could not be read.");
    const sourceFile = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(sourceFile instanceof TFile)) throw new Error("Could not find the note this entry is in.");

    const sourceContent = await this.app.vault.cachedRead(sourceFile);
    const without = core.removeTransactionBlock(sourceContent, entry.rawLine, this.settings, { lineIndex: entry.lineIndex });
    if (without == null) throw new Error("Could not locate that entry (the note may have changed).");

    const targetPath = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    const targetFile = existing instanceof TFile ? existing : await this.createDailyNoteFromTemplate(targetPath, date);
    const expense = { ...entry, ...patch, date };

    if (targetFile.path === sourceFile.path) {
      // Same note after all (two date formats can land on one file): insert into
      // the content the entry was just removed from, and write once.
      await _ftModify(this.app, sourceFile, core.insertTransactionIntoDailyNote(without, expense, this.settings));
    } else {
      const targetContent = await this.app.vault.cachedRead(targetFile);
      await _ftModify(this.app, targetFile, core.insertTransactionIntoDailyNote(targetContent, expense, this.settings));
      await _ftModify(this.app, sourceFile, without);
      this.invalidateIndexEntry(targetFile.path);
    }

    this.invalidateIndexEntry(sourceFile.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    this.refreshInboxView();
    return targetFile;
  }

  // Other uncategorised entries from the same shop, so one correction can settle
  // them all without opening the inbox.
  async findSiblingUncategorised(entry) {
    const root = core.merchantRootKey(entry?.merchant || "");
    if (!root) return [];
    const entries = await this.collectAllTransactions();
    return entries.filter(
      (other) =>
        core.isSpendingEntry(other) &&
        (!other.category || other.category === "uncategorized") &&
        !(other.filePath === entry.filePath && other.lineIndex === entry.lineIndex) &&
        core.merchantRootKey(other.merchant || "") === root
    );
  }

  async deleteTransactionEntry(entry) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) throw new Error("Could not find the note for this entry.");
    const content = await this.app.vault.cachedRead(file);
    const next = core.removeTransactionBlock(content, entry.rawLine, this.settings, { lineIndex: entry.lineIndex });
    if (next == null) throw new Error("Could not locate that entry in the note.");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  // Remembers the merchant *root*, not the exact descriptor. The bank sends a
  // different branch, terminal or truncation next time, and the root is what
  // those variants share — so one correction covers the lot. A root too short to
  // match safely as a fragment falls back to the full key.
  async rememberMerchantCategory(merchant, category) {
    const root = core.merchantRootKey(merchant);
    const key = root.length >= 4 ? root : core.normalizeMerchant(merchant);
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!key || !cleanCategory) return;
    if (this.settings.merchantMap?.[key] === cleanCategory) return;
    this.settings.merchantMap = { ...this.settings.merchantMap, [key]: cleanCategory };
    this._merchantSources = null;
    await this.saveSettings();
  }

  async forgetMerchantCategory(merchant) {
    if (!this.settings.merchantMap || !(merchant in this.settings.merchantMap)) return;
    const next = { ...this.settings.merchantMap };
    delete next[merchant];
    this.settings.merchantMap = next;
    this._merchantSources = null;
    await this.saveSettings();
  }

  countPendingCaptures() {
    const folderPath = normalizePath(this.settings.captureInboxFolder || "");
    if (!folderPath) return 0;
    const prefix = `${folderPath}/`;
    return this.app.vault
      .getFiles()
      .filter((file) => file.path.startsWith(prefix) && !file.path.includes("/_failed/"))
      .filter((file) => file.extension === "txt" || file.extension === "md").length;
  }

  // Drains every capture file the Shortcuts dropped into the inbox folder into
  // the correct daily notes, then deletes them. Unparseable files are moved to
  // an `_failed` subfolder with the error noted, never silently dropped.
  async drainCaptureInbox(options = {}) {
    if (!this.isCaptureMethodEnabled("inbox")) return 0;
    const folderPath = normalizePath(this.settings.captureInboxFolder || "");
    if (!folderPath) return 0;
    const prefix = `${folderPath}/`;
    const files = this.app.vault
      .getFiles()
      .filter((file) => file.path.startsWith(prefix) && !file.path.includes("/_failed/"))
      .filter((file) => file.extension === "txt" || file.extension === "md");

    let processed = 0;
    let failed = 0;
    for (const file of files) {
      let raw = "";
      try {
        raw = await this.app.vault.cachedRead(file);
      } catch (_error) {
        continue; // likely an iCloud placeholder not yet downloaded; retry next pass
      }
      if (!String(raw || "").trim()) continue;

      const params = core.parseInboxLine(raw);
      if (!params) {
        await this.quarantineCapture(file, raw, "Could not parse a transaction from this file");
        failed += 1;
        continue;
      }
      try {
        const expense = this.parseCaptureParams(params);
        const result = await this.handleCaptureExpense(expense, { notify: false, method: "inbox" });
        await this.app.vault.delete(file);
        if (!result.skipped) processed += 1;
      } catch (error) {
        await this.quarantineCapture(file, raw, error?.message || String(error));
        failed += 1;
      }
    }

    if (options.notify !== false) {
      if (processed > 0) {
        new Notice(`Finance: logged ${processed} capture${processed === 1 ? "" : "s"} from the inbox`);
      }
      if (failed > 0) {
        new Notice(`Finance: ${failed} capture${failed === 1 ? "" : "s"} need attention in ${folderPath}/_failed`);
      }
    }
    if (processed > 0) this.refreshDailyBudgetView();
    this._scheduleStatusBarUpdate();
    return processed;
  }

  async quarantineCapture(file, raw, reason) {
    try {
      const failedFolder = normalizePath(`${this.settings.captureInboxFolder}/_failed`);
      await this.ensureFolder(failedFolder);
      const target = normalizePath(`${failedFolder}/${file.name}`);
      const body = `<!-- finance-capture error: ${String(reason || "").replace(/--+>/g, "->")} -->\n${raw}`;
      await this.upsertFile(target, body);
      await this.app.vault.delete(file);
    } catch (error) {
      console.warn("[finance-tracker] failed to quarantine capture", error);
    }
  }

  // Same idea as quarantineCapture, but for a line that never had a file of its
  // own — a bad line inside a batch or a gist. Nothing is ever dropped silently.
  async quarantineCaptureText(raw, reason) {
    try {
      const failedFolder = normalizePath(`${this.settings.captureInboxFolder}/_failed`);
      await this.ensureFolder(failedFolder);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = normalizePath(`${failedFolder}/${stamp}-${Math.random().toString(36).slice(2, 6)}.txt`);
      const body = `<!-- finance-capture error: ${String(reason || "").replace(/--+>/g, "->")} -->\n${raw}`;
      await this.upsertFile(target, body);
    } catch (error) {
      console.warn("[finance-tracker] failed to quarantine capture line", error);
    }
  }

  _scheduleInboxDrain() {
    if (!this.settings.autoDrainInbox) return;
    clearTimeout(this._inboxDrainTimer);
    this._inboxDrainTimer = setTimeout(() => {
      this.drainCaptureInbox({ notify: true }).catch((error) =>
        console.warn("[finance-tracker] inbox drain failed", error)
      );
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  // GitHub gist capture
  //
  // The only transport that captures without launching Obsidian *and* works on
  // an Obsidian Sync vault: the phone appends a capture line to a private gist,
  // and the plugin polls it with requestUrl (which works on iOS too, and is not
  // subject to CORS). Drained lines are removed from the gist afterwards.
  // ---------------------------------------------------------------------------

  gistCaptureConfigured() {
    return Boolean(String(this.settings.gistCaptureId || "").trim() && String(this.settings.gistCaptureToken || "").trim());
  }

  async _gistRequest(method, body) {
    const id = String(this.settings.gistCaptureId || "").trim();
    const response = await requestUrl({
      url: `https://api.github.com/gists/${encodeURIComponent(id)}`,
      method,
      headers: {
        Authorization: `Bearer ${String(this.settings.gistCaptureToken || "").trim()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      throw: false,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub rejected the token (check it has the `gist` scope and has not expired).");
    }
    if (response.status === 404) {
      throw new Error("Gist not found — check the gist ID, and that the token can see it.");
    }
    if (response.status >= 400) {
      throw new Error(`GitHub returned ${response.status}.`);
    }
    return response.json;
  }

  // Gists over ~1MB come back truncated, with the full body behind raw_url.
  async _readGistFile(fileEntry) {
    let content = String(fileEntry?.content || "");
    if (fileEntry?.truncated && fileEntry.raw_url) {
      const raw = await requestUrl({ url: fileEntry.raw_url, throw: false });
      if (raw.status < 400) content = String(raw.text || "");
    }
    return content;
  }

  async syncCaptureGist(options = {}) {
    if (!this.isCaptureMethodEnabled("gist")) return 0;
    if (!this.gistCaptureConfigured()) {
      if (options.notify) new Notice("Finance: set a gist ID and token in settings first.");
      return 0;
    }
    if (this._gistSyncing) return 0;
    this._gistSyncing = true;

    try {
      const filename = String(this.settings.gistCaptureFilename || "").trim() || DEFAULT_SETTINGS.gistCaptureFilename;
      const gist = await this._gistRequest("GET");
      const files = gist?.files && typeof gist.files === "object" ? gist.files : {};
      const names = Object.keys(files);
      if (!names.length) {
        if (options.notify) new Notice("Finance: the capture gist is empty.");
        return 0;
      }

      const totals = { logged: 0, duplicates: 0, failed: 0 };
      const patch = {};
      let raced = false;

      for (const name of names) {
        const consumed = await this._readGistFile(files[name]);
        if (!consumed.trim()) continue;

        const result = await this.handleCaptureBatch(consumed, { method: "gist", notify: false });
        totals.logged += result.logged;
        totals.duplicates += result.duplicates;
        totals.failed += result.failed;
        if (result.logged + result.duplicates + result.failed === 0) continue;

        if (name === filename) {
          // The shared queue file is appended to, so it is cleared down to a
          // marker rather than deleted — and only the prefix we actually read
          // is removed, so anything added mid-sync survives to the next poll.
          const after = await this._gistRequest("GET");
          const currentContent = String(after?.files?.[name]?.content ?? consumed);
          const remainder = core.buildGistRemainder(consumed, currentContent);
          if (remainder === null) raced = true;
          else patch[name] = { content: `# drained ${new Date().toISOString()}\n${remainder}` };
        } else {
          // A one-file-per-capture drop from an automation. Nothing appends to
          // it, so there is no race to guard against — just delete it. A gist
          // must keep at least one file, which the queue file above provides.
          patch[name] = null;
        }
      }

      if (raced) {
        new Notice("Finance: the capture gist changed mid-sync and was left as-is — check it for anything logged twice.");
      }
      if (Object.keys(patch).length) {
        // A gist cannot be left with no files at all, which is what would happen
        // to one holding nothing but per-capture drops. Recreate the queue file
        // as the placeholder in that case.
        const deletingEverything = names.every((name) => patch[name] === null);
        if (deletingEverything) {
          patch[filename] = { content: `# drained ${new Date().toISOString()}\n` };
        }
        await this._gistRequest("PATCH", { files: patch });
      }

      this.settings.gistCaptureLastSync = new Date().toISOString();
      await this.saveSettings();

      if (options.notify) {
        const parts = [];
        if (totals.logged) parts.push(`logged ${totals.logged}`);
        if (totals.duplicates) parts.push(`skipped ${totals.duplicates} duplicate${totals.duplicates === 1 ? "" : "s"}`);
        if (totals.failed) parts.push(`${totals.failed} need attention`);
        new Notice(`Finance gist: ${parts.length ? parts.join(", ") : "nothing waiting"}.`);
      }
      if (totals.logged) this.refreshDailyBudgetView();
      return totals.logged;
    } catch (error) {
      if (options.notify) new Notice(`Finance gist sync failed: ${error.message}`);
      console.warn("[finance-tracker] gist sync failed", error);
      return 0;
    } finally {
      this._gistSyncing = false;
    }
  }

  // Polling is re-armed from scratch whenever the settings change, so toggling
  // the method or editing the interval takes effect without a reload.
  scheduleGistSync() {
    if (this._gistPollTimer) {
      window.clearInterval(this._gistPollTimer);
      this._gistPollTimer = null;
    }
    if (!this.isCaptureMethodEnabled("gist") || !this.gistCaptureConfigured()) return;
    const minutes = Math.max(1, Number(this.settings.gistCapturePollMinutes) || 15);
    this._gistPollTimer = window.setInterval(() => {
      this.syncCaptureGist({ notify: false }).catch(() => {});
    }, minutes * 60 * 1000);
    this.registerInterval(this._gistPollTimer);
  }

  refreshDailyBudgetView() {
    const leaves = this.app.workspace.getLeavesOfType(DAILY_BUDGET_VIEW);
    for (const leaf of leaves) {
      if (leaf.view && typeof leaf.view.refresh === "function") {
        leaf.view.refresh();
      }
    }
  }

  _scheduleStatusBarUpdate() {
    clearTimeout(this._statusBarTimer);
    this._statusBarTimer = setTimeout(() => {
      this.updateStatusBar().catch(() => {});
    }, 500);
  }

  async updateStatusBar() {
    if (!this._statusBarItem) return;
    const sumSpend = (entries) =>
      entries.filter((entry) => core.isSpendingEntry(entry)).reduce((total, entry) => total + core.entrySpendAmount(entry), 0);
    const currency = this.settings.defaultCurrency;
    const today = core.todayIsoLocal();
    const todaySpend = sumSpend(await this.collectTransactionsForRange({ period: "day", start: today, end: today }));
    const period = core.normalizeBudgetPeriod(this.settings.budgetCheckPeriod || "week");
    const range = core.toPeriodRange({ period, referenceDate: today, weekStartsOn: this.settings.weekStartsOn });
    const periodSpend = sumSpend(await this.collectTransactionsForRange(range));
    const parts = [
      `Today ${core.formatCurrency(todaySpend, currency)}`,
      `${period[0].toUpperCase()}${period.slice(1)} ${core.formatCurrency(periodSpend, currency)}`,
    ];
    const pending = this.countPendingCaptures();
    if (pending > 0) parts.push(`📥 ${pending}`);
    this._statusBarItem.setText(`💸 ${parts.join("  ·  ")}`);
    this._statusBarItem.setAttribute("aria-label", "Finance Tracker — click to quick add");
  }

  // Resolves quick-add @date tokens: ISO dates, today/yesterday/tomorrow,
  // weekday names (most recent past occurrence), or anything the natural-language
  // dates plugin understands when it is installed.
  resolveDateToken(token) {
    const raw = String(token || "").trim();
    if (!raw) return "";
    const iso = core.parseIsoDate(raw);
    if (iso) return iso;
    const lower = raw.toLowerCase();
    const today = core.todayIsoLocal();
    if (lower === "today") return today;
    if (lower === "yesterday" || lower === "yest") return core.addDays(today, -1);
    if (lower === "tomorrow") return core.addDays(today, 1);

    const nld = this.app.plugins?.plugins?.["nldates-obsidian"];
    if (nld && typeof nld.parseDate === "function") {
      try {
        const result = nld.parseDate(raw);
        if (result && result.date instanceof Date && !Number.isNaN(result.date.getTime())) {
          return core.todayIsoLocal(result.date);
        }
      } catch (_error) {
        // fall through to weekday handling
      }
    }

    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const index = weekdays.findIndex((day) => day.startsWith(lower));
    if (index >= 0) {
      const diff = (new Date().getDay() - index + 7) % 7;
      return core.addDays(today, -diff);
    }
    return "";
  }

  getDailyNoteFiles(range) {
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix))
      .filter((file) => {
        if (!range) return true;
        const pathDate = core.extractNoteDate("", file.path) || this.dailyNoteDateFromFileName(file.name);
        if (!pathDate) return true;
        return core.isDateInRange(pathDate, range);
      });
  }

  // Returns parsed transactions for a daily note, reusing the in-memory index
  // when the file's mtime is unchanged so unedited notes are never re-parsed.
  async getIndexedEntriesForFile(file) {
    if (!this._txnIndex) this._txnIndex = new Map();
    const mtime = file.stat ? file.stat.mtime : 0;
    const cached = this._txnIndex.get(file.path);
    if (cached && cached.mtime === mtime) return cached.entries;
    const content = await this.app.vault.cachedRead(file);
    const entries = core.parseTransactionsFromNoteContent(content, file.path, {
      defaultCurrency: this.settings.defaultCurrency,
      financeHeading: this.settings.spendingHeading,
      spendingHeading: this.settings.spendingHeading,
      noteDate: this.dailyNoteDateFromFileName(file.name),
    });
    this._txnIndex.set(file.path, { mtime, entries });
    return entries;
  }

  invalidateIndexEntry(path) {
    if (this._txnIndex) this._txnIndex.delete(path);
    this._allTransactions = null;
    // Merchant history is derived from the index, so any note that changes can
    // change what the next capture learns.
    this._merchantHistory = null;
    this._merchantSources = null;
  }

  async collectTransactionsForRange(range) {
    const files = this.getDailyNoteFiles(range);
    const entries = [];
    for (const file of files) {
      const parsed = await this.getIndexedEntriesForFile(file);
      for (const entry of parsed) {
        if (core.isDateInRange(entry.date, range)) entries.push(entry);
      }
    }
    return entries.sort((left, right) => {
      if (left.date === right.date) return (left.filePath || "").localeCompare(right.filePath || "");
      return String(left.date || "").localeCompare(String(right.date || ""));
    });
  }

  // Keeps the transaction index fresh on file events and heals stale running
  // totals when a daily note is opened (deliberately not on every keystroke, so
  // it never fights the active editor).
  setupIndexAndTotals() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (_ftSelfWrites.has(file.path)) return;
        const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
        if (file.path.startsWith(prefix)) {
          this.invalidateIndexEntry(file.path);
          this._scheduleStatusBarUpdate();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        // A note arriving from Sync, or from another device, changes the numbers
        // exactly as much as one edited here does.
        if (!file?.path?.startsWith(normalizePath(`${this.settings.dailyNotesFolder}/`))) return;
        this.invalidateIndexEntry(file.path);
        this._scheduleStatusBarUpdate();
      })
    );
    this.registerEvent(this.app.vault.on("delete", (file) => this.invalidateIndexEntry(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.invalidateIndexEntry(oldPath)));
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file || !file.path) return;
        const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
        if (!file.path.startsWith(prefix)) return;
        window.setTimeout(() => this.reconcileDailyNoteTotal(file).catch(() => {}), 300);
      })
    );
  }

  // Recomputes the running total on every daily note in one pass. Individual
  // notes already heal when opened, but that only reaches notes you happen to
  // visit — this is for repairing a whole backlog at once (totals written
  // before 0.7.0 could count digits inside a merchant or note line).
  async repairAllDailyNoteTotals() {
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix));
    if (!files.length) {
      new Notice(`No daily notes found under ${this.settings.dailyNotesFolder}.`);
      return 0;
    }

    const notice = new Notice(`Checking ${files.length} daily notes…`, 0);
    let repaired = 0;
    try {
      for (const file of files) {
        const content = await this.app.vault.cachedRead(file);
        const next = core.recomputeSpendingTotals(content, this.settings);
        if (next === content) continue;
        await _ftModify(this.app, file, next);
        this.invalidateIndexEntry(file.path);
        repaired += 1;
      }
    } finally {
      notice.hide();
    }

    new Notice(
      repaired > 0
        ? `Repaired the total on ${repaired} note${repaired === 1 ? "" : "s"}.`
        : `All ${files.length} daily note totals were already correct.`
    );
    if (repaired > 0) {
      this.refreshDailyBudgetView();
      this._scheduleStatusBarUpdate();
    }
    return repaired;
  }

  async reconcileDailyNoteTotal(target) {
    const file = target instanceof TFile ? target : this.app.vault.getAbstractFileByPath(target?.path || "");
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.cachedRead(file);
    const next = core.recomputeSpendingTotals(content, this.settings);
    if (next !== content) {
      await _ftModify(this.app,file, next);
    }
  }

  // --- Note migrations ---------------------------------------------------------

  // Reads every daily note once and plans the legacy-trip-tag conversion over
  // it. Nothing is written here: the plan is what the preview shows and what
  // apply later consumes.
  async planLegacyTripTagMigration() {
    const payload = [];
    for (const file of this.getDailyNoteFiles()) {
      payload.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const trips = core.summarizeLegacyTripTags(payload);
    const transform = core.buildLegacyTripTagTransform({
      categoryFixes: LEGACY_CATEGORY_FIXES,
      heading: this.settings.spendingHeading || "## Finance",
      homeCurrency: this.settings.defaultCurrency,
      spendingRootTag: this.settings.spendingRootTag,
      tripCurrencies: Object.fromEntries(trips.map((trip) => [trip.key, trip.currency])),
    });
    return { plan: core.planNoteRewrite(payload, transform), trips };
  }

  // Writes an approved plan. A note that has changed since the preview is
  // skipped and reported, never overwritten with stale content.
  async applyNoteRewritePlan(plan) {
    const skipped = [];
    let written = 0;
    for (const change of plan?.files || []) {
      const file = this.app.vault.getAbstractFileByPath(change.path);
      if (change.create) {
        // A note this plan creates: written only if nothing is there yet, so
        // re-applying an old plan can never overwrite a note since edited.
        if (file) {
          skipped.push(change.path);
          continue;
        }
        await this.ensureFolder(change.path.split("/").slice(0, -1).join("/"));
        await this.upsertFile(change.path, change.after);
        written += 1;
        continue;
      }
      if (!(file instanceof TFile)) {
        skipped.push(change.path);
        continue;
      }
      const current = await this.app.vault.cachedRead(file);
      if (current !== change.before) {
        skipped.push(change.path);
        continue;
      }
      await _ftModify(this.app, file, change.after);
      this.invalidateIndexEntry(file.path);
      written += 1;
    }
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    return { written, skipped };
  }

  // A converted trip has entries but no note, so nothing renders them. This is
  // the note a trip would have had: archived from the start, since it is long
  // over, which keeps it out of the active goal lists while its dashboard still
  // works when opened.
  buildArchivedTripNoteContent(trip, title) {
    return [
      "---",
      `goal_name: ${title}`,
      `goal_key: ${core.normalizeCategoryPath(trip.key.split("/")[1] || "trip")}`,
      "target_amount: 0",
      "starting_balance: 0",
      `due_date: ${trip.firstDate || core.todayIsoLocal()}`,
      "active: false",
      `currency: ${core.normalizeCurrency(this.settings.defaultCurrency)}`,
      ...(trip.currency ? [`trip_currency: ${trip.currency}`] : []),
      `trip_tag: ${trip.key}`,
      `start_date: ${trip.firstDate || ""}`,
      `end_date: ${trip.lastDate || ""}`,
      "total_budget: 0",
      `archived: ${core.todayIsoLocal()}`,
      "---",
      "",
      `# ${title}`,
      "",
      `Created by **Convert legacy trip tags** from ${trip.entries} entries logged between ${trip.firstDate} and ${trip.lastDate}.`,
      "Set `total_budget` above if you want the reflection to compare against a budget.",
      "",
      "```holiday-dashboard",
      "```",
      "",
    ].join("\n");
  }

  // Only creates a note for a trip that has none: a second note carrying the
  // same trip_tag would make the dashboards ambiguous.
  async ensureArchivedTripNotes(trips) {
    const created = [];
    for (const trip of trips || []) {
      if (!trip.key) continue;
      const existing = await this.findHolidayBudgetByKey(trip.key);
      if (existing) continue;
      const [year, name] = trip.key.split("/");
      const fullYear = year.length === 2 ? `20${year}` : year;
      const title = `${core.titleCaseSegment(name)} ${fullYear}`;
      await this.ensureFolder(this.settings.budgetArchiveFolderPath);
      const path = normalizePath(`${this.settings.budgetArchiveFolderPath}/${sanitizeFilePart(title)}.md`);
      if (this.app.vault.getAbstractFileByPath(path)) continue;
      await this.ensureTextFile(path, () => this.buildArchivedTripNoteContent(trip, title));
      created.push(path);
    }
    return created;
  }

  async openLegacyTripTagMigration() {
    const { plan, trips } = await this.planLegacyTripTagMigration();
    const intro = trips
      .map((trip) => {
        const dates = trip.firstDate ? `, ${trip.firstDate} to ${trip.lastDate}` : "";
        const currency = trip.currency ? `, mostly ${trip.currency}` : "";
        return `${trip.key} — ${trip.entries} entries across ${trip.files} note${trip.files === 1 ? "" : "s"}${currency}${dates}`;
      })
      .join("; ");
    new RewritePreviewModal(this.app, this, {
      title: "Convert legacy trip tags",
      intro: intro
        ? `${intro}. They become ordinary trip spending, which keeps them out of your home budgets and lets the trip dashboards read them.`
        : "",
      plan,
      emptyText: "No legacy trip tags found, so there is nothing to convert.",
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        const created = written ? await this.ensureArchivedTripNotes(trips) : [];
        new Notice(
          [
            `Converted ${written} note${written === 1 ? "" : "s"}`,
            skipped.length ? `${skipped.length} changed since the preview and were left alone` : "",
            created.length ? `created ${created.map((path) => path.split("/").pop()).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(". ") + "."
        );
      },
    }).open();
  }

  async collectTransactionsForHoliday(holidayKey, range = {}) {
    const normalizedHolidayKey = core.normalizeHolidayKey(holidayKey);
    if (!normalizedHolidayKey) return [];
    const allEntries = await this.collectAllTransactions();
    const start = range.start || "1900-01-01";
    const end = range.end || "2999-12-31";
    return allEntries.filter(
      (entry) => entry.holidayKey === normalizedHolidayKey && core.isDateInRange(entry.date, { start, end })
    );
  }

  async exportEntriesToCsv(entries, label) {
    const exportFolder = await this.promptForExportFolder();
    if (!exportFolder) return null;
    await this.ensureFolder(exportFolder);
    const fileName = `${sanitizeFilePart(label)}.csv`;
    const outputPath = normalizePath(`${exportFolder}/${fileName}`);
    const csv = core.buildCsv(entries);
    const file = await this.upsertFile(outputPath, csv);
    new Notice(`Exported ${entries.length} transactions to ${file.path}`);
    return file;
  }

  async promptForExportFolder() {
    return new Promise((resolve) => {
      new ExportFolderModal(this.app, this, "Utility/Exports", async (folder) => {
        resolve(folder);
      }).open();
    });
  }

  getDefaultBudgetNotePath() {
    return normalizePath(`${this.settings.budgetsFolderPath}/${this.settings.defaultBudgetNoteName}`);
  }

  getActiveBudgetNotePath() {
    if (this.settings.activeHolidayBudgetPath) {
      return normalizePath(this.settings.activeHolidayBudgetPath);
    }
    return this.getDefaultBudgetNotePath();
  }

  async ensureBudgetInfrastructure() {
    await this.ensureFolder(this.settings.budgetsFolderPath);
    await this.ensureFolder(this.settings.budgetArchiveFolderPath);
  }

  async ensureBudgetNote() {
    await this.ensureBudgetInfrastructure();
    return this.ensureTextFile(this.getDefaultBudgetNotePath(), () => this.buildBudgetNoteContent());
  }

  async openDefaultBudgetNote() {
    const file = await this.ensureBudgetNote();
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  async openBudgetNote() {
    const file = await this.ensureBudgetNote();
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  async ensureActiveBudgetNote() {
    await this.ensureBudgetInfrastructure();
    const activePath = this.getActiveBudgetNotePath();
    if (activePath === this.getDefaultBudgetNotePath()) {
      return this.ensureBudgetNote();
    }
    return this.ensureTextFile(activePath, () =>
      this.buildHolidayBudgetNoteContent(this.getHolidayBudgetNameFromPath(activePath), guessHolidayTagFromName(this.getHolidayBudgetNameFromPath(activePath)))
    );
  }

  parseHolidayBudgetContent(content, filePath = "") {
    const frontmatter = parseFrontmatter(content);
    // Unified goal schema (target_amount / due_date / trip_tag) with
    // backward-compatible parsing of the legacy holiday_tag / goal_key keys.
    const goal = core.parseGoalDefinition(frontmatter, {
      defaultCurrency: this.settings.defaultCurrency,
      fallbackName: this.getHolidayBudgetNameFromPath(filePath),
    });
    const inferredHolidayKey = frontmatter.holiday_name
      ? guessHolidayTagFromName(frontmatter.holiday_name)
      : "";
    const holidayKey = goal?.tripTag || core.normalizeHolidayKey(frontmatter.holiday || frontmatter.tag || inferredHolidayKey);
    const tables = core.parseMarkdownTable(content);
    const plannedExpenses = [];
    const allocatedExpenses = [];

    for (const rows of tables) {
      for (const row of rows) {
        const item = String(row.item || row.name || row.expense || "").trim();
        const category = core.normalizeCategoryPath(row.category || row.group || "");
        const startDate = core.parseIsoDate(row.start || row.start_date || row["start date"] || "");
        const endDate = core.parseIsoDate(row.end || row.end_date || row["end date"] || "");
        const link = String(row.link || row.note || row.location || "").trim();
        const allocated = core.parseNumber(row.allocated || row.allocation || row["allocated amount"]);
        const planned = core.parseNumber(row.planned || row.estimate || row.estimated);
        const booked = core.parseNumber(row.booked || row.committed || row.deposit);
        const hasAllocatedColumns = "allocated" in row || "allocation" in row;
        const hasPlannedColumns = "planned" in row || "estimate" in row || "estimated" in row || "booked" in row;
        if (hasAllocatedColumns) {
          if (!item && !category && !Number.isFinite(allocated)) continue;
          allocatedExpenses.push({
            item: item || core.displayCategoryPath(category || "uncategorized"),
            category: category || "uncategorized",
            allocated: Number.isFinite(allocated) ? Number(allocated.toFixed(2)) : 0,
            endDate,
            link,
            startDate,
          });
          continue;
        }
        if (!hasPlannedColumns) continue;
        if (!item && !category && !Number.isFinite(planned) && !Number.isFinite(booked)) continue;
        plannedExpenses.push({
          item: item || core.displayCategoryPath(category || "uncategorized"),
          category: category || "uncategorized",
          booked: Number.isFinite(booked) ? Number(booked.toFixed(2)) : 0,
          endDate,
          fullyPaid: /\b(?:true|yes|x|\[x\])\b/i.test(String(row.fully_paid || row["fully paid"] || "")),
          link,
          planned: Number.isFinite(planned) ? Number(planned.toFixed(2)) : 0,
          startDate,
        });
      }
    }

    const plannedTotals = plannedExpenses.reduce(
      (summary, item) => {
        summary.planned += Number(item.planned || 0);
        summary.booked += Number(item.booked || 0);
        return summary;
      },
      { booked: 0, planned: 0 }
    );
    const allocatedTotals = allocatedExpenses.reduce(
      (summary, item) => {
        summary.allocated += Number(item.allocated || 0);
        return summary;
      },
      { allocated: 0 }
    );

    return {
      activeSavingsGoal: Boolean(goal?.active),
      archivedDate: goal?.archivedDate || "",
      allocatedExpenses,
      currency: goal?.currency || core.normalizeCurrency(frontmatter.currency || this.settings.defaultCurrency),
      carryMissedSavings: Boolean(goal?.carryMissedSavings),
      endDate: goal?.endDate || core.parseIsoDate(frontmatter.end_date || frontmatter.end || frontmatter.return_date || ""),
      exchangeRates: {
        flat: parseFlatExchangeRates(frontmatter.exchange_rates || frontmatter.rates || "", this.settings.defaultCurrency),
        periods: parseExchangeRatePeriods(frontmatter.exchange_rate_periods || frontmatter.rate_periods || "", this.settings.defaultCurrency),
      },
      filePath,
      holidayKey,
      holidayName: String(goal?.goalName || toTitleFromHolidayKey(holidayKey || guessHolidayTagFromName(this.getHolidayBudgetNameFromPath(filePath)))).trim(),
      plannedExpenses,
      savingsDisplayMode: goal?.savingsDisplayMode || "dual-phase",
      savingsProgressMode: goal?.savingsProgressMode || "account-plus-paid-planned",
      savingsDueDate: goal?.dueDate || core.parseIsoDate(frontmatter.start_date || ""),
      savingsGoalAmount: goal?.targetAmount || 0,
      savingsGoalKey: goal?.goalKey || core.normalizeCategoryPath(holidayKey.split("/")[1] || ""),
      savingsStartingBalance: goal?.startingBalance || 0,
      startDate: goal?.startDate || core.parseIsoDate(frontmatter.start_date || frontmatter.start || frontmatter.departure_date || ""),
      totalBudget: goal?.totalBudget || core.parseNumber(frontmatter.total_budget || frontmatter.budget || frontmatter.total || ""),
      tripCurrency: goal?.tripCurrency || "",
      totals: {
        allocated: Number(allocatedTotals.allocated.toFixed(2)),
        booked: Number(plannedTotals.booked.toFixed(2)),
        planned: Number(plannedTotals.planned.toFixed(2)),
      },
    };
  }

  parseSavingsGoalContent(content, filePath = "") {
    const frontmatter = parseFrontmatter(content);
    const goal = core.parseGoalDefinition(frontmatter, {
      defaultCurrency: this.settings.defaultCurrency,
      fallbackName: String(filePath || "").split("/").pop()?.replace(/\.md$/i, "") || "Savings goal",
    });
    if (!goal) return null;
    // Spread rather than enumerate. This used to list each field by hand, which
    // silently dropped whatever parseGoalDefinition learned to return next — the
    // reason runway goals were parsed correctly by core and then never activated.
    return {
      ...goal,
      activeSavingsGoal: goal.active,
      archivedDate: goal.archivedDate || "",
      filePath,
      goalKey: goal.goalKey || buildGoalKeyFromName(goal.goalName || filePath),
    };
  }

  async readHolidayBudgetFile(file) {
    if (!(file instanceof TFile)) return null;
    const content = await this.app.vault.cachedRead(file);
    return this.parseHolidayBudgetContent(content, file.path);
  }

  async findHolidayBudgetByKey(holidayKey) {
    const normalizedHolidayKey = core.normalizeHolidayKey(holidayKey);
    if (!normalizedHolidayKey) return null;

    const candidates = [];
    const active = this.app.vault.getAbstractFileByPath(this.settings.activeHolidayBudgetPath || "");
    if (active instanceof TFile) {
      candidates.push(active);
    }
    candidates.push(...this.getHolidayBudgetFiles());

    for (const file of candidates) {
      const parsed = await this.readHolidayBudgetFile(file);
      if (parsed?.holidayKey === normalizedHolidayKey) {
        return { file, meta: parsed };
      }
    }
    return null;
  }

  async getActiveHolidayContext() {
    const active = this.app.vault.getAbstractFileByPath(this.settings.activeHolidayBudgetPath || "");
    if (!(active instanceof TFile)) return null;
    return this.readHolidayBudgetFile(active);
  }

  async getActiveTripContext() {
    const path = this.settings.activeTripGoalPath || this.settings.activeHolidayBudgetPath || "";
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const meta = await this.readHolidayBudgetFile(file);
    return meta?.holidayKey ? meta : null;
  }

  // Trip mode: while active, quick-add and URL captures default to the trip
  // tag and trip currency, and the sidebar shows the trip cards.
  async startTrip() {
    await new Promise((resolve) => {
      new HolidayBudgetModal(this.app, this, async (file) => {
        if (file instanceof TFile) {
          const meta = await this.readHolidayBudgetFile(file);
          if (!meta?.holidayKey) {
            new Notice("That note has no trip tag. Add trip_tag to its frontmatter first.");
          } else {
            this.settings.activeTripGoalPath = file.path;
            this.settings.tripModeActive = true;
            await this.saveSettings();
            new Notice(`Trip mode on: ${meta.holidayName || meta.holidayKey}`);
            this.refreshDailyBudgetView();
          }
        }
        resolve();
      }).open();
    });
  }

  async endTrip() {
    if (!this.settings.tripModeActive) {
      new Notice("Trip mode is not active.");
      return;
    }
    this.settings.tripModeActive = false;
    this.settings.activeTripGoalPath = "";
    await this.saveSettings();
    new Notice("Trip mode off. Captures use your home defaults again.");
    this.refreshDailyBudgetView();
  }

  async findHolidayContextForDate(date) {
    const normalizedDate = core.parseIsoDate(date);
    if (!normalizedDate) return null;

    const candidates = [];
    const active = this.app.vault.getAbstractFileByPath(this.settings.activeHolidayBudgetPath || "");
    if (active instanceof TFile) {
      candidates.push(active);
    }
    for (const file of this.getHolidayBudgetFiles()) {
      if (!candidates.some((candidate) => candidate.path === file.path)) {
        candidates.push(file);
      }
    }

    for (const file of candidates) {
      const meta = await this.readHolidayBudgetFile(file);
      if (!meta?.holidayKey || !meta.startDate || !meta.endDate || meta.archivedDate) continue;
      if (normalizedDate >= meta.startDate && normalizedDate <= meta.endDate) {
        return meta;
      }
    }
    return null;
  }

  getExchangeRateForDate(exchangeConfig, fromCurrency, date, explicitRateKey = "") {
    const normalizedCurrency = core.normalizeCurrency(fromCurrency, "");
    const normalizedRateKey = explicitRateKey || normalizeExchangeRateKey(fromCurrency, "");
    const normalizedDate = core.parseIsoDate(date);
    if (!normalizedCurrency && !normalizedRateKey) return null;

    for (const period of exchangeConfig?.periods || []) {
      if (!period.start || !period.end || !normalizedDate) continue;
      if (normalizedDate >= period.start && normalizedDate <= period.end) {
        const specificRate = Number(period.rates?.[normalizedRateKey]);
        if (Number.isFinite(specificRate) && specificRate > 0) {
          return specificRate;
        }
        const rate = Number(period.rates?.[normalizedCurrency]);
        if (Number.isFinite(rate) && rate > 0) {
          return rate;
        }
      }
    }

    const specificFlatRate = Number(exchangeConfig?.flat?.[normalizedRateKey]);
    if (Number.isFinite(specificFlatRate) && specificFlatRate > 0) return specificFlatRate;
    const flatRate = Number(exchangeConfig?.flat?.[normalizedCurrency]);
    return Number.isFinite(flatRate) && flatRate > 0 ? flatRate : null;
  }

  applyHolidayCurrencyContext(expense, holidayContext) {
    const displayCurrency = core.normalizeCurrency(holidayContext?.currency || this.settings.defaultCurrency);
    const inputCurrency = core.normalizeCurrency(expense.currency || displayCurrency, displayCurrency);
    const inputRateKey = String(expense.exchangeRateKey || inputCurrency);
    const date = core.parseIsoDate(expense.date) || core.todayIsoLocal();
    const amount = Number(expense.amount || 0);

    if (!Number.isFinite(amount)) {
      return expense;
    }

    // An entry that already carries both amounts was converted by hand — keep
    // it exactly as typed rather than blanking the original or re-converting.
    if (expense.fxProvided) {
      return { ...expense, amount, currency: displayCurrency };
    }

    if (!expense.currencyProvided || inputCurrency === displayCurrency) {
      return {
        ...expense,
        amount,
        currency: displayCurrency,
        originalAmount: null,
        originalCurrency: "",
      };
    }

    const rate = this.getExchangeRateForDate(holidayContext?.exchangeRates, inputCurrency, date, inputRateKey);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`No exchange rate is configured for ${inputCurrency} on ${date}.`);
    }

    return {
      ...expense,
      amount: Number((amount * rate).toFixed(2)),
      convertedFromAmount: amount,
      convertedFromCurrency: inputCurrency,
      currency: displayCurrency,
      exchangeRate: rate,
      originalAmount: amount,
      originalCurrency: inputCurrency,
      originalRateKey: inputRateKey,
    };
  }

  buildBudgetNoteContent(title = "Finance Budgets") {
    return [
      `# ${title}`,
      "",
      "Use the `Category` column for the category paths you want the dashboard and budgets to track.",
      "",
      "| Name | Category | Limit | Period | Currency |",
      "| --- | --- | ---: | --- | --- |",
      "| Groceries | food/groceries | 120 | week | AUD |",
      "| Restaurants | food/restaurants | 80 | week | AUD |",
      "| Transport | transport | 60 | week | AUD |",
      "| Subscriptions | subscription | 40 | month | AUD |",
      "| All Spending | all | 450 | week | AUD |",
      "",
      "## Notes",
      "",
      "- `Period` can be `day`, `week`, `fortnight`, `month`, `bimonth`, `quarter`, or `year`.",
      "- `Category` can be a top-level group like `food` or a more specific path like `food/restaurants`.",
      "- Use `all` if you want an overall budget progress bar.",
      "",
    ].join("\n");
  }

  buildHolidayBudgetNoteContent(title, holidayKey, options = {}) {
    const normalizedHolidayKey = core.normalizeHolidayKey(holidayKey) || guessHolidayTagFromName(title);
    const holidayTitle = stripBudgetSuffix(title || toTitleFromHolidayKey(normalizedHolidayKey)) || toTitleFromHolidayKey(normalizedHolidayKey);
    const startDate = core.parseIsoDate(options.startDate) || core.todayIsoLocal();
    const parsedEndDate = core.parseIsoDate(options.endDate) || startDate;
    const endDate = parsedEndDate < startDate ? startDate : parsedEndDate;
    const currency = core.normalizeCurrency(options.currency || this.settings.defaultCurrency);
    return [
      "---",
      `goal_name: ${holidayTitle}`,
      `goal_key: ${normalizedHolidayKey.split("/")[1] || "holiday"}`,
      "target_amount: 0",
      "starting_balance: 0",
      `due_date: ${startDate}`,
      "active: false",
      "carry_missed_savings: false",
      "savings_display_mode: dual-phase",
      "savings_progress_mode: account-plus-paid-planned",
      `currency: ${currency}`,
      `trip_tag: ${normalizedHolidayKey}`,
      "trip_currency: ",
      `start_date: ${startDate}`,
      `end_date: ${endDate}`,
      "total_budget: 0",
      "exchange_rates: JPY=0.0095, JPY CASH=0.0098",
      "exchange_rate_periods: ",
      "---",
      "",
      `# ${appendBudgetSuffix(holidayTitle)}`,
      "",
      "Set your whole-trip budget in the frontmatter above, then use the tables below to plan expected costs before you travel.",
      "Use `exchange_rates` for one flat rate across the whole trip, or `exchange_rate_periods` for date-specific overrides.",
      "",
      "## Daily trip dashboard",
      "",
      "```holiday-dashboard",
      `holiday: ${normalizedHolidayKey}`,
      "```",
      "",
      "```savings-dashboard",
      "```",
      "",
      "## Planned expenses",
      "",
      "`Booked` means reserved or committed. If Booked is above 0 it overrides Planned for your remaining trip budget.",
      "",
      "| Item | Category | Planned | Booked | Start | End | Link |",
      "| --- | --- | ---: | ---: | --- | --- | --- |",
      ...DEFAULT_HOLIDAY_PLANNED_EXPENSES.map((item) => `| ${item.item} | ${item.category} | 0 | 0 | ${startDate} | ${startDate} |  |`),
      "",
      "## Allocated expenses",
      "",
      "Use this table for predicted in-trip spending like transport, shopping, and food. If Start and End are blank the row spans the whole trip.",
      "",
      "| Item | Category | Allocated | Start | End | Link |",
      "| --- | --- | ---: | --- | --- | --- |",
      ...DEFAULT_HOLIDAY_ALLOCATED_EXPENSES.map((item) => `| ${item.item} | ${item.category} | 0 |  |  |  |`),
      "",
      "## Planned expenses Log",
      "",
      "- Log planned payments in daily notes with tags like `#log/spending/${normalizedHolidayKey}/planned/flights`.",
      "- When the total logged against a category matches its `Booked` amount, the dashboard marks it fully paid.",
      "",
    ].join("\n");
  }

  buildSavingsGoalNoteContent(title, options = {}) {
    const goalName = String(title || "Savings goal").trim() || "Savings goal";
    const goalKey = core.normalizeCategoryPath(options.goalKey || buildGoalKeyFromName(goalName));
    const dueDate = core.parseIsoDate(options.dueDate || "") || core.todayIsoLocal();
    const currency = core.normalizeCurrency(options.currency || this.settings.defaultCurrency);
    return [
      "---",
      `goal_name: ${goalName}`,
      `goal_key: ${goalKey}`,
      "target_amount: 0",
      "starting_balance: 0",
      `due_date: ${dueDate}`,
      "active: false",
      "carry_missed_savings: false",
      `currency: ${currency}`,
      "---",
      "",
      `# ${goalName}`,
      "",
      "```savings-dashboard",
      "```",
      "",
    ].join("\n");
  }

  async loadBudgets(mode = "active") {
    const file = mode === "default" ? await this.ensureBudgetNote() : await this.ensureActiveBudgetNote();
    const content = await this.app.vault.cachedRead(file);
    return core.parseBudgets(content, this.settings.defaultCurrency);
  }

  getHolidayBudgetNameFromPath(path) {
    return stripBudgetSuffix(String(path || "").split("/").pop()?.replace(/\.md$/i, "")) || "Trip";
  }

  getHolidayBudgetFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    const archivePrefix = normalizePath(`${this.settings.budgetArchiveFolderPath}/`);
    const defaultBudgetPath = this.getDefaultBudgetNotePath();
    const recurringNotePath = this.getRecurringNotePath();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(archivePrefix))
      .filter((file) => file.path !== defaultBudgetPath)
      .filter((file) => file.path !== recurringNotePath);
  }

  getSavingsGoalFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    const archivePrefix = normalizePath(`${this.settings.budgetArchiveFolderPath}/`);
    const defaultBudgetPath = this.getDefaultBudgetNotePath();
    const recurringNotePath = this.getRecurringNotePath();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(archivePrefix))
      .filter((file) => file.path !== defaultBudgetPath)
      .filter((file) => file.path !== recurringNotePath)
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
  }

  async createOrOpenHolidayBudget(definition) {
    const holidayName = String(definition?.name || definition || "").trim();
    if (!holidayName) return null;
    await this.ensureBudgetInfrastructure();
    const safeName =
      holidayName
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Trip";
    const holidayKey = core.normalizeHolidayKey(definition?.holidayKey || "") || guessHolidayTagFromName(holidayName);
    const fileName = appendBudgetSuffix(safeName);
    const budgetPath = normalizePath(`${this.settings.budgetsFolderPath}/${fileName}.md`);
    const file = await this.ensureTextFile(budgetPath, () =>
      this.buildHolidayBudgetNoteContent(`${safeName}`, holidayKey, {
        currency: definition?.currency || this.settings.defaultCurrency,
        endDate: definition?.endDate,
        startDate: definition?.startDate,
      })
    );
    this.settings.activeHolidayBudgetPath = file.path;
    await this.saveSettings();
    return file;
  }

  async createOrOpenSavingsGoal(definition) {
    const goalName = String(definition?.name || definition || "").trim();
    if (!goalName) return null;
    await this.ensureBudgetInfrastructure();
    const safeName =
      goalName
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Savings goal";
    const fileName = safeName;
    const budgetPath = normalizePath(`${this.settings.budgetsFolderPath}/${fileName}.md`);
    return this.ensureTextFile(budgetPath, () =>
      this.buildSavingsGoalNoteContent(safeName, {
        currency: definition?.currency || this.settings.defaultCurrency,
        dueDate: definition?.dueDate,
        goalKey: definition?.goalKey || buildGoalKeyFromName(safeName),
      })
    );
  }

  async archiveActiveHolidayBudget() {
    const activeFile = this.app.vault.getAbstractFileByPath(this.settings.activeHolidayBudgetPath || "");
    if (!(activeFile instanceof TFile)) {
      this.settings.activeHolidayBudgetPath = "";
      await this.saveSettings();
      new Notice("No active trip budget to archive.");
      return;
    }
    const archivePath = await this.archiveGoalNote(activeFile);
    new Notice(`Archived trip budget to ${archivePath}`);
  }

  // Archives one goal note: writes a frozen archive summary (savings steps and
  // how the money was spent, including after the end date) into the note, marks
  // it archived in frontmatter, then moves it to the archive folder. The note
  // keeps its full history but leaves the active set.
  async archiveGoalNote(file) {
    const originalPath = file.path;
    const meta = await this.readHolidayBudgetFile(file);
    const today = core.todayIsoLocal();
    let content = await this.app.vault.cachedRead(file);
    content = updateFrontmatterValue(content, "active", "false");
    content = updateFrontmatterValue(content, "archived", today);
    if (!/^## Archive summary/m.test(content)) {
      const entries = await this.collectAllTransactions();
      const summary = core.buildGoalArchiveSummaryLines(
        {
          currency: meta.currency,
          endDate: meta.endDate,
          goalKey: meta.savingsGoalKey,
          startingBalance: meta.savingsStartingBalance,
          targetAmount: meta.savingsGoalAmount,
          totalBudget: meta.totalBudget,
          tripTag: meta.holidayKey,
        },
        entries,
        today
      );
      content = `${content.replace(/\n+$/, "\n")}\n${summary.join("\n")}\n`;
    }
    await _ftModify(this.app, file, content);

    await this.ensureBudgetInfrastructure();
    let archivePath = normalizePath(`${this.settings.budgetArchiveFolderPath}/${file.name}`);
    if (this.app.vault.getAbstractFileByPath(archivePath)) {
      archivePath = normalizePath(`${this.settings.budgetArchiveFolderPath}/${file.basename}-${today.replace(/-/g, "")}.md`);
    }
    await this.app.vault.rename(file, archivePath);

    if (normalizePath(this.settings.activeHolidayBudgetPath || "") === originalPath) {
      this.settings.activeHolidayBudgetPath = "";
    }
    if (normalizePath(this.settings.activeTripGoalPath || "") === originalPath) {
      this.settings.activeTripGoalPath = "";
      this.settings.tripModeActive = false;
    }
    await this.saveSettings();
    return archivePath;
  }

  // Archives every holiday budget whose trip has ended, so finished trips stop
  // cluttering the active set while multiple upcoming holidays stay selectable.
  async archiveFinishedHolidays(options = {}) {
    const today = core.todayIsoLocal();
    const files = this.getHolidayBudgetFiles();
    const archivedNames = [];
    for (const file of files) {
      const meta = await this.readHolidayBudgetFile(file);
      if (!meta?.holidayKey || !meta.endDate || meta.archivedDate) continue;
      if (meta.endDate >= today) continue;
      await this.archiveGoalNote(file);
      archivedNames.push(meta.holidayName || file.basename);
    }
    if (options.notify !== false) {
      new Notice(
        archivedNames.length
          ? `Archived ${archivedNames.length} finished holiday${archivedNames.length === 1 ? "" : "s"}: ${archivedNames.join(", ")}`
          : "No finished trips to archive."
      );
    }
    if (archivedNames.length) this.refreshDailyBudgetView();
    return archivedNames.length;
  }

  // Archives every plain savings goal whose target has been reached, mirroring
  // Archive finished holidays. The frozen archive summary keeps the savings
  // steps and withdrawals; the note leaves the active set.
  async archiveCompletedGoals(options = {}) {
    const today = core.todayIsoLocal();
    const goals = await this.collectSavingsGoalDefinitions();
    const archivedNames = [];
    for (const goal of goals) {
      if (goal.goalType === "holiday" || !(goal.targetAmount > 0)) continue;
      const summary = await this.buildSavingsGoalSummary(goal, today);
      if (summary.currentSaved < goal.targetAmount) continue;
      if (goal.file instanceof TFile) {
        await this.archiveGoalNote(goal.file);
        archivedNames.push(goal.goalName);
      }
    }
    if (options.notify !== false) {
      new Notice(
        archivedNames.length
          ? `Archived ${archivedNames.length} completed goal${archivedNames.length === 1 ? "" : "s"}: ${archivedNames.join(", ")}`
          : "No savings goals have reached their target yet."
      );
    }
    if (archivedNames.length) this.refreshDailyBudgetView();
    return archivedNames.length;
  }

  // Logs a $0 entry dated on the due day: the cadence anchor advances, the
  // inferred amount is untouched, and the skip is visible in the daily note.
  async logRecurringSkip(item) {
    if (item?.billId) {
      // On the bill, not in a daily note: a skipped cycle is a fact about the
      // bill, and $0 of spending is not spending.
      const bill = await this.findBill(item.billId);
      const skipped = Array.from(new Set([...(bill?.skipped || []), item.nextDue || core.todayIsoLocal()])).sort();
      await this.updateBill(item.billId, { skipped });
      return null;
    }

    // The tag must name the bill. A bare `#log/spending/subscriptions/monthly`
    // skip line names no item, so the next parse can only fall back to the
    // line's own note text and invent a bill out of the marker.
    const tag = this.recurringPaymentTag(item);
    return this.appendFinanceLines(item.nextDue || core.todayIsoLocal(), [
      `\t- ${core.formatCurrency(0, item.currency || this.settings.defaultCurrency)} ${tag}`,
      "\t\t- Skipped this cycle",
    ]);
  }

  // Logs a contribution bullet (`- $X #log/income/<goalKey>`) into a daily note.
  async logGoalContribution(goalKey, goalName, amount, date, note = "") {
    const lines = [`- ${core.formatCurrency(amount, this.settings.defaultCurrency)} #log/income/${core.normalizeCategoryPath(goalKey)}`];
    lines.push(`\t- ${String(note || "").replace(/\s+/g, " ").trim() || `Contribution to ${goalName || goalKey}`}`);
    const file = await this.appendFinanceLines(date || core.todayIsoLocal(), lines);
    this.refreshDailyBudgetView();
    return file;
  }

  // --- Runway ---------------------------------------------------------------
  // "Keep N of outgoings in the bank at all times." It is an ordinary goal note
  // — contributions and withdrawals use the same tag grammar as every other
  // goal — except its target is recomputed from the recurring schedule instead
  // of being a number you typed. That is the only thing that makes it special,
  // so everything else (the goals block, archiving, the settings list) gets it
  // for free.

  // Runway: what you need available to be safe for the chosen period. Pure
  // computation from the bills you have already logged, so there is nothing to
  // set up and nothing to keep in sync.
  async computeRunwayState(referenceDate, options = {}) {
    const entries = options.entries || (await this.collectAllTransactions());
    const recurring = options.recurring || (await this.detectRecurring(referenceDate));
    const mode = core.normalizeRunwayMode(this.settings.runwayMode);
    const recurringPrefix = this.settings.recurringTagPrefix || "subscriptions";
    const forecast = mode === "spending"
      ? core.computeForecastInputs(entries, recurring, {
          referenceDate,
          goalKeys: (await this.collectSavingsGoalDefinitions()).map((item) => item.goalKey),
          recurringPrefix,
        })
      : null;
    return core.computeRunway(recurring, {
      referenceDate,
      period: this.settings.runwayPeriod,
      mode,
      monthlyDiscretionary: forecast?.monthlyDiscretionary || 0,
    });
  }

  buildRecurringNoteContent() {
    const prefix = this.settings.recurringTagPrefix || "subscriptions";
    return [
      "# 🔁 Recurring payments",
      "",
      "Manage subscriptions and regular bills here. A payment becomes recurring the",
      `first time you log it with a cadence tag like \`#log/spending/${prefix}/monthly/spotify\``,
      "(cadences: `weekly`, `fortnightly`, `monthly`, `quarterly`, `yearly`).",
      "",
      "- **Log now** logs the bill dated today, whenever you actually click it — the due-date",
      "  schedule stays anchored to its cadence regardless, even if you log it a few days late.",
      "- **Skip cycle** logs a $0 entry on the due day — the schedule moves on, the amount is remembered.",
      "- A price change is just the next logged amount; the plugin always uses the latest —",
      "  or use **Edit** in manage mode to schedule a future change with an exact date, or",
      "  correct the next due date directly.",
      "- **Push a week** moves just the next due date, leaving the cadence alone —",
      "  for the month the rent lands late, not a permanent change.",
      "- Pausing a bill moves it into the **Archived** section below, collapsed until you open it;",
      "  from there you can **Resume** it or **Remove completely** so it's never tracked again.",
      "- A bill that stops on its own — a fixed-term contract, an instalment plan —",
      "  gets an **End Date** or **Payments Left** in the registry and retires itself.",
      "- **Runway** below is the savings side: how much of your outgoings you want covered",
      "  at all times. Logging a bill draws it down automatically; top it up with Contribute.",
      "",
      "```finance-recurring",
      "manage: true",
      "```",
      "",
      "## Registry",
      "",
      ...RECURRING_REGISTRY_HELP,
      "",
      core.RECURRING_REGISTRY_HEADER_ROW,
      core.RECURRING_REGISTRY_SEPARATOR_ROW,
      "",
    ].join("\n");
  }

  async openRecurringNote() {
    await this.ensureBudgetInfrastructure();
    const file = await this.ensureTextFile(this.getRecurringNotePath(), () => this.buildRecurringNoteContent());
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  buildDashboardNoteContent() {
    return [
      "# 📊 Finance dashboard",
      "",
      "Every section below is an ordinary fenced code block — move it, delete it,",
      "or copy it into any other note. Best viewed in reading mode.",
      "",
      "## This week",
      "",
      "```finance-dashboard",
      "period: week",
      "```",
      "",
      "## This month",
      "",
      "```finance-dashboard",
      "period: month",
      "groupBy: full",
      "```",
      "",
      "## Net worth",
      "",
      "Run the **Snapshot balances** command to log account balances; the trend appears here.",
      "",
      "```networth-dashboard",
      "```",
      "",
      "## Forecast",
      "",
      "```finance-forecast",
      "months: 6",
      "```",
      "",
      "## Ask a question",
      "",
      "```finance-query",
      "period: month",
      "group: category",
      "view: categories",
      "```",
      "",
    ].join("\n");
  }

  buildGoalsNoteContent() {
    return [
      "# 🎯 Goals",
      "",
      "Savings goals are virtual envelopes: log a contribution with the",
      "**Contribute to savings goal** command (or a bullet like",
      "`- $150.00 #log/income/roadbike`) and nothing needs to move between real",
      "bank accounts. Create goals with **Create savings goal**; trips with",
      "**Select or create trip**.",
      "",
      "If several goals live inside one savings account, add",
      "`account: <your-account>` to the block below and take balance snapshots —",
      "it will show how much of the lump sum is not yet promised to any goal.",
      "",
      "```finance-goals",
      "```",
      "",
    ].join("\n");
  }

  // Flips a goal note's `active` frontmatter so several holidays can be saved
  // for at the same time — each active goal shows in the sidebar and forecast.
  async setGoalActiveState(file, active) {
    const content = await this.app.vault.cachedRead(file);
    const next = updateFrontmatterValue(content, "active", active ? "true" : "false");
    if (next !== content) {
      await _ftModify(this.app, file, next);
    }
    this.refreshDailyBudgetView();
  }

  async promptForHolidayBudgetSelection() {
    return new Promise((resolve) => {
      new HolidayBudgetModal(this.app, this, async (selectedFile) => {
        resolve(selectedFile instanceof TFile ? selectedFile : null);
      }).open();
    });
  }

  async openExchangeRateCommand() {
    const budgetFile = await this.promptForHolidayBudgetSelection();
    if (!(budgetFile instanceof TFile)) return;
    const budgetMeta = await this.readHolidayBudgetFile(budgetFile);
    if (!budgetMeta) {
      new Notice("Could not read that trip budget note.");
      return;
    }
    await new Promise((resolve) => {
      new ExchangeRateModal(this.app, this, budgetFile, budgetMeta, async (payload) => {
        if (payload) {
          try {
            await this.applyExchangeRateUpdate(budgetFile, budgetMeta, payload);
          } catch (error) {
            new Notice(`Could not update exchange rate: ${error.message}`);
          }
        }
        resolve();
      }).open();
    });
  }

  async applyExchangeRateUpdate(file, holidayMeta, payload) {
    const content = await this.app.vault.cachedRead(file);
    const nextFlat = { ...(holidayMeta?.exchangeRates?.flat || {}) };
    const nextPeriods = (holidayMeta?.exchangeRates?.periods || []).map((period) => ({
      start: period.start,
      end: period.end,
      rates: { ...(period.rates || {}) },
    }));
    const rateKey = normalizeExchangeRateKey(payload.sourceCurrency, this.settings.defaultCurrency);
    const rateValue = Number(payload.rate);
    if (!rateKey || !Number.isFinite(rateValue) || rateValue <= 0) {
      throw new Error("Exchange rate must be a positive number.");
    }

    if (payload.scope === "period") {
      const start = core.parseIsoDate(payload.startDate);
      const end = core.parseIsoDate(payload.endDate);
      if (!start || !end) {
        throw new Error("Period rates need a valid start and end date.");
      }
      const existing = nextPeriods.find((period) => period.start === start && period.end === end);
      if (existing) {
        existing.rates[rateKey] = rateValue;
      } else {
        nextPeriods.push({ start, end, rates: { [rateKey]: rateValue } });
      }
      nextPeriods.sort((left, right) => `${left.start}-${left.end}`.localeCompare(`${right.start}-${right.end}`));
    } else {
      nextFlat[rateKey] = rateValue;
    }

    let nextContent = updateFrontmatterValue(content, "currency", core.normalizeCurrency(payload.targetCurrency || holidayMeta.currency || this.settings.defaultCurrency));
    nextContent = updateFrontmatterValue(nextContent, "exchange_rates", serializeFlatExchangeRates(nextFlat));
    nextContent = updateFrontmatterValue(nextContent, "exchange_rate_periods", serializeExchangeRatePeriods(nextPeriods));
    await _ftModify(this.app,file, nextContent);
    new Notice(`Updated exchange rates in ${file.basename}`);
  }

  async resolveHolidayMetaFromBlock(ctx, config = {}) {
    const explicitHoliday = core.normalizeHolidayKey(config.holiday || config.tag || config.track || "");
    const budgetTarget = String(config.budget || "").trim();

    let holidayMeta = null;
    let budgetFile = null;
    const sourceFile = this.app.vault.getAbstractFileByPath(ctx?.sourcePath || "");

    if (sourceFile instanceof TFile) {
      const sourceMeta = await this.readHolidayBudgetFile(sourceFile);
      if (sourceMeta?.holidayKey) {
        holidayMeta = sourceMeta;
        budgetFile = sourceFile;
      }
    }

    if (!holidayMeta && budgetTarget) {
      const targetFile = this.app.vault.getAbstractFileByPath(normalizePath(budgetTarget));
      if (targetFile instanceof TFile) {
        holidayMeta = await this.readHolidayBudgetFile(targetFile);
        budgetFile = targetFile;
      }
    }

    if (!holidayMeta && explicitHoliday) {
      const found = await this.findHolidayBudgetByKey(explicitHoliday);
      holidayMeta = found?.meta || null;
      budgetFile = found?.file || null;
    }

    if (!holidayMeta && this.settings.activeHolidayBudgetPath) {
      const active = await this.getActiveHolidayContext();
      if (active) {
        holidayMeta = active;
        const activeFile = this.app.vault.getAbstractFileByPath(active.filePath || this.settings.activeHolidayBudgetPath);
        if (activeFile instanceof TFile) {
          budgetFile = activeFile;
        }
      }
    }

    return {
      budgetFile,
      holidayKey: explicitHoliday || holidayMeta?.holidayKey || "",
      holidayMeta,
    };
  }

  buildHolidayMetrics(holidayMeta, actualEntries, plannedEntries, referenceDate, totalBudget) {
    const startDate = core.parseIsoDate(holidayMeta?.startDate || "") || "";
    const endDate = core.parseIsoDate(holidayMeta?.endDate || "") || "";
    const tripDays = startDate && referenceDate < startDate ? 0 : core.daysBetweenInclusive(startDate || referenceDate, (endDate && endDate < referenceDate) ? endDate : referenceDate);
    const remainingTripDays = core.getRemainingTripDaysInclusive(startDate || referenceDate, endDate || referenceDate, referenceDate);
    const plannedSummary = core.buildPlannedExpenseSummary(holidayMeta?.plannedExpenses || [], plannedEntries);
    const allocatedSummary = core.buildAllocatedExpenseSummary(holidayMeta?.allocatedExpenses || [], startDate, endDate);
    const actualTripSpend = core.roundCurrencyAmount(actualEntries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0));
    const trackedPlannedSpend = core.roundCurrencyAmount(
      plannedSummary.rows.reduce((sum, row) => sum + Number(row.booked > 0 ? row.booked : row.paidFromLog || 0), 0)
    );
    const totalSpent = core.roundCurrencyAmount(actualTripSpend + trackedPlannedSpend);
    const totalSpentPercent = totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(1)) : 0;
    const remaining = totalBudget > 0 ? core.roundCurrencyAmount(totalBudget - Number(plannedSummary.totals.effective || 0)) : 0;
    const spendableRemaining = totalBudget > 0 ? core.roundCurrencyAmount(remaining - actualTripSpend) : 0;
    const canSpendPerDay = remainingTripDays > 0 ? core.roundCurrencyAmount(remaining / remainingTripDays) : 0;
    const accommodationAliases = new Set(["accommodation", "accomodation"]);
    const averageExcludingAccommodation = tripDays
      ? core.roundCurrencyAmount(sumBy(actualEntries, (entry) => !accommodationAliases.has(core.primaryCategory(entry.category))) / tripDays)
      : 0;
    const averageAccommodationPerDay = tripDays
      ? core.roundCurrencyAmount(sumBy(actualEntries, (entry) => accommodationAliases.has(core.primaryCategory(entry.category))) / tripDays)
      : 0;
    const averageTransportPerDay = tripDays
      ? core.roundCurrencyAmount(sumBy(actualEntries, (entry) => core.primaryCategory(entry.category) === "transport") / tripDays)
      : 0;
    const averageFoodPerDay = tripDays
      ? core.roundCurrencyAmount(sumBy(actualEntries, (entry) => core.primaryCategory(entry.category) === "food") / tripDays)
      : 0;

    return {
      averageAccommodationPerDay,
      averageExcludingAccommodation,
      averageFoodPerDay,
      averageTransportPerDay,
      canSpendPerDay,
      actualTripSpend,
      allocatedSummary,
      plannedSummary,
      remaining,
      spendableRemaining,
      remainingTripDays,
      trackedPlannedSpend,
      totalSpent,
      totalSpentPercent,
      tripDays,
    };
  }

  async collectSavingsGoalDefinitions() {
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(normalizePath(`${this.settings.budgetsFolderPath}/`)))
      .filter((file) => !file.path.startsWith(normalizePath(`${this.settings.budgetArchiveFolderPath}/`)))
      .filter((file) => file.path !== this.getDefaultBudgetNotePath())
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
    const goals = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const holiday = this.parseHolidayBudgetContent(content, file.path);
      if (holiday?.archivedDate) continue;
      if (holiday?.holidayKey) {
        goals.push({
          activeSavingsGoal: holiday.activeSavingsGoal,
          allocatedExpenses: holiday.allocatedExpenses,
          carryMissedSavings: holiday.carryMissedSavings,
          currency: holiday.currency,
          dueDate: holiday.savingsDueDate,
          file,
          goalKey: holiday.savingsGoalKey,
          goalName: holiday.holidayName,
          goalType: "holiday",
          paidPlannedExpenses: 0,
          plannedExpenses: holiday.plannedExpenses,
          savingsDisplayMode: holiday.savingsDisplayMode,
          savingsProgressMode: holiday.savingsProgressMode,
          startDate: holiday.startDate,
          startingBalance: holiday.savingsStartingBalance,
          targetAmount: holiday.savingsGoalAmount || holiday.totalBudget || 0,
          totalBudget: holiday.totalBudget || 0,
        });
        continue;
      }
      const generic = this.parseSavingsGoalContent(content, file.path);
      // A note left behind by the build where runway was briefly a goal would
      // otherwise show up here as a savings goal with a $0 target.
      if (generic?.goalKey && !generic.isLegacyRunwayNote) {
        goals.push({ ...generic, file });
      }
    }
    return goals;
  }

  async buildSavingsGoalSummary(goalDefinition, referenceDate, options = {}) {
    const allEntries = await this.collectAllTransactions();
    let effectiveGoalDefinition = goalDefinition;
    if (goalDefinition?.goalType === "holiday") {
      const plannedEntries = allEntries.filter(
        (entry) => entry.goalKey === goalDefinition.goalKey && core.isPlannedExpenseEntry(entry)
      );
      const plannedSummary = core.buildPlannedExpenseSummary(goalDefinition.plannedExpenses || [], plannedEntries);
      effectiveGoalDefinition = {
        ...goalDefinition,
        paidPlannedExpenses: plannedSummary.totals.paidFromLog,
      };
    }
    const summary = core.summarizeGoalProgress(effectiveGoalDefinition, allEntries, referenceDate, {
      period: options.period || this.settings.budgetCheckPeriod || "week",
      weekStartsOn: this.settings.weekStartsOn,
    });

    // Sinking-fund math for any goal with a target and a due date: the weekly
    // set-aside still needed, and whether saving is ahead of the linear pace.
    const contributionDates = allEntries
      .filter((entry) => entry.goalKey === goalDefinition.goalKey && entry.isGoalContribution && core.parseIsoDate(entry.date))
      .map((entry) => entry.date)
      .sort();
    summary.sinkingFund = summary.targetAmount > 0 && goalDefinition.dueDate
      ? core.computeSinkingFund({
          anchorDate: contributionDates[0] || "",
          currentSaved: summary.currentSaved,
          dueDate: goalDefinition.dueDate,
          referenceDate,
          targetAmount: summary.targetAmount,
        })
      : null;
    return summary;
  }

  getReferenceDateForSource(sourcePath) {
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (sourceFile instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      // Daily notes carry `date`, but the Journals plugin's week/month/
      // quarter/year notes only carry `journal-date` — without this fallback
      // a dashboard block embedded in e.g. a monthly note has no frontmatter
      // date to read, and its filename (`2026-07.md`) has no day component
      // either, so it silently fell through to today's date instead of the
      // note's own month.
      const frontmatterDate =
        core.parseIsoDate(cache?.frontmatter?.date) || core.parseIsoDate(cache?.frontmatter?.["journal-date"]);
      if (frontmatterDate) return frontmatterDate;
      const pathDate = core.extractNoteDate("", sourceFile.path);
      if (pathDate) return pathDate;
    }
    return core.todayIsoLocal();
  }

  buildBudgetProgress(entries, budgets, range, groupBy, referenceDate, options = {}) {
    const realEntries = (entries || []).filter((entry) => core.isSpendingEntry(entry));
    const sectionPeriod = core.normalizeBudgetPeriod(options.sectionPeriod || range.period || "week");
    const includeRollup = Boolean(options.includeRollup);
    return (budgets || [])
      .filter((budget) => {
        if (includeRollup) {
          return core.canRollBudgetPeriodIntoSection(budget.period, sectionPeriod);
        }
        return core.normalizeBudgetPeriod(budget.period) === sectionPeriod;
      })
      .map((budget) => {
        const spent = realEntries
          .filter((entry) => {
            if (budget.category === "all") return true;
            return entry.category === budget.category || String(entry.category || "").startsWith(`${budget.category}/`);
          })
          .reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0);
        const limit = core.scaleBudgetLimit(
          Number(budget.limit || 0),
          budget.period,
          range,
          referenceDate || range.start,
          this.settings.weekStartsOn
        );
        const ratio = limit > 0 ? spent / limit : 0;
        const pace = core.computeBudgetPace({
          limit,
          spent,
          periodStart: range.start,
          periodEnd: range.end,
          referenceDate: referenceDate || range.start,
        });
        return {
          ...budget,
          effectiveLimit: limit,
          remaining: Number((limit - spent).toFixed(2)),
          ratio,
          spent: Number(spent.toFixed(2)),
          pace,
        };
      })
      .filter((budget) => Number.isFinite(budget.effectiveLimit) && budget.effectiveLimit > 0);
  }

  renderSummary(wrapper, entries, currency, range, options = {}) {
    const total = entries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0);
    const days = core.daysBetweenInclusive(range.start, range.end);
    const avgPerDay = days > 0 ? total / days : total;
    const grouped = core.groupTransactionsByCategory(entries, "primary");
    const topCategory = grouped[0]?.label || "None";

    const cardData = [
      { label: "Total", value: core.formatCurrency(total, currency) },
      { label: "Avg / day", value: core.formatCurrency(core.roundCurrencyAmount(avgPerDay), currency) },
    ];

    if (Number.isFinite(options.previousTotal)) {
      const delta = total - options.previousTotal;
      const pct = options.previousTotal > 0 ? Math.round((delta / options.previousTotal) * 100) : null;
      const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
      const pctText = pct === null ? "" : ` (${delta >= 0 ? "+" : ""}${pct}%)`;
      cardData.push({
        label: `vs prev ${range.period || "period"}`,
        value: `${arrow} ${core.formatCurrency(Math.abs(delta), currency)}${pctText}`,
        cls: delta > 0 ? "is-up" : delta < 0 ? "is-down" : "",
      });
    }
    cardData.push({ label: "Top category", value: topCategory });

    renderStatCards(wrapper, cardData);
  }

  renderSpendTrend(wrapper, entries, range, currency, options = {}) {
    const dayCount = core.daysBetweenInclusive(range.start, range.end);
    if (dayCount < 2 || dayCount > 62) return;
    const totals = [];
    for (let i = 0; i < dayCount; i += 1) {
      const date = core.addDays(range.start, i);
      const sum = entries
        .filter((entry) => entry.date === date)
        .reduce((acc, entry) => acc + core.entrySpendAmount(entry), 0);
      totals.push({ date, sum: core.roundCurrencyAmount(sum) });
    }
    const perDayBudget = Number(options.perDayBudget || 0);
    const maxValue = Math.max(1, perDayBudget, ...totals.map((t) => t.sum));
    const W = 600;
    const H = 120;
    const pad = 4;
    const gap = totals.length > 30 ? 1 : 2;
    const barWidth = (W - pad * 2 - gap * (totals.length - 1)) / totals.length;
    const today = core.todayIsoLocal();
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Daily spend" });
    const holder = section.createDiv({ cls: "finance-tracker-spark" });
    const svg = holder.createSvg("svg", {
      cls: "ft-spark-svg",
      attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img" },
    });
    if (perDayBudget > 0) {
      const lineY = H - pad - (perDayBudget / maxValue) * (H - pad * 2);
      svg.createSvg("line", {
        cls: "ft-spark-budget",
        attr: { x1: pad, y1: lineY.toFixed(1), x2: W - pad, y2: lineY.toFixed(1) },
      });
    }
    totals.forEach((entry, index) => {
      const height = (entry.sum / maxValue) * (H - pad * 2);
      const x = pad + index * (barWidth + gap);
      const y = H - pad - height;
      svg.createSvg("rect", {
        cls: entry.date === today ? "ft-spark-today" : "ft-spark-bar",
        attr: {
          x: x.toFixed(1),
          y: y.toFixed(1),
          width: Math.max(0.5, barWidth).toFixed(1),
          height: Math.max(0, height).toFixed(1),
          rx: 1,
        },
      });
    });
    if (perDayBudget > 0) {
      section.createDiv({ cls: "finance-tracker-budget-meta", text: `Line = ${core.formatCurrency(perDayBudget, currency)}/day budget` });
    }
  }

  // Pie slices come from the hierarchical colour system: majors are ranked by
  // group total, subcategories sit beside their parent as shades of its hue,
  // and the legend nests subgroups beneath their major group.
  buildPieSlices(hierarchy) {
    const total = hierarchy.slices.reduce((sum, slice) => sum + slice.total, 0);
    if (total <= 0) return { slices: [], total: 0 };
    let angle = 0;
    const slices = hierarchy.slices
      .filter((slice) => slice.total > 0)
      .map((slice) => {
        const ratio = slice.total / total;
        const startAngle = angle;
        angle += ratio * 360;
        return { ...slice, ratio, startAngle, endAngle: angle };
      });
    return { slices, total };
  }

  renderPieLegend(host, hierarchy, currency, total, options = {}) {
    const legend = host.createDiv({ cls: `finance-tracker-legend${options.mini ? " finance-tracker-legend--mini" : ""}` });
    for (const group of hierarchy.groups) {
      if (group.total <= 0) continue;
      const groupItem = legend.createDiv({ cls: "finance-tracker-legend-item is-group" });
      const swatch = groupItem.createDiv({ cls: "finance-tracker-legend-swatch" });
      swatch.style.backgroundColor = group.color;
      groupItem.createDiv({
        cls: "finance-tracker-legend-label",
        text: `${group.label} · ${core.formatCurrency(group.total, currency)} (${Math.round((group.total / total) * 100)}%)`,
      });
      const namedChildren = group.children.filter((child) => child.key !== group.key && child.total > 0);
      if (options.mini || !namedChildren.length) continue;
      for (const child of namedChildren) {
        const childItem = legend.createDiv({ cls: "finance-tracker-legend-item is-child" });
        const childSwatch = childItem.createDiv({ cls: "finance-tracker-legend-swatch" });
        childSwatch.style.backgroundColor = child.color;
        childItem.createDiv({
          cls: "finance-tracker-legend-label",
          text: `${child.label.split(" / ").slice(1).join(" / ") || child.label} · ${core.formatCurrency(child.total, currency)}`,
        });
      }
    }
  }

  // Two-ring donut: the inner ring is the major categories, the outer ring is
  // every subcategory as a shade of its parent's hue. Falls back to a flat pie
  // when nothing has subcategories.
  // Two bands, not three, and the outer band only exists where there is real
  // detail to show.
  //
  // The previous version drew major / subcategory / leaf bands whenever *any*
  // category had a subcategory, which meant a category with nothing beneath it
  // got its wedge repeated three times in the same colour at the same angle —
  // concentric duplicates separated by seams, which read as a broken chart. Now
  // a category that does not split simply extends to the full radius, and the
  // ring appears only over the categories that do.
  renderPieChart(wrapper, hierarchy, currency, threshold = 0.08, options = {}) {
    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: options.title || "Category proportions" });

    const total = hierarchy.groups.reduce((sum, group) => sum + group.total, 0);
    if (total <= 0) {
      pieSection.createDiv({ cls: "finance-tracker-empty", text: "No categorized spending found for this period." });
      return;
    }

    // The deepest genuine split under a major: its leaves where a subcategory
    // splits further, else its subcategories, else nothing.
    const splitOf = (group) => {
      const parts = [];
      for (const subgroup of group.children.filter((item) => item.total > 0)) {
        const leaves = subgroup.children.filter((leaf) => leaf.total > 0 && leaf.key !== subgroup.key);
        if (leaves.length > 1) parts.push(...leaves);
        else parts.push(subgroup);
      }
      return parts.length > 1 || (parts.length === 1 && parts[0].key !== group.key) ? parts : [];
    };

    const size = 460;
    const center = size / 2;
    const outerRadius = 200;
    const anySplit = hierarchy.groups.some((group) => splitOf(group).length);
    const innerRadius = anySplit ? 128 : outerRadius;
    const ringInner = 136;

    let angle = 0;
    const majorSlices = hierarchy.groups
      .filter((group) => group.total > 0)
      .map((group) => {
        const ratio = group.total / total;
        const startAngle = angle;
        angle += ratio * 360;
        return { ...group, ratio, startAngle, endAngle: angle, split: splitOf(group) };
      });

    const chartLayout = pieSection.createDiv({ cls: "finance-tracker-pie-layout" });
    const chartHost = chartLayout.createDiv({ cls: "finance-tracker-pie-host" });
    const svg = chartHost.createSvg("svg", {
      cls: "finance-tracker-pie-svg",
      attr: { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": "Spending by category donut chart" },
    });
    const tooltip = chartHost.createDiv({ cls: "finance-tracker-pie-tooltip is-hidden" });
    const tooltipTitle = tooltip.createDiv({ cls: "finance-tracker-pie-tooltip-title" });
    const tooltipMeta = tooltip.createDiv({ cls: "finance-tracker-pie-tooltip-meta" });
    const attachTooltip = (el, label, amount, ratio) => {
      const show = (event) => {
        tooltipTitle.setText(label);
        tooltipMeta.setText(`${core.formatCurrency(amount, currency)} · ${Math.round(ratio * 100)}%`);
        tooltip.removeClass("is-hidden");
        const hostRect = chartHost.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - hostRect.left}px`;
        tooltip.style.top = `${event.clientY - hostRect.top}px`;
      };
      el.addEventListener("pointerenter", show);
      el.addEventListener("pointermove", show);
      el.addEventListener("pointerleave", () => tooltip.addClass("is-hidden"));
    };

    const label = (text, x, y) =>
      svg.createSvg("text", { cls: "finance-tracker-pie-label", text, attr: { x, y, "text-anchor": "middle" } });

    for (const slice of majorSlices) {
      // A category with no further detail runs all the way out; one that splits
      // stops at the inner radius and hands the outer band to its parts.
      const radius = slice.split.length ? innerRadius : outerRadius;
      let majorEl;
      if (slice.ratio >= 0.999) {
        majorEl = svg.createSvg("circle", {
          cls: "finance-tracker-pie-slice",
          attr: { cx: center, cy: center, r: radius, fill: slice.color },
        });
      } else {
        majorEl = svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: { d: describePieSlice(center, center, radius, slice.startAngle, slice.endAngle), fill: slice.color },
        });
      }
      attachTooltip(majorEl, slice.label, slice.total, slice.ratio);

      if (slice.ratio >= threshold) {
        const point = centroidForSlice(center, center, radius, slice.startAngle, slice.endAngle);
        label(slice.label, point.x, point.y + (slice.split.length ? 2 : -8));
        if (!slice.split.length) {
          svg.createSvg("text", {
            cls: "finance-tracker-pie-value",
            text: formatCurrencyShort(slice.total, currency),
            attr: { x: point.x, y: point.y + 12, "text-anchor": "middle" },
          });
        }
      }

      let partAngle = slice.startAngle;
      for (const part of slice.split) {
        const partRatio = part.total / total;
        const partEnd = partAngle + partRatio * 360;
        const partEl = svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: {
            d: describeAnnularSlice(center, center, ringInner, outerRadius, partAngle, partEnd),
            fill: part.color,
          },
        });
        attachTooltip(partEl, part.label, part.total, partRatio);
        if (partRatio >= threshold) {
          const mid = partAngle + (partEnd - partAngle) / 2;
          const point = polarToCartesian(center, center, (ringInner + outerRadius) / 2, mid);
          label(part.label.split(" / ").pop(), point.x, point.y + 4);
        }
        partAngle = partEnd;
      }
    }

    this.renderPieLegend(chartLayout, hierarchy, currency, total);
  }

  renderPieChartMini(wrapper, hierarchy, currency) {
    const { slices, total } = this.buildPieSlices(hierarchy);
    if (!total) return;

    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: "By category" });

    const size = 200;
    const center = size / 2;
    const radius = 80;

    const chartHost = pieSection.createDiv({ cls: "finance-tracker-pie-host" });
    const svg = chartHost.createSvg("svg", {
      cls: ["finance-tracker-pie-svg", "finance-tracker-pie-svg--mini"],
      attr: { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": "Spending by category" },
    });
    for (const slice of slices) {
      if (slice.ratio >= 0.999) {
        svg.createSvg("circle", {
          cls: "finance-tracker-pie-slice",
          attr: { cx: center, cy: center, r: radius, fill: slice.color },
        });
      } else {
        svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: { d: describePieSlice(center, center, radius, slice.startAngle, slice.endAngle), fill: slice.color },
        });
      }
    }

    this.renderPieLegend(pieSection, hierarchy, currency, total, { mini: true });
  }

  budgetStatus(budget) {
    const pace = budget.pace;
    const behindPace = pace && pace.totalDays > 0 && !pace.onPace;
    return budget.ratio > 1 ? "is-over" : behindPace ? "is-near" : "is-good";
  }

  budgetDetailText(budget, currency) {
    const pace = budget.pace;
    const bits = [
      budget.remaining >= 0
        ? `${core.formatCurrency(budget.remaining, currency)} left`
        : `${core.formatCurrency(Math.abs(budget.remaining), currency)} over budget`,
    ];
    if (pace && pace.totalDays > 0 && pace.remainingDays > 0 && budget.remaining >= 0) {
      bits.push(`${core.formatCurrency(pace.perDayRemaining, currency)}/day for ${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"}`);
      if (pace.projected > (budget.effectiveLimit || 0)) {
        bits.push(`on pace for ${core.formatCurrency(pace.projected, currency)}`);
      }
    }
    return bits.join(" · ");
  }

  appendBudgetBar(host, budget) {
    const pace = budget.pace;
    const bar = host.createDiv({ cls: "finance-tracker-budget-bar" });
    const fill = bar.createDiv({ cls: `finance-tracker-budget-fill ${this.budgetStatus(budget)}` });
    fill.style.width = `${Math.min(budget.ratio, 1.4) * 100}%`;
    if (pace && pace.elapsedFraction > 0 && pace.elapsedFraction < 1) {
      const marker = bar.createDiv({ cls: "finance-tracker-budget-pace-marker" });
      marker.style.left = `${(pace.elapsedFraction * 100).toFixed(1)}%`;
      marker.setAttribute("aria-label", "Pace marker — where you should be today");
    }
  }

  renderBudgets(wrapper, budgets, currency, options = {}) {
    const section = wrapper.createDiv({ cls: `finance-tracker-chart-card${options.compact ? " is-compact-card" : ""}` });
    section.createEl("h4", { text: options.title || "Budget progress" });

    if (!budgets.length) {
      if (!options.hideEmptyState) {
        section.createDiv({ cls: "finance-tracker-empty", text: options.emptyText || "No matching budgets for this period yet." });
      }
      return;
    }

    // Sidebar: one slim row per budget — name and spent/limit only, with a thin
    // pace bar. Everything else (left, safe $/day, projection) sits in a hover
    // tooltip and expands on tap.
    if (options.compact) {
      const rows = section.createDiv({ cls: "ft-budget-rows" });
      for (const budget of budgets) {
        const status = this.budgetStatus(budget);
        const detail = this.budgetDetailText(budget, currency);
        const row = rows.createDiv({ cls: `ft-budget-row ${status}` });
        row.setAttribute("aria-label", detail);
        const top = row.createDiv({ cls: "ft-budget-row-top" });
        top.createSpan({ cls: "ft-budget-row-name", text: budget.name });
        top.createSpan({
          cls: "ft-budget-row-value",
          text: `${formatCurrencyShort(budget.spent, currency)} / ${formatCurrencyShort(budget.effectiveLimit || budget.limit, currency)}`,
        });
        this.appendBudgetBar(row, budget);
        row.createDiv({ cls: "ft-budget-row-details", text: detail });
        row.addEventListener("click", () => {
          row.toggleClass("is-expanded", !row.hasClass("is-expanded"));
        });
      }
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const budget of budgets) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      const pace = budget.pace;
      const status = this.budgetStatus(budget);
      item.addClass(status);
      renderRowTitle(
        item,
        budget.name,
        `${core.formatCurrency(budget.spent, currency)} / ${core.formatCurrency(budget.effectiveLimit || budget.limit, currency)}`
      );
      const metaText =
        budget.remaining >= 0
          ? `${core.formatCurrency(budget.remaining, currency)} left`
          : `${core.formatCurrency(Math.abs(budget.remaining), currency)} over budget`;
      item.createDiv({ cls: "finance-tracker-budget-meta", text: metaText });

      if (pace && pace.totalDays > 0 && pace.remainingDays > 0 && budget.remaining >= 0) {
        const paceText = pace.projected > (budget.effectiveLimit || 0)
          ? `On pace for ${core.formatCurrency(pace.projected, currency)} · keep to ${core.formatCurrency(pace.perDayRemaining, currency)}/day`
          : `${core.formatCurrency(pace.perDayRemaining, currency)}/day for ${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"}`;
        item.createDiv({ cls: "finance-tracker-budget-meta is-pace", text: paceText });
      }

      this.appendBudgetBar(item, budget);
    }
  }

  describeSavingsGoalDueDate(goal, referenceDate) {
    const dueDate = core.parseIsoDate(goal?.dueDate || goal?.savingsDueDate || "");
    const reference = core.parseIsoDate(referenceDate || "");
    if (!dueDate || !reference) return "No due date";
    if (dueDate === reference) return "Due today";
    const start = dueDate > reference ? reference : dueDate;
    const end = dueDate > reference ? dueDate : reference;
    const days = Math.max(0, core.daysBetweenInclusive(start, end) - 1);
    if (dueDate > reference) {
      return `${days} day${days === 1 ? "" : "s"} until due`;
    }
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }

  async renderSavingsActivity(wrapper, allEntries, currency, range, referenceDate) {
    const contributionEntries = (allEntries || []).filter((entry) => entry.isGoalContribution);
    const contributionTotals = new Map();
    for (const entry of contributionEntries) {
      const goalKey = core.normalizeCategoryPath(entry.goalKey || entry.category || "");
      if (!goalKey) continue;
      contributionTotals.set(
        goalKey,
        core.roundCurrencyAmount(Number(contributionTotals.get(goalKey) || 0) + Number(entry.amount || 0))
      );
    }

    const goals = await this.collectSavingsGoalDefinitions();
    const rows = [];
    for (const goal of goals) {
      const contributedThisRange = core.roundCurrencyAmount(Number(contributionTotals.get(goal.goalKey) || 0));
      if (!(contributedThisRange > 0 || goal.activeSavingsGoal)) continue;
      const summary = await this.buildSavingsGoalSummary(goal, referenceDate, { period: range.period });
      rows.push({
        contributedThisRange,
        currency: goal.currency || currency,
        dueText: this.describeSavingsGoalDueDate(goal, referenceDate),
        goal,
        summary,
      });
    }

    if (!rows.length) return;

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Savings activity" });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${core.formatCurrency(
        core.roundCurrencyAmount(rows.reduce((sum, row) => sum + Number(row.contributedThisRange || 0), 0)),
        currency
      )} contributed this ${range.period}. Savings contributions are tracked separately from the spending pie chart.`,
    });

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const row of rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      const targetText = row.summary.currentPeriodContribution >= row.summary.requiredPerPeriod
        ? "On track for this period."
        : "Still below this period's target.";
      renderRowTitle(item, row.goal.goalName, core.formatCurrency(row.contributedThisRange, row.currency));
      item.createDiv({ cls: "finance-tracker-budget-meta", text: `contributed this ${range.period}` });
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${core.formatCurrency(row.summary.currentSaved, row.currency)} saved · ${core.formatCurrency(row.summary.amountRemaining, row.currency)} ${String(
          row.summary.amountRemainingLabel || "remaining"
        ).toLowerCase()}`,
      });
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${core.formatCurrency(row.summary.requiredPerPeriod, row.currency)} target this ${range.period} · ${row.dueText}`,
      });
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: targetText,
      });
    }
  }

  renderHolidaySummary(wrapper, metrics, currency) {
    const cardData = [
      { label: "Trip budget", value: metrics.totalBudget > 0 ? core.formatCurrency(metrics.totalBudget, currency) : "Not set" },
      { label: "Total spent", value: core.formatCurrency(metrics.totalSpent, currency) },
      { label: "Total spent %", value: metrics.totalBudget > 0 ? `${metrics.totalSpentPercent}%` : "Not set" },
      {
        label: "Remaining",
        value:
          metrics.totalBudget > 0
            ? core.formatCurrency(metrics.remaining, currency)
            : "Not set",
      },
      { label: "Can spend / day", value: core.formatCurrency(metrics.canSpendPerDay, currency) },
      { label: "Trip days so far", value: String(metrics.tripDays) },
      { label: "Avg / day", value: core.formatCurrency(metrics.averageExcludingAccommodation, currency) },
      { label: "Avg accommodation / day", value: core.formatCurrency(metrics.averageAccommodationPerDay, currency) },
      { label: "Avg transport / day", value: core.formatCurrency(metrics.averageTransportPerDay, currency) },
      { label: "Avg food / day", value: core.formatCurrency(metrics.averageFoodPerDay, currency) },
    ];

    renderStatCards(wrapper, cardData);
  }

  renderPlannedExpenses(wrapper, plannedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned expenses" });

    if (!plannedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No planned trip costs found yet. Add rows to the Planned expenses table in the trip budget note.",
      });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-planned-list" });
    for (const item of plannedExpenses.rows) {
      const details = list.createEl("details", {
        cls: `finance-tracker-budget-card finance-tracker-planned-details${item.isFullyPaid ? " is-complete" : ""}`,
      });
      const summary = details.createEl("summary", { cls: "finance-tracker-planned-summary" });
      summary.createDiv({
        cls: "finance-tracker-planned-summary-title",
        text: item.item,
      });
      const meta = details.createDiv({ cls: "finance-tracker-planned-content finance-tracker-budget-meta" });
      meta.setText(
        `Planned ${core.formatCurrency(item.planned, currency)} · Booked ${core.formatCurrency(item.booked, currency)} · Paid ${core.formatCurrency(item.paidFromLog, currency)} · Remaining ${core.formatCurrency(item.remainingToPay, currency)}`
      );
      const scheduleBits = [item.startDate, item.endDate].filter(Boolean);
      if (scheduleBits.length || item.link) {
        details.createDiv({
          cls: "finance-tracker-planned-content finance-tracker-budget-meta",
          text: `${scheduleBits.length ? scheduleBits.join(" to ") : "No dates set"}${item.link ? ` · ${item.link}` : ""}`,
        });
      }
      if (item.booked > 0) {
        details.createDiv({
          cls: "finance-tracker-planned-content finance-tracker-budget-meta",
          text: item.isFullyPaid ? "Fully paid from daily logs." : "Still waiting for booked payments to be fully matched in daily logs.",
        });
      }
      if (item.entries.length) {
        const entryList = details.createDiv({ cls: "finance-tracker-planned-content finance-tracker-budget-list" });
        for (const entry of item.entries) {
          entryList.createDiv({
            cls: "finance-tracker-budget-meta",
            text: `${entry.date || ""} · ${core.formatCurrency(entry.amount, currency)} · ${entry.merchant || core.displayCategoryPath(item.category)}`,
          });
        }
      }
    }
  }

  renderAllocatedExpenses(wrapper, allocatedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Allocated expenses" });

    if (!allocatedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No allocated in-trip costs found yet. Add rows to the Allocated expenses table in the trip budget note.",
      });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const item of allocatedExpenses.rows) {
      const card = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(card, item.item, core.formatCurrency(item.allocated, currency));
      card.createDiv({ cls: "finance-tracker-budget-meta", text: `${core.formatCurrency(item.allocatedPerDay, currency)}/day` });
      if (item.link) {
        card.createDiv({
          cls: "finance-tracker-budget-meta",
          text: item.link,
        });
      }
    }
  }

  buildAccommodationPreparationMetrics(holidayMeta, plannedEntries = []) {
    const tripDays = holidayMeta?.startDate && holidayMeta?.endDate
      ? core.daysBetweenInclusive(holidayMeta.startDate, holidayMeta.endDate)
      : 0;
    const accommodationRow = (holidayMeta?.plannedExpenses || []).find(
      (item) => core.normalizeCategoryPath(item.category || "") === "accommodation"
    );
    const plannedAccommodationTotal = core.roundCurrencyAmount(
      Number(accommodationRow?.booked || 0) > 0 ? Number(accommodationRow.booked || 0) : Number(accommodationRow?.planned || 0)
    );
    const averageAccommodationPerDay = tripDays > 0
      ? core.roundCurrencyAmount(plannedAccommodationTotal / tripDays)
      : 0;

    const nightlyRates = (plannedEntries || [])
      .filter((entry) => core.isPlannedExpenseEntry(entry) && core.primaryCategory(entry.category) === "accommodation")
      .map((entry) => {
        const start = entry.plannedStartDate || "";
        const end = entry.plannedEndDate || start;
        const nights = start && end ? Math.max(1, core.daysBetweenInclusive(start, end)) : 1;
        return core.roundCurrencyAmount(Number(entry.amount || 0) / nights);
      })
      .filter((value) => Number.isFinite(value) && value > 0);

    return {
      averageAccommodationPerDay,
      maximumAccommodationPerNight: nightlyRates.length ? Math.max(...nightlyRates) : 0,
      minimumAccommodationPerNight: nightlyRates.length ? Math.min(...nightlyRates) : 0,
    };
  }

  renderPlannedExpenseCalendar(wrapper, plannedExpenses, plannedEntries, holidayMeta) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned expenses calendar" });
    try {
      const startDate = core.parseIsoDate(holidayMeta?.startDate || "");
      const endDate = core.parseIsoDate(holidayMeta?.endDate || "");
      const weekStartsOn = this.settings?.weekStartsOn === "sunday" ? "sunday" : "monday";
      const weekdayLabels = weekStartsOn === "sunday"
        ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const colorByCategory = {
        accommodation: "is-accommodation",
        flights: "is-flights",
        recreation: "is-recreation",
      };
      const filterOptions = ["all", "accommodation", "flights", "recreation"];
      const categoryLabel = (value) => {
        const normalized = core.normalizeCategoryPath(value || "");
        if (!normalized) return "Planned";
        return normalized
          .split("/")
          .filter(Boolean)
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(" / ");
      };
      const getWeekdayIndex = (iso) => {
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        return weekStartsOn === "sunday" ? weekday : (weekday + 6) % 7;
      };
      const getAccommodationNightlyRate = (item) => {
        const start = item.startDate || "";
        const end = item.endDate || start;
        const nights = start && end ? Math.max(1, core.daysBetweenInclusive(start, end)) : 1;
        return core.roundCurrencyAmount(Number(item.displayAmount || 0) / nights);
      };
      const isCategoryVisibleForDay = (items, activeFilter) => {
        if (activeFilter === "all") return items.length > 0;
        return items.some((item) => core.primaryCategory(item.category) === activeFilter);
      };
      const monthKeyForDay = (iso) => iso.slice(0, 7);
      const monthLabelForDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
      });

      const calendarEntries = (plannedEntries || []).filter((entry) => {
        if (!core.isPlannedExpenseEntry(entry)) return false;
        if (!["flights", "accommodation", "recreation"].includes(core.primaryCategory(entry.category))) return false;
        return Boolean(entry.plannedStartDate || entry.plannedEndDate);
      }).map((entry) => ({
        category: entry.category,
        displayAmount: entry.amount,
        endDate: entry.plannedEndDate || entry.plannedStartDate,
        item: entry.merchant || (entry.plannedDetailLinks?.[0]?.label) || core.displayCategoryPath(entry.category),
        links: entry.plannedDetailLinks || [],
        startDate: entry.plannedStartDate || entry.plannedEndDate,
        textLines: entry.plannedDetailLines || [],
      }));
      if (!startDate || !endDate || !calendarEntries.length) {
        section.createDiv({
          cls: "finance-tracker-empty",
          text: "Add dated planned log entries like `#log/26/japanmidyear/planned/accommodation 2026-06-18 2026-06-22` in your daily notes to populate the calendar.",
        });
        return;
      }

      const tripDays = [];
      for (let day = startDate; day && day <= endDate; day = core.addDays(day, 1)) {
        tripDays.push(day);
      }

      const itemsByDay = new Map();
      for (const day of tripDays) {
        const entryItems = calendarEntries.filter((item) => {
          const itemStart = item.startDate || startDate;
          const itemEnd = item.endDate || endDate;
          return day >= itemStart && day <= itemEnd;
        });
        itemsByDay.set(day, entryItems);
      }

      const eventDays = tripDays.filter((day) => (itemsByDay.get(day) || []).length > 0);
      if (!eventDays.length) {
        section.createDiv({
          cls: "finance-tracker-empty",
          text: "No dated planned items matched the current trip range.",
        });
        return;
      }

      const tripWeeks = [];
      let currentWeek = [];
      for (const day of tripDays) {
        if (!currentWeek.length) {
          currentWeek.push(day);
          continue;
        }
        const previousIndex = getWeekdayIndex(currentWeek[currentWeek.length - 1]);
        const currentIndex = getWeekdayIndex(day);
        if (currentIndex <= previousIndex) {
          tripWeeks.push(currentWeek);
          currentWeek = [day];
        } else {
          currentWeek.push(day);
        }
      }
      if (currentWeek.length) {
        tripWeeks.push(currentWeek);
      }

      const monthAccentPalette = [
        "var(--h1-color, var(--text-accent))",
        "var(--h2-color, var(--interactive-accent))",
        "var(--h3-color, #2b6cb0)",
        "var(--h4-color, #d53f8c)",
        "var(--h5-color, #2f855a)",
        "var(--h6-color, #d69e2e)",
      ];
      const monthMetaByKey = new Map();
      for (let weekIndex = 0; weekIndex < tripWeeks.length; weekIndex += 1) {
        const week = tripWeeks[weekIndex];
        for (const day of week) {
          const monthKey = monthKeyForDay(day);
          if (!monthMetaByKey.has(monthKey)) {
            monthMetaByKey.set(monthKey, {
              accent: monthAccentPalette[monthMetaByKey.size % monthAccentPalette.length],
              firstDay: day,
              key: monthKey,
              label: monthLabelForDay(day),
              lastDay: day,
            });
          } else {
            const monthMeta = monthMetaByKey.get(monthKey);
            monthMeta.lastDay = day;
          }
        }
      }

      let activeFilter = "all";
      let selectedDay = "";
      const cellRefs = new Map();
      const weekRefs = new Map();
      const filterButtons = new Map();

      const renderInlineDetails = (container, day, filterValue) => {
        container.empty();
        if (!day) return;
        const dayItems = (itemsByDay.get(day) || []).filter((item) => {
          if (filterValue === "all") return true;
          return core.primaryCategory(item.category) === filterValue;
        });
        if (!dayItems.length) return;

        const panel = container.createDiv({ cls: "finance-tracker-calendar-inline-details" });
        panel.createDiv({ cls: "finance-tracker-calendar-inline-date", text: day });
        const groupedItems = new Map();
        for (const item of dayItems) {
          const categoryKey = core.primaryCategory(item.category) || item.category || "other";
          const existing = groupedItems.get(categoryKey) || {
            amount: 0,
            category: item.category,
            item: categoryLabel(categoryKey),
            links: [],
            nightlyAmount: 0,
            textLines: [],
          };
          existing.amount += Number(item.displayAmount || 0);
          if (categoryKey === "accommodation") {
            existing.nightlyAmount += getAccommodationNightlyRate(item);
          }
          for (const link of item.links || []) {
            if (!existing.links.some((candidate) => candidate?.path === link?.path && candidate?.label === link?.label)) {
              existing.links.push(link);
            }
          }
          for (const line of item.textLines || []) {
            if (!existing.textLines.includes(line)) existing.textLines.push(line);
          }
          groupedItems.set(categoryKey, existing);
        }

        for (const aggregatedItem of groupedItems.values()) {
          const row = panel.createDiv({ cls: "finance-tracker-calendar-inline-item" });
          const summary = row.createDiv({ cls: "finance-tracker-calendar-inline-summary" });
          summary.createDiv({
            cls: "finance-tracker-budget-title",
            text: aggregatedItem.item,
          });
          const metaParts = [
            core.formatCurrency(core.roundCurrencyAmount(aggregatedItem.amount), holidayMeta.currency),
          ];
          if ((core.primaryCategory(aggregatedItem.category) || aggregatedItem.category) === "accommodation" && aggregatedItem.nightlyAmount) {
            metaParts.push(`${core.formatCurrency(core.roundCurrencyAmount(aggregatedItem.nightlyAmount), holidayMeta.currency)} / night`);
          }
          summary.createDiv({
            cls: "finance-tracker-budget-meta",
            text: metaParts.join(" · "),
          });
          const links = aggregatedItem.links || [];
          if (links.length) {
            const linksEl = row.createDiv({ cls: "finance-tracker-calendar-links" });
            for (const link of links) {
              const button = linksEl.createEl("button", {
                cls: "finance-tracker-link-button",
                text: link?.label || link?.path || "Open linked note",
              });
              button.addEventListener("click", async () => {
                if (!link?.path) return;
                await this.app.workspace.openLinkText(link.path, holidayMeta.filePath || "", true);
              });
            }
          }
          const extraLines = (aggregatedItem.textLines || []).filter((line) => {
            if (/\b\d{4}-\d{2}-\d{2}\b/.test(line)) return false;
            return !/\[\[.*\]\]/.test(line);
          });
          for (const line of extraLines) {
            row.createDiv({ cls: "finance-tracker-budget-meta", text: line });
          }
        }
      };

      const refreshCalendarState = () => {
        if (selectedDay && !isCategoryVisibleForDay(itemsByDay.get(selectedDay) || [], activeFilter)) {
          selectedDay = "";
        }
        for (const [filterValue, button] of filterButtons.entries()) {
          button.toggleClass("is-active", filterValue === activeFilter);
        }
        for (const [iso, ref] of cellRefs.entries()) {
          const { cell, dots } = ref;
          const dayItems = itemsByDay.get(iso) || [];
          const matchesFilter = isCategoryVisibleForDay(dayItems, activeFilter);
          const primaryCategories = [...new Set(dayItems.map((item) => core.primaryCategory(item.category)).filter(Boolean))];
          const visibleCategories = activeFilter === "all"
            ? primaryCategories
            : primaryCategories.filter((category) => category === activeFilter);
          cell.removeClass("filter-accommodation", "filter-flights", "filter-recreation");
          if (activeFilter !== "all" && matchesFilter) {
            cell.addClass(`filter-${activeFilter}`);
          }
          cell.toggleClass("is-filter-match", activeFilter !== "all" && matchesFilter);
          cell.toggleClass("is-filter-dimmed", activeFilter !== "all" && !matchesFilter && dayItems.length > 0);
          cell.toggleClass("is-selected", iso === selectedDay);
          dots.empty();
          for (const category of visibleCategories) {
            dots.createSpan({
              cls: `finance-tracker-calendar-dot ${colorByCategory[category] || ""}`,
            });
          }
        }
        for (const [, ref] of weekRefs.entries()) {
          const detailDay = ref.days.includes(selectedDay) ? selectedDay : "";
          renderInlineDetails(ref.detail, detailDay, activeFilter);
        }
      };

      const headers = section.createDiv({ cls: "finance-tracker-calendar-weekdays" });
      for (const label of weekdayLabels) {
        headers.createDiv({ cls: "finance-tracker-calendar-weekday", text: label });
      }

      const calendarBody = section.createDiv({ cls: "finance-tracker-calendar-body" });
      const overlayHost = calendarBody.createDiv({ cls: "finance-tracker-calendar-overlay-host" });
      const calendarCellMeta = new Map();
      for (let weekIndex = 0; weekIndex < tripWeeks.length; weekIndex += 1) {
        const week = tripWeeks[weekIndex];
        const weekBlock = calendarBody.createDiv({ cls: "finance-tracker-calendar-week-block" });
        const weekGrid = weekBlock.createDiv({ cls: "finance-tracker-calendar-grid month-grid" });
        const weekSegments = [];
        let segmentStart = 0;
        while (segmentStart < week.length) {
          const segmentMonthKey = monthKeyForDay(week[segmentStart]);
          let segmentEnd = segmentStart;
          while (segmentEnd + 1 < week.length && monthKeyForDay(week[segmentEnd + 1]) === segmentMonthKey) {
            segmentEnd += 1;
          }
          weekSegments.push({
            end: segmentEnd,
            monthKey: segmentMonthKey,
            start: segmentStart,
          });
          segmentStart = segmentEnd + 1;
        }

        for (let index = 0; index < week.length; index += 1) {
          const day = week[index];
          const dayItems = itemsByDay.get(day) || [];
          const cell = weekGrid.createEl("button", {
            cls: "finance-tracker-calendar-day",
            attr: { type: "button" },
          });
          const dots = cell.createDiv({ cls: "finance-tracker-calendar-dots" });
          cellRefs.set(day, { cell, dots });
          calendarCellMeta.set(day, { cell, weekIndex });
          if (index === 0) {
            cell.style.gridColumnStart = String(getWeekdayIndex(day) + 1);
          }
          if (!dayItems.length) cell.addClass("is-empty");
          const dateText = cell.createSpan({ cls: "finance-tracker-calendar-date", text: day });
          dateText.setAttr("data-short-date", day.slice(-2));
          cell.addEventListener("click", () => {
            if (!dayItems.length) return;
            if (activeFilter !== "all" && !isCategoryVisibleForDay(dayItems, activeFilter)) return;
            selectedDay = selectedDay === day ? "" : day;
            refreshCalendarState();
            requestAnimationFrame(renderMonthOutlines);
          });
        }
        const detail = weekBlock.createDiv({ cls: "finance-tracker-calendar-inline-host" });
        weekRefs.set(`week:${weekIndex}:${week[0]}`, { detail, days: week });
      }

      // Traces an outline around each month's days as a proper rectilinear
      // polygon (union of the grid cells belonging to that month), instead of
      // stitching together per-row segments left-to-right. The old approach
      // assumed each month's row segments nested neatly under one another —
      // true for a plain calendar month, but a trip calendar's rows rarely
      // start on column 0, so a month can occupy e.g. only the last column in
      // one row and only the first two in the next. Connecting those with a
      // simple left/right "staircase" produced a path that doubled back on
      // itself. Tracing actual cell-union boundary edges handles any shape.
      const renderMonthOutlines = () => {
        overlayHost.empty();
        const bodyRect = calendarBody.getBoundingClientRect();
        if (!bodyRect.width || !bodyRect.height) return;

        const svg = overlayHost.createSvg("svg", { cls: "finance-tracker-calendar-overlay-svg" });
        svg.setAttr("width", String(Math.ceil(bodyRect.width)));
        svg.setAttr("height", String(Math.ceil(bodyRect.height)));
        svg.setAttr("viewBox", `0 0 ${Math.ceil(bodyRect.width)} ${Math.ceil(bodyRect.height)}`);

        // Use the cell's own rect (not adjacent-week midpoint) when a detail panel
        // is open — otherwise the midpoint falls inside the expanded panel area.
        const selectedWeekIndex = (selectedDay && calendarCellMeta.get(selectedDay) != null)
          ? calendarCellMeta.get(selectedDay).weekIndex
          : -1;

        const outerInset = 2;
        const numRows = tripWeeks.length;

        // day -> {row, col}, plus each day's live rect keyed the same way.
        const dayAt = new Map();
        const posByDay = new Map();
        const rectByDay = new Map();
        for (let weekIndex = 0; weekIndex < numRows; weekIndex += 1) {
          for (const day of tripWeeks[weekIndex]) {
            const col = getWeekdayIndex(day);
            dayAt.set(`${weekIndex}:${col}`, day);
            posByDay.set(day, { col, row: weekIndex });
            const rect = calendarCellMeta.get(day)?.cell?.getBoundingClientRect();
            if (rect) rectByDay.set(day, rect);
          }
        }

        // Columns share the same 7-track grid width in every week row, so a
        // single column's left/right only needs to be read from whichever row
        // happens to have a day there.
        const colLeftRaw = new Array(7).fill(null);
        const colRightRaw = new Array(7).fill(null);
        for (let col = 0; col < 7; col += 1) {
          for (let row = 0; row < numRows; row += 1) {
            const rect = rectByDay.get(dayAt.get(`${row}:${col}`));
            if (rect) {
              colLeftRaw[col] = rect.left - bodyRect.left;
              colRightRaw[col] = rect.right - bodyRect.left;
              break;
            }
          }
        }
        // Plain midpoints, not offset by half the stroke width: two months
        // sharing a border draw their strokes on that exact same line, which
        // is what keeps every edge end-to-end connectable (see loop-stitch
        // below) instead of leaving a stroke-width gap that breaks the trace.
        const colBound = (col, side) => {
          if (side === "left") {
            if (colLeftRaw[col] == null) return null;
            if (col > 0 && colRightRaw[col - 1] != null) {
              return (colRightRaw[col - 1] + colLeftRaw[col]) / 2;
            }
            return colLeftRaw[col] - outerInset;
          }
          if (colRightRaw[col] == null) return null;
          if (col < 6 && colLeftRaw[col + 1] != null) {
            return (colRightRaw[col] + colLeftRaw[col + 1]) / 2;
          }
          return colRightRaw[col] + outerInset;
        };

        const rowTopRaw = new Array(numRows).fill(null);
        const rowBottomRaw = new Array(numRows).fill(null);
        for (let row = 0; row < numRows; row += 1) {
          const rect = rectByDay.get(tripWeeks[row][0]);
          if (rect) {
            rowTopRaw[row] = rect.top - bodyRect.top;
            rowBottomRaw[row] = rect.bottom - bodyRect.top;
          }
        }
        const rowBound = (row, side) => {
          if (side === "top") {
            if (rowTopRaw[row] == null) return null;
            if (row - 1 === selectedWeekIndex) return rowTopRaw[row] - outerInset;
            if (row > 0 && rowBottomRaw[row - 1] != null) {
              return (rowBottomRaw[row - 1] + rowTopRaw[row]) / 2;
            }
            return rowTopRaw[row] - outerInset;
          }
          if (rowBottomRaw[row] == null) return null;
          if (row === selectedWeekIndex) return rowBottomRaw[row] + outerInset;
          if (row < numRows - 1 && rowTopRaw[row + 1] != null) {
            return (rowBottomRaw[row] + rowTopRaw[row + 1]) / 2;
          }
          return rowBottomRaw[row] + outerInset;
        };

        const monthAt = (row, col) => {
          const day = dayAt.get(`${row}:${col}`);
          return day ? monthKeyForDay(day) : null;
        };

        const monthsInGrid = new Map();
        for (let row = 0; row < numRows; row += 1) {
          for (let col = 0; col < 7; col += 1) {
            const monthKey = monthAt(row, col);
            if (monthKey && !monthsInGrid.has(monthKey)) monthsInGrid.set(monthKey, monthMetaByKey.get(monthKey));
          }
        }

        const pointKey = (x, y) => `${x.toFixed(1)}:${y.toFixed(1)}`;

        for (const [monthKey, monthMeta] of monthsInGrid.entries()) {
          const edges = [];
          for (let row = 0; row < numRows; row += 1) {
            for (let col = 0; col < 7; col += 1) {
              if (monthAt(row, col) !== monthKey) continue;
              const left = colBound(col, "left");
              const right = colBound(col, "right");
              const top = rowBound(row, "top");
              const bottom = rowBound(row, "bottom");
              if (left == null || right == null || top == null || bottom == null) continue;

              // Emit an edge for each side whose neighbour isn't the same
              // month. Directions are chosen so a solid region's boundary
              // walks clockwise, letting adjacent cells' edges chain end-to-
              // start into one continuous loop. A row touching the expanded
              // detail panel (selectedWeekIndex) is never visually adjacent
              // to the row on the panel's far side, so that boundary always
              // gets an edge even when the same month sits on both sides —
              // otherwise the trace treats them as touching and cuts a
              // diagonal straight through the gap.
              const topOpen = (row - 1) === selectedWeekIndex || monthAt(row - 1, col) !== monthKey;
              const bottomOpen = row === selectedWeekIndex || monthAt(row + 1, col) !== monthKey;
              if (monthAt(row, col - 1) !== monthKey) edges.push([left, bottom, left, top]);
              if (monthAt(row, col + 1) !== monthKey) edges.push([right, top, right, bottom]);
              if (topOpen) edges.push([left, top, right, top]);
              if (bottomOpen) edges.push([right, bottom, left, bottom]);
            }
          }
          if (!edges.length) continue;

          const byStart = new Map();
          for (const edge of edges) {
            const k = pointKey(edge[0], edge[1]);
            const list = byStart.get(k) || [];
            list.push(edge);
            byStart.set(k, list);
          }

          const used = new Set();
          const loops = [];
          for (const startEdge of edges) {
            if (used.has(startEdge)) continue;
            const startPoint = [startEdge[0], startEdge[1]];
            const loopPoints = [startPoint];
            let current = startEdge;
            used.add(current);
            let guard = 0;
            while (guard <= edges.length) {
              guard += 1;
              const endPoint = [current[2], current[3]];
              if (endPoint[0] === startPoint[0] && endPoint[1] === startPoint[1]) break;
              loopPoints.push(endPoint);
              const candidates = (byStart.get(pointKey(endPoint[0], endPoint[1])) || []).filter((edge) => !used.has(edge));
              if (!candidates.length) break;
              current = candidates[0];
              used.add(current);
            }
            if (loopPoints.length > 2) loops.push(loopPoints);
          }
          if (!loops.length) continue;

          const pathData = loops
            .map((loop) => loop.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z")
            .join(" ");

          const path = svg.createSvg("path", { cls: "finance-tracker-calendar-month-path" });
          path.setAttr("d", pathData);
          path.setAttr("stroke", monthMeta?.accent || "var(--h1-color, var(--text-accent))");
          path.setAttr("fill", "none");

          const firstPos = monthMeta?.firstDay ? posByDay.get(monthMeta.firstDay) : null;
          if (monthMeta?.label && firstPos) {
            const labelLeft = colBound(firstPos.col, "left");
            const labelTop = rowBound(firstPos.row, "top");
            if (labelLeft != null && labelTop != null) {
              const label = overlayHost.createDiv({ cls: "finance-tracker-calendar-month-label", text: monthMeta.label });
              label.style.left = `${labelLeft + 14}px`;
              label.style.top = `${labelTop + 10}px`;
              label.style.color = monthMeta.accent;
            }
          }
        }
      };

      const filterBar = section.createDiv({ cls: "finance-tracker-calendar-filter-bar" });
      for (const filterValue of filterOptions) {
        const button = filterBar.createEl("button", {
          cls: "finance-tracker-calendar-filter-button",
          text: filterValue === "all" ? "All" : categoryLabel(filterValue),
        });
        filterButtons.set(filterValue, button);
        button.addEventListener("click", () => {
          activeFilter = filterValue;
          selectedDay = "";
          refreshCalendarState();
          requestAnimationFrame(renderMonthOutlines);
        });
      }

      refreshCalendarState();
      requestAnimationFrame(renderMonthOutlines);
      const calendarResizeObserver = new ResizeObserver(() => {
        if (!calendarBody.isConnected) {
          calendarResizeObserver.disconnect();
          return;
        }
        renderMonthOutlines();
      });
      calendarResizeObserver.observe(calendarBody);
    } catch (error) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: `Calendar render failed: ${error?.message || error}`,
      });
    }
  }

  renderExchangeRates(wrapper, holidayMeta) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Exchange rates" });

    const flatEntries = Object.entries(holidayMeta?.exchangeRates?.flat || {});
    const periodEntries = holidayMeta?.exchangeRates?.periods || [];

    if (!flatEntries.length && !periodEntries.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No exchange rates configured yet. Add `exchange_rates` or `exchange_rate_periods` to the trip budget frontmatter.",
      });
      return;
    }

    if (flatEntries.length) {
      const flatList = section.createDiv({ cls: "finance-tracker-budget-list" });
      for (const [rateKey, rate] of flatEntries) {
        const item = flatList.createDiv({ cls: "finance-tracker-budget-card" });
        const label = rateKey.replace(/_CASH$/i, " CASH");
        item.createDiv({
          cls: "finance-tracker-budget-title",
          text: `Flat rate - 1 ${label} = ${Number(rate).toFixed(4)} ${holidayMeta.currency}`,
        });
      }
    }

    if (periodEntries.length) {
      const periodList = section.createDiv({ cls: "finance-tracker-budget-list" });
      for (const period of periodEntries) {
        const item = periodList.createDiv({ cls: "finance-tracker-budget-card" });
        const rates = Object.entries(period.rates || {})
          .map(([rateKey, rate]) => `1 ${rateKey.replace(/_CASH$/i, " CASH")} = ${Number(rate).toFixed(4)} ${holidayMeta.currency}`)
          .join(" · ");
        item.createDiv({
          cls: "finance-tracker-budget-title",
          text: `${period.start} to ${period.end}`,
        });
        item.createDiv({ cls: "finance-tracker-budget-meta", text: rates });
      }
    }
  }

  renderSavingsSummary(wrapper, goal, summary, currency, extras = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: goal.goalName || "Savings goal" });
    const cardData = goal.goalType === "holiday"
      ? [
        { label: "Target", value: core.formatCurrency(summary.targetAmount, currency) },
        { label: "Current Account Balance", value: core.formatCurrency(summary.currentAccountBalance, currency) },
        { label: "Paid Planned expenses", value: core.formatCurrency(summary.paidPlannedExpenses, currency) },
        { label: "Saved Progress", value: core.formatCurrency(summary.savedProgress, currency) },
        { label: summary.amountRemainingLabel, value: core.formatCurrency(summary.amountRemaining, currency) },
        { label: "Saved %", value: summary.targetAmount > 0 ? `${summary.proportionSaved}%` : "0%" },
        { label: "Required This Period", value: core.formatCurrency(summary.requiredPerPeriod, currency) },
        { label: "This Period", value: core.formatCurrency(summary.currentPeriodContribution, currency) },
        { label: "Avg accommodation / day", value: core.formatCurrency(extras.averageAccommodationPerDay || 0, currency) },
        { label: "Maximum Spent / Night", value: extras.maximumAccommodationPerNight ? core.formatCurrency(extras.maximumAccommodationPerNight, currency) : "Not set" },
        { label: "Minimum Spent / Night", value: extras.minimumAccommodationPerNight ? core.formatCurrency(extras.minimumAccommodationPerNight, currency) : "Not set" },
      ]
      : [
        { label: "Target", value: core.formatCurrency(summary.targetAmount, currency) },
        { label: "Current Saved", value: core.formatCurrency(summary.currentSaved, currency) },
        { label: summary.amountRemainingLabel, value: core.formatCurrency(summary.amountRemaining, currency) },
        { label: "Saved %", value: summary.targetAmount > 0 ? `${summary.proportionSaved}%` : "0%" },
        { label: "Required This Period", value: core.formatCurrency(summary.requiredPerPeriod, currency) },
        { label: "This Period", value: core.formatCurrency(summary.currentPeriodContribution, currency) },
      ];
    if (summary.sinkingFund) {
      const fund = summary.sinkingFund;
      const paceLabels = {
        ahead: "Ahead of pace",
        behind: "Behind pace",
        complete: "Target reached",
        overdue: "Past due date",
        "on-track": "On track",
      };
      cardData.push({ label: "Set aside / week", value: core.formatCurrency(fund.requiredPerWeek, currency) });
      cardData.push({
        label: "Pace",
        value: paceLabels[fund.status] || fund.status,
        cls: fund.status === "behind" || fund.status === "overdue" ? "is-over" : fund.status === "ahead" || fund.status === "complete" ? "is-down" : "",
      });
    }
    renderStatCards(section, cardData);
  }

  async renderSavingsDashboard(source, el, ctx) {
    el.empty();

    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath || "");
    let goalDefinition = null;

    if (sourceFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(sourceFile);
      const holiday = this.parseHolidayBudgetContent(content, sourceFile.path);
      if (holiday?.holidayKey) {
        goalDefinition = {
          activeSavingsGoal: holiday.activeSavingsGoal,
          allocatedExpenses: holiday.allocatedExpenses,
          carryMissedSavings: holiday.carryMissedSavings,
          currency: holiday.currency,
          dueDate: holiday.savingsDueDate,
          goalKey: holiday.savingsGoalKey,
          goalName: holiday.holidayName,
          goalType: "holiday",
          paidPlannedExpenses: 0,
          plannedExpenses: holiday.plannedExpenses,
          savingsDisplayMode: holiday.savingsDisplayMode,
          savingsProgressMode: holiday.savingsProgressMode,
          startDate: holiday.startDate,
          startingBalance: holiday.savingsStartingBalance,
          targetAmount: holiday.savingsGoalAmount || holiday.totalBudget || 0,
          totalBudget: holiday.totalBudget || 0,
        };
      } else {
        goalDefinition = this.parseSavingsGoalContent(content, sourceFile.path);
      }
    }

    if (!goalDefinition?.goalKey) {
      const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "Add savings goal frontmatter to this note to render a savings dashboard." });
      return;
    }

    const summary = await this.buildSavingsGoalSummary(goalDefinition, referenceDate);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || `${goalDefinition.goalName} ${goalDefinition.goalType === "holiday" ? "Trip preparation dashboard" : "Savings dashboard"}` });
    if (goalDefinition.goalType === "holiday") {
      const holidayMeta = this.parseHolidayBudgetContent(await this.app.vault.cachedRead(sourceFile), sourceFile.path);
      const plannedEntries = await this.collectTransactionsForHoliday(holidayMeta.holidayKey, {
        start: "1900-01-01",
        end: "2999-12-31",
      });
      const plannedSummary = core.buildPlannedExpenseSummary(
        holidayMeta.plannedExpenses || [],
        plannedEntries.filter((entry) => core.isPlannedExpenseEntry(entry))
      );
      const allocatedSummary = core.buildAllocatedExpenseSummary(holidayMeta.allocatedExpenses || [], holidayMeta.startDate, holidayMeta.endDate);
      const accommodationMetrics = this.buildAccommodationPreparationMetrics(holidayMeta, plannedEntries.filter((entry) => core.isPlannedExpenseEntry(entry)));
      this.renderSavingsSummary(
        wrapper,
        goalDefinition,
        summary,
        goalDefinition.currency || this.settings.defaultCurrency,
        accommodationMetrics
      );
      this.renderPlannedExpenseCalendar(
        wrapper,
        plannedSummary,
        plannedEntries.filter((entry) => core.isPlannedExpenseEntry(entry)),
        holidayMeta
      );
      this.renderAllocatedExpenses(wrapper, allocatedSummary, goalDefinition.currency || this.settings.defaultCurrency);
    } else {
      this.renderSavingsSummary(wrapper, goalDefinition, summary, goalDefinition.currency || this.settings.defaultCurrency);
    }
  }

  // Post-trip reflection view: totals, per-category breakdown (total, avg/day,
  // biggest single expense), best and quietest days, planned-vs-paid, savings
  // outcome, and post-trip stragglers.
  async renderTripReflection(wrapper, holidayMeta, holidayKey, referenceDate, config = {}) {
    const currency = core.normalizeCurrency(config.currency || holidayMeta?.currency || this.settings.defaultCurrency);
    const allEntries = await this.collectAllTransactions();
    const reflection = core.buildTripReflection(
      {
        currency,
        endDate: holidayMeta?.endDate,
        startDate: holidayMeta?.startDate,
        totalBudget: Number(core.parseNumber(config.total_budget || config.totalbudget || holidayMeta?.totalBudget) || 0),
        tripTag: holidayKey,
      },
      allEntries,
      referenceDate
    );

    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || `${toTitleFromHolidayKey(holidayKey)} — trip reflection` });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const exportButton = headerActions.createEl("button", { text: "Export trip CSV" });
    exportButton.addEventListener("click", async () => {
      const tripEntries = allEntries.filter((entry) => entry.holidayKey === holidayKey);
      await this.exportEntriesToCsv(tripEntries, `holiday-${holidayKey.replace(/\//g, "-")}-reflection`);
    });

    if (!reflection.entryCount && !reflection.afterCount) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "No trip spending was logged against this tag." });
      return;
    }

    const cardData = [
      { label: "Total spent", value: core.formatCurrency(reflection.totalSpent, currency) },
    ];
    if (reflection.afterTotal > 0) {
      cardData.push({ label: "After the trip", value: core.formatCurrency(reflection.afterTotal, currency) });
    }
    if (reflection.budgetDelta !== null) {
      cardData.push({
        label: reflection.budgetDelta >= 0 ? "Under budget" : "Over budget",
        value: core.formatCurrency(Math.abs(reflection.budgetDelta), currency),
        cls: reflection.budgetDelta >= 0 ? "is-down" : "is-up",
      });
    }
    cardData.push({ label: "Trip days", value: String(reflection.tripDays || reflection.dailySeries.length) });
    cardData.push({ label: "Average / day", value: core.formatCurrency(reflection.averagePerDay, currency) });
    if (reflection.maxDay && reflection.maxDay.total > 0) {
      cardData.push({ label: "Biggest day", value: `${core.formatCurrency(reflection.maxDay.total, currency)} · ${reflection.maxDay.date}` });
    }
    if (reflection.quietDay && reflection.quietDay.date !== reflection.maxDay?.date) {
      cardData.push({ label: "Quietest day", value: `${core.formatCurrency(reflection.quietDay.total, currency)} · ${reflection.quietDay.date}` });
    }

    // Savings outcome: what was put aside for this trip beforehand.
    const goalKey = core.normalizeCategoryPath(holidayMeta?.savingsGoalKey || "");
    if (goalKey) {
      const contributions = allEntries.filter((entry) => entry.goalKey === goalKey && entry.isGoalContribution && entry.entryType === "income");
      const saved = core.roundCurrencyAmount(
        (holidayMeta?.savingsStartingBalance || 0) + contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      );
      if (saved > 0) {
        cardData.push({
          label: "Saved beforehand",
          value: `${core.formatCurrency(saved, currency)} · ${contributions.length} contribution${contributions.length === 1 ? "" : "s"}`,
        });
      }
    }
    renderStatCards(wrapper, cardData);

    // Category breakdown: total, average per trip day, share, biggest single hit.
    if (reflection.categories.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Where it went" });
      const duringEntries = allEntries.filter(
        (entry) =>
          entry.holidayKey === holidayKey &&
          !entry.isIncome &&
          !entry.isGoalContribution &&
          !core.isPlannedExpenseEntry(entry) &&
          entry.entryType !== "balance" &&
          (!reflection.endDate || String(entry.date || "") <= reflection.endDate)
      );
      const hierarchy = core.buildHierarchicalCategoryGroups(duringEntries, "primary");
      const colorByKey = new Map(hierarchy.groups.map((group) => [group.key, group.color]));
      const table = section.createEl("table", { cls: "finance-tracker-table" });
      const headRow = table.createEl("thead").createEl("tr");
      for (const label of ["Category", "Total", "Avg / day", "%", "Biggest single"]) {
        headRow.createEl("th", { text: label });
      }
      const body = table.createEl("tbody");
      for (const row of reflection.categories) {
        const tr = body.createEl("tr");
        const labelCell = tr.createEl("td");
        const color = colorByKey.get(row.key);
        if (color) {
          const swatch = labelCell.createSpan({ cls: "finance-tracker-legend-swatch finance-tracker-table-swatch" });
          swatch.style.backgroundColor = color;
        }
        labelCell.createSpan({ text: row.label });
        tr.createEl("td", { text: core.formatCurrency(row.total, currency), cls: "is-numeric" });
        tr.createEl("td", { text: core.formatCurrency(row.averagePerDay, currency), cls: "is-numeric" });
        tr.createEl("td", { text: `${row.pct}%`, cls: "is-numeric" });
        tr.createEl("td", {
          text: row.maxEntry
            ? `${core.formatCurrency(row.maxEntry.amount, currency)}${row.maxEntry.merchant ? ` · ${row.maxEntry.merchant}` : ""}`
            : "—",
        });
      }
    }

    // Daily spend across the trip.
    this.renderLineChartCard(
      wrapper,
      "Spend by day",
      reflection.dailySeries.map((point) => ({ date: point.date, value: point.total })),
      { emptyText: "No dated trip entries to chart." }
    );

    // Planned vs paid, when the note had a planned table.
    const plannedRows = holidayMeta?.plannedExpenses || [];
    if (plannedRows.length) {
      const plannedEntries = allEntries.filter(
        (entry) => entry.holidayKey === holidayKey && core.isPlannedExpenseEntry(entry)
      );
      const plannedSummary = core.buildPlannedExpenseSummary(plannedRows, plannedEntries);
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Planned vs paid" });
      const list = section.createDiv({ cls: "ft-budget-rows" });
      for (const row of plannedSummary.rows) {
        const line = list.createDiv({ cls: "ft-budget-row" });
        const top = line.createDiv({ cls: "ft-budget-row-top" });
        top.createSpan({ cls: "ft-budget-row-name", text: row.item });
        top.createSpan({
          cls: "ft-budget-row-value",
          text: `planned ${formatCurrencyShort(row.planned, currency)} · paid ${formatCurrencyShort(row.paidFromLog, currency)}`,
        });
      }
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `Planned ${core.formatCurrency(plannedSummary.totals.planned, currency)} · paid ${core.formatCurrency(plannedSummary.totals.paidFromLog, currency)} in total.`,
      });
    }

    wrapper.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "This trip has ended, so the dashboard shows the reflection. Add `view: live` to the block to bring the live dashboard back.",
    });
  }

  async renderHolidayDashboard(source, el, ctx) {
    el.empty();

    try {
      const config = parseConfigBlock(source);
      const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
      const { holidayMeta, holidayKey, budgetFile } = await this.resolveHolidayMetaFromBlock(ctx, config);
      const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });

      if (!holidayKey) {
        wrapper.createDiv({
          cls: "finance-tracker-empty",
          text: "Set `trip: 2026/japan` in this code block, or add a `trip_tag` to the budget note frontmatter.",
        });
        return;
      }

      // Once the trip has ended (or the note is archived) the dashboard becomes
      // a reflection: what the trip actually cost, category by category.
      // `view: live` forces the live dashboard back; `view: reflection` forces
      // the reflection early.
      const viewMode = String(config.view || "auto").toLowerCase();
      const tripFinished = Boolean(
        (holidayMeta?.endDate && referenceDate > holidayMeta.endDate) || holidayMeta?.archivedDate
      );
      if (viewMode === "reflection" || (viewMode !== "live" && tripFinished)) {
        await this.renderTripReflection(wrapper, holidayMeta, holidayKey, referenceDate, config);
        return;
      }

      const startDate = core.parseIsoDate(config.start || holidayMeta?.startDate || "") || "";
      const configuredEndDate = core.parseIsoDate(config.end || holidayMeta?.endDate || "") || "";
      const cappedEnd =
        configuredEndDate && startDate && configuredEndDate >= startDate
          ? configuredEndDate
          : configuredEndDate && !startDate
            ? configuredEndDate
            : "";
      const effectiveEnd = cappedEnd && cappedEnd < referenceDate ? cappedEnd : referenceDate;
      const holidayEntries = await this.collectTransactionsForHoliday(holidayKey, {
        start: "1900-01-01",
        end: effectiveEnd || "2999-12-31",
      });
      const splitEntries = core.splitHolidayEntries(holidayEntries);
      const actualEntries = splitEntries.actual.filter((entry) => !startDate || String(entry.date || "") >= startDate);
      const currency = core.normalizeCurrency(config.currency || holidayMeta?.currency || this.settings.defaultCurrency);
      const groupBy = String(config.groupby || this.settings.dashboardDefaultGroupBy || "primary").toLowerCase();
      const totalBudget = Number(core.parseNumber(config.total_budget || config.totalbudget || holidayMeta?.totalBudget) || 0);
      const metrics = this.buildHolidayMetrics(holidayMeta, actualEntries, splitEntries.planned, referenceDate, totalBudget);

      const header = wrapper.createDiv({ cls: "finance-tracker-header" });
      header.createEl("h3", {
        text: config.title || `${toTitleFromHolidayKey(holidayKey)} Holiday Dashboard`,
      });

      const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
      const exportButton = headerActions.createEl("button", { text: "Export trip CSV" });
      exportButton.addEventListener("click", async () => {
        await this.exportEntriesToCsv(actualEntries, `holiday-${holidayKey.replace(/\//g, "-")}-${effectiveEnd || referenceDate}`);
      });
      if (budgetFile instanceof TFile) {
        const budgetButton = headerActions.createEl("button", { text: "Open trip budget" });
        budgetButton.addEventListener("click", async () => {
          await this.app.workspace.getLeaf(true).openFile(budgetFile);
        });
      }

      this.renderHolidaySummary(
        wrapper,
        { ...metrics, totalBudget },
        currency
      );

      this.renderExchangeRates(wrapper, holidayMeta);
    } catch (error) {
      const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `Trip dashboard failed to render: ${error.message}`,
      });
      console.error("[finance-tracker] holiday dashboard render failed", error);
    }
  }

  async renderDailyBudgetCheckInto(el, referenceDate, groupBy = "full") {
    el.empty();

    const basePeriod = this.settings.budgetCheckPeriod || "week";
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const budgets = await this.loadBudgets("default");

    // Entries for the full budget period (capped to today)
    const periodRange = core.toPeriodRange({
      period: basePeriod,
      referenceDate,
      weekStartsOn: this.settings.weekStartsOn,
    });
    const periodEntries = await this.collectTransactionsForRange({
      ...periodRange,
      end: referenceDate < periodRange.end ? referenceDate : periodRange.end,
    });
    const spendEntries = periodEntries.filter((e) => core.isSpendingEntry(e));

    // Today's entries
    const todayEntries = (await this.collectTransactionsForRange({ start: referenceDate, end: referenceDate }))
      .filter((e) => core.isSpendingEntry(e));

    const periodTotal = spendEntries.reduce((sum, e) => sum + core.entrySpendAmount(e), 0);
    const todayTotal = todayEntries.reduce((sum, e) => sum + core.entrySpendAmount(e), 0);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard is-sidebar" });

    // Header
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: "Daily budget" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Add", () => this.openQuickAdd(), {
      primary: true,
      opensModal: true,
      tooltip: "Quick add a transaction",
    });
    addAction(headerActions, "Budgets", () => this.openDefaultBudgetNote(), { errorPrefix: "Opening budgets note" });

    // Summary cards: Today + this period (+ trip cards when one is running).
    // Collected first, rendered once, so the conditional cards join the same
    // grid without each one re-deciding its own markup.
    const summaryCards = [
      { label: "Today", value: core.formatCurrency(core.roundCurrencyAmount(todayTotal), currency) },
      { label: core.titleCaseSegment(basePeriod), value: core.formatCurrency(core.roundCurrencyAmount(periodTotal), currency) },
    ];

    // Safe-to-spend per remaining day, derived from the "all" budget for this period.
    const allBudget = budgets.find(
      (budget) => budget.category === "all" && core.normalizeBudgetPeriod(budget.period) === core.normalizeBudgetPeriod(basePeriod)
    );
    if (allBudget) {
      const scaledLimit = core.scaleBudgetLimit(Number(allBudget.limit || 0), allBudget.period, periodRange, referenceDate, this.settings.weekStartsOn);
      const pace = core.computeBudgetPace({ limit: scaledLimit, spent: periodTotal, periodStart: periodRange.start, periodEnd: periodRange.end, referenceDate });
      summaryCards.push({
        label: "Left / day",
        value: core.formatCurrency(pace.perDayRemaining, currency),
        cls: pace.projected > scaledLimit ? "is-over" : "",
        hint: pace.remainingDays > 0 ? `${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"} to go` : "",
      });
    }

    let holidayContext = await this.findHolidayContextForDate(referenceDate);
    if (!holidayContext?.holidayKey && this.settings.tripModeActive) {
      holidayContext = await this.getActiveTripContext();
    }
    if (holidayContext?.holidayKey) {
      const holidayEntries = await this.collectTransactionsForHoliday(holidayContext.holidayKey, {
        start: holidayContext.startDate || "1900-01-01",
        end: (holidayContext.endDate && holidayContext.endDate < referenceDate) ? holidayContext.endDate : referenceDate,
      });
      const splitEntries = core.splitHolidayEntries(holidayEntries);
      const actualEntries = splitEntries.actual.filter((entry) => !holidayContext.startDate || String(entry.date || "") >= holidayContext.startDate);
      const metrics = this.buildHolidayMetrics(
        holidayContext,
        actualEntries,
        splitEntries.planned,
        referenceDate,
        Number(holidayContext.totalBudget || 0)
      );
      const dailyCanSpend = metrics.remainingTripDays > 0
        ? core.roundCurrencyAmount(metrics.spendableRemaining / metrics.remainingTripDays)
        : 0;
      const tripCurrency = holidayContext.currency || currency;
      const tripName = holidayContext.holidayName || "Trip";
      const tripTodaySpend = actualEntries
        .filter((entry) => entry.date === referenceDate)
        .reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0);

      summaryCards.push(
        { label: `${tripName} today`, value: core.formatCurrency(core.roundCurrencyAmount(tripTodaySpend), tripCurrency), cls: "is-trip" },
        { label: "Trip budget left", value: core.formatCurrency(metrics.spendableRemaining, tripCurrency), cls: "is-trip" },
        {
          label: "Safe / day",
          value: core.formatCurrency(dailyCanSpend, tripCurrency),
          cls: "is-trip",
          hint: metrics.remainingTripDays > 0 ? `${metrics.remainingTripDays} trip day${metrics.remainingTripDays === 1 ? "" : "s"} left` : "",
        }
      );
    }

    renderStatCards(wrapper, summaryCards);

    // Mini pie chart (sidebar-friendly: SVG centred + compact legend below)
    const hierarchy = core.buildHierarchicalCategoryGroups(spendEntries, "primary");
    if (hierarchy.slices.length) {
      this.renderPieChartMini(wrapper, hierarchy, currency);
    }

    // Compact budget bars per section period
    const sectionPeriods = core.getDailyBudgetSectionPeriods(basePeriod);
    const normalizedBasePeriod = core.normalizeBudgetPeriod(basePeriod);
    for (const sectionPeriod of sectionPeriods) {
      const sectionRange = core.toPeriodRange({
        period: sectionPeriod,
        referenceDate,
        weekStartsOn: this.settings.weekStartsOn,
      });
      const sectionEntries = await this.collectTransactionsForRange({
        ...sectionRange,
        end: referenceDate < sectionRange.end ? referenceDate : sectionRange.end,
      });
      const includeRollup = sectionPeriod === normalizedBasePeriod;
      const progress = this.buildBudgetProgress(sectionEntries, budgets, sectionRange, groupBy, referenceDate, {
        includeRollup,
        sectionPeriod,
      });
      if (progress.length) {
        this.renderBudgets(wrapper, progress, currency, {
          compact: true,
          hideEmptyState: true,
          title: `${core.titleCaseSegment(sectionPeriod)} Budgets`,
        });
      }
    }

    // Active savings goals (compact with progress bar)
    const savingsGoals = (await this.collectSavingsGoalDefinitions()).filter((goal) => goal.activeSavingsGoal);
    if (savingsGoals.length) {
      const goalsSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      goalsSection.createEl("h4", { text: "Savings goals" });
      for (const goal of savingsGoals) {
        const summary = await this.buildSavingsGoalSummary(goal, referenceDate);
        const goalTotal = summary.targetAmount > 0 ? summary.targetAmount : summary.currentSaved + summary.amountRemaining;
        const fillRatio = goalTotal > 0 ? summary.currentSaved / goalTotal : 0;
        const row = goalsSection.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(row, goal.goalName, core.formatCurrency(summary.currentSaved, goal.currency || currency));
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `of ${core.formatCurrency(goalTotal, goal.currency || currency)}`,
        });
        const bar = row.createDiv({ cls: "finance-tracker-budget-bar" });
        const fillEl = bar.createDiv({ cls: "finance-tracker-budget-fill is-good" });
        fillEl.style.width = `${Math.min(fillRatio * 100, 100)}%`;
      }
    }

    // Outstanding split balances (only when splits are actually in use).
    const splitSummary = core.summarizeSplitBalances(await this.collectAllTransactions());
    if (splitSummary.people.some((person) => person.outstanding > 0)) {
      const splitsSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      splitsSection.createEl("h4", { text: `Owed to you (${core.formatCurrency(splitSummary.totalOutstanding, currency)})` });
      for (const person of splitSummary.people.filter((row) => row.outstanding > 0).slice(0, 6)) {
        const row = splitsSection.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(row, person.displayName, core.formatCurrency(person.outstanding, currency));
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Settle up",
          async () => {
            await this.settleUpWithPerson(person.person, person.displayName, person.outstanding);
            this.refreshDailyBudgetView();
          },
          { primary: true, errorPrefix: "Settle up" }
        );
      }
    }

    // Recurring bills due or overdue — stays here until each is logged.
    const dueRecurring = (await this.detectRecurring(referenceDate)).items.filter(
      (item) => item.active !== false && (item.status === "overdue" || item.status === "due")
    );
    if (dueRecurring.length) {
      const recurringSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      recurringSection.createEl("h4", { text: `Recurring bills due (${dueRecurring.length})` });
      for (const item of dueRecurring.slice(0, 8)) {
        const row = recurringSection.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, item.currency || currency));
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: item.status === "overdue" ? `overdue since ${item.nextDue}` : "due today",
        });
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Log now",
          async () => {
            if (item.variable) {
              new LogVariableBillModal(this.app, this, item, () => this.refreshDailyBudgetView()).open();
              return;
            }
            await this.logRecurringNow(item);
            this.refreshDailyBudgetView();
          },
          { primary: true, errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
        );
      }
    }

    // Triage. The count is the whole backlog, not just this period: an entry
    // from three weeks ago needs a category exactly as much as today's does, and
    // a list capped at the current fortnight hid 20 of the author's 24.
    const inboxGroups = await this.buildCategorisationInbox();
    const backlog = inboxGroups.reduce((sum, group) => sum + group.count, 0);
    if (backlog) {
      const triage = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-tracker-triage" });
      triage.createEl("h4", { text: `Needs a category (${backlog})` });
      const thisPeriod = spendEntries.filter((entry) => !entry.category || entry.category === "uncategorized");
      for (const entry of thisPeriod.slice(0, 6)) {
        const row = triage.createDiv({ cls: "finance-tracker-budget-card is-clickable is-uncategorized" });
        renderRowTitle(row, entry.merchant || entry.date || "Untitled", core.formatCurrency(entry.amount, currency));
        row.addEventListener("click", () => this.openEditTransaction(entry));
      }
      if (backlog > thisPeriod.length) {
        triage.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${backlog - thisPeriod.length} more from earlier, across ${inboxGroups.length} merchant${inboxGroups.length === 1 ? "" : "s"}.`,
        });
      }
      addAction(
        triage.createDiv({ cls: "finance-tracker-header-actions" }),
        "Open inbox",
        () => this.activateInboxView(),
        { primary: true, opensModal: true, errorPrefix: "Opening the inbox" }
      );
    }

  }

  // One sidebar render asks for every transaction about ten times over — split
  // balances, due bills, each savings goal, the merchant history. The per-file
  // index already avoids re-parsing unchanged notes, but each call still walked
  // the whole vault and rebuilt the list. This holds that list until a note
  // actually changes; invalidateIndexEntry drops it.
  //
  // Callers treat the result as read-only: collectTransactionsForRange builds a
  // fresh array each time, and nothing sorts or pushes into what it returns.
  // One card per merchant, not one row per entry: the decision is "what is this
  // shop", and answering it once should settle every capture from it — the ones
  // already logged and the ones still to come.
  async renderCategorisationInboxInto(el, options = {}) {
    el.empty();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-inbox" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: options.title || "Categorisation inbox" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const rerender = () => this.renderCategorisationInboxInto(el, options);
    addAction(headerActions, "Refresh", () => rerender(), { errorPrefix: "Refreshing the inbox" });

    const groups = await this.buildCategorisationInbox();
    const known = await this.collectKnownSuggestions();
    const failed = this.failedCaptureFiles();
    const entryCount = groups.reduce((sum, group) => sum + group.count, 0);
    const suggested = groups.filter((group) => group.suggestion.category);

    if (!groups.length && !failed.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "Nothing waiting — everything logged has a category.",
      });
      return;
    }

    renderStatCards(wrapper, [
      { label: "Entries", value: String(entryCount) },
      { label: "Merchants", value: String(groups.length) },
      {
        label: "Suggested",
        value: String(suggested.length),
        hint: suggested.length ? "one tap each" : "",
      },
      ...(failed.length ? [{ label: "Failed captures", value: String(failed.length), cls: "is-over" }] : []),
    ]);

    if (groups.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Needs a category" });
      for (const group of groups) {
        this.renderInboxGroup(section, group, { currency, known, rerender });
      }
    }

    if (failed.length) await this.renderFailedCaptures(wrapper, failed, rerender);
  }

  renderInboxGroup(host, group, context) {
    const { currency, known, rerender } = context;
    const card = host.createDiv({ cls: "finance-tracker-budget-card finance-inbox-group" });
    renderRowTitle(card, group.label, core.formatCurrency(group.total, currency));

    const dates = group.firstDate === group.lastDate ? group.firstDate : `${group.firstDate} to ${group.lastDate}`;
    card.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${group.count} entr${group.count === 1 ? "y" : "ies"} · ${dates}`,
    });
    // The variants are worth showing: they are why these did not group before.
    if (group.merchants.length > 1) {
      card.createDiv({ cls: "finance-tracker-budget-meta", text: `as written: ${group.merchants.join(" · ")}` });
    }

    const remember = { value: !group.conflicted };
    const apply = async (category) => {
      const updated = await this.applyCategoryToEntries(group.entries, category, {
        remember: remember.value,
        merchant: group.merchant,
      });
      new Notice(`Filed ${updated} entr${updated === 1 ? "y" : "ies"} as ${core.displayCategoryPath(category)}.`);
      await rerender();
    };

    if (group.suggestion.category) {
      const reason = this.describeSuggestionSource(group.suggestion.source);
      card.createDiv({
        cls: "finance-tracker-budget-meta is-suggestion",
        text: `Suggested: ${core.displayCategoryPath(group.suggestion.category)}${reason ? ` — ${reason}` : ""}`,
      });
    }

    const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
    if (group.suggestion.category) {
      addAction(
        actions,
        `File ${group.count} as ${core.displayCategoryPath(group.suggestion.category)}`,
        () => apply(group.suggestion.category),
        { primary: true, errorPrefix: "Filing" }
      );
    }

    const pickerHost = card.createDiv({ cls: "finance-inbox-picker is-hidden" });
    let picker = null;
    addAction(
      actions,
      group.suggestion.category ? "Choose another" : "Choose a category",
      () => {
        pickerHost.toggleClass("is-hidden", !pickerHost.hasClass("is-hidden"));
        if (picker) return;
        picker = new CategoryPicker(pickerHost, {
          categories: known.categories,
          value: group.suggestion.category,
        });
        const pickerActions = pickerHost.createDiv({ cls: "finance-tracker-header-actions" });
        addAction(pickerActions, `File ${group.count}`, () => apply(picker.getValue()), {
          primary: true,
          errorPrefix: "Filing",
        });
      },
      { opensModal: true }
    );

    addToggleAction(
      card,
      group.conflicted ? "Remember (this shop has been filed two ways)" : "Remember this merchant",
      remember.value,
      (checked) => {
        remember.value = checked;
      }
    );

    const details = card.createEl("details", { cls: "finance-inbox-entries" });
    details.createEl("summary", { text: `Show ${group.count} entr${group.count === 1 ? "y" : "ies"}` });
    const sorted = group.entries.slice().sort((left, right) => String(right.date).localeCompare(String(left.date)));
    for (const entry of sorted) {
      const row = details.createDiv({ cls: "finance-tracker-budget-meta is-clickable" });
      row.setText(`${entry.date} · ${core.formatCurrency(entry.amount, currency)} · ${entry.merchant || "(no merchant)"}`);
      row.addEventListener("click", () => this.openEditTransaction(entry));
    }
  }

  // Captures that never became entries. They used to be invisible: a notice at
  // the time, then a file in a folder nobody opens.
  async renderFailedCaptures(wrapper, files, rerender) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: `Captures that failed (${files.length})` });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "These never became entries. Fix whatever sent them, then retry — or dismiss one for good.",
    });

    for (const file of files) {
      const { reason, body } = await this.readFailedCapture(file);
      const card = section.createDiv({ cls: "finance-tracker-budget-card" });
      card.createDiv({ cls: "finance-tracker-budget-title", text: body || file.name });
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: [reason || "No reason recorded", file.name].join(" · "),
      });
      const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
      addAction(
        actions,
        "Retry",
        async () => {
          const result = await this.retryFailedCapture(file);
          new Notice(result.logged ? "Logged." : `Still failing: ${result.reason}`);
          await rerender();
        },
        { primary: true, errorPrefix: "Retrying" }
      );
      let armed = false;
      const dismiss = addAction(
        actions,
        "Dismiss",
        async () => {
          // Deleting is final, so the button asks once rather than relying on a
          // modal nobody reads.
          if (!armed) {
            armed = true;
            dismiss.setText("Delete this capture?");
            dismiss.disabled = false;
            return;
          }
          await this.app.vault.delete(file);
          await rerender();
        },
        { warning: true, errorPrefix: "Dismissing" }
      );
    }
  }

  async collectAllTransactions() {
    if (this._allTransactions) return this._allTransactions;
    const entries = await this.collectTransactionsForRange({ period: "all", start: "1900-01-01", end: "2999-12-31" });
    this._allTransactions = entries;
    return entries;
  }

  // Appends raw finance lines (already tab-indented as needed) to the end of a
  // daily note's finance section, creating the note and heading when missing,
  // then heals the running total.
  async appendFinanceLines(date, newLines) {
    const notePath = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(notePath);
    const file = existing instanceof TFile ? existing : await this.createDailyNoteFromTemplate(notePath, date);
    const content = await this.app.vault.cachedRead(file);
    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    // The configured heading first, then whatever this note already uses, so a
    // note still headed "## Spending" gains lines in that section rather than a
    // second one below it.
    let headingIndex = core.findFinanceHeadingIndex(lines, this.settings.spendingHeading || "## Finance");
    if (headingIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push(this.settings.spendingHeading || "## Finance");
      lines.push(`- [ ] ${this.settings.spendingRootTag || "#log/spending"} 0`);
      headingIndex = lines.length - 2;
    }
    // The daily template ships the heading already present but empty, so the
    // branch above never runs on a real note and the root line never appeared.
    // Without it recomputeSpendingTotals bails out (no total is ever written)
    // and the tab-indented bullets below have no parent list item — markdown
    // then renders them as an indented code block rather than a nested list.
    const rootTag = this.settings.spendingRootTag || "#log/spending";
    const rootRe = new RegExp(`^- \\[[^\\]]\\] ${rootTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
    let hasRoot = false;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (/^#{1,6}\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) break;
      if (rootRe.test(trimmed)) {
        hasRoot = true;
        break;
      }
    }
    if (!hasRoot) lines.splice(headingIndex + 1, 0, `- [ ] ${rootTag} 0`);
    let sectionEnd = lines.length;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (/^#{1,6}\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) {
        sectionEnd = index;
        break;
      }
    }
    let insertIndex = sectionEnd;
    while (insertIndex > headingIndex + 1 && !lines[insertIndex - 1].trim()) insertIndex -= 1;
    lines.splice(insertIndex, 0, ...newLines);
    const next = core.recomputeSpendingTotals(lines.join("\n"), this.settings);
    await _ftModify(this.app, file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    return file;
  }

  // --- Categorisation inbox -----------------------------------------------------

  // Everything still uncategorised, grouped by merchant root and carrying a
  // suggestion. Grouping is the point: twelve rows of "SQ * Rode Fresh" are one
  // decision, and the sidebar's date-limited list could never show them anyway.
  async buildCategorisationInbox() {
    const entries = (await this.collectAllTransactions()).filter(
      (entry) => core.isSpendingEntry(entry) && (!entry.category || entry.category === "uncategorized")
    );
    const sources = await this.merchantSuggestionSources();
    const conflicts = this.merchantRootConflicts(sources.history);

    return core.groupEntriesByMerchantRoot(entries).map((group) => {
      // The most recent spelling is the one to ask about.
      const latest = group.entries.reduce(
        (newest, entry) => (String(entry.date || "") >= String(newest.date || "") ? entry : newest),
        group.entries[0] || {}
      );
      const merchant = latest.merchant || group.merchants[0] || "";
      return {
        ...group,
        merchant,
        suggestion: core.suggestCategoryForMerchant(merchant, sources),
        // Where the same shop has been filed two different ways, remembering a
        // rule would overrule a distinction you drew on purpose.
        conflicted: (conflicts.get(group.key)?.size || 0) > 1,
      };
    });
  }

  // Has this shop been filed more than one way? Used for the "remember" default:
  // where you have drawn a distinction on purpose (Bagel Boys as breakfast and
  // as lunch), a rule would quietly overrule it.
  async merchantHasConflictingHistory(merchant) {
    const root = core.merchantRootKey(merchant || "");
    if (!root) return false;
    const sources = await this.merchantSuggestionSources();
    return (this.merchantRootConflicts(sources.history).get(root)?.size || 0) > 1;
  }

  merchantRootConflicts(history) {
    const byRoot = new Map();
    for (const [key, info] of history || []) {
      const root = core.merchantRootKey(info?.name || key);
      if (!root) continue;
      const seen = byRoot.get(root) || new Set();
      seen.add(info?.category || "");
      byRoot.set(root, seen);
    }
    return byRoot;
  }

  // Writes one category across a set of entries, note by note. Entries are found
  // by their exact raw line, so an edit elsewhere in the note cannot shift them,
  // and each note is written once however many of its lines changed.
  async applyCategoryToEntries(entries, category, options = {}) {
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!cleanCategory) throw new Error("Pick a category first.");

    const byFile = new Map();
    for (const entry of entries || []) {
      const list = byFile.get(entry.filePath) || [];
      list.push(entry);
      byFile.set(entry.filePath, list);
    }

    let updated = 0;
    for (const [path, list] of byFile) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      let content = await this.app.vault.cachedRead(file);
      // Bottom-up, so replacing one entry cannot shift the line another is at.
      const ordered = list.slice().sort((left, right) => (right.lineIndex ?? -1) - (left.lineIndex ?? -1));
      for (const entry of ordered) {
        const next = core.replaceTransactionBlock(
          content,
          entry.rawLine,
          { ...entry, category: cleanCategory },
          this.settings,
          { lineIndex: entry.lineIndex }
        );
        if (next == null) continue;
        content = next;
        updated += 1;
      }
      await _ftModify(this.app, file, content);
      this.invalidateIndexEntry(path);
    }

    if (options.remember && options.merchant) {
      await this.rememberMerchantCategory(options.merchant, cleanCategory);
    }
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    this.refreshInboxView();
    return updated;
  }

  openRecategorise(category = "") {
    const modal = new RecategoriseModal(this.app, this, { category });
    modal.open();
    return modal;
  }

  // --- Tidying up the old bill model ---------------------------------------------

  async planRecurringCleanup() {
    const payload = [];
    for (const file of this.getDailyNoteFiles()) {
      payload.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const plan = core.planNoteRewrite(
      payload,
      core.buildRecurringCleanupTransform({
        prefix: this.settings.recurringTagPrefix || "subscriptions",
        defaultCurrency: this.settings.defaultCurrency,
        heading: this.settings.spendingHeading,
        spendingRootTag: this.settings.spendingRootTag,
      })
    );

    // The registry keeps a row for every bill it has ever seen, including the
    // phantom "Skipped This Cycle" one the old nameless skip lines minted.
    const registryPlan = await this.planStaleRegistryRows();
    return {
      files: [...plan.files, ...registryPlan.files],
      samples: [...plan.samples, ...registryPlan.samples].slice(0, 5),
      warnings: [...plan.warnings, ...registryPlan.warnings],
      totals: {
        files: plan.totals.files + registryPlan.totals.files,
        entries: plan.totals.entries + registryPlan.totals.entries,
        warnings: plan.totals.warnings + registryPlan.totals.warnings,
      },
    };
  }

  // Ghost registry rows: the "Skipped This Cycle" one the old nameless skip lines
  // minted, and any other row with no history and no amount.
  //
  // Deliberately narrow. A row with an amount and no history is a bill set up
  // before its first payment — the author has one for car registration, $795 a
  // year, logged nowhere yet — and dropping that would throw away the setup.
  async planStaleRegistryRows() {
    const file = this.app.vault.getAbstractFileByPath(this.getRecurringNotePath());
    if (!(file instanceof TFile)) return { files: [], samples: [], warnings: [], totals: { files: 0, entries: 0, warnings: 0 } };
    const content = await this.app.vault.cachedRead(file);
    const detected = new Set(
      core
        .detectRecurringPayments(await this.collectAllTransactions(), {
          prefix: this.settings.recurringTagPrefix || "subscriptions",
        })
        .items.map((item) => item.name)
    );

    return core.planNoteRewrite([{ path: file.path, content }], (noteContent) => {
      const lines = String(noteContent).replace(/\r\n/g, "\n").split("\n");
      const keep = [];
      const warnings = [];
      const samples = [];
      let removed = 0;
      for (const line of lines) {
        const isRow = /^\s*\|/.test(line) && !/^\s*\|?[\s:-]+\|/.test(line);
        const cells = isRow ? line.split("|").slice(1, -1).map((cell) => cell.trim()) : [];
        const name = isRow ? core.normalizeCategoryPath(cells[0] || "") : "";
        const amount = core.parseNumber(cells[2] || "");
        const isGhost = !detected.has(name) && (!(amount > 0) || /^skipped/.test(name));
        if (name && name !== "item" && isGhost) {
          removed += 1;
          warnings.push({ line: line.trim(), reason: "no payments and no amount — a leftover row" });
          if (samples.length < 2) samples.push({ before: line.trim(), after: "(row removed)" });
          continue;
        }
        keep.push(line);
      }
      return { content: keep.join("\n"), entries: removed, samples, warnings };
    });
  }

  async openRecurringCleanup() {
    const plan = await this.planRecurringCleanup();
    new RewritePreviewModal(this.app, this, {
      title: "Tidy up recurring payments",
      intro:
        "Removes same-day duplicate bill charges — the same bill logged twice because wording variants were each treated as their own bill — along with the old $0 skip markers and registry rows for bills that no longer exist.",
      plan,
      warningsLabel: "Lines being removed",
      emptyText: "Nothing to tidy up.",
      applyLabel: `Remove ${plan.totals.entries} line${plan.totals.entries === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        new Notice(
          `Tidied ${written} note${written === 1 ? "" : "s"}${
            skipped.length ? `. ${skipped.length} changed since the preview and were left alone` : ""
          }.`
        );
      },
    }).open();
  }

  // --- Recategorising ---------------------------------------------------------

  // Everything filed under a category, grouped by merchant. A category rarely
  // needs renaming wholesale: bare "transport" in the author's vault is six
  // Translink trips, five rideshares, three Lime scooters and a car park, and
  // the merchant is what says which is which.
  async buildCategoryBreakdown(category) {
    const target = core.normalizeCategoryPath(category);
    if (!target) return { entries: [], groups: [] };
    const entries = (await this.collectAllTransactions()).filter(
      (entry) => core.isSpendingEntry(entry) && (entry.category === target || entry.category.startsWith(`${target}/`))
    );
    return { entries, groups: core.groupEntriesByMerchantRoot(entries) };
  }

  // Plans a set of per-entry category changes, plus the table cells that point at
  // the old path. Nothing is written: this is what the preview shows.
  async planCategoryAssignments(assignments, options = {}) {
    const byPath = new Map();
    for (const assignment of assignments || []) {
      const category = core.normalizeCategoryPath(assignment?.category);
      if (!category) continue;
      for (const entry of assignment.entries || []) {
        if (entry.category === category) continue;
        const list = byPath.get(entry.filePath) || [];
        list.push({ entry, category });
        byPath.set(entry.filePath, list);
      }
    }

    const files = [];
    for (const path of byPath.keys()) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      files.push({ path, content: await this.app.vault.cachedRead(file) });
    }

    const settings = this.settings;
    const plan = core.planNoteRewrite(files, (content, path) => {
      // Bottom-up, so rewriting one entry cannot shift the line another sits at.
      const changes = (byPath.get(path) || [])
        .slice()
        .sort((left, right) => (right.entry.lineIndex ?? -1) - (left.entry.lineIndex ?? -1));
      let next = content;
      let entries = 0;
      const samples = [];
      for (const { entry, category } of changes) {
        const expense = { ...entry, category };
        const replaced = core.replaceTransactionBlock(next, entry.rawLine, expense, settings, { lineIndex: entry.lineIndex });
        if (replaced == null) continue;
        if (samples.length < 3) {
          samples.push({ before: entry.rawLine.trim(), after: core.buildTransactionBlock(expense, settings)[0].trim() });
        }
        next = replaced;
        entries += 1;
      }
      return { content: next, entries, samples };
    });

    const tableRenames = options.tableRenames || [];
    if (!tableRenames.length) return plan;

    const tableFiles = [];
    for (const file of this.categoryReferenceFiles()) {
      tableFiles.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const tablePlan = core.planNoteRewrite(tableFiles, core.buildCategoryTableRenameTransform(tableRenames));

    return {
      files: [...plan.files, ...tablePlan.files],
      samples: [...plan.samples, ...tablePlan.samples].slice(0, 5),
      warnings: [...plan.warnings, ...tablePlan.warnings],
      totals: {
        files: plan.totals.files + tablePlan.totals.files,
        entries: plan.totals.entries + tablePlan.totals.entries,
        warnings: plan.totals.warnings + tablePlan.totals.warnings,
      },
    };
  }

  // Notes that mention categories outside the daily notes: the budgets table and
  // every goal or trip note with planned and allocated tables.
  categoryReferenceFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
  }

  // Merchant rules point at categories too.
  async renameCategoryInMerchantMap(renames) {
    const map = { ...(this.settings.merchantMap || {}) };
    let changed = 0;
    for (const [merchant, category] of Object.entries(map)) {
      for (const { from, to } of renames || []) {
        const cleanFrom = core.normalizeCategoryPath(from);
        const cleanTo = core.normalizeCategoryPath(to);
        if (!cleanFrom || !cleanTo) continue;
        if (category === cleanFrom) {
          map[merchant] = cleanTo;
          changed += 1;
        } else if (category.startsWith(`${cleanFrom}/`)) {
          map[merchant] = `${cleanTo}/${category.slice(cleanFrom.length + 1)}`;
          changed += 1;
        }
      }
    }
    if (!changed) return 0;
    this.settings.merchantMap = map;
    this._merchantSources = null;
    await this.saveSettings();
    return changed;
  }

  // --- Failed captures ------------------------------------------------------------

  failedCaptureFiles() {
    const folder = normalizePath(`${this.settings.captureInboxFolder || ""}/_failed`);
    if (!folder) return [];
    const prefix = `${folder}/`;
    return this.app.vault.getFiles().filter((file) => file.path.startsWith(prefix));
  }

  async readFailedCapture(file) {
    const raw = await this.app.vault.cachedRead(file);
    const lines = String(raw).split("\n");
    const reason = (lines[0].match(/finance-capture error:\s*(.*?)\s*-->/) || [])[1] || "";
    return { file, reason, body: lines.slice(1).join("\n").trim() };
  }

  // Retries a quarantined capture without re-quarantining it: a line that still
  // will not parse stays exactly where it is, with its original reason.
  async retryFailedCapture(file) {
    const { body } = await this.readFailedCapture(file);
    const params = core.parseInboxLine(body);
    if (!params) return { logged: 0, reason: "Still nothing to parse in this line." };
    try {
      const expense = this.parseCaptureParams(params);
      const result = await this.handleCaptureExpense(expense, { notify: false, method: "inbox" });
      if (result.skipped) return { logged: 0, reason: this.describeSkippedCapture(result) };
      await this.app.vault.delete(file);
      this.refreshInboxView();
      return { logged: 1, reason: "" };
    } catch (error) {
      return { logged: 0, reason: error?.message || String(error) };
    }
  }

  // --- Bills -------------------------------------------------------------------
  // One note per bill, in a Bills folder beside the budgets. Notes rather than a
  // table because a bill has ten fields and a table with eleven columns is not
  // hand-editable, and because Obsidian's own properties editor then works on
  // them — including on a phone.

  getBillsFolderPath() {
    return normalizePath(`${this.settings.budgetsFolderPath}/Bills`);
  }

  async loadBills(options = {}) {
    const prefix = `${this.getBillsFolderPath()}/`;
    const bills = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const content = await this.app.vault.cachedRead(file);
      const bill = core.parseBillDefinition(parseFrontmatter(content), {
        defaultCurrency: this.settings.defaultCurrency,
        notePath: file.path,
      });
      // A merged bill's note is kept as a record, but it no longer claims
      // payments — the bill it was merged into does, through the alias.
      if (bill && (!bill.mergedInto || options.includeMerged)) bills.push(bill);
    }
    return bills.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findBill(billId) {
    const id = core.normalizeBillId(billId);
    return (await this.loadBills()).find((bill) => bill.id === id) || null;
  }

  buildBillFrontmatter(bill) {
    const value = (input) => (input === null || input === undefined ? "" : String(input));
    return [
      "---",
      `bill_id: ${bill.id}`,
      `bill_name: ${bill.name}`,
      `aliases: [${(bill.aliases || []).join(", ")}]`,
      `cadence: ${bill.cadence}`,
      `due_rule: ${core.serializeBillDueRule(bill.dueRule)}`,
      `amount: ${value(bill.amount)}`,
      `amount_model: ${bill.amountModel || "fixed"}`,
      `reminder_days: ${value(bill.reminderDays ?? 3)}`,
      `active: ${bill.active === false ? "false" : "true"}`,
      `auto_log: ${bill.autoLog ? "true" : "false"}`,
      `next_amount: ${value(bill.nextAmount)}`,
      `change_date: ${value(bill.changeDate)}`,
      `end_date: ${value(bill.endDate)}`,
      `payments_left: ${value(bill.paymentsLeft)}`,
      `next_due: ${value(bill.nextDueOverride)}`,
      `skipped: [${(bill.skipped || []).join(", ")}]`,
      `start_date: ${value(bill.startDate)}`,
      `currency: ${bill.currency || this.settings.defaultCurrency}`,
      ...(bill.mergedInto ? [`merged_into: ${bill.mergedInto}`] : []),
      "---",
    ].join("\n");
  }

  buildBillNoteContent(bill) {
    return [
      this.buildBillFrontmatter(bill),
      "",
      `# ${bill.name}`,
      "",
      "Everything about this bill lives in the properties above — edit them here or",
      "from the Bills list. Payments are the entries tagged",
      `\`#log/spending/${this.settings.recurringTagPrefix || "subscriptions"}/${bill.cadence}/${bill.id}\`, plus anything`,
      "matching an alias.",
      "",
      "```finance-bill",
      "```",
      "",
    ].join("\n");
  }

  billNotePath(bill) {
    return normalizePath(`${this.getBillsFolderPath()}/${sanitizeFilePart(bill.name || bill.id)}.md`);
  }

  // Writes a bill note, keeping whatever the user has written below the
  // properties — notes, a receipt, the phone number for cancelling.
  async saveBill(bill) {
    const path = bill.notePath || this.billNotePath(bill);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const content = await this.app.vault.cachedRead(existing);
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
      await _ftModify(this.app, existing, `${this.buildBillFrontmatter(bill)}\n${body}`);
      return existing;
    }
    await this.ensureFolder(this.getBillsFolderPath());
    return this.upsertFile(path, this.buildBillNoteContent(bill));
  }

  async updateBill(billId, patch = {}) {
    const bill = await this.findBill(billId);
    if (!bill) throw new Error(`No bill note found for ${billId}.`);
    const next = { ...bill, ...patch };
    await this.saveBill(next);
    this.refreshDailyBudgetView();
    return next;
  }

  // The move from the registry to bill notes. Planned from what the old model
  // detected, with duplicates merged and removed bills kept as ended ones, and
  // shown in full before a single note is created.
  async planBillMigration(referenceDate = core.todayIsoLocal()) {
    const entries = await this.collectAllTransactions();
    const prefix = this.settings.recurringTagPrefix || "subscriptions";
    const detected = core.detectRecurringPayments(entries, { prefix, referenceDate });
    const applied = core.applyRecurringRegistry(detected, await this.loadRecurringRegistry(), referenceDate);
    const planned = core.planBillsFromLegacy(applied.items, {
      excluded: this.settings.excludedRecurringItems || [],
      referenceDate,
      defaultCurrency: this.settings.defaultCurrency,
    });

    const existing = new Set((await this.loadBills()).map((bill) => bill.id));
    const files = [];
    const samples = [];
    const warnings = [];
    for (const bill of planned) {
      if (existing.has(bill.id)) continue;
      const path = this.billNotePath(bill);
      files.push({ path, before: "", after: this.buildBillNoteContent(bill), entries: 1, create: true });
      if (bill.mergedFrom.length && samples.length < 5) {
        samples.push({
          before: [bill.id, ...bill.mergedFrom].join(", "),
          after: `${bill.name} — one bill, ${bill.payments} payments`,
        });
      }
      if (bill.retired) {
        warnings.push({
          line: `${bill.name} · ${cadenceLabel(bill.cadence)} · ${core.formatCurrency(bill.amount, bill.currency)}`,
          reason: `ended ${bill.endDate || "(no payments)"} — kept with its history, not tracked as due`,
        });
      }
    }

    return {
      planned,
      plan: {
        files,
        samples,
        warnings,
        totals: { files: files.length, entries: files.length, warnings: warnings.length },
      },
    };
  }

  async openBillMigration() {
    const { planned, plan } = await this.planBillMigration();
    const live = planned.filter((bill) => !bill.retired).length;
    const merged = planned.reduce((sum, bill) => sum + bill.mergedFrom.length, 0);
    new RewritePreviewModal(this.app, this, {
      title: "Convert recurring payments to bill notes",
      intro: `${planned.length} bill${planned.length === 1 ? "" : "s"}: ${live} running, ${planned.length - live} ended.${
        merged ? ` ${merged} duplicate wording${merged === 1 ? " is" : "s are"} merged into the bill they belong to.` : ""
      } Each becomes a note in ${this.getBillsFolderPath()}; your daily notes are not touched.`,
      plan,
      warningsLabel: "Ended bills",
      emptyText: "Every bill already has a note.",
      applyLabel: `Create ${plan.totals.files} bill note${plan.totals.files === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        this.refreshDailyBudgetView();
        new Notice(
          `Created ${written} bill note${written === 1 ? "" : "s"}${skipped.length ? `, ${skipped.length} already existed` : ""}.`
        );
      },
    }).open();
  }

  // Registry-shaped patches from the existing UI, translated for a bill note.
  billPatchFromItemPatch(patch = {}) {
    const next = {};
    if ("active" in patch) next.active = patch.active;
    if ("autoLog" in patch) next.autoLog = patch.autoLog;
    if ("variable" in patch) next.amountModel = patch.variable ? "variable" : "fixed";
    if ("amount" in patch) next.amount = patch.amount;
    if ("nextAmount" in patch) next.nextAmount = patch.nextAmount;
    if ("changeDate" in patch) next.changeDate = patch.changeDate;
    if ("nextDue" in patch) next.nextDueOverride = patch.nextDue;
    if ("endDate" in patch) next.endDate = patch.endDate;
    if ("paymentsLeft" in patch) next.paymentsLeft = patch.paymentsLeft;
    if ("name" in patch) next.name = patch.name;
    if ("aliases" in patch) next.aliases = patch.aliases;
    if ("dueRule" in patch) next.dueRule = patch.dueRule;
    if ("reminderDays" in patch) next.reminderDays = patch.reminderDays;
    return next;
  }

  // One entry point for every per-bill change, whichever model is in play.
  openEditBill(item, onSaved) {
    const modal = new EditRecurringItemModal(this.app, this, item, onSaved);
    modal.open();
    return modal;
  }

  async updateRecurringItem(item, patch = {}) {
    if (item?.billId) {
      await this.updateBill(item.billId, this.billPatchFromItemPatch(patch));
      return;
    }
    await this.updateRecurringRegistryEntry(item, patch);
  }

  // Merging is how a duplicate is dealt with now: the loser's name becomes an
  // alias of the winner, so its history joins up instead of being hidden.
  async mergeBillInto(sourceItem, targetBillId) {
    const target = await this.findBill(targetBillId);
    if (!target) throw new Error("That bill no longer exists.");
    const names = [sourceItem.billId, sourceItem.label, sourceItem.merchant, sourceItem.name].filter(Boolean);
    const aliases = Array.from(new Set([...(target.aliases || []), ...names.map((name) => String(name).trim())]));
    await this.saveBill({ ...target, aliases });

    if (sourceItem.billId && sourceItem.notePath) {
      const file = this.app.vault.getAbstractFileByPath(sourceItem.notePath);
      // The merged bill's note is archived rather than deleted: it may hold
      // notes of your own, and deleting a note is not this plugin's decision.
      if (file instanceof TFile) {
        const bill = await this.findBill(sourceItem.billId);
        if (bill) await this.saveBill({ ...bill, active: false, mergedInto: target.id });
      }
    }
    this.refreshDailyBudgetView();
  }

  // --- Recurring payments -----------------------------------------------------

  async detectRecurring(referenceDate, prefix = "") {
    const entries = await this.collectAllTransactions();
    const today = referenceDate || core.todayIsoLocal();
    const activePrefix = prefix || this.settings.recurringTagPrefix || "subscriptions";

    // Once there are bill notes, they are the source of truth and detection is
    // only a source of suggestions. Until then — a fresh install, or one that
    // has not run the migration — the old path still works exactly as it did.
    const bills = await this.loadBills();
    if (bills.length) {
      const view = core.buildBillsView(bills, entries, { prefix: activePrefix, referenceDate: today });
      return { ...view, billsMode: true, items: this.sortRecurringItems(view.items) };
    }

    const detected = core.detectRecurringPayments(entries, { prefix: activePrefix, referenceDate: today });
    const applied = core.applyRecurringRegistry(detected, await this.loadRecurringRegistry(), today);
    const excluded = this.excludeRemovedRecurringItems(applied);
    return { ...excluded, items: this.sortRecurringItems(excluded.items), suggestions: [], unmatched: [] };
  }

  // Bills the user chose to "remove completely" from the Archived section
  // never resurface, even though detection is tag-driven off history — this
  // filter is the one place every consumer (settings, the dashboard block,
  // auto-logging) shares, so a single exclusion list covers all of them.
  excludeRemovedRecurringItems(applied) {
    const excluded = new Set(this.settings.excludedRecurringItems || []);
    if (!excluded.size) return applied;
    const items = applied.items.filter((item) => !excluded.has(item.name));
    // The totals have to be recomputed, not carried over. They were not, so a
    // bill you removed for good still counted toward cost per month, cost per
    // year, and everything downstream of them — in the author's vault twelve
    // removed duplicates, most of a thousand dollars a month of bills that do
    // not exist.
    const active = items.filter((item) => item.active !== false);
    return {
      ...applied,
      items,
      totals: {
        monthly: core.roundCurrencyAmount(active.reduce((sum, item) => sum + Number(item.monthlyCost || 0), 0)),
        yearly: core.roundCurrencyAmount(active.reduce((sum, item) => sum + Number(item.yearlyCost || 0), 0)),
      },
    };
  }

  // "Due date" (the default) keeps finance-core's own ordering — overdue
  // first, then due, then upcoming, each by next-due date ascending. The
  // other orders are a flat re-sort layered on top, shared by every consumer
  // (dashboard block, sidebar due-bills card, settings list) since they all
  // go through detectRecurring.
  sortRecurringItems(items) {
    const order = this.settings.recurringSortOrder || "dueDate";
    if (order === "dueDate") return items;
    const sorted = [...items];
    if (order === "amountDesc") sorted.sort((a, b) => (b.lastAmount || 0) - (a.lastAmount || 0));
    else if (order === "amountAsc") sorted.sort((a, b) => (a.lastAmount || 0) - (b.lastAmount || 0));
    else if (order === "nameAsc") sorted.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
    else if (order === "monthlyCostDesc") sorted.sort((a, b) => (b.monthlyCost || 0) - (a.monthlyCost || 0));
    return sorted;
  }

  async removeRecurringItemCompletely(item) {
    const excluded = new Set(this.settings.excludedRecurringItems || []);
    excluded.add(item.name);
    this.settings.excludedRecurringItems = Array.from(excluded);
    await this.saveSettings();
  }

  getRecurringNotePath() {
    return normalizePath(`${this.settings.budgetsFolderPath}/${this.settings.recurringNoteName || DEFAULT_SETTINGS.recurringNoteName}`);
  }

  async loadRecurringRegistry() {
    const file = this.app.vault.getAbstractFileByPath(this.getRecurringNotePath());
    if (!(file instanceof TFile)) return new Map();
    return core.parseRecurringRegistry(await this.app.vault.cachedRead(file));
  }

  // Upserts one row of the hand-editable registry table in the recurring
  // payments note — the markdown stays the source of truth for per-bill state.
  async updateRecurringRegistryEntry(item, patch = {}) {
    await this.ensureBudgetInfrastructure();
    const file = await this.ensureTextFile(this.getRecurringNotePath(), () => this.buildRecurringNoteContent());
    const content = await this.app.vault.cachedRead(file);
    const registry = core.parseRecurringRegistry(content);
    const current = registry.get(item.name) || {};
    const active = patch.active ?? (current.active !== false);
    const autoLog = patch.autoLog ?? (current.autoLog === null || current.autoLog === undefined ? item.autoLog !== false : current.autoLog);
    const variable = patch.variable ?? Boolean(current.variable);
    const amount = patch.amount !== undefined ? patch.amount : current.amount > 0 ? current.amount : item.lastAmount;
    const amountCell = core.formatPlainNumber(amount);
    const nextAmount = patch.nextAmount !== undefined ? patch.nextAmount : current.nextAmount;
    const changeDate = patch.changeDate !== undefined ? patch.changeDate : current.changeDate;
    const nextDue = patch.nextDue !== undefined ? patch.nextDue : current.nextDue;
    const endDate = patch.endDate !== undefined ? patch.endDate : current.endDate;
    const paymentsLeft = patch.paymentsLeft !== undefined ? patch.paymentsLeft : current.paymentsLeft;
    const row = `| ${[
      item.name,
      item.cadence,
      amountCell,
      active ? "yes" : "no",
      autoLog ? "yes" : "no",
      variable ? "yes" : "no",
      nextAmount > 0 ? core.formatPlainNumber(nextAmount) : "",
      changeDate || "",
      nextDue || "",
      endDate || "",
      Number.isFinite(paymentsLeft) && paymentsLeft !== null ? String(paymentsLeft) : "",
    ].join(" | ")} |`;

    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    const headerIndex = lines.findIndex(
      (line) => /^\s*\|/.test(line) && /\bitem\b/i.test(line) && /\bactive\b/i.test(line)
    );
    if (headerIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push("## Registry");
      lines.push("");
      lines.push(...RECURRING_REGISTRY_HELP);
      lines.push("");
      lines.push(core.RECURRING_REGISTRY_HEADER_ROW);
      lines.push(core.RECURRING_REGISTRY_SEPARATOR_ROW);
      lines.push(row);
      lines.push("");
    } else {
      // Older notes have a narrower table — widen the header and every existing
      // row in place so the table stays one consistent width and
      // parseMarkdownTable keeps matching every row. Column counts seen in the
      // wild: 5 (original), 7 (+ Next Amount/Change Date), 8 (+ Next Due), 9
      // (+ Variable), 11 (+ End Date/Payments Left). Variable slots in at
      // position 5 (0-indexed), ahead of the columns added after it, so those
      // need shifting rather than just padding.
      const width = core.RECURRING_REGISTRY_COLUMNS.length;
      if (lines[headerIndex].split("|").length - 2 < width) {
        lines[headerIndex] = core.RECURRING_REGISTRY_HEADER_ROW;
        lines[headerIndex + 1] = core.RECURRING_REGISTRY_SEPARATOR_ROW;
        for (let index = headerIndex + 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
          const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
          if (cells.length === 5 || cells.length === 7 || cells.length === 8) cells.splice(5, 0, "");
          while (cells.length < width) cells.push("");
          lines[index] = `| ${cells.slice(0, width).join(" | ")} |`;
        }
      }

      let insertAt = headerIndex + 2;
      let replaced = false;
      for (let index = headerIndex + 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
        insertAt = index + 1;
        const firstCell = core.normalizeCategoryPath(lines[index].split("|")[1] || "");
        if (firstCell === item.name) {
          lines[index] = row;
          replaced = true;
          break;
        }
      }
      if (!replaced) lines.splice(insertAt, 0, row);
    }
    await _ftModify(this.app, file, lines.join("\n"));
    // Every per-bill state change funnels through here — Push a week, Skip
    // cycle, Pause, Edit, auto-log and advanceRecurringSchedule. The sidebar's
    // due-bills card reads this registry but sits outside the block-local
    // rerender(), and the vault modify hook ignores both self-writes and
    // anything outside the daily-notes folder, so without this the card kept
    // showing pre-change state (a pushed bill still reading "overdue since").
    this.refreshDailyBudgetView();
  }

  // The tag a logged payment carries has to name its bill. Log now and auto-log
  // used to write the bare `subscriptions/<cadence>` tag the bill was detected
  // from, so every payment the plugin logged itself kept the identity problem
  // alive: the next parse had only the child line to go on, and a different
  // wording there minted a different bill. Skips were fixed in 0.8.0; logging
  // was not.
  recurringPaymentTag(item) {
    const category = core.normalizeCategoryPath(item.category || "");
    const named = category && item.name && !category.endsWith(`/${item.name}`) ? `${category}/${item.name}` : category;
    return named ? core.buildCategoryTag(named) : item.tag;
  }

  async logRecurringItem(item, date, amountOverride) {
    const amount = Number.isFinite(amountOverride) && amountOverride > 0 ? amountOverride : item.lastAmount;
    const logDate = date || core.todayIsoLocal();
    const bullet = [`\t- ${core.formatCurrency(amount, item.currency || this.settings.defaultCurrency)} ${this.recurringPaymentTag(item)}`];
    if (item.merchant) bullet.push(`\t\t- ${item.merchant}`);
    // No separate runway deduction is written: computeRunwayBalance derives the
    // draw-down from this very bullet, so there is only ever one line per bill.
    return this.appendFinanceLines(logDate, bullet);
  }

  // Shared "Log now" behavior for both the finance-recurring block and the
  // sidebar's due-bills card: logs on the real date it was actually paid, but
  // advances the schedule from the due date just fulfilled (not from today),
  // so a late payment never drifts the cadence. `amountOverride` is used for
  // variable bills, where the caller has already prompted for the real amount
  // rather than repeating the projected/average one.
  async logRecurringNow(item, amountOverride) {
    const logDate = core.todayIsoLocal();
    await this.logRecurringItem(item, logDate, amountOverride);
    await this.advanceRecurringSchedule(item);
    return logDate;
  }

  // Moves a bill on by exactly one cycle after it has been logged: the next-due
  // anchor steps forward, and a Payments Left countdown ticks down (reaching 0
  // retires the bill in applyRecurringRegistry). Shared by Log now, Pay from
  // reserve, Skip cycle, and the catch-up logger, so no path can advance one of
  // the two and forget the other.
  async advanceRecurringSchedule(item, patch = {}) {
    if (item?.billId) {
      // The payment that was just logged is what advances the schedule, so there
      // is no anchor to write. Only a countdown, and an override that has now
      // been overtaken, need saving.
      const updates = {};
      if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
        updates.paymentsLeft = Math.max(0, item.paymentsLeft - 1);
      }
      if (item.usedOverride) updates.nextDueOverride = null;
      const billPatch = { ...updates, ...this.billPatchFromItemPatch(patch) };
      if (Object.keys(billPatch).length) await this.updateBill(item.billId, billPatch);
      return;
    }

    const next = {};
    if (item.nextDue) next.nextDue = core.nextRecurringDate(item.nextDue, item.cadence);
    if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
      next.paymentsLeft = Math.max(0, item.paymentsLeft - 1);
    }
    if (!Object.keys(next).length && !Object.keys(patch).length) return;
    await this.updateRecurringRegistryEntry(item, { ...next, ...patch });
  }

  // Logs every recurring item whose next-due date has arrived, dated on the due
  // day so the cadence anchor never drifts. Loops so an item several periods
  // behind catches all the way up.
  async logDueRecurringPayments(options = {}) {
    // A reference date is only ever passed by tests; the plugin logs up to today.
    const today = core.parseIsoDate(options.referenceDate) || core.todayIsoLocal();
    let logged = 0;
    for (let pass = 0; pass < 24; pass += 1) {
      const recurring = await this.detectRecurring(today);
      const due = recurring.items.filter(
        (item) =>
          item.nextDue &&
          item.nextDue <= today &&
          item.active !== false &&
          (!options.autoOnly || item.autoLog !== false)
      );
      if (!due.length) break;
      for (const item of due) {
        await this.logRecurringItem(item, item.nextDue);
        // Keep any Next Due override advancing too — otherwise a stale
        // override would never move forward and the item would look
        // perpetually (re-)due on every future pass/check.
        await this.advanceRecurringSchedule(item);
        logged += 1;
      }
    }
    if (options.notify !== false && (logged > 0 || !options.autoOnly)) {
      new Notice(logged > 0 ? `Finance: logged ${logged} recurring payment${logged === 1 ? "" : "s"}` : "No recurring payments are due.");
    }
    if (logged > 0) this.refreshDailyBudgetView();
    return logged;
  }

  // A month-grid view of when the bills actually land, built the same way as
  // the trip's planned-expenses calendar: dots per day, click a day for the
  // detail. Seeing the cluster is the point — a list sorted by due date hides
  // that three bills all fall on the 10th. Occurrences come from the same
  // projection the runway uses, so a repriced cycle shows its new amount here.
  renderRecurringCalendar(wrapper, recurring, currency, referenceDate, options = {}) {
    const RANGE_CHOICES = [
      { label: "1 month", months: 1 },
      { label: "3 months", months: 3 },
      { label: "12 months", months: 12 },
    ];
    const normalizeMonths = (value) => {
      const months = Number(value);
      if (!Number.isFinite(months)) return null;
      // Snap to the nearest offered range so a hand-typed `months: 2` still
      // lands on something the buttons can show as selected.
      return RANGE_CHOICES.reduce(
        (best, choice) => (Math.abs(choice.months - months) < Math.abs(best - months) ? choice.months : best),
        RANGE_CHOICES[0].months
      );
    };
    // Block config wins, then the setting, then three months.
    let activeMonths =
      normalizeMonths(options.months) ??
      (Number.isFinite(options.weeks) && options.weeks > 0 ? normalizeMonths(Math.round(options.weeks / 4.345)) : null) ??
      normalizeMonths(this.settings?.paymentCalendarMonths) ??
      3;

    const weekStartsOn = this.settings?.weekStartsOn === "sunday" ? "sunday" : "monday";
    const weekdayLabels = weekStartsOn === "sunday"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const thisWeek = core.toPeriodRange({ period: "week", referenceDate, weekStartsOn });
    const start = thisWeek.start;

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const calendarHeader = section.createDiv({ cls: "finance-tracker-header" });
    calendarHeader.createEl("h4", { text: "Payment calendar" });
    const rangeBar = calendarHeader.createDiv({ cls: "finance-tracker-calendar-filter-bar" });

    const headers = section.createDiv({ cls: "finance-tracker-calendar-weekdays" });
    for (const label of weekdayLabels) {
      headers.createDiv({ cls: "finance-tracker-calendar-weekday", text: label });
    }

    const body = section.createDiv({ cls: "finance-tracker-calendar-body" });
    const monthLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    const dayLabel = (iso) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", weekday: "long" });

    let selectedDay = "";
    let cellRefs = new Map();
    // Each entry is { host, from, to }: the detail panel that owns a given span
    // of days. The week view has one per week, the year view a single one.
    let detailHosts = [];
    let seenMonth = "";
    let byDay = new Map();

    const renderDetail = (host, day) => {
      host.empty();
      const items = byDay.get(day) || [];
      if (!items.length) return;
      const panel = host.createDiv({ cls: "finance-tracker-calendar-inline-details" });
      const dayTotal = items.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
      const heading = panel.createDiv({ cls: "finance-tracker-calendar-inline-date" });
      heading.setText(`${dayLabel(day)} · ${core.formatCurrency(core.roundCurrencyAmount(dayTotal), currency)}`);
      for (const occurrence of items) {
        const row = panel.createDiv({ cls: "finance-tracker-calendar-inline-item" });
        const summary = row.createDiv({ cls: "finance-tracker-calendar-inline-summary" });
        summary.createSpan({ text: occurrence.label });
        const meta = [cadenceLabel(occurrence.cadence)];
        if (occurrence.isNewPrice) meta.push("new price");
        summary.createSpan({
          cls: "finance-tracker-budget-meta",
          text: `${core.formatCurrency(occurrence.amount, currency)} · ${meta.join(" · ")}`,
        });
      }
    };

    const refresh = () => {
      for (const [day, cell] of cellRefs.entries()) {
        cell.toggleClass("is-selected", day === selectedDay);
      }
      for (const { host, from, to } of detailHosts) {
        if (selectedDay && selectedDay >= from && selectedDay <= to) {
          renderDetail(host, selectedDay);
        } else {
          host.empty();
        }
      }
    };

    // A year of week grids would be 52 stacked rows — technically the same
    // information, useless to actually read. At twelve months the calendar
    // switches to a month-per-row heat grid instead: one line per month, one
    // cell per day-of-month, shaded by what falls due. Bills recur on the same
    // day each month, so the vertical stripes *are* the pattern — the 9th and
    // the 14th being heavy every month is visible in one glance.
    const drawYearGrid = (start, end) => {
      const monthCount = 12;
      const dayTotals = new Map();
      let heaviest = 0;
      for (const [day, items] of byDay.entries()) {
        const total = core.roundCurrencyAmount(items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
        dayTotals.set(day, total);
        if (total > heaviest) heaviest = total;
      }

      const grid = body.createDiv({ cls: "finance-tracker-year-grid" });
      grid.createDiv({ cls: "finance-tracker-year-head" });
      for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
        grid.createDiv({
          cls: "finance-tracker-year-head",
          // Labelling all 31 columns is unreadable at this size.
          text: dayOfMonth === 1 || dayOfMonth % 5 === 0 ? String(dayOfMonth) : "",
        });
      }
      grid.createDiv({ cls: "finance-tracker-year-head is-total", text: "Total" });

      const firstOfStartMonth = `${start.slice(0, 7)}-01`;
      for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
        const monthStart = core.addMonths(firstOfStartMonth, monthIndex);
        const monthKey = monthStart.slice(0, 7);
        const daysInMonth = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
        grid.createDiv({
          cls: "finance-tracker-year-month",
          text: new Date(`${monthStart}T12:00:00`).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
        });

        let monthTotal = 0;
        for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
          if (dayOfMonth > daysInMonth) {
            grid.createDiv({ cls: "finance-tracker-year-cell is-void" });
            continue;
          }
          const day = `${monthKey}-${String(dayOfMonth).padStart(2, "0")}`;
          const items = byDay.get(day) || [];
          const total = dayTotals.get(day) || 0;
          monthTotal += total;

          const cell = grid.createEl("button", { cls: "finance-tracker-year-cell", attr: { type: "button" } });
          if (day < start || day > end) cell.addClass("is-outside");
          if (day === referenceDate) cell.addClass("is-today");
          if (items.length) {
            cellRefs.set(day, cell);
            // Four bands rather than a continuous ramp: enough to read the
            // shape, few enough that neighbouring days stay distinguishable.
            const level = heaviest > 0 ? Math.max(1, Math.ceil((total / heaviest) * 4)) : 1;
            cell.addClass(`is-level-${level}`);
            if (items.some((item) => item.isNewPrice)) cell.addClass("is-repriced");
            if (day < referenceDate) cell.addClass("is-overdue");
            cell.setAttr(
              "title",
              `${dayLabel(day)} · ${core.formatCurrency(total, currency)} · ${items.length} bill${items.length === 1 ? "" : "s"}`
            );
            cell.addEventListener("click", () => {
              selectedDay = selectedDay === day ? "" : day;
              refresh();
            });
          } else {
            cell.addClass("is-quiet");
          }
        }

        grid.createDiv({
          cls: "finance-tracker-year-total",
          text: monthTotal > 0 ? core.formatCurrency(core.roundCurrencyAmount(monthTotal), currency) : "—",
        });
      }

      const legend = body.createDiv({ cls: "finance-tracker-year-legend" });
      legend.createSpan({ text: "Lighter to darker: smaller to larger day totals." });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-1" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-2" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-3" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-4" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-repriced" });
      legend.createSpan({ text: "repriced" });

      detailHosts.push({ from: start, host: body.createDiv({ cls: "finance-tracker-calendar-inline-host" }), to: end });
    };

    const drawCalendar = () => {
      body.empty();
      cellRefs = new Map();
      detailHosts = [];
      seenMonth = "";
      selectedDay = "";

      // Walk whole weeks so the grid always starts on the week's first column,
      // covering at least the requested months.
      const end = core.addMonths(start, activeMonths);
      const weeksAhead = Math.ceil(core.daysBetweenInclusive(start, end) / 7);
      const { occurrences } = core.sumRecurringDueWithin(recurring, start, end);

      byDay = new Map();
      for (const occurrence of occurrences) {
        const list = byDay.get(occurrence.date) || [];
        list.push(occurrence);
        byDay.set(occurrence.date, list);
      }

      if (!byDay.size) {
        body.createDiv({
          cls: "finance-tracker-empty",
          text: `No bills fall due in the next ${activeMonths === 1 ? "month" : `${activeMonths} months`}.`,
        });
        return;
      }

      const total = occurrences.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
      body.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${occurrences.length} payment${occurrences.length === 1 ? "" : "s"} · ${core.formatCurrency(core.roundCurrencyAmount(total), currency)} total`,
      });

      if (activeMonths >= 12) {
        drawYearGrid(start, end);
        return;
      }

      for (let weekIndex = 0; weekIndex < weeksAhead; weekIndex += 1) {
        const weekStart = core.addDays(start, weekIndex * 7);
        const days = Array.from({ length: 7 }, (_unused, offset) => core.addDays(weekStart, offset));
        // Only draw weeks that actually carry a bill — an empty fortnight in the
        // middle of the horizon is noise, not information.
        if (!days.some((day) => byDay.has(day))) continue;

        const month = monthLabel(days.find((day) => byDay.has(day)) || weekStart);
        if (month !== seenMonth) {
          body.createDiv({ cls: "finance-tracker-calendar-month-caption", text: month });
          seenMonth = month;
        }

        const weekBlock = body.createDiv({ cls: "finance-tracker-calendar-week-block" });
        const grid = weekBlock.createDiv({ cls: "finance-tracker-calendar-grid month-grid" });
        for (const day of days) {
          const items = byDay.get(day) || [];
          const cell = grid.createEl("button", { cls: "finance-tracker-calendar-day", attr: { type: "button" } });
          cellRefs.set(day, cell);
          if (!items.length) cell.addClass("is-empty");
          if (day === referenceDate) cell.addClass("is-today");

          const dots = cell.createDiv({ cls: "finance-tracker-calendar-dots" });
          for (const occurrence of items.slice(0, 4)) {
            const tone = day < referenceDate ? "is-bill-overdue" : occurrence.isNewPrice ? "is-bill-change" : "is-bill";
            dots.createDiv({ cls: `finance-tracker-calendar-dot ${tone}`, attr: { title: occurrence.label } });
          }
          if (items.length > 4) dots.createSpan({ cls: "finance-tracker-calendar-dot-more", text: `+${items.length - 4}` });

          const dateText = cell.createSpan({ cls: "finance-tracker-calendar-date", text: day });
          dateText.setAttr("data-short-date", day.slice(-2));
          if (items.length) {
            const dayTotal = items.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
            cell.createSpan({
              cls: "finance-tracker-calendar-day-total",
              text: core.formatCurrency(core.roundCurrencyAmount(dayTotal), currency),
            });
          }

          cell.addEventListener("click", () => {
            if (!items.length) return;
            selectedDay = selectedDay === day ? "" : day;
            refresh();
          });
        }
        detailHosts.push({
          from: weekStart,
          host: weekBlock.createDiv({ cls: "finance-tracker-calendar-inline-host" }),
          to: core.addDays(weekStart, 6),
        });
      }
    };

    const rangeButtons = new Map();
    for (const choice of RANGE_CHOICES) {
      const button = rangeBar.createEl("button", { cls: "finance-tracker-calendar-filter-button", text: choice.label });
      rangeButtons.set(choice.months, button);
      button.addEventListener("click", () => {
        activeMonths = choice.months;
        for (const [months, other] of rangeButtons.entries()) other.toggleClass("is-active", months === activeMonths);
        drawCalendar();
      });
    }
    for (const [months, button] of rangeButtons.entries()) button.toggleClass("is-active", months === activeMonths);

    drawCalendar();
  }

  async renderRecurringBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const prefix = core.normalizeCategoryPath(config.prefix || this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    const recurring = await this.detectRecurring(referenceDate, prefix);

    // Bill notes get the new list. The old one stays for vaults that have not
    // converted, so nothing changes for anyone until they choose it.
    if (recurring.billsMode) {
      await this.renderBillsBlock(source, el, ctx, recurring);
      return;
    }

    const manage = /^(?:true|yes|1)$/i.test(String(config.manage || ""));
    const entries = await this.collectAllTransactions();
    const runway = await this.computeRunwayState(referenceDate, { recurring, entries });
    // "Due next 30 days" is the same forward walk the runway target uses, just
    // over a fixed horizon, so it comes from the same helper.
    const dueNext30Days = core.fromCents(
      core.sumRecurringDueWithin(recurring, referenceDate, core.addDays(referenceDate, 30)).totalCents
    );

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Recurring payments" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Log all due", async () => {
      await this.logDueRecurringPayments({ notify: true });
      await this.renderRecurringBlock(source, el, ctx);
    }, { primary: true, errorPrefix: "Logging due payments" });

    if (!recurring.items.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `No recurring payments found yet. Tag one like #log/spending/${prefix}/monthly/spotify and it will appear here.`,
      });
      return;
    }

    const activeCount = recurring.items.filter((item) => item.active !== false).length;
    renderStatCards(wrapper, [
      { label: "Per month", value: core.formatCurrency(recurring.totals.monthly, currency) },
      { label: "Per year", value: core.formatCurrency(recurring.totals.yearly, currency) },
      { label: "Due next 30 days", value: core.formatCurrency(dueNext30Days, currency) },
      { label: "Tracked bills", value: String(activeCount) },
    ]);

    const rerender = () => this.renderRecurringBlock(source, el, ctx);

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Upcoming bills" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list is-recurring-grid" });
    for (const item of recurring.items) {
      // Paused and finished bills live only in the Archived section below.
      if (item.active === false) continue;
      const row = list.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row" });
      if (item.status === "overdue") row.addClass("is-overdue");
      // The headline is what the next payment will cost, which is not the same
      // as today's price once a scheduled change lands before the next due date.
      renderRowTitle(row, item.label, core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency));

      const statusText =
        item.status === "overdue"
          ? `overdue since ${item.nextDue}`
          : item.status === "due"
            ? "due today"
            : `due ${item.nextDue}`;
      const metaBits = [cadenceLabel(item.cadence), statusText, `${core.formatCurrency(item.monthlyCost, currency)}/month`];
      if (item.variable) metaBits.push("variable");
      if (item.nextAmount > 0 && item.changeDate) {
        // Say how many cycles are left at the old price rather than just naming
        // the change date — a change dated before the next due date reprices
        // every remaining payment, which "changing on 15 Aug" alone hides.
        const schedule = core.buildRecurringSchedule(item, { count: 12, referenceDate });
        const oldPrice = core.formatCurrency(item.lastAmount, currency);
        const newPrice = core.formatCurrency(item.nextAmount, currency);
        metaBits.push(
          schedule.beforeChange.count
            ? `${oldPrice} for ${schedule.beforeChange.count} more, then ${newPrice} from ${schedule.changeOccurrence || item.changeDate}`
            : `${newPrice} from ${item.changeDate} (was ${oldPrice})`
        );
      }
      if (item.endDate) metaBits.push(`ends ${item.endDate}`);
      if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
        metaBits.push(`${item.paymentsLeft} payment${item.paymentsLeft === 1 ? "" : "s"} left`);
      }
      row.createDiv({ cls: "finance-tracker-budget-meta", text: metaBits.join(" \u00b7 ") });

      const isDue = item.status === "overdue" || item.status === "due";
      if (isDue || manage) {
        // One primary action per row — the thing you came here to do — with
        // everything else quiet beside it.
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        addAction(actions, "Log now", async () => {
          if (item.variable) {
            new LogVariableBillModal(this.app, this, item, rerender).open();
            return;
          }
          const logDate = await this.logRecurringNow(item);
          new Notice(`Logged ${item.label} for ${logDate}`);
          await rerender();
        }, { primary: isDue, errorPrefix: `Logging ${item.label}`, opensModal: item.variable });

        if (item.nextDue) {
          // Moves only this occurrence; the cadence itself is untouched.
          addAction(actions, "Push a week", async () => {
            const nextDue = core.addDays(item.nextDue, 7);
            await this.updateRecurringItem(item, { nextDue });
            new Notice(`${item.label} now due ${nextDue}`);
            await rerender();
          }, { errorPrefix: `Rescheduling ${item.label}`, tooltip: "Push just this occurrence back a week, keeping the cadence" });
        }

        if (manage && item.nextDue) {
          addAction(actions, "Skip cycle", async () => {
            const nextDue = core.nextRecurringDate(item.nextDue, item.cadence);
            await this.logRecurringSkip(item);
            await this.advanceRecurringSchedule(item);
            new Notice(`Skipped ${item.label} — next due moves to ${nextDue}`);
            await rerender();
          }, { errorPrefix: `Skipping ${item.label}`, tooltip: "Log a $0 entry and move on to the next cycle" });
        }
      }

      if (manage) {
        const stateActions = row.createDiv({ cls: "finance-tracker-header-actions is-secondary" });
        addAction(stateActions, "Edit", () => {
          new EditRecurringItemModal(this.app, this, item, rerender).open();
        }, { opensModal: true });
        addAction(stateActions, "Pause", async () => {
          await this.updateRecurringItem(item, { active: false });
          await rerender();
        }, { errorPrefix: `Pausing ${item.label}` });
        addToggleAction(stateActions, "Auto-log", item.autoLog !== false, async (checked) => {
          await this.updateRecurringItem(item, { autoLog: checked });
        });
      }
    }

    this.renderRecurringCalendar(wrapper, recurring, currency, referenceDate, {
      months: core.parseNumber(config.months),
      weeks: core.parseNumber(config.weeks),
    });

    // Archived bills: paused by hand, or retired by their own End Date /
    // Payments Left. Collapsed by default, still reachable to resume or drop.
    const archivedItems = recurring.items.filter((item) => item.active === false);
    if (archivedItems.length) {
      const archiveDetails = wrapper.createEl("details", { cls: "finance-tracker-chart-card finance-tracker-archived" });
      archiveDetails.createEl("summary", { text: `Archived (${archivedItems.length})` });
      const archiveList = archiveDetails.createDiv({ cls: "finance-tracker-budget-list is-recurring-grid" });
      for (const item of archivedItems) {
        const row = archiveList.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row is-paused" });
        renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, currency));
        const reason =
          item.finishedReason === "end-date"
            ? `ended ${item.endDate}`
            : item.finishedReason === "payments"
              ? "all payments made"
              : "paused";
        row.createDiv({ cls: "finance-tracker-budget-meta", text: `${cadenceLabel(item.cadence)} \u00b7 ${reason}` });
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        // A finished bill needs its terms cleared before it can run again, so
        // Resume is only the obvious next step for one that was merely paused.
        addAction(actions, item.finished ? "Restart" : "Resume", async () => {
          await this.updateRecurringItem(item, {
            active: true,
            ...(item.finished ? { endDate: null, paymentsLeft: null } : {}),
          });
          await rerender();
        }, { primary: !item.finished, errorPrefix: `Resuming ${item.label}` });
        addAction(actions, "Remove completely", async () => {
          await this.removeRecurringItemCompletely(item);
          new Notice(`Removed ${item.label} — it won't be tracked as a recurring payment again.`);
          await rerender();
        }, { warning: true, errorPrefix: `Removing ${item.label}` });
      }
    }

    this.renderRunwaySection(wrapper, runway, currency);
  }


  async renderRunwayBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const runway = await this.computeRunwayState(referenceDate);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Runway" });
    addAction(
      header.createDiv({ cls: "finance-tracker-header-actions" }),
      "Bills",
      () => this.openRecurringNote(),
      { errorPrefix: "Opening recurring payments note" }
    );
    this.renderRunwaySection(wrapper, runway, currency, { standalone: true });
  }

  // Runway: how much you need available to be safe for the chosen period.
  //
  // Read-only by design. There is no balance to fund and no bookkeeping — it
  // reads the bills you have already logged and tells you what the next window
  // costs, so you know how much to leave in the account it comes out of.
  renderRunwaySection(wrapper, runway, currency, options = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    if (!options.standalone) {
      section.createEl("h4", { text: "Runway" });
    }

    if (!runway || runway.target <= 0) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `Nothing due between today and ${runway?.windowEnd || "the end of the window"}. Runway shows what your next ${
          runway?.period || this.settings.runwayPeriod
        } of outgoings costs once you have bills logged.`,
      });
      return;
    }

    const covers = runway.mode === "bills" ? "recurring bills only" : "bills due plus your usual spending";

    const headline = section.createDiv({ cls: "finance-tracker-forecast-headline" });
    headline.setText(`Keep ${core.formatCurrency(runway.target, currency)} available for the next ${runway.period}`);
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      // Sentence-case, not title-case: titleCaseSegment turned this fragment
      // into "Recurring Bills Only, between today and …".
      text: `${covers.charAt(0).toUpperCase()}${covers.slice(1)}, between today and ${runway.windowEnd}. Change the period or what counts in Settings → Runway.`,
    });

    renderStatCards(section, [
      {
        label: `Next ${runway.period}`,
        value: core.formatCurrency(runway.target, currency),
        hint:
          runway.mode === "spending" && runway.discretionary > 0
            ? `${core.formatCurrency(runway.bills, currency)} bills + ${core.formatCurrency(runway.discretionary, currency)} spending`
            : `${runway.occurrences.length} bill${runway.occurrences.length === 1 ? "" : "s"} due`,
      },
      { label: "Per week", value: core.formatCurrency(runway.perWeek, currency) },
      { label: "Per day", value: core.formatCurrency(runway.perDay, currency) },
      {
        label: "Bills due",
        value: String(runway.occurrences.length),
        hint: runway.occurrences.length ? `next on ${runway.occurrences[0].date}` : "",
      },
    ]);

    if (runway.occurrences.length) {
      section.createEl("h5", { text: `What makes up the ${runway.period}` });
      const list = section.createDiv({ cls: "ft-budget-rows" });
      for (const occurrence of runway.occurrences.slice(0, 12)) {
        const line = list.createDiv({ cls: "ft-budget-row" });
        const top = line.createDiv({ cls: "ft-budget-row-top" });
        top.createSpan({ cls: "ft-budget-row-name", text: `${occurrence.label} · ${occurrence.date}` });
        top.createSpan({ cls: "ft-budget-row-value", text: formatCurrencyShort(occurrence.amount, currency) });
      }
      if (runway.occurrences.length > 12) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `+ ${runway.occurrences.length - 12} more bills in the window.`,
        });
      }
      if (runway.mode === "spending" && runway.discretionary > 0) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `Plus ${core.formatCurrency(runway.discretionary, currency)} of usual spending, from your average over the last 90 days.`,
        });
      }
    }
  }

  // --- Split expenses -----------------------------------------------------------

  async settleUpWithPerson(person, displayName, amount) {
    const slug = core.normalizeCategoryPath(person);
    if (!slug) return;
    const today = core.todayIsoLocal();
    const entries = await this.collectAllTransactions();
    const paths = new Set(
      entries
        .filter((entry) => (entry.owed || []).some((item) => item.person === slug && !item.settled))
        .map((entry) => entry.filePath)
        .filter(Boolean)
    );
    const owedRe = new RegExp(`#log/owed/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`, "i");
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const content = await this.app.vault.cachedRead(file);
      const next = content
        .split("\n")
        .map((line) => (owedRe.test(line) && !/\bsettled\b/i.test(line) ? `${line} · settled ${today}` : line))
        .join("\n");
      if (next !== content) {
        await _ftModify(this.app, file, next);
        this.invalidateIndexEntry(path);
      }
    }
    if (Number(amount) > 0) {
      const label = displayName || core.titleCaseSegment(slug);
      await this.appendFinanceLines(today, [
        `- ${core.formatCurrency(amount, this.settings.defaultCurrency)} #log/income/settleup/${slug}`,
        `\t- Settle up from ${label}`,
      ]);
    }
    new Notice(`Settled up with ${displayName || slug}`);
    this.refreshDailyBudgetView();
  }

  async renderSplitsBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const entries = await this.collectAllTransactions();
    const splits = core.summarizeSplitBalances(entries);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Split expenses" });

    if (!splits.people.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No split expenses yet. Quick-add with split=2 or owed=Sam:$8, or add a child line like `owes: Sam $8 #log/owed/sam` under any expense.",
      });
      return;
    }

    const owedCount = splits.people.filter((person) => person.outstanding > 0).length;
    renderStatCards(wrapper, [
      {
        label: "Outstanding",
        value: core.formatCurrency(splits.totalOutstanding, currency),
        hint: owedCount ? `across ${owedCount} ${owedCount === 1 ? "person" : "people"}` : "everyone settled up",
      },
    ]);

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Balances by person" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const personRow of splits.people) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, personRow.displayName, core.formatCurrency(personRow.outstanding, currency));
      const openEntries = personRow.entries.filter((item) => !item.settled);
      for (const item of openEntries.slice(0, 8)) {
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${item.date || ""} · ${core.formatCurrency(item.amount, currency)} · ${item.merchant || "Split expense"}`,
        });
      }
      if (personRow.outstanding > 0) {
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Settle up",
          async () => {
            await this.settleUpWithPerson(personRow.person, personRow.displayName, personRow.outstanding);
            await this.renderSplitsBlock(source, el, ctx);
          },
          { primary: true, errorPrefix: "Settle up" }
        );
      } else {
        row.createDiv({ cls: "finance-tracker-budget-meta", text: "All settled ✅" });
      }
    }
  }

  // --- Net worth ------------------------------------------------------------------

  async renderNetWorthBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const entries = await this.collectAllTransactions();
    const summary = core.summarizeBalanceSnapshots(entries);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Net worth" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Snapshot balances", () => new BalanceSnapshotModal(this.app, this).open(), {
      primary: true,
      opensModal: true,
    });

    if (!summary.accounts.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No balance snapshots yet. Run the Snapshot balances command to log bullets like `- $5,230.00 #log/balance/anz-plus` into today's note.",
      });
      return;
    }

    const cardData = [{ label: "Net worth", value: core.formatCurrency(summary.latestTotal, currency) }];
    if (Number.isFinite(summary.previousTotal)) {
      const delta = core.roundCurrencyAmount(summary.latestTotal - summary.previousTotal);
      cardData.push({
        label: "Since last snapshot",
        value: `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${core.formatCurrency(Math.abs(delta), currency)}`,
        cls: delta > 0 ? "is-down" : delta < 0 ? "is-up" : "",
      });
    }
    cardData.push({ label: "Accounts", value: String(summary.accounts.length) });
    renderStatCards(wrapper, cardData);

    this.renderLineChartCard(wrapper, "Balance trend", summary.series.map((point) => ({ date: point.date, value: point.total })), {
      emptyText: "Take a second snapshot to draw the trend line.",
    });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Accounts" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const account of summary.accounts) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, account.label, core.formatCurrency(account.latest?.amount || 0, currency));
      row.createDiv({ cls: "finance-tracker-budget-meta", text: `As of ${account.latest?.date || "?"} · ${account.history.length} snapshot${account.history.length === 1 ? "" : "s"}` });
    }
  }

  // --- Forecast ---------------------------------------------------------------------

  async renderForecastBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const entries = await this.collectAllTransactions();
    // detectRecurring, not the raw detector: the registry's pauses, end dates and
    // removals have to apply here too. Without them the forecast counted every
    // bill ever detected — in the author's vault $1,134.90 a month against $316.82
    // of live bills, most of it duplicates and cancelled subscriptions.
    const recurring = await this.detectRecurring(referenceDate);

    const goals = await this.collectSavingsGoalDefinitions();
    const goalKeys = goals.map((goal) => goal.goalKey).filter(Boolean);
    let monthlyGoalSetAside = core.parseNumber(config.setaside);
    if (!Number.isFinite(monthlyGoalSetAside)) {
      monthlyGoalSetAside = 0;
      for (const goal of goals) {
        if (!goal.activeSavingsGoal || !goal.dueDate) continue;
        const summary = await this.buildSavingsGoalSummary(goal, referenceDate);
        if (summary.sinkingFund && summary.sinkingFund.requiredPerWeek > 0) {
          monthlyGoalSetAside += (summary.sinkingFund.requiredPerWeek * 52) / 12;
        }
      }
      monthlyGoalSetAside = core.roundCurrencyAmount(monthlyGoalSetAside);
    }

    const inputs = core.computeForecastInputs(entries, recurring, {
      goalKeys,
      recurringPrefix: this.settings.recurringTagPrefix || "subscriptions",
      referenceDate,
    });
    const balances = core.summarizeBalanceSnapshots(entries);
    const projection = core.buildForecastProjection({
      monthlyBills: core.parseNumber(config.bills) ?? inputs.monthlyBills,
      monthlyDiscretionary: core.parseNumber(config.discretionary) ?? inputs.monthlyDiscretionary,
      monthlyGoalSetAside,
      monthlyIncome: core.parseNumber(config.income) ?? inputs.monthlyIncome,
      months: core.parseNumber(config.months) || 6,
      referenceDate,
      startBalance: core.parseNumber(config.start) ?? balances.latestTotal ?? 0,
    });

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Forecast" });

    const headline = wrapper.createDiv({ cls: "finance-tracker-forecast-headline" });
    headline.createSpan({ text: `~${core.formatCurrency(projection.endBalance, currency)} by ${projection.endDate}` });

    const cardData = [
      { label: "Income / month", value: core.formatCurrency(core.parseNumber(config.income) ?? inputs.monthlyIncome, currency) },
      { label: "Recurring bills / month", value: core.formatCurrency(core.parseNumber(config.bills) ?? inputs.monthlyBills, currency) },
      { label: "Discretionary / month", value: core.formatCurrency(core.parseNumber(config.discretionary) ?? inputs.monthlyDiscretionary, currency) },
      { label: "Goal set-asides / month", value: core.formatCurrency(monthlyGoalSetAside, currency) },
      {
        label: "Net / month",
        value: core.formatCurrency(projection.monthlyNet, currency),
        cls: projection.monthlyNet < 0 ? "is-up" : "is-down",
      },
    ];
    renderStatCards(wrapper, cardData);

    this.renderLineChartCard(
      wrapper,
      `Projection (${projection.months} months)`,
      projection.points.map((point) => ({ date: point.date, value: point.balance })),
      {}
    );
    wrapper.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `Based on income minus recurring bills minus the trailing ${inputs.windowDays}-day average discretionary spend, including committed goal set-asides.`,
    });

    // A projection from nothing is not a projection. Say which half is missing
    // rather than drawing a confident line down from zero.
    const missing = [];
    if (!(inputs.monthlyIncome > 0) && !Number.isFinite(core.parseNumber(config.income))) {
      missing.push(`no income logged in the last ${inputs.windowDays} days — add \`income:\` to this block, or log income as #log/income/salary`);
    }
    if (!(balances.latestTotal > 0) && !Number.isFinite(core.parseNumber(config.start))) {
      missing.push("no balance snapshots, so the line starts at zero — run Snapshot balances, or add `start:`");
    }
    if (missing.length) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: `This forecast is incomplete: ${missing.join("; ")}.` });
    }
  }

  // --- Year/quarter review command --------------------------------------------------

  // Computes the finished markdown for "Insert yearly review" / "Insert
  // quarterly review" — a frozen snapshot as of today, not a live block.
  async buildPeriodReview(period) {
    const entries = await this.collectAllTransactions();
    const goalKeys = (await this.collectSavingsGoalDefinitions()).map((goal) => goal.goalKey).filter(Boolean);
    return core.buildPeriodReviewLines(entries, {
      period,
      referenceDate: core.todayIsoLocal(),
      currency: this.settings.defaultCurrency,
      goalKeys,
    });
  }

  // --- Query block --------------------------------------------------------------------

  async renderQueryBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);

    let start = core.parseIsoDate(config.start || "");
    let end = core.parseIsoDate(config.end || "");
    if (config.period && !start && !end) {
      const range = core.toPeriodRange({ period: config.period, referenceDate, weekStartsOn: this.settings.weekStartsOn });
      start = range.start;
      end = range.end;
    }
    const entries = await this.collectTransactionsForRange({
      period: "all",
      start: start || "1900-01-01",
      end: end || "2999-12-31",
    });
    const goalKeys = (await this.collectSavingsGoalDefinitions()).map((goal) => goal.goalKey).filter(Boolean);
    const view = String(config.view || "table").toLowerCase();

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Finance query" });

    if (view === "income-expense") {
      const months = core.buildMonthlyIncomeExpense(entries, { goalKeys });
      this.renderIncomeExpenseBars(wrapper, months, currency);
      return;
    }
    if (view === "cumulative") {
      const series = core.buildCumulativeBalanceSeries(entries, { goalKeys });
      this.renderLineChartCard(wrapper, "Cumulative balance", series.map((point) => ({ date: point.date, value: point.balance })), {
        emptyText: "No income or spending in this range yet.",
      });
      return;
    }

    const result = core.runFinanceQuery(entries, {
      ...config,
      start: start || "",
      end: end || "",
      group: view === "categories" ? "category-full" : config.group || config.groupby,
    });
    if (!result.rows.length) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "No entries matched this query." });
      return;
    }

    const colorByKey = new Map();
    if (view === "categories" || String(config.group || "category").startsWith("category")) {
      const hierarchy = core.buildHierarchicalCategoryGroups(result.entries, "full");
      for (const slice of hierarchy.slices) colorByKey.set(slice.key, slice.color);
      for (const group of hierarchy.groups) colorByKey.set(group.key, group.color);
    }

    if (view === "bars") {
      this.renderRankedBars(wrapper, result, currency, colorByKey);
      return;
    }
    this.renderQueryTable(wrapper, result, currency, colorByKey, view === "categories");
  }

  // Goals overview: every goal's envelope in one place, with one-tap
  // contributions. With `account: <key>` it reconciles the virtual envelopes
  // against a real lump-sum account's latest balance snapshot — for setups
  // where several goals live inside one savings account.
  async renderGoalsBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const activeOnly = /^(?:true|yes|1)$/i.test(String(config.active || ""));

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Savings goals" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Contribute", () => new ContributeGoalModal(this.app, this).open(), {
      primary: true,
      opensModal: true,
    });

    const goals = (await this.collectSavingsGoalDefinitions()).filter(
      (goal) => !activeOnly || goal.activeSavingsGoal
    );
    if (!goals.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No goal notes yet. Create one with the Create savings goal command, or a trip via Select or create trip.",
      });
      return;
    }

    const rows = [];
    for (const goal of goals) {
      rows.push({ goal, summary: await this.buildSavingsGoalSummary(goal, referenceDate) });
    }

    // Lump-sum reconciliation: virtual envelopes vs the real account balance.
    const accountKey = core.normalizeCategoryPath(config.account || "");
    if (accountKey) {
      const balances = core.summarizeBalanceSnapshots(await this.collectAllTransactions());
      const account = balances.accounts.find((item) => item.key === accountKey);
      const allocated = core.roundCurrencyAmount(rows.reduce((sum, row) => sum + Number(row.summary.currentAccountBalance || 0), 0));
      const accountBalance = account?.latest?.amount;
      const cardData = [
        {
          label: `${core.titleCaseSegment(accountKey.split("/").pop())} balance`,
          value: Number.isFinite(accountBalance) ? core.formatCurrency(accountBalance, currency) : "No snapshot yet",
        },
        { label: "Allocated to goals", value: core.formatCurrency(allocated, currency) },
      ];
      if (Number.isFinite(accountBalance)) {
        const unallocated = core.roundCurrencyAmount(accountBalance - allocated);
        cardData.push({
          label: unallocated >= 0 ? "Unallocated" : "Over-allocated",
          value: core.formatCurrency(Math.abs(unallocated), currency),
          cls: unallocated < 0 ? "is-over" : "",
        });
      }
      renderStatCards(wrapper, cardData);
      if (!Number.isFinite(accountBalance)) {
        wrapper.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `Run Snapshot balances with an account named ${accountKey} to compare the real balance against these envelopes.`,
        });
      }
    }

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const { goal, summary } of rows) {
      const card = list.createDiv({ cls: "finance-tracker-budget-card" });
      const goalCurrency = goal.currency || currency;
      renderRowTitle(
        card,
        goal.goalName,
        summary.targetAmount > 0
          ? `${core.formatCurrency(summary.currentSaved, goalCurrency)} / ${core.formatCurrency(summary.targetAmount, goalCurrency)}`
          : core.formatCurrency(summary.currentSaved, goalCurrency)
      );
      const bits = [];
      if (goal.goalType === "holiday") bits.push("trip");
      if (!goal.activeSavingsGoal) bits.push("inactive");
      if (summary.sinkingFund && summary.sinkingFund.requiredPerWeek > 0) {
        bits.push(`${core.formatCurrency(summary.sinkingFund.requiredPerWeek, goal.currency || currency)}/week needed`);
      }
      if (goal.dueDate) bits.push(`due ${goal.dueDate}`);
      if (summary.sinkingFund) {
        const paceLabels = { ahead: "ahead of pace", behind: "behind pace", complete: "target reached", overdue: "past due", "on-track": "on track" };
        bits.push(paceLabels[summary.sinkingFund.status] || summary.sinkingFund.status);
      }
      if (bits.length) card.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });
      const goalTotal = summary.targetAmount > 0 ? summary.targetAmount : summary.currentSaved;
      const bar = card.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = bar.createDiv({ cls: "finance-tracker-budget-fill is-good" });
      fill.style.width = `${goalTotal > 0 ? Math.min((summary.currentSaved / goalTotal) * 100, 100) : 0}%`;
      addAction(
        card.createDiv({ cls: "finance-tracker-header-actions" }),
        "Contribute",
        () => new ContributeGoalModal(this.app, this, { goalKey: goal.goalKey, onDone: () => this.renderGoalsBlock(source, el, ctx) }).open(),
        { primary: true, opensModal: true }
      );
    }
  }

  renderQueryTable(wrapper, result, currency, colorByKey = new Map(), ranked = false) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: ranked ? "Categories ranked" : "Results" });
    const table = section.createEl("table", { cls: "finance-tracker-table" });
    const headRow = table.createEl("thead").createEl("tr");
    for (const label of [ranked ? "Category" : "Group", "Total", "Entries", "%"]) {
      headRow.createEl("th", { text: label });
    }
    const body = table.createEl("tbody");
    result.rows.forEach((row, index) => {
      const tr = body.createEl("tr");
      const labelCell = tr.createEl("td");
      const swatchColor = colorByKey.get(row.key);
      if (swatchColor) {
        const swatch = labelCell.createSpan({ cls: "finance-tracker-legend-swatch finance-tracker-table-swatch" });
        swatch.style.backgroundColor = swatchColor;
      }
      labelCell.createSpan({ text: ranked ? `${index + 1}. ${row.label}` : row.label });
      tr.createEl("td", { text: core.formatCurrency(row.value, currency), cls: "is-numeric" });
      tr.createEl("td", { text: String(row.count), cls: "is-numeric" });
      tr.createEl("td", { text: `${row.pct}%`, cls: "is-numeric" });
    });
    const foot = table.createEl("tfoot").createEl("tr");
    foot.createEl("td", { text: "Total" });
    foot.createEl("td", { text: core.formatCurrency(result.total, currency), cls: "is-numeric" });
    foot.createEl("td", { text: String(result.count), cls: "is-numeric" });
    foot.createEl("td", { text: "100%", cls: "is-numeric" });
  }

  renderRankedBars(wrapper, result, currency, colorByKey = new Map()) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Results" });
    const maxValue = Math.max(...result.rows.map((row) => row.value), 1);
    const list = section.createDiv({ cls: "finance-tracker-ranked-bars" });
    for (const row of result.rows) {
      const item = list.createDiv({ cls: "finance-tracker-ranked-bar" });
      const label = item.createDiv({ cls: "finance-tracker-ranked-bar-label" });
      label.createSpan({ text: row.label });
      label.createSpan({ cls: "finance-tracker-budget-meta", text: ` ${core.formatCurrency(row.value, currency)} (${row.pct}%)` });
      const track = item.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = track.createDiv({ cls: "finance-tracker-budget-fill" });
      fill.style.width = `${Math.max((row.value / maxValue) * 100, 1)}%`;
      fill.style.backgroundColor = colorByKey.get(row.key) || "var(--interactive-accent)";
    }
  }

  renderIncomeExpenseBars(wrapper, months, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Income vs expense by month" });
    if (!months.length) {
      section.createDiv({ cls: "finance-tracker-empty", text: "No income or spending in this range yet." });
      return;
    }
    const W = 600;
    const H = 180;
    const pad = 8;
    const labelSpace = 18;
    const maxValue = Math.max(1, ...months.map((month) => Math.max(month.income, month.expense)));
    const groupWidth = (W - pad * 2) / months.length;
    const barWidth = Math.min(groupWidth * 0.34, 34);
    const incomeColor = "hsl(145, 58%, 38%)";
    const expenseColor = "hsl(356, 58%, 48%)";
    const svg = section.createDiv({ cls: "finance-tracker-line-chart" }).createSvg("svg", {
      cls: "ft-line-svg",
      attr: { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Monthly income versus expense bars" },
    });
    months.forEach((month, index) => {
      const groupX = pad + index * groupWidth + groupWidth / 2;
      const incomeHeight = (month.income / maxValue) * (H - pad * 2 - labelSpace);
      const expenseHeight = (month.expense / maxValue) * (H - pad * 2 - labelSpace);
      svg.createSvg("rect", {
        attr: {
          x: (groupX - barWidth - 1).toFixed(1),
          y: (H - pad - labelSpace - incomeHeight).toFixed(1),
          width: barWidth.toFixed(1),
          height: Math.max(incomeHeight, 0.5).toFixed(1),
          rx: 2,
          fill: incomeColor,
        },
      });
      svg.createSvg("rect", {
        attr: {
          x: (groupX + 1).toFixed(1),
          y: (H - pad - labelSpace - expenseHeight).toFixed(1),
          width: barWidth.toFixed(1),
          height: Math.max(expenseHeight, 0.5).toFixed(1),
          rx: 2,
          fill: expenseColor,
        },
      });
      if (months.length <= 12 || index === 0 || index === months.length - 1) {
        svg.createSvg("text", {
          cls: "ft-chart-axis-label",
          text: month.month,
          attr: { x: groupX.toFixed(1), y: (H - 2).toFixed(1), "text-anchor": "middle" },
        });
      }
    });
    const legend = section.createDiv({ cls: "finance-tracker-legend finance-tracker-legend--row" });
    for (const [label, color] of [["Income", incomeColor], ["Expense", expenseColor]]) {
      const item = legend.createDiv({ cls: "finance-tracker-legend-item" });
      const swatch = item.createDiv({ cls: "finance-tracker-legend-swatch" });
      swatch.style.backgroundColor = color;
      item.createDiv({ cls: "finance-tracker-legend-label", text: label });
    }
    const table = section.createDiv({ cls: "finance-tracker-budget-list is-compact" });
    for (const month of months.slice(-6)) {
      const card = table.createDiv({ cls: "finance-tracker-budget-card" });
      card.createDiv({ cls: "finance-tracker-budget-title", text: month.month });
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `In ${core.formatCurrency(month.income, currency)} · out ${core.formatCurrency(month.expense, currency)} · net ${core.formatCurrency(month.net, currency)}`,
      });
    }
  }

  renderLineChartCard(wrapper, title, points, options = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    if (title) section.createEl("h4", { text: title });
    if (!points || points.length < 2) {
      section.createDiv({ cls: "finance-tracker-empty", text: options.emptyText || "Not enough data to chart yet." });
      return section;
    }
    const W = 600;
    const H = 160;
    const pad = 8;
    const values = points.map((point) => Number(point.value || 0));
    const min = Math.min(...values, 0);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (index) => pad + (index * (W - pad * 2)) / (points.length - 1);
    const y = (value) => H - pad - ((value - min) / span) * (H - pad * 2);
    const svg = section.createDiv({ cls: "finance-tracker-line-chart" }).createSvg("svg", {
      cls: "ft-line-svg",
      attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img" },
    });
    if (min < 0 && max > 0) {
      svg.createSvg("line", { cls: "ft-line-zero", attr: { x1: pad, y1: y(0).toFixed(1), x2: W - pad, y2: y(0).toFixed(1) } });
    }
    const linePoints = points.map((point, index) => `${x(index).toFixed(1)},${y(Number(point.value || 0)).toFixed(1)}`).join(" ");
    svg.createSvg("polygon", {
      cls: "ft-line-area",
      attr: { points: `${pad},${(H - pad).toFixed(1)} ${linePoints} ${(W - pad).toFixed(1)},${(H - pad).toFixed(1)}` },
    });
    svg.createSvg("polyline", { cls: "ft-line-path", attr: { points: linePoints } });
    const last = points[points.length - 1];
    svg.createSvg("circle", {
      cls: "ft-line-dot",
      attr: { cx: x(points.length - 1).toFixed(1), cy: y(Number(last.value || 0)).toFixed(1), r: 3.5 },
    });
    const axis = section.createDiv({ cls: "finance-tracker-line-axis" });
    axis.createSpan({ text: points[0].date || "" });
    axis.createSpan({ text: `${last.date || ""} · ${core.formatCurrency(Number(last.value || 0), this.settings.defaultCurrency)}` });
    return section;
  }

  async renderDashboard(source, el, ctx) {
    el.empty();

    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const range = core.toPeriodRange({
      period: config.period || "week",
      referenceDate,
      start: config.start,
      end: config.end,
      weekStartsOn: this.settings.weekStartsOn,
    });
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const groupBy = String(config.groupby || this.settings.dashboardDefaultGroupBy || "primary").toLowerCase();

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", {
      text: config.title || `Finance dashboard: ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}`,
    });

    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Export CSV", async () => {
      const entries = await this.collectTransactionsForRange(range);
      await this.exportEntriesToCsv(entries, `finance-${range.start}-${range.end}`);
    }, { errorPrefix: "Export" });

    addAction(headerActions, "Budgets", () => this.openDefaultBudgetNote(), { errorPrefix: "Opening budgets note" });

    const allEntries = await this.collectTransactionsForRange(range);
    const filterReal = (list) => list.filter((entry) => core.isSpendingEntry(entry));
    const entries = filterReal(allEntries);

    // Previous comparable period (same length, immediately before) for the delta card.
    const spanDays = core.daysBetweenInclusive(range.start, range.end);
    const prevEnd = core.addDays(range.start, -1);
    const prevStart = core.addDays(prevEnd, -(spanDays - 1));
    const prevEntries = filterReal(await this.collectTransactionsForRange({ period: range.period, start: prevStart, end: prevEnd }));
    const previousTotal = core.roundCurrencyAmount(prevEntries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0));

    this.renderSummary(wrapper, entries, currency, range, { previousTotal });

    // Honour the Default grouping setting. This was hardcoded to "full", so a
    // vault set to "Primary category" still got subcategory rings it had asked
    // not to see.
    const hierarchy = core.buildHierarchicalCategoryGroups(entries, groupBy);
    this.renderPieChart(wrapper, hierarchy, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));

    const budgets = await this.loadBudgets("default");
    const budgetProgress = this.buildBudgetProgress(entries, budgets, range, groupBy, referenceDate);

    const allBudget = budgets.find((budget) => budget.category === "all");
    let perDayBudget = 0;
    if (allBudget) {
      const scaled = core.scaleBudgetLimit(Number(allBudget.limit || 0), allBudget.period, range, referenceDate || range.start, this.settings.weekStartsOn);
      perDayBudget = spanDays > 0 ? core.roundCurrencyAmount(scaled / spanDays) : 0;
    }
    this.renderSpendTrend(wrapper, entries, range, currency, { perDayBudget });

    this.renderBudgets(wrapper, budgetProgress, currency);
    await this.renderSavingsActivity(wrapper, allEntries, currency, range, referenceDate);
  }
}

