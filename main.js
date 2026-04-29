"use strict";

const { Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } = require("obsidian");

const core = (() => {
  function splitLines(text) {
    return String(text || "").replace(/\r\n/g, "\n").split("\n");
  }

  function trimSlashes(value) {
    return String(value || "").replace(/^\/+|\/+$/g, "");
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeCurrency(value, fallback = "AUD") {
    const cleaned = String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
    return cleaned || fallback;
  }

  function parseNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = String(value || "")
      .trim()
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatPlainNumber(value) {
    return String(Number(Number(value || 0).toFixed(2)));
  }

  function formatCurrency(amount, currency = "AUD") {
    const numeric = Number(amount || 0);
    const code = normalizeCurrency(currency);
    try {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch (_error) {
      return `${code} ${numeric.toFixed(2)}`;
    }
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function todayIsoLocal(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseIsoDate(value) {
    const match = String(value || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function isoToDate(iso) {
    const normalized = parseIsoDate(iso);
    if (!normalized) return null;
    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, count) {
    const date = isoToDate(iso);
    if (!date) return null;
    date.setDate(date.getDate() + count);
    return todayIsoLocal(date);
  }

  function endOfMonth(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    return todayIsoLocal(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  }

  function titleCaseSegment(segment) {
    return String(segment || "")
      .split(/[-_ ]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function slugSegment(segment) {
    return normalizeWhitespace(segment)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9/_ -]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/]+|[-/]+$/g, "");
  }

  function normalizeCategoryPath(value) {
    const raw = String(value || "")
      .replace(/#/g, "")
      .replace(/>/g, "/");
    const segments = raw
      .split("/")
      .map((segment) => slugSegment(segment))
      .filter(Boolean);
    return segments.join("/");
  }

  function displayCategoryPath(value) {
    const normalized = normalizeCategoryPath(value);
    if (!normalized) return "Uncategorized";
    return normalized.split("/").map(titleCaseSegment).join(" / ");
  }

  function primaryCategory(value) {
    const normalized = normalizeCategoryPath(value);
    return normalized ? normalized.split("/")[0] : "uncategorized";
  }

  function buildCategoryTag(categoryPath) {
    const normalizedCategory = normalizeCategoryPath(categoryPath) || "uncategorized";
    return `#log/spending/${normalizedCategory}`;
  }

  function stripFirstTag(value) {
    return String(value || "").split("#")[0];
  }

  function extractVisibleAmount(line) {
    const visible = stripFirstTag(String(line || ""))
      .replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "")
      .trim();
    if (!visible) return null;
    const matches = Array.from(visible.matchAll(/-?\d+(?:[.,]\d+)?/g))
      .map((match) => Number(String(match[0]).replace(/,/g, "")))
      .filter((value) => Number.isFinite(value));
    if (!matches.length) return null;
    return matches[matches.length - 1];
  }

  function extractCategoryFromLogSpendingTag(line) {
    const matches = Array.from(String(line || "").matchAll(/#([^\s#\]]*\/spending\/[^\s#\]]+)/gi));
    if (!matches.length) return "";
    const fullTag = matches[matches.length - 1][1];
    const parts = fullTag.split("/");
    const spendingIndex = parts.findIndex((part) => part.toLowerCase() === "spending");
    if (spendingIndex < 0 || spendingIndex === parts.length - 1) return "";
    return normalizeCategoryPath(parts.slice(spendingIndex + 1).join("/"));
  }

  function extractNoteDate(content, filePath) {
    const frontmatterMatch = String(content || "").match(/^---[\s\S]*?\bdate:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/m);
    if (frontmatterMatch) {
      return frontmatterMatch[1];
    }
    const pathMatch = String(filePath || "").match(/(\d{4}-\d{2}-\d{2})\.md$/);
    if (pathMatch) {
      return pathMatch[1];
    }
    return null;
  }

  function extractChildLines(lines, startIndex) {
    const childLines = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = String(lines[index] || "");
      if (/^\t\t- /.test(line) || /^\s{4,}- /.test(line)) {
        childLines.push(line.replace(/^\s*-\s*/, "").trim());
        continue;
      }
      if (!line.trim()) continue;
      break;
    }
    return childLines;
  }

  function parseTransactionLine(line, noteDate, filePath, options = {}, childLines = []) {
    const text = String(line || "");
    if (!text.trimStart().startsWith("-")) return null;
    if (/^\s*-\s*\[[^\]]\]\s*#log\/spending\b/i.test(text)) return null;

    const amount = extractVisibleAmount(text);
    if (!Number.isFinite(amount)) return null;

    const category = extractCategoryFromLogSpendingTag(text) || "uncategorized";

    const currency = normalizeCurrency(options.defaultCurrency || "AUD");
    const merchant = normalizeWhitespace(childLines[0] || "");
    const note = normalizeWhitespace(childLines.slice(1).join(" | "));
    const transactionDate = noteDate || extractNoteDate("", filePath);

    return {
      amount: Number(Number(amount).toFixed(2)),
      category,
      categoryDisplay: displayCategoryPath(category),
      categoryPrimary: primaryCategory(category),
      currency,
      date: transactionDate,
      filePath,
      merchant,
      name: merchant,
      note,
      rawLine: text,
      source: "",
      card: "",
      transaction: "",
    };
  }

  function parseTransactionsFromNoteContent(content, filePath, options = {}) {
    const lines = splitLines(content);
    const noteDate = extractNoteDate(content, filePath);
    const transactions = [];
    let inSpendingSection = false;
    const spendingHeading = normalizeWhitespace(options.spendingHeading || "## Spending").toLowerCase();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (normalizeWhitespace(line).toLowerCase() === spendingHeading) {
        inSpendingSection = true;
        continue;
      }

      if (inSpendingSection && (/^#{1,6}\s+/.test(line.trim()) || /^---\s*$/.test(line.trim()))) {
        inSpendingSection = false;
      }

      if (!inSpendingSection) continue;
      if (/^\t\t- /.test(line) || /^\s{4,}- /.test(line)) continue;

      const parsed = parseTransactionLine(line, noteDate, filePath, options, extractChildLines(lines, index));
      if (parsed) {
        transactions.push(parsed);
      }
    }

    return transactions;
  }

  function calculateSpendingSectionTotal(sectionLines, noteDate, options = {}) {
    return Number(
      sectionLines
        .map((line) => parseTransactionLine(line, noteDate, "", options))
        .filter(Boolean)
        .reduce((sum, entry) => sum + entry.amount, 0)
        .toFixed(2)
    );
  }

  function buildTransactionBlock(expense, settings = {}) {
    const category = normalizeCategoryPath(expense.category || "");
    const currency = normalizeCurrency(expense.currency || settings.defaultCurrency || "AUD");
    const merchant = normalizeWhitespace(expense.merchant || "");
    const note = normalizeWhitespace(expense.note || "");
    const date = parseIsoDate(expense.date) || todayIsoLocal();
    const amount = Number(Number(expense.amount || 0).toFixed(2));

    const tag = buildCategoryTag(category);
    const visibleLabel = formatCurrency(amount, currency);
    const lines = [`\t- ${visibleLabel} ${tag}`.trimEnd()];

    if (merchant) {
      lines.push(`\t\t- ${merchant}`);
    }

    if (note) {
      lines.push(`\t\t- ${note}`);
    }

    return lines;
  }

  function insertTransactionIntoDailyNote(content, expense, settings = {}) {
    const lines = splitLines(content);
    const noteDate = parseIsoDate(expense.date) || extractNoteDate(content, "") || todayIsoLocal();
    const spendingHeading = normalizeWhitespace(settings.spendingHeading || "## Spending");
    const rootTag = normalizeWhitespace(settings.spendingRootTag || "#log/spending");
    const rootLinePrefix = `- [ ] ${rootTag}`;
    let headingIndex = lines.findIndex((line) => normalizeWhitespace(line).toLowerCase() === spendingHeading.toLowerCase());

    if (headingIndex === -1) {
      if (lines.length && normalizeWhitespace(lines[lines.length - 1])) {
        lines.push("");
      }
      lines.push(spendingHeading);
      lines.push(`${rootLinePrefix} 0`);
      lines.push("");
      headingIndex = lines.findIndex((line) => normalizeWhitespace(line).toLowerCase() === spendingHeading.toLowerCase());
    }

    const findSectionEnd = () => {
      for (let index = headingIndex + 1; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (/^#{1,6}\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) {
          return index;
        }
      }
      return lines.length;
    };

    let sectionEnd = findSectionEnd();
    let rootLineIndex = -1;
    for (let index = headingIndex + 1; index < sectionEnd; index += 1) {
      if (new RegExp(`^- \\[[^\\]]\\] ${rootTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(lines[index].trim())) {
        rootLineIndex = index;
        break;
      }
    }

    if (rootLineIndex === -1) {
      lines.splice(headingIndex + 1, 0, `${rootLinePrefix} 0`);
      rootLineIndex = headingIndex + 1;
      sectionEnd += 1;
    }

    const entryLines = buildTransactionBlock(expense, settings);
    let insertIndex = sectionEnd;
    while (insertIndex > rootLineIndex + 1 && !normalizeWhitespace(lines[insertIndex - 1])) {
      insertIndex -= 1;
    }
    lines.splice(insertIndex, 0, ...entryLines);

    sectionEnd = findSectionEnd();
    const total = calculateSpendingSectionTotal(lines.slice(rootLineIndex + 1, sectionEnd), noteDate, {
      defaultCurrency: settings.defaultCurrency || "AUD",
    });
    lines[rootLineIndex] = `${rootLinePrefix} ${formatPlainNumber(total)}`;

    return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n")}\n`;
  }

  function toPeriodRange({ period = "week", referenceDate, start, end }) {
    const normalizedPeriod = String(period || "week").toLowerCase();
    if (parseIsoDate(start) && parseIsoDate(end)) {
      return { period: normalizedPeriod, start: parseIsoDate(start), end: parseIsoDate(end) };
    }

    const anchor = parseIsoDate(referenceDate) || todayIsoLocal();
    if (normalizedPeriod === "month") {
      return { period: normalizedPeriod, start: anchor.slice(0, 8) + "01", end: endOfMonth(anchor) };
    }

    if (normalizedPeriod === "day") {
      return { period: normalizedPeriod, start: anchor, end: anchor };
    }

    return { period: "week", start: anchor, end: addDays(anchor, 6) };
  }

  function isDateInRange(date, range) {
    const normalizedDate = parseIsoDate(date);
    if (!normalizedDate) return false;
    return normalizedDate >= range.start && normalizedDate <= range.end;
  }

  function groupTransactionsByCategory(entries, groupBy = "primary") {
    const useFull = String(groupBy || "primary").toLowerCase() === "full";
    const grouped = new Map();

    for (const entry of entries) {
      const key = useFull
        ? normalizeCategoryPath(entry.category || "uncategorized") || "uncategorized"
        : primaryCategory(entry.category || "uncategorized");
      const label = useFull ? displayCategoryPath(key) : titleCaseSegment(key);
      const current = grouped.get(key) || {
        key,
        label,
        total: 0,
        count: 0,
      };
      current.total += Number(entry.amount || 0);
      current.count += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.total - left.total);
  }

  function parseMarkdownTable(content) {
    const lines = splitLines(content);
    const tables = [];
    let index = 0;

    while (index < lines.length) {
      if (!/^\s*\|/.test(lines[index])) {
        index += 1;
        continue;
      }

      const header = lines[index];
      const separator = lines[index + 1];
      if (!separator || !/^\s*\|?[\s:-]+\|/.test(separator)) {
        index += 1;
        continue;
      }

      const headerCells = header
        .split("|")
        .slice(1, -1)
        .map((cell) => normalizeWhitespace(cell).toLowerCase());

      const rows = [];
      index += 2;
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        const cells = lines[index]
          .split("|")
          .slice(1, -1)
          .map((cell) => normalizeWhitespace(cell));
        if (cells.length === headerCells.length) {
          const row = {};
          for (let cellIndex = 0; cellIndex < headerCells.length; cellIndex += 1) {
            row[headerCells[cellIndex]] = cells[cellIndex];
          }
          rows.push(row);
        }
        index += 1;
      }

      tables.push(rows);
    }

    return tables;
  }

  function parseBudgets(content, fallbackCurrency = "AUD") {
    const tables = parseMarkdownTable(content);
    const budgets = [];

    for (const rows of tables) {
      for (const row of rows) {
        const limit = parseNumber(row.limit || row.budget || row.amount || row.cap);
        const category = normalizeCategoryPath(row.category || row.tag || "");
        const period = String(row.period || "week").toLowerCase();
        if (!Number.isFinite(limit) || !category) continue;
        budgets.push({
          name: normalizeWhitespace(row.name || displayCategoryPath(category)),
          category,
          currency: normalizeCurrency(row.currency || fallbackCurrency, fallbackCurrency),
          limit: Number(limit.toFixed(2)),
          period: ["day", "week", "month"].includes(period) ? period : "week",
        });
      }
    }

    return budgets;
  }

  function buildCsv(entries) {
    const headers = [
      "date",
      "amount",
      "currency",
      "category",
      "category_display",
      "card",
      "merchant",
      "name",
      "note",
      "transaction",
      "source",
      "file_path",
    ];

    const escapeCell = (value) => {
      const text = String(value ?? "");
      if (!/[",\n]/.test(text)) return text;
      return `"${text.replace(/"/g, "\"\"")}"`;
    };

    const rows = entries.map((entry) => [
      entry.date || "",
      formatPlainNumber(entry.amount || 0),
      entry.currency || "",
      entry.category || "",
      entry.categoryDisplay || "",
      entry.card || "",
      entry.merchant || "",
      entry.name || "",
      entry.note || "",
      entry.transaction || "",
      entry.source || "",
      entry.filePath || "",
    ]);

    return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
  }

  return {
    buildCategoryTag,
    buildCsv,
    calculateSpendingSectionTotal,
    displayCategoryPath,
    extractCategoryFromLogSpendingTag,
    extractNoteDate,
    formatCurrency,
    formatPlainNumber,
    groupTransactionsByCategory,
    insertTransactionIntoDailyNote,
    isDateInRange,
    normalizeCategoryPath,
    normalizeCurrency,
    parseBudgets,
    parseIsoDate,
    parseNumber,
    parseTransactionsFromNoteContent,
    primaryCategory,
    toPeriodRange,
    todayIsoLocal,
  };
})();

const DEFAULT_SETTINGS = {
  dailyNotesFolder: "Journal/Periodics/1. Daily",
  spendingHeading: "## Spending",
  spendingRootTag: "#log/spending",
  defaultCurrency: "AUD",
  budgetNotePath: "Utility/Finance/Budgets.md",
  csvExportFolder: "Utility/Exports",
  categoryOptions: [
    "food/groceries",
    "food/restaurants",
    "food/snacks",
    "transport",
    "subscription",
    "medical",
    "clothes",
    "kitesurf",
    "uncategorized",
  ],
  openDailyNoteAfterCapture: false,
  dashboardDefaultGroupBy: "primary",
  dashboardSliceLabelThreshold: 0.08,
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const PIE_COLORS = [
  "#2B6CB0",
  "#2F855A",
  "#C05621",
  "#D69E2E",
  "#9B2C2C",
  "#2C5282",
  "#276749",
  "#744210",
  "#805AD5",
  "#319795",
  "#B83280",
  "#4A5568",
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "finance";
}

function parseConfigBlock(source) {
  const config = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.+)$/);
    if (!match) continue;
    config[match[1].toLowerCase()] = match[2].trim();
  }
  return config;
}

function normalizeCategoryOptions(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/);
  return Array.from(
    new Set(
      items
        .map((item) => core.normalizeCategoryPath(item))
        .filter(Boolean)
    )
  );
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describePieSlice(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M",
    centerX,
    centerY,
    "L",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

function centroidForSlice(centerX, centerY, radius, startAngle, endAngle) {
  const midpoint = startAngle + (endAngle - startAngle) / 2;
  return polarToCartesian(centerX, centerY, radius * 0.6, midpoint);
}

class FinanceTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addSettingTab(new FinanceTrackerSettingTab(this.app, this));

    this.addCommand({
      id: "finance-tracker-export-csv",
      name: "Export finance transactions to CSV",
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
      name: "Open finance budgets note",
      callback: async () => {
        await this.openBudgetNote();
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
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.categoryOptions = normalizeCategoryOptions(this.settings.categoryOptions || DEFAULT_SETTINGS.categoryOptions);
  }

  async saveSettings() {
    await this.saveData(this.settings);
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

  getDailyNotePath(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    const [year, month] = iso.split("-");
    return normalizePath(`${this.settings.dailyNotesFolder}/${year}/${month}/${iso}.md`);
  }

  buildMinimalDailyNote(date) {
    const iso = core.parseIsoDate(date) || core.todayIsoLocal();
    return `---\ndate: ${iso}\n---\n\n## Spending\n- [ ] #log/spending 0\n`;
  }

  async upsertFile(path, content) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    await this.ensureFolder(normalizedPath.split("/").slice(0, -1).join("/"));
    return this.app.vault.create(normalizedPath, content);
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
    const amount = core.parseNumber(params.amount || params.total);
    if (!Number.isFinite(amount)) {
      throw new Error("Missing or invalid amount.");
    }

    const categoryFromTag = core.extractCategoryFromLogSpendingTag(`#${String(params.tag || "").replace(/^#/, "")}`);
    const category = core.normalizeCategoryPath(params.category || categoryFromTag || "") || "uncategorized";
    return {
      amount,
      category,
      currency: core.normalizeCurrency(params.currency || this.settings.defaultCurrency),
      date: core.parseIsoDate(params.date) || core.todayIsoLocal(),
      card: String(params.card || params.pass || "").trim(),
      merchant: String(params.merchant || params.payee || params.name || "").trim(),
      name: String(params.name || params.merchant || params.payee || "").trim(),
      note: String(params.note || params.memo || "").trim(),
      originalAmount: core.parseNumber(params.originalamount || params.originalAmount),
      originalCurrency: String(params.originalcurrency || params.originalCurrency || "").trim(),
      source: String(params.source || "apple-pay").trim(),
      transaction: String(params.transaction || "").trim(),
    };
  }

  async handleCapture(params) {
    try {
      const expense = this.parseCaptureParams(params);
      const notePath = this.getDailyNotePath(expense.date);
      const file =
        this.app.vault.getAbstractFileByPath(notePath) instanceof TFile
          ? this.app.vault.getAbstractFileByPath(notePath)
          : await this.ensureTextFile(notePath, () => this.buildMinimalDailyNote(expense.date));

      const currentContent = await this.app.vault.cachedRead(file);
      const nextContent = core.insertTransactionIntoDailyNote(currentContent, expense, this.settings);
      await this.app.vault.modify(file, nextContent);

      if (this.settings.openDailyNoteAfterCapture) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }

      new Notice(`Logged ${core.formatCurrency(expense.amount, expense.currency)} to ${expense.date}`);
    } catch (error) {
      new Notice(`Finance capture failed: ${error.message}`);
    }
  }

  async collectTransactionsForRange(range) {
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix))
      .filter((file) => {
        const pathDate = core.extractNoteDate("", file.path);
        if (!pathDate) return true;
        return core.isDateInRange(pathDate, range);
      });

    const entries = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const parsed = core.parseTransactionsFromNoteContent(content, file.path, {
        defaultCurrency: this.settings.defaultCurrency,
        spendingHeading: this.settings.spendingHeading,
      }).filter((entry) => core.isDateInRange(entry.date, range));
      entries.push(...parsed);
    }

    return entries.sort((left, right) => {
      if (left.date === right.date) return (left.filePath || "").localeCompare(right.filePath || "");
      return String(left.date || "").localeCompare(String(right.date || ""));
    });
  }

  async exportEntriesToCsv(entries, label) {
    await this.ensureFolder(this.settings.csvExportFolder);
    const fileName = `${sanitizeFilePart(label)}.csv`;
    const outputPath = normalizePath(`${this.settings.csvExportFolder}/${fileName}`);
    const csv = core.buildCsv(entries);
    const file = await this.upsertFile(outputPath, csv);
    new Notice(`Exported ${entries.length} transactions to ${file.path}`);
    return file;
  }

  async ensureBudgetNote() {
    return this.ensureTextFile(this.settings.budgetNotePath, () => this.buildBudgetNoteContent());
  }

  async openBudgetNote() {
    const file = await this.ensureBudgetNote();
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  buildBudgetNoteContent() {
    return [
      "# Finance Budgets",
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
      "- `Period` can be `day`, `week`, or `month`.",
      "- `Category` can be a top-level group like `food` or a more specific path like `food/restaurants`.",
      "- Use `all` if you want an overall budget progress bar.",
      "",
    ].join("\n");
  }

  async loadBudgets() {
    const file = await this.ensureBudgetNote();
    const content = await this.app.vault.cachedRead(file);
    return core.parseBudgets(content, this.settings.defaultCurrency);
  }

  getReferenceDateForSource(sourcePath) {
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (sourceFile instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      const frontmatterDate = core.parseIsoDate(cache?.frontmatter?.date);
      if (frontmatterDate) return frontmatterDate;
      const pathDate = core.extractNoteDate("", sourceFile.path);
      if (pathDate) return pathDate;
    }
    return core.todayIsoLocal();
  }

  buildBudgetProgress(entries, budgets, period, groupBy) {
    const useFull = String(groupBy || "primary").toLowerCase() === "full";
    const matchingBudgets = budgets.filter((budget) => budget.period === period || (period === "week" && budget.period === "all"));
    return matchingBudgets
      .map((budget) => {
        const spent = entries
          .filter((entry) => {
            if (budget.category === "all") return true;
            if (useFull) {
              return entry.category === budget.category || String(entry.category || "").startsWith(`${budget.category}/`);
            }
            return core.primaryCategory(entry.category) === core.primaryCategory(budget.category);
          })
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const limit = Number(budget.limit || 0);
        const ratio = limit > 0 ? spent / limit : 0;
        return {
          ...budget,
          remaining: Number((limit - spent).toFixed(2)),
          ratio,
          spent: Number(spent.toFixed(2)),
        };
      })
      .filter((budget) => Number.isFinite(budget.limit) && budget.limit > 0);
  }

  renderSummary(wrapper, entries, currency, range) {
    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
    const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const count = entries.length;
    const grouped = core.groupTransactionsByCategory(entries, "primary");
    const topCategory = grouped[0]?.label || "None";
    const periodLabel = range.start === range.end ? range.start : `${range.start} to ${range.end}`;

    const cardData = [
      { label: "Total", value: core.formatCurrency(total, currency) },
      { label: "Transactions", value: String(count) },
      { label: "Top Category", value: topCategory },
      { label: "Period", value: periodLabel },
    ];

    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
  }

  renderPieChart(wrapper, groups, currency, threshold = 0.08) {
    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: "Category Proportions" });

    const total = groups.reduce((sum, group) => sum + group.total, 0);
    if (!total) {
      pieSection.createDiv({ cls: "finance-tracker-empty", text: "No categorized spending found for this period." });
      return;
    }

    const size = 460;
    const center = size / 2;
    const radius = 180;
    let angle = 0;

    const slices = groups.map((group, index) => {
      const ratio = group.total / total;
      const angleSize = ratio * 360;
      const startAngle = angle;
      const endAngle = angle + angleSize;
      angle += angleSize;
      return {
        ...group,
        color: PIE_COLORS[index % PIE_COLORS.length],
        ratio,
        startAngle,
        endAngle,
      };
    });

    const svgParts = [
      `<svg viewBox="0 0 ${size} ${size}" class="finance-tracker-pie-svg" role="img" aria-label="Spending by category pie chart">`,
    ];

    for (const slice of slices) {
      if (slice.ratio >= 0.999) {
        svgParts.push(
          `<circle cx="${center}" cy="${center}" r="${radius}" fill="${slice.color}" class="finance-tracker-pie-slice"></circle>`
        );
      } else {
        svgParts.push(
          `<path d="${describePieSlice(center, center, radius, slice.startAngle, slice.endAngle)}" fill="${slice.color}" class="finance-tracker-pie-slice"></path>`
        );
      }

      if (slice.ratio >= threshold) {
        const labelPoint = centroidForSlice(center, center, radius, slice.startAngle, slice.endAngle);
        const amount = escapeHtml(core.formatCurrency(slice.total, currency));
        const label = escapeHtml(slice.label);
        svgParts.push(
          `<text x="${labelPoint.x}" y="${labelPoint.y - 8}" class="finance-tracker-pie-label" text-anchor="middle">${label}</text>`
        );
        svgParts.push(
          `<text x="${labelPoint.x}" y="${labelPoint.y + 12}" class="finance-tracker-pie-value" text-anchor="middle">${amount}</text>`
        );
      }
    }

    svgParts.push("</svg>");

    const chartLayout = pieSection.createDiv({ cls: "finance-tracker-pie-layout" });
    const chartHost = chartLayout.createDiv({ cls: "finance-tracker-pie-host" });
    chartHost.innerHTML = svgParts.join("");

    const legend = chartLayout.createDiv({ cls: "finance-tracker-legend" });
    for (const slice of slices) {
      const item = legend.createDiv({ cls: "finance-tracker-legend-item" });
      const swatch = item.createDiv({ cls: "finance-tracker-legend-swatch" });
      swatch.style.backgroundColor = slice.color;
      item.createDiv({
        cls: "finance-tracker-legend-label",
        text: `${slice.label} - ${core.formatCurrency(slice.total, currency)} (${Math.round(slice.ratio * 100)}%)`,
      });
    }
  }

  renderBudgets(wrapper, budgets, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Budget Progress" });

    if (!budgets.length) {
      section.createDiv({ cls: "finance-tracker-empty", text: "No matching budgets for this period yet." });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const budget of budgets) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      const status = budget.ratio > 1 ? "is-over" : budget.ratio > 0.8 ? "is-near" : "is-good";
      item.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${budget.name} - ${core.formatCurrency(budget.spent, currency)} / ${core.formatCurrency(budget.limit, currency)}`,
      });
      const metaText =
        budget.remaining >= 0
          ? `${core.formatCurrency(budget.remaining, currency)} remaining`
          : `${core.formatCurrency(Math.abs(budget.remaining), currency)} over budget`;
      item.createDiv({ cls: "finance-tracker-budget-meta", text: metaText });

      const bar = item.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = bar.createDiv({ cls: `finance-tracker-budget-fill ${status}` });
      fill.style.width = `${Math.min(budget.ratio, 1.4) * 100}%`;
    }
  }

  async renderDashboard(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const range = core.toPeriodRange({
      period: config.period || "week",
      referenceDate,
      start: config.start,
      end: config.end,
    });
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const groupBy = String(config.groupby || this.settings.dashboardDefaultGroupBy || "primary").toLowerCase();

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", {
      text: config.title || `Finance Dashboard: ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}`,
    });

    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const exportButton = headerActions.createEl("button", { text: "Export CSV" });
    exportButton.addEventListener("click", async () => {
      const entries = await this.collectTransactionsForRange(range);
      await this.exportEntriesToCsv(entries, `finance-${range.start}-${range.end}`);
    });

    const budgetsButton = headerActions.createEl("button", { text: "Budgets" });
    budgetsButton.addEventListener("click", async () => {
      await this.openBudgetNote();
    });

    const entries = await this.collectTransactionsForRange(range);
    this.renderSummary(wrapper, entries, currency, range);

    const grouped = core.groupTransactionsByCategory(entries, groupBy);
    this.renderPieChart(wrapper, grouped, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));

    const budgets = await this.loadBudgets();
    const budgetProgress = this.buildBudgetProgress(entries, budgets, range.period, groupBy);
    this.renderBudgets(wrapper, budgetProgress, currency);
  }
}

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
      text: "Configure capture behavior, dashboard defaults, export paths, and the category list you use in Apple Shortcuts.",
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

    addSection("Capture", "These settings control where spending is written and how captured transactions are logged.");

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Folder that stores your daily notes in the YYYY/MM/YYYY-MM-DD.md structure.")
      .addText((text) =>
        text.setPlaceholder("Journal/Periodics/1. Daily").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (value) => {
          this.plugin.settings.dailyNotesFolder = value.trim() || DEFAULT_SETTINGS.dailyNotesFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Spending heading")
      .setDesc("Heading used when the plugin looks for your spending section.")
      .addText((text) =>
        text.setPlaceholder("## Spending").setValue(this.plugin.settings.spendingHeading).onChange(async (value) => {
          this.plugin.settings.spendingHeading = value.trim() || DEFAULT_SETTINGS.spendingHeading;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Spending root tag")
      .setDesc("The root task line the plugin updates in your daily note.")
      .addText((text) =>
        text.setPlaceholder("#log/spending").setValue(this.plugin.settings.spendingRootTag).onChange(async (value) => {
          this.plugin.settings.spendingRootTag = value.trim() || DEFAULT_SETTINGS.spendingRootTag;
          await this.plugin.saveSettings();
        })
      );

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
      .setName("Open note after capture")
      .setDesc("Open the daily note immediately after an Apple Shortcut logs a transaction.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openDailyNoteAfterCapture).onChange(async (value) => {
          this.plugin.settings.openDailyNoteAfterCapture = value;
          await this.plugin.saveSettings();
        })
      );

    addSection("Categories", "Use one category per line. These are the values to mirror in your Apple Shortcuts menu.");

    new Setting(containerEl)
      .setName("Shortcut categories")
      .setDesc("Examples: food/groceries, food/restaurants, transport, subscription")
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.categoryOptions.join("\n"))
          .setValue((this.plugin.settings.categoryOptions || []).join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.categoryOptions = normalizeCategoryOptions(value);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 10;
        text.inputEl.addClass("finance-tracker-settings-textarea");
      });

    addSection("Dashboard", "These defaults shape the weekly finance dashboard code block.");

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
      .setName("Pie label threshold")
      .setDesc("Minimum slice ratio shown with labels inside the chart. Example: 0.08 = 8%.")
      .addText((text) =>
        text
          .setPlaceholder("0.08")
          .setValue(String(this.plugin.settings.dashboardSliceLabelThreshold))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.dashboardSliceLabelThreshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SETTINGS.dashboardSliceLabelThreshold;
            await this.plugin.saveSettings();
          })
      );

    addSection("Files", "Budget and CSV locations used by the plugin.");

    new Setting(containerEl)
      .setName("Budget note path")
      .setDesc("Markdown note that stores your budget table.")
      .addText((text) =>
        text.setPlaceholder("Utility/Finance/Budgets.md").setValue(this.plugin.settings.budgetNotePath).onChange(async (value) => {
          this.plugin.settings.budgetNotePath = value.trim() || DEFAULT_SETTINGS.budgetNotePath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("CSV export folder")
      .setDesc("Where CSV exports should be written.")
      .addText((text) =>
        text.setPlaceholder("Utility/Exports").setValue(this.plugin.settings.csvExportFolder).onChange(async (value) => {
          this.plugin.settings.csvExportFolder = value.trim() || DEFAULT_SETTINGS.csvExportFolder;
          await this.plugin.saveSettings();
        })
      );

    const actions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const openBudgetsButton = actions.createEl("button", { text: "Open Budgets Note" });
    openBudgetsButton.addEventListener("click", async () => {
      await this.plugin.openBudgetNote();
    });

    const help = containerEl.createDiv({ cls: "finance-tracker-settings-help" });
    help.createEl("p", {
      text: `Shortcut URL action: obsidian://${FINANCE_CAPTURE_ACTION}?vault=<vault>&amount=12.50&merchant=Coles&name=Coles&card=Visa&category=food/groceries&source=apple-pay`,
    });
    help.createEl("p", {
      text: "New entries are written as plain markdown using only #log/spending/{{category}} tags.",
    });
    help.createEl("p", {
      text: `Suggested categories: ${(this.plugin.settings.categoryOptions || []).join(", ")}`,
    });
    help.createEl("p", {
      text: `Weekly dashboard block: \`\`\`${DASHBOARD_BLOCK}\nperiod: week\ngroupBy: primary\n\`\`\``,
    });
  }
}

module.exports = FinanceTrackerPlugin;
