"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const normalizedHoliday = normalizeHolidayKey(holidayKey);
  return normalizedHoliday
    ? `#log/spending/${normalizedHoliday}/${normalizedCategory}`
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

function extractMerchantFromChildLines(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    if (/^\t\t- /.test(line) || /^\s{4,}- /.test(line)) {
      const child = line.replace(/^\s*-\s*/, "").trim();
      if (child && !child.startsWith("#")) return normalizeWhitespace(child);
      continue;
    }
    if (!line.trim()) continue;
    break;
  }
  return "";
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
    originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
    originalCurrency: originalSide ? originalDescriptor.currency : "",
    originalRateKey: originalSide ? originalDescriptor.rateKey : "",
    note,
    rawLine: text,
    source: "",
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

    const childLines = [];
    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      const childLine = lines[childIndex];
      if (/^\t- /.test(childLine) || /^\s{2,}- /.test(childLine)) {
        childLines.push(childLine.replace(/^\s*-\s*/, "").trim());
        continue;
      }
      if (!childLine.trim()) continue;
      break;
    }

    const parsed = parseTransactionLine(line, noteDate, filePath, options, childLines);
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
    "merchant",
    "note",
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
    entry.merchant || "",
    entry.note || "",
    entry.source || "",
    entry.filePath || "",
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

module.exports = {
  addDays,
  buildCategoryTag,
  buildCsv,
  buildTransactionBlock,
  calculateSpendingSectionTotal,
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
  parseIsoDate,
  parseNumber,
  parseTransactionsFromNoteContent,
  primaryCategory,
  titleCaseSegment,
  toPeriodRange,
  todayIsoLocal,
};
