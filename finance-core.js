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

function parseTransactionLine(line, noteDate, filePath, options = {}, childLines = []) {
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
function parseQuickAddInput(text, knownCategories = []) {
  let working = ` ${String(text || "").trim()} `;

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
    owedTokens,
    splitCount,
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
    const name = rest.slice(1).join("/") || normalizeCategoryPath(entry.merchant || "") || "recurring";
    const key = `${cadence}/${name}`;
    const date = parseIsoDate(entry.date) || "";
    const amount = roundCurrencyAmount(entry.amount || 0);
    const current = items.get(key);
    if (!current) {
      items.set(key, {
        cadence,
        rawCadence,
        name,
        label: titleCaseSegment(name.split("/").pop()),
        merchant: normalizeWhitespace(entry.merchant || "") || titleCaseSegment(name.split("/").pop()),
        category,
        currency: entry.currency || "",
        lastAmount: amount,
        lastDate: date,
        count: 1,
      });
      continue;
    }
    current.count += 1;
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

  const rows = Array.from(items.values()).map((item) => {
    const spec = RECURRING_CADENCES[item.cadence];
    const nextDue = item.lastDate ? nextRecurringDate(item.lastDate, item.cadence) : null;
    const status = !nextDue
      ? "unknown"
      : nextDue < referenceDate
        ? "overdue"
        : nextDue === referenceDate
          ? "due"
          : "upcoming";
    return {
      ...item,
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

// Sinking-fund maths for recurring bills: how much of each bill has "accrued"
// since it was last paid (money that should already be set aside), what is due
// within the next 30 days, and the steady per-week/per-month set-aside that
// keeps every cadence covered.
function computeRecurringReserve(recurring, referenceDate) {
  const today = parseIsoDate(referenceDate) || todayIsoLocal();
  const horizon = addDays(today, 30);
  const rows = [];
  let accruedTotal = 0;
  let perYearTotal = 0;
  let dueSoonTotal = 0;

  for (const item of recurring?.items || []) {
    const spec = RECURRING_CADENCES[item.cadence];
    if (!spec || !item.lastDate || !(item.lastAmount > 0) || item.active === false) continue;
    const cycleDays = spec.days || Math.round(30.44 * spec.months);
    const perYear = item.lastAmount * spec.perMonth * 12;
    const daysSinceLast = Math.max(0, daysBetweenInclusive(item.lastDate, today) - 1);
    const accrued = roundCurrencyAmount(Math.min(daysSinceLast / cycleDays, 1) * item.lastAmount);

    let dueSoon = 0;
    let due = item.nextDue;
    for (let guard = 0; due && due <= horizon && guard < 32; guard += 1) {
      dueSoon += item.lastAmount;
      due = nextRecurringDate(due, item.cadence);
    }
    dueSoon = roundCurrencyAmount(dueSoon);

    accruedTotal += accrued;
    perYearTotal += perYear;
    dueSoonTotal += dueSoon;
    rows.push({
      accrued,
      cadence: item.cadence,
      dueSoon,
      label: item.label,
      name: item.name,
      perWeek: roundCurrencyAmount(perYear / 52),
    });
  }

  rows.sort((left, right) => right.accrued - left.accrued);
  return {
    rows,
    totals: {
      accrued: roundCurrencyAmount(accruedTotal),
      dueNext30Days: roundCurrencyAmount(dueSoonTotal),
      perMonth: roundCurrencyAmount(perYearTotal / 12),
      perWeek: roundCurrencyAmount(perYearTotal / 52),
    },
  };
}

// The recurring registry is a hand-editable markdown table (in the recurring
// payments note) that holds per-item state the tags cannot: whether a bill is
// still current (Active), whether it may be auto-logged (Auto-log), and an
// optional amount override. Blank cells keep the defaults, so an absent table
// changes nothing.
function parseRecurringRegistry(content) {
  const registry = new Map();
  for (const rows of parseMarkdownTable(content)) {
    for (const row of rows) {
      const name = normalizeCategoryPath(row.item || row.name || "");
      if (!name || !("active" in row || "auto-log" in row || "autolog" in row || "current" in row)) continue;
      const activeRaw = String(row.active ?? row.current ?? "").trim();
      const autoRaw = String(row["auto-log"] ?? row.autolog ?? row.auto ?? "").trim();
      const amount = parseNumber(row.amount);
      const nextAmount = parseNumber(row["next amount"] ?? row.nextamount);
      const changeDate = parseIsoDate(row["change date"] ?? row.changedate ?? "");
      registry.set(name, {
        active: activeRaw ? !/^(?:no|false|0|inactive|paused)$/i.test(activeRaw) : true,
        autoLog: autoRaw ? /^(?:yes|true|1|on)$/i.test(autoRaw) : null,
        amount: Number.isFinite(amount) && amount > 0 ? roundCurrencyAmount(amount) : null,
        nextAmount: Number.isFinite(nextAmount) && nextAmount > 0 ? roundCurrencyAmount(nextAmount) : null,
        changeDate: changeDate || null,
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
function applyRecurringRegistry(recurring, registry, referenceDate = todayIsoLocal()) {
  const items = (recurring?.items || []).map((item) => {
    const entry = registry?.get(item.name) || registry?.get(item.name.split("/").pop());
    const active = entry ? entry.active !== false : true;
    const autoLog = entry && entry.autoLog !== null && entry.autoLog !== undefined ? entry.autoLog : true;
    const overrideAmount = entry?.amount > 0 ? entry.amount : item.lastAmount;
    const changePending = entry?.nextAmount > 0 && entry?.changeDate && entry.changeDate > referenceDate;
    const changeApplied = entry?.nextAmount > 0 && entry?.changeDate && entry.changeDate <= referenceDate;
    const lastAmount = changeApplied ? entry.nextAmount : overrideAmount;
    const spec = RECURRING_CADENCES[item.cadence];
    return {
      ...item,
      active,
      autoLog,
      lastAmount,
      nextAmount: changePending ? entry.nextAmount : null,
      changeDate: changePending ? entry.changeDate : null,
      monthlyCost: spec ? roundCurrencyAmount(lastAmount * spec.perMonth) : item.monthlyCost,
      yearlyCost: spec ? roundCurrencyAmount(lastAmount * spec.perMonth * 12) : item.yearlyCost,
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
  return {
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
  }

  return { currentSaved, daysLeft, expectedByNow, remaining, requiredPerWeek, status, targetAmount, weeksLeft };
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
  const startBalance = roundCurrencyAmount(input.startBalance || 0);
  const monthlyNet = roundCurrencyAmount(
    Number(input.monthlyIncome || 0) -
    Number(input.monthlyBills || 0) -
    Number(input.monthlyDiscretionary || 0) -
    Number(input.monthlyGoalSetAside || 0)
  );

  const points = [{ date: referenceDate, balance: startBalance }];
  for (let index = 1; index <= months; index += 1) {
    points.push({
      date: addMonths(referenceDate, index),
      balance: roundCurrencyAmount(startBalance + monthlyNet * index),
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
  const period = options.period === "quarter" ? "quarter" : "year";
  const currency = options.currency || "AUD";
  const range = toPeriodRange({ period, referenceDate: options.referenceDate });
  const goalKeys = new Set((options.goalKeys || []).map((key) => normalizeCategoryPath(key)).filter(Boolean));
  const inRange = (entries || []).filter((entry) => isDateInRange(entry.date, range));

  const spendEntries = inRange.filter((entry) => isSpendingEntry(entry));
  const totalSpend = roundCurrencyAmount(spendEntries.reduce((sum, entry) => sum + entrySpendAmount(entry), 0));

  const incomeEntries = inRange.filter((entry) => entry.entryType === "income");
  const contributions = incomeEntries.filter((entry) => goalKeys.has(entry.goalKey));
  const settleUps = incomeEntries.filter(
    (entry) => !goalKeys.has(entry.goalKey) && normalizeCategoryPath(entry.category || "").startsWith("settleup/")
  );
  const regularIncome = incomeEntries.filter((entry) => !goalKeys.has(entry.goalKey) && !settleUps.includes(entry));
  const withdrawals = inRange.filter((entry) => entry.entryType === "goal-withdrawal");

  const totalIncome = roundCurrencyAmount(regularIncome.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const contributedTotal = roundCurrencyAmount(contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const withdrawnTotal = roundCurrencyAmount(withdrawals.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const settledTotal = roundCurrencyAmount(settleUps.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));

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
  const maxLightness = Math.min(74, base.lightness + 22);
  const minLightness = Math.max(22, base.lightness - 22);
  if (siblingCount <= 1) return `hsl(${base.hue}, ${base.saturation}%, ${maxLightness}%)`;
  const ratio = childIndex / (siblingCount - 1);
  const lightness = Math.round(maxLightness - ratio * (maxLightness - minLightness));
  return `hsl(${base.hue}, ${base.saturation}%, ${lightness}%)`;
}

// Groups entries into ranked major groups with nested subgroups, assigning the
// hue-family colours. Majors are ranked by group total; subgroups sit beneath
// their parent, largest first. `slices` is the flattened leaf list for pies.
function buildHierarchicalCategoryGroups(entries, groupBy = "primary") {
  const useFull = String(groupBy || "primary").toLowerCase() === "full";
  const majors = new Map();

  for (const entry of entries || []) {
    const full = normalizeCategoryPath(entry.category || "uncategorized") || "uncategorized";
    const major = full.split("/")[0];
    const amount = entrySpendAmount(entry);
    const majorGroup = majors.get(major) || { key: major, label: titleCaseSegment(major), total: 0, count: 0, children: new Map() };
    majorGroup.total = roundCurrencyAmount(majorGroup.total + amount);
    majorGroup.count += 1;
    const childKey = useFull ? full : major;
    const child = majorGroup.children.get(childKey) || { key: childKey, label: displayCategoryPath(childKey), total: 0, count: 0 };
    child.total = roundCurrencyAmount(child.total + amount);
    child.count += 1;
    majorGroup.children.set(childKey, child);
    majors.set(major, majorGroup);
  }

  const ranked = Array.from(majors.values()).sort((left, right) => right.total - left.total);
  const slices = [];
  const groups = ranked.map((major, majorIndex) => {
    const base = categoryBaseColor(majorIndex);
    const color = categoryShadeColor(base, 0);
    const sortedChildren = Array.from(major.children.values()).sort((left, right) => right.total - left.total);
    const children = sortedChildren.map((child, childIndex) => ({
      ...child,
      color: categoryShadeColor(base, childIndex, sortedChildren.length),
      parent: major.key,
    }));
    for (const child of children) slices.push(child);
    return { ...major, children, color };
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

module.exports = {
  parseRecurringRegistry,
  applyRecurringRegistry,
  buildTripReflection,
  computeRecurringReserve,
  buildGoalArchiveSummaryLines,
  addMonths,
  normalizeCadence,
  nextRecurringDate,
  detectRecurringPayments,
  parseGoalDefinition,
  computeSinkingFund,
  parseOwedChildLine,
  buildOwedChildLine,
  buildOwedSharesFromTokens,
  summarizeSplitBalances,
  entrySpendAmount,
  isSpendingEntry,
  buildBalanceSnapshotLine,
  summarizeBalanceSnapshots,
  computeForecastInputs,
  buildForecastProjection,
  runFinanceQuery,
  buildMonthlyIncomeExpense,
  buildCumulativeBalanceSeries,
  buildPeriodReviewLines,
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
