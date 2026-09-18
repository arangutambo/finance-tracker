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

// Codes quick-add will accept next to a number. Deliberately a closed list: any
// three letters would make "table 58 oak" parse as 58 OAK.
const CURRENCY_CODES = new Set([
  "AED", "ARS", "AUD", "BRL", "CAD", "CHF", "CLP", "CNY", "COP", "CZK", "DKK",
  "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN",
  "MYR", "NOK", "NZD", "PEN", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY",
  "TWD", "USD", "VND", "ZAR", "YEN",
]);

function isCurrencyCode(value) {
  return CURRENCY_CODES.has(String(value || "").toUpperCase());
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
  // The second alternative catches an amount written without its leading zero
  // ("$.91"), which the first one skips over — it used to read as $91.
  const matches = Array.from(visible.matchAll(/-?\d[\d,]*(?:\.\d+)?|-?\.\d+/g))
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

  // `#log/archive/<year>/<trip>/spending/<cat>` — an older habit of filing a
  // finished trip under an archive branch. The archive segment says nothing the
  // rest of the tag does not, so it is dropped and the remainder canonicalised
  // as usual, which is what makes those entries read as trip spending rather
  // than as uncategorised spending at home.
  if (parts[1] === "archive" && parts.length >= 5) {
    return canonicalizeFinanceTag(["log", ...parts.slice(2)].join("/"));
  }
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

    if (parts[1] === "owed" && parts[2]) {
      return {
        category: "uncategorized",
        entryType: "owed",
        goalKey: "",
        holidayKey: "",
        isGoalContribution: false,
        isGoalWithdrawal: false,
        isIncome: false,
        isPlannedExpense: false,
        person: normalizeCategoryPath(parts.slice(2).join("/")),
        plannedCategory: "",
      };
    }

    if (parts[1] === "balance" && parts[2]) {
      return {
        accountKey: normalizeCategoryPath(parts.slice(2).join("/")),
        category: "balance",
        entryType: "balance",
        goalKey: "",
        holidayKey: "",
        isGoalContribution: false,
        isGoalWithdrawal: false,
        isIncome: false,
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

function parseTransactionLine(line, noteDate, filePath, options = {}, childLines = [], lineIndex = -1) {
  const text = String(line || "");
  if (!text.trimStart().startsWith("-")) return null;
  if (/^\s*-\s*\[[^\]]\]\s*#log\/spending\b/i.test(text)) return null;

  const amount = extractVisibleAmount(text);
  if (!Number.isFinite(amount)) return null;

  const financeContext = extractFinanceTagContext(text);
  if (financeContext.entryType === "owed") return null;
  const holidayContext = financeContext.holidayKey
    ? parseHolidayTagContext(`${financeContext.holidayKey}/${financeContext.isPlannedExpense ? `planned/${financeContext.category}` : financeContext.category}`)
    : parseHolidayTagContext(financeContext.category);
  const category = financeContext.category || holidayContext.holidayCategory || "uncategorized";

  const currency = normalizeCurrency(options.defaultCurrency || "AUD");
  const visibleSection = stripFirstTag(text).replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "").trim();
  const originalSide = visibleSection.includes(":") ? visibleSection.split(":")[0].trim() : "";
  const originalAmount = extractVisibleAmount(`- ${originalSide}`);
  const originalDescriptor = parseCurrencyDescriptor(originalSide, currency);
  const owed = [];
  const plainChildLines = [];
  for (const child of childLines) {
    const owedItem = parseOwedChildLine(child);
    if (owedItem) {
      owed.push(owedItem);
    } else {
      plainChildLines.push(child);
    }
  }
  const owedTotal = roundCurrencyAmount(owed.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const merchant = normalizeWhitespace(plainChildLines[0] || "");
  const note = normalizeWhitespace(plainChildLines.slice(1).join(" | "));
  const plannedLogMeta = extractPlannedLogMetadata(plainChildLines);
  const plannedLineDates = holidayContext.isPlannedExpense ? extractPlannedLineDates(text) : { startDate: "", endDate: "" };
  const transactionDate = noteDate || extractNoteDate("", filePath);

  const roundedAmount = Number(Number(amount).toFixed(2));
  return {
    // Where this entry sits in its note. Two entries can share a line — same
    // amount, same category, different merchant on the child line — so the text
    // alone cannot say which one an edit meant.
    lineIndex,
    accountKey: financeContext.accountKey || "",
    amount: roundedAmount,
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
    myShare: roundCurrencyAmount(Math.max(roundedAmount - owedTotal, 0)),
    originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
    originalCurrency: originalSide ? originalDescriptor.currency : "",
    originalRateKey: originalSide ? originalDescriptor.rateKey : "",
    owed,
    owedTotal,
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
  const noteDate = extractNoteDate(content, filePath) || parseIsoDate(options.noteDate || "") || null;
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

    const parentIndent = (line.match(/^\s*/) || [""])[0].length;
    const childLines = [];
    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      const childLine = lines[childIndex];
      if (!childLine.trim()) continue;
      const childIndent = (childLine.match(/^\s*/) || [""])[0].length;
      if (/^\s*-\s/.test(childLine) && childIndent > parentIndent) {
        childLines.push(childLine.replace(/^\s*-\s*/, "").trim());
        continue;
      }
      break;
    }

    const parsed = parseTransactionLine(line, noteDate, filePath, options, childLines, index);
    if (parsed) {
      transactions.push(parsed);
    }
  }

  return transactions;
}

// Sums the entry lines of a finance section for the running total on the root
// line. Only tagged lines count: a merchant or note child line is still a
// bullet, and extractVisibleAmount will happily read a number out of one
// ("7-Eleven", "Shell Coorparoo 1234"), which used to inflate the written total
// even though the dashboards — which parse through parseTransactionsFromNoteContent,
// and have always required a tag — read the same note correctly.
function calculateSpendingSectionTotal(sectionLines, noteDate, options = {}) {
  return Number(
    sectionLines
      .filter((line) => /#log\//i.test(String(line || "")))
      .map((line) => parseTransactionLine(line, noteDate, "", options))
      .filter((entry) => entry && !entry.isIncome && !entry.isGoalContribution && entry.entryType !== "balance")
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

  for (const owedItem of expense.owed || []) {
    lines.push(`\t\t- ${buildOwedChildLine(owedItem.person, owedItem.amount, owedItem.displayName)}`);
  }

  return lines;
}

function findFinanceHeadingIndex(lines, preferred) {
  const wanted = [];
  for (const heading of [preferred, "## Finance", "## Spending"]) {
    const normalized = normalizeWhitespace(heading || "").toLowerCase();
    if (normalized && !wanted.includes(normalized)) wanted.push(normalized);
  }
  for (const heading of wanted) {
    const index = lines.findIndex((line) => normalizeWhitespace(line).toLowerCase() === heading);
    if (index >= 0) return index;
  }
  return -1;
}

function insertTransactionIntoDailyNote(content, expense, settings = {}) {
  const lines = splitLines(content);
  const noteDate = parseIsoDate(expense.date) || extractNoteDate(content, "") || todayIsoLocal();
  const spendingHeading = normalizeWhitespace(settings.spendingHeading || "## Spending");
  const rootTag = normalizeWhitespace(settings.spendingRootTag || "#log/spending");
  const rootLinePrefix = `- [ ] ${rootTag}`;
  // The configured heading first, then the one the vault used to use. Without
  // the fallback, logging into an older note that still says "## Spending" added
  // a second finance section rather than writing into the one already there.
  let headingIndex = findFinanceHeadingIndex(lines, spendingHeading);

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
    current.total += entrySpendAmount(entry);
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
    // Added at the end so a spreadsheet reading columns by position still
    // works. Without entry_type, income and balance rows looked like spending.
    "entry_type",
    "my_share",
    "trip",
    "goal",
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
    entry.entryType || "spending",
    Number.isFinite(entry.myShare) ? formatPlainNumber(entry.myShare) : "",
    entry.holidayKey || "",
    entry.goalKey || "",
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
  split: "split", owed: "owed",
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
// Quick add's free-text grammar. `options.defaultCurrency` is the home currency
// — anything tagged with a different code is treated as the original amount and
// the remaining bare number as what it actually cost you.
function parseQuickAddInput(text, knownCategories = [], options = {}) {
  let working = ` ${String(text || "").trim()} `;
  const homeCurrency = normalizeCurrency(options.defaultCurrency || "AUD");

  let dateToken = "";
  working = working.replace(/(^|\s)@(\S+)/, (_match, pre, token) => {
    dateToken = token;
    return pre;
  });

  let splitCount = null;
  working = working.replace(/(^|\s)split=(\d+)(?=\s|$)/i, (_match, pre, count) => {
    splitCount = Number(count);
    return pre;
  });

  const owedTokens = [];
  working = working.replace(/(^|\s)owed=(\S+)/gi, (_match, pre, token) => {
    owedTokens.push(token);
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

  // A number sitting next to a currency code, in either order: "58usd",
  // "USD 58", "$58 USD". The first such pair is the original amount; whatever
  // bare number is left is what it cost in the home currency. Two explicit
  // amounts means no stored rate is needed — you record what you were charged
  // and what it landed as.
  let originalAmount = null;
  let originalCurrency = "";
  const NUM = "-?\\d[\\d,]*(?:\\.\\d+)?";
  const fxPatterns = [
    new RegExp(`(^|\\s)\\$?\\s?(${NUM})\\s*([A-Za-z]{3})(?=\\s|$|[:=])`),
    new RegExp(`(^|\\s)([A-Za-z]{3})\\s*\\$?\\s?(${NUM})(?=\\s|$|[:=])`),
  ];
  for (let index = 0; index < fxPatterns.length; index += 1) {
    const match = working.match(fxPatterns[index]);
    if (!match) continue;
    const code = index === 0 ? match[3] : match[2];
    const value = index === 0 ? match[2] : match[3];
    if (!isCurrencyCode(code)) continue;
    originalAmount = Number(String(value).replace(/,/g, ""));
    originalCurrency = normalizeCurrency(code);
    working = working.replace(match[0], match[1] || " ");
    break;
  }

  let amount = null;
  const amountMatch = working.match(/-?\$?\s?(-?\d[\d,]*(?:\.\d+)?)/);
  if (amountMatch) {
    amount = Number(amountMatch[1].replace(/,/g, ""));
    working = working.replace(amountMatch[0], " ");
  }

  // A trailing home-currency code on the converted amount ("… : $83.64 AUD")
  // is confirmation, not data — drop it so it never lands in the merchant.
  working = working.replace(new RegExp(`(^|\\s)${homeCurrency}(?=\\s|$)`, "i"), "$1");
  // And the separator people naturally write between the two amounts.
  working = working.replace(/(^|\s)(?::|=|->|→)(?=\s|$)/g, "$1");

  // Only one amount given, and it was the foreign one: that is the amount. The
  // caller cannot convert it, and guessing a rate would be worse than not.
  if (!Number.isFinite(amount) && Number.isFinite(originalAmount) && originalCurrency === homeCurrency) {
    amount = originalAmount;
    originalAmount = null;
    originalCurrency = "";
  }
  // Same currency as home on both sides is not a conversion at all.
  if (originalCurrency && originalCurrency === homeCurrency && Number.isFinite(amount)) {
    originalAmount = null;
    originalCurrency = "";
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

  const hasFx = Number.isFinite(originalAmount) && Boolean(originalCurrency);
  return {
    amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : null,
    category: normalizedCategory,
    dateToken,
    merchant: normalizeWhitespace(working),
    originalAmount: hasFx ? Number(originalAmount.toFixed(2)) : null,
    originalCurrency: hasFx ? originalCurrency : "",
    // 1 unit of the original currency in home currency, for display only —
    // nothing stores it.
    impliedRate: hasFx && Number.isFinite(amount) && originalAmount !== 0
      ? Number((amount / originalAmount).toFixed(4))
      : null,
    // The user said what they paid abroad but not what it cost at home.
    needsConvertedAmount: hasFx && !Number.isFinite(amount),
    owedTokens,
    splitCount,
  };
}

function normalizeMerchant(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// A bank feed pads, truncates and prefixes the merchant with things that are not
// the merchant: a payment processor ("SQ * Rode Fresh"), a branch or address
// after a slash ("Woolworths/cnr Brisbane H"), a company suffix ("Milk N Mochi
// Pty Ltd"), a store number. Two captures from the same shop therefore rarely
// share a string, which is why categorising one Woolworths never taught the
// other. These two reduce a descriptor to the shop itself: a key for grouping
// and category lookup, and a readable name for display.
//
// Deliberately separate from normalizeMerchant, which must stay exactly as it
// is: transactionFingerprint and the cross-method duplicate ledger are built on
// it, and loosening those would collapse genuinely different purchases together.
const MERCHANT_PROCESSOR_PREFIX = /^\s*(?:sq|sp|smp|zlr|ls|pp|paypal|square|stripe|sumup|tyro|dd|eftpos|pos|visa|mc)\s*[*#]\s*/i;
// Only ever at the end, so "Australia Post" keeps its name while "Costco
// Wholesale Austr" loses the truncated country.
const MERCHANT_COMPANY_SUFFIX = /(?:[\s,]+(?:pty\.?|ltd\.?|limited|inc\.?|llc|corp\.?|co\.?|australia|austr[a-z]*|aust|aus))+[\s.]*$/i;

function stripMerchantNoise(value) {
  let text = String(value || "");
  // A wiki link stands in for the merchant; its label, or its target, is the name.
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target);
  text = text.replace(MERCHANT_PROCESSOR_PREFIX, "");
  // Everything after a slash is branch or address noise: "Woolworths/8 Sherwood Roa".
  text = text.split("/")[0];
  text = text.replace(MERCHANT_COMPANY_SUFFIX, "");
  // Store and terminal numbers. Three digits or more, so "7-Eleven" survives.
  text = text.replace(/\b\d{3,}\b/g, " ");
  return normalizeWhitespace(text);
}

// Grouping key: lowercase, punctuation-free, and stable across a merchant's
// branches and the noise each feed adds.
function merchantRootKey(value) {
  return stripMerchantNoise(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "");
}

// The same cleanup, but keeping the merchant readable: "SQ * Milk N Mochi Pty
// Ltd" is shown as "Milk N Mochi". Falls back to the original string rather than
// showing nothing.
function cleanMerchantDisplay(value) {
  const cleaned = stripMerchantNoise(value).replace(/[\s,\-\u2013\u2014&]+$/, "").trim();
  return cleaned || normalizeWhitespace(String(value || ""));
}

// Stable key for de-duplicating the same purchase arriving from different
// sources (Apple Pay automation, Wise API, bank CSV): date + amount + merchant.
function transactionFingerprint(entry) {
  const data = entry || {};
  const date = parseIsoDate(data.date) || "";
  const amount = Number(Number(data.amount || 0).toFixed(2)).toFixed(2);
  return `${date}|${amount}|${normalizeMerchant(data.merchant || data.name || "")}`;
}

// ---------------------------------------------------------------------------
// Capture methods
//
// A capture *method* is a transport — the channel a transaction travelled down
// to reach the vault. It is deliberately not the same thing as the `source=`
// field, which is free text naming the account the money actually left (anz,
// wise, cash). Both matter, because the pair is what makes cross-method
// duplicate detection safe: the same amount at the same merchant on the same
// day arriving twice down the *same* channel is two coffees, but arriving down
// two *different* channels is one coffee captured twice.
// ---------------------------------------------------------------------------

// The transports that can be switched on and off. Quick add and hand-typed
// bullets are deliberately absent — they are the in-app fallback and always
// work, so there is nothing useful about being able to disable them.
const CAPTURE_METHODS = ["url", "batch", "inbox", "gist"];

const CAPTURE_METHOD_LABELS = {
  url: "Obsidian URL",
  batch: "Batched queue",
  inbox: "Capture inbox folder",
  gist: "GitHub gist",
  "quick-add": "Quick add",
  csv: "CSV reconcile",
  recurring: "Recurring auto-log",
};

function captureMethodLabel(method) {
  const key = normalizeCaptureMethod(method);
  return CAPTURE_METHOD_LABELS[key] || key;
}

function normalizeCaptureMethod(value) {
  return String(value || "").trim().toLowerCase() || "unknown";
}

// Method + account. Two captures sharing a channel came down the same pipe from
// the same place, which is the one case that is genuinely not a duplicate.
function captureChannelKey(record) {
  const data = record || {};
  const source = normalizeWhitespace(String(data.source || "")).toLowerCase();
  return `${normalizeCaptureMethod(data.method)}:${source}`;
}

function describeCaptureChannel(channelKey) {
  const [method, source] = String(channelKey || "").split(":");
  const label = captureMethodLabel(method);
  return source ? `${label} (${source})` : label;
}

// Splits a multi-line capture payload — the body of a batched URL open or a
// gist file — into one param object per line. Each line is the same one-line
// format the inbox folder already uses, so nothing new has to be learned to
// write one. Unparseable lines are returned rather than thrown, so one bad
// line never costs you the rest of the batch.
function parseCaptureBatch(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const entries = [];
  const failures = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    const params = parseInboxLine(line);
    if (params) entries.push(params);
    else failures.push({ line, reason: "Could not parse a transaction from this line" });
  }
  return { entries, failures };
}

// Looks for an already-captured transaction that this one is probably a second
// copy of. Only ever matches across channels (see the note above), and only
// within `windowDays`, because bank feeds settle a day or two after the tap.
function findDuplicateCapture(candidate, ledger, options = {}) {
  const windowDays = Number.isFinite(options.windowDays) ? Math.max(0, options.windowDays) : 1;
  const date = parseIsoDate(candidate?.date) || "";
  const cents = toCents(candidate?.amount);
  if (!date || !Number.isFinite(cents) || cents === 0) return null;

  const merchant = normalizeMerchant(candidate?.merchant || candidate?.name || "");
  const channel = captureChannelKey(candidate);
  const records = Array.isArray(ledger) ? ledger : [];

  // Newest first: if a purchase somehow has two prior copies, the most recent
  // one is the more useful thing to name in the warning.
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (toCents(record?.amount) !== cents) continue;
    const recordDate = parseIsoDate(record?.date) || "";
    if (!recordDate) continue;
    const gap = Math.abs(Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${recordDate}T00:00:00`).getTime()) / DAY_MS));
    if (!Number.isFinite(gap) || gap > windowDays) continue;
    if (captureChannelKey(record) === channel) continue;
    // A bank feed often carries a merchant the manual capture lacks, and vice
    // versa. An empty merchant on either side still matches on amount + date.
    const recordMerchant = normalizeMerchant(record?.merchant || "");
    if (merchant && recordMerchant && merchant !== recordMerchant) continue;
    return record;
  }
  return null;
}

// Appends to the rolling record of what each method has captured. Duplicates
// that were skipped are recorded too (flagged) — they are exactly the evidence
// the overlap report needs to tell you which two methods are fighting.
function appendCaptureLedger(ledger, record, limit = 400) {
  const list = Array.isArray(ledger) ? ledger.slice() : [];
  const entry = {
    date: parseIsoDate(record?.date) || "",
    amount: roundCurrencyAmount(Number(record?.amount || 0)),
    merchant: normalizeWhitespace(record?.merchant || record?.name || ""),
    method: normalizeCaptureMethod(record?.method),
    source: normalizeWhitespace(record?.source || ""),
    at: String(record?.at || ""),
  };
  if (record?.skipped) entry.skipped = true;
  list.push(entry);
  const max = Number.isFinite(limit) && limit > 0 ? limit : 400;
  return list.length > max ? list.slice(-max) : list;
}

// Which pairs of channels have been logging the same transactions? Answers the
// "are two of my capture methods overlapping?" question from evidence rather
// than from guesswork about what a given Shortcut might be covering.
function summarizeCaptureOverlap(ledger, options = {}) {
  const records = Array.isArray(ledger) ? ledger : [];
  const since = parseIsoDate(options.since) || "";
  const groups = new Map();

  for (const record of records) {
    const date = parseIsoDate(record?.date) || "";
    if (!date || (since && date < since)) continue;
    const key = transactionFingerprint(record);
    if (!groups.has(key)) groups.set(key, { date, channels: new Set(), merchant: record?.merchant || "", amount: roundCurrencyAmount(Number(record?.amount || 0)) });
    groups.get(key).channels.add(captureChannelKey(record));
  }

  const pairs = new Map();
  for (const group of groups.values()) {
    const channels = [...group.channels].sort();
    if (channels.length < 2) continue;
    for (let a = 0; a < channels.length; a += 1) {
      for (let b = a + 1; b < channels.length; b += 1) {
        const key = `${channels[a]}→${channels[b]}`;
        if (!pairs.has(key)) pairs.set(key, { channels: [channels[a], channels[b]], count: 0, lastDate: "", sample: null });
        const pair = pairs.get(key);
        pair.count += 1;
        if (group.date > pair.lastDate) {
          pair.lastDate = group.date;
          pair.sample = { date: group.date, amount: group.amount, merchant: group.merchant };
        }
      }
    }
  }

  return [...pairs.values()].sort((left, right) => right.count - left.count || right.lastDate.localeCompare(left.lastDate));
}

// The phone can append to the gist between the read and the clear that follows
// it. Only the exact prefix that was consumed is removed, so anything that
// landed after it survives to the next poll. A `null` return means the file was
// rewritten out from under us and must be left alone.
function buildGistRemainder(consumed, current) {
  const before = String(consumed || "");
  const now = String(current || "");
  if (!before) return now;
  if (now.startsWith(before)) return now.slice(before.length);
  return null;
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
  // Same fallback as the insert path: a note that still uses the older heading
  // gets its total healed rather than silently skipped.
  const headingIndex = findFinanceHeadingIndex(lines, spendingHeading);
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
// Finds the line an edit refers to. The raw text is the identifier, but where
// two entries share it, a recorded line index says which one — verified against
// the text, so a note edited since the entry was parsed falls back to the search
// rather than writing to the wrong place.
function findTransactionLineIndex(lines, target, options = {}) {
  const index = options.lineIndex;
  if (Number.isInteger(index) && index >= 0 && index < lines.length && lines[index] === target) return index;
  return lines.findIndex((line) => line === target);
}

function replaceTransactionBlock(content, oldRawLine, newExpense, settings = {}, options = {}) {
  const lines = splitLines(content);
  const target = String(oldRawLine);
  const index = findTransactionLineIndex(lines, target, options);
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
function removeTransactionBlock(content, oldRawLine, settings = {}, options = {}) {
  const lines = splitLines(content);
  const target = String(oldRawLine);
  const index = findTransactionLineIndex(lines, target, options);
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

// ---------------------------------------------------------------------------
// v0.2.0 core additions: recurring payments, unified goals, split expenses,
// balance snapshots / net worth, forecasting, the finance-query engine, the
// hierarchical hue-family colour system, and daily-note format helpers.
// ---------------------------------------------------------------------------

const RECURRING_CADENCES = {
  weekly: { days: 7, perMonth: 52 / 12, label: "Weekly" },
  fortnightly: { days: 14, perMonth: 26 / 12, label: "Fortnightly" },
  monthly: { months: 1, perMonth: 1, label: "Monthly" },
  quarterly: { months: 3, perMonth: 1 / 3, label: "Quarterly" },
  yearly: { months: 12, perMonth: 1 / 12, label: "Yearly" },
};

function normalizeCadence(value) {
  const token = String(value || "").toLowerCase().trim();
  const aliases = {
    week: "weekly", weekly: "weekly",
    fortnight: "fortnightly", fortnightly: "fortnightly", biweekly: "fortnightly",
    month: "monthly", monthly: "monthly",
    quarter: "quarterly", quarterly: "quarterly",
    year: "yearly", yearly: "yearly", annual: "yearly", annually: "yearly",
  };
  return aliases[token] || "";
}

// Adds calendar months, clamping to the end of shorter months (Jan 31 + 1mo = Feb 28).
function addMonths(iso, count) {
  const date = isoToDate(iso);
  if (!date) return null;
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return todayIsoLocal(target);
}

function nextRecurringDate(lastDate, cadence) {
  const iso = parseIsoDate(lastDate);
  const spec = RECURRING_CADENCES[normalizeCadence(cadence)];
  if (!iso || !spec) return null;
  return spec.days ? addDays(iso, spec.days) : addMonths(iso, spec.months);
}

// Detects recurring payments from tags like #log/spending/subscriptions/monthly/spotify.
// The segment after the prefix is the cadence; the rest names the item. Each
// item's amount is inferred from its last logged entry and next-due from
// last-logged-date + cadence.
function detectRecurringPayments(entries, options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const items = new Map();

  for (const entry of entries || []) {
    if (!entry || entry.isIncome || entry.isGoalContribution || isPlannedExpenseEntry(entry)) continue;
    const category = normalizeCategoryPath(entry.category || "");
    if (category !== prefix && !category.startsWith(`${prefix}/`)) continue;
    const rest = category.slice(prefix.length).split("/").filter(Boolean);
    const cadence = normalizeCadence(rest[0]);
    if (!cadence) continue;
    const rawCadence = rest[0];
    const taggedName = rest.slice(1).join("/");
    const name = taggedName || normalizeCategoryPath(entry.merchant || "") || "recurring";
    const key = `${cadence}/${name}`;
    const date = parseIsoDate(entry.date) || "";
    const amount = roundCurrencyAmount(entry.amount || 0);
    const current = items.get(key);
    if (!current) {
      // A $0 line is a skip marker for a bill that already exists — it moves
      // that bill's anchor forward. On a tag with no item name (a bare
      // `subscriptions/monthly`) the name falls back to the merchant, which for
      // a skip is its own note line: that used to mint a phantom "Skipped This
      // Cycle" bill, and skipping *that* wrote another nameless line, so the
      // ghost renewed itself forever. A skip can never introduce a bill.
      if (!(amount > 0) && !taggedName) continue;
      items.set(key, {
        cadence,
        rawCadence,
        firstDate: date,
        name,
        label: titleCaseSegment(name.split("/").pop()),
        merchant: normalizeWhitespace(entry.merchant || "") || titleCaseSegment(name.split("/").pop()),
        category,
        currency: entry.currency || "",
        lastAmount: amount,
        lastDate: date,
        count: 1,
        history: amount > 0 ? [{ date, amount }] : [],
      });
      continue;
    }
    current.count += 1;
    if (date && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
    if (amount > 0) current.history.push({ date, amount });
    if (date >= current.lastDate) {
      current.lastDate = date;
      current.category = category;
      current.rawCadence = rawCadence;
      if (entry.merchant) current.merchant = normalizeWhitespace(entry.merchant);
      // a $0 entry (a skipped cycle) moves the anchor without changing the amount
      if (amount > 0) current.lastAmount = amount;
    } else if (!(current.lastAmount > 0) && amount > 0) {
      current.lastAmount = amount;
    }
  }

  const rows = Array.from(items.values()).map(({ history, ...item }) => {
    const spec = RECURRING_CADENCES[item.cadence];
    const nextDue = item.lastDate ? nextRecurringDate(item.lastDate, item.cadence) : null;
    const status = !nextDue
      ? "unknown"
      : nextDue < referenceDate
        ? "overdue"
        : nextDue === referenceDate
          ? "due"
          : "upcoming";
    // Recent amounts (oldest to newest, last 6 real payments) let variable
    // bills — utilities and the like — project off an average instead of
    // whatever the last bill happened to cost.
    const recentAmounts = history.sort((left, right) => left.date.localeCompare(right.date)).slice(-6).map((entry) => entry.amount);
    const averageAmount = recentAmounts.length
      ? roundCurrencyAmount(recentAmounts.reduce((sum, value) => sum + value, 0) / recentAmounts.length)
      : item.lastAmount;
    return {
      ...item,
      recentAmounts,
      averageAmount,
      monthlyCost: roundCurrencyAmount(item.lastAmount * spec.perMonth),
      yearlyCost: roundCurrencyAmount(item.lastAmount * spec.perMonth * 12),
      nextDue,
      status,
      daysUntilDue: nextDue ? (nextDue >= referenceDate ? daysBetweenInclusive(referenceDate, nextDue) - 1 : -(daysBetweenInclusive(nextDue, referenceDate) - 1)) : null,
      tag: `#log/spending/${item.category}`,
    };
  });

  const statusRank = { overdue: 0, due: 1, upcoming: 2, unknown: 3 };
  rows.sort((left, right) => {
    if (statusRank[left.status] !== statusRank[right.status]) return statusRank[left.status] - statusRank[right.status];
    return String(left.nextDue || "").localeCompare(String(right.nextDue || ""));
  });

  return {
    items: rows,
    totals: {
      monthly: roundCurrencyAmount(rows.reduce((sum, row) => sum + row.monthlyCost, 0)),
      yearly: roundCurrencyAmount(rows.reduce((sum, row) => sum + row.yearlyCost, 0)),
    },
  };
}

// --- Money in integer cents -----------------------------------------------------
// Most of this file rounds after each step with roundCurrencyAmount, which is
// fine for one or two operations. The runway and forecast maths are several
// float operations deep before anything is rounded (a per-year figure built
// from 52/12, then divided by 52, 12 and 4 again), so those work in integer
// cents and convert back once at the boundary.

function toCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(cents) {
  return Number((Math.round(Number(cents) || 0) / 100).toFixed(2));
}

// Projects one bill's upcoming due dates together with the amount each of them
// will actually be charged at. A scheduled price change (Next Amount / Change
// Date) only applies from its date onward, so the cycles landing before it are
// still owed at the old price — that split is the whole point of this helper,
// and it is what lets the UI say "two more at $89.00, then $66.50" instead of
// only "changing to $66.50 on 2026-08-15". End Date and Payments Left stop the
// walk, so a bill that retires mid-window is not projected past its own end.
//
// Options: referenceDate, count (max occurrences, default 12), end (horizon
// date), plus amount/nextAmount/changeDate/endDate/paymentsLeft/nextDue
// overrides so an editor can preview terms that have not been saved yet.
function buildRecurringSchedule(item, options = {}) {
  const cadence = normalizeCadence(options.cadence ?? item?.cadence);
  const spec = RECURRING_CADENCES[cadence];
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const horizon = parseIsoDate(options.end || "") || "";
  const maxCount = Number.isFinite(options.count) && options.count > 0 ? Math.floor(options.count) : 12;

  const pick = (key) => (options[key] !== undefined ? options[key] : item?.[key]);
  // null/""/undefined all mean "not set" here. Number(null) is 0, not NaN, so
  // a plain Number.isFinite guard would read an unset Payments Left as "none
  // left" and stop the schedule before its first occurrence.
  const asNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const amount = roundCurrencyAmount(asNumber(pick("amount")) ?? asNumber(item?.lastAmount) ?? 0);
  const rawNextAmount = asNumber(pick("nextAmount"));
  const nextAmount = rawNextAmount !== null && rawNextAmount > 0 ? roundCurrencyAmount(rawNextAmount) : null;
  const changeDate = nextAmount ? parseIsoDate(pick("changeDate") || "") : "";
  const endDate = parseIsoDate(pick("endDate") || "") || "";
  const rawPaymentsLeft = asNumber(pick("paymentsLeft"));
  const paymentsLeft = rawPaymentsLeft !== null && rawPaymentsLeft >= 0 ? Math.floor(rawPaymentsLeft) : null;

  const empty = {
    afterChange: { count: 0, total: 0 },
    beforeChange: { count: 0, total: 0 },
    cadence,
    changeDate: changeDate || "",
    changeOccurrence: "",
    finishReason: "",
    finishesOn: "",
    nextAmount: nextAmount || null,
    occurrences: [],
  };

  const start = parseIsoDate(pick("nextDue") || "");
  if (!spec || !start) return empty;

  const occurrences = [];
  let due = start;
  let guard = 0;
  let finishReason = "";
  // The guard stops a corrupt cadence from looping forever.
  while (due && guard < 400 && occurrences.length < maxCount) {
    guard += 1;
    if (endDate && due > endDate) {
      finishReason = "end-date";
      break;
    }
    if (paymentsLeft !== null && occurrences.length >= paymentsLeft) {
      finishReason = "payments";
      break;
    }
    if (horizon && due > horizon) break;
    const isNewPrice = Boolean(changeDate && due >= changeDate);
    occurrences.push({
      amount: isNewPrice ? nextAmount : amount,
      date: due,
      index: occurrences.length,
      isNewPrice,
      isPast: due < referenceDate,
    });
    due = nextRecurringDate(due, cadence);
  }

  const before = occurrences.filter((occurrence) => !occurrence.isNewPrice);
  const after = occurrences.filter((occurrence) => occurrence.isNewPrice);
  const sum = (list) => roundCurrencyAmount(list.reduce((total, occurrence) => total + occurrence.amount, 0));

  return {
    ...empty,
    afterChange: { count: after.length, total: sum(after) },
    beforeChange: { count: before.length, total: sum(before) },
    changeOccurrence: after[0]?.date || "",
    finishReason,
    finishesOn: finishReason ? occurrences[occurrences.length - 1]?.date || "" : "",
    occurrences,
  };
}

// Walks each active bill's schedule forward and sums every occurrence landing
// on or before `end`. This is what makes the runway target react to the
// calendar rather than to an average: a yearly insurance renewal is worth
// nothing to the target until it enters the window, then worth all of it.
// Each occurrence is priced through buildRecurringSchedule, so a bill with a
// price change landing inside the window is counted at the price that will
// actually be charged, and one that retires inside the window stops there.
// Returns integer cents plus the individual occurrences, newest last.
function sumRecurringDueWithin(recurring, referenceDate, end) {
  const today = parseIsoDate(referenceDate) || todayIsoLocal();
  const horizon = parseIsoDate(end);
  const occurrences = [];
  let totalCents = 0;
  if (!horizon || horizon < today) return { totalCents, occurrences };

  for (const item of recurring?.items || []) {
    if (!RECURRING_CADENCES[item.cadence] || !(item.lastAmount > 0) || item.active === false) continue;
    const schedule = buildRecurringSchedule(item, {
      count: 400,
      end: horizon,
      referenceDate: today,
    });
    for (const occurrence of schedule.occurrences) {
      totalCents += toCents(occurrence.amount);
      occurrences.push({
        amount: occurrence.amount,
        cadence: item.cadence,
        date: occurrence.date,
        isNewPrice: occurrence.isNewPrice,
        label: item.label,
        name: item.name,
      });
    }
  }

  occurrences.sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return { totalCents, occurrences };
}

// Runway is a read-only figure, not something you fund — see computeRunway. But
// 0.6 shipped a "bill reserve" you could contribute to, and an early 0.7 build
// briefly made runway a goal note. Bullets under either key still exist in real
// vaults, and they are transfers rather than income, so they stay excluded from
// income totals and from the goal lists.
const RUNWAY_LEGACY_KEYS = new Set(["runway", "billreserve"]);

function normalizeRunwayMode(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return raw === "bills" || raw === "bills-only" ? "bills" : "spending";
}

const RUNWAY_UNITS = {
  day: { days: 1 },
  week: { days: 7 },
  fortnight: { days: 14 },
  month: { months: 1 },
  quarter: { months: 3 },
  year: { months: 12 },
};

// Parses "1 month", "2 weeks", "6 months", "3mo", "1w" into a normalized
// { count, unit, label }. Anything unrecognised falls back to one month.
//
// Idempotent on purpose: it accepts its own output, so a caller that has already
// parsed a period can pass the object straight through. Without this, stringifying
// a parsed object yielded "[object Object]" and silently fell back to one month —
// which is exactly how a 3-month target ended up measuring a 1-month window.
function parseRunwayPeriod(value) {
  if (value && typeof value === "object" && value.unit in RUNWAY_UNITS) {
    const count = Math.max(1, Number(value.count) || 1);
    return { count, unit: value.unit, label: `${count} ${value.unit}${count === 1 ? "" : "s"}` };
  }
  const raw = normalizeWhitespace(String(value || "")).toLowerCase();
  const match = raw.match(/^(\d+)?\s*([a-z]+)$/);
  const aliases = {
    d: "day", day: "day", days: "day",
    w: "week", wk: "week", week: "week", weeks: "week",
    fortnight: "fortnight", fortnights: "fortnight", biweekly: "fortnight",
    m: "month", mo: "month", month: "month", months: "month",
    q: "quarter", quarter: "quarter", quarters: "quarter",
    y: "year", yr: "year", year: "year", years: "year",
  };
  const unit = aliases[match?.[2]] || "month";
  const count = Math.max(1, Number(match?.[1]) || 1);
  return { count, unit, label: `${count} ${unit}${count === 1 ? "" : "s"}` };
}

// The last day covered by a runway period starting at `referenceDate`.
function runwayWindowEnd(referenceDate, period) {
  const today = parseIsoDate(referenceDate) || todayIsoLocal();
  const { count, unit } = parseRunwayPeriod(period);
  const spec = RUNWAY_UNITS[unit] || RUNWAY_UNITS.month;
  const end = spec.days ? addDays(today, spec.days * count) : addMonths(today, spec.months * count);
  // Exclusive end: a 1-month window starting today covers up to the day before
  // the same date next month, so two consecutive windows never double-count a
  // bill that falls on the boundary.
  return addDays(end, -1);
}

// What you need to have available to be safe for a chosen period.
//
// This is a read-only figure, deliberately: there is nothing to fund, no balance
// to keep, and no bookkeeping. It answers one question — "how much do I need in
// the account for the next N?" — by walking each bill's schedule forward and
// summing what actually lands, optionally plus your usual discretionary spend.
//
// `mode` decides what counts:
//   "bills"     - recurring bills falling inside the window
//   "spending"  - those bills plus your trailing-average discretionary spend
function computeRunway(recurring, options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const period = parseRunwayPeriod(options.period);
  const mode = normalizeRunwayMode(options.mode);
  const windowEnd = runwayWindowEnd(referenceDate, period);
  const windowDays = Math.max(1, daysBetweenInclusive(referenceDate, windowEnd));

  const { totalCents: billsCents, occurrences } = sumRecurringDueWithin(recurring, referenceDate, windowEnd);
  const dailyDiscretionaryCents = Math.round(toCents(options.monthlyDiscretionary || 0) / 30.44);
  const discretionaryCents = mode === "spending" ? dailyDiscretionaryCents * windowDays : 0;
  const targetCents = billsCents + discretionaryCents;

  return {
    mode,
    period: period.label,
    periodCount: period.count,
    periodUnit: period.unit,
    windowStart: referenceDate,
    windowEnd,
    windowDays,
    bills: fromCents(billsCents),
    discretionary: fromCents(discretionaryCents),
    target: fromCents(targetCents),
    perWeek: fromCents(Math.round((targetCents / windowDays) * 7)),
    perDay: fromCents(Math.round(targetCents / windowDays)),
    occurrences,
  };
}


// Runway against money you actually have. `account` is a balance snapshot
// ({ amount, date }) for the account the outgoings come from. Days covered
// walks the window day by day — bills land on their dates, usual spending a
// little each day — so a large bill on day 3 counts on day 3, not spread thin.
// Past the window it carries on at the window's average daily cost.
const RUNWAY_STALE_BALANCE_DAYS = 14;

function compareRunwayToBalance(runway, account, options = {}) {
  const amount = Number(account?.amount);
  if (!runway || !Number.isFinite(amount)) return { status: "no-balance" };
  const referenceDate = parseIsoDate(options.referenceDate) || runway.windowStart || todayIsoLocal();
  const target = roundCurrencyAmount(runway.target || 0);
  const windowDays = Math.max(1, Number(runway.windowDays) || 1);
  const dailySpendCents = Math.round(toCents(runway.discretionary || 0) / windowDays);
  const billsByDate = new Map();
  for (const occurrence of runway.occurrences || []) {
    billsByDate.set(occurrence.date, (billsByDate.get(occurrence.date) || 0) + toCents(occurrence.amount || 0));
  }

  const balanceCents = toCents(amount);
  let spentCents = 0;
  let daysCovered = 0;
  let runsOutOn = "";
  for (let day = 0; day < windowDays; day += 1) {
    const date = addDays(runway.windowStart || referenceDate, day);
    spentCents += dailySpendCents + (billsByDate.get(date) || 0);
    if (spentCents > balanceCents) {
      runsOutOn = date;
      break;
    }
    daysCovered += 1;
  }
  if (!runsOutOn) {
    const perDayCents = Math.round(toCents(target) / windowDays);
    if (perDayCents > 0) daysCovered += Math.floor((balanceCents - spentCents) / perDayCents);
  }

  const difference = roundCurrencyAmount(amount - target);
  const asOf = parseIsoDate(account.date) || "";
  const ageDays = asOf ? daysBetweenInclusive(asOf, referenceDate) - 1 : null;
  return {
    status: difference >= 0 ? "covered" : "short",
    balance: roundCurrencyAmount(amount),
    target,
    difference,
    daysCovered: Math.max(0, daysCovered),
    runsOutOn,
    asOf,
    stale: ageDays !== null && ageDays > RUNWAY_STALE_BALANCE_DAYS,
    ageDays,
  };
}

const RECURRING_REGISTRY_COLUMNS = [
  { header: "Item", align: "---" },
  { header: "Cadence", align: "---" },
  { header: "Amount", align: "---:" },
  { header: "Active", align: "---" },
  { header: "Auto-log", align: "---" },
  { header: "Variable", align: "---" },
  { header: "Next Amount", align: "---:" },
  { header: "Change Date", align: "---" },
  { header: "Next Due", align: "---" },
  { header: "End Date", align: "---" },
  { header: "Payments Left", align: "---:" },
];

const RECURRING_REGISTRY_HEADER_ROW = `| ${RECURRING_REGISTRY_COLUMNS.map((column) => column.header).join(" | ")} |`;
const RECURRING_REGISTRY_SEPARATOR_ROW = `| ${RECURRING_REGISTRY_COLUMNS.map((column) => column.align).join(" | ")} |`;

// The recurring registry is a hand-editable markdown table (in the recurring
// payments note) that holds per-item state the tags cannot: whether a bill is
// still current (Active), whether it may be auto-logged (Auto-log), an optional
// amount override, and when the bill stops (End Date / Payments Left). Blank
// cells keep the defaults, so an absent table changes nothing.
function parseRecurringRegistry(content) {
  const registry = new Map();
  for (const rows of parseMarkdownTable(content)) {
    for (const row of rows) {
      const name = normalizeCategoryPath(row.item || row.name || "");
      if (!name || !("active" in row || "auto-log" in row || "autolog" in row || "current" in row)) continue;
      const activeRaw = String(row.active ?? row.current ?? "").trim();
      const autoRaw = String(row["auto-log"] ?? row.autolog ?? row.auto ?? "").trim();
      const variableRaw = String(row.variable ?? "").trim();
      const amount = parseNumber(row.amount);
      const nextAmount = parseNumber(row["next amount"] ?? row.nextamount);
      const changeDate = parseIsoDate(row["change date"] ?? row.changedate ?? "");
      const nextDue = parseIsoDate(row["next due"] ?? row.nextdue ?? "");
      const endDate = parseIsoDate(row["end date"] ?? row.enddate ?? row.until ?? "");
      const paymentsLeft = parseNumber(row["payments left"] ?? row.paymentsleft ?? row.occurrences ?? "");
      registry.set(name, {
        active: activeRaw ? !/^(?:no|false|0|inactive|paused)$/i.test(activeRaw) : true,
        autoLog: autoRaw ? /^(?:yes|true|1|on)$/i.test(autoRaw) : null,
        variable: /^(?:yes|true|1|on)$/i.test(variableRaw),
        amount: Number.isFinite(amount) && amount > 0 ? roundCurrencyAmount(amount) : null,
        nextAmount: Number.isFinite(nextAmount) && nextAmount > 0 ? roundCurrencyAmount(nextAmount) : null,
        changeDate: changeDate || null,
        nextDue: nextDue || null,
        endDate: endDate || null,
        paymentsLeft: Number.isFinite(paymentsLeft) && paymentsLeft >= 0 ? Math.floor(paymentsLeft) : null,
        cadence: normalizeCadence(row.cadence || ""),
      });
    }
  }
  return registry;
}

// Overlays registry state onto detected recurring items: inactive items are
// kept (so they can be resumed) but flagged and excluded from the totals. A
// scheduled Next Amount/Change Date pair is purely informational until the
// change date arrives, at which point it is promoted to the effective amount.
// A Next Due override lets the due-date schedule stay anchored to its own
// cadence even when a bill is logged late (or early) — without it, logging a
// bill's real payment date would silently push every future due date out by
// however many days late it was.
//
// A bill that has run its course — past its End Date, or with no Payments Left
// — becomes inactive with `finished` set. Reusing `active` means every existing
// consumer (totals, auto-logging, the reserve maths, the due-bills card) drops
// it without changes; `finishedReason` is only there so the UI can say "ended"
// rather than "paused".
function applyRecurringRegistry(recurring, registry, referenceDate = todayIsoLocal()) {
  const items = (recurring?.items || []).map((item) => {
    const entry = registry?.get(item.name) || registry?.get(item.name.split("/").pop());
    const autoLog = entry && entry.autoLog !== null && entry.autoLog !== undefined ? entry.autoLog : true;
    const variable = Boolean(entry?.variable);
    // A manual Amount override always wins. Otherwise a variable bill (a
    // fluctuating utility, say) projects off the average of its recent
    // payments rather than whatever the last one happened to cost; a fixed
    // bill just uses the last logged amount, as before.
    const baseAmount = entry?.amount > 0 ? entry.amount : variable ? item.averageAmount ?? item.lastAmount : item.lastAmount;
    const changePending = entry?.nextAmount > 0 && entry?.changeDate && entry.changeDate > referenceDate;
    const changeApplied = entry?.nextAmount > 0 && entry?.changeDate && entry.changeDate <= referenceDate;
    // lastAmount is "what a payment made right now costs", so auto-logging and
    // Log now stay on the old price until the change date genuinely arrives.
    const lastAmount = changeApplied ? entry.nextAmount : baseAmount;
    const spec = RECURRING_CADENCES[item.cadence];
    const nextDue = entry?.nextDue || item.nextDue;
    // …but every forward-looking figure has to use the price that will apply on
    // the next due date. A bill repricing on 15 Aug whose next payment is not
    // until 8 Oct will never be charged the old price again, so projecting its
    // monthly cost off that price simply overstates it.
    const nextDueAmount = entry?.nextAmount > 0 && entry?.changeDate && nextDue && entry.changeDate <= nextDue
      ? entry.nextAmount
      : lastAmount;

    const endDate = entry?.endDate || null;
    const paymentsLeft = Number.isFinite(entry?.paymentsLeft) ? entry.paymentsLeft : null;
    const outOfPayments = paymentsLeft !== null && paymentsLeft <= 0;
    // Past the end date once there is no due date left inside it — a bill due
    // on the end date itself is still owed.
    const pastEndDate = Boolean(endDate && (!nextDue || nextDue > endDate));
    const finishedReason = outOfPayments ? "payments" : pastEndDate ? "end-date" : "";
    const finished = Boolean(finishedReason);
    const active = (entry ? entry.active !== false : true) && !finished;

    const status = finished
      ? "finished"
      : !nextDue
        ? "unknown"
        : nextDue < referenceDate
          ? "overdue"
          : nextDue === referenceDate
            ? "due"
            : "upcoming";
    const daysUntilDue = nextDue
      ? nextDue >= referenceDate
        ? daysBetweenInclusive(referenceDate, nextDue) - 1
        : -(daysBetweenInclusive(nextDue, referenceDate) - 1)
      : null;
    return {
      ...item,
      active,
      autoLog,
      variable,
      lastAmount,
      nextAmount: changePending ? entry.nextAmount : null,
      nextDueAmount,
      changeDate: changePending ? entry.changeDate : null,
      nextDue,
      endDate,
      paymentsLeft,
      finished,
      finishedReason,
      status,
      daysUntilDue,
      monthlyCost: spec ? roundCurrencyAmount(nextDueAmount * spec.perMonth) : item.monthlyCost,
      yearlyCost: spec ? roundCurrencyAmount(nextDueAmount * spec.perMonth * 12) : item.yearlyCost,
    };
  });
  const activeItems = items.filter((item) => item.active);
  return {
    items,
    totals: {
      monthly: roundCurrencyAmount(activeItems.reduce((sum, item) => sum + item.monthlyCost, 0)),
      yearly: roundCurrencyAmount(activeItems.reduce((sum, item) => sum + item.yearlyCost, 0)),
    },
  };
}

// --- Unified goal schema -----------------------------------------------------
// One frontmatter format for savings goals and trips: any goal with
// target_amount + due_date gets sinking-fund math; a holiday is simply a goal
// that also carries trip_tag, start/end dates, and a currency. The legacy
// goal_key / holiday_tag keys keep parsing so un-migrated notes still render.
function parseGoalDefinition(frontmatter, options = {}) {
  const fm = frontmatter || {};
  const fallbackCurrency = options.defaultCurrency || "AUD";
  const tripTag = normalizeHolidayKey(fm.trip_tag || fm.holiday_tag || fm.holiday || "");
  const goalName = normalizeWhitespace(fm.goal_name || fm.holiday_name || fm.name || options.fallbackName || "");
  const goalKey = normalizeCategoryPath(
    fm.goal_key || fm.savings_goal_key || (tripTag ? tripTag.split("/")[1] : "") || goalName
  );
  const targetAmount = parseNumber(fm.target_amount ?? fm.savings_goal_amount ?? fm.total_budget);
  const dueDate = parseIsoDate(fm.due_date || fm.savings_due_date || fm.goal_due_date || (tripTag ? fm.start_date : "") || "");
  const hasGoalKeys =
    "goal_key" in fm || "savings_goal_key" in fm || "target_amount" in fm ||
    "savings_goal_amount" in fm || tripTag;
  if (!hasGoalKeys || !goalKey) return null;

  const isTrip = Boolean(tripTag);
  const archivedDate = parseIsoDate(fm.archived || "");
  // Notes left over from the build where runway was briefly a goal note. They
  // are not goals — runway is computed from your bills, never funded — so they
  // are flagged here and filtered out of every goal list.
  const isLegacyRunwayNote =
    RUNWAY_LEGACY_KEYS.has(goalKey) || String(fm.goal_type || "").trim().toLowerCase() === "runway";
  return {
    isLegacyRunwayNote,
    active: !archivedDate && /^(?:true|yes|1)$/i.test(String(fm.active ?? fm.active_savings_goal ?? "false")),
    archivedDate: archivedDate || "",
    carryMissedSavings: /^(?:true|yes|1)$/i.test(String(fm.carry_missed_savings || "false")),
    currency: normalizeCurrency(fm.currency || fallbackCurrency, fallbackCurrency),
    dueDate: dueDate || "",
    endDate: parseIsoDate(fm.end_date || fm.end || fm.return_date || ""),
    goalKey,
    goalName: goalName || titleCaseSegment(goalKey),
    goalType: isTrip ? "holiday" : String(fm.goal_type || "general").trim().toLowerCase(),
    savingsDisplayMode: String(fm.savings_display_mode || (isTrip ? "dual-phase" : "standard")).trim().toLowerCase(),
    savingsProgressMode: String(fm.savings_progress_mode || (isTrip ? "account-plus-paid-planned" : "account-only")).trim().toLowerCase(),
    startDate: parseIsoDate(fm.start_date || fm.start || fm.departure_date || ""),
    startingBalance: parseNumber(fm.starting_balance ?? fm.savings_starting_balance ?? "0") || 0,
    targetAmount: Number.isFinite(targetAmount) ? roundCurrencyAmount(targetAmount) : 0,
    totalBudget: roundCurrencyAmount(parseNumber(fm.total_budget || fm.budget || "") || targetAmount || 0),
    tripCurrency: normalizeCurrency(fm.trip_currency || "", ""),
    tripTag,
  };
}

// Sinking-fund math: what has to be set aside each week between now and the
// due date, and whether saving is ahead of or behind the linear pace line.
function computeSinkingFund(input = {}) {
  const targetAmount = roundCurrencyAmount(input.targetAmount || 0);
  const currentSaved = roundCurrencyAmount(input.currentSaved || 0);
  const dueDate = parseIsoDate(input.dueDate || "");
  const referenceDate = parseIsoDate(input.referenceDate || "") || todayIsoLocal();
  const anchorDate = parseIsoDate(input.anchorDate || "");
  const remaining = Math.max(roundCurrencyAmount(targetAmount - currentSaved), 0);

  const daysLeft = dueDate && dueDate >= referenceDate ? daysBetweenInclusive(referenceDate, dueDate) - 1 : 0;
  const weeksLeft = daysLeft > 0 ? Math.max(1, Math.ceil(daysLeft / 7)) : 0;
  const requiredPerWeek = remaining <= 0 ? 0 : weeksLeft > 0 ? roundCurrencyAmount(remaining / weeksLeft) : remaining;

  let expectedByNow = null;
  let status = remaining <= 0 ? "complete" : dueDate && dueDate < referenceDate ? "overdue" : "on-track";
  if (remaining > 0 && anchorDate && dueDate && dueDate > anchorDate && referenceDate >= anchorDate) {
    const totalSpan = daysBetweenInclusive(anchorDate, dueDate) - 1;
    const elapsed = Math.min(daysBetweenInclusive(anchorDate, referenceDate) - 1, totalSpan);
    expectedByNow = roundCurrencyAmount((targetAmount * elapsed) / Math.max(totalSpan, 1));
    status = currentSaved >= expectedByNow ? "ahead" : "behind";
  } else if (status === "on-track") {
    // With nothing to measure pace from there is no pace to be on. This used to
    // fall through to "on track", which is how a goal with $0 of $2,000 saved,
    // due tomorrow, described itself.
    status = currentSaved > 0 ? "saving" : "not-started";
  }

  return { currentSaved, daysLeft, expectedByNow, remaining, requiredPerWeek, status, targetAmount, weeksLeft };
}

// --- Goal keys and trip tags ------------------------------------------------------
// Creating a goal used to ask for a "Goal key" and a trip for a "Trip tracking
// tag" — the internal names tags are built from. They are derived from the name
// now, kept unique, and only shown as the tag they produce.

function slugifyName(value) {
  const plain = String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/]+/g, " ");
  return normalizeCategoryPath(plain).replace(/\//g, "-");
}

function uniqueKey(base, taken) {
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

// `existingKeys` should hold every goal key and every income category already in
// use: a goal called "Salary" must not turn salary into goal contributions.
function deriveGoalKey(name, existingKeys = []) {
  const base = slugifyName(name) || "goal";
  const taken = new Set((existingKeys || []).map((key) => slugifyName(key)).filter(Boolean));
  return uniqueKey(base, taken);
}

// "Japan 2026" → 2026/japan. The year comes from the name when it has one, and
// from the trip's start date otherwise, so a trip in January planned in
// November gets the right year.
function deriveTripTag(name, options = {}) {
  const raw = String(name || "");
  const yearMatch = raw.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : (parseIsoDate(options.startDate) || todayIsoLocal()).slice(0, 4);
  const slug = slugifyName(raw.replace(/\b20\d{2}\b/g, " ")) || "trip";
  const taken = new Set((options.existingTags || []).map((tag) => normalizeHolidayKey(tag)).filter(Boolean));
  const base = `${year}/${slug}`;
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

// --- Trip exchange rates -----------------------------------------------------------
// "Fetch current rate" asks Frankfurter for the European Central Bank's daily
// reference rate. Free, no key, about thirty currencies. The rate is written the
// way trip notes already hold them: how much of the home currency one unit of
// the trip currency is worth.
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";

function buildExchangeRateUrl(from, to) {
  const base = String(from || "").trim().toUpperCase().replace(/\s+CASH$/, "");
  const target = String(to || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target)) return "";
  return `${FRANKFURTER_URL}?base=${base}&symbols=${target}`;
}

function parseExchangeRateResponse(json, to) {
  const target = String(to || "").trim().toUpperCase();
  const rate = Number(json?.rates?.[target]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, date: parseIsoDate(json?.date) || "", base: String(json?.base || "").toUpperCase(), target };
}

// --- Goal and trip prompts ------------------------------------------------------
// Moments a goal or trip needs a decision: a goal reaching its target or its due
// date, a trip starting or ending. Each prompt has a key that includes the date
// it is about, so dismissing "iPhone is due 18 Sep" doesn't also silence the
// same goal once its due date moves. "Not now" hides a prompt for the rest of
// the day; dismissing hides that key for good.

const GOAL_DUE_SOON_DAYS = 3;

function buildGoalPrompts(goals, options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const dismissed = new Set(options.dismissed || []);
  const snoozed = options.snoozed || {};
  const currency = options.currency || "AUD";
  const prompts = [];
  const add = (prompt) => {
    if (dismissed.has(prompt.key) || snoozed[prompt.key] === referenceDate) return;
    prompts.push(prompt);
  };

  for (const goal of goals || []) {
    if (!goal || goal.archivedDate) continue;
    const key = normalizeCategoryPath(goal.goalKey || "");
    if (!key) continue;
    const name = goal.goalName || titleCaseSegment(key);
    const money = (value) => formatCurrency(value, goal.currency || currency);

    if (goal.goalType === "holiday") {
      const start = parseIsoDate(goal.startDate || "");
      const end = parseIsoDate(goal.endDate || "");
      if (start && start <= referenceDate && (!end || referenceDate <= end) && !goal.tripModeOn) {
        add({
          key: `trip-start:${key}:${start}`,
          kind: "trip-start",
          goal,
          title: start === referenceDate ? `${name} starts today` : `${name} is under way`,
          detail: "Turn on trip mode so captures go to the trip, in its currency.",
        });
      }
      if (end && referenceDate > end && goal.tripModeOn) {
        add({
          key: `trip-end:${key}:${end}`,
          kind: "trip-end",
          goal,
          title: `${name} ended ${end}`,
          detail: "Trip mode is still on, so new captures are still going to the trip.",
        });
      } else if (end && referenceDate > end && !goal.tripModeOn) {
        add({
          key: `trip-archive:${key}:${end}`,
          kind: "trip-archive",
          goal,
          title: `${name} is over`,
          detail: "Archiving writes a summary of what it cost into the note and moves it to the archive folder.",
        });
      }
      continue;
    }

    const target = Number(goal.targetAmount) || 0;
    const saved = Number(goal.currentSaved) || 0;
    const due = parseIsoDate(goal.dueDate || "");
    if (target > 0 && saved >= target) {
      add({
        key: `goal-complete:${key}:${target}`,
        kind: "goal-complete",
        goal,
        title: `${name} reached its target`,
        detail: `${money(saved)} saved of ${money(target)}.`,
      });
      continue;
    }
    if (!due) continue;
    const progress = target > 0 ? `${money(saved)} of ${money(target)} saved` : `${money(saved)} saved`;
    if (due <= referenceDate) {
      add({
        key: `goal-due:${key}:${due}`,
        kind: "goal-due",
        goal,
        title: due === referenceDate ? `${name} is due today` : `${name} was due ${due}`,
        detail: `${progress}. Archive it if it's done, or give it a new due date.`,
      });
    } else if (daysBetweenInclusive(referenceDate, due) - 1 <= GOAL_DUE_SOON_DAYS) {
      const days = daysBetweenInclusive(referenceDate, due) - 1;
      add({
        key: `goal-due-soon:${key}:${due}`,
        kind: "goal-due-soon",
        goal,
        title: `${name} is due ${days === 1 ? "tomorrow" : `in ${days} days`}`,
        detail: `${progress}.`,
      });
    }
  }

  const order = ["trip-end", "trip-start", "goal-due", "goal-complete", "goal-due-soon", "trip-archive"];
  return prompts.sort((left, right) => order.indexOf(left.kind) - order.indexOf(right.kind));
}

// --- Split expenses ----------------------------------------------------------

// Parses a hand-editable owed child line like "owes: Sam $8 #log/owed/sam".
// A line is settled once it carries the word "settled" anywhere after the tag.
function parseOwedChildLine(text) {
  const line = String(text || "");
  const tagMatch = line.match(/#log\/owed\/([^\s#\]]+)/i);
  if (!tagMatch) return null;
  const person = normalizeCategoryPath(tagMatch[1]);
  if (!person) return null;
  const amount = extractVisibleAmount(`- ${stripFirstTag(line)}`);
  const nameMatch = line.match(/owes?:?\s+([^$#\d]+)/i);
  return {
    amount: Number.isFinite(amount) ? roundCurrencyAmount(amount) : 0,
    displayName: normalizeWhitespace(nameMatch ? nameMatch[1] : "") || titleCaseSegment(person),
    person,
    rawLine: line,
    settled: /\bsettled\b/i.test(line.slice(line.indexOf(tagMatch[0]))),
  };
}

function buildOwedChildLine(person, amount, displayName = "") {
  const slug = normalizeCategoryPath(person) || "someone";
  const label = normalizeWhitespace(displayName) || titleCaseSegment(slug);
  return `owes: ${label} ${formatCurrency(amount)} #log/owed/${slug}`;
}

// Expands quick-add / capture split tokens into owed shares. split=N is an even
// split where my share is amount / N; owed=Name:$X assigns an explicit share.
function buildOwedSharesFromTokens(amount, splitCount, owedTokens = []) {
  const owed = [];
  for (const token of owedTokens || []) {
    const match = String(token || "").match(/^([^:=]+)[:=]\s*\$?([\d,]+(?:\.\d+)?)$/);
    if (!match) continue;
    const share = parseNumber(match[2]);
    if (!Number.isFinite(share) || share <= 0) continue;
    owed.push({ person: normalizeCategoryPath(match[1]) || "someone", displayName: normalizeWhitespace(match[1]), amount: roundCurrencyAmount(share) });
  }
  const count = Number(splitCount);
  if (Number.isFinite(count) && count >= 2 && Number.isFinite(amount) && !owed.length) {
    owed.push({
      person: "others",
      displayName: "Others",
      amount: roundCurrencyAmount((Number(amount) * (count - 1)) / count),
    });
  }
  return owed;
}

// Outstanding split balances per person, from entries carrying owed child lines.
function summarizeSplitBalances(entries) {
  const people = new Map();
  for (const entry of entries || []) {
    for (const owed of entry?.owed || []) {
      const key = owed.person;
      if (!key) continue;
      const current = people.get(key) || {
        person: key,
        displayName: owed.displayName || titleCaseSegment(key),
        outstanding: 0,
        settledTotal: 0,
        entries: [],
      };
      if (owed.settled) {
        current.settledTotal = roundCurrencyAmount(current.settledTotal + owed.amount);
      } else {
        current.outstanding = roundCurrencyAmount(current.outstanding + owed.amount);
      }
      current.entries.push({
        amount: owed.amount,
        date: entry.date || "",
        filePath: entry.filePath || "",
        merchant: entry.merchant || "",
        settled: Boolean(owed.settled),
      });
      people.set(key, current);
    }
  }
  const rows = Array.from(people.values()).sort((left, right) => right.outstanding - left.outstanding);
  return {
    people: rows,
    totalOutstanding: roundCurrencyAmount(rows.reduce((sum, row) => sum + row.outstanding, 0)),
  };
}

// The amount that counts toward budgets: the full bullet amount minus what
// others owe on it (my share of a split).
function entrySpendAmount(entry) {
  if (!entry) return 0;
  if (Number.isFinite(entry.myShare)) return Number(entry.myShare);
  return Number(entry.amount || 0);
}

// One place to decide "does this entry count as my home spending". Trip-tagged
// entries are withdrawals from their trip's savings goal — they belong to the
// holiday dashboards and never count toward regular budgets or spend totals.
function isSpendingEntry(entry) {
  if (!entry) return false;
  return (
    !entry.isIncome &&
    !entry.isGoalContribution &&
    !isPlannedExpenseEntry(entry) &&
    !entry.holidayKey &&
    entry.entryType !== "goal-withdrawal" &&
    entry.entryType !== "balance"
  );
}

// --- Balance snapshots / net worth --------------------------------------------

function buildBalanceSnapshotLine(account, amount) {
  const slug = normalizeCategoryPath(account) || "account";
  return `- ${formatCurrency(amount)} #log/balance/${slug}`;
}

// Aggregates #log/balance/<account> bullets into per-account histories and a
// net-worth series (each account carries its last-known balance forward).
function summarizeBalanceSnapshots(entries) {
  const snapshots = (entries || [])
    .filter((entry) => entry?.entryType === "balance" && entry.accountKey && parseIsoDate(entry.date))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  const accounts = new Map();
  for (const entry of snapshots) {
    const key = entry.accountKey;
    const current = accounts.get(key) || { key, label: titleCaseSegment(key.split("/").pop()), history: [] };
    const amount = roundCurrencyAmount(entry.amount || 0);
    const existing = current.history.find((point) => point.date === entry.date);
    if (existing) {
      existing.amount = amount;
    } else {
      current.history.push({ date: entry.date, amount });
    }
    accounts.set(key, current);
  }

  const dates = Array.from(new Set(snapshots.map((entry) => entry.date))).sort();
  const lastKnown = new Map();
  const series = dates.map((date) => {
    for (const account of accounts.values()) {
      const point = account.history.find((item) => item.date === date);
      if (point) lastKnown.set(account.key, point.amount);
    }
    let total = 0;
    for (const amount of lastKnown.values()) total += amount;
    return { date, total: roundCurrencyAmount(total) };
  });

  const rows = Array.from(accounts.values()).map((account) => ({
    ...account,
    latest: account.history[account.history.length - 1] || null,
  })).sort((left, right) => (right.latest?.amount || 0) - (left.latest?.amount || 0));

  return {
    accounts: rows,
    series,
    latestTotal: series.length ? series[series.length - 1].total : 0,
    previousTotal: series.length > 1 ? series[series.length - 2].total : null,
  };
}

// --- Forecast ------------------------------------------------------------------

// Derives forecast inputs from history: recurring bills come straight from the
// recurring detector; income and non-recurring (discretionary) spend are the
// trailing-window averages scaled to a 30.44-day month.
function computeForecastInputs(entries, recurring, options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const windowDays = Number(options.windowDays) > 0 ? Number(options.windowDays) : 90;
  const windowStart = addDays(referenceDate, -(windowDays - 1));
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const recurringPrefix = normalizeCategoryPath(options.recurringPrefix || "subscriptions") || "subscriptions";
  const inWindow = (entry) => {
    const date = parseIsoDate(entry.date);
    return date && date >= windowStart && date <= referenceDate;
  };

  let incomeTotal = 0;
  let discretionaryTotal = 0;
  for (const entry of entries || []) {
    if (!inWindow(entry)) continue;
    if (entry.entryType === "income") {
      if (goalKeys.has(entry.goalKey)) continue; // goal transfers are not new income
      incomeTotal += Number(entry.amount || 0);
      continue;
    }
    if (!isSpendingEntry(entry)) continue;
    const category = normalizeCategoryPath(entry.category || "");
    if (category === recurringPrefix || category.startsWith(`${recurringPrefix}/`)) continue;
    discretionaryTotal += entrySpendAmount(entry);
  }

  const scale = 30.44 / windowDays;
  return {
    monthlyBills: roundCurrencyAmount(recurring?.totals?.monthly || 0),
    monthlyDiscretionary: roundCurrencyAmount(discretionaryTotal * scale),
    monthlyIncome: roundCurrencyAmount(incomeTotal * scale),
    referenceDate,
    windowDays,
    windowStart,
  };
}

// Projects the monthly net (income - bills - discretionary - goal set-asides)
// forward, returning the points for a line chart and a "~$X by <date>" headline.
function buildForecastProjection(input = {}) {
  const referenceDate = parseIsoDate(input.referenceDate) || todayIsoLocal();
  const months = Math.max(1, Math.min(Number(input.months) || 6, 60));
  // Integer cents: this multiplies the monthly net by up to 60 and adds it to a
  // starting balance, so float error would accumulate visibly along the line.
  const startCents = toCents(input.startBalance || 0);
  const monthlyNetCents =
    toCents(input.monthlyIncome || 0) -
    toCents(input.monthlyBills || 0) -
    toCents(input.monthlyDiscretionary || 0) -
    toCents(input.monthlyGoalSetAside || 0);
  const startBalance = fromCents(startCents);
  const monthlyNet = fromCents(monthlyNetCents);

  const points = [{ date: referenceDate, balance: startBalance }];
  for (let index = 1; index <= months; index += 1) {
    points.push({
      date: addMonths(referenceDate, index),
      balance: fromCents(startCents + monthlyNetCents * index),
    });
  }

  return {
    endBalance: points[points.length - 1].balance,
    endDate: points[points.length - 1].date,
    monthlyNet,
    months,
    points,
  };
}

// --- Query engine ---------------------------------------------------------------

// Read-only query over parsed entries: filter by category / tag / merchant /
// date range, group by category, merchant, or month, sum or count.
function runFinanceQuery(entries, config = {}) {
  const start = parseIsoDate(config.start || "") || "1900-01-01";
  const end = parseIsoDate(config.end || "") || "2999-12-31";
  const categoryFilter = normalizeCategoryPath(config.category || "");
  const tagFilter = String(config.tag || "").replace(/^#/, "").toLowerCase();
  const merchantFilter = normalizeMerchant(config.merchant || "");
  const type = String(config.type || "spending").toLowerCase();
  const groupBy = String(config.group || config.groupby || "category").toLowerCase();
  const op = String(config.op || "sum").toLowerCase();

  const filtered = (entries || []).filter((entry) => {
    const date = parseIsoDate(entry.date);
    if (!date || date < start || date > end) return false;
    if (type === "income" && entry.entryType !== "income") return false;
    if (type === "spending" && !isSpendingEntry(entry)) return false;
    if (type === "all" && entry.entryType === "balance") return false;
    if (categoryFilter) {
      const category = normalizeCategoryPath(entry.category || "");
      if (category !== categoryFilter && !category.startsWith(`${categoryFilter}/`)) return false;
    }
    if (tagFilter && !String(entry.rawLine || "").toLowerCase().includes(tagFilter)) return false;
    if (merchantFilter && !normalizeMerchant(entry.merchant || "").includes(merchantFilter)) return false;
    return true;
  });

  const keyFor = (entry) => {
    if (groupBy === "merchant") return normalizeWhitespace(entry.merchant || "") || "(no merchant)";
    if (groupBy === "month") return String(entry.date || "").slice(0, 7) || "(no date)";
    if (groupBy === "category-full" || groupBy === "full") return normalizeCategoryPath(entry.category || "") || "uncategorized";
    if (groupBy === "none") return "All";
    return primaryCategory(entry.category || "uncategorized");
  };
  const labelFor = (key) => {
    if (groupBy === "merchant" || groupBy === "month" || groupBy === "none") return key;
    return displayCategoryPath(key);
  };

  const groups = new Map();
  for (const entry of filtered) {
    const key = keyFor(entry);
    const current = groups.get(key) || { key, label: labelFor(key), value: 0, count: 0 };
    current.value = roundCurrencyAmount(current.value + (entry.entryType === "income" ? Number(entry.amount || 0) : entrySpendAmount(entry)));
    current.count += 1;
    groups.set(key, current);
  }

  const rows = Array.from(groups.values());
  if (groupBy === "month") {
    rows.sort((left, right) => left.key.localeCompare(right.key));
  } else {
    rows.sort((left, right) => (op === "count" ? right.count - left.count : right.value - left.value));
  }
  const total = roundCurrencyAmount(rows.reduce((sum, row) => sum + row.value, 0));
  for (const row of rows) {
    row.pct = total > 0 ? Number(((row.value / total) * 100).toFixed(1)) : 0;
  }

  return { entries: filtered, op, rows, total, count: filtered.length };
}

// Monthly income vs expense buckets for the income-expense bar view.
function buildMonthlyIncomeExpense(entries, options = {}) {
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const months = new Map();
  for (const entry of entries || []) {
    const month = String(parseIsoDate(entry.date) || "").slice(0, 7);
    if (!month) continue;
    const bucket = months.get(month) || { month, income: 0, expense: 0 };
    if (entry.entryType === "income" && !goalKeys.has(entry.goalKey)) {
      bucket.income = roundCurrencyAmount(bucket.income + Number(entry.amount || 0));
    } else if (isSpendingEntry(entry)) {
      bucket.expense = roundCurrencyAmount(bucket.expense + entrySpendAmount(entry));
    }
    months.set(month, bucket);
  }
  return Array.from(months.values())
    .map((bucket) => ({ ...bucket, net: roundCurrencyAmount(bucket.income - bucket.expense) }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

// A frozen year/quarter review snippet: total spend and income, best/worst
// month, top spending categories, and a transfers summary (savings
// contributions/withdrawals, settled split repayments). Unlike the dashboard
// blocks this is computed once and meant to be inserted as plain text, not
// recomputed on every render. Returns full markdown lines, heading included.
// `goalKeys` must be the vault's actual savings-goal keys — an
// `#log/income/<key>` tag is only a real contribution when <key> matches one;
// otherwise it's just regular income under that name (e.g. salary).
function buildPeriodReviewLines(entries, options = {}) {
  if (options.period === "week" || options.period === "month") return buildShortPeriodReviewLines(entries, options);
  const period = options.period === "quarter" ? "quarter" : "year";
  const currency = options.currency || "AUD";
  const range = toPeriodRange({ period, referenceDate: options.referenceDate });
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const inRange = (entries || []).filter((entry) => isDateInRange(entry.date, range));

  const spendEntries = inRange.filter((entry) => isSpendingEntry(entry));
  const totalSpend = roundCurrencyAmount(spendEntries.reduce((sum, entry) => sum + entrySpendAmount(entry), 0));

  const { contributions, settleUps, runwayContributions, regularIncome, withdrawals } = classifyIncomeEntries(inRange, {
    goalKeys: Array.from(goalKeys),
  });

  const totalIncome = roundCurrencyAmount(regularIncome.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const contributedTotal = roundCurrencyAmount(contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const withdrawnTotal = roundCurrencyAmount(withdrawals.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const settledTotal = roundCurrencyAmount(settleUps.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const runwayTotal = roundCurrencyAmount(runwayContributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));

  const months = buildMonthlyIncomeExpense(inRange, { goalKeys: Array.from(goalKeys) }).filter((month) => month.expense > 0);
  const bestMonth = months.length ? months.reduce((min, month) => (month.expense < min.expense ? month : min)) : null;
  const worstMonth = months.length ? months.reduce((max, month) => (month.expense > max.expense ? month : max)) : null;

  const categoryTotals = new Map();
  for (const entry of spendEntries) {
    const key = primaryCategory(entry.category || "uncategorized");
    categoryTotals.set(key, roundCurrencyAmount((categoryTotals.get(key) || 0) + entrySpendAmount(entry)));
  }
  const topCategories = Array.from(categoryTotals.entries())
    .map(([key, value]) => ({ key, label: titleCaseSegment(key), value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  const year = range.start.slice(0, 4);
  const quarterNumber = Math.floor((Number(range.start.slice(5, 7)) - 1) / 3) + 1;
  const label = period === "quarter" ? `${year} Q${quarterNumber} Review` : `${year} Year in Review`;

  const lines = [`## ${label}`, ""];
  lines.push(`- Period: ${range.start} to ${range.end}`);
  lines.push(`- Total spent: ${formatCurrency(totalSpend, currency)}`);
  lines.push(`- Total income: ${formatCurrency(totalIncome, currency)}`);
  if (bestMonth) lines.push(`- Best month (lowest spend): ${bestMonth.month} — ${formatCurrency(bestMonth.expense, currency)}`);
  if (worstMonth && worstMonth.month !== bestMonth.month) {
    lines.push(`- Worst month (highest spend): ${worstMonth.month} — ${formatCurrency(worstMonth.expense, currency)}`);
  }

  if (topCategories.length) {
    lines.push("");
    lines.push("### Top spending categories");
    lines.push("");
    lines.push("| Category | Total | % of spend |");
    lines.push("| --- | ---: | ---: |");
    for (const category of topCategories) {
      const pct = totalSpend > 0 ? Math.round((category.value / totalSpend) * 100) : 0;
      lines.push(`| ${category.label} | ${formatCurrency(category.value, currency)} | ${pct}% |`);
    }
  }

  lines.push("");
  lines.push("### Transfers");
  lines.push("");
  lines.push(`- Savings contributions: ${formatCurrency(contributedTotal, currency)} (${contributions.length})`);
  lines.push(`- Savings withdrawals: ${formatCurrency(withdrawnTotal, currency)} (${withdrawals.length})`);
  lines.push(`- Settled repayments received: ${formatCurrency(settledTotal, currency)} (${settleUps.length})`);
  lines.push(`- Runway contributions: ${formatCurrency(runwayTotal, currency)} (${runwayContributions.length})`);

  return lines;
}

// Income, split by what it really is. Only the first group is money earned:
// the rest are transfers. `goalKeys` must be the vault's actual goal keys — an
// `#log/income/<key>` tag is a contribution only when <key> names a goal;
// otherwise it is ordinary income under that name (salary, dividend/vas-ax).
function classifyIncomeEntries(entries, options = {}) {
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const incomeEntries = (entries || []).filter((entry) => entry?.entryType === "income");
  const contributions = incomeEntries.filter((entry) => goalKeys.has(entry.goalKey));
  const settleUps = incomeEntries.filter(
    (entry) => !goalKeys.has(entry.goalKey) && normalizeCategoryPath(entry.category || "").startsWith("settleup/")
  );
  const runwayContributions = incomeEntries.filter(
    (entry) => !goalKeys.has(entry.goalKey) && RUNWAY_LEGACY_KEYS.has(normalizeCategoryPath(entry.category || ""))
  );
  const regularIncome = incomeEntries.filter(
    (entry) => !goalKeys.has(entry.goalKey) && !settleUps.includes(entry) && !runwayContributions.includes(entry)
  );
  const withdrawals = (entries || []).filter((entry) => entry?.entryType === "goal-withdrawal");
  return { contributions, settleUps, runwayContributions, regularIncome, withdrawals };
}

const sumBy = (list, amountOf) => roundCurrencyAmount((list || []).reduce((sum, item) => sum + Number(amountOf(item) || 0), 0));

// Savings rate = (income − home spending) ÷ income. Goal contributions, settle-
// ups and runway top-ups are transfers, so they are neither income nor spend;
// trip spending is paid from a trip's savings and is reported on its own. With
// no income the rate is null — "no income logged", not −∞%.
function summarizeIncomeAndSavings(entries, options = {}) {
  const { regularIncome } = classifyIncomeEntries(entries, options);
  const income = sumBy(regularIncome, (entry) => entry.amount);
  const spending = sumBy((entries || []).filter((entry) => isSpendingEntry(entry)), entrySpendAmount);
  const saved = roundCurrencyAmount(income - spending);
  const sources = new Map();
  for (const entry of regularIncome) {
    const key = primaryCategory(entry.category || "income") || "income";
    const row = sources.get(key) || { key, label: titleCaseSegment(key), total: 0, count: 0 };
    row.total = roundCurrencyAmount(row.total + Number(entry.amount || 0));
    row.count += 1;
    sources.set(key, row);
  }
  return {
    income,
    incomeCount: regularIncome.length,
    saved,
    savingsRate: income > 0 ? saved / income : null,
    sources: Array.from(sources.values()).sort((left, right) => right.total - left.total),
    spending,
  };
}

function isUncategorisedEntry(entry) {
  return isSpendingEntry(entry) && (!entry.category || entry.category === "uncategorized");
}

function summarizeUncategorised(entries) {
  const list = (entries || []).filter((entry) => isUncategorisedEntry(entry));
  return { count: list.length, total: sumBy(list, entrySpendAmount) };
}

// Merchants by what was spent there, grouped the way the inbox groups them so
// "Woolworths/cnr Brisbane H" and "Woolworths/8 Sherwood Roa" are one shop.
// Entries with no merchant are counted separately rather than lumped together
// as a fake shop called "(no merchant)".
function summarizeTopMerchants(entries, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 5;
  const groups = new Map();
  let unnamedCount = 0;
  let unnamedTotal = 0;
  for (const entry of entries || []) {
    if (!isSpendingEntry(entry)) continue;
    const merchant = normalizeWhitespace(entry.merchant || "");
    const root = merchantRootKey(merchant);
    const spend = entrySpendAmount(entry);
    if (!root) {
      unnamedCount += 1;
      unnamedTotal = roundCurrencyAmount(unnamedTotal + spend);
      continue;
    }
    const group = groups.get(root) || { key: root, label: "", total: 0, count: 0, lastDate: "" };
    group.total = roundCurrencyAmount(group.total + spend);
    group.count += 1;
    const date = parseIsoDate(entry.date) || "";
    if (!group.label || date >= group.lastDate) {
      group.label = cleanMerchantDisplay(merchant);
      group.lastDate = date;
    }
    groups.set(root, group);
  }
  const rows = Array.from(groups.values())
    .filter((group) => group.total > 0)
    .sort((left, right) => right.total - left.total || right.count - left.count || left.label.localeCompare(right.label));
  return { rows: rows.slice(0, limit), merchantCount: rows.length, unnamedCount, unnamedTotal };
}

function largestTransactions(entries, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 5;
  return (entries || [])
    .filter((entry) => isSpendingEntry(entry) && entrySpendAmount(entry) > 0)
    .map((entry) => ({ entry, spend: roundCurrencyAmount(entrySpendAmount(entry)) }))
    .sort((left, right) => right.spend - left.spend || String(left.entry.date || "").localeCompare(String(right.entry.date || "")))
    .slice(0, limit);
}

function totalsByPrimaryCategory(entries) {
  const totals = new Map();
  for (const entry of entries || []) {
    if (!isSpendingEntry(entry)) continue;
    const key = primaryCategory(entry.category || "uncategorized") || "uncategorized";
    totals.set(key, roundCurrencyAmount((totals.get(key) || 0) + entrySpendAmount(entry)));
  }
  return totals;
}

// Biggest movers first, in either direction, so a category that vanished is as
// visible as one that doubled.
function compareCategoryTotals(currentEntries, previousEntries, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 5;
  const current = totalsByPrimaryCategory(currentEntries);
  const previous = totalsByPrimaryCategory(previousEntries);
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const rows = [];
  for (const key of keys) {
    const now = current.get(key) || 0;
    const before = previous.get(key) || 0;
    const delta = roundCurrencyAmount(now - before);
    if (delta === 0) continue;
    rows.push({
      key,
      label: titleCaseSegment(key),
      current: now,
      previous: before,
      delta,
      pct: before > 0 ? Math.round((delta / before) * 100) : null,
    });
  }
  rows.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.key.localeCompare(right.key));
  return { rows: rows.slice(0, limit), previousTotal: sumBy(Array.from(previous.values()), (value) => value) };
}

// Trip-tagged spending never reaches home totals (see isSpendingEntry), which
// made a week away look frugal. This is that spending, per trip.
function summarizeTripSpend(entries) {
  const trips = new Map();
  for (const entry of entries || []) {
    if (!entry?.holidayKey || isPlannedExpenseEntry(entry)) continue;
    if (entry.isIncome || entry.isGoalContribution || entry.entryType === "goal-withdrawal" || entry.entryType === "balance") continue;
    const key = entry.holidayKey;
    // A name taken from the tag is lower case ("japan"); a trip note's own name
    // is kept as written.
    const raw = String(entry.holidayName || String(key).split("/").pop() || key);
    const label = raw === raw.toLowerCase() ? titleCaseSegment(raw) : raw;
    const trip = trips.get(key) || { key, label, total: 0, count: 0 };
    trip.total = roundCurrencyAmount(trip.total + entrySpendAmount(entry));
    trip.count += 1;
    trips.set(key, trip);
  }
  const rows = Array.from(trips.values()).sort((left, right) => right.total - left.total);
  return { rows, total: sumBy(rows, (row) => row.total) };
}

// Payments logged under the bill prefix (`subscriptions/<cadence>/<bill>`),
// named from `labels` (category → bill name) when the bill is known.
function summarizeBillPayments(entries, options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const labels = options.labels instanceof Map ? options.labels : new Map(Object.entries(options.labels || {}));
  const bills = new Map();
  for (const entry of entries || []) {
    if (!isSpendingEntry(entry)) continue;
    const category = normalizeCategoryPath(entry.category || "");
    if (!category.startsWith(`${prefix}/`)) continue;
    const bill = bills.get(category) || {
      category,
      label: labels.get(category) || titleCaseSegment(category.split("/").pop() || category),
      total: 0,
      count: 0,
      dates: [],
    };
    bill.total = roundCurrencyAmount(bill.total + entrySpendAmount(entry));
    bill.count += 1;
    if (entry.date) bill.dates.push(entry.date);
    bills.set(category, bill);
  }
  const rows = Array.from(bills.values()).sort((left, right) => right.total - left.total);
  return { rows, total: sumBy(rows, (row) => row.total), count: rows.reduce((sum, row) => sum + row.count, 0) };
}

// The period before this one. A calendar period steps back a calendar period —
// September is compared with August, not with the 30 days before it, which for
// March would have been a stretch of January and February. A custom range steps
// back by its own length.
function previousPeriodRange(range, options = {}) {
  const start = parseIsoDate(range?.start);
  const end = parseIsoDate(range?.end);
  if (!start || !end) return null;
  const period = String(range.period || "").toLowerCase();
  const weekStartsOn = options.weekStartsOn || "monday";
  if (["week", "fortnight", "month", "bimonth", "quarter", "year"].includes(period)) {
    const aligned = toPeriodRange({ period, referenceDate: start, weekStartsOn });
    if (aligned.start === start && aligned.end === end) {
      return toPeriodRange({ period, referenceDate: addDays(start, -1), weekStartsOn });
    }
  }
  const span = daysBetweenInclusive(start, end);
  const previousEnd = addDays(start, -1);
  return { period, start: addDays(previousEnd, -(span - 1)), end: previousEnd };
}

function nextPeriodRange(range, options = {}) {
  const start = parseIsoDate(range?.start);
  const end = parseIsoDate(range?.end);
  if (!start || !end) return null;
  const period = String(range.period || "").toLowerCase();
  const weekStartsOn = options.weekStartsOn || "monday";
  if (["week", "fortnight", "month", "bimonth", "quarter", "year"].includes(period)) {
    const aligned = toPeriodRange({ period, referenceDate: start, weekStartsOn });
    if (aligned.start === start && aligned.end === end) {
      return toPeriodRange({ period, referenceDate: addDays(end, 1), weekStartsOn });
    }
  }
  const span = daysBetweenInclusive(start, end);
  return { period, start: addDays(end, 1), end: addDays(end, span) };
}

// --- Dashboard sections ------------------------------------------------------

const DASHBOARD_SECTIONS = [
  "summary",
  "income",
  "uncategorised",
  "categories",
  "trend",
  "changes",
  "merchants",
  "largest",
  "budgets",
  "bills",
  "trips",
  "savings",
  "portfolio",
];

// What a dashboard showed before sections existed, plus the uncategorised
// callout: totals quietly include "Uncategorized", and saying so is a fix, not a
// feature. Weekly and monthly reviews get everything.
const DASHBOARD_BASE_SECTIONS = ["summary", "uncategorised", "categories", "trend", "budgets", "savings"];

const DASHBOARD_SECTION_ALIASES = {
  uncategorized: "uncategorised",
  pie: "categories",
  donut: "categories",
  daily: "trend",
  dailyspend: "trend",
  savingsrate: "income",
  topmerchants: "merchants",
  largesttransactions: "largest",
  transactions: "largest",
  categorychanges: "changes",
  trip: "trips",
  tripspend: "trips",
  recurring: "bills",
  subscriptions: "bills",
  goals: "savings",
  networth: "portfolio",
};

// `show:` lists exactly the sections wanted, in the order wanted (`defaults`
// and `all` expand in place, so `show: defaults, merchants` adds one); `hide:`
// removes from whatever that leaves. Unknown names come back so the block can
// say so.
function resolveDashboardSections(config = {}, period = "week") {
  const normalize = (token) => {
    const key = String(token || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    return DASHBOARD_SECTION_ALIASES[key] || key;
  };
  // Commas separate names; a name may have spaces ("top merchants"). A piece
  // that isn't a name as a whole is tried word by word ("budgets trend").
  const known = (key) => DASHBOARD_SECTIONS.includes(key) || ["all", "defaults", "default"].includes(key);
  const parse = (value) =>
    String(value || "")
      .split(/[,;]+/)
      .flatMap((piece) => (known(normalize(piece)) ? [normalize(piece)] : piece.trim().split(/\s+/).map(normalize)))
      .filter(Boolean);
  const normalizedPeriod = String(period || "").toLowerCase();
  const defaults = normalizedPeriod === "week" || normalizedPeriod === "month" ? DASHBOARD_SECTIONS : DASHBOARD_BASE_SECTIONS;
  const unknown = [];
  const shown = parse(config.show);
  // A Set keeps insertion order, so sections appear in the order `show:` names
  // them; `defaults` and `all` expand in their usual order.
  let chosen;
  if (shown.length) {
    chosen = new Set();
    for (const token of shown) {
      if (token === "all") DASHBOARD_SECTIONS.forEach((key) => chosen.add(key));
      else if (token === "defaults" || token === "default") defaults.forEach((key) => chosen.add(key));
      else if (DASHBOARD_SECTIONS.includes(token)) chosen.add(token);
      else unknown.push(token);
    }
  } else {
    chosen = new Set(defaults);
  }
  for (const token of parse(config.hide)) {
    if (DASHBOARD_SECTIONS.includes(token)) chosen.delete(token);
    else if (token !== "all" && token !== "defaults" && token !== "default") unknown.push(token);
  }
  return { sections: Array.from(chosen), unknown };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDayMonthYear(iso) {
  const date = parseIsoDate(iso);
  if (!date) return "";
  return `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3)} ${date.slice(0, 4)}`;
}

// A heading for a period: "Week of 7 Sep 2026", "September 2026", "2026 Q3".
function describePeriodTitle(range) {
  const start = parseIsoDate(range?.start);
  const end = parseIsoDate(range?.end);
  if (!start || !end) return "";
  const period = String(range.period || "").toLowerCase();
  const aligned = (name) => {
    const expected = toPeriodRange({ period: name, referenceDate: start, weekStartsOn: range.weekStartsOn || "monday" });
    return expected.start === start && expected.end === end;
  };
  if (period === "year" && aligned("year")) return start.slice(0, 4);
  if (period === "quarter" && aligned("quarter")) return `${start.slice(0, 4)} Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1}`;
  if (period === "month" && aligned("month")) return `${MONTH_NAMES[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
  if (period === "week" && daysBetweenInclusive(start, end) === 7) return `Week of ${formatDayMonthYear(start)}`;
  if (start === end) return formatDayMonthYear(start);
  return `${formatDayMonthYear(start)} to ${formatDayMonthYear(end)}`;
}

function describeChange(delta, previous, currency, periodWord) {
  if (!(previous > 0)) return "";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const pct = Math.round((delta / previous) * 100);
  return `${arrow} ${formatCurrency(Math.abs(delta), currency)} (${pct >= 0 ? "+" : ""}${pct}%) vs previous ${periodWord}`;
}

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

// A frozen weekly or monthly review: the same questions the live dashboard
// answers, as plain markdown that will still say the same thing next year.
function buildShortPeriodReviewLines(entries, options = {}) {
  const period = options.period === "month" ? "month" : "week";
  const currency = options.currency || "AUD";
  const weekStartsOn = options.weekStartsOn || "monday";
  const range = toPeriodRange({ period, referenceDate: options.referenceDate, weekStartsOn });
  const previous = previousPeriodRange(range, { weekStartsOn });
  const goalKeys = options.goalKeys || [];
  const inRange = (entries || []).filter((entry) => isDateInRange(entry.date, range));
  const inPrevious = (entries || []).filter((entry) => isDateInRange(entry.date, previous));

  const savings = summarizeIncomeAndSavings(inRange, { goalKeys });
  const previousSpend = sumBy(inPrevious.filter((entry) => isSpendingEntry(entry)), entrySpendAmount);
  const uncategorised = summarizeUncategorised(inRange);
  const trips = summarizeTripSpend(inRange);
  const bills = summarizeBillPayments(inRange, { prefix: options.recurringPrefix, labels: options.billLabels });
  const changes = compareCategoryTotals(inRange, inPrevious, { limit: 100 });
  const categoryTotals = Array.from(totalsByPrimaryCategory(inRange).entries())
    .map(([key, value]) => ({ key, label: titleCaseSegment(key), value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
  const merchants = summarizeTopMerchants(inRange, { limit: 5 });
  const largest = largestTransactions(inRange, { limit: 5 });
  const transfers = classifyIncomeEntries(inRange, { goalKeys });

  const label =
    period === "month"
      ? `${MONTH_NAMES[Number(range.start.slice(5, 7)) - 1]} ${range.start.slice(0, 4)}`
      : `week of ${formatDayMonthYear(range.start)}`;
  const lines = [`## Finance review: ${label}`, ""];
  lines.push(`- Period: ${range.start} to ${range.end}`);
  const change = describeChange(roundCurrencyAmount(savings.spending - previousSpend), previousSpend, currency, period);
  lines.push(`- Spent: ${formatCurrency(savings.spending, currency)}${change ? ` (${change})` : ""}`);
  lines.push(`- Income: ${formatCurrency(savings.income, currency)}`);
  if (savings.savingsRate === null) {
    lines.push("- Savings rate: no income logged");
  } else {
    const verb = savings.saved >= 0 ? "Saved" : "Overspent";
    lines.push(`- ${verb}: ${formatCurrency(Math.abs(savings.saved), currency)} (${Math.round(savings.savingsRate * 100)}% savings rate)`);
  }
  if (uncategorised.count) {
    lines.push(
      `- Uncategorised: ${uncategorised.count} entr${uncategorised.count === 1 ? "y" : "ies"}, ${formatCurrency(uncategorised.total, currency)}`
    );
  }
  if (bills.count) {
    lines.push(`- Bills paid: ${bills.count} (${formatCurrency(bills.total, currency)})`);
  }
  if (trips.rows.length) {
    const parts = trips.rows.map((trip) => `${trip.label} ${formatCurrency(trip.total, currency)}`);
    lines.push(`- Trip spending, not counted above: ${parts.join(", ")}`);
  }

  if (categoryTotals.length) {
    const changeByKey = new Map(changes.rows.map((row) => [row.key, row]));
    lines.push("", "### Where it went", "");
    lines.push(`| Category | Spent | Share | vs previous ${period} |`);
    lines.push("| --- | ---: | ---: | ---: |");
    for (const category of categoryTotals) {
      const pct = savings.spending > 0 ? Math.round((category.value / savings.spending) * 100) : 0;
      const row = changeByKey.get(category.key);
      const delta = row ? `${row.delta > 0 ? "▲" : "▼"} ${formatCurrency(Math.abs(row.delta), currency)}` : "—";
      lines.push(`| ${escapeTableCell(category.label)} | ${formatCurrency(category.value, currency)} | ${pct}% | ${delta} |`);
    }
  }

  if (merchants.rows.length) {
    lines.push("", "### Top merchants", "");
    lines.push("| Merchant | Spent | Visits |");
    lines.push("| --- | ---: | ---: |");
    for (const row of merchants.rows) {
      lines.push(`| ${escapeTableCell(row.label)} | ${formatCurrency(row.total, currency)} | ${row.count} |`);
    }
  }

  if (largest.length) {
    lines.push("", "### Largest transactions", "");
    for (const { entry, spend } of largest) {
      const name = cleanMerchantDisplay(entry.merchant || "") || displayCategoryPath(entry.category || "uncategorized");
      lines.push(`- ${entry.date} · ${name} · ${displayCategoryPath(entry.category || "uncategorized")} · ${formatCurrency(spend, currency)}`);
    }
  }

  const contributedTotal = sumBy(transfers.contributions, (entry) => entry.amount);
  const withdrawnTotal = sumBy(transfers.withdrawals, (entry) => entry.amount);
  const settledTotal = sumBy(transfers.settleUps, (entry) => entry.amount);
  if (contributedTotal || withdrawnTotal || settledTotal) {
    lines.push("", "### Transfers", "");
    if (contributedTotal) lines.push(`- Savings contributions: ${formatCurrency(contributedTotal, currency)} (${transfers.contributions.length})`);
    if (withdrawnTotal) lines.push(`- Savings withdrawals: ${formatCurrency(withdrawnTotal, currency)} (${transfers.withdrawals.length})`);
    if (settledTotal) lines.push(`- Settled repayments received: ${formatCurrency(settledTotal, currency)} (${transfers.settleUps.length})`);
  }

  return lines;
}

// Cumulative income-minus-spend line over time.
function buildCumulativeBalanceSeries(entries, options = {}) {
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const byDate = new Map();
  for (const entry of entries || []) {
    const date = parseIsoDate(entry.date);
    if (!date) continue;
    let delta = 0;
    if (entry.entryType === "income" && !goalKeys.has(entry.goalKey)) delta = Number(entry.amount || 0);
    else if (isSpendingEntry(entry)) delta = -entrySpendAmount(entry);
    else continue;
    byDate.set(date, roundCurrencyAmount((byDate.get(date) || 0) + delta));
  }
  const dates = Array.from(byDate.keys()).sort();
  let running = 0;
  return dates.map((date) => {
    running = roundCurrencyAmount(running + byDate.get(date));
    return { date, balance: running };
  });
}

// --- Hierarchical colour system ----------------------------------------------
// Every chart shares this: each major category gets one base hue, and its
// subcategories render as progressively lighter/darker shades of that hue.

const CATEGORY_BASE_HUES = [211, 145, 26, 45, 356, 262, 176, 328, 96, 197, 16, 230];

function categoryBaseColor(rank) {
  const hue = CATEGORY_BASE_HUES[((rank % CATEGORY_BASE_HUES.length) + CATEGORY_BASE_HUES.length) % CATEGORY_BASE_HUES.length];
  return { hue, saturation: 58, lightness: 44 };
}

// Ramps lightness monotonically across siblings: childIndex 0 (the biggest
// spender, since children are ranked largest-first) gets the lightest shade,
// the last sibling gets the darkest, so shade reads directly as rank.
function categoryShadeColor(base, childIndex, siblingCount = 1) {
  const maxLightness = Math.min(80, base.lightness + 30);
  const minLightness = Math.max(16, base.lightness - 30);
  if (siblingCount <= 1) return `hsl(${base.hue}, ${base.saturation}%, ${maxLightness}%)`;
  const ratio = childIndex / (siblingCount - 1);
  const lightness = Math.round(maxLightness - ratio * (maxLightness - minLightness));
  return `hsl(${base.hue}, ${base.saturation}%, ${lightness}%)`;
}

// Groups entries into ranked major groups, each with nested subcategory
// groups, each in turn with nested leaf groups — a real 3-level hierarchy in
// "full" mode (major -> subcategory -> leaf), so a chart can give every
// subcategory its own colour section (major's hue, one shade) and then split
// each section further into its own leaf items (further shades within that
// same section), instead of flattening subcategory+leaf into a single ring.
// A category that's only two segments deep (e.g. shopping/amazon) has no
// leaf level to split into, so its one leaf just passes through as the
// subcategory itself — the outer ring reads as a single uninterrupted block
// there rather than an artificial extra split. In "primary" mode (used by
// the sidebar's mini chart and holiday breakdowns) everything collapses back
// to one level, unchanged from before. `slices` is the flattened leaf list,
// used for pies with no group/subgroup ring to draw and for full-path colour
// lookups elsewhere.
function buildHierarchicalCategoryGroups(entries, groupBy = "primary") {
  const useFull = String(groupBy || "primary").toLowerCase() === "full";
  const majors = new Map();

  for (const entry of entries || []) {
    const full = normalizeCategoryPath(entry.category || "uncategorized") || "uncategorized";
    const parts = full.split("/").filter(Boolean);
    const major = parts[0] || "uncategorized";
    const amount = entrySpendAmount(entry);

    const majorGroup = majors.get(major) || { key: major, label: titleCaseSegment(major), total: 0, count: 0, subgroups: new Map() };
    majorGroup.total = roundCurrencyAmount(majorGroup.total + amount);
    majorGroup.count += 1;

    const subKey = useFull && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : major;
    const subgroup = majorGroup.subgroups.get(subKey) || { key: subKey, label: displayCategoryPath(subKey), total: 0, count: 0, leaves: new Map() };
    subgroup.total = roundCurrencyAmount(subgroup.total + amount);
    subgroup.count += 1;

    const leafKey = useFull && parts.length >= 3 ? full : subKey;
    const leaf = subgroup.leaves.get(leafKey) || { key: leafKey, label: displayCategoryPath(leafKey), total: 0, count: 0 };
    leaf.total = roundCurrencyAmount(leaf.total + amount);
    leaf.count += 1;
    subgroup.leaves.set(leafKey, leaf);
    majorGroup.subgroups.set(subKey, subgroup);
    majors.set(major, majorGroup);
  }

  const ranked = Array.from(majors.values()).sort((left, right) => right.total - left.total);
  const slices = [];
  const groups = ranked.map((major, majorIndex) => {
    const base = categoryBaseColor(majorIndex);
    const color = categoryShadeColor(base, 0);
    const { subgroups, ...majorRest } = major;
    const sortedSubgroups = Array.from(subgroups.values()).sort((left, right) => right.total - left.total);
    const children = sortedSubgroups.map((subgroup, subIndex) => {
      const { leaves, ...subgroupRest } = subgroup;
      const sortedLeaves = Array.from(leaves.values()).sort((left, right) => right.total - left.total);
      const leafList = sortedLeaves.map((leaf, leafIndex) => ({
        ...leaf,
        color: categoryShadeColor(base, leafIndex, sortedLeaves.length),
        parent: subgroup.key,
      }));
      for (const leaf of leafList) slices.push(leaf);
      return {
        ...subgroupRest,
        color: categoryShadeColor(base, subIndex, sortedSubgroups.length),
        parent: major.key,
        children: leafList,
      };
    });
    return { ...majorRest, children, color };
  });

  return { groups, slices };
}

// --- Daily-note file name helpers ----------------------------------------------
// Supports the folder/format auto-detected from the Journals or core Daily
// notes plugin. Only pure date tokens are supported; anything fancier falls
// back to YYYY-MM-DD.

function formatDailyNoteName(iso, format) {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const [year, month, day] = date.split("-");
  const pattern = String(format || "YYYY-MM-DD");
  if (/[A-Za-z]/.test(pattern.replace(/Y|M|D/g, ""))) return null;
  if (!/YYYY/.test(pattern) || !/MM/.test(pattern) || !/DD/.test(pattern)) return null;
  return pattern.replace(/YYYY/g, year).replace(/MM/g, month).replace(/DD/g, day);
}

function parseDailyNoteName(name, format) {
  const base = String(name || "").replace(/\.md$/i, "");
  const pattern = String(format || "YYYY-MM-DD");
  const order = [];
  const regexSource = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/YYYY|MM|DD/g, (token) => {
    order.push(token);
    return token === "YYYY" ? "(\\d{4})" : "(\\d{2})";
  });
  if (order.length !== 3) return parseIsoDate(base);
  const match = base.match(new RegExp(`^${regexSource}$`));
  if (!match) return parseIsoDate(base);
  const parts = {};
  order.forEach((token, index) => { parts[token] = match[index + 1]; });
  return parseIsoDate(`${parts.YYYY}-${parts.MM}-${parts.DD}`);
}

// Post-trip reflection: once a trip has ended, the holiday dashboard switches
// to this — per-category totals, averages per trip day, the single biggest
// expense in each category, the most (and least) expensive days, and how the
// whole trip landed against its budget.
function buildTripReflection(goal, entries, referenceDate) {
  const today = parseIsoDate(referenceDate) || todayIsoLocal();
  const tripTag = normalizeHolidayKey(goal?.tripTag || "");
  const startDate = parseIsoDate(goal?.startDate || "");
  const endDate = parseIsoDate(goal?.endDate || "");
  const currency = goal?.currency || "AUD";
  const totalBudget = roundCurrencyAmount(goal?.totalBudget || 0);

  const tripEntries = (entries || []).filter(
    (entry) =>
      entry.holidayKey === tripTag &&
      !isPlannedExpenseEntry(entry) &&
      !entry.isIncome &&
      !entry.isGoalContribution &&
      entry.entryType !== "balance"
  );
  const during = tripEntries.filter(
    (entry) => (!startDate || String(entry.date || "") >= startDate) && (!endDate || String(entry.date || "") <= endDate)
  );
  const after = tripEntries.filter((entry) => endDate && String(entry.date || "") > endDate);
  const sumList = (list) => roundCurrencyAmount(list.reduce((sum, entry) => sum + entrySpendAmount(entry), 0));
  const totalSpent = sumList(during);
  const afterTotal = sumList(after);
  const allInTotal = roundCurrencyAmount(totalSpent + afterTotal);
  const tripDays = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : 0;

  const categories = new Map();
  for (const entry of during) {
    const key = primaryCategory(entry.category || "uncategorized");
    const current = categories.get(key) || { key, label: titleCaseSegment(key), total: 0, count: 0, maxEntry: null };
    const amount = entrySpendAmount(entry);
    current.total = roundCurrencyAmount(current.total + amount);
    current.count += 1;
    if (!current.maxEntry || amount > current.maxEntry.amount) {
      current.maxEntry = {
        amount: roundCurrencyAmount(amount),
        date: entry.date || "",
        merchant: normalizeWhitespace(entry.merchant || ""),
      };
    }
    categories.set(key, current);
  }
  const categoryRows = Array.from(categories.values())
    .sort((left, right) => right.total - left.total)
    .map((row) => ({
      ...row,
      averagePerDay: tripDays > 0 ? roundCurrencyAmount(row.total / tripDays) : 0,
      pct: totalSpent > 0 ? Number(((row.total / totalSpent) * 100).toFixed(1)) : 0,
    }));

  const byDay = new Map();
  for (const entry of during) {
    if (!entry.date) continue;
    byDay.set(entry.date, roundCurrencyAmount((byDay.get(entry.date) || 0) + entrySpendAmount(entry)));
  }
  const dailySeries = [];
  if (startDate && endDate) {
    for (let day = startDate; day && day <= endDate; day = addDays(day, 1)) {
      dailySeries.push({ date: day, total: byDay.get(day) || 0 });
    }
  } else {
    for (const date of Array.from(byDay.keys()).sort()) {
      dailySeries.push({ date, total: byDay.get(date) });
    }
  }
  let maxDay = null;
  let quietDay = null;
  for (const point of dailySeries) {
    if (!maxDay || point.total > maxDay.total) maxDay = point;
    if (point.total > 0 && (!quietDay || point.total < quietDay.total)) quietDay = point;
  }

  return {
    afterCount: after.length,
    afterTotal,
    allInTotal,
    averagePerDay: tripDays > 0 ? roundCurrencyAmount(totalSpent / tripDays) : 0,
    budgetDelta: totalBudget > 0 ? roundCurrencyAmount(totalBudget - allInTotal) : null,
    categories: categoryRows,
    currency,
    dailySeries,
    endDate,
    entryCount: during.length,
    isFinished: Boolean(endDate && today > endDate),
    maxDay,
    quietDay,
    startDate,
    totalBudget,
    totalSpent,
    tripDays,
  };
}

// --- Goal archiving ------------------------------------------------------------
// Frozen plain-markdown record written into a goal note when it is archived:
// the savings steps (every contribution), and — for trips — how the money was
// spent during the trip and after its end date. The note stops being part of
// the active set but keeps its full history readable forever.
function buildGoalArchiveSummaryLines(goal, entries, referenceDate) {
  const today = parseIsoDate(referenceDate) || todayIsoLocal();
  const currency = goal?.currency || "AUD";
  const goalKey = normalizeCategoryPath(goal?.goalKey || "");
  const tripTag = normalizeHolidayKey(goal?.tripTag || "");
  const endDate = parseIsoDate(goal?.endDate || "");
  const targetAmount = roundCurrencyAmount(goal?.targetAmount || 0);
  const startingBalance = roundCurrencyAmount(goal?.startingBalance || 0);

  const contributions = (entries || [])
    .filter((entry) => entry.goalKey === goalKey && entry.isGoalContribution && entry.entryType === "income")
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
  const totalContributed = roundCurrencyAmount(contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const totalSaved = roundCurrencyAmount(startingBalance + totalContributed);

  const lines = [];
  lines.push(`## Archive summary (${today})`);
  lines.push("");
  const savedPct = targetAmount > 0 ? ` (${Math.round((totalSaved / targetAmount) * 100)}% of target)` : "";
  lines.push(`- Target: ${formatCurrency(targetAmount, currency)}`);
  lines.push(`- Saved: ${formatCurrency(totalSaved, currency)}${savedPct} — ${formatCurrency(startingBalance, currency)} starting balance + ${contributions.length} contribution${contributions.length === 1 ? "" : "s"}`);

  if (contributions.length) {
    lines.push("");
    lines.push("### Savings steps");
    lines.push("");
    lines.push("| Date | Amount | Note |");
    lines.push("| --- | ---: | --- |");
    for (const entry of contributions) {
      lines.push(`| ${entry.date || ""} | ${formatCurrency(entry.amount, currency)} | ${normalizeWhitespace(entry.merchant || "")} |`);
    }
  }

  const withdrawals = (entries || [])
    .filter((entry) => entry.goalKey === goalKey && entry.entryType === "goal-withdrawal")
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
  if (withdrawals.length) {
    lines.push("");
    lines.push("### Withdrawals");
    lines.push("");
    lines.push("| Date | Amount | Category | Note |");
    lines.push("| --- | ---: | --- | --- |");
    for (const entry of withdrawals) {
      lines.push(`| ${entry.date || ""} | ${formatCurrency(entry.amount, currency)} | ${displayCategoryPath(entry.category)} | ${normalizeWhitespace(entry.merchant || "")} |`);
    }
  }

  if (tripTag) {
    const tripEntries = (entries || []).filter(
      (entry) => entry.holidayKey === tripTag && !isPlannedExpenseEntry(entry) && !entry.isIncome && !entry.isGoalContribution
    );
    const during = tripEntries.filter((entry) => !endDate || String(entry.date || "") <= endDate);
    const after = tripEntries.filter((entry) => endDate && String(entry.date || "") > endDate);
    const sumEntries = (list) => roundCurrencyAmount(list.reduce((sum, entry) => sum + entrySpendAmount(entry), 0));
    lines.push("");
    lines.push("### How it was spent");
    lines.push("");
    const totalBudget = roundCurrencyAmount(goal?.totalBudget || 0);
    if (totalBudget > 0) {
      lines.push(`- Trip budget: ${formatCurrency(totalBudget, currency)}`);
    }
    lines.push(`- Spent during the trip: ${formatCurrency(sumEntries(during), currency)} across ${during.length} entr${during.length === 1 ? "y" : "ies"}`);
    if (after.length) {
      lines.push(`- Spent after ${endDate}: ${formatCurrency(sumEntries(after), currency)} across ${after.length} entr${after.length === 1 ? "y" : "ies"}`);
    }
    const grouped = groupTransactionsByCategory(tripEntries, "primary");
    if (grouped.length) {
      lines.push("");
      lines.push("| Category | Total | Entries |");
      lines.push("| --- | ---: | ---: |");
      for (const group of grouped) {
        lines.push(`| ${group.label} | ${formatCurrency(group.total, currency)} | ${group.count} |`);
      }
    }
  }

  return lines;
}

// --- Note rewrites -------------------------------------------------------------
// Every migration that edits the user's notes goes through here. The transform is
// pure and planned over file contents first, so the preview someone confirms is
// exactly what gets written, and running it twice is a no-op.

function planNoteRewrite(files, transform) {
  const changedFiles = [];
  const warnings = [];
  const samples = [];
  let entries = 0;

  for (const file of files || []) {
    const path = file?.path || "";
    const before = String(file?.content ?? "");
    const outcome = transform(before, path) || {};
    const after = String(outcome.content ?? before);
    for (const warning of outcome.warnings || []) warnings.push({ path, ...warning });
    for (const sample of outcome.samples || []) {
      if (samples.length < 5) samples.push({ path, ...sample });
    }
    entries += Number(outcome.entries || 0);
    if (after === before) continue;
    changedFiles.push({ path, before, after, entries: Number(outcome.entries || 0) });
  }

  return {
    files: changedFiles,
    samples,
    warnings,
    totals: { files: changedFiles.length, entries, warnings: warnings.length },
  };
}

// Reads the amount out of one side of a legacy two-amount line. The last number
// wins, so an arithmetic aside ("$46.79/3 = $15.6") yields what was actually
// paid.
function lastAmountIn(text) {
  const matches = Array.from(String(text || "").matchAll(/-?(?:\d[\d,]*(?:\.\d+)?|\.\d+)/g));
  if (!matches.length) return null;
  return Number(String(matches[matches.length - 1][0]).replace(/,/g, ""));
}

// The code may lead the number ("R$150"), follow it ("18BRL"), or stand alone
// ("5.16 AUD"), so the boundary allows a digit on either side.
const LEGACY_CURRENCY_MARKERS = [
  [/(?:^|[\s(\d])(?:R\$|BRL)/i, "BRL"],
  [/(?:^|[\s(\d])(?:US\$|USD)/i, "USD"],
  [/(?:^|[\s(\d])(?:NZ\$|NZD)/i, "NZD"],
  [/(?:^|[\s(\d])(?:¥|JPY|YEN)/i, "JPY"],
  [/(?:^|[\s(\d])(?:€|EUR)/i, "EUR"],
  [/(?:^|[\s(\d])(?:£|GBP)/i, "GBP"],
];

function detectLegacyCurrency(text) {
  for (const [pattern, code] of LEGACY_CURRENCY_MARKERS) {
    if (pattern.test(text)) return code;
  }
  return "";
}

const LEGACY_TRIP_TAG = /#log\/archive\/(\d{2}|\d{4})\/([^\s/#\]]+)\/spending\/([^\s#\]]+)/i;

// Converts a trip that was filed under `#log/archive/<year>/<trip>/spending/…`
// into the current form: a canonical trip tag, and the two-currency amount
// written the way the plugin writes it now ("BRL 195.16 : $55.60 AUD"), so the
// original currency is read back rather than being decoration.
//
// A line whose meaning cannot be preserved exactly — an arithmetic aside, or an
// original amount with no currency marker at all — keeps its original text as a
// child note and is reported as a warning, so nothing is quietly lost.
function buildLegacyTripTagTransform(options = {}) {
  const homeCurrency = normalizeCurrency(options.homeCurrency || "AUD");
  const fallbackCurrency = normalizeCurrency(options.originalCurrency || "", "");
  // Per-trip fallbacks, so a line that names no currency is read as whatever the
  // rest of that trip was paid in rather than as a guess.
  const tripCurrencies = options.tripCurrencies || {};
  const categoryFixes = options.categoryFixes || {};
  const heading = normalizeWhitespace(options.heading || "## Finance");

  const fixCategory = (value) =>
    normalizeCategoryPath(value)
      .split("/")
      .filter(Boolean)
      .map((segment) => categoryFixes[segment] || segment)
      .join("/");

  return function transform(content) {
    const lines = splitLines(content);
    const out = [];
    const samples = [];
    const warnings = [];
    let entries = 0;
    let headingIndex = -1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      // A legacy note carries the old finance heading; the rest of the vault has
      // moved on, and captures only look for the configured one. Recorded now,
      // applied at the end — only if this note turned out to hold entries.
      if (headingIndex < 0 && /^##\s+(?:spending|finance)\s*$/i.test(line.trim())) {
        headingIndex = out.length;
      }

      const match = line.match(LEGACY_TRIP_TAG);
      if (!match) {
        out.push(line);
        continue;
      }

      const indent = (line.match(/^\s*/) || [""])[0];
      const tail = line.slice(line.indexOf(match[0]) + match[0].length).replace(/\s+$/, "");
      // Markdown escapes ("R\$195.16") are display, not data.
      const head = line
        .slice(0, line.indexOf(match[0]))
        .replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "")
        .replace(/\\(?=[$])/g, "")
        .trim();

      const tripKey = `${match[1]}/${normalizeCategoryPath(match[2])}`;
      const category = fixCategory(match[3]) || "uncategorized";
      const tag = buildCategoryTag(category, tripKey);

      const sides = head.split(/\s+[-–—]\s+/);
      const hasOriginal = sides.length > 1;
      const originalSide = hasOriginal ? sides[0] : "";
      const homeSide = hasOriginal ? sides.slice(1).join(" - ") : head;
      const amount = lastAmountIn(homeSide);
      const originalAmount = hasOriginal ? lastAmountIn(originalSide) : null;
      const isCash = /\bcash\b/i.test(head);
      let currency = hasOriginal ? detectLegacyCurrency(originalSide) : "";
      let keepOriginalText = /[/=]/.test(homeSide);

      if (hasOriginal && !currency) {
        currency = normalizeCurrency(tripCurrencies[tripKey] || "", "") || fallbackCurrency;
        keepOriginalText = true;
        warnings.push({
          line: line.trim(),
          reason: currency
            ? `No currency marker — read as ${currency}. The original line is kept as a note.`
            : "No currency marker and no fallback currency — only the home amount is kept.",
        });
      } else if (keepOriginalText) {
        warnings.push({ line: line.trim(), reason: "Amount included a calculation; the original line is kept as a note." });
      }

      if (!Number.isFinite(amount)) {
        // Nothing reliable to rewrite: retag only, leave the text alone.
        out.push(`${indent}- ${head} ${tag}${tail}`.replace(/\s+/g, " ").replace(/^ /, indent));
        warnings.push({ line: line.trim(), reason: "No amount could be read; the tag was updated and the text left as it was." });
        entries += 1;
        continue;
      }

      const label =
        Number.isFinite(originalAmount) && currency && currency !== homeCurrency
          ? `${formatOriginalCurrencyLabel(originalAmount, { currency, isCash })} : ${formatCurrencyWithCode(amount, homeCurrency)}`
          : formatCurrency(amount, homeCurrency);

      const rewritten = `${indent}- ${label} ${tag}${tail}`;
      out.push(rewritten);
      entries += 1;
      if (samples.length < 3) samples.push({ before: line, after: rewritten });

      // Copy the entry's own child lines across untouched, then add the note
      // after them — a note inserted first would be read as the merchant.
      let cursor = index + 1;
      while (cursor < lines.length) {
        const child = lines[cursor];
        if (!child.trim()) break;
        const childIndent = (child.match(/^\s*/) || [""])[0];
        if (childIndent.length <= indent.length || !/^\s*-\s/.test(child)) break;
        out.push(child);
        cursor += 1;
      }
      if (keepOriginalText) {
        out.push(`${indent}\t- as written: ${head}`);
      }
      index = cursor - 1;
    }

    if (!entries) {
      // Nothing from this migration is in this note, so it is left exactly as it
      // is — including its heading and its running total.
      return { content, entries: 0, samples: [], warnings: [] };
    }

    if (headingIndex >= 0 && normalizeWhitespace(out[headingIndex]) !== heading) {
      out[headingIndex] = heading;
    }

    const rewritten = out.join("\n");
    return {
      content: recomputeSpendingTotals(rewritten, {
        spendingHeading: heading,
        spendingRootTag: options.spendingRootTag || "#log/spending",
        defaultCurrency: homeCurrency,
      }),
      entries,
      samples,
      warnings,
    };
  };
}


// What legacy trip tags does this vault still hold? Drives the migration preview
// ("25/brazil — 255 entries across 56 notes, mostly BRL") and supplies the
// per-trip fallback currency the transform uses for lines that name none.
function summarizeLegacyTripTags(files) {
  const trips = new Map();
  for (const file of files || []) {
    const path = file?.path || "";
    for (const line of splitLines(String(file?.content ?? ""))) {
      const match = line.match(LEGACY_TRIP_TAG);
      if (!match) continue;
      const key = `${match[1]}/${normalizeCategoryPath(match[2])}`;
      const trip = trips.get(key) || { key, entries: 0, files: new Set(), currencies: new Map(), firstDate: "", lastDate: "" };
      trip.entries += 1;
      trip.files.add(path);
      // Strip the bullet prefix before splitting, or its own "- " is read as the
      // separator between the two amounts and the first side comes back empty.
      const head = line
        .slice(0, line.indexOf(match[0]))
        .replace(/^\s*-\s*(?:\[[^\]]\]\s*)?/, "")
        .replace(/\\(?=[$])/g, "");
      const currency = detectLegacyCurrency(head.split(/\s+[-\u2013\u2014]\s+/)[0] || "");
      if (currency) trip.currencies.set(currency, (trip.currencies.get(currency) || 0) + 1);
      const date = extractNoteDate("", path);
      if (date) {
        if (!trip.firstDate || date < trip.firstDate) trip.firstDate = date;
        if (date > trip.lastDate) trip.lastDate = date;
      }
      trips.set(key, trip);
    }
  }

  return Array.from(trips.values())
    .map((trip) => ({
      key: trip.key,
      entries: trip.entries,
      files: trip.files.size,
      firstDate: trip.firstDate,
      lastDate: trip.lastDate,
      currency: Array.from(trip.currencies.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "",
    }))
    .sort((left, right) => right.entries - left.entries);
}

// Shortest merchant key allowed to match as a substring rather than in full.
// Bank feeds pad the merchant with branch and terminal noise ("Woolworths/cnr
// Brisbane H", "SQ * Taco De Birria"), so one rule has to cover every variant —
// but a two- or three-letter key ("iga") turns up inside unrelated names, so
// short keys stay exact-match only.
const MERCHANT_SUBSTRING_MIN = 4;

// Bank feeds also truncate to a fixed column width ("S & H Pharmacy Investm"),
// which containment cannot catch because there the stored name is the longer
// string. Truncation always keeps the prefix, so a prefix match recovers those
// — with a higher floor, since a short prefix is a far weaker signal than a
// whole name sitting inside a padded descriptor.
const MERCHANT_PREFIX_MIN = 8;

// Resolves a merchant key against a set of stored keys, in descending order of
// how sure the match makes us: the key itself, then the longest stored key
// sitting inside it, then an unambiguous truncation of a stored key.
function lookupMerchantKey(key, entries, read) {
  if (!key) return "";

  const exact = entries.get(key);
  if (exact) {
    const resolved = read(exact);
    if (resolved) return resolved;
  }

  // Longest wins, so a specific rule ("costcogas") beats a general one
  // ("costco") regardless of what order the map happens to be in.
  let contained = "";
  let containedLength = 0;
  for (const [candidate, value] of entries) {
    if (candidate.length < MERCHANT_SUBSTRING_MIN || candidate.length <= containedLength) continue;
    if (candidate === key || !key.includes(candidate)) continue;
    const resolved = read(value);
    if (!resolved) continue;
    contained = resolved;
    containedLength = candidate.length;
  }
  if (contained) return contained;

  // A truncated descriptor is a prefix of several stored merchants as often as
  // one ("costco" prefixes both Costco rules), and there is no basis for
  // picking between them. Only act when every candidate agrees on the category
  // — a wrong guess here is worse than leaving it uncategorized.
  if (key.length < MERCHANT_PREFIX_MIN) return "";
  const agreed = new Set();
  for (const [candidate, value] of entries) {
    if (candidate === key || !candidate.startsWith(key)) continue;
    const resolved = read(value);
    if (resolved) agreed.add(resolved);
  }
  return agreed.size === 1 ? [...agreed][0] : "";
}


// Re-keys a merchant map by root, so one rule covers every branch and every
// descriptor variant. When two entries collapse to the same root the most
// recent wins, which is what "how did I file this last time" means.
function indexByMerchantRoot(entries) {
  const byRoot = new Map();
  const source = entries instanceof Map ? entries : new Map(Object.entries(entries || {}));
  for (const [key, value] of source) {
    // Prefer the merchant as it was written: a stored key has already lost its
    // spaces and punctuation, so "thebagelboys" can no longer shed its "the".
    const root = merchantRootKey((typeof value === "object" && value?.name) || key);
    if (!root) continue;
    const current = byRoot.get(root);
    const date = typeof value === "object" && value ? String(value.date || "") : "";
    const currentDate = typeof current === "object" && current ? String(current.date || "") : "";
    if (!current || date >= currentDate) byRoot.set(root, value);
  }
  return byRoot;
}

// One place that decides what category a merchant should get, and says why it
// thinks so — the inbox shows that reason, because "because you filed Woolworths
// here last month" is the difference between a suggestion you can trust and one
// you have to check.
//
// Order runs from most deliberate to least: an explicit rule, a rule sitting
// inside the descriptor, a rule on the merchant root, then the same three
// against what the daily notes already say.
function suggestCategoryForMerchant(merchant, sources = {}) {
  const asMap = (value) => (value instanceof Map ? value : new Map(Object.entries(value || {})));
  const readCategory = (value) => (typeof value === "string" ? value : value?.category || "");
  const rules = asMap(sources.rules);
  const history = asMap(sources.history);
  const rootRules = sources.rootRules ? asMap(sources.rootRules) : indexByMerchantRoot(rules);
  const rootHistory = sources.rootHistory ? asMap(sources.rootHistory) : indexByMerchantRoot(history);
  const key = normalizeMerchant(merchant);
  const root = merchantRootKey(merchant);
  if (!key && !root) return { category: "", source: "" };

  const attempts = [
    ["rule", () => readCategory(rules.get(key))],
    ["rule", () => lookupMerchantKey(key, rules, readCategory)],
    ["rule-root", () => readCategory(rootRules.get(root))],
    ["history", () => readCategory(history.get(key))],
    ["history", () => lookupMerchantKey(key, history, readCategory)],
    ["history-root", () => readCategory(rootHistory.get(root))],
  ];

  for (const [source, attempt] of attempts) {
    const category = normalizeCategoryPath(attempt() || "");
    if (category && category !== "uncategorized") return { category, source };
  }
  return { category: "", source: "" };
}

// The inbox is grouped by merchant root rather than listed by date: twelve
// separate "SQ * Rode Fresh" rows are one decision, not twelve.
function groupEntriesByMerchantRoot(entries) {
  const groups = new Map();
  for (const entry of entries || []) {
    const merchant = normalizeWhitespace(entry?.merchant || "");
    const root = merchantRootKey(merchant);
    const key = root || `\u0000${normalizeWhitespace(entry?.date || "")}|${entry?.amount ?? ""}`;
    const group = groups.get(key) || {
      key,
      root,
      label: cleanMerchantDisplay(merchant) || "(no merchant)",
      entries: [],
      total: 0,
      firstDate: "",
      lastDate: "",
      merchants: new Set(),
    };
    group.entries.push(entry);
    group.total = roundCurrencyAmount(group.total + Number(entry?.amount || 0));
    const date = parseIsoDate(entry?.date) || "";
    if (date) {
      if (!group.firstDate || date < group.firstDate) group.firstDate = date;
      if (date > group.lastDate) group.lastDate = date;
      // The most recent spelling is the one worth showing.
      if (merchant && date >= group.lastDate) group.label = cleanMerchantDisplay(merchant);
    }
    if (merchant) group.merchants.add(merchant);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, count: group.entries.length, merchants: Array.from(group.merchants) }))
    .sort((left, right) => right.count - left.count || right.total - left.total);
}

// A category path also lives in markdown tables — the budgets table, and a
// trip's planned and allocated expenses. A rename that skipped those would leave
// a budget pointing at a category nothing is filed under any more.
//
// Only the Category column of a real table is touched: a "Name" cell reading
// "Groceries" is a label, not a path, and rewriting it would be wrong.
function buildCategoryTableRenameTransform(renames) {
  const list = (renames || [])
    .map((rename) => ({ from: normalizeCategoryPath(rename?.from), to: normalizeCategoryPath(rename?.to) }))
    .filter((rename) => rename.from && rename.to && rename.from !== rename.to);

  return function transform(content) {
    if (!list.length) return { content, entries: 0, samples: [] };
    const lines = splitLines(content);
    const samples = [];
    let entries = 0;
    let categoryColumn = -1;
    let inTable = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^\s*\|/.test(line)) {
        inTable = false;
        categoryColumn = -1;
        continue;
      }
      const next = lines[index + 1];
      if (!inTable && next && /^\s*\|?[\s:-]+\|/.test(next)) {
        const headers = line.split("|").slice(1, -1).map((cell) => normalizeWhitespace(cell).toLowerCase());
        categoryColumn = headers.findIndex((header) => header === "category" || header === "tag");
        inTable = true;
        continue;
      }
      if (!inTable || categoryColumn < 0) continue;

      const cells = line.split("|");
      const cellIndex = categoryColumn + 1;
      const cell = cells[cellIndex];
      if (cell === undefined) continue;
      const value = normalizeCategoryPath(cell);
      if (!value) continue;

      for (const rename of list) {
        const matches = value === rename.from || value.startsWith(`${rename.from}/`);
        if (!matches) continue;
        const replacement = value === rename.from ? rename.to : `${rename.to}/${value.slice(rename.from.length + 1)}`;
        cells[cellIndex] = cell.replace(normalizeWhitespace(cell), replacement);
        const rewritten = cells.join("|");
        if (samples.length < 2) samples.push({ before: line.trim(), after: rewritten.trim() });
        lines[index] = rewritten;
        entries += 1;
        break;
      }
    }

    return { content: lines.join("\n"), entries, samples };
  };
}

// Tidies the wreckage the old bill model left in the notes.
//
// Two kinds. A **same-day duplicate**: the same bill logged twice or three times
// on one date, because wording variants were each detected as their own bill and
// auto-log then logged all of them. A **$0 skip marker**: how a skipped cycle
// used to be recorded, which is bookkeeping in the middle of a spending log, and
// which the nameless ones could turn into a phantom bill of their own.
//
// Only entries under the recurring prefix are considered. Two $5 coffees on one
// day are two coffees; two identical subscription charges on one day are not.
function buildRecurringCleanupTransform(options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const removeDuplicates = options.removeDuplicates !== false;
  const removeZeroSkips = options.removeZeroSkips !== false;
  const settings = {
    defaultCurrency: options.defaultCurrency || "AUD",
    spendingHeading: options.heading || "## Finance",
    spendingRootTag: options.spendingRootTag || "#log/spending",
  };

  return function transform(content, path) {
    const entries = parseTransactionsFromNoteContent(content, path, {
      defaultCurrency: settings.defaultCurrency,
      financeHeading: settings.spendingHeading,
      spendingHeading: settings.spendingHeading,
    }).filter((entry) => {
      const category = normalizeCategoryPath(entry.category || "");
      return category === prefix || category.startsWith(`${prefix}/`);
    });

    const doomed = [];
    const kept = new Map();
    for (const entry of entries) {
      if (!(entry.amount > 0)) {
        if (removeZeroSkips) doomed.push({ entry, reason: "skip marker, recorded on the bill now" });
        continue;
      }
      if (!removeDuplicates) continue;
      const key = `${entry.date}|${entry.amount.toFixed(2)}|${normalizeCategoryPath(entry.category)}`;
      const first = kept.get(key);
      if (!first) {
        kept.set(key, entry);
        continue;
      }
      doomed.push({
        entry,
        reason: `same ${formatCurrency(entry.amount, entry.currency || settings.defaultCurrency)} charge already logged that day${
          first.merchant ? ` as "${first.merchant}"` : ""
        }`,
      });
    }

    if (!doomed.length) return { content, entries: 0, samples: [], warnings: [] };

    // Bottom-up, so removing one entry cannot shift the line another sits at.
    const ordered = doomed.slice().sort((left, right) => (right.entry.lineIndex ?? -1) - (left.entry.lineIndex ?? -1));
    let next = content;
    let removed = 0;
    const samples = [];
    const warnings = [];
    for (const { entry, reason } of ordered) {
      const without = removeTransactionBlock(next, entry.rawLine, settings, { lineIndex: entry.lineIndex });
      if (without == null) continue;
      next = without;
      removed += 1;
      warnings.push({ line: `${entry.date} ${entry.rawLine.trim()}${entry.merchant ? ` (${entry.merchant})` : ""}`, reason });
      if (samples.length < 3) samples.push({ before: entry.rawLine.trim(), after: "(removed)" });
    }

    return { content: next, entries: removed, samples, warnings };
  };
}

// --- Bills ----------------------------------------------------------------------
//
// A bill is a thing you have decided to track, with an id that does not change.
// Before this, a bill *was* its tag: `cadence/name`, where name came from the tag
// or, failing that, from a slug of whatever the child line happened to say. So
// "Urban Climb", "Urban climb sub" and "Urban Climb Membership" were three bills,
// a cadence change was a new bill, and the only fix offered was to remove the
// duplicates one by one — twelve of them, in the author's vault.
//
// Detection still exists, but as a suggestion: "this looks recurring, track it?".
// What a bill *is* now lives in a note you can read and edit.

const BILL_DUE_RULES = ["after-last", "day-of-month", "nth-weekday"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Cadences that can sit on a calendar day. A weekly bill has no "14th of the
// month", so it always falls back to counting from the last payment.
const CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

function normalizeBillId(value) {
  return normalizeCategoryPath(value).split("/").filter(Boolean).join("-");
}

function billNameFromId(raw, id) {
  const text = normalizeWhitespace(raw);
  return /[A-Z\s]/.test(text) ? text : titleCaseSegment(id);
}

function parseBillDueRule(value) {
  const raw = normalizeWhitespace(String(value || "")).toLowerCase();
  if (!raw || raw === "after-last" || raw === "after last") return { type: "after-last" };

  const dayMatch = raw.match(/^day[- ]of[- ]month\s*[:=]?\s*(\d{1,2})$/);
  if (dayMatch) return { type: "day-of-month", day: Math.min(31, Math.max(1, Number(dayMatch[1]))) };

  const weekdayMatch = raw.match(/^nth[- ]weekday\s*[:=]?\s*(-?\d)\s+([a-z]+)$/);
  if (weekdayMatch) {
    const weekday = WEEKDAYS.findIndex((day) => day.startsWith(weekdayMatch[2].slice(0, 3)));
    if (weekday >= 0) return { type: "nth-weekday", ordinal: Number(weekdayMatch[1]), weekday };
  }
  return { type: "after-last" };
}

function serializeBillDueRule(rule) {
  if (rule?.type === "day-of-month") return `day-of-month: ${rule.day}`;
  if (rule?.type === "nth-weekday") return `nth-weekday: ${rule.ordinal} ${WEEKDAYS[rule.weekday] || "monday"}`;
  return "after-last";
}

// Aliases differing only in case or punctuation match the same payments, so one
// spelling of each is kept — the converted Urban Climb note listed seven.
function dedupeBillAliases(aliases, id) {
  const seen = new Set([normalizeBillId(id)]);
  const kept = [];
  for (const alias of aliases || []) {
    const key = normalizeBillId(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(alias);
  }
  return kept;
}

function parseListValue(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeWhitespace(item)).filter(Boolean);
  const raw = String(value || "").trim().replace(/^\[|\]$/g, "");
  return raw
    .split(",")
    .map((item) => normalizeWhitespace(item).replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

// A bill note's frontmatter. Everything is optional except an id and a cadence:
// a half-filled note should still describe a usable bill.
function parseBillDefinition(frontmatter, options = {}) {
  const fm = frontmatter || {};
  const id = normalizeBillId(fm.bill_id || fm.id || fm.bill_name || fm.name || "");
  const cadence = normalizeCadence(fm.cadence || fm.frequency || "");
  if (!id || !cadence) return null;

  const amount = parseNumber(fm.amount);
  const amountModel = String(fm.amount_model || (/^(?:true|yes|1)$/i.test(String(fm.variable || "")) ? "variable" : "fixed"))
    .trim()
    .toLowerCase();

  return {
    id,
    // Keep the name as written where there is one to keep: title-casing the id
    // turns "Aussie Broadband NBN" into "Aussie Broadband Nbn".
    name: normalizeWhitespace(fm.bill_name || fm.name || "") || billNameFromId(fm.bill_id || fm.id || "", id),
    aliases: dedupeBillAliases(parseListValue(fm.aliases), fm.bill_id || fm.id || fm.bill_name || fm.name || ""),
    cadence,
    dueRule: parseBillDueRule(fm.due_rule),
    amount: Number.isFinite(amount) && amount > 0 ? roundCurrencyAmount(amount) : null,
    amountModel: amountModel === "variable" || amountModel === "range" ? amountModel : "fixed",
    amountMin: parseNumber(fm.amount_min),
    amountMax: parseNumber(fm.amount_max),
    reminderDays: Math.max(0, Number(parseNumber(fm.reminder_days)) || 0),
    active: !/^(?:false|no|0)$/i.test(String(fm.active ?? "true")),
    autoLog: /^(?:true|yes|1|on)$/i.test(String(fm.auto_log ?? "")),
    nextAmount: parseNumber(fm.next_amount),
    changeDate: parseIsoDate(fm.change_date || ""),
    endDate: parseIsoDate(fm.end_date || ""),
    paymentsLeft: Number.isFinite(parseNumber(fm.payments_left)) ? Math.floor(parseNumber(fm.payments_left)) : null,
    nextDueOverride: parseIsoDate(fm.next_due || fm.next_due_override || ""),
    skipped: parseListValue(fm.skipped).map((date) => parseIsoDate(date)).filter(Boolean),
    startDate: parseIsoDate(fm.start_date || ""),
    // Set when this bill was merged into another. It then stops being a bill of
    // its own, so its payments fall through to the bill that now carries its name.
    mergedInto: normalizeBillId(fm.merged_into || ""),
    currency: normalizeCurrency(fm.currency || options.defaultCurrency || "AUD"),
    notePath: options.notePath || "",
  };
}

function clampDayOfMonth(monthIso, day) {
  const [year, month] = String(monthIso).split("-").map(Number);
  if (!year || !month) return "";
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthIso}-${pad(Math.min(Math.max(1, Number(day) || 1), lastDay))}`;
}

function nthWeekdayOfMonth(monthIso, ordinal, weekday) {
  const [year, month] = String(monthIso).split("-").map(Number);
  if (!year || !month) return "";
  const lastDay = new Date(year, month, 0).getDate();
  if (Number(ordinal) === -1) {
    for (let day = lastDay; day >= 1; day -= 1) {
      if (new Date(year, month - 1, day).getDay() === weekday) return `${monthIso}-${pad(day)}`;
    }
    return "";
  }
  let seen = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, month - 1, day).getDay() !== weekday) continue;
    seen += 1;
    if (seen === Number(ordinal)) return `${monthIso}-${pad(day)}`;
  }
  return "";
}

// The next date this bill falls due, strictly after `fromDate`.
function billDueAfter(bill, fromDate) {
  const anchor = parseIsoDate(fromDate);
  const cadence = normalizeCadence(bill?.cadence);
  if (!anchor || !cadence) return "";
  const rule = bill.dueRule || { type: "after-last" };
  const months = CADENCE_MONTHS[cadence];

  // A calendar rule needs a cadence measured in months; weekly and fortnightly
  // bills count from the last payment however the rule is written.
  if (rule.type === "after-last" || !months) return nextRecurringDate(anchor, cadence) || "";

  const dateIn = (monthIso) =>
    rule.type === "day-of-month" ? clampDayOfMonth(monthIso, rule.day) : nthWeekdayOfMonth(monthIso, rule.ordinal, rule.weekday);

  let month = anchor.slice(0, 7);
  for (let step = 0; step < 24; step += 1) {
    const candidate = dateIn(month);
    if (candidate && candidate > anchor) return candidate;
    month = addMonths(`${month}-01`, months).slice(0, 7);
  }
  return nextRecurringDate(anchor, cadence) || "";
}

// How far off its due date a payment can be and still count as that cycle. Half
// a cadence, capped: pay a weekly bill two days late and it is still this week's
// payment; pay it five days late and the schedule has genuinely moved.
function billDriftTolerance(cadence) {
  const spec = RECURRING_CADENCES[normalizeCadence(cadence)];
  if (!spec) return 3;
  if (spec.days) return Math.max(1, Math.floor(spec.days / 2) - 1);
  return spec.months >= 12 ? 21 : 10;
}

// Walks the payments to find which cycle was last satisfied. A payment close to
// the expected due date fulfils that cycle — so the schedule keeps its own
// rhythm rather than sliding by however late you happened to be. A payment far
// from it re-anchors the schedule, because a bill paid three weeks later is a
// bill that now falls due three weeks later.
//
// This is what the Next Due override existed to paper over. The override is
// still there as a manual correction, but the ordinary case no longer needs it.
function resolveBillCycleAnchor(bill, dates) {
  const sorted = (dates || []).filter(Boolean).slice().sort();
  if (!sorted.length) return "";
  const tolerance = billDriftTolerance(bill?.cadence);
  let expected = sorted[0];
  for (const date of sorted.slice(1)) {
    const due = billDueAfter(bill, expected);
    if (!due) {
      expected = date;
      continue;
    }
    const gap = Math.abs(Math.round((isoToDate(date).getTime() - isoToDate(due).getTime()) / DAY_MS));
    expected = gap <= tolerance ? due : date;
  }
  return expected;
}

// What a bill looks like right now, given the payments linked to it: what it
// costs, when it is next due, and whether it has run its course.
//
// The override is the one piece with history behind it. It exists so that
// logging a bill late does not drag every future due date along with it — but it
// used to win unconditionally, so a bill paid any other way (typed by hand, or
// captured from a card) stayed "overdue" forever behind a stale override. It is
// now cleared by any payment on or after the date it names.
function computeBillState(bill, payments, options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const paid = (payments || [])
    .filter((payment) => Number(payment?.amount || 0) > 0)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const recentAmounts = paid.slice(-6).map((payment) => roundCurrencyAmount(payment.amount));
  const lastPayment = paid[paid.length - 1] || null;
  const skips = (bill.skipped || []).slice().sort();
  const lastSkip = skips[skips.length - 1] || "";
  // A skipped cycle moves the schedule on exactly as a payment does.
  let anchor = resolveBillCycleAnchor(bill, [...paid.map((payment) => payment.date), ...skips, bill.startDate || ""]);

  const averageAmount = recentAmounts.length
    ? roundCurrencyAmount(recentAmounts.reduce((sum, value) => sum + value, 0) / recentAmounts.length)
    : 0;
  const observed = bill.amountModel === "variable" ? averageAmount : roundCurrencyAmount(lastPayment?.amount || 0);
  const baseAmount = roundCurrencyAmount(bill.amount ?? observed ?? 0);

  // An override is settled by a payment on or after its date — or a little
  // before it, within the same tolerance a late payment gets. Paying a weekly
  // bill the day before it is due is paying that week's bill; without this the
  // author's gym, paid on the 16th, still read "due today" on the 17th.
  let overrideStillStands = Boolean(bill.nextDueOverride);
  if (overrideStillStands && anchor) {
    const early = Math.round((isoToDate(bill.nextDueOverride).getTime() - isoToDate(anchor).getTime()) / DAY_MS);
    if (anchor >= bill.nextDueOverride) {
      overrideStillStands = false;
    } else if (early <= billDriftTolerance(bill.cadence)) {
      overrideStillStands = false;
      // That cycle is done, so the next one follows the date it was due.
      anchor = bill.nextDueOverride;
    }
  }
  const derived = anchor ? billDueAfter(bill, anchor) : "";
  const nextDue = overrideStillStands ? bill.nextDueOverride : derived || bill.nextDueOverride || "";

  const changePending = bill.nextAmount > 0 && bill.changeDate && bill.changeDate > referenceDate;
  const changeApplied = bill.nextAmount > 0 && bill.changeDate && bill.changeDate <= referenceDate;
  const lastAmount = changeApplied ? roundCurrencyAmount(bill.nextAmount) : baseAmount;
  const nextDueAmount =
    bill.nextAmount > 0 && bill.changeDate && nextDue && bill.changeDate <= nextDue
      ? roundCurrencyAmount(bill.nextAmount)
      : lastAmount;

  const outOfPayments = bill.paymentsLeft !== null && bill.paymentsLeft <= 0;
  const pastEndDate = Boolean(bill.endDate && (!nextDue || nextDue > bill.endDate));
  const finishedReason = outOfPayments ? "payments" : pastEndDate ? "end-date" : "";
  const finished = Boolean(finishedReason);
  const active = bill.active !== false && !finished;

  const status = finished
    ? "finished"
    : !nextDue
      ? "unknown"
      : nextDue < referenceDate
        ? "overdue"
        : nextDue === referenceDate
          ? "due"
          : "upcoming";
  const daysUntilDue = nextDue
    ? nextDue >= referenceDate
      ? daysBetweenInclusive(referenceDate, nextDue) - 1
      : -(daysBetweenInclusive(nextDue, referenceDate) - 1)
    : null;
  const spec = RECURRING_CADENCES[bill.cadence];

  return {
    // The shape every existing consumer already reads — the block, the sidebar
    // card, the payment calendar, runway — so they keep working unchanged.
    active,
    autoLog: bill.autoLog,
    cadence: bill.cadence,
    category: `${normalizeCategoryPath(options.prefix || "subscriptions")}/${bill.cadence}/${bill.id}`,
    changeDate: changePending ? bill.changeDate : null,
    count: paid.length,
    currency: bill.currency,
    daysUntilDue,
    endDate: bill.endDate,
    finished,
    finishedReason,
    label: bill.name,
    lastAmount,
    lastDate: lastPayment?.date || "",
    merchant: lastPayment?.merchant || bill.name,
    monthlyCost: spec ? roundCurrencyAmount(nextDueAmount * spec.perMonth) : 0,
    name: bill.id,
    nextAmount: changePending ? roundCurrencyAmount(bill.nextAmount) : null,
    nextDue,
    nextDueAmount,
    paymentsLeft: bill.paymentsLeft,
    recentAmounts,
    averageAmount: averageAmount || lastAmount,
    status,
    tag: `#log/spending/${normalizeCategoryPath(options.prefix || "subscriptions")}/${bill.cadence}/${bill.id}`,
    variable: bill.amountModel === "variable",
    yearlyCost: spec ? roundCurrencyAmount(nextDueAmount * spec.perMonth * 12) : 0,

    // New, for the bills UI.
    bill,
    billId: bill.id,
    dueRule: bill.dueRule,
    notePath: bill.notePath,
    payments: paid,
    reminderDays: bill.reminderDays,
    skipped: skips,
    usedOverride: overrideStillStands,
  };
}

// Which bill does this entry belong to? In order: the id in its own tag, then an
// alias or the merchant root. Anything left over is not claimed — a guess that
// files a payment under the wrong bill is worse than an unlinked entry.
function buildBillMatcher(bills, options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const byId = new Map();
  const byAlias = new Map();
  for (const bill of bills || []) {
    byId.set(bill.id, bill.id);
    const names = [bill.id, bill.name, ...(bill.aliases || [])];
    for (const alias of names) {
      for (const key of [normalizeBillId(alias), normalizeMerchant(alias), merchantRootKey(alias)]) {
        if (key && !byAlias.has(key)) byAlias.set(key, bill.id);
      }
    }
  }

  return function match(entry) {
    const category = normalizeCategoryPath(entry?.category || "");
    const underPrefix = category === prefix || category.startsWith(`${prefix}/`);
    if (!underPrefix) return "";
    const rest = category.slice(prefix.length).split("/").filter(Boolean);
    const tagged = normalizeBillId(rest.slice(1).join("-"));
    if (tagged && byId.has(tagged)) return tagged;
    if (tagged && byAlias.has(tagged)) return byAlias.get(tagged);
    for (const key of [normalizeBillId(entry?.merchant || ""), normalizeMerchant(entry?.merchant || ""), merchantRootKey(entry?.merchant || "")]) {
      if (key && byAlias.has(key)) return byAlias.get(key);
    }
    return "";
  };
}

// Everything the bills UI needs: each bill's state, the recurring entries no bill
// claimed, and what those suggest tracking.
function buildBillsView(bills, entries, options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const match = buildBillMatcher(bills, { prefix });
  const payments = new Map((bills || []).map((bill) => [bill.id, []]));
  const unmatched = [];

  for (const entry of entries || []) {
    if (entry?.isIncome || entry?.isGoalContribution || isPlannedExpenseEntry(entry)) continue;
    const category = normalizeCategoryPath(entry.category || "");
    if (category !== prefix && !category.startsWith(`${prefix}/`)) continue;
    const billId = match(entry);
    if (billId && payments.has(billId)) payments.get(billId).push(entry);
    else unmatched.push(entry);
  }

  const items = (bills || []).map((bill) =>
    computeBillState(bill, payments.get(bill.id) || [], { referenceDate, prefix })
  );
  const live = items.filter((item) => item.active);

  return {
    items,
    unmatched,
    suggestions: suggestBillsFromEntries(unmatched, { prefix, referenceDate }),
    totals: {
      monthly: roundCurrencyAmount(live.reduce((sum, item) => sum + item.monthlyCost, 0)),
      yearly: roundCurrencyAmount(live.reduce((sum, item) => sum + item.yearlyCost, 0)),
    },
  };
}

// Recurring-looking entries nothing is tracking yet, grouped into one suggestion
// per merchant. This is what detection is for now: an offer, not a fact.
function suggestBillsFromEntries(entries, options = {}) {
  const prefix = normalizeCategoryPath(options.prefix || "subscriptions") || "subscriptions";
  const groups = new Map();

  for (const entry of entries || []) {
    if (!(Number(entry?.amount || 0) > 0)) continue;
    const category = normalizeCategoryPath(entry.category || "");
    const rest = category.slice(prefix.length).split("/").filter(Boolean);
    const cadence = normalizeCadence(rest[0]);
    if (!cadence) continue;
    const named = rest.slice(1).join("-");
    const key = normalizeBillId(named || merchantRootKey(entry.merchant || "") || "");
    if (!key) continue;
    const group = groups.get(key) || {
      id: key,
      cadence,
      name: normalizeWhitespace(entry.merchant || "") || titleCaseSegment(key),
      amounts: [],
      dates: [],
      merchants: new Set(),
    };
    group.amounts.push(roundCurrencyAmount(entry.amount));
    group.dates.push(parseIsoDate(entry.date) || "");
    if (entry.merchant) group.merchants.add(normalizeWhitespace(entry.merchant));
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const dates = group.dates.filter(Boolean).sort();
      return {
        id: group.id,
        name: group.name,
        cadence: group.cadence,
        count: group.amounts.length,
        lastAmount: group.amounts[group.amounts.length - 1],
        lastDate: dates[dates.length - 1] || "",
        firstDate: dates[0] || "",
        merchants: Array.from(group.merchants),
        total: roundCurrencyAmount(group.amounts.reduce((sum, value) => sum + value, 0)),
      };
    })
    .sort((left, right) => right.count - left.count || right.total - left.total);
}

// A capture that looks like a bill: right sort of amount, near enough the due
// date, and a merchant that matches. Used when a card capture arrives, and to
// offer "is this the Claude bill?" for ones already logged.
function findBillForPayment(payment, items, options = {}) {
  const windowDays = Number.isFinite(options.windowDays) ? options.windowDays : 7;
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 0.1;
  const date = parseIsoDate(payment?.date);
  const amount = Number(payment?.amount || 0);
  if (!date || !(amount > 0)) return null;
  const merchantKey = merchantRootKey(payment?.merchant || "");

  let best = null;
  for (const item of items || []) {
    if (!item.active || !item.nextDue) continue;
    const names = [item.billId, item.label, ...(item.bill?.aliases || [])];
    const matchesMerchant = merchantKey && names.some((name) => merchantRootKey(name) === merchantKey);
    if (!matchesMerchant) continue;

    const expected = item.nextDueAmount || item.lastAmount;
    const withinAmount =
      item.variable ||
      (expected > 0 && Math.abs(amount - expected) <= Math.max(expected * tolerance, 0.5));
    if (!withinAmount) continue;

    const gap = Math.abs(Math.round((isoToDate(date).getTime() - isoToDate(item.nextDue).getTime()) / DAY_MS));
    if (gap > windowDays) continue;
    if (!best || gap < best.gap) best = { item, gap };
  }
  return best ? best.item : null;
}

// Turns what the old model detected into bills worth keeping.
//
// The judgement it has to make is which detected "bills" were only ever wordings
// of one bill. The rule: same cadence, same amount, and payment histories that
// overlap in time. Overlap is what separates a renaming from two real charges —
// the author's Urban Climb variants were logged on the *same days* as each
// other, while the two Martial Arts Queensland debits differ in amount and
// alternate, so they stay apart.
//
// A bill that was "removed completely" keeps its history and becomes an ended
// bill rather than disappearing: cancelled is not the same as never happened.
function carriedOverride(item) {
  if (!item?.nextDue) return null;
  const derived = item.lastDate ? nextRecurringDate(item.lastDate, item.cadence) : "";
  return item.nextDue !== derived ? item.nextDue : null;
}

function planBillsFromLegacy(items, options = {}) {
  const excluded = new Set(options.excluded || []);
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const amountsMatch = (left, right) => {
    if (!(left > 0) || !(right > 0)) return false;
    return Math.abs(left - right) <= Math.max(left, right) * 0.01;
  };
  const overlaps = (group, item) => {
    const start = item.firstDate || item.lastDate || "";
    const end = item.lastDate || item.firstDate || "";
    if (!start || !group.firstDate) return false;
    return start <= group.lastDate && end >= group.firstDate;
  };

  // Newest first, so the wording still in use becomes the bill and the older
  // spellings become its aliases.
  const sorted = (items || []).slice().sort((left, right) => String(right.lastDate || "").localeCompare(String(left.lastDate || "")));
  const groups = [];

  for (const item of sorted) {
    const group = groups.find(
      (candidate) => candidate.cadence === item.cadence && amountsMatch(candidate.amount, item.lastAmount) && overlaps(candidate, item)
    );
    if (group) {
      group.merged.push(item);
      group.firstDate = [group.firstDate, item.firstDate].filter(Boolean).sort()[0] || group.firstDate;
      group.lastDate = [group.lastDate, item.lastDate].filter(Boolean).sort().pop() || group.lastDate;
      continue;
    }
    groups.push({
      primary: item,
      merged: [],
      cadence: item.cadence,
      amount: item.lastAmount,
      firstDate: item.firstDate || item.lastDate || "",
      lastDate: item.lastDate || "",
    });
  }

  return groups.map((group) => {
    const primary = group.primary;
    const everyName = [primary, ...group.merged];
    const retired = everyName.every((item) => excluded.has(item.name)) || primary.active === false;
    const aliases = Array.from(
      new Set(
        everyName
          .flatMap((item) => [item.name, item.label, item.merchant])
          .map((value) => normalizeWhitespace(value || ""))
          .filter((value) => value && normalizeBillId(value) !== normalizeBillId(primary.name))
      )
    );

    return {
      id: normalizeBillId(primary.name),
      name: normalizeWhitespace(primary.merchant || primary.label || titleCaseSegment(primary.name)),
      aliases,
      cadence: primary.cadence,
      dueRule: { type: "after-last" },
      amount: roundCurrencyAmount(primary.lastAmount || 0),
      amountModel: primary.variable ? "variable" : "fixed",
      reminderDays: 3,
      // Removed or paused bills come across as ended, keeping their history.
      active: !retired,
      autoLog: primary.autoLog !== false,
      nextAmount: primary.nextAmount || null,
      changeDate: primary.changeDate || null,
      // An ended bill stops at its last payment; a live one keeps the terms it had.
      endDate: retired ? primary.lastDate || null : primary.endDate || null,
      paymentsLeft: retired ? null : primary.paymentsLeft ?? null,
      // A registry override carries across: it usually records a skip or a
      // correction the notes cannot show. The bill model clears it by itself
      // once a payment overtakes it, so carrying it is safe.
      nextDueOverride: retired ? null : carriedOverride(primary),
      skipped: [],
      startDate: group.firstDate || null,
      currency: primary.currency || options.defaultCurrency || "AUD",
      // For the preview.
      mergedFrom: group.merged.map((item) => item.name),
      payments: everyName.reduce((sum, item) => sum + Number(item.count || 0), 0),
      retired,
      lastDate: group.lastDate,
      referenceDate,
    };
  });
}

// --- Portfolio -------------------------------------------------------------------
//
// Share holdings, from a hand-editable table of trades. Nothing here fetches
// anything: prices come in as an argument, from the market-data cache or from a
// price typed by hand, so every number can be worked out offline and tested.
//
// Buying shares moves money from cash into holdings. It is a transfer, not
// spending, which is why trades live in the portfolio note rather than in daily
// notes: they never touch a budget or a spending total.
//
// All of this is informational arithmetic, not tax or investment advice.

const TRADE_TYPES = new Set(["buy", "sell", "drp", "split"]);

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

// A ticker as it can appear in a tag: "VAS.AX" is written #log/income/dividend/vas-ax,
// which the tag parser reduces to "vasax". Both reduce to the same key.
function tickerKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tickerMarket(ticker) {
  const symbol = normalizeTicker(ticker);
  if (symbol.endsWith(".AX")) return "ASX";
  if (/^[A-Z.\-]+$/.test(symbol) && !symbol.includes(".")) return "US";
  return "Other";
}

function parseTradeRow(row, index) {
  const type = String(row.type || row.action || "").trim().toLowerCase();
  const ticker = normalizeTicker(row.ticker || row.symbol || row.code || "");
  const date = parseIsoDate(row.date || "");
  const warnings = [];
  if (!TRADE_TYPES.has(type)) {
    if (type || ticker) warnings.push({ row: index + 1, reason: `unknown trade type "${row.type || ""}"` });
    return { trade: null, warnings };
  }
  if (!ticker || !date) {
    warnings.push({ row: index + 1, reason: "a trade needs a date and a ticker" });
    return { trade: null, warnings };
  }
  const units = parseNumber(row.units ?? row.quantity ?? row.qty);
  const price = parseNumber(row.price);
  const fees = parseNumber(row.fees ?? row.brokerage) || 0;
  const currency = normalizeCurrency(row.currency || (tickerMarket(ticker) === "US" ? "USD" : "AUD"));
  const audCost = parseNumber(row["aud cost"] ?? row.audcost ?? row["aud total"]);

  if (!(units > 0)) {
    warnings.push({ row: index + 1, reason: type === "split" ? "a split needs its ratio in Units (2 for a 2-for-1)" : "a trade needs a positive number of units" });
    return { trade: null, warnings };
  }
  if (type !== "split" && !(price >= 0 && Number.isFinite(price))) {
    warnings.push({ row: index + 1, reason: "a trade needs a price" });
    return { trade: null, warnings };
  }

  return {
    trade: {
      account: normalizeWhitespace(row.account || row.broker || ""),
      audCost: Number.isFinite(audCost) && audCost > 0 ? roundCurrencyAmount(audCost) : null,
      currency,
      date,
      fees: roundCurrencyAmount(fees),
      note: normalizeWhitespace(row.note || ""),
      price: type === "split" ? null : Number(price),
      row: index + 1,
      ticker,
      type,
      units: Number(units),
    },
    warnings,
  };
}

// Reads every table in the note that has Date, Type and Ticker columns.
function parseTradesTable(content) {
  const trades = [];
  const warnings = [];
  for (const rows of parseMarkdownTable(content)) {
    if (!rows.length || !("type" in rows[0]) || !("ticker" in rows[0] || "symbol" in rows[0])) continue;
    rows.forEach((row, index) => {
      if (Object.values(row).every((cell) => !String(cell || "").trim())) return;
      const parsed = parseTradeRow(row, index);
      warnings.push(...parsed.warnings);
      if (parsed.trade) trades.push(parsed.trade);
    });
  }
  trades.sort((left, right) => left.date.localeCompare(right.date) || left.row - right.row);
  return { trades, warnings };
}

// "VAS.AX=102.50, AAPL=230" — prices typed by hand, which always win.
function parsePriceOverrides(value) {
  const prices = {};
  for (const part of String(value || "").split(/[,;\n]+/)) {
    const match = part.trim().match(/^([A-Za-z0-9.\-^=]+)\s*[=:]\s*([\d.,]+)$/);
    if (!match) continue;
    const price = parseNumber(match[2]);
    if (price > 0) prices[normalizeTicker(match[1])] = price;
  }
  return prices;
}

function daysBetween(start, end) {
  return Math.round((isoToDate(end).getTime() - isoToDate(start).getTime()) / DAY_MS);
}

// Eligible for the CGT discount when held for at least twelve months. The
// ATO counts from the day after acquisition, so a parcel bought on 1 March 2025
// qualifies when sold on or after 2 March 2026. Informational only.
function heldTwelveMonths(acquired, disposed) {
  const threshold = addDays(addMonths(acquired, 12), 1);
  return Boolean(threshold && disposed >= threshold);
}

// Walks the trades in date order, first-in-first-out, and returns what is still
// held, what has been sold, and what the arithmetic could not settle.
//
// Costs are tracked in the trade's own currency and in AUD. A foreign trade
// should carry its AUD cost (what actually left the account); where it does not,
// the AUD figure is estimated from `options.fx` and flagged.
function buildHoldings(trades, options = {}) {
  const fx = options.fx || {};
  const byTicker = new Map();
  const realised = [];
  const warnings = [];

  const audPerUnit = (currency) => (currency === "AUD" ? 1 : Number(fx[currency]) || null);

  for (const trade of trades || []) {
    const holding = byTicker.get(trade.ticker) || {
      ticker: trade.ticker,
      currency: trade.currency,
      market: tickerMarket(trade.ticker),
      parcels: [],
      realisedAud: 0,
      realisedNative: 0,
      accounts: new Set(),
      firstDate: trade.date,
      estimatedAud: false,
    };
    if (trade.account) holding.accounts.add(trade.account);

    if (trade.type === "split") {
      for (const parcel of holding.parcels) parcel.units = parcel.units * trade.units;
      byTicker.set(trade.ticker, holding);
      continue;
    }

    const grossNative = trade.units * trade.price;
    if (trade.type === "buy" || trade.type === "drp") {
      const costNative = grossNative + trade.fees;
      let costAud = trade.audCost;
      if (costAud === null) {
        const rate = audPerUnit(trade.currency);
        if (rate) {
          costAud = roundCurrencyAmount(costNative * rate);
          if (trade.currency !== "AUD") {
            holding.estimatedAud = true;
            warnings.push({ row: trade.row, ticker: trade.ticker, reason: "no AUD cost given, so it was estimated at the current exchange rate" });
          }
        } else {
          costAud = 0;
          warnings.push({ row: trade.row, ticker: trade.ticker, reason: `no AUD cost and no ${trade.currency} exchange rate to estimate one` });
        }
      }
      holding.parcels.push({ acquired: trade.date, units: trade.units, costNative, costAud, type: trade.type });
      byTicker.set(trade.ticker, holding);
      continue;
    }

    // Sell: consume the oldest parcels first.
    let remaining = trade.units;
    const proceedsNative = grossNative - trade.fees;
    const rate = audPerUnit(trade.currency);
    const proceedsAud = trade.audCost ?? (rate ? roundCurrencyAmount(proceedsNative * rate) : 0);
    const heldUnits = holding.parcels.reduce((sum, parcel) => sum + parcel.units, 0);
    if (remaining > heldUnits + 1e-9) {
      warnings.push({ row: trade.row, ticker: trade.ticker, reason: `sells ${trade.units} units but only ${heldUnits} are held` });
    }

    while (remaining > 1e-9 && holding.parcels.length) {
      const parcel = holding.parcels[0];
      const take = Math.min(parcel.units, remaining);
      const share = take / parcel.units;
      const portion = take / trade.units;
      const costNative = parcel.costNative * share;
      const costAud = parcel.costAud * share;
      const saleNative = proceedsNative * portion;
      const saleAud = proceedsAud * portion;
      realised.push({
        acquired: parcel.acquired,
        costAud: roundCurrencyAmount(costAud),
        costNative: roundCurrencyAmount(costNative),
        date: trade.date,
        discountEligible: heldTwelveMonths(parcel.acquired, trade.date),
        gainAud: roundCurrencyAmount(saleAud - costAud),
        gainNative: roundCurrencyAmount(saleNative - costNative),
        heldDays: daysBetween(parcel.acquired, trade.date),
        proceedsAud: roundCurrencyAmount(saleAud),
        ticker: trade.ticker,
        units: take,
      });
      holding.realisedAud += saleAud - costAud;
      holding.realisedNative += saleNative - costNative;
      parcel.units -= take;
      parcel.costNative -= costNative;
      parcel.costAud -= costAud;
      remaining -= take;
      if (parcel.units <= 1e-9) holding.parcels.shift();
    }
    byTicker.set(trade.ticker, holding);
  }

  const holdings = Array.from(byTicker.values()).map((holding) => {
    const units = holding.parcels.reduce((sum, parcel) => sum + parcel.units, 0);
    const costNative = holding.parcels.reduce((sum, parcel) => sum + parcel.costNative, 0);
    const costAud = holding.parcels.reduce((sum, parcel) => sum + parcel.costAud, 0);
    return {
      accounts: Array.from(holding.accounts),
      averageCostNative: units > 0 ? costNative / units : 0,
      costAud: roundCurrencyAmount(costAud),
      costNative: roundCurrencyAmount(costNative),
      currency: holding.currency,
      estimatedAud: holding.estimatedAud,
      firstDate: holding.firstDate,
      market: holding.market,
      parcels: holding.parcels.map((parcel) => ({
        ...parcel,
        costAud: roundCurrencyAmount(parcel.costAud),
        costNative: roundCurrencyAmount(parcel.costNative),
        discountEligible: heldTwelveMonths(parcel.acquired, parseIsoDate(options.referenceDate) || todayIsoLocal()),
      })),
      realisedAud: roundCurrencyAmount(holding.realisedAud),
      realisedNative: roundCurrencyAmount(holding.realisedNative),
      ticker: holding.ticker,
      units: Number(units.toFixed(6)),
    };
  });

  return { holdings, realised, warnings };
}

// Values the holdings at the prices given. A quote is { price, previousClose,
// currency, name, type, fetchedAt, source }; `fx` maps a currency to AUD per unit.
function valuePortfolio(holdingsResult, quotes = {}, fx = {}, options = {}) {
  const rows = [];
  const missing = [];
  for (const holding of holdingsResult?.holdings || []) {
    if (!(holding.units > 1e-9)) continue;
    const quote = quotes[holding.ticker] || null;
    const currency = normalizeCurrency(quote?.currency || holding.currency);
    const rate = currency === "AUD" ? 1 : Number(fx[currency]) || null;
    const price = Number(quote?.price);
    if (!(price > 0) || !rate) {
      missing.push(holding.ticker);
      rows.push({ ...holding, name: quote?.name || holding.ticker, price: null, valueAud: null, gainAud: null, gainPct: null, dayChangePct: null, weight: 0, priceSource: "", stale: false });
      continue;
    }
    const valueNative = holding.units * price;
    const valueAud = roundCurrencyAmount(valueNative * rate);
    const previous = Number(quote.previousClose);
    rows.push({
      ...holding,
      dayChangeAud: previous > 0 ? roundCurrencyAmount(holding.units * (price - previous) * rate) : 0,
      dayChangePct: previous > 0 ? Number((((price - previous) / previous) * 100).toFixed(2)) : null,
      fetchedAt: quote.fetchedAt || "",
      gainAud: roundCurrencyAmount(valueAud - holding.costAud),
      gainPct: holding.costAud > 0 ? Number((((valueAud - holding.costAud) / holding.costAud) * 100).toFixed(2)) : null,
      name: quote.name || holding.ticker,
      price,
      priceSource: quote.source || "",
      stale: Boolean(quote.stale),
      type: quote.type || "",
      valueAud,
      valueNative: roundCurrencyAmount(valueNative),
    });
  }

  const priced = rows.filter((row) => row.valueAud !== null);
  const valueAud = roundCurrencyAmount(priced.reduce((sum, row) => sum + row.valueAud, 0));
  const costAud = roundCurrencyAmount(priced.reduce((sum, row) => sum + row.costAud, 0));
  for (const row of rows) row.weight = valueAud > 0 && row.valueAud ? Number(((row.valueAud / valueAud) * 100).toFixed(2)) : 0;

  const groupBy = (keyOf) => {
    const groups = new Map();
    for (const row of priced) {
      const key = keyOf(row) || "Other";
      groups.set(key, roundCurrencyAmount((groups.get(key) || 0) + row.valueAud));
    }
    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, value, pct: valueAud > 0 ? Number(((value / valueAud) * 100).toFixed(2)) : 0 }))
      .sort((left, right) => right.value - left.value);
  };

  return {
    rows: rows.sort((left, right) => (right.valueAud || 0) - (left.valueAud || 0)),
    missing,
    allocation: {
      byHolding: groupBy((row) => row.ticker),
      byMarket: groupBy((row) => row.market),
      byType: groupBy((row) => (row.type ? titleCaseSegment(String(row.type).toLowerCase()) : "Unknown")),
    },
    totals: {
      costAud,
      dayChangeAud: roundCurrencyAmount(priced.reduce((sum, row) => sum + (row.dayChangeAud || 0), 0)),
      gainAud: roundCurrencyAmount(valueAud - costAud),
      gainPct: costAud > 0 ? Number((((valueAud - costAud) / costAud) * 100).toFixed(2)) : null,
      realisedAud: roundCurrencyAmount((holdingsResult?.realised || []).reduce((sum, sale) => sum + sale.gainAud, 0)),
      valueAud,
    },
  };
}

// Dividends are logged in daily notes as #log/income/dividend/<ticker>, so they
// count as income everywhere income is counted, and are gathered back here.
function summarizeDividends(entries, holdingsResult, options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const yearAgo = addMonths(referenceDate, -12);
  const holdings = new Map((holdingsResult?.holdings || []).map((holding) => [tickerKey(holding.ticker), holding]));
  const byTicker = new Map();

  for (const entry of entries || []) {
    if (entry?.entryType !== "income") continue;
    const category = normalizeCategoryPath(entry.category || "");
    if (!category.startsWith("dividend/")) continue;
    const key = tickerKey(category.slice("dividend/".length));
    const holding = holdings.get(key);
    const ticker = holding?.ticker || category.slice("dividend/".length).toUpperCase();
    const current = byTicker.get(ticker) || { ticker, total: 0, lastTwelveMonths: 0, payments: [] };
    const amount = roundCurrencyAmount(entry.amount);
    current.total = roundCurrencyAmount(current.total + amount);
    if (entry.date > yearAgo && entry.date <= referenceDate) {
      current.lastTwelveMonths = roundCurrencyAmount(current.lastTwelveMonths + amount);
    }
    current.payments.push({ date: entry.date, amount });
    byTicker.set(ticker, current);
  }

  const rows = Array.from(byTicker.values()).map((row) => {
    const holding = Array.from(holdings.values()).find((item) => item.ticker === row.ticker);
    return {
      ...row,
      payments: row.payments.sort((left, right) => right.date.localeCompare(left.date)),
      yieldOnCostPct: holding?.costAud > 0 ? Number(((row.lastTwelveMonths / holding.costAud) * 100).toFixed(2)) : null,
    };
  });

  return {
    rows: rows.sort((left, right) => right.lastTwelveMonths - left.lastTwelveMonths),
    lastTwelveMonths: roundCurrencyAmount(rows.reduce((sum, row) => sum + row.lastTwelveMonths, 0)),
    total: roundCurrencyAmount(rows.reduce((sum, row) => sum + row.total, 0)),
  };
}

// Units of each ticker held at the close of each date in `dates`.
function unitsHeldOn(trades, date) {
  const units = new Map();
  for (const trade of trades || []) {
    if (trade.date > date) break;
    const current = units.get(trade.ticker) || 0;
    if (trade.type === "split") units.set(trade.ticker, current * trade.units);
    else if (trade.type === "sell") units.set(trade.ticker, current - trade.units);
    else units.set(trade.ticker, current + trade.units);
  }
  return units;
}

// Value against cost over time, from historical closes: no snapshots to take.
// `history` maps a ticker to [{ date, close }] ascending; `fxHistory` maps a
// currency to [{ date, audPerUnit }]. The last known value on or before each
// date is used, so weekends and holidays carry forward.
function buildPortfolioValueSeries(trades, history = {}, fxHistory = {}, options = {}) {
  const sortedTrades = (trades || []).slice().sort((left, right) => left.date.localeCompare(right.date));
  if (!sortedTrades.length) return [];
  const start = parseIsoDate(options.start) || sortedTrades[0].date;
  const end = parseIsoDate(options.end) || todayIsoLocal();
  const step = Math.max(1, Number(options.stepDays) || 7);

  const lastOnOrBefore = (series, date, field) => {
    let found = null;
    for (const point of series || []) {
      if (point.date > date) break;
      found = point[field];
    }
    return found;
  };

  const points = [];
  for (let date = start; date && date <= end; date = addDays(date, step)) {
    const held = unitsHeldOn(sortedTrades, date);
    let valueAud = 0;
    let complete = true;
    for (const [ticker, units] of held) {
      if (!(units > 1e-9)) continue;
      const trade = sortedTrades.find((item) => item.ticker === ticker);
      const currency = trade?.currency || "AUD";
      const close = lastOnOrBefore(history[ticker], date, "close");
      const rate = currency === "AUD" ? 1 : lastOnOrBefore(fxHistory[currency], date, "audPerUnit");
      if (!(close > 0) || !(rate > 0)) {
        complete = false;
        continue;
      }
      valueAud += units * close * rate;
    }
    const holdings = buildHoldings(sortedTrades.filter((trade) => trade.date <= date), { fx: options.fx, referenceDate: date });
    const costAud = holdings.holdings.reduce((sum, holding) => sum + holding.costAud, 0);
    points.push({ date, valueAud: roundCurrencyAmount(valueAud), costAud: roundCurrencyAmount(costAud), complete });
    if (date === end) break;
    if (addDays(date, step) > end && date < end) {
      // Always finish on the end date itself.
      const held = unitsHeldOn(sortedTrades, end);
      let finalValue = 0;
      for (const [ticker, units] of held) {
        const trade = sortedTrades.find((item) => item.ticker === ticker);
        const currency = trade?.currency || "AUD";
        const close = lastOnOrBefore(history[ticker], end, "close");
        const rate = currency === "AUD" ? 1 : lastOnOrBefore(fxHistory[currency], end, "audPerUnit");
        if (units > 1e-9 && close > 0 && rate > 0) finalValue += units * close * rate;
      }
      points.push({ date: end, valueAud: roundCurrencyAmount(finalValue), costAud: roundCurrencyAmount(costAud), complete });
      break;
    }
  }
  return points;
}

// Annualised return from dated cash flows (negative in, positive out), by
// Newton's method. Returns null when it will not converge, which is better than a
// confident wrong number.
function computeXirr(cashflows) {
  const flows = (cashflows || []).filter((flow) => parseIsoDate(flow.date) && Number.isFinite(flow.amount) && flow.amount !== 0);
  if (flows.length < 2 || !flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;
  const first = flows.reduce((earliest, flow) => (flow.date < earliest ? flow.date : earliest), flows[0].date);
  const years = flows.map((flow) => daysBetween(first, flow.date) / 365);

  let rate = 0.1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let value = 0;
    let derivative = 0;
    flows.forEach((flow, index) => {
      const factor = Math.pow(1 + rate, years[index]);
      value += flow.amount / factor;
      derivative -= (years[index] * flow.amount) / (factor * (1 + rate));
    });
    if (Math.abs(value) < 1e-7) return Number(rate.toFixed(6));
    if (derivative === 0) return null;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.9999) return null;
    if (Math.abs(next - rate) < 1e-10) return Number(next.toFixed(6));
    rate = next;
  }
  return null;
}

// --- Price sources ----------------------------------------------------------------
//
// Where share prices come from is a setting, not an assumption. Free sources for
// Australian shares are thin: Yahoo is free and covers the ASX but is unofficial
// and rate-limits; a Google Sheet using GOOGLEFINANCE is reliable and yours, but
// needs setting up once; and a price typed by hand always works. These parsers
// turn each source's response into one shape, so the rest of the plugin never
// knows which it was.
//
//   quote:   { price, previousClose, currency, name, type, exchange, time }
//   history: [{ date, close }] ascending
//   dividends: [{ date, amount }]

function isoFromUnixSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "";
  return todayIsoLocal(new Date(value * 1000));
}

// query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?range=…&interval=1d&events=div
// --- Yahoo Finance requests ------------------------------------------------------
// Yahoo's price feed is free but unofficial, and it refuses requests that don't
// look like they come from a browser: without this header every request from
// the author's Mac got 429, with it they all succeeded. Two hosts serve the same
// data, so a refusal from one is tried on the other before backing off.
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const YAHOO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const YAHOO_TIMEOUT_MS = 8000;

function yahooChartPath(symbol, range = "2y") {
  return `/v8/finance/chart/${encodeURIComponent(normalizeTicker(symbol))}?range=${range}&interval=1d&events=div`;
}

function yahooSearchPath(query) {
  return `/v1/finance/search?q=${encodeURIComponent(String(query || "").trim())}&quotesCount=8&newsCount=0`;
}

// Currencies Yahoo quotes in a minor unit. The case matters: "GBp" is pence,
// "GBP" is pounds.
const YAHOO_MINOR_UNITS = { GBp: ["GBP", 100], GBX: ["GBP", 100], ZAc: ["ZAR", 100], ILA: ["ILS", 100] };

function yahooCurrency(raw) {
  const code = String(raw || "").trim();
  const minor = YAHOO_MINOR_UNITS[code];
  if (minor) return { currency: minor[0], divisor: minor[1] };
  return { currency: normalizeCurrency(code, ""), divisor: 1 };
}

function yahooQuoteUrl(ticker) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(normalizeTicker(ticker))}`;
}

// --- Watchlist, holding charts, dividends to log ------------------------------------

// The portfolio note's `watchlist:` property, as a list or a comma-separated line.
function parseWatchlist(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "").replace(/^\[|\]$/g, "");
  const seen = new Set();
  const tickers = [];
  for (const piece of raw.split(/[,\s]+/)) {
    const ticker = normalizeTicker(piece.replace(/^["']|["']$/g, ""));
    if (!ticker || !/^[A-Z0-9^][A-Z0-9.\-=^]*$/.test(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
  }
  return tickers;
}

// "VAS.AX" → #log/income/dividend/vas-ax
function dividendTag(ticker) {
  const slug = normalizeTicker(ticker).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `#log/income/dividend/${slug}`;
}

// Closes within the last `months` of `referenceDate` (all of them for 0).
function sliceHistory(history, months, referenceDate = todayIsoLocal()) {
  const points = (history || []).filter((point) => point && point.close > 0 && point.date <= referenceDate);
  if (!(months > 0)) return points;
  const cutoff = addMonths(referenceDate, -months);
  return points.filter((point) => point.date >= cutoff);
}

function priceChangeOver(history, months, referenceDate = todayIsoLocal()) {
  const points = sliceHistory(history, months, referenceDate);
  if (points.length < 2) return null;
  const from = points[0].close;
  const to = points[points.length - 1].close;
  return { from, to, change: Number((to - from).toFixed(4)), pct: from > 0 ? Number((((to - from) / from) * 100).toFixed(2)) : null };
}

// Dividends Yahoo says a holding paid, that you held units for, and that have
// no dividend (or reinvestment) logged near them. Units are those held at the
// close before the ex-date — buying on the ex-date doesn't earn that dividend.
// The amount is an estimate: withholding, franking and rounding all move it.
function findUnloggedDividends(options = {}) {
  const referenceDate = parseIsoDate(options.referenceDate) || todayIsoLocal();
  const since = addMonths(referenceDate, -(Number(options.lookbackMonths) || 12));
  const trades = (options.trades || []).slice().sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const dismissed = new Set(options.dismissed || []);
  const fx = options.fx || {};
  const currencies = options.currencies || {};
  const logged = (options.entries || []).filter(
    (entry) => entry?.entryType === "income" && normalizeCategoryPath(entry.category || "").startsWith("dividend/")
  );
  const out = [];
  for (const [ticker, events] of Object.entries(options.dividendEvents || {})) {
    const key = tickerKey(ticker);
    for (const event of events || []) {
      const exDate = parseIsoDate(event.date);
      if (!exDate || exDate > referenceDate || exDate < since || !(event.amount > 0)) continue;
      const id = `${ticker}:${exDate}`;
      if (dismissed.has(id)) continue;
      const units = unitsHeldOn(trades, addDays(exDate, -1)).get(ticker) || 0;
      if (!(units > 1e-9)) continue;
      const windowEnd = addDays(exDate, 75);
      const windowStart = addDays(exDate, -7);
      const alreadyLogged =
        logged.some((entry) => tickerKey(entry.category.slice("dividend/".length)) === key && entry.date >= windowStart && entry.date <= windowEnd) ||
        trades.some((trade) => trade.ticker === ticker && trade.type === "drp" && trade.date >= exDate && trade.date <= windowEnd);
      if (alreadyLogged) continue;
      const tradeCurrency = trades.find((trade) => trade.ticker === ticker)?.currency || "AUD";
      const currency = normalizeCurrency(currencies[ticker] || tradeCurrency);
      const rate = currency === "AUD" ? 1 : Number(fx[currency]) || null;
      const native = roundCurrencyAmount(units * event.amount);
      out.push({
        id,
        ticker,
        exDate,
        perUnit: event.amount,
        units: Number(units.toFixed(4)),
        currency,
        amountNative: native,
        amountAud: rate ? roundCurrencyAmount(native * rate) : null,
        suggestedDate: addDays(exDate, 14) < referenceDate ? addDays(exDate, 14) : referenceDate,
      });
    }
  }
  return out.sort((left, right) => right.exDate.localeCompare(left.exDate) || left.ticker.localeCompare(right.ticker));
}

function parseYahooChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) {
    const message = json?.chart?.error?.description || "no chart data";
    return { error: message };
  }
  const meta = result.meta || {};
  // London quotes in pence ("GBp"), Johannesburg in cents: converted to the major
  // unit here, so every figure downstream is in pounds and rand.
  const { currency, divisor } = yahooCurrency(meta.currency);
  const major = (value) => Number((Number(value) / divisor).toFixed(4));
  // Dates on the exchange's own calendar: a New York close at 4pm on the 17th
  // is the 17th, not the 18th as it would be read in Brisbane.
  const offset = Number(meta.gmtoffset);
  const toDate = (seconds) =>
    Number.isFinite(offset) && Number.isFinite(Number(seconds))
      ? new Date((Number(seconds) + offset) * 1000).toISOString().slice(0, 10)
      : isoFromUnixSeconds(seconds);
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const history = [];
  timestamps.forEach((seconds, index) => {
    const close = Number(closes[index]);
    if (close > 0) history.push({ date: toDate(seconds), close: major(close) });
  });
  const dividends = Object.values(result.events?.dividends || {})
    .map((dividend) => ({ date: toDate(dividend.date), amount: major(dividend.amount) }))
    .filter((dividend) => dividend.date && dividend.amount > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  const price = major(meta.regularMarketPrice);
  // Yesterday's close is the last bar before the trading day of the current
  // price. Not chartPreviousClose: for a two-year chart that is the close two
  // years ago, which made "today" the gain since then.
  const tradeDate = toDate(meta.regularMarketTime);
  const earlier = tradeDate ? history.filter((point) => point.date < tradeDate) : [];
  const previousClose = earlier.length
    ? earlier[earlier.length - 1].close
    : major(meta.regularMarketPreviousClose ?? meta.previousClose ?? NaN);
  return {
    quote: price > 0
      ? {
          currency,
          exchange: meta.exchangeName || meta.fullExchangeName || "",
          name: meta.longName || meta.shortName || meta.symbol || "",
          previousClose: previousClose > 0 ? previousClose : null,
          price,
          time: tradeDate,
          type: meta.instrumentType || "",
        }
      : null,
    history,
    dividends,
  };
}

// query2.finance.yahoo.com/v1/finance/search?q=…
function parseYahooSearch(json) {
  return (json?.quotes || [])
    .filter((quote) => quote?.symbol && ["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(String(quote.quoteType || "").toUpperCase()))
    .map((quote) => ({
      exchange: quote.exchDisp || quote.exchange || "",
      name: quote.longname || quote.shortname || quote.symbol,
      symbol: normalizeTicker(quote.symbol),
      type: String(quote.quoteType || "").toUpperCase(),
    }));
}

// A published Google Sheet, as CSV: one row per ticker, headed Ticker and Price,
// optionally Currency, Name and Previous close. Exchange-rate rows use a ticker
// like USDAUD and give the AUD value of one unit as the price.
function parseSheetPrices(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return { quotes: {}, fx: {} };
  const header = rows[0].map((cell) => normalizeWhitespace(cell).toLowerCase());
  const column = (...names) => header.findIndex((name) => names.includes(name));
  const tickerCol = column("ticker", "symbol", "code");
  const priceCol = column("price", "last", "close");
  const currencyCol = column("currency", "ccy");
  const nameCol = column("name", "description");
  const previousCol = column("previous close", "previousclose", "prev close", "closeyest");
  if (tickerCol < 0 || priceCol < 0) return { quotes: {}, fx: {}, error: "The sheet needs Ticker and Price columns." };

  const quotes = {};
  const fx = {};
  for (const cells of rows.slice(1)) {
    const ticker = normalizeTicker(cells[tickerCol]);
    const price = parseNumber(cells[priceCol]);
    if (!ticker || !(price > 0)) continue;
    const fxMatch = ticker.match(/^([A-Z]{3})AUD$/);
    if (fxMatch) {
      fx[fxMatch[1]] = price;
      continue;
    }
    quotes[ticker] = {
      currency: normalizeCurrency(currencyCol >= 0 ? cells[currencyCol] : "", tickerMarket(ticker) === "US" ? "USD" : "AUD"),
      name: nameCol >= 0 ? normalizeWhitespace(cells[nameCol]) : "",
      previousClose: previousCol >= 0 ? parseNumber(cells[previousCol]) || null : null,
      price,
    };
  }
  return { quotes, fx };
}

// The formula a sheet row needs, so setting one up is copy and paste.
function sheetFormulaForTicker(ticker, attribute = "") {
  const symbol = normalizeTicker(ticker);
  const extra = attribute ? `, "${attribute}"` : "";
  if (/^[A-Z]{3}AUD$/.test(symbol)) return `=GOOGLEFINANCE("CURRENCY:${symbol}")`;
  if (symbol.endsWith(".AX")) return `=GOOGLEFINANCE("ASX:${symbol.slice(0, -3)}"${extra})`;
  return `=GOOGLEFINANCE("${symbol}"${extra})`;
}

// The whole sheet, as tab-separated text that pastes straight into Google Sheets:
// one row per ticker held, plus a row for each foreign currency.
function buildPriceSheetTemplate(tickers, currencies = []) {
  const rows = [["Ticker", "Price", "Currency", "Name", "Previous close"].join("\t")];
  for (const ticker of tickers || []) {
    const symbol = normalizeTicker(ticker);
    rows.push(
      [
        symbol,
        sheetFormulaForTicker(symbol),
        sheetFormulaForTicker(symbol, "currency"),
        sheetFormulaForTicker(symbol, "name"),
        sheetFormulaForTicker(symbol, "closeyest"),
      ].join("\t")
    );
  }
  for (const currency of currencies || []) {
    const code = normalizeCurrency(currency);
    if (code === "AUD") continue;
    rows.push([`${code}AUD`, sheetFormulaForTicker(`${code}AUD`), "AUD", "", ""].join("\t"));
  }
  return rows.join("\n");
}

// Which cached quotes are too old to trust as current. Shown with a stale badge
// rather than dropped: yesterday's price is still far better than none.
function markStaleQuotes(quotes, options = {}) {
  const now = Number(options.now) || Date.now();
  const maxAgeMs = Math.max(1, Number(options.maxAgeMinutes) || 60) * 60 * 1000;
  const out = {};
  for (const [ticker, quote] of Object.entries(quotes || {})) {
    const fetched = Date.parse(quote?.fetchedAt || "");
    out[ticker] = { ...quote, stale: quote?.source !== "manual" && (!Number.isFinite(fetched) || now - fetched > maxAgeMs) };
  }
  return out;
}

// Exponential backoff after a refusal: 2, 4, 8 … minutes, capped at six hours.
function nextBackoff(previousFailures, now = Date.now()) {
  const failures = Math.max(1, Number(previousFailures) + 1 || 1);
  const minutes = Math.min(360, Math.pow(2, failures));
  return { failures, until: new Date(now + minutes * 60 * 1000).toISOString(), minutes };
}

// Net worth over time: account balances carried forward from each snapshot, plus
// the portfolio's value carried forward from each point in its series. Before
// either has a first point it counts as nothing, rather than stopping the line.
function mergeNetWorthSeries(balanceSeries, portfolioSeries) {
  const balances = (balanceSeries || []).slice().sort((left, right) => left.date.localeCompare(right.date));
  const shares = (portfolioSeries || []).slice().sort((left, right) => left.date.localeCompare(right.date));
  const dates = Array.from(new Set([...balances.map((point) => point.date), ...shares.map((point) => point.date)])).sort();
  let cash = 0;
  let held = 0;
  let b = 0;
  let s = 0;
  return dates.map((date) => {
    while (b < balances.length && balances[b].date <= date) cash = balances[b++].total;
    while (s < shares.length && shares[s].date <= date) held = shares[s++].valueAud;
    return { date, value: roundCurrencyAmount(cash + held) };
  });
}

module.exports = {
  RECURRING_CADENCES,
  RECURRING_REGISTRY_COLUMNS,
  RECURRING_REGISTRY_HEADER_ROW,
  RECURRING_REGISTRY_SEPARATOR_ROW,
  parseRecurringRegistry,
  parseBillDefinition,
  normalizeTicker,
  tickerKey,
  tickerMarket,
  parseTradesTable,
  YAHOO_HOSTS,
  YAHOO_USER_AGENT,
  YAHOO_TIMEOUT_MS,
  yahooChartPath,
  yahooSearchPath,
  yahooCurrency,
  yahooQuoteUrl,
  parseWatchlist,
  dividendTag,
  sliceHistory,
  priceChangeOver,
  findUnloggedDividends,
  parsePriceOverrides,
  heldTwelveMonths,
  buildHoldings,
  valuePortfolio,
  summarizeDividends,
  unitsHeldOn,
  buildPortfolioValueSeries,
  computeXirr,
  parseYahooChart,
  parseYahooSearch,
  parseSheetPrices,
  sheetFormulaForTicker,
  buildPriceSheetTemplate,
  markStaleQuotes,
  nextBackoff,
  planBillsFromLegacy,
  parseBillDueRule,
  serializeBillDueRule,
  normalizeBillId,
  billDueAfter,
  resolveBillCycleAnchor,
  billDriftTolerance,
  computeBillState,
  buildBillsView,
  buildBillMatcher,
  suggestBillsFromEntries,
  findBillForPayment,
  clampDayOfMonth,
  nthWeekdayOfMonth,
  applyRecurringRegistry,
  buildTripReflection,
  computeRunway,
  normalizeRunwayMode,
  RUNWAY_LEGACY_KEYS,
  parseRunwayPeriod,
  runwayWindowEnd,
  buildRecurringSchedule,
  sumRecurringDueWithin,
  toCents,
  fromCents,
  buildGoalArchiveSummaryLines,
  addMonths,
  normalizeCadence,
  nextRecurringDate,
  detectRecurringPayments,
  parseGoalDefinition,
  computeSinkingFund,
  buildGoalPrompts,
  buildExchangeRateUrl,
  parseExchangeRateResponse,
  compareRunwayToBalance,
  slugifyName,
  deriveGoalKey,
  deriveTripTag,
  parseOwedChildLine,
  buildOwedChildLine,
  buildOwedSharesFromTokens,
  summarizeSplitBalances,
  entrySpendAmount,
  isSpendingEntry,
  buildBalanceSnapshotLine,
  summarizeBalanceSnapshots,
  mergeNetWorthSeries,
  computeForecastInputs,
  buildForecastProjection,
  runFinanceQuery,
  buildMonthlyIncomeExpense,
  buildCumulativeBalanceSeries,
  buildPeriodReviewLines,
  classifyIncomeEntries,
  summarizeIncomeAndSavings,
  isUncategorisedEntry,
  summarizeUncategorised,
  summarizeTopMerchants,
  largestTransactions,
  compareCategoryTotals,
  summarizeTripSpend,
  summarizeBillPayments,
  previousPeriodRange,
  nextPeriodRange,
  DASHBOARD_SECTIONS,
  resolveDashboardSections,
  formatDayMonthYear,
  describePeriodTitle,
  buildHierarchicalCategoryGroups,
  categoryBaseColor,
  categoryShadeColor,
  formatDailyNoteName,
  parseDailyNoteName,

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
  isCurrencyCode,
  parseBankCsv,
  parseCsvRows,
  parseFlexibleDate,
  normalizeMerchant,
  merchantRootKey,
  lookupMerchantKey,
  indexByMerchantRoot,
  suggestCategoryForMerchant,
  groupEntriesByMerchantRoot,
  cleanMerchantDisplay,
  transactionFingerprint,
  CAPTURE_METHODS,
  CAPTURE_METHOD_LABELS,
  captureMethodLabel,
  normalizeCaptureMethod,
  captureChannelKey,
  describeCaptureChannel,
  parseCaptureBatch,
  findDuplicateCapture,
  appendCaptureLedger,
  summarizeCaptureOverlap,
  buildGistRemainder,
  recomputeSpendingTotals,
  planNoteRewrite,
  buildLegacyTripTagTransform,
  buildCategoryTableRenameTransform,
  buildRecurringCleanupTransform,
  summarizeLegacyTripTags,
  findFinanceHeadingIndex,
  findTransactionLineIndex,
  computeBudgetPace,
  replaceTransactionBlock,
  removeTransactionBlock,
  canonicalizeFinanceTag,
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
  parseMarkdownTable,
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
