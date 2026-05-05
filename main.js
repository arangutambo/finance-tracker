"use strict";

const { Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } = require("obsidian");
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

  function extractFinanceTagContext(line) {
    const matches = Array.from(String(line || "").matchAll(/#([^\s#\]]+)/gi));
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const fullTag = normalizeCategoryPath(matches[index][1]);
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

      if (parts[1] && /^(?:\d{2}|\d{4})$/.test(parts[1]) && parts[3] === "spending" && parts[2]) {
        const holidayKey = `${parts[1]}/${parts[2]}`;
        const remainder = parts.slice(4);
        const isPlannedExpense = String(remainder[0] || "").toLowerCase() === "planned";
        const category = normalizeCategoryPath((isPlannedExpense ? remainder.slice(1) : remainder).join("/")) || "uncategorized";
        return {
          category,
          entryType: "holiday-spending",
          goalKey: normalizeCategoryPath(parts[2]),
          holidayKey,
          isGoalContribution: false,
          isGoalWithdrawal: true,
          isIncome: false,
          isPlannedExpense,
          plannedCategory: isPlannedExpense ? category : "",
        };
      }

      if (parts[1] && /^(?:\d{2}|\d{4})$/.test(parts[1]) && parts[2] && parts[3] === "planned") {
        const holidayKey = `${parts[1]}/${parts[2]}`;
        const category = normalizeCategoryPath(parts.slice(4).join("/")) || "uncategorized";
        return {
          category,
          entryType: "holiday-spending",
          goalKey: normalizeCategoryPath(parts[2]),
          holidayKey,
          isGoalContribution: false,
          isGoalWithdrawal: true,
          isIncome: false,
          isPlannedExpense: true,
          plannedCategory: category,
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
      originalAmount: Number.isFinite(originalAmount) ? Number(Number(originalAmount).toFixed(2)) : null,
      originalCurrency: originalSide ? originalDescriptor.currency : "",
      originalRateKey: originalSide ? originalDescriptor.rateKey : "",
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

  return {
    buildCategoryTag,
    buildAllocatedExpenseSummary,
    buildCsv,
    buildIncomeTag,
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
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const HOLIDAY_DASHBOARD_BLOCK = "holiday-dashboard";
const DAILY_BUDGET_CHECK_BLOCK = "daily-budget-check";
const SAVINGS_DASHBOARD_BLOCK = "savings-dashboard";
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

    this.registerMarkdownCodeBlockProcessor(DAILY_BUDGET_CHECK_BLOCK, async (source, el, ctx) => {
      await this.renderDailyBudgetCheck(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(SAVINGS_DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderSavingsDashboard(source, el, ctx);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.spendingHeading || this.settings.spendingHeading === "## Spending") {
      this.settings.spendingHeading = DEFAULT_SETTINGS.spendingHeading;
    }
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
    return `---\ndate: ${iso}\n---\n\n## Finance\n- [ ] #log/spending 0\n`;
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
        financeHeading: this.settings.spendingHeading,
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
    const inferredHolidayKey = frontmatter.holiday_name
      ? guessHolidayTagFromName(frontmatter.holiday_name)
      : "";
    const holidayKey = core.normalizeHolidayKey(frontmatter.holiday_tag || frontmatter.holiday || frontmatter.tag || inferredHolidayKey);
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
      activeSavingsGoal: /^(?:true|yes|1)$/i.test(String(frontmatter.active_savings_goal || "false")),
      allocatedExpenses,
      currency: core.normalizeCurrency(frontmatter.currency || this.settings.defaultCurrency),
      carryMissedSavings: /^(?:true|yes|1)$/i.test(String(frontmatter.carry_missed_savings || "false")),
      endDate: core.parseIsoDate(frontmatter.end_date || frontmatter.end || frontmatter.return_date || ""),
      exchangeRates: {
        flat: parseFlatExchangeRates(frontmatter.exchange_rates || frontmatter.rates || "", this.settings.defaultCurrency),
        periods: parseExchangeRatePeriods(frontmatter.exchange_rate_periods || frontmatter.rate_periods || "", this.settings.defaultCurrency),
      },
      filePath,
      holidayKey,
      holidayName: String(frontmatter.holiday_name || frontmatter.name || toTitleFromHolidayKey(holidayKey || guessHolidayTagFromName(this.getHolidayBudgetNameFromPath(filePath)))).trim(),
      plannedExpenses,
      savingsDisplayMode: String(frontmatter.savings_display_mode || "dual-phase").trim().toLowerCase(),
      savingsProgressMode: String(frontmatter.savings_progress_mode || "account-plus-paid-planned").trim().toLowerCase(),
      savingsDueDate: core.parseIsoDate(frontmatter.savings_due_date || frontmatter.goal_due_date || frontmatter.start_date || ""),
      savingsGoalAmount: core.parseNumber(frontmatter.savings_goal_amount || frontmatter.total_budget || ""),
      savingsGoalKey: core.normalizeCategoryPath(frontmatter.savings_goal_key || frontmatter.goal_key || holidayKey.split("/")[1] || ""),
      savingsStartingBalance: core.parseNumber(frontmatter.savings_starting_balance || frontmatter.starting_balance || "0") || 0,
      startDate: core.parseIsoDate(frontmatter.start_date || frontmatter.start || frontmatter.departure_date || ""),
      totalBudget: core.parseNumber(frontmatter.total_budget || frontmatter.budget || frontmatter.total || ""),
      totals: {
        allocated: Number(allocatedTotals.allocated.toFixed(2)),
        booked: Number(plannedTotals.booked.toFixed(2)),
        planned: Number(plannedTotals.planned.toFixed(2)),
      },
    };
  }

  parseSavingsGoalContent(content, filePath = "") {
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter.goal_key && !frontmatter.savings_goal_key && !frontmatter.target_amount) return null;
    return {
      activeSavingsGoal: /^(?:true|yes|1)$/i.test(String(frontmatter.active_savings_goal || "false")),
      carryMissedSavings: /^(?:true|yes|1)$/i.test(String(frontmatter.carry_missed_savings || "false")),
      currency: core.normalizeCurrency(frontmatter.currency || this.settings.defaultCurrency),
      dueDate: core.parseIsoDate(frontmatter.due_date || frontmatter.savings_due_date || ""),
      filePath,
      goalKey: core.normalizeCategoryPath(frontmatter.goal_key || frontmatter.savings_goal_key || buildGoalKeyFromName(frontmatter.goal_name || filePath)),
      goalName: String(frontmatter.goal_name || frontmatter.name || String(filePath || "").split("/").pop()?.replace(/\.md$/i, "") || "Savings Goal").trim(),
      goalType: String(frontmatter.goal_type || "general").trim().toLowerCase(),
      savingsDisplayMode: String(frontmatter.savings_display_mode || "standard").trim().toLowerCase(),
      savingsProgressMode: String(frontmatter.savings_progress_mode || "account-only").trim().toLowerCase(),
      startingBalance: core.parseNumber(frontmatter.starting_balance || frontmatter.savings_starting_balance || "0") || 0,
      targetAmount: core.parseNumber(frontmatter.target_amount || frontmatter.savings_goal_amount || "0") || 0,
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
      `holiday_name: ${holidayTitle}`,
      `holiday_tag: ${normalizedHolidayKey}`,
      "total_budget: 0",
      `savings_goal_key: ${normalizedHolidayKey.split("/")[1] || "holiday"}`,
      "savings_goal_amount: 0",
      "savings_starting_balance: 0",
      `savings_due_date: ${startDate}`,
      "active_savings_goal: false",
      "carry_missed_savings: false",
      "savings_display_mode: dual-phase",
      "savings_progress_mode: account-plus-paid-planned",
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
      "```savings-dashboard",
      "```",
      "",
      "## Planned Expenses",
      "",
      "`Booked` means reserved or committed. If Booked is above 0 it overrides Planned for your remaining holiday budget.",
      "",
      "| Item | Category | Planned | Booked | Start | End | Link |",
      "| --- | --- | ---: | ---: | --- | --- | --- |",
      ...DEFAULT_HOLIDAY_PLANNED_EXPENSES.map((item) => `| ${item.item} | ${item.category} | 0 | 0 | ${startDate} | ${startDate} |  |`),
      "",
      "## Allocated Expenses",
      "",
      "Use this table for predicted in-trip spending like transport, shopping, and food. If Start and End are blank the row spans the whole trip.",
      "",
      "| Item | Category | Allocated | Start | End | Link |",
      "| --- | --- | ---: | --- | --- | --- |",
      ...DEFAULT_HOLIDAY_ALLOCATED_EXPENSES.map((item) => `| ${item.item} | ${item.category} | 0 |  |  |  |`),
      "",
      "## Planned Expenses Log",
      "",
      "- Log planned payments in daily notes with tags like `#log/spending/${normalizedHolidayKey}/planned/flights`.",
      "- When the total logged against a category matches its `Booked` amount, the dashboard marks it fully paid.",
      "",
    ].join("\n");
  }

  buildSavingsGoalNoteContent(title, options = {}) {
    const goalName = String(title || "Savings Goal").trim() || "Savings Goal";
    const goalKey = core.normalizeCategoryPath(options.goalKey || buildGoalKeyFromName(goalName));
    const dueDate = core.parseIsoDate(options.dueDate || "") || core.todayIsoLocal();
    const currency = core.normalizeCurrency(options.currency || this.settings.defaultCurrency);
    return [
      "---",
      `goal_name: ${goalName}`,
      `goal_key: ${goalKey}`,
      "goal_type: general",
      "target_amount: 0",
      "starting_balance: 0",
      `due_date: ${dueDate}`,
      "active_savings_goal: false",
      "carry_missed_savings: false",
      "savings_display_mode: standard",
      "savings_progress_mode: account-only",
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
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(archivePrefix))
      .filter((file) => file.path !== defaultBudgetPath);
  }

  getSavingsGoalFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    const archivePrefix = normalizePath(`${this.settings.budgetArchiveFolderPath}/`);
    const defaultBudgetPath = this.getDefaultBudgetNotePath();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(archivePrefix))
      .filter((file) => file.path !== defaultBudgetPath)
      .filter((file) => {
        const content = this.app.vault.cachedRead ? true : true;
        return true;
      });
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
        .trim() || "Savings Goal";
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
    await this.app.vault.modify(file, nextContent);
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
    const actualTripSpend = core.roundCurrencyAmount(actualEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
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
    return core.summarizeGoalProgress(effectiveGoalDefinition, allEntries, referenceDate, {
      period: options.period || this.settings.budgetCheckPeriod || "week",
      weekStartsOn: this.settings.weekStartsOn,
    });
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
    const realEntries = (entries || []).filter(
      (entry) => !core.isPlannedExpenseEntry(entry) && !entry.isIncome && !entry.isGoalContribution && entry.entryType !== "goal-withdrawal"
    );
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
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const limit = core.scaleBudgetLimit(
          Number(budget.limit || 0),
          budget.period,
          range,
          referenceDate || range.start,
          this.settings.weekStartsOn
        );
        const ratio = limit > 0 ? spent / limit : 0;
        return {
          ...budget,
          effectiveLimit: limit,
          remaining: Number((limit - spent).toFixed(2)),
          ratio,
          spent: Number(spent.toFixed(2)),
        };
      })
      .filter((budget) => Number.isFinite(budget.effectiveLimit) && budget.effectiveLimit > 0);
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

  renderBudgets(wrapper, budgets, currency, options = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: options.title || "Budget Progress" });

    if (!budgets.length) {
      if (!options.hideEmptyState) {
        section.createDiv({ cls: "finance-tracker-empty", text: options.emptyText || "No matching budgets for this period yet." });
      }
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const budget of budgets) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      const status = budget.ratio > 1 ? "is-over" : budget.ratio > 0.8 ? "is-near" : "is-good";
      item.createDiv({
        cls: "finance-tracker-budget-title",
        text: `${budget.name} - ${core.formatCurrency(budget.spent, currency)} / ${core.formatCurrency(budget.effectiveLimit || budget.limit, currency)}`,
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
    section.createEl("h4", { text: "Savings Activity" });
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
      { label: "Holiday Budget", value: metrics.totalBudget > 0 ? core.formatCurrency(metrics.totalBudget, currency) : "Not set" },
      { label: "Total Spent", value: core.formatCurrency(metrics.totalSpent, currency) },
      { label: "Total Spent %", value: metrics.totalBudget > 0 ? `${metrics.totalSpentPercent}%` : "Not set" },
      {
        label: "Remaining",
        value:
          metrics.totalBudget > 0
            ? core.formatCurrency(metrics.remaining, currency)
            : "Not set",
      },
      { label: "Can Spend / Day", value: core.formatCurrency(metrics.canSpendPerDay, currency) },
      { label: "Trip Days So Far", value: String(metrics.tripDays) },
      { label: "Avg / Day", value: core.formatCurrency(metrics.averageExcludingAccommodation, currency) },
      { label: "Avg Accommodation / Day", value: core.formatCurrency(metrics.averageAccommodationPerDay, currency) },
      { label: "Avg Transport / Day", value: core.formatCurrency(metrics.averageTransportPerDay, currency) },
      { label: "Avg Food / Day", value: core.formatCurrency(metrics.averageFoodPerDay, currency) },
    ];

    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
  }

  renderPlannedExpenses(wrapper, plannedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned Expenses" });

    if (!plannedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No planned trip costs found yet. Add rows to the Planned Expenses table in the holiday budget note.",
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
    section.createEl("h4", { text: "Allocated Expenses" });

    if (!allocatedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No allocated in-trip costs found yet. Add rows to the Allocated Expenses table in the holiday budget note.",
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
    section.createEl("h4", { text: "Planned Expenses Calendar" });
    const colorByCategory = {
      accommodation: "is-accommodation",
      flights: "is-flights",
      recreation: "is-recreation",
    };
    const startDate = core.parseIsoDate(holidayMeta?.startDate || "");
    const endDate = core.parseIsoDate(holidayMeta?.endDate || "");
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

    const days = [];
    for (let day = startDate; day && day <= endDate; day = core.addDays(day, 1)) {
      days.push(day);
    }

    const itemsByDay = new Map();
    for (const day of days) {
      const entryItems = calendarEntries.filter((item) => {
        const itemStart = item.startDate || startDate;
        const itemEnd = item.endDate || endDate;
        return day >= itemStart && day <= itemEnd;
      });
      itemsByDay.set(day, entryItems);
    }

    const grid = section.createDiv({ cls: "finance-tracker-calendar-grid" });
    const details = section.createDiv({ cls: "finance-tracker-calendar-details" });
    const renderDayDetails = (day) => {
      details.empty();
      const matching = itemsByDay.get(day) || [];
      details.createEl("h5", { text: day });
      if (!matching.length) {
        details.createDiv({ cls: "finance-tracker-empty", text: "No planned items for this day." });
        return;
      }
      for (const item of matching) {
        const row = details.createDiv({ cls: "finance-tracker-budget-card" });
        row.createDiv({ cls: "finance-tracker-budget-title", text: item.item });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${core.titleCaseSegment(item.category)} · ${core.formatCurrency(item.displayAmount || 0, holidayMeta.currency)}`,
        });
        const links = item.links || [];
        if (links.length) {
          const linksEl = row.createDiv({ cls: "finance-tracker-calendar-links" });
          for (const link of links) {
            const button = linksEl.createEl("button", { text: link.label });
            button.addEventListener("click", async () => {
              await this.app.workspace.openLinkText(link.path, holidayMeta.filePath || "", true);
            });
          }
        }
        const extraLines = (item.textLines || []).filter((line) => !/\b\d{4}-\d{2}-\d{2}\b/.test(line));
        for (const line of extraLines) {
          row.createDiv({ cls: "finance-tracker-budget-meta", text: line });
        }
      }
    };

    for (const day of days) {
      const button = grid.createEl("button", { cls: "finance-tracker-calendar-day" });
      button.createDiv({ cls: "finance-tracker-calendar-date", text: day });
      const chips = button.createDiv({ cls: "finance-tracker-calendar-chips" });
      for (const item of itemsByDay.get(day) || []) {
        chips.createDiv({
          cls: `finance-tracker-calendar-chip ${colorByCategory[core.primaryCategory(item.category)] || ""}`,
          text: item.item,
        });
      }
      button.addEventListener("click", () => renderDayDetails(day));
    }

    renderDayDetails(days[0]);
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

  renderSavingsSummary(wrapper, goal, summary, currency, extras = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: goal.goalName || "Savings Goal" });
    const cards = section.createDiv({ cls: "finance-tracker-summary" });
    const cardData = goal.goalType === "holiday"
      ? [
        { label: "Target", value: core.formatCurrency(summary.targetAmount, currency) },
        { label: "Current Account Balance", value: core.formatCurrency(summary.currentAccountBalance, currency) },
        { label: "Paid Planned Expenses", value: core.formatCurrency(summary.paidPlannedExpenses, currency) },
        { label: "Saved Progress", value: core.formatCurrency(summary.savedProgress, currency) },
        { label: summary.amountRemainingLabel, value: core.formatCurrency(summary.amountRemaining, currency) },
        { label: "Saved %", value: summary.targetAmount > 0 ? `${summary.proportionSaved}%` : "0%" },
        { label: "Required This Period", value: core.formatCurrency(summary.requiredPerPeriod, currency) },
        { label: "This Period", value: core.formatCurrency(summary.currentPeriodContribution, currency) },
        { label: "Avg Accommodation / Day", value: core.formatCurrency(extras.averageAccommodationPerDay || 0, currency) },
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
    for (const card of cardData) {
      const element = cards.createDiv({ cls: "finance-tracker-summary-card" });
      element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
      element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    }
  }

  async renderSavingsDashboard(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

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
    header.createEl("h3", { text: config.title || `${goalDefinition.goalName} ${goalDefinition.goalType === "holiday" ? "Trip Preparation Dashboard" : "Savings Dashboard"}` });
    if (goalDefinition.goalType === "holiday") {
      const holidayMeta = this.parseHolidayBudgetContent(await this.app.vault.cachedRead(sourceFile), sourceFile.path);
      const plannedEntries = await this.collectTransactionsForHoliday(holidayMeta.holidayKey, {
        start: "1900-01-01",
        end: referenceDate,
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

  async renderHolidayDashboard(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

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
      const exportButton = headerActions.createEl("button", { text: "Export Holiday CSV" });
      exportButton.addEventListener("click", async () => {
        await this.exportEntriesToCsv(actualEntries, `holiday-${holidayKey.replace(/\//g, "-")}-${effectiveEnd || referenceDate}`);
      });
      if (budgetFile instanceof TFile) {
        const budgetButton = headerActions.createEl("button", { text: "Open Holiday Budget" });
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

  async renderDailyBudgetCheck(source, el, ctx) {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const basePeriod = config.period || this.settings.budgetCheckPeriod || "week";
    const range = core.toPeriodRange({
      period: basePeriod,
      referenceDate,
      start: config.start,
      end: config.end,
      weekStartsOn: this.settings.weekStartsOn,
    });

    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const groupBy = String(config.groupby || "full").toLowerCase();
    const budgets = await this.loadBudgets("default");
    const sectionPeriods = core.getDailyBudgetSectionPeriods(basePeriod);
    const normalizedBasePeriod = core.normalizeBudgetPeriod(basePeriod);
    const sectionResults = [];
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
        sectionResults.push({
          period: sectionPeriod,
          progress,
          range: sectionRange,
        });
      }
    }

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

    const holidayContext = await this.findHolidayContextForDate(referenceDate);
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
      const dailyAdjustedCanSpend = metrics.remainingTripDays > 0
        ? core.roundCurrencyAmount(metrics.spendableRemaining / metrics.remainingTripDays)
        : 0;
      const summary = wrapper.createDiv({ cls: "finance-tracker-summary" });
      const card = summary.createDiv({ cls: "finance-tracker-summary-card" });
      card.createDiv({ cls: "finance-tracker-summary-label", text: "Can Spend / Day" });
      card.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(dailyAdjustedCanSpend, holidayContext.currency || currency) });
    }

    if (!sectionResults.length) {
      this.renderBudgets(wrapper, [], currency);
    } else {
      for (const section of sectionResults) {
        this.renderBudgets(wrapper, section.progress, currency, {
          hideEmptyState: true,
          title: `${core.titleCaseSegment(section.period)} Budget Progress`,
        });
      }
    }

    const savingsGoals = (await this.collectSavingsGoalDefinitions()).filter((goal) => goal.activeSavingsGoal);
    if (savingsGoals.length) {
      const activeGoalsSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      activeGoalsSection.createEl("h4", { text: "Active Savings Goals" });
      for (const goal of savingsGoals) {
        const summary = await this.buildSavingsGoalSummary(goal, referenceDate);
        const row = activeGoalsSection.createDiv({ cls: "finance-tracker-budget-card" });
        row.createDiv({
          cls: "finance-tracker-budget-title",
          text: `${goal.goalName} - ${core.formatCurrency(summary.requiredPerPeriod, goal.currency || currency)} this ${this.settings.budgetCheckPeriod}`,
        });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${core.formatCurrency(summary.currentSaved, goal.currency || currency)} saved · ${core.formatCurrency(summary.amountRemaining, goal.currency || currency)} remaining`,
        });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: summary.currentPeriodContribution >= summary.requiredPerPeriod
            ? "On track for this period."
            : "Still below this period's target.",
        });
      }
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

    const allEntries = await this.collectTransactionsForRange(range);
    const entries = allEntries.filter(
      (entry) => !core.isPlannedExpenseEntry(entry) && !entry.isIncome && !entry.isGoalContribution && entry.entryType !== "goal-withdrawal"
    );
    this.renderSummary(wrapper, entries, currency, range);

    const grouped = core.groupTransactionsByCategory(entries, groupBy);
    this.renderPieChart(wrapper, grouped, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));

    const budgets = await this.loadBudgets("default");
    const budgetProgress = this.buildBudgetProgress(entries, budgets, range, groupBy, referenceDate);
    this.renderBudgets(wrapper, budgetProgress, currency);
    await this.renderSavingsActivity(wrapper, allEntries, currency, range, referenceDate);
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
    contentEl.createEl("h2", { text: `Add Exchange Rate: ${this.budgetFile.basename}` });

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
    const saveButton = actions.createEl("button", { text: "Save Rate" });
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
    contentEl.createEl("h2", { text: "Create Savings Goal" });

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
    const createButton = actions.createEl("button", { text: "Create Goal Note" });
    createButton.addEventListener("click", async () => {
      await this.submit();
    });
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

    addSection("Savings Goals", "Create standalone savings goal notes for things like a house deposit or rainy day fund.");
    const savingsActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createSavingsGoalButton = savingsActions.createEl("button", { text: "Create Savings Goal" });
    createSavingsGoalButton.addEventListener("click", () => {
      new SavingsGoalModal(this.app, this.plugin, async () => {
        this.display();
      }).open();
    });

  }
}

module.exports = FinanceTrackerPlugin;
