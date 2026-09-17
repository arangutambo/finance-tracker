// The eight "Insert … block" commands were eight near-identical palette rows
// that pushed the commands doing real work further down the list. One entry
// opens this instead, where each block gets a sentence saying what it is —
// which the palette had no room for.
const INSERTABLE_BLOCKS = [
  {
    name: "Dashboard",
    block: DASHBOARD_BLOCK,
    body: "period: week",
    description: "Spend for a period: totals, income and savings rate, categories, top merchants, bills and budgets.",
  },
  {
    name: "Recurring payments",
    block: RECURRING_BLOCK,
    body: "",
    description: "Upcoming bills with their due dates, plus your runway target.",
  },
  {
    name: "Recurring payments (manage)",
    block: RECURRING_BLOCK,
    body: "manage: true",
    description: "As above, with Edit, Pause, Skip and Auto-log controls on each bill.",
  },
  {
    name: "Goals",
    block: GOALS_BLOCK,
    body: "",
    description: "Every savings goal and trip with progress bars and one-tap contributions.",
  },
  {
    name: "Runway",
    block: RUNWAY_BLOCK,
    body: "",
    description: "How much to keep available to be safe for a chosen period, from your bills.",
  },
  {
    name: "Split expenses",
    block: SPLITS_BLOCK,
    body: "",
    description: "Who owes you what, with one-tap settle up.",
  },
  {
    name: "Forecast",
    block: FORECAST_BLOCK,
    body: "months: 6",
    description: "Projects income minus bills and spending forward month by month.",
  },
  {
    name: "Accounts & portfolio",
    block: NETWORTH_BLOCK,
    body: "",
    description: "Account balances plus the share portfolio, and net worth over time.",
  },
  {
    name: "Portfolio",
    block: PORTFOLIO_BLOCK,
    body: "",
    description: "Holdings, value, gains, dividends and trades from the portfolio note.",
  },
  {
    name: "Query",
    block: QUERY_BLOCK,
    body: "period: month\ngroup: category\nview: table",
    description: "A filtered table or bar chart over any slice of your logged entries.",
  },
];

class InsertBlockModal extends Modal {
  constructor(app, plugin, editor, sourcePath = "") {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.sourcePath = sourcePath;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Insert a finance block" });
    const list = contentEl.createDiv({ cls: "finance-tracker-holiday-results" });

    const insert = (text) => {
      this.editor.replaceSelection(text);
      this.close();
    };

    for (const item of INSERTABLE_BLOCKS) {
      const option = list.createDiv({ cls: "finance-tracker-holiday-result" });
      option.createDiv({ cls: "finance-tracker-holiday-result-title", text: item.name });
      option.createDiv({ cls: "finance-tracker-holiday-result-path", text: item.description });
      option.addEventListener("click", () =>
        insert(`\`\`\`${item.block}\n${item.body ? `${item.body}\n` : ""}\`\`\`\n`)
      );
    }

    // Reviews compute once and paste finished numbers — a frozen snapshot, not
    // a live block — but this is where someone looks for "put finance in a note".
    // The period is the note's own: a weekly note gets its week.
    const referenceDate = this.plugin.getReferenceDateForSource(this.sourcePath);
    for (const [period, name, description] of [
      ["week", "Weekly review", "Spent, income and savings rate, where it went, top merchants and largest transactions for this note's week, as plain text."],
      ["month", "Monthly review", "The same review for this note's month."],
      ["quarter", "Quarter in review", "Totals, best and worst month, top categories and transfers for the quarter."],
      ["year", "Year in review", "The same summary for the whole year."],
    ]) {
      const option = list.createDiv({ cls: "finance-tracker-holiday-result" });
      option.createDiv({ cls: "finance-tracker-holiday-result-title", text: name });
      option.createDiv({ cls: "finance-tracker-holiday-result-path", text: description });
      option.addEventListener("click", async () => {
        const lines = await this.plugin.buildPeriodReview(period, referenceDate);
        insert(`${lines.join("\n")}\n`);
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ExportFolderModal extends Modal {
  constructor(app, plugin, suggestedFolder, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.suggestedFolder = suggestedFolder;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Choose export folder" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Pick the folder where this CSV should be saved for this export.",
    });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Utility/Exports",
      value: this.suggestedFolder || "Utility/Exports",
    });
    input.addClass("finance-tracker-holiday-input");

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const cancelButton = actions.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSubmit("");
    });

    const exportButton = actions.createEl("button", { text: "Export" });
    exportButton.addEventListener("click", async () => {
      const folder = (input.value || "").trim() || "Utility/Exports";
      this.close();
      await this.onSubmit(folder);
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        exportButton.click();
      }
    });

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
}

