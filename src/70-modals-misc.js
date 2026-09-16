// The eight "Insert … block" commands were eight near-identical palette rows
// that pushed the commands doing real work further down the list. One entry
// opens this instead, where each block gets a sentence saying what it is —
// which the palette had no room for.
const INSERTABLE_BLOCKS = [
  {
    name: "Dashboard",
    block: DASHBOARD_BLOCK,
    body: "period: week",
    description: "Spend for a period: totals, category donut, daily trend, budget progress.",
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
    name: "Net worth",
    block: NETWORTH_BLOCK,
    body: "",
    description: "Balance snapshots per account and the net-worth line over time.",
  },
  {
    name: "Query",
    block: QUERY_BLOCK,
    body: "period: month\ngroup: category\nview: table",
    description: "A filtered table or bar chart over any slice of your logged entries.",
  },
];

class InsertBlockModal extends Modal {
  constructor(app, plugin, editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
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
    for (const [period, name, description] of [
      ["year", "Year in review", "Totals, best/worst month, top categories and transfers for this year — inserted as plain text."],
      ["quarter", "Quarter in review", "The same summary, scoped to this quarter."],
    ]) {
      const option = list.createDiv({ cls: "finance-tracker-holiday-result" });
      option.createDiv({ cls: "finance-tracker-holiday-result-title", text: name });
      option.createDiv({ cls: "finance-tracker-holiday-result-path", text: description });
      option.addEventListener("click", async () => {
        const lines = await this.plugin.buildPeriodReview(period);
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

