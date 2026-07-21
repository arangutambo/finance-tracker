"use strict";

const { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } = require("obsidian");
const PERIOD_ORDER = ["day", "week", "fortnight", "month", "bimonth", "quarter", "year"];

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
    const normalizedHolidayKey = normalizeHolidayKey(holidayKey);
    return normalizedHolidayKey
      ? `#log/spending/${normalizedHolidayKey}/${normalizedCategory}`
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

  function extractChildLines(lines, startIndex) {
    const parentIndent = (String(lines[startIndex] || "").match(/^\s*/) || [""])[0].length;
    const childLines = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = String(lines[index] || "");
      if (!line.trim()) continue;
      const childIndent = (line.match(/^\s*/) || [""])[0].length;
      if (/^\s*-\s/.test(line) && childIndent > parentIndent) {
        childLines.push(line.replace(/^\s*-\s*/, "").trim());
        continue;
      }
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
      holidayYear: holidayContext.holidayYear,
      merchant,
      name: merchant,
      note,
      plannedDetailLines: plannedLogMeta.detailLines,
      plannedDetailLinks: plannedLogMeta.detailLinks,
      plannedEndDate: plannedLogMeta.endDate || plannedLineDates.endDate,
      plannedStartDate: plannedLogMeta.startDate || plannedLineDates.startDate,
      myShare: roundCurrencyAmount(Math.max(roundedAmount - owedTotal, 0)),
      originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
      originalCurrency: originalSide ? originalDescriptor.currency : "",
      originalRateKey: originalSide ? originalDescriptor.rateKey : "",
      owed,
      owedTotal,
      rawLine: text,
      source: "",
      card: "",
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
    const savingsDisplayMode = String(definition?.savingsDisplayMode || "standard").toLowerCase();
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
      contributions.filter((entry) => isDateInRange(entry.date, range)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
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
      const remaining = working.split(/\s+/).filter(Boolean);
      const index = remaining.findIndex((token) => map.has(normalizeCategoryPath(token)));
      if (index >= 0) {
        category = map.get(normalizeCategoryPath(remaining[index]));
        remaining.splice(index, 1);
        working = ` ${remaining.join(" ")} `;
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

  function transactionFingerprint(entry) {
    const data = entry || {};
    const date = parseIsoDate(data.date) || "";
    const amount = Number(Number(data.amount || 0).toFixed(2)).toFixed(2);
    return `${date}|${amount}|${normalizeMerchant(data.merchant || data.name || "")}`;
  }

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
  return {
    addMonths,
    parseRecurringRegistry,
    applyRecurringRegistry,
    buildTripReflection,
    computeRecurringReserve,
    buildGoalArchiveSummaryLines,
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
    buildHierarchicalCategoryGroups,
    categoryBaseColor,
    categoryShadeColor,
    formatDailyNoteName,
    parseDailyNoteName,
    addDays,
    recomputeSpendingTotals,
    computeBudgetPace,
    replaceTransactionBlock,
    removeTransactionBlock,
    canonicalizeFinanceTag,
    buildCategoryTag,
    buildAllocatedExpenseSummary,
    buildCsv,
    buildIncomeTag,
    buildInboxLine,
    parseInboxLine,
    parseQuickAddInput,
    parseBankCsv,
    parseCsvRows,
    parseFlexibleDate,
    normalizeMerchant,
    transactionFingerprint,
    canRollBudgetPeriodIntoSection,
    calculateSpendingSectionTotal,
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
    buildPlannedExpenseSummary,
    getRemainingTripDaysInclusive,
    getDailyBudgetSectionPeriods,
    insertTransactionIntoDailyNote,
    isDateInRange,
    isPlannedExpenseEntry,
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
    periodLengthDays,
    primaryCategory,
    roundCurrencyAmount,
    scaleBudgetLimit,
    splitHolidayEntries,
    summarizeGoalProgress,
    toPeriodRange,
    todayIsoLocal,
    titleCaseSegment,
  };
})();

// [self-write guard] Tracks paths the plugin is currently writing so its own
// vault.on("modify"/"create") handlers don't re-fire on them — prevents the
// write -> modify-event -> write feedback loops (100% CPU freezes).
const _ftSelfWrites = new Set();
function _ftModify(app, file, data) {
  if (file && file.path) {
    _ftSelfWrites.add(file.path);
    setTimeout(() => _ftSelfWrites.delete(file.path), 1500);
  }
  return app.vault.modify(file, data);
}
function _ftCreate(app, path, data) {
  const p = typeof path === "string" ? path : path && path.path;
  if (p) {
    _ftSelfWrites.add(p);
    setTimeout(() => _ftSelfWrites.delete(p), 1500);
  }
  return app.vault.create(path, data);
}

const DEFAULT_SETTINGS = {
  dailyNotesFolder: "Journal/Periodics/1. Daily",
  spendingHeading: "## Finance",
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
  captureInboxFolder: "Utility/Finance/Inbox",
  merchantMapPath: "Utility/Finance/Merchant Map.md",
  merchantMap: {},
  autoDrainInbox: true,
  processedExternalIds: [],
  recurringTagPrefix: "subscriptions",
  recurringNoteName: "🔁 Recurring Payments.md",
  excludedRecurringItems: [],
  autoLogRecurring: false,
  quickAddUseNoteDate: false,
  tripModeActive: false,
  activeTripGoalPath: "",
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const HOLIDAY_DASHBOARD_BLOCK = "holiday-dashboard";
const SAVINGS_DASHBOARD_BLOCK = "savings-dashboard";
const RECURRING_BLOCK = "finance-recurring";
const SPLITS_BLOCK = "finance-splits";
const FORECAST_BLOCK = "finance-forecast";
const NETWORTH_BLOCK = "networth-dashboard";
const QUERY_BLOCK = "finance-query";
const GOALS_BLOCK = "finance-goals";
const DAILY_BUDGET_VIEW = "finance-tracker-daily";
const RECURRING_CADENCE_LABELS = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

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
      .reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0)
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

function serializeFlatExchangeRates(rates) {
  return Object.entries(rates || {})
    .filter(([, rate]) => Number.isFinite(Number(rate)) && Number(rate) > 0)
    .map(([rateKey, rate]) => `${rateKey.replace(/_CASH$/i, " CASH")}=${Number(rate)}`)
    .join(", ");
}

function serializeExchangeRatePeriods(periods) {
  return (periods || [])
    .filter((period) => period?.start && period?.end)
    .map((period) => `${period.start}..${period.end}:${serializeFlatExchangeRates(period.rates || {})}`)
    .filter(Boolean)
    .join("; ");
}

function updateFrontmatterValue(content, key, value) {
  const text = String(content || "");
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return text;
  const lines = frontmatterMatch[1].split("\n");
  const normalizedKey = String(key || "").trim().toLowerCase();
  let updated = false;
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match || match[1].toLowerCase() !== normalizedKey) return line;
    updated = true;
    return `${match[1]}: ${value}`;
  });
  if (!updated) {
    nextLines.push(`${key}: ${value}`);
  }
  return text.replace(frontmatterMatch[0], `---\n${nextLines.join("\n")}\n---`);
}

const DEFAULT_HOLIDAY_PLANNED_EXPENSES = [
  { item: "Flights", category: "flights" },
  { item: "Accommodation", category: "accommodation" },
  { item: "Recreation", category: "recreation" },
];

const DEFAULT_HOLIDAY_ALLOCATED_EXPENSES = [
  { item: "Transport", category: "transport" },
  { item: "Shopping", category: "shopping" },
  { item: "Food", category: "food" },
];

function buildGoalKeyFromName(name) {
  return core.normalizeCategoryPath(String(name || "")) || "savings-goal";
}

function stripBudgetSuffix(value) {
  return String(value || "").replace(/\s+budget$/i, "").trim();
}

function appendBudgetSuffix(value) {
  const base = stripBudgetSuffix(value) || "Holiday";
  return `${base} Budget`;
}

function parseTableDateValue(value) {
  return core.parseIsoDate(value || "");
}

function parseTableLinkValue(value) {
  return String(value || "").trim();
}

function parseWikiLinks(text) {
  const matches = Array.from(String(text || "").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g));
  return matches.map((match) => ({
    path: String(match[1] || "").trim(),
    label: String(match[2] || match[1] || "").trim(),
    raw: match[0],
  })).filter((link) => link.path);
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

    for (const link of parseWikiLinks(line)) {
      detailLinks.push(link);
    }

    const dates = Array.from(line.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => core.parseIsoDate(match[0])).filter(Boolean);
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

  if (startDate && !endDate) {
    endDate = startDate;
  }
  if (endDate && !startDate) {
    startDate = endDate;
  }

  return {
    detailLines,
    detailLinks,
    endDate,
    startDate,
  };
}

function extractPlannedLineDates(line = "") {
  const dates = Array.from(String(line || "").matchAll(/\b\d{4}-\d{2}-\d{2}\b/g))
    .map((match) => core.parseIsoDate(match[0]))
    .filter(Boolean);
  if (!dates.length) {
    return { startDate: "", endDate: "" };
  }
  return {
    endDate: dates[1] || dates[0],
    startDate: dates[0],
  };
}

// Compact money label for tight layouts: whole dollars lose the ".00".
function formatCurrencyShort(amount, currency) {
  return core.formatCurrency(amount, currency).replace(/\.00(?=\D|$)/, "");
}

// Reduces a possibly-templated folder path ("Journal/Daily/{{date:YYYY}}") to
// its static prefix ("Journal/Daily"). Returns "" when nothing static remains.
function stripFolderTemplate(value) {
  return String(value || "")
    .split("{{")[0]
    .replace(/\/+$/, "")
    .trim();
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

// Ring segment between two radii, for the outer subcategory ring of the donut.
function describeAnnularSlice(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  const span = Math.min(endAngle - startAngle, 359.9);
  const cappedEnd = startAngle + span;
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, cappedEnd);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, cappedEnd);
  const largeArcFlag = span <= 180 ? "0" : "1";
  return [
    "M", outerStart.x, outerStart.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, outerEnd.x, outerEnd.y,
    "L", innerStart.x, innerStart.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerEnd.x, innerEnd.y,
    "Z",
  ].join(" ");
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

    this.addCommand({
      id: "finance-tracker-add-exchange-rate",
      name: "Add holiday exchange rate",
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

    this.registerView(DAILY_BUDGET_VIEW, (leaf) => new DailyBudgetView(leaf, this));

    this.addRibbonIcon("coins", "Daily budget", () => this.activateDailyBudgetView());
    this.addRibbonIcon("circle-plus", "Quick add transaction", () => new QuickAddTransactionModal(this.app, this).open());

    this._statusBarItem = this.addStatusBarItem();
    this._statusBarItem.addClass("finance-status-bar");
    this._statusBarItem.setText("💸 …");
    this._statusBarItem.addEventListener("click", () => new QuickAddTransactionModal(this.app, this).open());

    this.addCommand({
      id: "finance-tracker-open-daily-budget",
      name: "Open daily budget",
      callback: () => this.activateDailyBudgetView(),
    });

    this.addCommand({
      id: "finance-tracker-quick-add",
      name: "Quick add transaction",
      callback: () => new QuickAddTransactionModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-drain-inbox",
      name: "Drain capture inbox now",
      callback: () => this.drainCaptureInbox({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-reconcile-csv",
      name: "Reconcile bank/Wise CSV against logged spending",
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
      name: "Archive finished holidays",
      callback: () => this.archiveFinishedHolidays({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-archive-completed-goals",
      name: "Archive completed savings goals",
      callback: () => this.archiveCompletedGoals({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-contribute-goal",
      name: "Contribute to savings goal",
      callback: () => new ContributeGoalModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-open-recurring-note",
      name: "Open recurring payments note",
      callback: () => this.openRecurringNote(),
    });

    this.addCommand({
      id: "finance-tracker-setup",
      name: "Run first-time setup",
      callback: () => new SetupWizardModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-snapshot-balances",
      name: "Snapshot balances",
      callback: () => new BalanceSnapshotModal(this.app, this).open(),
    });

    const insertableBlocks = [
      ["recurring", RECURRING_BLOCK, "Insert recurring payments block", ""],
      ["splits", SPLITS_BLOCK, "Insert split expenses block", ""],
      ["forecast", FORECAST_BLOCK, "Insert forecast block", "months: 6"],
      ["networth", NETWORTH_BLOCK, "Insert net worth block", ""],
      ["query", QUERY_BLOCK, "Insert finance query block", "period: month\ngroup: category\nview: table"],
      ["goals", GOALS_BLOCK, "Insert goals block", ""],
    ];
    for (const [slug, block, name, body] of insertableBlocks) {
      this.addCommand({
        id: `finance-tracker-insert-${slug}`,
        name,
        editorCallback: (editor) => {
          editor.replaceSelection(`\`\`\`${block}\n${body ? `${body}\n` : ""}\`\`\`\n`);
        },
      });
    }

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

    // [hotfix 2026-06-12] DISABLED: journal-calendar spend-badge decoration caused an
    // infinite MutationObserver <-> journals(Vue) re-render loop = 100% CPU freeze.
    // Re-enable only after a source fix (disconnect observer during decoration + diff-before-mutate).
    // this.setupJournalCalendarIntegration();
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
    clearTimeout(this._calendarDecorationTimer);
    clearTimeout(this._inboxDrainTimer);
    clearTimeout(this._statusBarTimer);
    if (this._journalCalendarObservers) {
      for (const observer of this._journalCalendarObservers.values()) {
        observer.disconnect();
      }
      this._journalCalendarObservers.clear();
    }
  }

  setupJournalCalendarIntegration() {
    this._journalCalendarObservers = new Map();
    this._calendarDecorationTimer = null;

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this._scheduleCalendarDecoration())
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        const prefix = normalizePath(this.settings.dailyNotesFolder + "/");
        if (file.path.startsWith(prefix)) {
          this._scheduleCalendarDecoration();
        }
      })
    );

    this._scheduleCalendarDecoration();
  }

  _scheduleCalendarDecoration() {
    clearTimeout(this._calendarDecorationTimer);
    this._calendarDecorationTimer = setTimeout(() => this.decorateJournalCalendar(), 400);
  }

  async decorateJournalCalendar() {
    this._decorating = true;
    try {
      const leaves = this.app.workspace.getLeavesOfType("journal-calendar");
      for (const leaf of leaves) {
        const containerEl = leaf.view?.containerEl;
        if (!containerEl) continue;
        await this.decorateJournalCalendarLeaf(containerEl);
        this._watchJournalCalendarGrid(containerEl);
      }
    } finally {
      setTimeout(() => { this._decorating = false; }, 50);
    }
  }

  _watchJournalCalendarGrid(containerEl) {
    if (!this._journalCalendarObservers || this._journalCalendarObservers.has(containerEl)) return;
    const grid = containerEl.querySelector(".calendar-grid");
    if (!grid) return;
    const observer = new MutationObserver((mutations) => {
      const hasExternalChange = mutations.some((m) =>
        Array.from(m.addedNodes).some((n) => n.nodeType === 1 && !n.classList?.contains("finance-tracker-spend-badge")) ||
        Array.from(m.removedNodes).some((n) => n.nodeType === 1 && !n.classList?.contains("finance-tracker-spend-badge"))
      );
      if (hasExternalChange && !this._decorating) this._scheduleCalendarDecoration();
    });
    observer.observe(grid, { childList: true, subtree: false });
    this._journalCalendarObservers.set(containerEl, observer);
  }

  async decorateJournalCalendarLeaf(containerEl) {
    const grid = containerEl.querySelector(".calendar-grid");
    if (!grid) return;

    const monthHeader = containerEl.querySelector(".month-header");
    if (!monthHeader) return;

    const headerButtons = Array.from(monthHeader.querySelectorAll("button.calendar-button"));
    const monthText = headerButtons[0]?.textContent?.trim();
    const yearText = headerButtons[1]?.textContent?.trim();
    if (!monthText || !yearText) return;

    const year = parseInt(yearText, 10);
    const monthIndex = new Date(`${monthText} 1 2000`).getMonth();
    if (isNaN(year) || isNaN(monthIndex)) return;

    const month = monthIndex + 1;
    const monthStr = String(month).padStart(2, "0");
    const start = `${year}-${monthStr}-01`;
    const end = `${year}-${monthStr}-31`;

    const entries = await this.collectTransactionsForRange({ start, end });
    const spendByDate = new Map();
    for (const entry of entries) {
      if (!core.isSpendingEntry(entry)) continue;
      const iso = String(entry.date || "");
      if (iso) spendByDate.set(iso, (spendByDate.get(iso) || 0) + core.entrySpendAmount(entry));
    }

    const dayCells = grid.querySelectorAll("button.calendar-button:not([data-outside]):not(.week-number)");
    for (const cell of dayCells) {
      cell.querySelector(".finance-tracker-spend-badge")?.remove();

      let iso = null;
      try {
        const vueInstance = cell.__vueParentComponent?.parent;
        const dateProp = vueInstance?.props?.date;
        if (dateProp && /^\d{4}-\d{2}-\d{2}$/.test(dateProp)) iso = dateProp;
      } catch (_) {}

      if (!iso) {
        const daySpan = cell.querySelector(".decoration-content span");
        const day = parseInt((daySpan || cell).textContent?.trim(), 10);
        if (!day || day > 31) continue;
        iso = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
      }

      const totalSpend = spendByDate.get(iso);
      if (!totalSpend) continue;

      const dollars = Math.round(totalSpend);
      const label = dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${dollars}`;
      const decoration = cell.querySelector(".calendar-decoration");
      const badge = document.createElement("span");
      badge.className = "finance-tracker-spend-badge";
      badge.textContent = label;
      (decoration || cell).appendChild(badge);
    }
  }

  async loadSettings() {
    const stored = await this.loadData();
    this._freshInstall = stored == null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    if (!this.settings.spendingHeading || this.settings.spendingHeading === "## Spending") {
      this.settings.spendingHeading = DEFAULT_SETTINGS.spendingHeading;
    }
    this.settings.categoryOptions = normalizeCategoryOptions(this.settings.categoryOptions || DEFAULT_SETTINGS.categoryOptions);
    // Auto-detect the daily-note folder and date format from the Journals
    // community plugin or the core Daily notes plugin, falling back to the
    // manual setting when neither is configured.
    this._dailyNoteFormat = "YYYY-MM-DD";
    // Heal a templated folder that 0.2.0 could persist verbatim from the
    // Journals config (e.g. "Journal/Daily/{{date:YYYY}}/{{date:MM}}").
    if (String(this.settings.dailyNotesFolder || "").includes("{{")) {
      this.settings.dailyNotesFolder = stripFolderTemplate(this.settings.dailyNotesFolder) || DEFAULT_SETTINGS.dailyNotesFolder;
    }
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
    this.settings.budgetsFolderPath = this.settings.budgetsFolderPath || DEFAULT_SETTINGS.budgetsFolderPath;
    this.settings.budgetArchiveFolderPath = this.settings.budgetArchiveFolderPath || DEFAULT_SETTINGS.budgetArchiveFolderPath;
    this.settings.defaultBudgetNoteName = this.settings.defaultBudgetNoteName || DEFAULT_SETTINGS.defaultBudgetNoteName;
    if (this.settings.defaultBudgetNoteName === "Budget.md") {
      this.settings.defaultBudgetNoteName = DEFAULT_SETTINGS.defaultBudgetNoteName;
    }
    this.settings.activeHolidayBudgetPath = this.settings.activeHolidayBudgetPath || "";
    this.settings.merchantMap = this.settings.merchantMap || {};
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
        return { folder, format: String(journal.dateFormat || "YYYY-MM-DD").trim() };
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

  async handleCapture(params) {
    try {
      const expense = this.parseCaptureParams(params);
      const result = await this.handleCaptureExpense(expense, { notify: true });
      if (result.skipped) {
        new Notice(`Finance: skipped duplicate capture (${expense.externalId})`);
      }
    } catch (error) {
      new Notice(`Finance capture failed: ${error.message}`);
    }
  }

  // Single write path shared by the URL handler, the inbox drainer, and the
  // quick-add modal. Applies merchant->category guessing, holiday context, and
  // external-id de-duplication, then inserts into the routed daily note.
  async handleCaptureExpense(expenseInput, options = {}) {
    let expense = { ...expenseInput };

    if (expense.externalId && this.isExternalIdProcessed(expense.externalId)) {
      return { skipped: true, reason: "duplicate", expense };
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
        : await this.ensureTextFile(notePath, () => this.buildMinimalDailyNote(expense.date));

    const currentContent = await this.app.vault.cachedRead(file);
    const nextContent = core.insertTransactionIntoDailyNote(currentContent, expense, this.settings);
    await _ftModify(this.app,file, nextContent);

    if (expense.externalId) {
      await this.markExternalIdProcessed(expense.externalId);
    }
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();

    const shouldOpen = options.openNote ?? this.settings.openDailyNoteAfterCapture;
    if (shouldOpen) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }

    if (options.notify) {
      new Notice(`Logged ${core.formatCurrency(expense.amount, expense.currency)} to ${expense.date}`);
    }

    return { skipped: false, file, expense };
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

  // One-time upgrade from the old markdown-file merchant map: reads whatever
  // is there, folds it into settings, and removes the now-redundant file.
  async migrateMerchantMapFile() {
    if (this.settings.merchantMap && Object.keys(this.settings.merchantMap).length) return;
    const path = normalizePath(this.settings.merchantMapPath || "");
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.cachedRead(file);
    const migrated = {};
    for (const rows of core.parseMarkdownTable(content)) {
      for (const row of rows) {
        const merchant = core.normalizeMerchant(row.merchant || row.payee || row.name || "");
        const category = core.normalizeCategoryPath(row.category || row.cat || "");
        if (merchant && category) migrated[merchant] = category;
      }
    }
    if (Object.keys(migrated).length) {
      this.settings.merchantMap = migrated;
      await this.saveSettings();
    }
    await this.app.vault.delete(file);
  }

  async guessCategoryForMerchant(merchant) {
    const key = core.normalizeMerchant(merchant);
    if (!key) return "";
    const map = await this.loadMerchantMap();
    return map.get(key) || "";
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

    // Recurring-bill categories (subscriptions/...) are managed from the
    // recurring payments note, not picked ad hoc — keep them out of quick-add
    // and edit-transaction category suggestions.
    const recurringPrefix = `${this.settings.recurringTagPrefix || "subscriptions"}/`;
    return {
      categories: Array.from(categoryCounts.entries())
        .filter(([path]) => !path.startsWith(recurringPrefix))
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
    const next = core.replaceTransactionBlock(content, entry.rawLine, newExpense, this.settings);
    if (next == null) throw new Error("Could not locate that entry (the note may have changed).");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  async deleteTransactionEntry(entry) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) throw new Error("Could not find the note for this entry.");
    const content = await this.app.vault.cachedRead(file);
    const next = core.removeTransactionBlock(content, entry.rawLine, this.settings);
    if (next == null) throw new Error("Could not locate that entry in the note.");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  async rememberMerchantCategory(merchant, category) {
    const cleanMerchant = core.normalizeMerchant(merchant);
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!cleanMerchant || !cleanCategory) return;
    if (this.settings.merchantMap?.[cleanMerchant] === cleanCategory) return;
    this.settings.merchantMap = { ...this.settings.merchantMap, [cleanMerchant]: cleanCategory };
    await this.saveSettings();
  }

  async forgetMerchantCategory(merchant) {
    if (!this.settings.merchantMap || !(merchant in this.settings.merchantMap)) return;
    const next = { ...this.settings.merchantMap };
    delete next[merchant];
    this.settings.merchantMap = next;
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
        const result = await this.handleCaptureExpense(expense, { notify: false });
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

  _scheduleInboxDrain() {
    if (!this.settings.autoDrainInbox) return;
    clearTimeout(this._inboxDrainTimer);
    this._inboxDrainTimer = setTimeout(() => {
      this.drainCaptureInbox({ notify: true }).catch((error) =>
        console.warn("[finance-tracker] inbox drain failed", error)
      );
    }, 1500);
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

  async reconcileDailyNoteTotal(target) {
    const file = target instanceof TFile ? target : this.app.vault.getAbstractFileByPath(target?.path || "");
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.cachedRead(file);
    const next = core.recomputeSpendingTotals(content, this.settings);
    if (next !== content) {
      await _ftModify(this.app,file, next);
    }
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
        const startDate = parseTableDateValue(row.start || row.start_date || row["start date"] || "");
        const endDate = parseTableDateValue(row.end || row.end_date || row["end date"] || "");
        const link = parseTableLinkValue(row.link || row.note || row.location || "");
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
    return {
      activeSavingsGoal: goal.active,
      archivedDate: goal.archivedDate || "",
      carryMissedSavings: goal.carryMissedSavings,
      currency: goal.currency,
      dueDate: goal.dueDate,
      filePath,
      goalKey: goal.goalKey || buildGoalKeyFromName(goal.goalName || filePath),
      goalName: goal.goalName,
      goalType: goal.goalType,
      savingsDisplayMode: goal.savingsDisplayMode,
      savingsProgressMode: goal.savingsProgressMode,
      startingBalance: goal.startingBalance,
      targetAmount: goal.targetAmount,
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
      "## Daily Holiday Dashboard",
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
      "`Booked` means reserved or committed. If Booked is above 0 it overrides Planned for your remaining holiday budget.",
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
    return stripBudgetSuffix(String(path || "").split("/").pop()?.replace(/\.md$/i, "")) || "Holiday";
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
      .filter((file) => file.path !== recurringNotePath);
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
      new Notice("No active holiday budget to archive.");
      return;
    }
    const archivePath = await this.archiveGoalNote(activeFile);
    new Notice(`Archived holiday budget to ${archivePath}`);
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
          : "No finished holidays to archive."
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
    return this.appendFinanceLines(item.nextDue || core.todayIsoLocal(), [
      `\t- ${core.formatCurrency(0, item.currency || this.settings.defaultCurrency)} ${item.tag}`,
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

  buildRecurringNoteContent() {
    const prefix = this.settings.recurringTagPrefix || "subscriptions";
    return [
      "# 🔁 Recurring payments",
      "",
      "Manage subscriptions and regular bills here. A payment becomes recurring the",
      `first time you log it with a cadence tag like \`#log/spending/${prefix}/monthly/spotify\``,
      "(cadences: `weekly`, `fortnightly`, `monthly`, `quarterly`, `yearly`).",
      "",
      "- **Log now** logs the bill dated on its due day, so the cadence never drifts.",
      "- **Skip cycle** logs a $0 entry on the due day — the schedule moves on, the amount is remembered.",
      "- A price change is just the next logged amount; the plugin always uses the latest —",
      "  or use **Edit** in manage mode to schedule a future change with an exact date.",
      "- Pausing a bill moves it into the **Archived** section below, collapsed until you open it;",
      "  from there you can **Resume** it or **Remove completely** so it's never tracked again.",
      "- **Bill reserve** below is the sinking fund for bills: what should already be set",
      "  aside so quarterly and yearly bills never surprise you, and the steady per-week amount that keeps it that way.",
      "",
      "```finance-recurring",
      "manage: true",
      "```",
      "",
      "## Registry",
      "",
      "Hand-editable per-bill state (the checkboxes in settings and the manage block",
      "write to this table): set **Active** to `no` to pause a cancelled bill,",
      "**Auto-log** to `yes` to log it automatically on its due day, fill",
      "**Amount** to override the inferred price, and fill **Next Amount** + **Change Date**",
      "to schedule a future price change — it's applied automatically once the date arrives.",
      "",
      "| Item | Cadence | Amount | Active | Auto-log | Next Amount | Change Date |",
      "| --- | --- | ---: | --- | --- | ---: | --- |",
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
      "**Select or create holiday**.",
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
      new Notice("Could not read that holiday budget note.");
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
      .filter((file) => file.path !== this.getDefaultBudgetNotePath());
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
      if (generic?.goalKey) {
        goals.push({ ...generic, file });
      }
    }
    return goals;
  }

  async buildSavingsGoalSummary(goalDefinition, referenceDate, options = {}) {
    const allEntries = await this.collectTransactionsForRange({
      period: "all",
      start: "1900-01-01",
      end: "2999-12-31",
    });
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
      const frontmatterDate = core.parseIsoDate(cache?.frontmatter?.date);
      if (frontmatterDate) return frontmatterDate;
      const pathDate = core.extractNoteDate("", sourceFile.path);
      if (pathDate) return pathDate;
    }
    return core.todayIsoLocal();
  }

  buildBudgetProgress(entries, budgets, range, groupBy, referenceDate, options = {}) {
    const useFull = String(groupBy || "primary").toLowerCase() === "full";
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
            if (useFull) {
              return entry.category === budget.category || String(entry.category || "").startsWith(`${budget.category}/`);
            }
            return core.primaryCategory(entry.category) === core.primaryCategory(budget.category);
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
    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
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

    for (const card of cardData) {
      const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
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
  renderPieChart(wrapper, hierarchy, currency, threshold = 0.08) {
    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: "Category proportions" });

    const total = hierarchy.groups.reduce((sum, group) => sum + group.total, 0);
    if (total <= 0) {
      pieSection.createDiv({ cls: "finance-tracker-empty", text: "No categorized spending found for this period." });
      return;
    }

    const hasSubcategories = hierarchy.groups.some((group) =>
      group.children.some((child) => child.key !== group.key)
    );
    const size = 460;
    const center = size / 2;
    const outerRadius = 180;
    const innerRadius = hasSubcategories ? 118 : outerRadius;
    const ringInner = 126;

    let angle = 0;
    const majorSlices = hierarchy.groups
      .filter((group) => group.total > 0)
      .map((group) => {
        const ratio = group.total / total;
        const startAngle = angle;
        angle += ratio * 360;
        return { ...group, ratio, startAngle, endAngle: angle };
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

    for (const slice of majorSlices) {
      let majorEl;
      if (slice.ratio >= 0.999) {
        majorEl = svg.createSvg("circle", {
          cls: "finance-tracker-pie-slice",
          attr: { cx: center, cy: center, r: innerRadius, fill: slice.color },
        });
      } else {
        majorEl = svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: { d: describePieSlice(center, center, innerRadius, slice.startAngle, slice.endAngle), fill: slice.color },
        });
      }
      attachTooltip(majorEl, slice.label, slice.total, slice.ratio);
      if (slice.ratio >= threshold) {
        const labelPoint = centroidForSlice(center, center, innerRadius, slice.startAngle, slice.endAngle);
        svg.createSvg("text", {
          cls: "finance-tracker-pie-label",
          text: slice.label,
          attr: { x: labelPoint.x, y: labelPoint.y + (hasSubcategories ? 2 : -8), "text-anchor": "middle" },
        });
        if (!hasSubcategories) {
          svg.createSvg("text", {
            cls: "finance-tracker-pie-value",
            text: core.formatCurrency(slice.total, currency),
            attr: { x: labelPoint.x, y: labelPoint.y + 12, "text-anchor": "middle" },
          });
        }
      }
    }

    if (hasSubcategories) {
      for (const slice of majorSlices) {
        let childAngle = slice.startAngle;
        for (const child of slice.children.filter((item) => item.total > 0)) {
          const childRatio = child.total / total;
          const childEnd = childAngle + childRatio * 360;
          const childEl = svg.createSvg("path", {
            cls: "finance-tracker-pie-slice",
            attr: {
              d: describeAnnularSlice(center, center, ringInner, outerRadius, childAngle, childEnd),
              fill: child.color,
            },
          });
          attachTooltip(childEl, child.label, child.total, childRatio);
          if (childRatio >= threshold) {
            const midAngle = childAngle + (childEnd - childAngle) / 2;
            const labelPoint = polarToCartesian(center, center, (ringInner + outerRadius) / 2, midAngle);
            const leaf = child.label.split(" / ").pop();
            svg.createSvg("text", {
              cls: "finance-tracker-pie-label",
              text: leaf,
              attr: { x: labelPoint.x, y: labelPoint.y + 4, "text-anchor": "middle" },
            });
          }
          childAngle = childEnd;
        }
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
      item.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${budget.name} - ${core.formatCurrency(budget.spent, currency)} / ${core.formatCurrency(budget.effectiveLimit || budget.limit, currency)}`,
      });
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
      item.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${row.goal.goalName} - ${core.formatCurrency(row.contributedThisRange, row.currency)} contributed this ${range.period}`,
      });
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
    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
    const cardData = [
      { label: "Holiday budget", value: metrics.totalBudget > 0 ? core.formatCurrency(metrics.totalBudget, currency) : "Not set" },
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

    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
  }

  renderPlannedExpenses(wrapper, plannedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned expenses" });

    if (!plannedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No planned trip costs found yet. Add rows to the Planned expenses table in the holiday budget note.",
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
        text: "No allocated in-trip costs found yet. Add rows to the Allocated expenses table in the holiday budget note.",
      });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const item of allocatedExpenses.rows) {
      const card = list.createDiv({ cls: "finance-tracker-budget-card" });
      card.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${item.item} - ${core.formatCurrency(item.allocated, currency)} · ${core.formatCurrency(item.allocatedPerDay, currency)}/day`,
      });
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

        const weekRowBounds = tripWeeks.map((week) => {
          const firstDay = week[0];
          const firstMeta = calendarCellMeta.get(firstDay);
          const rect = firstMeta?.cell?.getBoundingClientRect();
          return rect
            ? {
                bottom: rect.bottom - bodyRect.top,
                top: rect.top - bodyRect.top,
              }
            : null;
        });

        const monthSegmentsByKey = new Map();
        const outlineStrokeWidth = 2;
        const outlineHalfStroke = outlineStrokeWidth / 2;
        for (let weekIndex = 0; weekIndex < tripWeeks.length; weekIndex += 1) {
          const week = tripWeeks[weekIndex];
          let segmentStart = 0;
          while (segmentStart < week.length) {
            const segmentMonthKey = monthKeyForDay(week[segmentStart]);
            let segmentEnd = segmentStart;
            while (segmentEnd + 1 < week.length && monthKeyForDay(week[segmentEnd + 1]) === segmentMonthKey) {
              segmentEnd += 1;
            }

            const startDay = week[segmentStart];
            const endDay = week[segmentEnd];
            const startMeta = calendarCellMeta.get(startDay);
            const endMeta = calendarCellMeta.get(endDay);
            if (startMeta?.cell && endMeta?.cell) {
              const startRect = startMeta.cell.getBoundingClientRect();
              const endRect = endMeta.cell.getBoundingClientRect();
              const outerInset = 2;
              const previousDay = segmentStart > 0 ? week[segmentStart - 1] : "";
              const nextDay = segmentEnd < week.length - 1 ? week[segmentEnd + 1] : "";
              const previousRect = previousDay ? calendarCellMeta.get(previousDay)?.cell?.getBoundingClientRect() : null;
              const nextRect = nextDay ? calendarCellMeta.get(nextDay)?.cell?.getBoundingClientRect() : null;
              const monthMeta = monthMetaByKey.get(segmentMonthKey);
              const currentRow = weekRowBounds[weekIndex];
              const previousRow = weekIndex > 0 ? weekRowBounds[weekIndex - 1] : null;
              const nextRow = weekIndex < weekRowBounds.length - 1 ? weekRowBounds[weekIndex + 1] : null;
              const segments = monthSegmentsByKey.get(segmentMonthKey) || [];
              segments.push({
                accent: monthMeta?.accent || "var(--h1-color, var(--text-accent))",
                bottom: currentRow && nextRow
                  ? weekIndex === selectedWeekIndex
                    ? currentRow.bottom - outlineHalfStroke
                    : ((currentRow.bottom + nextRow.top) / 2) - outlineHalfStroke
                  : startRect.bottom - bodyRect.top + outerInset,
                isMonthStart: startDay === monthMeta?.firstDay,
                label: monthMeta?.label || "",
                left: previousRect
                  ? (((previousRect.right + startRect.left) / 2) - bodyRect.left) + outlineHalfStroke
                  : startRect.left - bodyRect.left - outerInset,
                right: nextRect
                  ? (((endRect.right + nextRect.left) / 2) - bodyRect.left) - outlineHalfStroke
                  : endRect.right - bodyRect.left + outerInset,
                top: currentRow && previousRow
                  ? (weekIndex - 1) === selectedWeekIndex
                    ? currentRow.top + outlineHalfStroke
                    : ((previousRow.bottom + currentRow.top) / 2) + outlineHalfStroke
                  : startRect.top - bodyRect.top - outerInset,
              });
              monthSegmentsByKey.set(segmentMonthKey, segments);
            }
            segmentStart = segmentEnd + 1;
          }
        }

        const buildMonthPath = (segments) => {
          if (!segments.length) return "";
          const ordered = segments.slice().sort((left, right) => left.top - right.top);
          const points = [];
          const first = ordered[0];
          points.push([first.left, first.top], [first.right, first.top]);
          for (let index = 0; index < ordered.length; index += 1) {
            const current = ordered[index];
            points.push([current.right, current.bottom]);
            if (index < ordered.length - 1) {
              const next = ordered[index + 1];
              if (next.right !== current.right) {
                points.push([next.right, current.bottom]);
              }
              if (next.top !== current.bottom) {
                points.push([next.right, next.top]);
              }
            }
          }
          const last = ordered[ordered.length - 1];
          points.push([last.left, last.bottom]);
          for (let index = ordered.length - 1; index >= 0; index -= 1) {
            const current = ordered[index];
            points.push([current.left, current.top]);
            if (index > 0) {
              const previous = ordered[index - 1];
              if (previous.left !== current.left) {
                points.push([previous.left, current.top]);
              }
              if (previous.bottom !== current.top) {
                points.push([previous.left, previous.bottom]);
              }
            }
          }
          return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
        };

        for (const [, segments] of monthSegmentsByKey.entries()) {
          if (!segments.length) continue;
          const ordered = segments.slice().sort((left, right) => left.top - right.top);
          const path = svg.createSvg("path", { cls: "finance-tracker-calendar-month-path" });
          path.setAttr("d", buildMonthPath(ordered));
          path.setAttr("stroke", ordered[0].accent);
          path.setAttr("fill", "none");
          const labelSegment = ordered.find((segment) => segment.isMonthStart) || ordered[0];
          if (labelSegment.label) {
            const label = overlayHost.createDiv({ cls: "finance-tracker-calendar-month-label", text: labelSegment.label });
            label.style.left = `${labelSegment.left + 14}px`;
            label.style.top = `${labelSegment.top + 10}px`;
            label.style.color = labelSegment.accent;
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

  renderSavingsSummary(wrapper, goal, summary, currency, extras = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: goal.goalName || "Savings goal" });
    const cards = section.createDiv({ cls: "finance-tracker-summary" });
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
    for (const card of cardData) {
      const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
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

    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
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
    for (const card of cardData) {
      const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }

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
          text: "Set `holiday: 2026/japan` in this code block, or add a `holiday_tag` to the budget note frontmatter.",
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
      const exportButton = headerActions.createEl("button", { text: "Export holiday CSV" });
      exportButton.addEventListener("click", async () => {
        await this.exportEntriesToCsv(actualEntries, `holiday-${holidayKey.replace(/\//g, "-")}-${effectiveEnd || referenceDate}`);
      });
      if (budgetFile instanceof TFile) {
        const budgetButton = headerActions.createEl("button", { text: "Open holiday budget" });
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
        text: `Holiday dashboard failed to render: ${error.message}`,
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
    const budgetsButton = headerActions.createEl("button", { text: "Budgets" });
    budgetsButton.addEventListener("click", async () => {
      await this.openDefaultBudgetNote();
    });

    // Summary cards: Today + This Period (+ holiday if active)
    const summaryGrid = wrapper.createDiv({ cls: "finance-tracker-summary" });

    const todayCard = summaryGrid.createDiv({ cls: "finance-tracker-summary-card" });
    todayCard.createDiv({ cls: "finance-tracker-summary-label", text: "Today" });
    todayCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(core.roundCurrencyAmount(todayTotal), currency) });

    const periodCard = summaryGrid.createDiv({ cls: "finance-tracker-summary-card" });
    periodCard.createDiv({ cls: "finance-tracker-summary-label", text: core.titleCaseSegment(basePeriod) });
    periodCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(core.roundCurrencyAmount(periodTotal), currency) });

    // Safe-to-spend per remaining day, derived from the "all" budget for this period.
    const allBudget = budgets.find(
      (budget) => budget.category === "all" && core.normalizeBudgetPeriod(budget.period) === core.normalizeBudgetPeriod(basePeriod)
    );
    if (allBudget) {
      const scaledLimit = core.scaleBudgetLimit(Number(allBudget.limit || 0), allBudget.period, periodRange, referenceDate, this.settings.weekStartsOn);
      const pace = core.computeBudgetPace({ limit: scaledLimit, spent: periodTotal, periodStart: periodRange.start, periodEnd: periodRange.end, referenceDate });
      const leftCard = summaryGrid.createDiv({ cls: "finance-tracker-summary-card" });
      if (pace.projected > scaledLimit) leftCard.addClass("is-over");
      leftCard.createDiv({ cls: "finance-tracker-summary-label", text: "Left / day" });
      leftCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(pace.perDayRemaining, currency) });
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

      const tripToday = summaryGrid.createDiv({ cls: "finance-tracker-summary-card is-trip" });
      tripToday.createDiv({ cls: "finance-tracker-summary-label", text: `${tripName} today` });
      tripToday.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(core.roundCurrencyAmount(tripTodaySpend), tripCurrency) });

      const tripRemaining = summaryGrid.createDiv({ cls: "finance-tracker-summary-card is-trip" });
      tripRemaining.createDiv({ cls: "finance-tracker-summary-label", text: "Trip budget left" });
      tripRemaining.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(metrics.spendableRemaining, tripCurrency) });

      const tripPerDay = summaryGrid.createDiv({ cls: "finance-tracker-summary-card is-trip" });
      tripPerDay.createDiv({ cls: "finance-tracker-summary-label", text: "Safe / day" });
      tripPerDay.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(dailyCanSpend, tripCurrency) });
    }

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
        const goalTotal = summary.currentSaved + summary.amountRemaining;
        const fillRatio = goalTotal > 0 ? summary.currentSaved / goalTotal : 0;
        const row = goalsSection.createDiv({ cls: "finance-tracker-budget-card" });
        row.createDiv({ cls: "finance-tracker-budget-title", text: goal.goalName });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${core.formatCurrency(summary.currentSaved, goal.currency || currency)} of ${core.formatCurrency(goalTotal, goal.currency || currency)}`,
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
        row.createDiv({
          cls: "finance-tracker-budget-title",
          text: `${person.displayName} — ${core.formatCurrency(person.outstanding, currency)}`,
        });
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        const settleButton = actions.createEl("button", { text: "Settle up" });
        settleButton.addEventListener("click", async () => {
          settleButton.disabled = true;
          try {
            await this.settleUpWithPerson(person.person, person.displayName, person.outstanding);
            this.refreshDailyBudgetView();
          } catch (error) {
            new Notice(`Settle up failed: ${error.message}`);
            settleButton.disabled = false;
          }
        });
      }
    }

    // Triage: period entries still needing a category (tap to fix).
    const needsCategory = spendEntries.filter((entry) => !entry.category || entry.category === "uncategorized");
    if (needsCategory.length) {
      const triage = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-tracker-triage" });
      triage.createEl("h4", { text: `Needs a category (${needsCategory.length})` });
      for (const entry of needsCategory.slice(0, 12)) {
        const row = triage.createDiv({ cls: "finance-tracker-budget-card is-clickable is-uncategorized" });
        const title = row.createDiv({ cls: "finance-tracker-budget-title" });
        title.createSpan({ text: core.formatCurrency(entry.amount, currency) });
        title.createSpan({ cls: "finance-tracker-budget-meta", text: ` · ${entry.merchant || entry.date}` });
        row.addEventListener("click", () => new EditTransactionModal(this.app, this, entry).open());
      }
    }

  }

  async collectAllTransactions() {
    return this.collectTransactionsForRange({ period: "all", start: "1900-01-01", end: "2999-12-31" });
  }

  // Appends raw finance lines (already tab-indented as needed) to the end of a
  // daily note's finance section, creating the note and heading when missing,
  // then heals the running total.
  async appendFinanceLines(date, newLines) {
    const notePath = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(notePath);
    const file = existing instanceof TFile ? existing : await this.ensureTextFile(notePath, () => this.buildMinimalDailyNote(date));
    const content = await this.app.vault.cachedRead(file);
    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    const heading = (this.settings.spendingHeading || "## Finance").trim().toLowerCase();
    let headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === heading);
    if (headingIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push(this.settings.spendingHeading || "## Finance");
      lines.push(`- [ ] ${this.settings.spendingRootTag || "#log/spending"} 0`);
      headingIndex = lines.length - 2;
    }
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

  // --- Recurring payments -----------------------------------------------------

  async detectRecurring(referenceDate, prefix = "") {
    const entries = await this.collectAllTransactions();
    const today = referenceDate || core.todayIsoLocal();
    const detected = core.detectRecurringPayments(entries, {
      prefix: prefix || this.settings.recurringTagPrefix || "subscriptions",
      referenceDate: today,
    });
    const applied = core.applyRecurringRegistry(detected, await this.loadRecurringRegistry(), today);
    return this.excludeRemovedRecurringItems(applied);
  }

  // Bills the user chose to "remove completely" from the Archived section
  // never resurface, even though detection is tag-driven off history — this
  // filter is the one place every consumer (settings, the dashboard block,
  // auto-logging) shares, so a single exclusion list covers all of them.
  excludeRemovedRecurringItems(applied) {
    const excluded = new Set(this.settings.excludedRecurringItems || []);
    if (!excluded.size) return applied;
    return { ...applied, items: applied.items.filter((item) => !excluded.has(item.name)) };
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
    const amount = patch.amount !== undefined ? patch.amount : current.amount > 0 ? current.amount : item.lastAmount;
    const amountCell = core.formatPlainNumber(amount);
    const nextAmount = patch.nextAmount !== undefined ? patch.nextAmount : current.nextAmount;
    const changeDate = patch.changeDate !== undefined ? patch.changeDate : current.changeDate;
    const nextAmountCell = nextAmount > 0 ? core.formatPlainNumber(nextAmount) : "";
    const changeDateCell = changeDate || "";
    const row = `| ${item.name} | ${item.cadence} | ${amountCell} | ${active ? "yes" : "no"} | ${autoLog ? "yes" : "no"} | ${nextAmountCell} | ${changeDateCell} |`;

    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    const headerIndex = lines.findIndex(
      (line) => /^\s*\|/.test(line) && /\bitem\b/i.test(line) && /\bactive\b/i.test(line)
    );
    if (headerIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push("## Registry");
      lines.push("");
      lines.push("Hand-editable per-bill state: Active no pauses a bill, Auto-log yes logs it on its due day, a filled Amount overrides the inferred price. Next Amount + Change Date schedule a future price change, applied automatically once the date arrives.");
      lines.push("");
      lines.push("| Item | Cadence | Amount | Active | Auto-log | Next Amount | Change Date |");
      lines.push("| --- | --- | ---: | --- | --- | ---: | --- |");
      lines.push(row);
      lines.push("");
    } else {
      // Older notes have a 5-column table (no Next Amount/Change Date) — widen
      // the header and every existing row in place so the table stays one
      // consistent width and parseMarkdownTable keeps matching every row.
      const headerCellCount = lines[headerIndex].split("|").length - 2;
      if (headerCellCount < 7) {
        lines[headerIndex] = "| Item | Cadence | Amount | Active | Auto-log | Next Amount | Change Date |";
        lines[headerIndex + 1] = "| --- | --- | ---: | --- | --- | ---: | --- |";
        for (let index = headerIndex + 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
          const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
          while (cells.length < 5) cells.push("");
          lines[index] = `| ${cells.slice(0, 5).join(" | ")} |  |  |`;
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
  }

  async logRecurringItem(item, date) {
    const bullet = [`\t- ${core.formatCurrency(item.lastAmount, item.currency || this.settings.defaultCurrency)} ${item.tag}`];
    if (item.merchant) bullet.push(`\t\t- ${item.merchant}`);
    return this.appendFinanceLines(date || core.todayIsoLocal(), bullet);
  }

  // Logs every recurring item whose next-due date has arrived, dated on the due
  // day so the cadence anchor never drifts. Loops so an item several periods
  // behind catches all the way up.
  async logDueRecurringPayments(options = {}) {
    const today = core.todayIsoLocal();
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
        logged += 1;
      }
    }
    if (options.notify !== false && (logged > 0 || !options.autoOnly)) {
      new Notice(logged > 0 ? `Finance: logged ${logged} recurring payment${logged === 1 ? "" : "s"}` : "No recurring payments are due.");
    }
    if (logged > 0) this.refreshDailyBudgetView();
    return logged;
  }

  async renderRecurringBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const prefix = core.normalizeCategoryPath(config.prefix || this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    const recurring = await this.detectRecurring(referenceDate, prefix);

    const manage = /^(?:true|yes|1)$/i.test(String(config.manage || ""));
    const reserve = core.computeRecurringReserve(recurring, referenceDate);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Recurring payments" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const logDueButton = headerActions.createEl("button", { text: "Log all due" });
    logDueButton.addEventListener("click", async () => {
      logDueButton.disabled = true;
      await this.logDueRecurringPayments({ notify: true });
      await this.renderRecurringBlock(source, el, ctx);
    });

    if (!recurring.items.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `No recurring payments found yet. Tag one like #log/spending/${prefix}/monthly/spotify and it will appear here.`,
      });
      return;
    }

    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
    const cardData = [
      { label: "Per month", value: core.formatCurrency(recurring.totals.monthly, currency) },
      { label: "Per year", value: core.formatCurrency(recurring.totals.yearly, currency) },
      { label: "Due next 30 days", value: core.formatCurrency(reserve.totals.dueNext30Days, currency) },
      { label: "Tracked items", value: String(recurring.items.length) },
    ];
    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Upcoming bills" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const item of recurring.items) {
      // Paused bills live only in the Archived section below now, never inline.
      if (item.active === false) continue;
      const row = list.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row" });
      if (item.status === "overdue") row.addClass("is-overdue");
      const title = row.createDiv({ cls: "finance-tracker-budget-title" });
      title.createSpan({ text: `${item.label} — ${core.formatCurrency(item.lastAmount, currency)}` });
      const statusText =
        item.status === "overdue"
          ? `overdue since ${item.nextDue}`
          : item.status === "due"
            ? "due today"
            : `due ${item.nextDue}`;
      const metaBits = [
        RECURRING_CADENCE_LABELS[item.cadence] || core.titleCaseSegment(item.cadence),
        statusText,
        `${core.formatCurrency(item.monthlyCost, currency)}/month`,
      ];
      if (manage) metaBits.push(item.autoLog !== false ? "auto-log on" : "auto-log off");
      if (item.nextAmount > 0 && item.changeDate) {
        metaBits.push(`changing to ${core.formatCurrency(item.nextAmount, currency)} on ${item.changeDate}`);
      }
      row.createDiv({ cls: "finance-tracker-budget-meta", text: metaBits.join(" · ") });
      if (manage) {
        const stateActions = row.createDiv({ cls: "finance-tracker-header-actions" });
        const pauseButton = stateActions.createEl("button", { text: "Pause" });
        pauseButton.addEventListener("click", async () => {
          pauseButton.disabled = true;
          await this.updateRecurringRegistryEntry(item, { active: false });
          await this.renderRecurringBlock(source, el, ctx);
        });
        const autoButton = stateActions.createEl("button", {
          text: item.autoLog !== false ? "Auto-log: on" : "Auto-log: off",
        });
        autoButton.addEventListener("click", async () => {
          autoButton.disabled = true;
          await this.updateRecurringRegistryEntry(item, { autoLog: item.autoLog === false });
          await this.renderRecurringBlock(source, el, ctx);
        });
        const editButton = stateActions.createEl("button", { text: "Edit" });
        editButton.addEventListener("click", () => {
          new EditRecurringItemModal(this.app, this, item, () => this.renderRecurringBlock(source, el, ctx)).open();
        });
      }
      const isDue = item.status === "overdue" || item.status === "due";
      if (isDue || manage) {
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        const logButton = actions.createEl("button", { text: "Log now" });
        logButton.addEventListener("click", async () => {
          logButton.disabled = true;
          try {
            const logDate = isDue ? item.nextDue : core.todayIsoLocal();
            await this.logRecurringItem(item, logDate);
            new Notice(`Logged ${item.label} for ${logDate}`);
            await this.renderRecurringBlock(source, el, ctx);
          } catch (error) {
            new Notice(`Could not log ${item.label}: ${error.message}`);
            logButton.disabled = false;
          }
        });
        if (manage && item.nextDue) {
          const skipButton = actions.createEl("button", { text: "Skip cycle" });
          skipButton.addEventListener("click", async () => {
            skipButton.disabled = true;
            try {
              await this.logRecurringSkip(item);
              new Notice(`Skipped ${item.label} — next due moves to ${core.nextRecurringDate(item.nextDue, item.cadence)}`);
              await this.renderRecurringBlock(source, el, ctx);
            } catch (error) {
              new Notice(`Could not skip ${item.label}: ${error.message}`);
              skipButton.disabled = false;
            }
          });
        }
      }
    }

    // Archived (paused) bills: collapsed by default, out of the way of the
    // active list, but still reachable to resume or drop for good.
    const archivedItems = recurring.items.filter((item) => item.active === false);
    if (archivedItems.length) {
      const archiveDetails = wrapper.createEl("details", { cls: "finance-tracker-chart-card finance-tracker-archived" });
      archiveDetails.createEl("summary", { text: `Archived (${archivedItems.length})` });
      const archiveList = archiveDetails.createDiv({ cls: "finance-tracker-budget-list" });
      for (const item of archivedItems) {
        const row = archiveList.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row is-paused" });
        const title = row.createDiv({ cls: "finance-tracker-budget-title" });
        title.createSpan({ text: `${item.label} — ${core.formatCurrency(item.lastAmount, currency)}` });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${RECURRING_CADENCE_LABELS[item.cadence] || core.titleCaseSegment(item.cadence)} · paused`,
        });
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        const resumeButton = actions.createEl("button", { text: "Resume" });
        resumeButton.addEventListener("click", async () => {
          resumeButton.disabled = true;
          await this.updateRecurringRegistryEntry(item, { active: true });
          await this.renderRecurringBlock(source, el, ctx);
        });
        const removeButton = actions.createEl("button", { text: "Remove completely", cls: "mod-warning" });
        removeButton.addEventListener("click", async () => {
          removeButton.disabled = true;
          await this.removeRecurringItemCompletely(item);
          new Notice(`Removed ${item.label} — it won't be tracked as a recurring payment again.`);
          await this.renderRecurringBlock(source, el, ctx);
        });
      }
    }

    // Bill reserve — the savings-goal side of recurring payments, in its own
    // section: what should already be set aside so every cadence is covered
    // when it lands, and the steady set-aside that keeps it that way.
    if (reserve.rows.length) {
      const reserveSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      reserveSection.createEl("h4", { text: "Bill reserve" });
      reserveSection.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Money to keep set aside so bills never surprise you — accrued since each bill was last paid.",
      });
      const reserveCards = reserveSection.createDiv({ cls: "finance-tracker-summary" });
      const reserveData = [
        { label: "Should be set aside now", value: core.formatCurrency(reserve.totals.accrued, currency) },
        { label: "Set aside / week", value: core.formatCurrency(reserve.totals.perWeek, currency) },
        { label: "Set aside / month", value: core.formatCurrency(reserve.totals.perMonth, currency) },
      ];
      for (const card of reserveData) {
        const element = reserveCards.createDiv({ cls: "finance-tracker-summary-card" });
        element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
        element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
      }
      const reserveList = reserveSection.createDiv({ cls: "ft-budget-rows" });
      for (const row of reserve.rows.filter((item) => item.accrued > 0).slice(0, 10)) {
        const line = reserveList.createDiv({ cls: "ft-budget-row" });
        const top = line.createDiv({ cls: "ft-budget-row-top" });
        top.createSpan({ cls: "ft-budget-row-name", text: row.label });
        top.createSpan({
          cls: "ft-budget-row-value",
          text: `${formatCurrencyShort(row.accrued, currency)} accrued · ${formatCurrencyShort(row.perWeek, currency)}/wk`,
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

    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
    const totalCard = cards.createDiv({ cls: "finance-tracker-summary-card" });
    totalCard.createDiv({ cls: "finance-tracker-summary-label", text: "Outstanding" });
    totalCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(splits.totalOutstanding, currency) });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Balances by person" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const personRow of splits.people) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      const title = row.createDiv({ cls: "finance-tracker-budget-title" });
      title.createSpan({ text: `${personRow.displayName} owes ${core.formatCurrency(personRow.outstanding, currency)}` });
      const openEntries = personRow.entries.filter((item) => !item.settled);
      for (const item of openEntries.slice(0, 8)) {
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${item.date || ""} · ${core.formatCurrency(item.amount, currency)} · ${item.merchant || "Split expense"}`,
        });
      }
      if (personRow.outstanding > 0) {
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        const settleButton = actions.createEl("button", { text: "Settle up" });
        settleButton.addEventListener("click", async () => {
          settleButton.disabled = true;
          try {
            await this.settleUpWithPerson(personRow.person, personRow.displayName, personRow.outstanding);
            await this.renderSplitsBlock(source, el, ctx);
          } catch (error) {
            new Notice(`Settle up failed: ${error.message}`);
            settleButton.disabled = false;
          }
        });
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
    const snapshotButton = headerActions.createEl("button", { text: "Snapshot balances" });
    snapshotButton.addEventListener("click", () => new BalanceSnapshotModal(this.app, this).open());

    if (!summary.accounts.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No balance snapshots yet. Run the Snapshot balances command to log bullets like `- $5,230.00 #log/balance/anz-plus` into today's note.",
      });
      return;
    }

    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
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
    for (const card of cardData) {
      const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }

    this.renderLineChartCard(wrapper, "Balance trend", summary.series.map((point) => ({ date: point.date, value: point.total })), {
      emptyText: "Take a second snapshot to draw the trend line.",
    });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Accounts" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const account of summary.accounts) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      row.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${account.label} — ${core.formatCurrency(account.latest?.amount || 0, currency)}`,
      });
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
    const recurring = core.detectRecurringPayments(entries, {
      prefix: this.settings.recurringTagPrefix || "subscriptions",
      referenceDate,
    });

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

    const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
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
    for (const card of cardData) {
      const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }

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
    const contributeButton = headerActions.createEl("button", { text: "Contribute" });
    contributeButton.addEventListener("click", () => new ContributeGoalModal(this.app, this).open());

    const goals = (await this.collectSavingsGoalDefinitions()).filter((goal) => !activeOnly || goal.activeSavingsGoal);
    if (!goals.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No goal notes yet. Create one with the Create savings goal command, or a trip via Select or create holiday.",
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
      const cards = wrapper.createDiv({ cls: "finance-tracker-summary" });
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
      for (const card of cardData) {
        const element = cards.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
        element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
        element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
      }
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
      const title = card.createDiv({ cls: "finance-tracker-budget-title" });
      title.createSpan({ text: `${goal.goalName} — ${core.formatCurrency(summary.currentSaved, goal.currency || currency)}` });
      if (goal.targetAmount > 0) {
        title.createSpan({ cls: "finance-tracker-budget-meta", text: ` of ${core.formatCurrency(goal.targetAmount, goal.currency || currency)}` });
      }
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
      const goalTotal = goal.targetAmount > 0 ? goal.targetAmount : summary.currentSaved;
      const bar = card.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = bar.createDiv({ cls: "finance-tracker-budget-fill is-good" });
      fill.style.width = `${goalTotal > 0 ? Math.min((summary.currentSaved / goalTotal) * 100, 100) : 0}%`;
      const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
      const addButton = actions.createEl("button", { text: "Contribute" });
      addButton.addEventListener("click", () => {
        new ContributeGoalModal(this.app, this, { goalKey: goal.goalKey, onDone: () => this.renderGoalsBlock(source, el, ctx) }).open();
      });
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
    const exportButton = headerActions.createEl("button", { text: "Export CSV" });
    exportButton.addEventListener("click", async () => {
      const entries = await this.collectTransactionsForRange(range);
      await this.exportEntriesToCsv(entries, `finance-${range.start}-${range.end}`);
    });

    const budgetsButton = headerActions.createEl("button", { text: "Budgets" });
    budgetsButton.addEventListener("click", async () => {
      await this.openDefaultBudgetNote();
    });

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

    const hierarchy = core.buildHierarchicalCategoryGroups(entries, "full");
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

class DailyBudgetView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._refreshTimer = null;
  }

  getViewType() { return DAILY_BUDGET_VIEW; }
  getDisplayText() { return "Daily budget"; }
  getIcon() { return "coins"; }

  async onOpen() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (_ftSelfWrites.has(file.path)) return;
        const prefix = normalizePath(this.plugin.settings.dailyNotesFolder + "/");
        if (file.path.startsWith(prefix)) {
          clearTimeout(this._refreshTimer);
          this._refreshTimer = setTimeout(() => this.refresh(), 400);
        }
      })
    );
    await this.refresh();
  }

  async onClose() {
    clearTimeout(this._refreshTimer);
  }

  async refresh() {
    try {
      const today = core.todayIsoLocal();
      await this.plugin.renderDailyBudgetCheckInto(this.contentEl, today, "full");
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: "finance-tracker-empty", text: `Daily budget failed to render: ${error?.message || error}` });
    }
  }
}

class QuickAddTransactionModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.date = core.parseIsoDate(options.date || "") || core.todayIsoLocal();
    this.dateFromNote = false;
    // Optionally pre-fill the date from the daily note that is open right now.
    if (!options.date && plugin.settings.quickAddUseNoteDate) {
      const activeFile = app.workspace.getActiveFile();
      const prefix = normalizePath(`${plugin.settings.dailyNotesFolder}/`);
      if (activeFile && activeFile.path.startsWith(prefix)) {
        const noteDate = core.extractNoteDate("", activeFile.path) || plugin.dailyNoteDateFromFileName(activeFile.name);
        if (noteDate) {
          this.date = noteDate;
          this.dateFromNote = true;
        }
      }
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-quick-add");
    contentEl.createEl("h3", { text: "Quick add transaction" });
    if (this.plugin.settings.tripModeActive) {
      contentEl.createDiv({
        cls: "finance-quick-add-trip",
        text: "Trip mode is on — this entry defaults to the trip tag and trip currency.",
      });
    }

    const input = contentEl.createEl("input", {
      type: "text",
      cls: "finance-quick-add-input",
      attr: { placeholder: "12 nobu restaurants   ·   24 dinner split=2   ·   4.50 coffee snacks @yesterday" },
    });

    // Suggestions derived from logging history: categories, merchants, people.
    // Arrows cycle, Tab accepts, Esc closes; Enter always submits the entry.
    const known = await this.plugin.collectKnownSuggestions();
    this._known = known;
    const popup = contentEl.createDiv({ cls: "finance-quick-add-suggestions" });
    popup.hide();
    let suggestions = [];
    let highlighted = 0;

    const hideSuggestions = () => {
      suggestions = [];
      highlighted = 0;
      popup.empty();
      popup.hide();
    };

    const currentToken = () => {
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos);
      const match = before.match(/(\S+)$/);
      return { token: match ? match[1] : "", start: match ? pos - match[1].length : pos, end: pos };
    };

    const buildSuggestions = (token) => {
      const lower = token.toLowerCase();
      if (!token || /^\$?-?[\d.,]+$/.test(token) || /^@/.test(token) || /^split=/i.test(lower)) return [];
      const out = [];
      if (/^owed=/i.test(lower)) {
        const query = lower.slice(5).replace(/^\W*/, "");
        for (const person of known.people) {
          if (!query || person.displayName.toLowerCase().startsWith(query) || person.person.startsWith(query)) {
            out.push({ kind: "person", text: `owed=${person.displayName}:`, label: `owed=${person.displayName}:$…` });
          }
        }
        return out.slice(0, 6);
      }
      const isTag = token.startsWith("#");
      const query = isTag ? lower.slice(1) : lower;
      if (!query) return [];
      for (const path of known.categories) {
        const matches = path.startsWith(query) || path.split("/").some((segment) => segment.startsWith(query));
        if (!matches) continue;
        out.push({ kind: "category", text: isTag ? `#${path}` : path, label: path });
        if (out.length >= (isTag || token.includes("/") ? 6 : 3)) break;
      }
      if (!isTag && !token.includes("/")) {
        for (const merchant of known.merchants) {
          const name = merchant.name.toLowerCase();
          if (!(name.startsWith(query) || name.split(/\s+/).some((word) => word.startsWith(query)))) continue;
          out.push({
            kind: "merchant",
            text: merchant.name,
            label: merchant.name,
            category: merchant.category,
          });
          if (out.length >= 6) break;
        }
      }
      return out.slice(0, 6);
    };

    const renderSuggestions = () => {
      popup.empty();
      if (!suggestions.length) {
        popup.hide();
        return;
      }
      popup.show();
      suggestions.forEach((suggestion, index) => {
        const row = popup.createDiv({ cls: `finance-quick-add-suggestion${index === highlighted ? " is-highlighted" : ""}` });
        row.createSpan({ cls: "finance-quick-add-suggestion-kind", text: suggestion.kind });
        row.createSpan({ text: suggestion.label });
        if (suggestion.kind === "merchant" && suggestion.category) {
          row.createSpan({ cls: "finance-quick-add-suggestion-hint", text: ` → ${suggestion.category}` });
        }
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          acceptSuggestion(suggestion);
        });
      });
    };

    const updateSuggestions = () => {
      const { token } = currentToken();
      suggestions = buildSuggestions(token);
      highlighted = 0;
      renderSuggestions();
    };

    const acceptSuggestion = (suggestion) => {
      const { start, end } = currentToken();
      let insert = suggestion.text;
      if (suggestion.kind === "merchant" && suggestion.category) {
        const parsedNow = core.parseQuickAddInput(input.value, known.categories);
        if (!parsedNow.category) insert = `${suggestion.text} #${suggestion.category}`;
      }
      const trailing = suggestion.kind === "person" ? "" : " ";
      input.value = `${input.value.slice(0, start)}${insert}${trailing}${input.value.slice(end)}`;
      const caret = start + insert.length + trailing.length;
      input.setSelectionRange(caret, caret);
      input.focus();
      hideSuggestions();
      update();
    };

    const preview = contentEl.createDiv({ cls: "finance-quick-add-preview" });

    const dateRow = contentEl.createDiv({ cls: "finance-quick-add-daterow" });
    dateRow.createSpan({ text: "Date " });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = this.date;
    if (this.dateFromNote) {
      dateRow.createSpan({ cls: "finance-quick-add-keep", text: " from the open note" });
    }
    dateInput.addEventListener("change", () => {
      this.date = core.parseIsoDate(dateInput.value) || this.date;
      update();
    });

    const buttons = contentEl.createDiv({ cls: "finance-quick-add-buttons" });
    const keepOpenLabel = buttons.createEl("label", { cls: "finance-quick-add-keep" });
    const keepOpen = keepOpenLabel.createEl("input", { type: "checkbox" });
    keepOpenLabel.appendText(" Keep open for next entry");
    const submit = buttons.createEl("button", { text: "Add", cls: "mod-cta" });

    const parseCurrent = () => {
      const parsed = core.parseQuickAddInput(input.value, known.categories);
      let date = this.date;
      if (parsed.dateToken) {
        const resolved = this.plugin.resolveDateToken(parsed.dateToken);
        if (resolved) {
          date = resolved;
          this.date = resolved;
          dateInput.value = resolved;
        }
      }
      return { parsed, date };
    };

    const update = () => {
      const { parsed, date } = parseCurrent();
      if (!Number.isFinite(parsed.amount)) {
        preview.setText("Type an amount to begin…");
        preview.removeClass("is-ready");
        submit.disabled = true;
        return;
      }
      const category = parsed.category || "uncategorized";
      const merchant = parsed.merchant ? `  ·  ${parsed.merchant}` : "";
      const owedPreview = core.buildOwedSharesFromTokens(parsed.amount, parsed.splitCount, parsed.owedTokens || []);
      const splitNote = owedPreview.length
        ? `  ·  my share ${core.formatCurrency(parsed.amount - owedPreview.reduce((sum, item) => sum + item.amount, 0), this.plugin.settings.defaultCurrency)}`
        : "";
      preview.setText(`${core.formatCurrency(parsed.amount, this.plugin.settings.defaultCurrency)}  ·  ${core.displayCategoryPath(category)}${merchant}${splitNote}  ·  ${date}`);
      preview.addClass("is-ready");
      submit.disabled = false;
    };

    const commit = async () => {
      const { parsed, date } = parseCurrent();
      if (!Number.isFinite(parsed.amount)) return;
      submit.disabled = true;
      try {
        await this.plugin.handleCaptureExpense(
          {
            amount: parsed.amount,
            category: parsed.category || "uncategorized",
            currency: this.plugin.settings.defaultCurrency,
            date,
            merchant: parsed.merchant,
            name: parsed.merchant,
            owedTokens: parsed.owedTokens || [],
            splitCount: parsed.splitCount,
            source: "quick-add",
          },
          { notify: true }
        );
        input.value = "";
        update();
        if (keepOpen.checked) {
          input.focus();
        } else {
          this.close();
        }
      } catch (error) {
        new Notice(`Quick add failed: ${error.message}`);
        submit.disabled = false;
      }
    };

    input.addEventListener("input", () => {
      update();
      updateSuggestions();
    });
    input.addEventListener("blur", () => window.setTimeout(hideSuggestions, 150));
    input.addEventListener("keydown", (event) => {
      if (suggestions.length) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          highlighted = (highlighted + 1) % suggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
          renderSuggestions();
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          acceptSuggestion(suggestions[highlighted]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          hideSuggestions();
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        hideSuggestions();
        commit();
      }
    });
    submit.addEventListener("click", () => commit());

    update();
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class EditTransactionModal extends Modal {
  constructor(app, plugin, entry) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Edit transaction" });
    const entry = this.entry;

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    amountInput.value = String(entry.amount ?? "");

    const catRow = contentEl.createDiv({ cls: "finance-edit-row" });
    catRow.createEl("label", { text: "Category" });
    const catInput = catRow.createEl("input", { type: "text" });
    catInput.value = entry.category || "uncategorized";

    const chips = contentEl.createDiv({ cls: "finance-edit-chips" });
    const known = await this.plugin.collectKnownSuggestions();
    for (const option of known.categories.slice(0, 12)) {
      const chip = chips.createEl("button", { cls: "finance-edit-chip", text: core.displayCategoryPath(option) });
      chip.addEventListener("click", () => {
        catInput.value = option;
      });
    }

    const merchantRow = contentEl.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text" });
    merchantInput.value = entry.merchant || "";

    const rememberLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const rememberCheckbox = rememberLabel.createEl("input", { type: "checkbox" });
    rememberLabel.appendText(" Remember this merchant → category");

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const deleteButton = buttons.createEl("button", { text: "Delete", cls: "mod-warning" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const patch = {
          amount: core.parseNumber(amountInput.value),
          category: core.normalizeCategoryPath(catInput.value) || "uncategorized",
          merchant: merchantInput.value.trim(),
        };
        await this.plugin.updateTransactionEntry(entry, patch);
        if (rememberCheckbox.checked && patch.merchant && patch.category && patch.category !== "uncategorized") {
          await this.plugin.rememberMerchantCategory(patch.merchant, patch.category);
        }
        new Notice("Transaction updated");
        this.close();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      try {
        await this.plugin.deleteTransactionEntry(entry);
        new Notice("Transaction deleted");
        this.close();
      } catch (error) {
        new Notice(`Delete failed: ${error.message}`);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Edits a recurring bill's amount, and optionally schedules a future price
// change (an exact date, applied automatically once it arrives) instead of
// waiting for the next logged entry to redefine the price.
class EditRecurringItemModal extends Modal {
  constructor(app, plugin, item, onSaved) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onSaved = onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    const item = this.item;
    contentEl.createEl("h3", { text: `Edit ${item.label}` });

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    amountInput.value = String(item.lastAmount ?? "");

    const scheduleLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const scheduleCheckbox = scheduleLabel.createEl("input", { type: "checkbox" });
    scheduleCheckbox.checked = Boolean(item.nextAmount && item.changeDate);
    scheduleLabel.appendText(" Price changes on a future date");

    const scheduleFields = contentEl.createDiv({ cls: "finance-edit-schedule" });
    scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);

    const nextAmountRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    nextAmountRow.createEl("label", { text: "New amount" });
    const nextAmountInput = nextAmountRow.createEl("input", { type: "number", attr: { step: "0.01" } });
    nextAmountInput.value = String(item.nextAmount ?? "");

    const changeDateRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    changeDateRow.createEl("label", { text: "Changes on" });
    const changeDateInput = changeDateRow.createEl("input", { type: "date" });
    changeDateInput.value = item.changeDate || "";

    scheduleCheckbox.addEventListener("change", () => {
      scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const patch = { amount: core.parseNumber(amountInput.value) };
        if (scheduleCheckbox.checked && nextAmountInput.value && changeDateInput.value) {
          patch.nextAmount = core.parseNumber(nextAmountInput.value);
          patch.changeDate = core.parseIsoDate(changeDateInput.value);
        } else {
          patch.nextAmount = null;
          patch.changeDate = null;
        }
        await this.plugin.updateRecurringRegistryEntry(item, patch);
        new Notice(`${item.label} updated`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BankReconcileModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.dateOrder = "DMY";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-reconcile");
    contentEl.createEl("h3", { text: "Reconcile bank / Wise CSV" });
    contentEl.createEl("p", {
      cls: "finance-reconcile-hint",
      text: "Paste an exported statement CSV. Spending rows are matched against what you have already logged; unmatched charges can be sent to your capture inbox.",
    });

    const orderRow = contentEl.createDiv({ cls: "finance-reconcile-order" });
    orderRow.createSpan({ text: "Date format " });
    const orderSelect = orderRow.createEl("select");
    for (const [value, label] of [["DMY", "DD/MM/YYYY (ANZ, AU)"], ["MDY", "MM/DD/YYYY (US)"], ["YMD", "YYYY-MM-DD"]]) {
      const option = orderSelect.createEl("option", { text: label });
      option.value = value;
    }
    orderSelect.value = this.dateOrder;
    orderSelect.addEventListener("change", () => {
      this.dateOrder = orderSelect.value;
    });

    const textarea = contentEl.createEl("textarea", {
      cls: "finance-reconcile-input",
      attr: { rows: "10", placeholder: "Date,Amount,Description\n08/06/2026,-12.50,NOBU SYDNEY\n..." },
    });

    const results = contentEl.createDiv({ cls: "finance-reconcile-results" });

    const buttons = contentEl.createDiv({ cls: "finance-reconcile-buttons" });
    const analyseBtn = buttons.createEl("button", { text: "Analyse", cls: "mod-cta" });
    analyseBtn.addEventListener("click", async () => {
      results.empty();
      try {
        const summary = await this.plugin.reconcileBankCsv(textarea.value, { dateOrder: this.dateOrder });
        this.renderSummary(results, summary);
      } catch (error) {
        results.setText(`Reconcile failed: ${error.message}`);
      }
    });
  }

  renderSummary(container, summary) {
    container.empty();
    container.createEl("div", {
      cls: "finance-reconcile-counts",
      text: `${summary.rows.length} spending rows · ${summary.matched.length} already logged · ${summary.missing.length} not logged`,
    });
    if (!summary.missing.length) {
      container.createEl("p", { text: "Everything in this statement is already logged. ✅" });
      return;
    }
    const list = container.createEl("ul", { cls: "finance-reconcile-missing" });
    for (const row of summary.missing) {
      const item = list.createEl("li");
      item.setText(`${row.date}  ${core.formatCurrency(row.amount, row.currency)}  ${row.merchant || ""}`);
    }
    const sendBtn = container.createEl("button", {
      text: `Send ${summary.missing.length} missing charge${summary.missing.length === 1 ? "" : "s"} to capture inbox`,
      cls: "mod-cta",
    });
    sendBtn.addEventListener("click", async () => {
      sendBtn.disabled = true;
      try {
        const count = await this.plugin.sendRowsToInbox(summary.missing);
        new Notice(`Finance: queued ${count} charge${count === 1 ? "" : "s"} to the capture inbox`);
        this.close();
      } catch (error) {
        new Notice(`Could not queue charges: ${error.message}`);
        sendBtn.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class HolidayBudgetModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.didComplete = false;
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
    this.didComplete = true;
    this.plugin.settings.activeHolidayBudgetPath = file.path;
    await this.plugin.saveSettings();
    await this.app.workspace.getLeaf(true).openFile(file);
    if (typeof this.onComplete === "function") {
      await this.onComplete(file);
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
    this.didComplete = true;
    const file = await this.plugin.createOrOpenHolidayBudget({
      endDate: this.createForm.endDate,
      holidayKey: this.createForm.holidayKey,
      name: holidayName,
      startDate: this.createForm.startDate,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") {
        await this.onComplete(file);
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
    this.createPanelEl.createEl("h3", { text: "New holiday details" });
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
    const createButton = actions.createEl("button", { text: "Create holiday budget" });
    createButton.addEventListener("click", async () => {
      await this.createFromForm();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select or create holiday budget" });
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

  async onClose() {
    if (!this.didComplete && typeof this.onComplete === "function") {
      await this.onComplete(null);
    }
  }
}

class ExchangeRateModal extends Modal {
  constructor(app, plugin, budgetFile, holidayMeta, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.budgetFile = budgetFile;
    this.holidayMeta = holidayMeta;
    this.onSubmit = onSubmit;
    this.form = {
      endDate: holidayMeta?.endDate || core.todayIsoLocal(),
      rate: "",
      scope: "flat",
      sourceCurrency: "",
      startDate: holidayMeta?.startDate || core.todayIsoLocal(),
      targetCurrency: holidayMeta?.currency || plugin.settings.defaultCurrency,
    };
  }

  togglePeriodFields() {
    if (!this.periodFieldsEl) return;
    this.periodFieldsEl.style.display = this.form.scope === "period" ? "" : "none";
  }

  async submit() {
    const payload = {
      endDate: this.form.endDate,
      rate: Number(this.form.rate),
      scope: this.form.scope,
      sourceCurrency: this.form.sourceCurrency,
      startDate: this.form.startDate,
      targetCurrency: this.form.targetCurrency,
    };
    this.close();
    await this.onSubmit(payload);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Add exchange rate: ${this.budgetFile.basename}` });

    new Setting(contentEl)
      .setName("Rate scope")
      .setDesc("Choose whether this rate applies to the whole trip or only a date range.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("flat", "Whole holiday")
          .addOption("period", "Date range")
          .setValue(this.form.scope)
          .onChange((value) => {
            this.form.scope = value;
            this.togglePeriodFields();
          })
      );

    new Setting(contentEl)
      .setName("Source currency")
      .setDesc("Examples: JPY, JPY CASH, USD.")
      .addText((text) =>
        text.setPlaceholder("JPY").setValue(this.form.sourceCurrency).onChange((value) => {
          this.form.sourceCurrency = value.trim().toUpperCase();
        })
      );

    new Setting(contentEl)
      .setName("Target currency")
      .setDesc("Defaults to the holiday note currency.")
      .addText((text) =>
        text.setPlaceholder(this.holidayMeta?.currency || this.plugin.settings.defaultCurrency).setValue(this.form.targetCurrency).onChange((value) => {
          this.form.targetCurrency = value.trim().toUpperCase() || (this.holidayMeta?.currency || this.plugin.settings.defaultCurrency);
        })
      );

    new Setting(contentEl)
      .setName("Rate")
      .setDesc("How much 1 unit of the source currency is worth in the target currency.")
      .addText((text) =>
        text.setPlaceholder("0.00877").setValue(this.form.rate).onChange((value) => {
          this.form.rate = value.trim();
        })
      );

    this.periodFieldsEl = contentEl.createDiv();

    new Setting(this.periodFieldsEl)
      .setName("Period start")
      .setDesc("Start date for this dated override.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.startDate).onChange((value) => {
          this.form.startDate = core.parseIsoDate(value) || this.holidayMeta?.startDate || core.todayIsoLocal();
        });
      });

    new Setting(this.periodFieldsEl)
      .setName("Period end")
      .setDesc("End date for this dated override.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.endDate).onChange((value) => {
          this.form.endDate = core.parseIsoDate(value) || this.holidayMeta?.endDate || this.form.startDate;
        });
      });

    this.togglePeriodFields();

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const cancelButton = actions.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", async () => {
      this.close();
      await this.onSubmit(null);
    });
    const saveButton = actions.createEl("button", { text: "Save rate" });
    saveButton.addEventListener("click", async () => {
      await this.submit();
    });
  }
}

class SavingsGoalModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.form = {
      dueDate: "",
      goalKey: "",
      name: "",
    };
  }

  async submit() {
    const name = String(this.form.name || "").trim();
    if (!name) return;
    const file = await this.plugin.createOrOpenSavingsGoal({
      dueDate: this.form.dueDate,
      goalKey: this.form.goalKey || buildGoalKeyFromName(name),
      name,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") {
        await this.onComplete(file);
      }
    }
    this.close();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create savings goal" });

    new Setting(contentEl)
      .setName("Goal name")
      .setDesc("For example House Deposit or Rainy Day Fund.")
      .addText((text) =>
        text.setPlaceholder("House Deposit").onChange((value) => {
          this.form.name = value;
          this.form.goalKey = buildGoalKeyFromName(value);
        })
      );

    new Setting(contentEl)
      .setName("Goal key")
      .setDesc("Used by tags like #log/income/house-deposit.")
      .addText((text) =>
        text.setPlaceholder("house-deposit").setValue(this.form.goalKey).onChange((value) => {
          this.form.goalKey = core.normalizeCategoryPath(value) || buildGoalKeyFromName(this.form.name);
        })
      );

    new Setting(contentEl)
      .setName("Due date")
      .setDesc("Optional target date for calculating required savings per period.")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.dueDate).onChange((value) => {
          this.form.dueDate = core.parseIsoDate(value) || "";
        });
      });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create goal note" });
    createButton.addEventListener("click", async () => {
      await this.submit();
    });
  }
}

// Guided first-time setup: picks the folders, then creates the starter notes
// (budgets, dashboard, recurring payments, goals) from templates embedded in
// the plugin. Never overwrites an existing note, so it is safe to re-run.
class SetupWizardModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.form = {
      createBudgets: true,
      createDashboard: true,
      createGoals: true,
      createRecurring: true,
      currency: plugin.settings.defaultCurrency || "AUD",
      dailyNotesFolder: plugin.settings.dailyNotesFolder || "",
      budgetsFolder: plugin.settings.budgetsFolderPath || "Utility/Budgets",
      financeFolder: String(plugin.settings.captureInboxFolder || "Utility/Finance/Inbox").replace(/\/?Inbox\/?$/i, "") || "Utility/Finance",
      recurringNoteName: plugin.settings.recurringNoteName || DEFAULT_SETTINGS.recurringNoteName,
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Finance Tracker setup" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Three questions, then the starter notes are created for you. Everything is plain markdown you can move or edit later, and nothing you already have is overwritten.",
    });

    contentEl.createEl("h3", { text: "1. Where things live" });

    new Setting(contentEl)
      .setName("Daily notes folder")
      .setDesc("Where your daily notes are. Detected from the Journals or Daily notes plugin when possible.")
      .addText((text) =>
        text.setPlaceholder("Journal/Daily").setValue(this.form.dailyNotesFolder).onChange((value) => {
          this.form.dailyNotesFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Budgets folder")
      .setDesc("Budget, goal, and trip notes are stored here.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets").setValue(this.form.budgetsFolder).onChange((value) => {
          this.form.budgetsFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Finance folder")
      .setDesc("Dashboard and goals notes, the capture inbox, and the merchant map go here.")
      .addText((text) =>
        text.setPlaceholder("Utility/Finance").setValue(this.form.financeFolder).onChange((value) => {
          this.form.financeFolder = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("Currency")
      .setDesc("Used for totals and new captures.")
      .addText((text) =>
        text.setPlaceholder("AUD").setValue(this.form.currency).onChange((value) => {
          this.form.currency = value.trim().toUpperCase();
        })
      );

    new Setting(contentEl)
      .setName("Recurring payments note name")
      .setDesc("Filename for the bill-management note, inside the budgets folder. Changeable later in settings.")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.recurringNoteName).setValue(this.form.recurringNoteName).onChange((value) => {
          this.form.recurringNoteName = value.trim();
        })
      );

    contentEl.createEl("h3", { text: "2. Starter notes to create" });

    const noteToggles = [
      ["createBudgets", "💸 Budgets", "A budget table with example rows — edit the limits to make them yours."],
      ["createDashboard", "📊 Finance dashboard", "Weekly and monthly dashboards, net worth, forecast, and a sample query."],
      ["createRecurring", "🔁 Recurring payments", "The bill management page: due dates, log/skip, and the bill reserve."],
      ["createGoals", "🎯 Goals", "The goals overview with one-tap contributions."],
    ];
    for (const [key, name, desc] of noteToggles) {
      new Setting(contentEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((toggle) =>
          toggle.setValue(this.form[key]).onChange((value) => {
            this.form[key] = value;
          })
        );
    }

    contentEl.createEl("h3", { text: "3. Create" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "After this, log your first expense with the Quick add transaction command — today's daily note is created automatically.",
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const skipButton = actions.createEl("button", { text: "Not now" });
    skipButton.addEventListener("click", () => this.close());
    const createButton = actions.createEl("button", { text: "Create starter notes", cls: "mod-cta" });
    createButton.addEventListener("click", async () => {
      createButton.disabled = true;
      try {
        await this.runSetup();
        this.close();
      } catch (error) {
        new Notice(`Setup failed: ${error.message}`);
        createButton.disabled = false;
      }
    });
  }

  async runSetup() {
    const plugin = this.plugin;
    if (this.form.dailyNotesFolder) plugin.settings.dailyNotesFolder = this.form.dailyNotesFolder;
    if (this.form.budgetsFolder) plugin.settings.budgetsFolderPath = this.form.budgetsFolder;
    plugin.settings.recurringNoteName = this.form.recurringNoteName || DEFAULT_SETTINGS.recurringNoteName;
    plugin.settings.defaultCurrency = core.normalizeCurrency(this.form.currency, plugin.settings.defaultCurrency);
    const financeFolder = (this.form.financeFolder || "Utility/Finance").replace(/\/+$/, "");
    plugin.settings.captureInboxFolder = normalizePath(`${financeFolder}/Inbox`);
    plugin.settings.merchantMapPath = normalizePath(`${financeFolder}/Merchant Map.md`);
    plugin.settings.budgetArchiveFolderPath = normalizePath(`${plugin.settings.budgetsFolderPath}/Archive`);
    await plugin.saveSettings();

    await plugin.ensureBudgetInfrastructure();
    await plugin.ensureFolder(plugin.settings.captureInboxFolder);

    const created = [];
    let openTarget = null;
    if (this.form.createBudgets) {
      const file = await plugin.ensureBudgetNote();
      created.push(file.basename);
    }
    if (this.form.createRecurring) {
      const file = await plugin.ensureTextFile(plugin.getRecurringNotePath(), () => plugin.buildRecurringNoteContent());
      created.push(file.basename);
    }
    if (this.form.createGoals) {
      const file = await plugin.ensureTextFile(
        normalizePath(`${financeFolder}/🎯 Goals.md`),
        () => plugin.buildGoalsNoteContent()
      );
      created.push(file.basename);
    }
    if (this.form.createDashboard) {
      const file = await plugin.ensureTextFile(
        normalizePath(`${financeFolder}/📊 Finance Dashboard.md`),
        () => plugin.buildDashboardNoteContent()
      );
      created.push(file.basename);
      openTarget = file;
    }

    new Notice(created.length ? `Finance Tracker is ready: ${created.join(", ")}` : "Settings saved.");
    if (openTarget) {
      await this.app.workspace.getLeaf(true).openFile(openTarget);
    }
  }

  onClose() {
    // Persist settings even on "Not now" so a fresh install is only greeted once.
    this.plugin.saveSettings().catch(() => {});
    this.contentEl.empty();
  }
}

class ContributeGoalModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.goalKey = core.normalizeCategoryPath(options.goalKey || "");
    this.onDone = options.onDone;
    this.form = { amount: "", date: core.todayIsoLocal(), note: "" };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Contribute to savings goal" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Logs a contribution bullet like `- $150.00 #log/income/roadbike` into the chosen day's note. If the money stays in one account, that's fine — the goal is a virtual envelope tracked entirely in your notes.",
    });

    const goals = await this.plugin.collectSavingsGoalDefinitions();
    if (!goals.length) {
      contentEl.createDiv({ cls: "finance-tracker-empty", text: "No goal notes yet — create one first." });
      return;
    }
    if (!this.goalKey || !goals.some((goal) => goal.goalKey === this.goalKey)) {
      this.goalKey = goals[0].goalKey;
    }

    new Setting(contentEl)
      .setName("Goal")
      .addDropdown((dropdown) => {
        for (const goal of goals) {
          dropdown.addOption(goal.goalKey, `${goal.goalName}${goal.goalType === "holiday" ? " (trip)" : ""}`);
        }
        dropdown.setValue(this.goalKey).onChange((value) => {
          this.goalKey = value;
        });
      });

    new Setting(contentEl)
      .setName("Amount")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setPlaceholder("150").onChange((value) => {
          this.form.amount = value;
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .setName("Date")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.form.date).onChange((value) => {
          this.form.date = core.parseIsoDate(value) || core.todayIsoLocal();
        });
      });

    new Setting(contentEl)
      .setName("Note")
      .setDesc("Optional — defaults to \"Contribution to <goal>\".")
      .addText((text) => {
        text.setPlaceholder("Payday transfer").onChange((value) => {
          this.form.note = value;
        });
      });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const saveButton = actions.createEl("button", { text: "Log contribution", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      const amount = core.parseNumber(this.form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        new Notice("Enter a contribution amount first.");
        return;
      }
      saveButton.disabled = true;
      try {
        const goal = goals.find((item) => item.goalKey === this.goalKey);
        await this.plugin.logGoalContribution(this.goalKey, goal?.goalName || this.goalKey, amount, this.form.date, this.form.note);
        new Notice(`Logged ${core.formatCurrency(amount, this.plugin.settings.defaultCurrency)} to ${goal?.goalName || this.goalKey}`);
        if (typeof this.onDone === "function") await this.onDone();
        this.close();
      } catch (error) {
        new Notice(`Contribution failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SettleUpModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Settle up split expenses" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Settling logs the repayment as income and marks that person's owed entries settled in your daily notes.",
    });
    const list = contentEl.createDiv({ cls: "finance-tracker-budget-list" });
    list.createDiv({ cls: "finance-tracker-empty", text: "Loading balances…" });

    const entries = await this.plugin.collectAllTransactions();
    const summary = core.summarizeSplitBalances(entries);
    const open = summary.people.filter((person) => person.outstanding > 0);
    list.empty();

    if (!open.length) {
      list.createDiv({ cls: "finance-tracker-empty", text: "Nothing outstanding — everyone is settled up." });
      return;
    }

    for (const person of open) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
      row.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${person.displayName} owes ${core.formatCurrency(person.outstanding, this.plugin.settings.defaultCurrency)}`,
      });
      row.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${person.entries.filter((item) => !item.settled).length} open entr${person.entries.filter((item) => !item.settled).length === 1 ? "y" : "ies"} · tap to settle`,
      });
      row.addEventListener("click", async () => {
        row.addClass("is-uncategorized");
        try {
          await this.plugin.settleUpWithPerson(person.person, person.displayName, person.outstanding);
          this.close();
        } catch (error) {
          new Notice(`Settle up failed: ${error.message}`);
        }
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BalanceSnapshotModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.rows = [];
  }

  addRow(container, account = "", amount = "") {
    const row = container.createDiv({ cls: "finance-edit-row" });
    const accountInput = row.createEl("input", { type: "text", attr: { placeholder: "anz-plus" } });
    accountInput.value = account;
    const amountInput = row.createEl("input", { type: "number", attr: { step: "0.01", placeholder: "5230" } });
    amountInput.value = amount === "" ? "" : String(amount);
    this.rows.push({ accountInput, amountInput });
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Snapshot balances" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Logs one bullet per account into today's note, like `- $5,230.00 #log/balance/anz-plus`. Accounts you have snapshotted before are pre-filled with their last balance.",
    });

    const rowsHost = contentEl.createDiv();
    const entries = await this.plugin.collectAllTransactions();
    const summary = core.summarizeBalanceSnapshots(entries);
    for (const account of summary.accounts) {
      this.addRow(rowsHost, account.key, account.latest?.amount ?? "");
    }
    if (!summary.accounts.length) {
      this.addRow(rowsHost);
    }

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const addButton = actions.createEl("button", { text: "Add account" });
    addButton.addEventListener("click", () => this.addRow(rowsHost));
    const saveButton = actions.createEl("button", { text: "Log snapshot", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      const lines = [];
      for (const row of this.rows) {
        const account = row.accountInput.value.trim();
        const amount = core.parseNumber(row.amountInput.value);
        if (!account || !Number.isFinite(amount)) continue;
        lines.push(core.buildBalanceSnapshotLine(account, amount));
      }
      if (!lines.length) {
        new Notice("Add at least one account with a balance first.");
        return;
      }
      saveButton.disabled = true;
      try {
        await this.plugin.appendFinanceLines(core.todayIsoLocal(), lines);
        new Notice(`Logged ${lines.length} balance snapshot${lines.length === 1 ? "" : "s"}`);
        this.close();
      } catch (error) {
        new Notice(`Snapshot failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
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
      text: "Configure capture behavior, dashboard defaults, holiday budgets, goals, and recurring payments.",
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
      .setName("Finance heading")
      .setDesc("Heading used when the plugin looks for your finance section. Legacy ## Spending notes are still parsed.")
      .addText((text) =>
        text.setPlaceholder("## Finance").setValue(this.plugin.settings.spendingHeading).onChange(async (value) => {
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
      .setName("Quick add uses the open daily note's date")
      .setDesc("When quick add opens while a daily note is active, pre-fill the date from that note instead of today.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.quickAddUseNoteDate)).onChange(async (value) => {
          this.plugin.settings.quickAddUseNoteDate = value;
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
    const openBudgetsButton = actions.createEl("button", { text: "Open budgets note" });
    openBudgetsButton.addEventListener("click", async () => {
      await this.plugin.openBudgetNote();
    });

    addSection(
      "Merchant map",
      "Learned merchant → category associations, added automatically from the \"Remember this merchant → category\" checkbox when editing a transaction. Remove an entry here if it guesses wrong."
    );
    const merchantMapListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderMerchantMapList(merchantMapListEl);

    addSection(
      "Holiday budgets",
      "Save for several holidays at once: each goal note below can be active at the same time. Spending is treated as holiday spending automatically when the note date falls inside a holiday's start and end dates. Archiving a finished holiday freezes its savings steps and spending record into the note and moves it out of the active set."
    );

    const holidayActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const selectHolidayButton = holidayActions.createEl("button", { text: "Select or create holiday" });
    selectHolidayButton.addEventListener("click", () => {
      new HolidayBudgetModal(this.app, this.plugin, async () => {
        this.display();
      }).open();
    });
    const archiveFinishedButton = holidayActions.createEl("button", { text: "Archive finished holidays" });
    archiveFinishedButton.addEventListener("click", async () => {
      await this.plugin.archiveFinishedHolidays({ notify: true });
      this.display();
    });

    const goalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(goalListEl).catch(() => {});

    addSection("Savings goals", "Create standalone savings goal notes for things like a house deposit or rainy day fund. Any goal with a target amount and a due date shows sinking-fund math automatically.");
    const savingsActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createSavingsGoalButton = savingsActions.createEl("button", { text: "Create savings goal" });
    createSavingsGoalButton.addEventListener("click", () => {
      new SavingsGoalModal(this.app, this.plugin, async () => {
        this.display();
      }).open();
    });

    addSection(
      "Recurring payments",
      "Recurring bills are detected from tags whose subtag encodes the cadence, like #log/spending/subscriptions/monthly/spotify."
    );

    new Setting(containerEl)
      .setName("Recurring tag prefix")
      .setDesc("The category prefix that marks an entry as recurring. Default: subscriptions.")
      .addText((text) =>
        text.setPlaceholder("subscriptions").setValue(this.plugin.settings.recurringTagPrefix).onChange(async (value) => {
          this.plugin.settings.recurringTagPrefix = core.normalizeCategoryPath(value) || DEFAULT_SETTINGS.recurringTagPrefix;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Recurring payments note name")
      .setDesc("Filename of the bill-management note, inside the budgets folder. Set once during first-time setup, changeable any time.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.recurringNoteName)
          .setValue(this.plugin.settings.recurringNoteName)
          .onChange(async (value) => {
            this.plugin.settings.recurringNoteName = value.trim() || DEFAULT_SETTINGS.recurringNoteName;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-log recurring payments")
      .setDesc("Master switch: log recurring items automatically on their due day. Each bill below can opt out with its Auto-log toggle.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.autoLogRecurring)).onChange(async (value) => {
          this.plugin.settings.autoLogRecurring = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Detected bills — Current: uncheck to pause a bill (it moves to the Archived section of the recurring payments block, where it can be resumed or removed for good); Auto-log: log this bill automatically on its due day. State is stored in the registry table of the recurring payments note.",
    });
    const recurringListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderRecurringList(recurringListEl).catch(() => {});
    const recurringActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const openRecurringButton = recurringActions.createEl("button", { text: "Open recurring payments note" });
    openRecurringButton.addEventListener("click", () => this.plugin.openRecurringNote());

    addSection(
      "Trip mode",
      "While a trip is active, quick-add and URL captures default to the trip tag and trip currency, and the sidebar shows trip cards."
    );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: this.plugin.settings.tripModeActive
        ? `Trip mode is on: ${this.plugin.settings.activeTripGoalPath || this.plugin.settings.activeHolidayBudgetPath}`
        : "Trip mode is off.",
    });

    const tripActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const startTripButton = tripActions.createEl("button", { text: "Start trip" });
    startTripButton.addEventListener("click", async () => {
      await this.plugin.startTrip();
      this.display();
    });
    const endTripButton = tripActions.createEl("button", { text: "End trip" });
    endTripButton.addEventListener("click", async () => {
      await this.plugin.endTrip();
      this.display();
    });

    addSection("First-time setup", "Re-run the guided setup to create any missing starter notes. Existing notes are never overwritten.");
    const setupActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const setupButton = setupActions.createEl("button", { text: "Run first-time setup" });
    setupButton.addEventListener("click", () => new SetupWizardModal(this.app, this.plugin).open());
  }

  renderMerchantMapList(listEl) {
    listEl.empty();
    const entries = Object.entries(this.plugin.settings.merchantMap || {}).sort((left, right) =>
      left[0].localeCompare(right[0])
    );
    if (!entries.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No merchants learned yet — tick \"Remember this merchant → category\" when editing a transaction.",
      });
      return;
    }
    for (const [merchant, category] of entries) {
      const setting = new Setting(listEl).setName(merchant).setDesc(core.displayCategoryPath(category));
      setting.addButton((button) =>
        button.setButtonText("Remove").onClick(async () => {
          await this.plugin.forgetMerchantCategory(merchant);
          this.renderMerchantMapList(listEl);
        })
      );
    }
  }

  // Only current (non-paused) bills show here — pausing a bill moves it into
  // the Archived section of the finance-recurring block instead, where it can
  // be resumed or removed completely.
  async renderRecurringList(listEl) {
    listEl.empty();
    const recurring = await this.plugin.detectRecurring();
    const items = recurring.items.filter((item) => item.active !== false);
    if (!items.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: `No recurring payments detected yet. Log one with a cadence tag like #log/spending/${this.plugin.settings.recurringTagPrefix || "subscriptions"}/monthly/spotify.`,
      });
      return;
    }
    const scroll = listEl.createDiv({ cls: "finance-tracker-recurring-settings-scroll" });
    const header = scroll.createDiv({ cls: "finance-tracker-recurring-settings-header" });
    header.createSpan({ text: "Bill" });
    header.createSpan({ text: "Current" });
    header.createSpan({ text: "Auto-log" });
    for (const item of items) {
      const bits = [
        RECURRING_CADENCE_LABELS[item.cadence] || item.cadence,
        core.formatCurrency(item.lastAmount, item.currency || this.plugin.settings.defaultCurrency),
      ];
      if (item.nextDue) bits.push(`next due ${item.nextDue}`);
      const row = scroll.createDiv({ cls: "finance-tracker-recurring-settings-row" });
      const nameCell = row.createDiv({ cls: "finance-tracker-recurring-name" });
      nameCell.createDiv({ text: item.label });
      nameCell.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });

      const currentLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Current" } });
      const currentCheckbox = currentLabel.createEl("input", { type: "checkbox" });
      currentCheckbox.checked = true;
      currentCheckbox.addEventListener("change", async () => {
        currentCheckbox.disabled = true;
        await this.plugin.updateRecurringRegistryEntry(item, { active: currentCheckbox.checked });
        await this.renderRecurringList(listEl);
      });

      const autoLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Auto-log" } });
      const autoCheckbox = autoLabel.createEl("input", { type: "checkbox" });
      autoCheckbox.checked = item.autoLog !== false;
      autoCheckbox.addEventListener("change", async () => {
        autoCheckbox.disabled = true;
        await this.plugin.updateRecurringRegistryEntry(item, { autoLog: autoCheckbox.checked });
        autoCheckbox.disabled = false;
      });
    }
  }

  // Lists every non-archived goal note with an Active toggle (several holidays
  // can be saved for at once) and a per-note Archive button.
  async renderGoalList(listEl) {
    listEl.empty();
    const today = core.todayIsoLocal();
    const files = this.plugin.getHolidayBudgetFiles();
    const rows = [];
    for (const file of files) {
      const meta = await this.plugin.readHolidayBudgetFile(file);
      const generic = meta?.holidayKey ? null : this.plugin.parseSavingsGoalContent(await this.app.vault.cachedRead(file), file.path);
      if (!meta?.holidayKey && !generic?.goalKey) continue;
      if (meta?.archivedDate || generic?.archivedDate) continue;
      rows.push({ file, meta, generic });
    }

    if (!rows.length) {
      listEl.createDiv({ cls: "finance-tracker-empty", text: "No goal or holiday notes yet." });
      return;
    }

    for (const row of rows) {
      const isHoliday = Boolean(row.meta?.holidayKey);
      const name = isHoliday ? row.meta.holidayName : row.generic.goalName;
      const isActive = isHoliday ? row.meta.activeSavingsGoal : row.generic.activeSavingsGoal;
      const endDate = isHoliday ? row.meta.endDate : "";
      const bits = [];
      if (isHoliday) {
        bits.push(`trip ${row.meta.holidayKey}`);
        if (row.meta.startDate || endDate) bits.push(`${row.meta.startDate || "?"} to ${endDate || "?"}`);
        if (endDate && endDate < today) bits.push("ended");
      } else {
        bits.push("savings goal");
        if (row.generic.dueDate) bits.push(`due ${row.generic.dueDate}`);
      }

      const setting = new Setting(listEl).setName(name).setDesc(bits.join(" · "));
      setting.addToggle((toggle) =>
        toggle
          .setTooltip("Active — shows in the sidebar and forecast")
          .setValue(Boolean(isActive))
          .onChange(async (value) => {
            await this.plugin.setGoalActiveState(row.file, value);
          })
      );
      setting.addButton((button) =>
        button.setButtonText("Archive").onClick(async () => {
          const archivePath = await this.plugin.archiveGoalNote(row.file);
          new Notice(`Archived ${name} to ${archivePath}`);
          await this.renderGoalList(listEl);
        })
      );
    }
  }
}

module.exports = FinanceTrackerPlugin;

/* nosourcemap */