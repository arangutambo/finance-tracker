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

  function extractChildLines(lines, startIndex) {
    const childLines = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = String(lines[index] || "");
      if (/^\t\t- /.test(line) || /^\s{4,}- /.test(line)) {
        childLines.push(line.replace(/^\s*-\s*/, "").trim());
        continue;
      }
      if ((/^\t- /.test(line) || /^\s{2,}- /.test(line)) && !/#log\//i.test(line)) {
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

  return {
    addDays,
    recomputeSpendingTotals,
    computeBudgetPace,
    replaceTransactionBlock,
    removeTransactionBlock,
    canonicalizeFinanceTag,
    migrateFinanceTagsInContent,
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
  autoDrainInbox: true,
  processedExternalIds: [],
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const HOLIDAY_DASHBOARD_BLOCK = "holiday-dashboard";
const SAVINGS_DASHBOARD_BLOCK = "savings-dashboard";
const DAILY_BUDGET_VIEW = "finance-tracker-daily";
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

    this.registerMarkdownCodeBlockProcessor(SAVINGS_DASHBOARD_BLOCK, async (source, el, ctx) => {
      await this.renderSavingsDashboard(source, el, ctx);
    });

    this.registerView(DAILY_BUDGET_VIEW, (leaf) => new DailyBudgetView(leaf, this));

    this.addRibbonIcon("coins", "Daily Budget", () => this.activateDailyBudgetView());
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
      id: "finance-tracker-migrate-tags",
      name: "Migrate legacy holiday tags to canonical form",
      callback: () => new TagMigrationModal(this.app, this).open(),
    });

    this.app.workspace.onLayoutReady(() => {
      this.activateDailyBudgetView();
      this.setupCaptureInbox();
      this.setupIndexAndTotals();
      this.updateStatusBar().catch(() => {});
    });

    this.setupJournalCalendarIntegration();
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
    const leaves = this.app.workspace.getLeavesOfType("journal-calendar");
    for (const leaf of leaves) {
      const containerEl = leaf.view?.containerEl;
      if (!containerEl) continue;
      await this.decorateJournalCalendarLeaf(containerEl);
      this._watchJournalCalendarGrid(containerEl);
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
      if (hasExternalChange) this._scheduleCalendarDecoration();
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
      if (entry.isIncome || entry.isGoalContribution || entry.isPlannedExpense || entry.entryType === "goal-withdrawal") continue;
      const iso = String(entry.date || "");
      if (iso) spendByDate.set(iso, (spendByDate.get(iso) || 0) + Number(entry.amount || 0));
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
      externalId: String(params.externalid || params.externalId || params.id || "").trim(),
      transaction: String(params.transaction || "").trim(),
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

  async loadMerchantMap() {
    const path = normalizePath(this.settings.merchantMapPath || "");
    const map = new Map();
    if (!path) return map;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return map;
    const content = await this.app.vault.cachedRead(file);
    for (const rows of core.parseMarkdownTable(content)) {
      for (const row of rows) {
        const merchant = core.normalizeMerchant(row.merchant || row.payee || row.name || "");
        const category = core.normalizeCategoryPath(row.category || row.cat || "");
        if (merchant && category) map.set(merchant, category);
      }
    }
    return map;
  }

  async guessCategoryForMerchant(merchant) {
    const key = core.normalizeMerchant(merchant);
    if (!key) return "";
    const map = await this.loadMerchantMap();
    return map.get(key) || "";
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
      await this.app.vault.create(normalizePath(`${folder}/reconcile-${stamp}.txt`), `${line}\n`);
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
    await this.app.vault.modify(file, next);
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
    await this.app.vault.modify(file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  async rememberMerchantCategory(merchant, category) {
    const cleanMerchant = String(merchant || "").replace(/\s+/g, " ").trim();
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!cleanMerchant || !cleanCategory) return;
    const path = normalizePath(this.settings.merchantMapPath || "");
    if (!path) return;
    const existing = await this.loadMerchantMap();
    if (existing.get(core.normalizeMerchant(cleanMerchant)) === cleanCategory) return;
    const row = `| ${cleanMerchant} | ${cleanCategory} |`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.upsertFile(path, `# Merchant Map\n\n| Merchant | Category |\n| --- | --- |\n${row}\n`);
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    const sepIndex = lines.findIndex((line) => /^\s*\|[\s:\-|]+\|\s*$/.test(line));
    if (sepIndex >= 0) {
      lines.splice(sepIndex + 1, 0, row);
    } else {
      lines.push("", "| Merchant | Category |", "| --- | --- |", row);
    }
    await this.app.vault.modify(file, lines.join("\n"));
  }

  // Dry run: which daily notes contain legacy holiday tags, with a few samples.
  async scanLegacyTags() {
    const files = this.getDailyNoteFiles();
    const changed = [];
    const samples = [];
    let totalLines = 0;
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const result = core.migrateFinanceTagsInContent(content);
      if (result.changedLines > 0) {
        changed.push({ path: file.path, count: result.changedLines });
        totalLines += result.changedLines;
        if (samples.length < 6) {
          for (const match of content.matchAll(/#([^\s#\]]+)/g)) {
            const canonical = core.canonicalizeFinanceTag(match[1]);
            if (canonical) {
              samples.push({ before: `#${match[1]}`, after: `#${canonical}` });
              if (samples.length >= 6) break;
            }
          }
        }
      }
    }
    return { files: changed, totalFiles: changed.length, totalLines, samples };
  }

  async applyTagMigration() {
    const files = this.getDailyNoteFiles();
    let changedFiles = 0;
    let changedLines = 0;
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const result = core.migrateFinanceTagsInContent(content);
      if (result.changedLines > 0) {
        await this.app.vault.modify(file, result.content);
        this.invalidateIndexEntry(file.path);
        changedFiles += 1;
        changedLines += result.changedLines;
      }
    }
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    return { changedFiles, changedLines };
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
      entries.filter((entry) => !entry.isIncome && !entry.isGoalContribution).reduce((total, entry) => total + Number(entry.amount || 0), 0);
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
        const pathDate = core.extractNoteDate("", file.path);
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
      await this.app.vault.modify(file, next);
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
    const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const days = core.daysBetweenInclusive(range.start, range.end);
    const avgPerDay = days > 0 ? total / days : total;
    const grouped = core.groupTransactionsByCategory(entries, "primary");
    const topCategory = grouped[0]?.label || "None";

    const cardData = [
      { label: "Total", value: core.formatCurrency(total, currency) },
      { label: "Avg / Day", value: core.formatCurrency(core.roundCurrencyAmount(avgPerDay), currency) },
    ];

    if (Number.isFinite(options.previousTotal)) {
      const delta = total - options.previousTotal;
      const pct = options.previousTotal > 0 ? Math.round((delta / options.previousTotal) * 100) : null;
      const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
      const pctText = pct === null ? "" : ` (${delta >= 0 ? "+" : ""}${pct}%)`;
      cardData.push({
        label: `vs Prev ${core.titleCaseSegment(range.period || "period")}`,
        value: `${arrow} ${core.formatCurrency(Math.abs(delta), currency)}${pctText}`,
        cls: delta > 0 ? "is-up" : delta < 0 ? "is-down" : "",
      });
    }
    cardData.push({ label: "Top Category", value: topCategory });

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
        .reduce((acc, entry) => acc + Number(entry.amount || 0), 0);
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
    let bars = "";
    totals.forEach((entry, index) => {
      const height = (entry.sum / maxValue) * (H - pad * 2);
      const x = pad + index * (barWidth + gap);
      const y = H - pad - height;
      const cls = entry.date === today ? "ft-spark-today" : "ft-spark-bar";
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.5, barWidth).toFixed(1)}" height="${Math.max(0, height).toFixed(1)}" rx="1" class="${cls}"></rect>`;
    });
    let budgetLine = "";
    if (perDayBudget > 0) {
      const lineY = H - pad - (perDayBudget / maxValue) * (H - pad * 2);
      budgetLine = `<line x1="${pad}" y1="${lineY.toFixed(1)}" x2="${W - pad}" y2="${lineY.toFixed(1)}" class="ft-spark-budget"></line>`;
    }
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Daily Spend" });
    const holder = section.createDiv({ cls: "finance-tracker-spark" });
    holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="ft-spark-svg" role="img">${budgetLine}${bars}</svg>`;
    if (perDayBudget > 0) {
      section.createDiv({ cls: "finance-tracker-budget-meta", text: `Line = ${core.formatCurrency(perDayBudget, currency)}/day budget` });
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

  renderPieChartMini(wrapper, groups, currency) {
    const total = groups.reduce((sum, group) => sum + group.total, 0);
    if (!total) return;

    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: "By Category" });

    const size = 200;
    const center = size / 2;
    const radius = 80;
    let angle = 0;

    const slices = groups.map((group, index) => {
      const ratio = group.total / total;
      const angleSize = ratio * 360;
      const startAngle = angle;
      angle += angleSize;
      return { ...group, color: PIE_COLORS[index % PIE_COLORS.length], ratio, startAngle, endAngle: angle };
    });

    const svgParts = [
      `<svg viewBox="0 0 ${size} ${size}" class="finance-tracker-pie-svg finance-tracker-pie-svg--mini" role="img" aria-label="Spending by category">`,
    ];
    for (const slice of slices) {
      if (slice.ratio >= 0.999) {
        svgParts.push(`<circle cx="${center}" cy="${center}" r="${radius}" fill="${slice.color}" class="finance-tracker-pie-slice"></circle>`);
      } else {
        svgParts.push(`<path d="${describePieSlice(center, center, radius, slice.startAngle, slice.endAngle)}" fill="${slice.color}" class="finance-tracker-pie-slice"></path>`);
      }
    }
    svgParts.push("</svg>");

    const chartHost = pieSection.createDiv({ cls: "finance-tracker-pie-host" });
    chartHost.innerHTML = svgParts.join("");

    const legend = pieSection.createDiv({ cls: "finance-tracker-legend finance-tracker-legend--mini" });
    for (const slice of slices) {
      const item = legend.createDiv({ cls: "finance-tracker-legend-item" });
      const swatch = item.createDiv({ cls: "finance-tracker-legend-swatch" });
      swatch.style.backgroundColor = slice.color;
      item.createDiv({
        cls: "finance-tracker-legend-label",
        text: `${slice.label} · ${core.formatCurrency(slice.total, currency)} (${Math.round(slice.ratio * 100)}%)`,
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

    const list = section.createDiv({ cls: `finance-tracker-budget-list${options.compact ? " is-compact" : ""}` });
    for (const budget of budgets) {
      const item = list.createDiv({ cls: `finance-tracker-budget-card${options.compact ? " is-compact" : ""}` });
      const pace = budget.pace;
      const behindPace = pace && pace.totalDays > 0 && !pace.onPace;
      const status = budget.ratio > 1 ? "is-over" : behindPace ? "is-near" : "is-good";
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

      const bar = item.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = bar.createDiv({ cls: `finance-tracker-budget-fill ${status}` });
      fill.style.width = `${Math.min(budget.ratio, 1.4) * 100}%`;
      if (pace && pace.elapsedFraction > 0 && pace.elapsedFraction < 1) {
        const marker = bar.createDiv({ cls: "finance-tracker-budget-pace-marker" });
        marker.style.left = `${(pace.elapsedFraction * 100).toFixed(1)}%`;
        marker.setAttribute("aria-label", "Pace marker — where you should be today");
      }
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

  async renderDailyBudgetCheckInto(el, referenceDate, groupBy = "full") {
    if (typeof el.empty === "function") {
      el.empty();
    } else {
      el.innerHTML = "";
    }

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
    const spendEntries = periodEntries.filter(
      (e) => !e.isIncome && !e.isGoalContribution && !e.isPlannedExpense && e.entryType !== "goal-withdrawal"
    );

    // Today's entries
    const todayEntries = (await this.collectTransactionsForRange({ start: referenceDate, end: referenceDate }))
      .filter((e) => !e.isIncome && !e.isGoalContribution && !e.isPlannedExpense && e.entryType !== "goal-withdrawal");

    const periodTotal = spendEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const todayTotal = todayEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });

    // Header
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: "Daily Budget" });
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
      leftCard.createDiv({ cls: "finance-tracker-summary-label", text: "Left / Day" });
      leftCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(pace.perDayRemaining, currency) });
    }

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
      const dailyCanSpend = metrics.remainingTripDays > 0
        ? core.roundCurrencyAmount(metrics.spendableRemaining / metrics.remainingTripDays)
        : 0;
      const holidayCard = summaryGrid.createDiv({ cls: "finance-tracker-summary-card" });
      holidayCard.createDiv({ cls: "finance-tracker-summary-label", text: `${holidayContext.name || "Trip"} / Day` });
      holidayCard.createDiv({ cls: "finance-tracker-summary-value", text: core.formatCurrency(dailyCanSpend, holidayContext.currency || currency) });
    }

    // Mini pie chart (sidebar-friendly: SVG centred + compact legend below)
    const grouped = core.groupTransactionsByCategory(spendEntries, "primary");
    if (grouped.length) {
      this.renderPieChartMini(wrapper, grouped, currency);
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
      goalsSection.createEl("h4", { text: "Savings Goals" });
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

    // Triage: period entries still needing a category (tap to fix).
    const needsCategory = spendEntries.filter((entry) => !entry.category || entry.category === "uncategorized");
    if (needsCategory.length) {
      const triage = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-tracker-triage" });
      triage.createEl("h4", { text: `Needs a Category (${needsCategory.length})` });
      for (const entry of needsCategory.slice(0, 12)) {
        const row = triage.createDiv({ cls: "finance-tracker-budget-card is-clickable is-uncategorized" });
        const title = row.createDiv({ cls: "finance-tracker-budget-title" });
        title.createSpan({ text: core.formatCurrency(entry.amount, currency) });
        title.createSpan({ cls: "finance-tracker-budget-meta", text: ` · ${entry.merchant || entry.date}` });
        row.addEventListener("click", () => new EditTransactionModal(this.app, this, entry).open());
      }
    }

    // Today's individual entries (tap to edit / recategorise / delete).
    if (todayEntries.length) {
      const todaySection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      todaySection.createEl("h4", { text: "Today's Entries" });
      for (const entry of todayEntries) {
        const row = todaySection.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
        if (!entry.category || entry.category === "uncategorized") row.addClass("is-uncategorized");
        const title = row.createDiv({ cls: "finance-tracker-budget-title" });
        title.createSpan({ text: core.formatCurrency(entry.amount, currency) });
        if (entry.merchant) title.createSpan({ cls: "finance-tracker-budget-meta", text: ` · ${entry.merchant}` });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: core.displayCategoryPath(entry.category) || entry.category || "Uncategorised",
        });
        row.addEventListener("click", () => new EditTransactionModal(this.app, this, entry).open());
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
    const filterReal = (list) =>
      list.filter(
        (entry) => !core.isPlannedExpenseEntry(entry) && !entry.isIncome && !entry.isGoalContribution && entry.entryType !== "goal-withdrawal"
      );
    const entries = filterReal(allEntries);

    // Previous comparable period (same length, immediately before) for the delta card.
    const spanDays = core.daysBetweenInclusive(range.start, range.end);
    const prevEnd = core.addDays(range.start, -1);
    const prevStart = core.addDays(prevEnd, -(spanDays - 1));
    const prevEntries = filterReal(await this.collectTransactionsForRange({ period: range.period, start: prevStart, end: prevEnd }));
    const previousTotal = core.roundCurrencyAmount(prevEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));

    this.renderSummary(wrapper, entries, currency, range, { previousTotal });

    const grouped = core.groupTransactionsByCategory(entries, groupBy);
    this.renderPieChart(wrapper, grouped, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));

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
  getDisplayText() { return "Daily Budget"; }
  getIcon() { return "coins"; }

  async onOpen() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
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
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-quick-add");
    contentEl.createEl("h3", { text: "Quick add transaction" });

    const input = contentEl.createEl("input", {
      type: "text",
      cls: "finance-quick-add-input",
      attr: { placeholder: "12 nobu restaurants   ·   $8 #transport Lime   ·   4.50 coffee snacks @yesterday" },
    });

    const preview = contentEl.createDiv({ cls: "finance-quick-add-preview" });

    const dateRow = contentEl.createDiv({ cls: "finance-quick-add-daterow" });
    dateRow.createSpan({ text: "Date " });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = this.date;
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
      const parsed = core.parseQuickAddInput(input.value, this.plugin.settings.categoryOptions || []);
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
      preview.setText(`${core.formatCurrency(parsed.amount, this.plugin.settings.defaultCurrency)}  ·  ${core.displayCategoryPath(category)}${merchant}  ·  ${date}`);
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

    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
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

  onOpen() {
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
    for (const option of this.plugin.settings.categoryOptions || []) {
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

class TagMigrationModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.scan = null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-migrate");
    contentEl.createEl("h3", { text: "Migrate legacy holiday tags" });
    contentEl.createEl("p", {
      cls: "finance-reconcile-hint",
      text: "Rewrites old holiday tag orderings to the canonical #log/spending/<year>/<key>/<category> form across your daily notes. This edits your journal — back up or commit first.",
    });

    const status = contentEl.createDiv({ cls: "finance-migrate-status", text: "Scanning…" });
    const preview = contentEl.createDiv({ cls: "finance-migrate-preview" });
    const buttons = contentEl.createDiv({ cls: "finance-reconcile-buttons" });

    try {
      this.scan = await this.plugin.scanLegacyTags();
    } catch (error) {
      status.setText(`Scan failed: ${error.message}`);
      return;
    }

    if (!this.scan.totalFiles) {
      status.setText("No legacy holiday tags found. Nothing to migrate. ✅");
      return;
    }

    status.setText(
      `${this.scan.totalLines} tag${this.scan.totalLines === 1 ? "" : "s"} in ${this.scan.totalFiles} note${this.scan.totalFiles === 1 ? "" : "s"} will be rewritten.`
    );
    if (this.scan.samples.length) {
      const list = preview.createEl("ul", { cls: "finance-migrate-samples" });
      for (const sample of this.scan.samples) {
        list.createEl("li").setText(`${sample.before}  →  ${sample.after}`);
      }
    }

    const applyButton = buttons.createEl("button", {
      text: `Migrate ${this.scan.totalFiles} note${this.scan.totalFiles === 1 ? "" : "s"}`,
      cls: "mod-cta",
    });
    applyButton.addEventListener("click", async () => {
      applyButton.disabled = true;
      try {
        const result = await this.plugin.applyTagMigration();
        new Notice(`Migrated ${result.changedLines} tag${result.changedLines === 1 ? "" : "s"} in ${result.changedFiles} note${result.changedFiles === 1 ? "" : "s"}`);
        this.close();
      } catch (error) {
        new Notice(`Migration failed: ${error.message}`);
        applyButton.disabled = false;
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
