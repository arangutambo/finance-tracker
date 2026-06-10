"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_ORDER = ["day", "week", "fortnight", "month", "bimonth", "quarter", "year"];

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
  const segments = normalized.split("/").filter(Boolean);
  const withoutLog = segments[0] === "log" ? segments.slice(1) : segments;
  const spendingIndex = withoutLog.findIndex((segment) => segment.toLowerCase() === "spending");
  if (spendingIndex >= 2 && /^(?:\d{2}|\d{4})$/.test(withoutLog[spendingIndex - 2])) {
    return `${withoutLog[spendingIndex - 2]}/${withoutLog[spendingIndex - 1]}`;
  }
  if (withoutLog.length >= 2 && /^(?:\d{2}|\d{4})$/.test(withoutLog[0])) {
    return `${withoutLog[0]}/${withoutLog[1]}`;
  }
  return "";
}

function parseHolidayTagContext(value) {
  const normalized = normalizeCategoryPath(value);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length >= 3 && /^(?:\d{2}|\d{4})$/.test(segments[0])) {
    const remainder = segments.slice(2);
    const isPlannedExpense = String(remainder[0] || "").toLowerCase() === "planned";
    const normalizedCategory = (isPlannedExpense ? remainder.slice(1) : remainder).join("/") || "uncategorized";
    return {
      holidayCategory: normalizedCategory,
      holidayKey: `${segments[0]}/${segments[1]}`,
      holidayName: segments[1],
      isPlannedExpense,
      plannedCategory: isPlannedExpense ? normalizedCategory : "",
      holidayYear: segments[0],
    };
  }
  return {
    holidayCategory: normalized || "uncategorized",
    holidayKey: "",
    holidayName: "",
    isPlannedExpense: false,
    plannedCategory: "",
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

function buildIncomeTag(bucket) {
  return `#log/income/${normalizeCategoryPath(bucket) || "income"}`;
}

function stripFirstTag(value) {
  return String(value || "").split("#")[0];
}

function extractVisibleAmount(line) {
  const visible = stripFirstTag(String(line || ""))
    .replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "")
    .trim();
  if (!visible) return null;
  const matches = Array.from(visible.matchAll(/-?\d[\d,]*(?:\.\d+)?|-?\d+(?:,\d{3})*(?:\.\d+)?/g))
    .map((match) => Number(String(match[0]).replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

function extractCategoryFromLogSpendingTag(line) {
  const matches = Array.from(String(line || "").matchAll(/#([^\s#\]]+)/gi));
  if (!matches.length) return "";
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const fullTag = normalizeCategoryPath(matches[index][1]);
    const parts = fullTag.split("/").filter(Boolean);
    const spendingIndex = parts.findIndex((part) => part.toLowerCase() === "spending");
    if (spendingIndex < 0 || spendingIndex === parts.length - 1) continue;
    if (spendingIndex >= 2 && /^(?:\d{2}|\d{4})$/.test(parts[spendingIndex - 2])) {
      return normalizeCategoryPath(`${parts[spendingIndex - 2]}/${parts[spendingIndex - 1]}/${parts.slice(spendingIndex + 1).join("/")}`);
    }
    return normalizeCategoryPath(parts.slice(spendingIndex + 1).join("/"));
  }
  return "";
}

// Single source of truth for legacy holiday-tag orderings. Rewrites the older
// `#log/<year>/<key>/spending[/planned]/<cat>` and `#log/<year>/<key>/planned/<cat>`
// forms to the canonical `#log/spending/<year>/<key>[/planned]/<cat>`. Returns the
// canonical path (no leading #) when a rewrite applies, else null (already
// canonical, or not a holiday tag). Used by both the parser and the migrator.
function canonicalizeFinanceTag(tag) {
  const normalized = normalizeCategoryPath(String(tag || "").replace(/^#/, ""));
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 4 || parts[0] !== "log") return null;
  const isYear = (value) => /^(?:\d{2}|\d{4})$/.test(value);
  if (!isYear(parts[1]) || !parts[2]) return null;

  if (parts[3] === "spending") {
    const remainder = parts.slice(4);
    const planned = String(remainder[0] || "").toLowerCase() === "planned";
    const category = planned ? remainder.slice(1) : remainder;
    return ["log", "spending", parts[1], parts[2], ...(planned ? ["planned"] : []), ...category].join("/");
  }
  if (parts[3] === "planned") {
    return ["log", "spending", parts[1], parts[2], "planned", ...parts.slice(4)].join("/");
  }
  return null;
}

function migrateFinanceTagsInLine(line) {
  let changed = false;
  const result = String(line).replace(/#([^\s#\]]+)/g, (whole, tagBody) => {
    const canonical = canonicalizeFinanceTag(tagBody);
    if (!canonical) return whole;
    changed = true;
    return `#${canonical}`;
  });
  return { line: result, changed };
}

// Rewrites every legacy holiday tag in a note to the canonical form. Returns the
// new content and how many lines changed (0 = nothing to migrate).
function migrateFinanceTagsInContent(content) {
  const lines = splitLines(content);
  let changedLines = 0;
  const out = lines.map((line) => {
    const result = migrateFinanceTagsInLine(line);
    if (result.changed) changedLines += 1;
    return result.line;
  });
  return { content: out.join("\n"), changedLines };
}

function extractFinanceTagContext(line) {
  const matches = Array.from(String(line || "").matchAll(/#([^\s#\]]+)/gi));
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const canonical = canonicalizeFinanceTag(matches[index][1]);
    const fullTag = canonical || normalizeCategoryPath(matches[index][1]);
    const parts = fullTag.split("/").filter(Boolean);
    if (!parts.length || parts[0] !== "log") continue;

    if (parts[1] === "income" && parts[2]) {
      return {
        category: normalizeCategoryPath(parts.slice(2).join("/")) || "income",
        entryType: "income",
        goalKey: normalizeCategoryPath(parts[2]),
        holidayKey: "",
        isGoalContribution: true,
        isGoalWithdrawal: false,
        isIncome: true,
        isPlannedExpense: false,
        plannedCategory: "",
      };
    }

    if (parts[1] === "spending") {
      if (parts[2] === "goal" && parts[3]) {
        return {
          category: normalizeCategoryPath(parts.slice(4).join("/")) || "uncategorized",
          entryType: "goal-withdrawal",
          goalKey: normalizeCategoryPath(parts[3]),
          holidayKey: "",
          isGoalContribution: false,
          isGoalWithdrawal: true,
          isIncome: false,
          isPlannedExpense: false,
          plannedCategory: "",
        };
      }

      if (parts[2] && /^(?:\d{2}|\d{4})$/.test(parts[2]) && parts[3]) {
        const holidayKey = `${parts[2]}/${parts[3]}`;
        const remainder = parts.slice(4);
        const isPlannedExpense = String(remainder[0] || "").toLowerCase() === "planned";
        const category = normalizeCategoryPath((isPlannedExpense ? remainder.slice(1) : remainder).join("/")) || "uncategorized";
        return {
          category,
          entryType: "holiday-spending",
          goalKey: normalizeCategoryPath(parts[3]),
          holidayKey,
          isGoalContribution: false,
          isGoalWithdrawal: true,
          isIncome: false,
          isPlannedExpense,
          plannedCategory: isPlannedExpense ? category : "",
        };
      }

      return {
        category: normalizeCategoryPath(parts.slice(2).join("/")) || "uncategorized",
        entryType: "spending",
        goalKey: "",
        holidayKey: "",
        isGoalContribution: false,
        isGoalWithdrawal: false,
        isIncome: false,
        isPlannedExpense: false,
        plannedCategory: "",
      };
    }

  }

  return {
    category: "uncategorized",
    entryType: "spending",
    goalKey: "",
    holidayKey: "",
    isGoalContribution: false,
    isGoalWithdrawal: false,
    isIncome: false,
    isPlannedExpense: false,
    plannedCategory: "",
  };
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

function extractPlannedLogMetadata(childLines = []) {
  let startDate = "";
  let endDate = "";
  const detailLinks = [];
  const detailLines = [];

  for (const rawLine of childLines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    detailLines.push(line);

    const links = Array.from(line.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)).map((match) => ({
      path: String(match[1] || "").trim(),
      label: String(match[2] || match[1] || "").trim(),
      raw: match[0],
    })).filter((link) => link.path);
    detailLinks.push(...links);

    const dates = Array.from(line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => parseIsoDate(match[0])).filter(Boolean);
    if (!dates.length) continue;

    const lower = line.toLowerCase();
    if (dates.length >= 2) {
      startDate = startDate || dates[0];
      endDate = endDate || dates[1];
      continue;
    }

    if (!startDate && (/\b(start|check[- ]?in|arrival|from)\b/.test(lower) || !endDate)) {
      startDate = dates[0];
      continue;
    }

    if (!endDate && /\b(end|check[- ]?out|departure|until|to)\b/.test(lower)) {
      endDate = dates[0];
      continue;
    }

    if (!endDate) {
      endDate = dates[0];
    }
  }

  if (startDate && !endDate) endDate = startDate;
  if (endDate && !startDate) startDate = endDate;

  return {
    detailLines,
    detailLinks,
    endDate,
    startDate,
  };
}

function extractPlannedLineDates(line = "") {
  const dates = Array.from(String(line || "").matchAll(/\b\d{4}-\d{2}-\d{2}\b/g))
    .map((match) => parseIsoDate(match[0]))
    .filter(Boolean);
  if (!dates.length) return { startDate: "", endDate: "" };
  return {
    endDate: dates[1] || dates[0],
    startDate: dates[0],
  };
}

function parseTransactionLine(line, noteDate, filePath, options = {}, childLines = []) {
  const text = String(line || "");
  if (!text.trimStart().startsWith("-")) return null;
  if (/^\s*-\s*\[[^\]]\]\s*#log\/spending\b/i.test(text)) return null;

  const amount = extractVisibleAmount(text);
  if (!Number.isFinite(amount)) return null;

  const financeContext = extractFinanceTagContext(text);
  const holidayContext = financeContext.holidayKey
    ? parseHolidayTagContext(`${financeContext.holidayKey}/${financeContext.isPlannedExpense ? `planned/${financeContext.category}` : financeContext.category}`)
    : parseHolidayTagContext(financeContext.category);
  const category = financeContext.category || holidayContext.holidayCategory || "uncategorized";

  const currency = normalizeCurrency(options.defaultCurrency || "AUD");
  const visibleSection = stripFirstTag(text).replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "").trim();
  const originalSide = visibleSection.includes(":") ? visibleSection.split(":")[0].trim() : "";
  const originalAmount = extractVisibleAmount(`- ${originalSide}`);
  const originalDescriptor = parseCurrencyDescriptor(originalSide, currency);
  const merchant = normalizeWhitespace(childLines[0] || "");
  const note = normalizeWhitespace(childLines.slice(1).join(" | "));
  const plannedLogMeta = extractPlannedLogMetadata(childLines);
  const plannedLineDates = holidayContext.isPlannedExpense ? extractPlannedLineDates(text) : { startDate: "", endDate: "" };
  const transactionDate = noteDate || extractNoteDate("", filePath);

  return {
    amount: Number(Number(amount).toFixed(2)),
    card: "",
    category,
    categoryDisplay: displayCategoryPath(category),
    categoryPrimary: primaryCategory(category),
    currency,
    date: transactionDate,
    entryType: financeContext.entryType,
    filePath,
    goalKey: financeContext.goalKey || "",
    holidayKey: financeContext.holidayKey || holidayContext.holidayKey,
    holidayName: holidayContext.holidayName,
    isGoalContribution: Boolean(financeContext.isGoalContribution),
    isGoalWithdrawal: Boolean(financeContext.isGoalWithdrawal),
    isIncome: Boolean(financeContext.isIncome),
    isPlannedExpense: Boolean(holidayContext.isPlannedExpense),
    plannedCategory: financeContext.plannedCategory || holidayContext.plannedCategory || "",
    plannedDetailLines: plannedLogMeta.detailLines,
    plannedDetailLinks: plannedLogMeta.detailLinks,
    plannedEndDate: plannedLogMeta.endDate || plannedLineDates.endDate,
    plannedStartDate: plannedLogMeta.startDate || plannedLineDates.startDate,
    holidayYear: holidayContext.holidayYear,
    merchant,
    name: merchant,
    originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
    originalCurrency: originalSide ? originalDescriptor.currency : "",
    originalRateKey: originalSide ? originalDescriptor.rateKey : "",
    note,
    rawLine: text,
    source: "",
    transaction: "",
  };
}

function isPlannedExpenseEntry(entry) {
  return Boolean(entry?.holidayKey && entry?.isPlannedExpense);
}

function splitHolidayEntries(entries) {
  const actual = [];
  const planned = [];
  for (const entry of entries || []) {
    if (isPlannedExpenseEntry(entry)) {
      planned.push(entry);
    } else {
      actual.push(entry);
    }
  }
  return { actual, planned };
}

function roundCurrencyAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getRemainingTripDaysInclusive(start, end, reference) {
  const normalizedStart = parseIsoDate(start);
  const normalizedEnd = parseIsoDate(end);
  const normalizedReference = parseIsoDate(reference);
  if (!normalizedStart || !normalizedEnd || !normalizedReference) return 0;
  if (normalizedReference > normalizedEnd) return 0;
  const effectiveStart = normalizedReference < normalizedStart ? normalizedStart : normalizedReference;
  return daysBetweenInclusive(effectiveStart, normalizedEnd);
}

function parseTransactionsFromNoteContent(content, filePath, options = {}) {
  const lines = splitLines(content);
  const noteDate = extractNoteDate(content, filePath);
  const transactions = [];
  let inFinanceSection = false;
  const candidateHeadings = new Set(
    [options.financeHeading || "## Finance", options.spendingHeading || "## Spending", "## Spending", "## Finance"]
      .map((value) => normalizeWhitespace(value).toLowerCase())
      .filter(Boolean)
  );

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (candidateHeadings.has(normalizeWhitespace(line).toLowerCase())) {
      inFinanceSection = true;
      continue;
    }

    if (inFinanceSection && (/^#{1,6}\s+/.test(line.trim()) || /^---\s*$/.test(line.trim()))) {
      inFinanceSection = false;
    }

    if (!inFinanceSection) continue;
    if ((/^\t- /.test(line) || /^\s{2,}- /.test(line)) && !/#log\//i.test(line)) continue;

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
      .filter((entry) => entry && !entry.isIncome && !entry.isGoalContribution)
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

function normalizeBudgetPeriod(period) {
  const normalized = String(period || "week").toLowerCase();
  if (normalized === "bi-month" || normalized === "bi-monthly") return "bimonth";
  if (normalized === "quarterly") return "quarter";
  if (normalized === "yearly" || normalized === "annual") return "year";
  return PERIOD_ORDER.includes(normalized) ? normalized : "week";
}

function getDailyBudgetSectionPeriods(basePeriod) {
  const normalizedBase = normalizeBudgetPeriod(basePeriod);
  const displayOrder = ["week", "fortnight", "month", "quarter", "year"];
  if (normalizedBase === "day") return displayOrder;
  if (normalizedBase === "bimonth") return ["bimonth", "quarter", "year"];
  const index = displayOrder.indexOf(normalizedBase);
  return index >= 0 ? displayOrder.slice(index) : displayOrder;
}

function canRollBudgetPeriodIntoSection(budgetPeriod, sectionPeriod) {
  const budgetIndex = PERIOD_ORDER.indexOf(normalizeBudgetPeriod(budgetPeriod));
  const sectionIndex = PERIOD_ORDER.indexOf(normalizeBudgetPeriod(sectionPeriod));
  if (budgetIndex < 0 || sectionIndex < 0) return false;
  return budgetIndex <= sectionIndex;
}

function periodLengthDays(period, referenceDate, weekStartsOn = "monday") {
  const range = toPeriodRange({
    period,
    referenceDate: parseIsoDate(referenceDate) || todayIsoLocal(),
    weekStartsOn,
  });
  return daysBetweenInclusive(range.start, range.end);
}

function scaleBudgetLimit(limit, budgetPeriod, displayRange, referenceDate, weekStartsOn = "monday") {
  const baseDays = periodLengthDays(budgetPeriod, referenceDate, weekStartsOn);
  const displayDays = daysBetweenInclusive(displayRange.start, displayRange.end);
  if (!Number.isFinite(limit) || !baseDays || !displayDays) return 0;
  return roundCurrencyAmount((Number(limit) * displayDays) / baseDays);
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
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
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

function buildPlannedExpenseSummary(plannedExpenses, plannedEntries) {
  const entriesByCategory = new Map();
  for (const entry of plannedEntries || []) {
    const key = normalizeCategoryPath(entry.plannedCategory || entry.category || "") || "uncategorized";
    const current = entriesByCategory.get(key) || [];
    current.push(entry);
    entriesByCategory.set(key, current);
  }

  const rows = (plannedExpenses || []).map((item) => {
    const category = normalizeCategoryPath(item.category || "") || "uncategorized";
    const entries = entriesByCategory.get(category) || [];
    const planned = roundCurrencyAmount(item.planned || 0);
    const booked = roundCurrencyAmount(item.booked || 0);
    const paidFromLog = roundCurrencyAmount(entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const effectiveAmount = booked > 0 ? booked : planned;
    const isFullyPaid = booked > 0 && roundCurrencyAmount(paidFromLog) === booked;
    return {
      ...item,
      booked,
      category,
      effectiveAmount,
      endDate: parseIsoDate(item.endDate || item.end || ""),
      entries,
      isFullyPaid,
      link: String(item.link || "").trim(),
      paidFromLog,
      planned,
      remainingToPay: booked > 0 ? roundCurrencyAmount(Math.max(booked - paidFromLog, 0)) : 0,
      startDate: parseIsoDate(item.startDate || item.start || ""),
    };
  });

  const totals = rows.reduce(
    (summary, row) => {
      summary.booked += row.booked;
      summary.effective += row.effectiveAmount;
      summary.paidFromLog += row.paidFromLog;
      summary.planned += row.planned;
      return summary;
    },
    { booked: 0, effective: 0, paidFromLog: 0, planned: 0 }
  );

  return {
    rows,
    totals: {
      booked: roundCurrencyAmount(totals.booked),
      effective: roundCurrencyAmount(totals.effective),
      paidFromLog: roundCurrencyAmount(totals.paidFromLog),
      planned: roundCurrencyAmount(totals.planned),
    },
  };
}

function buildAllocatedExpenseSummary(allocatedExpenses, holidayStartDate, holidayEndDate) {
  const rows = (allocatedExpenses || []).map((item) => {
    const category = normalizeCategoryPath(item.category || "") || "uncategorized";
    const allocated = roundCurrencyAmount(item.allocated || 0);
    const startDate = parseIsoDate(item.startDate || item.start || "") || parseIsoDate(holidayStartDate || "") || "";
    const endCandidate = parseIsoDate(item.endDate || item.end || "") || parseIsoDate(holidayEndDate || "") || startDate;
    const endDate = startDate && endCandidate && endCandidate < startDate ? startDate : endCandidate;
    const spanDays = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : 0;
    return {
      ...item,
      allocated,
      allocatedPerDay: spanDays > 0 ? roundCurrencyAmount(allocated / spanDays) : 0,
      category,
      endDate,
      link: String(item.link || "").trim(),
      spanDays,
      startDate,
    };
  }).filter((item) => item.allocated > 0 || item.item || item.category);

  return {
    rows,
    totals: {
      allocated: roundCurrencyAmount(rows.reduce((sum, item) => sum + Number(item.allocated || 0), 0)),
    },
  };
}

function summarizeGoalProgress(definition, entries, referenceDate, options = {}) {
  const targetAmount = roundCurrencyAmount(definition?.targetAmount || definition?.savingsGoalAmount || 0);
  const startingBalance = roundCurrencyAmount(definition?.startingBalance || definition?.savingsStartingBalance || 0);
  const dueDate = parseIsoDate(definition?.dueDate || definition?.savingsDueDate || "");
  const goalKey = normalizeCategoryPath(definition?.goalKey || definition?.savingsGoalKey || "");
  const activeSavingsGoal = Boolean(definition?.activeSavingsGoal);
  const carryMissedSavings = Boolean(definition?.carryMissedSavings);
  const savingsDisplayMode = String(definition?.savingsDisplayMode || "dual-phase").toLowerCase();
  const savingsProgressMode = String(definition?.savingsProgressMode || "account-only").toLowerCase();
  const holidayStartDate = parseIsoDate(definition?.startDate || "");
  const totalBudget = roundCurrencyAmount(definition?.totalBudget || 0);
  const paidPlannedExpenses = roundCurrencyAmount(definition?.paidPlannedExpenses || 0);
  const contributions = (entries || []).filter((entry) => entry.goalKey === goalKey && entry.isGoalContribution);
  const withdrawals = (entries || []).filter((entry) => entry.goalKey === goalKey && entry.isGoalWithdrawal);
  const totalContributed = roundCurrencyAmount(contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const totalWithdrawn = roundCurrencyAmount(withdrawals.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));

  const currentAccountBalance = roundCurrencyAmount(startingBalance + totalContributed - totalWithdrawn);
  let savedProgress = currentAccountBalance;
  let currentSaved = currentAccountBalance;
  let amountRemaining = Math.max(roundCurrencyAmount(targetAmount - currentSaved), 0);
  let amountRemainingLabel = "Amount Remaining";

  if (savingsDisplayMode === "dual-phase" && holidayStartDate) {
    savedProgress = savingsProgressMode === "account-plus-paid-planned"
      ? roundCurrencyAmount(currentAccountBalance + paidPlannedExpenses)
      : currentAccountBalance;
    currentSaved = savedProgress;
    if (referenceDate < holidayStartDate) {
      amountRemaining = Math.max(roundCurrencyAmount(targetAmount - savedProgress), 0);
      amountRemainingLabel = "Still Need To Save";
    } else {
      amountRemaining = Math.max(roundCurrencyAmount(totalBudget - totalWithdrawn), 0);
      amountRemainingLabel = "Travel Budget Remaining";
    }
  }

  const proportionSaved = targetAmount > 0 ? Number(((savedProgress / targetAmount) * 100).toFixed(1)) : 0;
  const period = String(options.period || "week").toLowerCase();
  const range = toPeriodRange({ period, referenceDate, weekStartsOn: options.weekStartsOn || "monday" });
  const currentPeriodContribution = roundCurrencyAmount(
    contributions
      .filter((entry) => isDateInRange(entry.date, range))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );

  let requiredPerPeriod = 0;
  if (dueDate && dueDate >= referenceDate && amountRemaining > 0) {
    const remainingDays = daysBetweenInclusive(referenceDate, dueDate);
    const periodDays = Math.max(1, daysBetweenInclusive(range.start, range.end));
    const periodsRemaining = Math.max(1, Math.ceil(remainingDays / periodDays));
    requiredPerPeriod = roundCurrencyAmount(amountRemaining / periodsRemaining);
    if (carryMissedSavings && currentPeriodContribution < requiredPerPeriod) {
      const deficit = roundCurrencyAmount(requiredPerPeriod - currentPeriodContribution);
      requiredPerPeriod = roundCurrencyAmount(requiredPerPeriod + deficit);
    }
  }

  return {
    activeSavingsGoal,
    amountRemaining: roundCurrencyAmount(amountRemaining),
    amountRemainingLabel,
    carryMissedSavings,
    currentAccountBalance,
    currentPeriodContribution,
    currentSaved: roundCurrencyAmount(currentSaved),
    goalKey,
    paidPlannedExpenses,
    proportionSaved,
    requiredPerPeriod,
    savedProgress: roundCurrencyAmount(savedProgress),
    savingsDisplayMode,
    savingsProgressMode,
    targetAmount,
    totalContributed,
    totalWithdrawn,
  };
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
      const period = normalizeBudgetPeriod(row.period || "week");
      if (!Number.isFinite(limit) || !category) continue;
      budgets.push({
        name: normalizeWhitespace(row.name || displayCategoryPath(category)),
        category,
        currency: normalizeCurrency(row.currency || fallbackCurrency, fallbackCurrency),
        limit: Number(limit.toFixed(2)),
        period,
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

const INBOX_ALIASES = {
  amt: "amount", amount: "amount", total: "amount", value: "amount",
  cat: "category", category: "category", tag: "tag",
  cur: "currency", currency: "currency", ccy: "currency",
  merchant: "merchant", payee: "merchant", vendor: "merchant", name: "name",
  memo: "note", note: "note", desc: "note", description: "note",
  date: "date", when: "date",
  origamt: "originalamount", originalamount: "originalamount", foreignamount: "originalamount",
  origcur: "originalcurrency", originalcurrency: "originalcurrency", foreigncurrency: "originalcurrency",
  src: "source", source: "source",
  card: "card", pass: "card",
  id: "externalid", ref: "externalid", reference: "externalid", wiseid: "externalid", txnid: "externalid",
  transaction: "transaction",
};

function normalizeInboxParams(params) {
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(params || {})) {
    const key = INBOX_ALIASES[String(rawKey).toLowerCase()] || String(rawKey).toLowerCase();
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === "" || value === null || value === undefined) continue;
    out[key] = value;
  }
  if (out.merchant && !out.name) out.name = out.merchant;
  if (out.name && !out.merchant) out.merchant = out.name;
  return out;
}

// Parses a single capture-inbox payload (one transaction) into the loose params
// object that the plugin's capture handler consumes. Accepts three shapes:
//   1. "amount=12 | cat=food/restaurants | merchant=Nobu | date=2026-06-08"
//   2. "obsidian://finance-capture?amount=12&category=food/groceries&merchant=Coles"
//   3. a daily-note bullet "- $12 #log/spending/food/restaurants Nobu"
//   4. positional "12 food/snacks Coffee"
function parseInboxLine(raw) {
  const text = String(raw || "").replace(/^﻿/, "").trim();
  if (!text || /^(#|\/\/)/.test(text)) return null;

  const urlMatch = text.match(/[?]([^#\s]+)/);
  if (/^obsidian:\/\//i.test(text) && urlMatch) {
    const params = {};
    for (const pair of urlMatch[1].split("&")) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const key = decodeURIComponent(pair.slice(0, eq)).trim();
      const value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
      if (key) params[key] = value;
    }
    return Number.isFinite(parseNumber(params.amount || params.total)) ? normalizeInboxParams(params) : null;
  }

  if (text.includes("=")) {
    const params = {};
    for (const segment of text.replace(/\r\n/g, "\n").split(/\n|\|/)) {
      const eq = segment.indexOf("=");
      if (eq < 0) continue;
      const key = segment.slice(0, eq).trim();
      const value = segment.slice(eq + 1).trim();
      if (key) params[key] = value;
    }
    return Number.isFinite(parseNumber(params.amount || params.amt || params.total)) ? normalizeInboxParams(params) : null;
  }

  if (/#log\//i.test(text)) {
    const amount = extractVisibleAmount(text);
    if (!Number.isFinite(amount)) return null;
    const category = extractCategoryFromLogSpendingTag(text);
    const merchant = normalizeWhitespace(
      text
        .replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "")
        .replace(/#[^\s#\]]+/g, "")
        .replace(/-?\$?\d[\d,]*(?:\.\d+)?/g, "")
        .replace(/:/g, " ")
    );
    return normalizeInboxParams({ amount, category, merchant });
  }

  const tokens = text.split(/\s+/);
  const amount = parseNumber(tokens[0]);
  if (!Number.isFinite(amount)) return null;
  let category = "";
  const rest = [];
  for (const token of tokens.slice(1)) {
    if (!category && (token.includes("/") || /^#/.test(token))) category = token;
    else rest.push(token);
  }
  return normalizeInboxParams({ amount, category, merchant: rest.join(" ") });
}

// Inverse of parseInboxLine: renders a canonical one-line capture payload.
function buildInboxLine(expense) {
  const entry = expense || {};
  const parts = [`amount=${formatPlainNumber(entry.amount || 0)}`];
  const category = normalizeCategoryPath(entry.category || "");
  if (category) parts.push(`cat=${category}`);
  const merchant = normalizeWhitespace(entry.merchant || entry.name || "");
  if (merchant) parts.push(`merchant=${merchant}`);
  parts.push(`date=${parseIsoDate(entry.date) || todayIsoLocal()}`);
  const currency = normalizeCurrency(entry.currency || "", "");
  if (currency) parts.push(`cur=${currency}`);
  if (Number.isFinite(entry.originalAmount) && entry.originalCurrency) {
    parts.push(`origamt=${formatPlainNumber(entry.originalAmount)}`);
    parts.push(`origcur=${normalizeCurrency(entry.originalCurrency)}`);
  }
  if (entry.source) parts.push(`source=${normalizeWhitespace(entry.source)}`);
  if (entry.externalId) parts.push(`id=${normalizeWhitespace(entry.externalId)}`);
  return parts.join(" | ");
}

// Parses a single free-text quick-add line into structured fields.
// Grammar: first $?number = amount; a #tag or a/b path or a known category word
// = category; @token = date; everything else = merchant.
function parseQuickAddInput(text, knownCategories = []) {
  let working = ` ${String(text || "").trim()} `;

  let dateToken = "";
  working = working.replace(/(^|\s)@(\S+)/, (_match, pre, token) => {
    dateToken = token;
    return pre;
  });

  let category = "";
  const tagMatch = working.match(/(^|\s)#(\S+)/);
  if (tagMatch) {
    category = tagMatch[2];
    working = working.replace(tagMatch[0], " ");
  }
  if (!category) {
    const pathMatch = working.match(/(^|\s)([a-z][a-z0-9_-]*\/[a-z0-9/_-]+)(?=\s|$)/i);
    if (pathMatch) {
      category = pathMatch[2];
      working = working.replace(pathMatch[2], " ");
    }
  }

  let amount = null;
  const amountMatch = working.match(/-?\$?\s?(-?\d[\d,]*(?:\.\d+)?)/);
  if (amountMatch) {
    amount = Number(amountMatch[1].replace(/,/g, ""));
    working = working.replace(amountMatch[0], " ");
  }

  if (!category && knownCategories.length) {
    const map = new Map();
    for (const known of knownCategories) {
      const full = normalizeCategoryPath(known);
      if (!full) continue;
      map.set(full, full);
      const leaf = full.split("/").pop();
      if (leaf && !map.has(leaf)) map.set(leaf, full);
    }
    const tokens = working.split(/\s+/).filter(Boolean);
    const index = tokens.findIndex((token) => map.has(normalizeCategoryPath(token)));
    if (index >= 0) {
      category = map.get(normalizeCategoryPath(tokens[index]));
      tokens.splice(index, 1);
      working = ` ${tokens.join(" ")} `;
    }
  }

  const normalizedCategory = /log\/spending/i.test(category)
    ? extractCategoryFromLogSpendingTag(`#${String(category).replace(/^#/, "")}`)
    : normalizeCategoryPath(category);

  return {
    amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : null,
    category: normalizedCategory,
    dateToken,
    merchant: normalizeWhitespace(working),
  };
}

function normalizeMerchant(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Stable key for de-duplicating the same purchase arriving from different
// sources (Apple Pay automation, Wise API, bank CSV): date + amount + merchant.
function transactionFingerprint(entry) {
  const data = entry || {};
  const date = parseIsoDate(data.date) || "";
  const amount = Number(Number(data.amount || 0).toFixed(2)).toFixed(2);
  return `${date}|${amount}|${normalizeMerchant(data.merchant || data.name || "")}`;
}

// Minimal RFC-4180-ish CSV reader: handles quoted fields, escaped quotes,
// embedded commas and newlines. Returns an array of cell arrays.
function parseCsvRows(text) {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

function parseFlexibleDate(value, order = "DMY") {
  const iso = parseIsoDate(value);
  if (iso) return iso;
  const match = String(value || "").trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!match) return null;
  let first = Number(match[1]);
  let second = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  let day;
  let month;
  if (String(order).toUpperCase() === "MDY") {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }
  if (month > 12 && day <= 12) {
    const swap = month;
    month = day;
    day = swap;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Parses a bank/Wise statement CSV into spending rows. Auto-detects columns by
// header name, supports either a single signed amount column or separate
// debit/credit columns, and returns positive spend amounts in ISO dates.
function parseBankCsv(content, options = {}) {
  const rows = parseCsvRows(content);
  if (rows.length < 2) return [];
  const order = options.dateOrder || "DMY";
  const onlyDebits = options.onlyDebits !== false;
  const fallbackCurrency = normalizeCurrency(options.defaultCurrency || "AUD");
  const header = rows[0].map((cell) => normalizeWhitespace(cell).toLowerCase());

  const findColumn = (candidates) => {
    for (const candidate of candidates) {
      const exact = header.findIndex((name) => name === candidate);
      if (exact >= 0) return exact;
    }
    for (const candidate of candidates) {
      const partial = header.findIndex((name) => name.includes(candidate));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const dateCol = findColumn(options.dateColumns || ["transaction date", "completed date", "date", "posted", "created on"]);
  const amountCol = findColumn(options.amountColumns || ["amount", "value"]);
  const debitCol = findColumn(options.debitColumns || ["debit", "withdrawal", "money out", "paid out"]);
  const creditCol = findColumn(options.creditColumns || ["credit", "deposit", "money in", "paid in"]);
  const merchantCol = findColumn(options.merchantColumns || ["description", "merchant", "details", "narrative", "payee", "reference", "name"]);
  const currencyCol = findColumn(options.currencyColumns || ["currency", "ccy"]);
  const idCol = findColumn(options.idColumns || ["transaction id", "reference number", "id"]);

  const result = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    const cell = (position) => (position >= 0 && position < cells.length ? normalizeWhitespace(cells[position]) : "");
    const date = parseFlexibleDate(cell(dateCol), order);
    if (!date) continue;

    let amount = null;
    let isDebit = true;
    if (debitCol >= 0 || creditCol >= 0) {
      const debit = parseNumber(cell(debitCol));
      const credit = parseNumber(cell(creditCol));
      if (Number.isFinite(debit) && debit !== 0) {
        amount = Math.abs(debit);
        isDebit = true;
      } else if (Number.isFinite(credit) && credit !== 0) {
        amount = Math.abs(credit);
        isDebit = false;
      }
    } else {
      const raw = parseNumber(cell(amountCol));
      if (Number.isFinite(raw)) {
        amount = Math.abs(raw);
        isDebit = raw < 0;
      }
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (onlyDebits && !isDebit) continue;

    result.push({
      amount: Number(amount.toFixed(2)),
      currency: currencyCol >= 0 ? normalizeCurrency(cell(currencyCol), fallbackCurrency) : fallbackCurrency,
      date,
      externalId: cell(idCol),
      isDebit,
      merchant: cell(merchantCol),
      raw: cells.join(","),
    });
  }
  return result;
}

// Recomputes the running total on the "#log/spending <total>" root line from the
// actual entries beneath it, so hand-edits to amounts no longer leave a stale
// total. Returns the original string unchanged when the total is already correct,
// preserving the checkbox state and indentation of the root line.
function recomputeSpendingTotals(content, settings = {}) {
  const lines = splitLines(content);
  const noteDate = extractNoteDate(content, "");
  const spendingHeading = normalizeWhitespace(settings.spendingHeading || "## Spending");
  const rootTag = normalizeWhitespace(settings.spendingRootTag || "#log/spending");
  const headingIndex = lines.findIndex(
    (line) => normalizeWhitespace(line).toLowerCase() === spendingHeading.toLowerCase()
  );
  if (headingIndex === -1) return content;

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) {
      sectionEnd = index;
      break;
    }
  }

  const rootRe = new RegExp(`^- \\[[^\\]]\\] ${rootTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
  let rootLineIndex = -1;
  for (let index = headingIndex + 1; index < sectionEnd; index += 1) {
    if (rootRe.test(lines[index].trim())) {
      rootLineIndex = index;
      break;
    }
  }
  if (rootLineIndex === -1) return content;

  const total = calculateSpendingSectionTotal(lines.slice(rootLineIndex + 1, sectionEnd), noteDate, {
    defaultCurrency: settings.defaultCurrency || "AUD",
  });
  const line = lines[rootLineIndex];
  const tagPos = line.toLowerCase().indexOf(rootTag.toLowerCase());
  if (tagPos === -1) return content;
  const prefix = line.slice(0, tagPos + rootTag.length);
  const desired = `${prefix} ${formatPlainNumber(total)}`;
  if (line === desired) return content;
  lines[rootLineIndex] = desired;
  return lines.join("\n");
}

// Time-aware budget pace. Given a limit, what is spent, the period bounds and
// today, returns how far through the period we are, the on-pace spend line, the
// projected end-of-period spend, and a safe per-day amount for the rest of it.
function computeBudgetPace(input = {}) {
  const limit = Number(input.limit || 0);
  const spent = Number(input.spent || 0);
  const start = parseIsoDate(input.periodStart || input.start || "");
  const end = parseIsoDate(input.periodEnd || input.end || "");
  const reference = parseIsoDate(input.referenceDate || "") || todayIsoLocal();
  const base = {
    totalDays: 0,
    elapsedDays: 0,
    elapsedFraction: 0,
    pacedSpend: 0,
    projected: roundCurrencyAmount(spent),
    paceRatio: 0,
    onPace: true,
    remainingDays: 0,
    perDayRemaining: 0,
  };
  if (!start || !end || limit <= 0) return base;

  const totalDays = daysBetweenInclusive(start, end);
  let elapsedDays;
  let remainingDays;
  if (reference < start) {
    elapsedDays = 0;
    remainingDays = totalDays;
  } else if (reference >= end) {
    elapsedDays = totalDays;
    remainingDays = 0;
  } else {
    elapsedDays = daysBetweenInclusive(start, reference);
    remainingDays = daysBetweenInclusive(reference, end);
  }

  const elapsedFraction = totalDays > 0 ? Math.min(1, elapsedDays / totalDays) : 0;
  const pacedSpend = roundCurrencyAmount(limit * elapsedFraction);
  const projected = elapsedFraction > 0 ? roundCurrencyAmount(spent / elapsedFraction) : 0;
  const rawPaceRatio = pacedSpend > 0 ? spent / pacedSpend : spent > 0 ? 999 : 0;
  const perDayRemaining = remainingDays > 0
    ? roundCurrencyAmount(Math.max(0, limit - spent) / remainingDays)
    : roundCurrencyAmount(Math.max(0, limit - spent));

  return {
    totalDays,
    elapsedDays,
    elapsedFraction: Number(elapsedFraction.toFixed(4)),
    pacedSpend,
    projected,
    paceRatio: Number(rawPaceRatio.toFixed(3)),
    onPace: spent <= pacedSpend * 1.001,
    remainingDays,
    perDayRemaining,
  };
}

// Replaces a single logged transaction (its entry line plus any merchant/note
// child lines) with a freshly built block from `newExpense`, then recomputes the
// section total. Returns null if the original line is not found.
function replaceTransactionBlock(content, oldRawLine, newExpense, settings = {}) {
  const lines = splitLines(content);
  const target = String(oldRawLine);
  const index = lines.findIndex((line) => line === target);
  if (index < 0) return null;

  const indent = (target.match(/^\s*/) || [""])[0].length;
  let end = index + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (!line.trim()) break;
    const lineIndent = (line.match(/^\s*/) || [""])[0].length;
    if (lineIndent > indent && /^\s*-\s/.test(line)) {
      end += 1;
      continue;
    }
    break;
  }

  const expense = { ...newExpense, date: newExpense.date || extractNoteDate(content, "") };
  const block = buildTransactionBlock(expense, settings);
  lines.splice(index, end - index, ...block);
  return recomputeSpendingTotals(lines.join("\n"), settings);
}

// Removes a logged transaction (entry line + child lines) and recomputes the
// section total. Returns null if the original line is not found.
function removeTransactionBlock(content, oldRawLine, settings = {}) {
  const lines = splitLines(content);
  const target = String(oldRawLine);
  const index = lines.findIndex((line) => line === target);
  if (index < 0) return null;

  const indent = (target.match(/^\s*/) || [""])[0].length;
  let end = index + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (!line.trim()) break;
    const lineIndent = (line.match(/^\s*/) || [""])[0].length;
    if (lineIndent > indent && /^\s*-\s/.test(line)) {
      end += 1;
      continue;
    }
    break;
  }

  lines.splice(index, end - index);
  return recomputeSpendingTotals(lines.join("\n"), settings);
}

module.exports = {
  addDays,
  buildCategoryTag,
  buildCsv,
  buildAllocatedExpenseSummary,
  buildPlannedExpenseSummary,
  buildIncomeTag,
  buildInboxLine,
  buildTransactionBlock,
  parseInboxLine,
  parseQuickAddInput,
  parseBankCsv,
  parseCsvRows,
  parseFlexibleDate,
  normalizeMerchant,
  transactionFingerprint,
  recomputeSpendingTotals,
  computeBudgetPace,
  replaceTransactionBlock,
  removeTransactionBlock,
  canonicalizeFinanceTag,
  migrateFinanceTagsInContent,
  calculateSpendingSectionTotal,
  canRollBudgetPeriodIntoSection,
  daysBetweenInclusive,
  displayCategoryPath,
  extractCategoryFromLogSpendingTag,
  extractFinanceTagContext,
  extractNoteDate,
  formatCurrency,
  formatCurrencyWithCode,
  formatOriginalCurrencyLabel,
  formatPlainNumber,
  groupTransactionsByCategory,
  insertTransactionIntoDailyNote,
  isDateInRange,
  isPlannedExpenseEntry,
  getRemainingTripDaysInclusive,
  getDailyBudgetSectionPeriods,
  normalizeCategoryPath,
  normalizeBudgetPeriod,
  normalizeCurrency,
  normalizeHolidayKey,
  parseCurrencyDescriptor,
  parseBudgets,
  parseHolidayTagContext,
  parseIsoDate,
  parseNumber,
  parseTransactionsFromNoteContent,
  primaryCategory,
  roundCurrencyAmount,
  scaleBudgetLimit,
  splitHolidayEntries,
  summarizeGoalProgress,
  titleCaseSegment,
  toPeriodRange,
  periodLengthDays,
  todayIsoLocal,
};
