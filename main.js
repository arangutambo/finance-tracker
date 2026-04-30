"use strict";

const { Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } = require("obsidian");

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
    const aliases = {
      AUSD: "AUD",
      AUD: "AUD",
      CAD: "CAD",
      CNY: "CNY",
      EUR: "EUR",
      GBP: "GBP",
      HKD: "HKD",
      JPY: "JPY",
      NZD: "NZD",
      SGD: "SGD",
      USD: "USD",
      YEN: "JPY",
    };
    return aliases[cleaned] || cleaned || fallback;
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

  function formatCurrencyWithCode(amount, currency = "AUD") {
    const numeric = Number(amount || 0);
    const code = normalizeCurrency(currency);
    const symbols = {
      AUD: "$",
      CAD: "$",
      CNY: "¥",
      EUR: "€",
      GBP: "£",
      HKD: "$",
      JPY: "¥",
      NZD: "$",
      SGD: "$",
      USD: "$",
    };
    const fractionDigits = code === "JPY" ? 0 : 2;
    const formattedNumber = new Intl.NumberFormat("en-AU", {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(numeric);
    const symbol = symbols[code];
    if (symbol) {
      return `${symbol}${formattedNumber} ${code}`;
    }
    return `${code} ${formattedNumber}`;
  }

  function parseCurrencyDescriptor(value, fallback = "AUD") {
    const raw = String(value || "").trim().toUpperCase();
    const isCash = /\bCASH\b/.test(raw);
    const base = raw.replace(/\bCASH\b/g, " ").trim();
    const currencyMatch = base.match(/\b([A-Z]{3,}|YEN)\b/);
    const currency = normalizeCurrency(currencyMatch ? currencyMatch[1] : fallback, fallback);
    return {
      currency,
      isCash,
      rateKey: isCash ? `${currency}_CASH` : currency,
    };
  }

  function formatOriginalCurrencyLabel(amount, descriptor) {
    const parsed = typeof descriptor === "string" ? parseCurrencyDescriptor(descriptor, "") : descriptor || {};
    const label = formatCurrencyWithCode(amount, parsed.currency || "AUD");
    return parsed.isCash ? `${label} CASH` : label;
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

  function startOfWeek(iso, weekStartsOn = "monday") {
    const date = isoToDate(iso);
    if (!date) return null;
    const weekStartIndex = String(weekStartsOn || "monday").toLowerCase() === "sunday" ? 0 : 1;
    const diff = (date.getDay() - weekStartIndex + 7) % 7;
    date.setDate(date.getDate() - diff);
    return todayIsoLocal(date);
  }

  function endOfQuarter(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
    return todayIsoLocal(new Date(date.getFullYear(), quarterStartMonth + 3, 0));
  }

  function startOfQuarter(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
    return todayIsoLocal(new Date(date.getFullYear(), quarterStartMonth, 1));
  }

  function startOfYear(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    return todayIsoLocal(new Date(date.getFullYear(), 0, 1));
  }

  function endOfYear(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    return todayIsoLocal(new Date(date.getFullYear(), 11, 31));
  }

  function startOfBiMonth(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    const month = date.getMonth();
    const biMonthStart = month % 2 === 0 ? month : month - 1;
    return todayIsoLocal(new Date(date.getFullYear(), biMonthStart, 1));
  }

  function endOfBiMonth(iso) {
    const date = isoToDate(iso);
    if (!date) return null;
    const month = date.getMonth();
    const biMonthStart = month % 2 === 0 ? month : month - 1;
    return todayIsoLocal(new Date(date.getFullYear(), biMonthStart + 2, 0));
  }

  function startOfFortnight(iso, weekStartsOn = "monday") {
    const anchor = startOfWeek(iso, weekStartsOn);
    const anchorDate = isoToDate(anchor);
    if (!anchorDate) return null;
    const yearStart = todayIsoLocal(new Date(anchorDate.getFullYear(), 0, 1));
    const firstPeriodStart = startOfWeek(yearStart, weekStartsOn);
    const firstDate = isoToDate(firstPeriodStart);
    const diffDays = Math.floor((anchorDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000));
    const fortnightIndex = Math.floor(diffDays / 14);
    return addDays(firstPeriodStart, fortnightIndex * 14);
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

  function normalizeHolidayKey(value) {
    const raw = String(value || "").replace(/^#/, "");
    const normalized = normalizeCategoryPath(raw);
    const spendingMatch = normalized.match(/(?:^|\/)spending\/(.+)$/i);
    const candidate = spendingMatch ? spendingMatch[1] : normalized;
    const segments = candidate.split("/").filter(Boolean);
    if (segments.length < 2) return "";
    return `${segments[0]}/${segments[1]}`;
  }

  function parseHolidayTagContext(value) {
    const normalized = normalizeCategoryPath(value);
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length >= 3 && /^(?:\d{2}|\d{4})$/.test(segments[0])) {
      return {
        holidayCategory: segments.slice(2).join("/") || "uncategorized",
        holidayKey: `${segments[0]}/${segments[1]}`,
        holidayName: segments[1],
        holidayYear: segments[0],
      };
    }
    return {
      holidayCategory: normalized || "uncategorized",
      holidayKey: "",
      holidayName: "",
      holidayYear: "",
    };
  }

  function buildCategoryTag(categoryPath, holidayKey = "") {
    const normalizedCategory = normalizeCategoryPath(categoryPath) || "uncategorized";
    const normalizedHolidayKey = normalizeHolidayKey(holidayKey);
    return normalizedHolidayKey
      ? `#log/spending/${normalizedHolidayKey}/${normalizedCategory}`
      : `#log/spending/${normalizedCategory}`;
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

    const tagPath = extractCategoryFromLogSpendingTag(text) || "uncategorized";
    const holidayContext = parseHolidayTagContext(tagPath);
    const category = holidayContext.holidayCategory || "uncategorized";

    const currency = normalizeCurrency(options.defaultCurrency || "AUD");
    const visibleSection = stripFirstTag(text).replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "").trim();
    const originalSide = visibleSection.includes(":") ? visibleSection.split(":")[0].trim() : "";
    const originalAmount = extractVisibleAmount(`- ${originalSide}`);
    const originalDescriptor = parseCurrencyDescriptor(originalSide, currency);
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
      holidayKey: holidayContext.holidayKey,
      holidayName: holidayContext.holidayName,
      holidayYear: holidayContext.holidayYear,
      merchant,
      name: merchant,
      note,
      originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
      originalCurrency: originalSide ? originalDescriptor.currency : "",
      originalRateKey: originalSide ? originalDescriptor.rateKey : "",
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

    const tag = buildCategoryTag(category, expense.holidayKey || "");
    const originalDescriptor = {
      currency: normalizeCurrency(expense.originalCurrency || "", ""),
      isCash: /_CASH$/i.test(String(expense.originalRateKey || "")),
      rateKey: String(expense.originalRateKey || ""),
    };
    const shouldShowConverted =
      Number.isFinite(expense.originalAmount) &&
      originalDescriptor.currency &&
      originalDescriptor.currency !== currency;
    const visibleLabel = shouldShowConverted
      ? `${formatOriginalCurrencyLabel(expense.originalAmount, originalDescriptor)} : ${formatCurrencyWithCode(amount, currency)}`
      : formatCurrency(amount, currency);
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

  function toPeriodRange({ period = "week", referenceDate, start, end, weekStartsOn = "monday" }) {
    const normalizedPeriod = String(period || "week").toLowerCase();
    if (parseIsoDate(start) && parseIsoDate(end)) {
      return { period: normalizedPeriod, start: parseIsoDate(start), end: parseIsoDate(end) };
    }

    const anchor = parseIsoDate(referenceDate) || todayIsoLocal();
    if (normalizedPeriod === "year" || normalizedPeriod === "yearly" || normalizedPeriod === "annual") {
      return { period: "year", start: startOfYear(anchor), end: endOfYear(anchor) };
    }

    if (normalizedPeriod === "quarter" || normalizedPeriod === "quarterly") {
      return { period: "quarter", start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    }

    if (normalizedPeriod === "bimonth" || normalizedPeriod === "bi-month" || normalizedPeriod === "bi-monthly") {
      return { period: "bimonth", start: startOfBiMonth(anchor), end: endOfBiMonth(anchor) };
    }

    if (normalizedPeriod === "month") {
      return { period: normalizedPeriod, start: anchor.slice(0, 8) + "01", end: endOfMonth(anchor) };
    }

    if (normalizedPeriod === "fortnight" || normalizedPeriod === "2-weeks" || normalizedPeriod === "2weeks") {
      const periodStart = startOfFortnight(anchor, weekStartsOn);
      return { period: "fortnight", start: periodStart, end: addDays(periodStart, 13) };
    }

    if (normalizedPeriod === "day") {
      return { period: normalizedPeriod, start: anchor, end: anchor };
    }

    const periodStart = startOfWeek(anchor, weekStartsOn);
    return { period: "week", start: periodStart, end: addDays(periodStart, 6) };
  }

  function isDateInRange(date, range) {
    const normalizedDate = parseIsoDate(date);
    if (!normalizedDate) return false;
    return normalizedDate >= range.start && normalizedDate <= range.end;
  }

  function daysBetweenInclusive(start, end) {
    const startDate = isoToDate(start);
    const endDate = isoToDate(end);
    if (!startDate || !endDate) return 1;
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, diff + 1);
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
          period: ["day", "week", "fortnight", "month", "bimonth", "quarter", "year"].includes(period)
            ? period
            : period === "bi-month" || period === "bi-monthly"
              ? "bimonth"
              : period === "quarterly"
                ? "quarter"
                : period === "yearly" || period === "annual"
                  ? "year"
                : "week",
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
    daysBetweenInclusive,
    displayCategoryPath,
    extractCategoryFromLogSpendingTag,
    extractNoteDate,
    formatCurrency,
    formatCurrencyWithCode,
    formatOriginalCurrencyLabel,
    formatPlainNumber,
    groupTransactionsByCategory,
    insertTransactionIntoDailyNote,
    isDateInRange,
    normalizeCategoryPath,
    normalizeCurrency,
    normalizeHolidayKey,
    parseCurrencyDescriptor,
    parseBudgets,
    parseHolidayTagContext,
    parseMarkdownTable,
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
  budgetsFolderPath: "Utility/Budgets",
  budgetArchiveFolderPath: "Utility/Budgets/Archive",
  defaultBudgetNoteName: "💸 Budgets.md",
  activeHolidayBudgetPath: "",
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
  budgetCheckPeriod: "week",
  weekStartsOn: "monday",
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const HOLIDAY_DASHBOARD_BLOCK = "holiday-dashboard";
const DAILY_BUDGET_CHECK_BLOCK = "daily-budget-check";
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

function parseFrontmatter(content) {
  const match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!parsed) continue;
    data[parsed[1].toLowerCase()] = parsed[2].trim();
  }
  return data;
}

function toTitleFromHolidayKey(holidayKey) {
  const normalized = core.normalizeHolidayKey(holidayKey);
  if (!normalized) return "Holiday";
  const [year, name] = normalized.split("/");
  return `${String(name || "")
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")} ${year}`.trim();
}

function guessHolidayTagFromName(name, referenceDate = core.todayIsoLocal()) {
  const raw = String(name || "").trim();
  const yearMatch = raw.match(/\b(20\d{2}|\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : referenceDate.slice(0, 4);
  const holidayName = core
    .normalizeCategoryPath(raw.replace(/\b(20\d{2}|\d{2})\b/g, " "))
    .split("/")
    .filter(Boolean)
    .join("-");
  return core.normalizeHolidayKey(`${year}/${holidayName || "holiday"}`);
}

function sumBy(entries, predicate) {
  return Number(
    entries
      .filter(predicate)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      .toFixed(2)
  );
}

function normalizeExchangeRateKey(value, fallbackCurrency) {
  const descriptor = core.parseCurrencyDescriptor(value, fallbackCurrency);
  return descriptor.rateKey;
}

function parseFlatExchangeRates(value, fallbackCurrency) {
  const rates = {};
  for (const rawPart of String(value || "").split(/[,|\n]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^([A-Za-z _]{3,})\s*=\s*([0-9.]+)$/);
    if (!match) continue;
    const rateKey = normalizeExchangeRateKey(match[1], fallbackCurrency);
    const rate = Number(match[2]);
    if (!rateKey || !Number.isFinite(rate) || rate <= 0) continue;
    rates[rateKey] = rate;
  }
  return rates;
}

function parseExchangeRatePeriods(value, fallbackCurrency) {
  const periods = [];
  for (const rawPart of String(value || "").split(/\s*;\s*/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to)\s*(\d{4}-\d{2}-\d{2})\s*[:|]\s*(.+)$/i);
    if (!match) continue;
    periods.push({
      end: core.parseIsoDate(match[2]),
      rates: parseFlatExchangeRates(match[3], fallbackCurrency),
      start: core.parseIsoDate(match[1]),
    });
  }
  return periods.filter((period) => period.start && period.end && Object.keys(period.rates).length);
}

function stripBudgetSuffix(value) {
  return String(value || "").replace(/\s+budget$/i, "").trim();
}

function appendBudgetSuffix(value) {
  const base = stripBudgetSuffix(value) || "Holiday";
  return `${base} Budget`;
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

    this.registerMarkdownCodeBlockProcessor(HOLIDAY_DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderHolidayDashboard(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(DAILY_BUDGET_CHECK_BLOCK, async (source, el, ctx) => {
      await this.renderDailyBudgetCheck(source, el, ctx);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.categoryOptions = normalizeCategoryOptions(this.settings.categoryOptions || DEFAULT_SETTINGS.categoryOptions);
    const coreDailyNotesConfig = await this.readCoreDailyNotesConfig();
    if (coreDailyNotesConfig?.folder) {
      const currentFolder = (this.settings.dailyNotesFolder || "").trim();
      if (!currentFolder || currentFolder === DEFAULT_SETTINGS.dailyNotesFolder) {
        this.settings.dailyNotesFolder = coreDailyNotesConfig.folder;
      }
    }
    this.settings.budgetsFolderPath = this.settings.budgetsFolderPath || DEFAULT_SETTINGS.budgetsFolderPath;
    this.settings.budgetArchiveFolderPath = this.settings.budgetArchiveFolderPath || DEFAULT_SETTINGS.budgetArchiveFolderPath;
    this.settings.defaultBudgetNoteName = this.settings.defaultBudgetNoteName || DEFAULT_SETTINGS.defaultBudgetNoteName;
    if (this.settings.defaultBudgetNoteName === "Budget.md") {
      this.settings.defaultBudgetNoteName = DEFAULT_SETTINGS.defaultBudgetNoteName;
    }
    this.settings.activeHolidayBudgetPath = this.settings.activeHolidayBudgetPath || "";
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
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    return (
      this.app.vault
        .getMarkdownFiles()
        .find((file) => file.path.startsWith(prefix) && file.name === `${iso}.md`) || null
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
    return normalizePath(`${directory}/${iso}.md`);
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
      transaction: String(params.transaction || "").trim(),
    };
  }

  async handleCapture(params) {
    try {
      let expense = this.parseCaptureParams(params);
      const holidayContext = await this.findHolidayContextForDate(expense.date);
      if (holidayContext?.holidayKey) {
        expense.holidayKey = holidayContext.holidayKey;
        expense = this.applyHolidayCurrencyContext(expense, holidayContext);
      }
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

  async collectTransactionsForHoliday(holidayKey, range = {}) {
    const normalizedHolidayKey = core.normalizeHolidayKey(holidayKey);
    if (!normalizedHolidayKey) return [];
    const allEntries = await this.collectTransactionsForRange({
      period: "all",
      start: range.start || "1900-01-01",
      end: range.end || "2999-12-31",
    });
    return allEntries.filter((entry) => entry.holidayKey === normalizedHolidayKey);
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
    const inferredHolidayKey = guessHolidayTagFromName(this.getHolidayBudgetNameFromPath(filePath || frontmatter.holiday_name || "Holiday"));
    const holidayKey = core.normalizeHolidayKey(frontmatter.holiday_tag || frontmatter.holiday || frontmatter.tag || inferredHolidayKey);
    const tables = core.parseMarkdownTable(content);
    const plannedExpenses = [];

    for (const rows of tables) {
      for (const row of rows) {
        const hasPlanningColumns =
          "planned" in row || "estimate" in row || "estimated" in row || "booked" in row || "paid" in row || "item" in row || "expense" in row;
        if (!hasPlanningColumns) continue;
        const planned = core.parseNumber(row.planned || row.estimate || row.estimated);
        const booked = core.parseNumber(row.booked || row.committed || row.deposit);
        const paid = core.parseNumber(row.paid || row.actual || row.spent);
        const item = String(row.item || row.name || row.expense || "").trim();
        const category = core.normalizeCategoryPath(row.category || row.group || "");
        if (!item && !category && !Number.isFinite(planned) && !Number.isFinite(booked) && !Number.isFinite(paid)) continue;
        plannedExpenses.push({
          item: item || core.displayCategoryPath(category || "uncategorized"),
          category: category || "uncategorized",
          booked: Number.isFinite(booked) ? Number(booked.toFixed(2)) : 0,
          paid: Number.isFinite(paid) ? Number(paid.toFixed(2)) : 0,
          planned: Number.isFinite(planned) ? Number(planned.toFixed(2)) : 0,
          notes: String(row.notes || row.note || "").trim(),
        });
      }
    }

    const totals = plannedExpenses.reduce(
      (summary, item) => {
        summary.planned += Number(item.planned || 0);
        summary.booked += Number(item.booked || 0);
        summary.paid += Number(item.paid || 0);
        return summary;
      },
      { booked: 0, paid: 0, planned: 0 }
    );

    return {
      currency: core.normalizeCurrency(frontmatter.currency || this.settings.defaultCurrency),
      endDate: core.parseIsoDate(frontmatter.end_date || frontmatter.end || frontmatter.return_date || ""),
      exchangeRates: {
        flat: parseFlatExchangeRates(frontmatter.exchange_rates || frontmatter.rates || "", this.settings.defaultCurrency),
        periods: parseExchangeRatePeriods(frontmatter.exchange_rate_periods || frontmatter.rate_periods || "", this.settings.defaultCurrency),
      },
      filePath,
      holidayKey,
      holidayName: String(frontmatter.holiday_name || frontmatter.name || toTitleFromHolidayKey(holidayKey || guessHolidayTagFromName(this.getHolidayBudgetNameFromPath(filePath)))).trim(),
      plannedExpenses,
      startDate: core.parseIsoDate(frontmatter.start_date || frontmatter.start || frontmatter.departure_date || ""),
      totalBudget: core.parseNumber(frontmatter.total_budget || frontmatter.budget || frontmatter.total || ""),
      totals: {
        booked: Number(totals.booked.toFixed(2)),
        paid: Number(totals.paid.toFixed(2)),
        planned: Number(totals.planned.toFixed(2)),
      },
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
      if (!meta?.holidayKey || !meta.startDate || !meta.endDate) continue;
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
      "- `Period` can be `day`, `week`, or `month`.",
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
      `holiday_name: ${holidayTitle}`,
      `holiday_tag: ${normalizedHolidayKey}`,
      "total_budget: 0",
      `currency: ${currency}`,
      `start_date: ${startDate}`,
      `end_date: ${endDate}`,
      "exchange_rates: JPY=0.0095, JPY CASH=0.0098",
      "exchange_rate_periods: ",
      "---",
      "",
      `# ${appendBudgetSuffix(holidayTitle)}`,
      "",
      "Set your whole-trip budget in the frontmatter above, then use the tables below to plan expected costs before you travel.",
      "Use `exchange_rates` for one flat rate across the whole trip, or `exchange_rate_periods` for date-specific overrides.",
      "",
      "## Daily Holiday Dashboard",
      "",
      "```holiday-dashboard",
      `holiday: ${normalizedHolidayKey}`,
      "```",
      "",
      "## Planned Expenses",
      "",
      "`Booked` means reserved or committed but not fully paid yet. `Paid` is what has actually left your account already.",
      "",
      "| Item | Category | Planned | Booked | Paid | Notes |",
      "| --- | --- | ---: | ---: | ---: | --- |",
      "| Flights | flights | 0 | 0 | 0 | |",
      "| Accommodation | accommodation | 0 | 0 | 0 | |",
      "| Recreation | recreation | 0 | 0 | 0 | |",
      "",
      "## Holiday Category Budgets",
      "",
      "| Name | Category | Limit | Period | Currency |",
      "| --- | --- | ---: | --- | --- |",
      `| Accommodation | accommodation | 0 | week | ${currency} |`,
      `| Recreation | recreation | 0 | week | ${currency} |`,
      `| Flights | flights | 0 | week | ${currency} |`,
      `| Whole Holiday | all | 0 | month | ${currency} |`,
      "",
    ].join("\n");
  }

  async loadBudgets(mode = "active") {
    const file = mode === "default" ? await this.ensureBudgetNote() : await this.ensureActiveBudgetNote();
    const content = await this.app.vault.cachedRead(file);
    return core.parseBudgets(content, this.settings.defaultCurrency);
  }

  getHolidayBudgetNameFromPath(path) {
    return stripBudgetSuffix(String(path || "").split("/").pop()?.replace(/\.md$/i, "")) || "Holiday";
  }

  getHolidayBudgetFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    const archivePrefix = normalizePath(`${this.settings.budgetArchiveFolderPath}/`);
    const defaultBudgetPath = this.getDefaultBudgetNotePath();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(archivePrefix))
      .filter((file) => file.path !== defaultBudgetPath);
  }

  async createOrOpenHolidayBudget(definition) {
    const holidayName = String(definition?.name || definition || "").trim();
    if (!holidayName) return null;
    await this.ensureBudgetInfrastructure();
    const safeName =
      holidayName
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Holiday";
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

  async archiveActiveHolidayBudget() {
    const activePath = this.settings.activeHolidayBudgetPath;
    const activeFile = this.app.vault.getAbstractFileByPath(activePath);
    if (!(activeFile instanceof TFile)) {
      this.settings.activeHolidayBudgetPath = "";
      await this.saveSettings();
      new Notice("No active holiday budget to archive.");
      return;
    }
    await this.ensureBudgetInfrastructure();
    const fileName = activeFile.name;
    let archivePath = normalizePath(`${this.settings.budgetArchiveFolderPath}/${fileName}`);
    if (this.app.vault.getAbstractFileByPath(archivePath)) {
      const stamp = core.todayIsoLocal().replace(/-/g, "");
      archivePath = normalizePath(`${this.settings.budgetArchiveFolderPath}/${activeFile.basename}-${stamp}.md`);
    }
    await this.app.vault.rename(activeFile, archivePath);
    this.settings.activeHolidayBudgetPath = "";
    await this.saveSettings();
    new Notice(`Archived holiday budget to ${archivePath}`);
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
    const normalizedPeriod = String(period || "week").toLowerCase();
    const matchingBudgets = budgets.filter((budget) => budget.period === normalizedPeriod);
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

  renderHolidaySummary(wrapper, metrics, currency) {
    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
    const cardData = [
      { label: "Holiday Budget", value: metrics.totalBudget > 0 ? core.formatCurrency(metrics.totalBudget, currency) : "Not set" },
      { label: "Total Spent", value: core.formatCurrency(metrics.totalSpent, currency) },
      {
        label: "Remaining",
        value:
          metrics.totalBudget > 0
            ? core.formatCurrency(metrics.totalBudget - metrics.totalSpent, currency)
            : "Not set",
      },
      { label: "Trip Days So Far", value: String(metrics.tripDays) },
      { label: "Avg / Day Excl. Accommodation", value: core.formatCurrency(metrics.averageExcludingAccommodation, currency) },
      { label: "Avg Food / Day", value: core.formatCurrency(metrics.averageFoodPerDay, currency) },
      { label: "Avg Shopping / Day", value: core.formatCurrency(metrics.averageShoppingPerDay, currency) },
      { label: "Planned So Far", value: core.formatCurrency(metrics.plannedTotal, currency) },
      { label: "Booked", value: core.formatCurrency(metrics.bookedTotal, currency) },
      { label: "Prepaid / Paid", value: core.formatCurrency(metrics.paidTotal, currency) },
    ];

    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
  }

  renderPlannedExpenses(wrapper, plannedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned Trip Costs" });

    if (!plannedExpenses.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No planned trip costs found yet. Add rows to the Planned Expenses table in the holiday budget note.",
      });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-planned-list" });
    for (const item of plannedExpenses) {
      const card = list.createDiv({ cls: "finance-tracker-budget-card" });
      card.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${item.item} - ${core.displayCategoryPath(item.category)}`,
      });
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `Planned ${core.formatCurrency(item.planned, currency)} · Booked ${core.formatCurrency(item.booked, currency)} · Paid ${core.formatCurrency(item.paid, currency)}`,
      });
      if (item.notes) {
        card.createDiv({ cls: "finance-tracker-budget-meta", text: item.notes });
      }
    }
  }

  renderExchangeRates(wrapper, holidayMeta) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Exchange Rates" });

    const flatEntries = Object.entries(holidayMeta?.exchangeRates?.flat || {});
    const periodEntries = holidayMeta?.exchangeRates?.periods || [];

    if (!flatEntries.length && !periodEntries.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No exchange rates configured yet. Add `exchange_rates` or `exchange_rate_periods` to the holiday budget frontmatter.",
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

  async renderHolidayDashboard(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

    try {
      const config = parseConfigBlock(source);
      const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
      const explicitHoliday = core.normalizeHolidayKey(config.holiday || config.tag || config.track || "");
      const budgetTarget = String(config.budget || "").trim();

      let holidayMeta = null;
      let budgetFile = null;

      const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath || "");
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
          budgetFile = targetFile;
          holidayMeta = await this.readHolidayBudgetFile(targetFile);
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

      const holidayKey = explicitHoliday || holidayMeta?.holidayKey || "";
      const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });

      if (!holidayKey) {
        wrapper.createDiv({
          cls: "finance-tracker-empty",
          text: "Set `holiday: 2026/japan` in this code block, or add a `holiday_tag` to the budget note frontmatter.",
        });
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
      const entries = await this.collectTransactionsForHoliday(holidayKey, {
        start: startDate || "1900-01-01",
        end: effectiveEnd || "2999-12-31",
      });
      const currency = core.normalizeCurrency(config.currency || holidayMeta?.currency || this.settings.defaultCurrency);
      const groupBy = String(config.groupby || this.settings.dashboardDefaultGroupBy || "primary").toLowerCase();
      const entryDates = entries.map((entry) => entry.date).filter(Boolean).sort();
      const tripStart = startDate || entryDates[0] || referenceDate;
      const tripEnd = effectiveEnd || entryDates[entryDates.length - 1] || referenceDate;
      const tripDays =
        startDate && referenceDate < startDate
          ? 0
          : core.daysBetweenInclusive(tripStart, tripEnd);
      const totalSpent = sumBy(entries, () => true);
      const accommodationAliases = new Set(["accommodation", "accomodation"]);
      const averageExcludingAccommodation = tripDays
        ? Number((sumBy(entries, (entry) => !accommodationAliases.has(core.primaryCategory(entry.category))) / tripDays).toFixed(2))
        : 0;
      const averageFoodPerDay = tripDays
        ? Number((sumBy(entries, (entry) => core.primaryCategory(entry.category) === "food") / tripDays).toFixed(2))
        : 0;
      const averageShoppingPerDay = tripDays
        ? Number((sumBy(entries, (entry) => core.primaryCategory(entry.category) === "shopping") / tripDays).toFixed(2))
        : 0;
      const totalBudget = Number(core.parseNumber(config.total_budget || config.totalbudget || holidayMeta?.totalBudget) || 0);

      const header = wrapper.createDiv({ cls: "finance-tracker-header" });
      header.createEl("h3", {
        text: config.title || `${toTitleFromHolidayKey(holidayKey)} Holiday Dashboard`,
      });

      const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
      const exportButton = headerActions.createEl("button", { text: "Export Holiday CSV" });
      exportButton.addEventListener("click", async () => {
        await this.exportEntriesToCsv(entries, `holiday-${holidayKey.replace(/\//g, "-")}-${tripEnd}`);
      });
      if (budgetFile instanceof TFile) {
        const budgetButton = headerActions.createEl("button", { text: "Open Holiday Budget" });
        budgetButton.addEventListener("click", async () => {
          await this.app.workspace.getLeaf(true).openFile(budgetFile);
        });
      }

      this.renderHolidaySummary(
        wrapper,
        {
          averageExcludingAccommodation,
          averageFoodPerDay,
          averageShoppingPerDay,
          bookedTotal: holidayMeta?.totals?.booked || 0,
          paidTotal: holidayMeta?.totals?.paid || 0,
          plannedTotal: holidayMeta?.totals?.planned || 0,
          totalBudget,
          totalSpent,
          tripDays,
        },
        currency
      );

      const grouped = core.groupTransactionsByCategory(entries, groupBy);
      this.renderPieChart(wrapper, grouped, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));
      this.renderPlannedExpenses(wrapper, holidayMeta?.plannedExpenses || [], currency);
      this.renderExchangeRates(wrapper, holidayMeta);
    } catch (error) {
      const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `Holiday dashboard failed to render: ${error.message}`,
      });
      console.error("[finance-tracker] holiday dashboard render failed", error);
    }
  }

  async renderDailyBudgetCheck(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const range = core.toPeriodRange({
      period: config.period || this.settings.budgetCheckPeriod || "week",
      referenceDate,
      start: config.start,
      end: config.end,
      weekStartsOn: this.settings.weekStartsOn,
    });

    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const groupBy = String(config.groupby || "full").toLowerCase();
    const entries = await this.collectTransactionsForRange({
      ...range,
      end: referenceDate < range.end ? referenceDate : range.end,
    });
    const budgets = await this.loadBudgets("default");
    const budgetProgress = this.buildBudgetProgress(entries, budgets, range.period, groupBy);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", {
      text: config.title || `Budget Check: ${range.start} to ${range.end}`,
    });

    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const budgetsButton = headerActions.createEl("button", { text: "Budgets" });
    budgetsButton.addEventListener("click", async () => {
      await this.openDefaultBudgetNote();
    });

    this.renderBudgets(wrapper, budgetProgress, currency);
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
      weekStartsOn: this.settings.weekStartsOn,
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
      await this.openDefaultBudgetNote();
    });

    const entries = await this.collectTransactionsForRange(range);
    this.renderSummary(wrapper, entries, currency, range);

    const grouped = core.groupTransactionsByCategory(entries, groupBy);
    this.renderPieChart(wrapper, grouped, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));

    const budgets = await this.loadBudgets("default");
    const budgetProgress = this.buildBudgetProgress(entries, budgets, range.period, groupBy);
    this.renderBudgets(wrapper, budgetProgress, currency);
  }
}

class HolidayBudgetModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
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
    this.plugin.settings.activeHolidayBudgetPath = file.path;
    await this.plugin.saveSettings();
    await this.app.workspace.getLeaf(true).openFile(file);
    if (typeof this.onComplete === "function") {
      await this.onComplete();
    }
    this.close();
  }

  updateCreateDefaults() {
    const name = this.query.trim();
    this.createForm.name = name;
    this.createForm.holidayKey = core.normalizeHolidayKey(this.createForm.holidayKey || "") || guessHolidayTagFromName(name || "Holiday");
  }

  async createFromForm() {
    this.updateCreateDefaults();
    const holidayName = String(this.createForm.name || "").trim();
    if (!holidayName) return;
    const file = await this.plugin.createOrOpenHolidayBudget({
      endDate: this.createForm.endDate,
      holidayKey: this.createForm.holidayKey,
      name: holidayName,
      startDate: this.createForm.startDate,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") {
        await this.onComplete();
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
        text: "Search for an existing holiday budget, or type a new holiday name to create one.",
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
    this.createPanelEl.createEl("h3", { text: "New Holiday Details" });
    this.createPanelEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Set the tracking tag and trip dates now so the holiday budget note is ready to use immediately.",
    });

    const nameSetting = new Setting(this.createPanelEl).setName("Holiday name").setDesc("This is the budget note title and file name.");
    nameSetting.addText((text) => {
      text.setPlaceholder("Japan 2026").setValue(this.createForm.name).onChange((value) => {
        this.createForm.name = value;
      });
    });

    const tagSetting = new Setting(this.createPanelEl)
      .setName("Holiday tracking tag")
      .setDesc("Used by the holiday dashboard to match tags like #log/spending/2026/japan/flights.");
    tagSetting.addText((text) => {
      text.setPlaceholder("2026/japan").setValue(this.createForm.holidayKey).onChange((value) => {
        this.createForm.holidayKey = core.normalizeHolidayKey(value) || guessHolidayTagFromName(this.createForm.name || this.query);
      });
    });

    const startSetting = new Setting(this.createPanelEl).setName("Start date").setDesc("Saved as a date property in the holiday budget note.");
    startSetting.addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.createForm.startDate).onChange((value) => {
        this.createForm.startDate = core.parseIsoDate(value) || core.todayIsoLocal();
      });
    });

    const endSetting = new Setting(this.createPanelEl).setName("End date").setDesc("Saved as a date property in the holiday budget note.");
    endSetting.addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.createForm.endDate).onChange((value) => {
        this.createForm.endDate = core.parseIsoDate(value) || this.createForm.startDate;
      });
    });

    const actions = this.createPanelEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create Holiday Budget" });
    createButton.addEventListener("click", async () => {
      await this.createFromForm();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select Or Create Holiday Budget" });
    const intro = contentEl.createEl("p", {
      text: "Search an existing holiday budget. If nothing matches, choose the create option to start a new one inside your budgets folder.",
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
    contentEl.createEl("h2", { text: "Choose Export Folder" });
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
      text: "Configure capture behavior, dashboard defaults, holiday budgets, and the category list you use in Apple Shortcuts.",
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
      .setDesc("Folder that stores your daily notes. The plugin follows your core Daily Notes folder and infers the existing file layout from notes already in the vault.")
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

    addSection("Files", "Choose where your normal and holiday budget notes are stored.");

    new Setting(containerEl)
      .setName("Budgets folder")
      .setDesc("Folder where the default budget and holiday budgets are stored.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets").setValue(this.plugin.settings.budgetsFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetsFolderPath = value.trim() || DEFAULT_SETTINGS.budgetsFolderPath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Budget archive folder")
      .setDesc("Holiday budgets are moved here when you archive them from the settings page.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets/Archive").setValue(this.plugin.settings.budgetArchiveFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetArchiveFolderPath = value.trim() || DEFAULT_SETTINGS.budgetArchiveFolderPath;
          await this.plugin.saveSettings();
        })
      );

    const actions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const openBudgetsButton = actions.createEl("button", { text: "Open Budgets Note" });
    openBudgetsButton.addEventListener("click", async () => {
      await this.plugin.openBudgetNote();
    });

    addSection(
      "Holiday Budgets",
      "Create, select, and archive holiday budgets here. Spending is treated as holiday spending automatically when the note date falls inside a holiday budget's start and end dates."
    );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: this.plugin.settings.activeHolidayBudgetPath
        ? `Selected holiday budget: ${this.plugin.settings.activeHolidayBudgetPath}`
        : "No holiday budget currently selected.",
    });

    const holidayActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const selectHolidayButton = holidayActions.createEl("button", { text: "Select Or Create Holiday" });
    selectHolidayButton.addEventListener("click", () => {
      new HolidayBudgetModal(this.app, this.plugin, async () => {
        this.display();
      }).open();
    });
    const archiveHolidayButton = holidayActions.createEl("button", { text: "Archive Selected Holiday" });
    archiveHolidayButton.addEventListener("click", async () => {
      await this.plugin.archiveActiveHolidayBudget();
      this.display();
    });

  }
}

module.exports = FinanceTrackerPlugin;
