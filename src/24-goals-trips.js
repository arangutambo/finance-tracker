// --- Goals and trips ------------------------------------------------------------------
// Prompts for the moments a goal or trip needs a decision, and the small flows
// they lead into. The decisions themselves (archive, trip mode, contribute)
// are the existing ones; this only makes them turn up when they're due.

Object.assign(FinanceTrackerPlugin.prototype, {
  async collectGoalPrompts(referenceDate = core.todayIsoLocal()) {
    const goals = await this.collectSavingsGoalDefinitions();
    const tripPath = this.settings.tripModeActive ? normalizePath(this.settings.activeTripGoalPath || "") : "";
    const inputs = [];
    for (const goal of goals) {
      if (goal.isLegacyRunwayNote) continue;
      let summary = null;
      if (goal.goalType !== "holiday") summary = await this.buildSavingsGoalSummary(goal, referenceDate);
      inputs.push({
        ...goal,
        currentSaved: summary ? summary.currentSaved : 0,
        targetAmount: summary ? summary.targetAmount : goal.targetAmount,
        tripModeOn: Boolean(tripPath && goal.file?.path === tripPath),
      });
    }
    return core.buildGoalPrompts(inputs, {
      referenceDate,
      currency: this.settings.defaultCurrency,
      dismissed: this.settings.dismissedPrompts || [],
      snoozed: this.settings.promptSnoozes || {},
    });
  },

  // Renders nothing when nothing is waiting. Returns how many prompts it showed.
  async renderGoalPrompts(host, options = {}) {
    const referenceDate = options.referenceDate || core.todayIsoLocal();
    const prompts = await this.collectGoalPrompts(referenceDate);
    if (!prompts.length) return 0;
    const rerender = options.rerender || (async () => this.refreshDailyBudgetView());

    const card = host.createDiv({ cls: "finance-tracker-chart-card finance-prompts" });
    for (const prompt of prompts) {
      const row = card.createDiv({ cls: "finance-prompt" });
      row.addClass(`is-${prompt.kind}`);
      row.createDiv({ cls: "finance-prompt-title", text: prompt.title });
      row.createDiv({ cls: "finance-tracker-budget-meta", text: prompt.detail });
      const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
      for (const action of this.goalPromptActions(prompt, rerender)) {
        addAction(actions, action.label, action.run, {
          primary: action.primary,
          opensModal: action.opensModal,
          errorPrefix: action.label,
        });
      }
      addAction(
        actions,
        "Not now",
        async () => {
          await this.snoozePrompt(prompt.key, referenceDate);
          await rerender();
        },
        { tooltip: "Hide this until tomorrow" }
      );
      addAction(
        actions,
        "Dismiss",
        async () => {
          await this.dismissPrompt(prompt.key);
          await rerender();
        },
        { tooltip: "Don't ask about this again" }
      );
    }
    return prompts.length;
  },

  goalPromptActions(prompt, rerender) {
    const goal = prompt.goal;
    const archive = { label: goal.goalType === "holiday" ? "Archive trip" : "Archive goal", primary: true, opensModal: true, run: () => this.confirmArchiveGoal(goal, rerender) };
    const newDueDate = { label: "New due date", opensModal: true, run: () => this.openGoalDueDate(goal, rerender) };
    switch (prompt.kind) {
      case "trip-start":
        return [{ label: "Start trip mode", primary: true, run: async () => { await this.startTripFor(goal.file); await rerender(); } }];
      case "trip-end":
        return [{ label: "End trip mode", primary: true, run: async () => { await this.endTrip(); await rerender(); } }];
      case "trip-archive":
      case "goal-complete":
        return [archive];
      case "goal-due":
        return [archive, newDueDate];
      case "goal-due-soon":
        return [
          { label: "Contribute", primary: true, opensModal: true, run: () => this.openContribute({ goalKey: goal.goalKey, onDone: rerender }) },
          newDueDate,
        ];
      default:
        return [];
    }
  },

  async snoozePrompt(key, date = core.todayIsoLocal()) {
    // Only today's snoozes matter, so older ones are dropped rather than kept
    // in data.json forever.
    const kept = Object.entries(this.settings.promptSnoozes || {}).filter(([, day]) => day >= date);
    this.settings.promptSnoozes = Object.fromEntries([...kept, [key, date]]);
    await this.saveSettings();
  },

  async dismissPrompt(key) {
    this.settings.dismissedPrompts = Array.from(new Set([...(this.settings.dismissedPrompts || []), key]));
    await this.saveSettings();
  },

  async startTripFor(file) {
    if (!(file instanceof TFile)) return false;
    const meta = await this.readHolidayBudgetFile(file);
    if (!meta?.holidayKey) {
      new Notice("That note has no trip tag. Add trip_tag to its frontmatter first.");
      return false;
    }
    this.settings.activeTripGoalPath = file.path;
    this.settings.tripModeActive = true;
    await this.saveSettings();
    new Notice(`Trip mode on: ${meta.holidayName || meta.holidayKey}`);
    this.refreshDailyBudgetView();
    return true;
  },

  openNewGoal(onComplete) {
    const modal = new SavingsGoalModal(this.app, this, onComplete);
    modal.open();
    return modal;
  },

  openContribute(options = {}) {
    const modal = new ContributeGoalModal(this.app, this, options);
    modal.open();
    return modal;
  },

  confirmArchiveGoal(goal, onDone) {
    const name = goal.goalName || goal.goalKey;
    const modal = new FinanceConfirmModal(this.app, {
      title: `Archive ${name}?`,
      body: [
        "A summary of what was saved and spent is added to the end of the note, it's marked archived, and it moves to the archive folder.",
        "It leaves the goal lists, capture routing and the forecast. To undo, move it back and delete the archived line; File recovery keeps the version from before.",
      ],
      confirmLabel: "Archive",
      onConfirm: async () => {
        if (!(goal.file instanceof TFile)) throw new Error("the goal note could not be found");
        const path = await this.archiveGoalNote(goal.file);
        new Notice(`Archived ${name} to ${path}.`);
        this.refreshDailyBudgetView();
        if (typeof onDone === "function") await onDone();
      },
    });
    modal.open();
    return modal;
  },

  openGoalDueDate(goal, onDone) {
    const modal = new GoalDueDateModal(this.app, {
      name: goal.goalName || goal.goalKey,
      dueDate: goal.dueDate || "",
      onSave: async (date) => {
        await this.setGoalDueDate(goal, date);
        if (typeof onDone === "function") await onDone();
      },
    });
    modal.open();
    return modal;
  },

  async setGoalDueDate(goal, date) {
    const due = core.parseIsoDate(date);
    if (!due) throw new Error("that isn't a date");
    if (!(goal.file instanceof TFile)) throw new Error("the goal note could not be found");
    const content = await this.app.vault.read(goal.file);
    const next = updateFrontmatterValue(content, "due_date", due);
    if (next !== content) await _ftModify(this.app, goal.file, next);
    new Notice(`${goal.goalName || goal.goalKey} is now due ${due}.`);
    this.refreshDailyBudgetView();
  },
});
