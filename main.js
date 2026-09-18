"use strict";

const { ItemView, MarkdownRenderChild, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } = require("obsidian");

const core = (() => {
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
  function parseYahooChart(json) {
    const result = json?.chart?.result?.[0];
    if (!result) {
      const message = json?.chart?.error?.description || "no chart data";
      return { error: message };
    }
    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const history = [];
    timestamps.forEach((seconds, index) => {
      const close = Number(closes[index]);
      if (close > 0) history.push({ date: isoFromUnixSeconds(seconds), close: Number(close.toFixed(4)) });
    });
    const dividends = Object.values(result.events?.dividends || {})
      .map((dividend) => ({ date: isoFromUnixSeconds(dividend.date), amount: Number(dividend.amount) }))
      .filter((dividend) => dividend.date && dividend.amount > 0)
      .sort((left, right) => left.date.localeCompare(right.date));

    const price = Number(meta.regularMarketPrice);
    return {
      quote: price > 0
        ? {
            currency: normalizeCurrency(meta.currency || "", ""),
            exchange: meta.exchangeName || meta.fullExchangeName || "",
            name: meta.longName || meta.shortName || meta.symbol || "",
            previousClose: Number(meta.chartPreviousClose ?? meta.previousClose) || null,
            price,
            time: isoFromUnixSeconds(meta.regularMarketTime),
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

  return {
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
  openDailyNoteAfterCapture: false,
  dashboardDefaultGroupBy: "primary",
  dashboardSliceLabelThreshold: 0.08,
  // How far the recurring block's payment calendar looks ahead: "1", "3" or
  // "12" months. A `months:` (or `weeks:`) key in the block overrides it.
  paymentCalendarMonths: "3",
  budgetCheckPeriod: "week",
  weekStartsOn: "monday",
  captureInboxFolder: "Utility/Finance/Inbox",
  merchantMapPath: "Utility/Finance/Merchant Map.md",
  merchantMap: {},
  merchantMapMigrated: false,
  learnCategoriesFromHistory: true,
  autoDrainInbox: true,
  processedExternalIds: [],
  // Which transports are live. Every one of these can run at the same time —
  // crossMethodDuplicates is what stops that turning into double-logging.
  captureMethods: { url: true, batch: true, inbox: true, gist: false },
  crossMethodDuplicates: "skip",
  duplicateWindowDays: 1,
  captureLedger: [],
  gistCaptureId: "",
  gistCaptureToken: "",
  gistCaptureFilename: "finance-capture.txt",
  gistCapturePollMinutes: 15,
  gistCaptureLastSync: "",
  recurringTagPrefix: "subscriptions",
  recurringNoteName: "🔁 Recurring Payments.md",
  recurringSortOrder: "dueDate",
  runwayPeriod: "1 month",
  runwayMode: "spending",
  // The account runway is compared with. Blank until chosen.
  runwayAccount: "",
  excludedRecurringItems: [],
  // Bill suggestions dismissed with Ignore, by suggestion id.
  ignoredBillSuggestions: [],
  // Portfolio. Prices are typed in unless another source is chosen: "sheet"
  // (a published Google Sheet) or "yahoo". Both are opt-in network use.
  portfolioNotePath: "Utility/Finance/📈 Portfolio.md",
  priceSource: "manual",
  priceSheetUrl: "",
  priceRefreshMinutes: 60,
  marketCache: {},
  autoLogRecurring: false,
  quickAddUseNoteDate: false,
  tripModeActive: false,
  // Goal and trip prompts: key → the day "Not now" was pressed, and keys
  // dismissed for good.
  promptSnoozes: {},
  dismissedPrompts: [],
  activeTripGoalPath: "",
  schemaVersion: 1,
};

// Settings migrations run once and then never again, gated on the stored
// `schemaVersion`. Before this existed every heal below re-ran on every single
// load — cheap individually, but nothing recorded when one had done its job, so
// none could ever safely be deleted. Add a step by appending an entry and
// bumping DEFAULT_SETTINGS.schemaVersion; a migration whose `to` is older than
// every install you care about can then just be dropped.
const SETTINGS_MIGRATIONS = [
  {
    to: 1,
    describe: "0.1–0.6 settings cleanup",
    run(settings) {
      // The finance section was called "## Spending" before 0.2.0.
      if (!settings.spendingHeading || settings.spendingHeading === "## Spending") {
        settings.spendingHeading = DEFAULT_SETTINGS.spendingHeading;
      }
      // 0.2.0 could persist a Journals folder template verbatim
      // (e.g. "Journal/Daily/{{date:YYYY}}/{{date:MM}}").
      if (String(settings.dailyNotesFolder || "").includes("{{")) {
        settings.dailyNotesFolder = stripFolderTemplate(settings.dailyNotesFolder) || DEFAULT_SETTINGS.dailyNotesFolder;
      }
      if (settings.defaultBudgetNoteName === "Budget.md") {
        settings.defaultBudgetNoteName = DEFAULT_SETTINGS.defaultBudgetNoteName;
      }
      // Drop keys from schemas this plugin no longer has: the pre-0.1.0
      // csvExportFolder/categoryTagRoot/sourceTagRoot/budgetNotePath/
      // shortcutGuidePath, and categoryOptions (suggestions come from history
      // via collectKnownSuggestions, so the hand-maintained list did nothing).
      for (const key of Object.keys(settings)) {
        if (!(key in DEFAULT_SETTINGS)) delete settings[key];
      }
    },
  },
];

// Shown against each toggle in Settings → Capture methods.
const CAPTURE_METHOD_DESCRIPTIONS = {
  url: "A Shortcut opens obsidian://finance-capture?amount=… and Obsidian logs it. Works with any sync, but briefly foregrounds Obsidian for every transaction.",
  batch: "A Shortcut queues transactions on the phone and flushes them all at once via obsidian://finance-capture?lines=… — one app switch a day instead of one per tap.",
  inbox: "A Shortcut, Mac script, or the CSV reconcile drops a capture file into the inbox folder. Needs a vault the Files app can write to (iCloud Drive or Mac-local), so it does not work on the phone with Obsidian Sync.",
  gist: "The phone appends a line to a private GitHub gist and the plugin polls it. Captures without opening Obsidian, works on Obsidian Sync, and is the only method that works from an Apple Watch.",
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
const RUNWAY_BLOCK = "finance-runway";
const BILL_BLOCK = "finance-bill";
const DAILY_BUDGET_VIEW = "finance-tracker-daily";
const FINANCE_INBOX_VIEW = "finance-tracker-inbox";
const FINANCE_HUB_VIEW = "finance-tracker-hub";

// The hub's tabs, in order. Ids are what commands and saved layouts refer to,
// so they stay stable even if a label changes.
const FINANCE_HUB_TABS = [
  { id: "today", label: "Today" },
  { id: "inbox", label: "Inbox" },
  { id: "budgets", label: "Budgets" },
  { id: "bills", label: "Bills" },
  { id: "goals", label: "Goals & trips" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reviews", label: "Reviews" },
];
// Cadence display names live in core.RECURRING_CADENCES alongside the maths;
// this reads them from there rather than keeping a second copy in sync.
function cadenceLabel(cadence) {
  return core.RECURRING_CADENCES[cadence]?.label || core.titleCaseSegment(cadence);
}

// The registry table's prose, written into the recurring payments note both
// when the note is first created and when an older note is missing its table.
// One copy, because two had already drifted apart.
const RECURRING_REGISTRY_HELP = [
  "Hand-editable per-bill state (the checkboxes in settings and the manage block",
  "write to this table):",
  "",
  "- **Active** `no` pauses a bill; it moves to the Archived section, ready to resume.",
  "- **Auto-log** `yes` logs it automatically on its due day.",
  "- **Amount** overrides the inferred price.",
  "- **Variable** `yes` suits a fluctuating bill like a utility: it projects off the",
  "  average of recent payments rather than just the last one, and **Log now** prompts",
  "  for the real amount each time.",
  "- **Next Amount** + **Change Date** schedule a future price change, applied",
  "  automatically once the date arrives.",
  "- **Next Due** corrects the due-date schedule directly.",
  "- **End Date** retires the bill once nothing is due on or before it — for a",
  "  fixed-term contract.",
  "- **Payments Left** retires it after that many more payments, counting down each",
  "  time one is logged — for an instalment plan.",
];

// Runway is a computed display, not something you fund. Its only configuration
// is a period and a mode, both plugin settings — there is no note, no balance and
// no contribution.

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
  if (!normalized) return "Trip";
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

// Spelling slips in old tags, which would otherwise become permanent categories
// of their own. Applied per segment by the legacy-trip migration.
const LEGACY_CATEGORY_FIXES = {
  accommadation: "accommodation",
  accomodation: "accommodation",
  resturants: "restaurants",
  transporation: "transportation",
};

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
  const base = stripBudgetSuffix(value) || "Trip";
  return `${base} Budget`;
}

function parseWikiLinks(text) {
  const matches = Array.from(String(text || "").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g));
  return matches.map((match) => ({
    path: String(match[1] || "").trim(),
    label: String(match[2] || match[1] || "").trim(),
    raw: match[0],
  })).filter((link) => link.path);
}

// Compact money label for tight layouts: whole dollars lose the ".00".
function formatCurrencyShort(amount, currency) {
  return core.formatCurrency(amount, currency).replace(/\.00(?=\D|$)/, "");
}

// --- Shared card/row/button primitives ---------------------------------------
// Every block used to hand-build these three shapes, which meant the type scale
// and button weighting were re-decided (and re-diverged) at ~20 call sites.
// They are decided once, here.

// A strip of stat cards: small muted label above a large number, optionally a
// third muted line for supporting detail that should not compete with it.
function renderStatCards(host, cards) {
  const grid = host.createDiv({ cls: "finance-tracker-summary" });
  for (const card of (cards || []).filter(Boolean)) {
    const element = grid.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
    element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
    element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    if (card.hint) element.createDiv({ cls: "finance-tracker-summary-hint", text: card.hint });
  }
  return grid;
}

// A row's identity line: name left, money right and heavier — the way a receipt
// reads. Call sites used to concatenate the two into one span at one weight,
// which left the eye nothing to land on.
function renderRowTitle(host, name, amount = "") {
  const title = host.createDiv({ cls: "finance-tracker-budget-title ft-row-title" });
  title.createSpan({ cls: "ft-row-name", text: name });
  if (amount) title.createSpan({ cls: "ft-row-amount", text: amount });
  return title;
}

// Buttons are quiet outlines by default; `primary` marks the single action a
// row exists for. Also handles the disable-while-running / re-enable-on-failure
// dance that all 50-odd call sites were repeating by hand.
function addAction(host, label, onClick, options = {}) {
  const button = host.createEl("button", { text: label });
  if (options.primary) button.addClass("mod-cta");
  if (options.warning) button.addClass("mod-warning");
  if (options.tooltip) button.setAttribute("aria-label", options.tooltip);
  button.addEventListener("click", async (event) => {
    if (options.opensModal) {
      onClick(event);
      return;
    }
    button.disabled = true;
    try {
      await onClick(event);
    } catch (error) {
      new Notice(`${options.errorPrefix || label} failed: ${error.message}`);
      button.disabled = false;
    }
  });
  return button;
}

// A labelled checkbox for a genuine boolean. A button whose text reports its
// own state ("Auto-log: on") is the weakest way to show one.
function addToggleAction(host, label, checked, onChange) {
  const wrapper = host.createEl("label", { cls: "ft-inline-toggle" });
  const input = wrapper.createEl("input", { type: "checkbox" });
  input.checked = Boolean(checked);
  wrapper.createSpan({ text: label });
  input.addEventListener("change", async () => {
    input.disabled = true;
    try {
      await onChange(input.checked);
    } catch (error) {
      new Notice(`${label} failed: ${error.message}`);
      input.checked = !input.checked;
      input.disabled = false;
    }
  });
  return wrapper;
}

// Reduces a possibly-templated folder path ("Journal/Daily/{{date:YYYY}}") to
// its static prefix ("Journal/Daily"). Returns "" when nothing static remains.
function stripFolderTemplate(value) {
  return String(value || "")
    .split("{{")[0]
    .replace(/\/+$/, "")
    .trim();
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

// --- Shared input components ---------------------------------------------------
// Quick add had the only autocomplete in the plugin. Every other input — the
// edit modal's category, the merchant map, goal keys, trip tags, account names —
// was a plain text box you had to spell exactly right, against values the plugin
// already knows. These two are that popup, generalised.

// Deliberately hand-rolled rather than Obsidian's AbstractInputSuggest, which
// would raise minAppVersion from 1.0.0 to 1.4.10. The keyboard behaviour is the
// one quick add established: arrows move, Tab or Enter accepts while the popup
// is open, Esc closes it, and once it is closed Enter belongs to the form again.
class FinanceSuggest {
  constructor(input, options = {}) {
    this.input = input;
    this.getItems = options.getItems || (() => []);
    this.onChoose = options.onChoose || (() => {});
    this.limit = Number.isFinite(options.limit) ? options.limit : 8;
    this.items = [];
    this.highlighted = 0;

    // Inside a modal, Obsidian handles Escape through the modal's key scope before
    // the input ever sees the keydown — so Escape meant to dismiss the popup
    // closed the whole modal instead, taking whatever was typed with it. Given
    // the scope, the popup claims Escape while it is open and lets it through
    // once it is not.
    this.scope = options.scope || null;
    if (this.scope && typeof this.scope.register === "function") {
      this._escapeHandler = this.scope.register([], "Escape", () => {
        if (!this.items.length) return true;
        this.close();
        return false;
      });
    }

    const host = input.parentElement;
    if (host) host.addClass("finance-suggest-host");
    this.popup = (host || input).createDiv({ cls: "finance-suggest-popup" });
    this.popup.hide();

    this._onInput = () => this.refresh();
    this._onFocus = () => this.refresh();
    this._onBlur = () => window.setTimeout(() => this.close(), 150);
    this._onKeyDown = (event) => this.handleKey(event);
    input.addEventListener("input", this._onInput);
    input.addEventListener("focus", this._onFocus);
    input.addEventListener("blur", this._onBlur);
    input.addEventListener("keydown", this._onKeyDown);
  }

  refresh() {
    const query = String(this.input.value || "");
    let items = [];
    try {
      items = this.getItems(query) || [];
    } catch (error) {
      console.error("[finance-tracker] suggestion source failed", error);
    }
    this.items = items.slice(0, this.limit);
    this.highlighted = 0;
    this.render();
  }

  render() {
    this.popup.empty();
    if (!this.items.length) {
      this.popup.hide();
      return;
    }
    this.popup.show();
    this.items.forEach((item, index) => {
      const row = this.popup.createDiv({
        cls: `finance-suggest-item${index === this.highlighted ? " is-highlighted" : ""}`,
      });
      if (item.kind) row.createSpan({ cls: "finance-suggest-kind", text: item.kind });
      row.createSpan({ cls: "finance-suggest-label", text: item.label ?? item.value });
      if (item.hint) row.createSpan({ cls: "finance-suggest-hint", text: item.hint });
      // mousedown, not click: blur would close the popup before a click landed.
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.choose(item);
      });
    });
  }

  handleKey(event) {
    if (!this.items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.highlighted = (this.highlighted + 1) % this.items.length;
      this.render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.highlighted = (this.highlighted - 1 + this.items.length) % this.items.length;
      this.render();
      return;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      this.choose(this.items[this.highlighted]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  choose(item) {
    if (!item) return;
    this.input.value = item.value;
    this.close();
    this.onChoose(item);
    this.input.dispatchEvent(new Event("change"));
  }

  close() {
    this.items = [];
    this.popup.empty();
    this.popup.hide();
  }

  destroy() {
    this.close();
    if (this._escapeHandler && typeof this.scope?.unregister === "function") {
      this.scope.unregister(this._escapeHandler);
    }
    this.input.removeEventListener("input", this._onInput);
    this.input.removeEventListener("focus", this._onFocus);
    this.input.removeEventListener("blur", this._onBlur);
    this.input.removeEventListener("keydown", this._onKeyDown);
    this.popup.remove();
  }
}

// Picking a category is two decisions — which group, then which kind — and a
// single text box makes you spell out both from memory. This is a search box for
// people who know what they want, chips for people who would rather recognise
// than recall, and anything typed that matches nothing is simply a new category.
class CategoryPicker {
  constructor(host, options = {}) {
    this.categories = options.categories || [];
    this.onChange = options.onChange || (() => {});
    this.value = core.normalizeCategoryPath(options.value || "");

    this.el = host.createDiv({ cls: "finance-category-picker" });
    const inputRow = this.el.createDiv({ cls: "finance-category-picker-input" });
    this.input = inputRow.createEl("input", {
      type: "text",
      attr: { placeholder: options.placeholder || "food/takeaway", "aria-label": "Category" },
    });
    this.input.value = this.value;
    this.suggest = new FinanceSuggest(this.input, {
      getItems: (query) => this.matches(query),
      onChoose: (item) => this.setValue(item.value),
      scope: options.scope,
    });
    this.input.addEventListener("change", () => this.setValue(this.input.value, { silentInput: true }));

    this.majorRow = this.el.createDiv({ cls: "finance-category-chips" });
    this.subRow = this.el.createDiv({ cls: "finance-category-chips is-sub" });
    this.renderChips();
  }

  matches(query) {
    const needle = core.normalizeCategoryPath(query);
    const seen = new Set();
    const out = [];
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path || seen.has(path)) continue;
      const hit = !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle));
      if (!hit) continue;
      seen.add(path);
      out.push({ value: path, label: core.displayCategoryPath(path), kind: "category" });
    }
    // Anything typed that matches nothing is a new category, not a mistake.
    if (needle && !seen.has(needle)) {
      out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
    }
    return out;
  }

  majors() {
    const counts = new Map();
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path) continue;
      const major = path.split("/")[0];
      counts.set(major, (counts.get(major) || 0) + Number(category.count || 1));
    }
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([major]) => major);
  }

  children(major) {
    const seen = new Set();
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path.startsWith(`${major}/`)) continue;
      seen.add(path.split("/").slice(0, 2).join("/"));
    }
    return Array.from(seen).sort();
  }

  renderChips() {
    this.majorRow.empty();
    this.subRow.empty();
    const active = this.value.split("/")[0];
    for (const major of this.majors()) {
      const chip = this.majorRow.createEl("button", {
        cls: `finance-category-chip${major === active ? " is-active" : ""}`,
        text: core.titleCaseSegment(major),
        attr: { type: "button" },
      });
      chip.addEventListener("click", () => this.setValue(major));
    }
    if (!active) return;
    for (const child of this.children(active)) {
      const chip = this.subRow.createEl("button", {
        cls: `finance-category-chip is-sub${child === this.value ? " is-active" : ""}`,
        text: core.titleCaseSegment(child.split("/").pop()),
        attr: { type: "button" },
      });
      chip.addEventListener("click", () => this.setValue(child));
    }
  }

  setValue(value, options = {}) {
    this.value = core.normalizeCategoryPath(value);
    if (!options.silentInput) this.input.value = this.value;
    this.renderChips();
    this.onChange(this.value);
  }

  getValue() {
    return core.normalizeCategoryPath(this.input.value || this.value);
  }

  destroy() {
    this.suggest?.destroy();
  }
}

class FinanceTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addSettingTab(this.createSettingTab());

    this.addCommand({
      id: "finance-tracker-export-csv",
      name: "Export transactions to CSV",
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
      name: "Open budgets note",
      callback: async () => {
        await this.openBudgetNote();
      },
    });

    this.addCommand({
      id: "finance-tracker-add-exchange-rate",
      name: "Add trip exchange rate",
      callback: async () => {
        await this.openExchangeRateCommand();
      },
    });

    this.addCommand({
      id: "finance-tracker-create-savings-goal",
      name: "Create savings goal",
      callback: async () => {
        this.openNewGoal();
      },
    });

    if (typeof this.registerObsidianProtocolHandler === "function") {
      this.registerObsidianProtocolHandler(FINANCE_CAPTURE_ACTION, async (params) => {
        await this.handleCapture(params || {});
      });
    } else {
      console.warn("[finance-tracker] Obsidian protocol handlers are not available in this app version.");
    }

    // Every block re-renders when the notes behind it change, so a weekly review
    // left open beside today's note keeps up with what gets logged.
    this.registerFinanceBlock(DASHBOARD_BLOCK, this.renderDashboard);
    this.registerFinanceBlock(HOLIDAY_DASHBOARD_BLOCK, this.renderHolidayDashboard);
    this.registerFinanceBlock(SAVINGS_DASHBOARD_BLOCK, this.renderSavingsDashboard);
    this.registerFinanceBlock(RECURRING_BLOCK, this.renderRecurringBlock);
    this.registerFinanceBlock(SPLITS_BLOCK, this.renderSplitsBlock);
    this.registerFinanceBlock(FORECAST_BLOCK, this.renderForecastBlock);
    this.registerFinanceBlock(NETWORTH_BLOCK, this.renderNetWorthBlock);
    this.registerFinanceBlock(QUERY_BLOCK, this.renderQueryBlock);
    this.registerFinanceBlock(GOALS_BLOCK, this.renderGoalsBlock);
    this.registerFinanceBlock(RUNWAY_BLOCK, this.renderRunwayBlock);
    this.registerFinanceBlock(BILL_BLOCK, this.renderBillBlock);
    this.registerFinanceBlock(PORTFOLIO_BLOCK, this.renderPortfolioBlock);

    this.registerView(DAILY_BUDGET_VIEW, (leaf) => new DailyBudgetView(leaf, this));
    this.registerView(FINANCE_INBOX_VIEW, (leaf) => new FinanceInboxView(leaf, this));
    this.registerView(FINANCE_HUB_VIEW, (leaf) => this.createHubView(leaf));

    this.addRibbonIcon("wallet", "Open finance hub", () => this.activateHubView());
    this.addRibbonIcon("coins", "Daily budget", () => this.activateDailyBudgetView());
    this.addRibbonIcon("circle-plus", "Quick add transaction", () => this.openQuickAdd());

    this._statusBarItem = this.addStatusBarItem();
    this._statusBarItem.addClass("finance-status-bar");
    this._statusBarItem.setText("💸 …");
    this._statusBarItem.addEventListener("click", () => this.openQuickAdd());

    this.addCommand({
      id: "finance-tracker-open-daily-budget",
      name: "Open daily budget",
      callback: () => this.activateDailyBudgetView(),
    });

    this.addCommand({
      id: "finance-tracker-open-hub",
      name: "Open finance hub",
      callback: () => this.activateHubView(),
    });

    // One command per tab, so any of them can have a hotkey. The inbox keeps the
    // id it shipped with.
    for (const tab of FINANCE_HUB_TABS) {
      this.addCommand({
        id: tab.id === "inbox" ? "finance-tracker-open-inbox" : `finance-tracker-open-hub-${tab.id}`,
        name: `Open finance hub: ${tab.label.toLowerCase()}`,
        callback: () => this.activateHubView(tab.id),
      });
    }

    this.addCommand({
      id: "finance-tracker-insert-weekly-review",
      name: "Insert weekly review",
      editorCallback: (editor, view) => this.insertPeriodReview(editor, view, "week"),
    });

    this.addCommand({
      id: "finance-tracker-insert-monthly-review",
      name: "Insert monthly review",
      editorCallback: (editor, view) => this.insertPeriodReview(editor, view, "month"),
    });

    this.addCommand({
      id: "finance-tracker-quick-add",
      name: "Quick add transaction",
      callback: () => this.openQuickAdd(),
    });

    this.addCommand({
      id: "finance-tracker-drain-inbox",
      name: "Process capture inbox",
      callback: () => this.drainCaptureInbox({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-sync-gist",
      name: "Sync capture gist now",
      callback: () => this.syncCaptureGist({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-capture-overlap",
      name: "Check capture methods for overlap",
      callback: () => new CaptureOverlapModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-reconcile-csv",
      name: "Reconcile a bank CSV",
      callback: () => new BankReconcileModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-log-recurring",
      name: "Log due bills",
      callback: () => this.logDueRecurringPayments({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-settle-up",
      name: "Settle up split expenses",
      callback: () => new SettleUpModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-start-trip",
      name: "Start trip mode",
      callback: () => this.startTrip(),
    });

    this.addCommand({
      id: "finance-tracker-end-trip",
      name: "End trip mode",
      callback: () => this.endTrip(),
    });

    this.addCommand({
      id: "finance-tracker-archive-finished-holidays",
      name: "Archive finished trips",
      callback: () => this.archiveFinishedHolidays({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-archive-completed-goals",
      name: "Archive completed goals",
      callback: () => this.archiveCompletedGoals({ notify: true }),
    });

    this.addCommand({
      id: "finance-tracker-contribute-goal",
      name: "Contribute to a goal",
      callback: () => this.openContribute(),
    });

    this.addCommand({
      id: "finance-tracker-withdraw-goal",
      name: "Withdraw from a goal",
      callback: () => this.openContribute({ mode: "withdraw" }),
    });

    this.addCommand({
      id: "finance-tracker-open-recurring-note",
      name: "Open recurring payments note",
      callback: () => this.openRecurringNote(),
    });

    this.addCommand({
      id: "finance-tracker-setup",
      name: "Set up finance notes",
      callback: () => new SetupWizardModal(this.app, this).open(),
    });

    this.addCommand({
      id: "finance-tracker-repair-totals",
      name: "Repair daily note totals",
      callback: () => this.repairAllDailyNoteTotals(),
    });

    this.addCommand({
      id: "finance-tracker-open-portfolio",
      name: "Open portfolio",
      callback: () => this.openPortfolioNote(),
    });

    this.addCommand({
      id: "finance-tracker-log-trade",
      name: "Log a trade",
      callback: () => this.openLogTrade(),
    });

    this.addCommand({
      id: "finance-tracker-refresh-prices",
      name: "Refresh share prices",
      callback: async () => {
        if ((this.settings.priceSource || "manual") === "manual") {
          new Notice("Prices are typed in by hand. Choose a sheet or Yahoo in settings to fetch them.");
          return;
        }
        const result = await this.refreshPrices({ force: true });
        new Notice(
          result.skipped === "backoff"
            ? `The price source is refusing requests; trying again after ${new Date(result.until).toLocaleTimeString()}.`
            : result.error || `Updated ${result.updated || 0} price${result.updated === 1 ? "" : "s"}.`
        );
      },
    });

    this.addCommand({
      id: "finance-tracker-convert-bills",
      name: "Convert recurring payments to bill notes",
      callback: () => this.openBillMigration(),
    });

    this.addCommand({
      id: "finance-tracker-tidy-recurring",
      name: "Tidy up recurring payments",
      callback: () => this.openRecurringCleanup(),
    });

    this.addCommand({
      id: "finance-tracker-recategorise",
      name: "Rename or split a category",
      callback: () => this.openRecategorise(),
    });

    this.addCommand({
      id: "finance-tracker-convert-legacy-trip-tags",
      name: "Convert legacy trip tags",
      callback: () => this.openLegacyTripTagMigration(),
    });

    this.addCommand({
      id: "finance-tracker-import-merchant-map",
      name: "Import merchant map note",
      callback: async () => {
        const added = await this.migrateMerchantMapFile({ force: true, notify: false });
        new Notice(
          added > 0
            ? `Finance: imported ${added} merchant rule${added === 1 ? "" : "s"}.`
            : "Finance: no new merchant rules to import."
        );
      },
    });

    this.addCommand({
      id: "finance-tracker-snapshot-balances",
      name: "Snapshot balances",
      callback: () => this.openSnapshotBalances(),
    });

    // One palette entry instead of eight. Eight near-identical "Insert … block"
    // rows made the command list harder to scan for the commands that actually
    // do something, and picking a block is a choice better made in a list that
    // can describe each one.
    this.addCommand({
      id: "finance-tracker-insert-block",
      name: "Insert a finance block",
      editorCallback: (editor, view) => this.openInsertBlock(editor, view?.file?.path || ""),
    });

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
  }

  createSettingTab() {
    return new FinanceTrackerSettingTab(this.app, this);
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
    this.syncCaptureGist({ notify: false }).catch((error) =>
      console.warn("[finance-tracker] initial gist sync failed", error)
    );
    this.scheduleGistSync();
  }

  refreshInboxView() {
    for (const leaf of this.app.workspace.getLeavesOfType(FINANCE_INBOX_VIEW)) {
      if (typeof leaf.view?.refresh === "function") leaf.view.refresh();
    }
  }

  // The inbox lives in the hub now. The standalone view stays registered so a
  // workspace saved with it open still loads.
  async activateInboxView() {
    return this.activateHubView("inbox");
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
    clearTimeout(this._inboxDrainTimer);
    clearTimeout(this._statusBarTimer);
    clearTimeout(this._dataChangedTimer);
    this._liveBlocks?.clear();
  }

  async loadSettings() {
    const stored = await this.loadData();
    this._freshInstall = stored == null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);

    // A fresh install is born at the current schema; an existing one without a
    // recorded version predates versioning and starts at 0.
    const from = this._freshInstall ? DEFAULT_SETTINGS.schemaVersion : Number(stored?.schemaVersion) || 0;
    const pending = SETTINGS_MIGRATIONS.filter((migration) => migration.to > from);
    for (const migration of pending) {
      migration.run(this.settings, this);
      this.settings.schemaVersion = migration.to;
    }
    this.settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
    this._settingsMigratedFrom = from;
    if (pending.length) {
      console.log(`[finance-tracker] migrated settings ${from} → ${this.settings.schemaVersion}`);
      await this.saveSettings();
    }

    // Auto-detect the daily-note folder and date format from the Journals
    // community plugin or the core Daily notes plugin, falling back to the
    // manual setting when neither is configured.
    this._dailyNoteFormat = "YYYY-MM-DD";
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
    // The daily-note template (Journals or core Daily notes) so a brand-new
    // daily note gets the user's real template pasted in — including running
    // it through Templater when installed — instead of a bare-bones skeleton.
    this._dailyNoteTemplatePath = String(detected?.template || "").trim();
    this.settings.budgetsFolderPath = this.settings.budgetsFolderPath || DEFAULT_SETTINGS.budgetsFolderPath;
    this.settings.budgetArchiveFolderPath = this.settings.budgetArchiveFolderPath || DEFAULT_SETTINGS.budgetArchiveFolderPath;
    this.settings.defaultBudgetNoteName = this.settings.defaultBudgetNoteName || DEFAULT_SETTINGS.defaultBudgetNoteName;
    this.settings.activeHolidayBudgetPath = this.settings.activeHolidayBudgetPath || "";
    this.settings.merchantMap = this.settings.merchantMap || {};
    // Only pre-versioning installs can still have a markdown merchant map to
    // fold in; skipping it otherwise saves a vault read on every single load.
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
        return {
          folder,
          format: String(journal.dateFormat || "YYYY-MM-DD").trim(),
          template: Array.isArray(journal.templates) ? journal.templates[0] : "",
        };
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

  // Creates a brand-new daily note the same way opening it from the calendar
  // would: paste the user's real Journals/Daily-notes template — including
  // running it through Templater when installed, since these templates are
  // usually genuine Templater syntax (<% tp.file.title %> etc.), not the
  // plain {{date}} tokens core Daily notes can substitute on its own — rather
  // than silently replacing it with a bare-bones finance-only skeleton.
  async createDailyNoteFromTemplate(path, date) {
    const templatePath = String(this._dailyNoteTemplatePath || "").trim();
    if (!templatePath) return this.upsertFile(path, this.buildMinimalDailyNote(date));

    const templateFile =
      this.app.vault.getAbstractFileByPath(normalizePath(templatePath)) ||
      this.app.vault.getAbstractFileByPath(normalizePath(`${templatePath}.md`));
    if (!(templateFile instanceof TFile)) return this.upsertFile(path, this.buildMinimalDailyNote(date));

    await this.ensureFolder(normalizePath(path).split("/").slice(0, -1).join("/"));
    const file = await _ftCreate(this.app, normalizePath(path), "");

    const templater = this.app.plugins?.plugins?.["templater-obsidian"];
    if (templater?.templater?.write_template_to_file) {
      try {
        await templater.templater.write_template_to_file(templateFile, file);
        return file;
      } catch (_error) {
        // Fall through to a raw copy below — better a template with
        // unrendered <% %> tags left in than no template at all.
      }
    }
    try {
      const raw = await this.app.vault.cachedRead(templateFile);
      await _ftModify(this.app, file, raw);
    } catch (_error) {
      await _ftModify(this.app, file, this.buildMinimalDailyNote(date));
    }
    return file;
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

  // True unless the user has switched this transport off in settings. Absent
  // keys read as enabled so a partial captureMethods object from an older
  // data.json can never silently disable a method someone relies on.
  isCaptureMethodEnabled(method) {
    const configured = this.settings.captureMethods;
    if (!configured || typeof configured !== "object") return DEFAULT_SETTINGS.captureMethods[method] !== false;
    if (!Object.prototype.hasOwnProperty.call(configured, method)) {
      return DEFAULT_SETTINGS.captureMethods[method] !== false;
    }
    return configured[method] !== false;
  }

  // Entry point for `obsidian://finance-capture`. Handles both a single
  // transaction (?amount=…) and a batched queue (?lines=…), which are separate
  // methods because someone may well want the queue without the per-tap open.
  async handleCapture(params) {
    const batch = String(params?.lines || params?.batch || "").trim();
    if (batch) {
      if (!this.isCaptureMethodEnabled("batch")) {
        new Notice("Finance: batched capture is turned off in settings.");
        return;
      }
      await this.handleCaptureBatch(batch);
      return;
    }

    if (!this.isCaptureMethodEnabled("url")) {
      new Notice("Finance: URL capture is turned off in settings.");
      return;
    }

    try {
      const expense = this.parseCaptureParams(params);
      const result = await this.handleCaptureExpense(expense, { notify: true, method: "url" });
      if (result.skipped) {
        new Notice(this.describeSkippedCapture(result));
      }
    } catch (error) {
      new Notice(`Finance capture failed: ${error.message}`);
    }
  }

  // Drains a queue built up on the phone and flushed in one go, so an Apple Pay
  // automation never has to foreground Obsidian per tap. Each line is the same
  // one-line format the inbox folder uses; a bad line is quarantined rather
  // than costing the rest of the batch.
  async handleCaptureBatch(raw, options = {}) {
    const method = options.method || "batch";
    const { entries, failures } = core.parseCaptureBatch(raw);
    let logged = 0;
    let duplicates = 0;
    const errors = [...failures];

    for (const params of entries) {
      try {
        const expense = this.parseCaptureParams(params);
        const result = await this.handleCaptureExpense(expense, { notify: false, method });
        if (result.skipped) duplicates += 1;
        else logged += 1;
      } catch (error) {
        errors.push({ line: core.buildInboxLine(params) || String(params), reason: error?.message || String(error) });
      }
    }

    for (const failure of errors) {
      await this.quarantineCaptureText(failure.line, failure.reason);
    }

    if (options.notify !== false) {
      const parts = [];
      if (logged) parts.push(`logged ${logged}`);
      if (duplicates) parts.push(`skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
      if (errors.length) parts.push(`${errors.length} need${errors.length === 1 ? "s" : ""} attention`);
      new Notice(`Finance: ${parts.length ? parts.join(", ") : "nothing to log"}.`);
    }
    if (logged) this.refreshDailyBudgetView();
    return { logged, duplicates, failed: errors.length };
  }

  describeSkippedCapture(result) {
    if (result?.reason === "cross-method-duplicate" && result.duplicateOf) {
      const channel = core.describeCaptureChannel(core.captureChannelKey(result.duplicateOf));
      return `Finance: already captured via ${channel} — skipped.`;
    }
    return `Finance: skipped duplicate capture (${result?.expense?.externalId || "already logged"})`;
  }

  // Single write path shared by the URL handler, the inbox drainer, and the
  // quick-add modal. Applies merchant->category guessing, holiday context, and
  // external-id de-duplication, then inserts into the routed daily note.
  async handleCaptureExpense(expenseInput, options = {}) {
    let expense = { ...expenseInput };
    const method = core.normalizeCaptureMethod(options.method || "quick-add");

    if (expense.externalId && this.isExternalIdProcessed(expense.externalId)) {
      return { skipped: true, reason: "duplicate", expense };
    }

    // Cross-method check: has another transport already captured this exact
    // purchase? Only fires across channels, so repeat purchases down the same
    // pipe are still logged (see findDuplicateCapture).
    const handling = this.settings.crossMethodDuplicates || "skip";
    let duplicateOf = null;
    if (handling !== "off" && !options.force) {
      duplicateOf = core.findDuplicateCapture(
        { ...expense, method, source: expense.source },
        this.settings.captureLedger,
        { windowDays: Number(this.settings.duplicateWindowDays) || 0 }
      );
    }
    if (duplicateOf && handling === "skip") {
      await this.recordCapture(expense, method, { skipped: true });
      return { skipped: true, reason: "cross-method-duplicate", duplicateOf, expense };
    }

    // A bill first: a capture on the right day, for the right amount, from a
    // merchant a bill knows, is that bill's payment — more specific than any
    // merchant rule, and it moves the bill's schedule on.
    let matchedBill = null;
    if ((!expense.category || expense.category === "uncategorized") && expense.merchant && options.matchBills !== false) {
      try {
        matchedBill = await this.matchCaptureToBill(expense);
      } catch (error) {
        console.warn("[finance-tracker] bill matching failed", error);
      }
      if (matchedBill) expense.category = core.normalizeCategoryPath(matchedBill.category);
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
        : await this.createDailyNoteFromTemplate(notePath, expense.date);

    const currentContent = await this.app.vault.cachedRead(file);
    const nextContent = core.insertTransactionIntoDailyNote(currentContent, expense, this.settings);
    await _ftModify(this.app,file, nextContent);

    if (expense.externalId) {
      await this.markExternalIdProcessed(expense.externalId);
    }
    await this.recordCapture(expense, method);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();

    // "warn" logs the entry anyway and tells you what it collided with, so a
    // genuine second purchase is never silently swallowed.
    if (duplicateOf && handling === "warn") {
      new Notice(
        `Finance: logged, but ${core.formatCurrency(expense.amount, expense.currency)} on ${expense.date} was already captured via ${core.describeCaptureChannel(core.captureChannelKey(duplicateOf))}.`
      );
    }

    const shouldOpen = options.openNote ?? this.settings.openDailyNoteAfterCapture;
    if (shouldOpen) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }

    if (matchedBill) {
      this._lastBillMatch = {
        amount: expense.amount,
        category: core.normalizeCategoryPath(expense.category),
        date: expense.date,
        merchant: expense.merchant || "",
      };
      const message = `Filed under ${matchedBill.label}.`;
      if (typeof createFragment === "function") {
        new Notice(
          createFragment((fragment) => {
            fragment.appendText(`${message} `);
            const undo = fragment.createEl("a", { text: "Undo", href: "#" });
            undo.addEventListener("click", async (event) => {
              event.preventDefault();
              const undone = await this.undoLastBillMatch();
              new Notice(undone ? "Moved back to uncategorised." : "That entry has changed since, so it was left alone.");
            });
          }),
          10000
        );
      } else {
        new Notice(message);
      }
    }

    if (options.notify) {
      new Notice(`Logged ${core.formatCurrency(expense.amount, expense.currency)} to ${expense.date}`);
    }

    return { skipped: false, file, expense, bill: matchedBill };
  }

  // The rolling record of what each transport has captured. It is kept in
  // data.json rather than read back out of the notes because the daily-note
  // bullet deliberately does not carry the capture method — and the method is
  // the whole basis of cross-method duplicate detection. Skipped duplicates are
  // recorded too: they are the evidence the overlap report runs on.
  async recordCapture(expense, method, options = {}) {
    this.settings.captureLedger = core.appendCaptureLedger(
      this.settings.captureLedger,
      {
        date: expense?.date,
        amount: expense?.amount,
        merchant: expense?.merchant || expense?.name || "",
        method,
        source: expense?.source || "",
        at: new Date().toISOString(),
        skipped: Boolean(options.skipped),
      },
      400
    );
    await this.saveSettings();
  }

  captureOverlapReport(days = 60) {
    const since = core.addDays(core.todayIsoLocal(), -Math.abs(Number(days) || 60));
    return core.summarizeCaptureOverlap(this.settings.captureLedger, { since });
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

  // Imports the markdown merchant map into settings. This used to run only for
  // installs that predated settings versioning, which meant a file written after
  // that point was never read at all — 30 rules sat in the author's vault being
  // ignored for a month. It now runs whenever the file is present and has not
  // been imported yet.
  //
  // It no longer deletes the note. Removing something the user wrote is not this
  // function's call to make, and the note is a useful record of where the rules
  // came from. Existing settings win, so importing twice can never clobber a
  // category that has since been corrected.
  async migrateMerchantMapFile(options = {}) {
    if (this.settings.merchantMapMigrated && !options.force) return 0;
    const path = normalizePath(this.settings.merchantMapPath || "");
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile)) {
      this.settings.merchantMapMigrated = true;
      await this.saveSettings();
      return 0;
    }

    const content = await this.app.vault.cachedRead(file);
    const imported = {};
    for (const rows of core.parseMarkdownTable(content)) {
      for (const row of rows) {
        const merchant = core.normalizeMerchant(row.merchant || row.payee || row.name || "");
        const category = core.normalizeCategoryPath(row.category || row.cat || "");
        if (merchant && category) imported[merchant] = category;
      }
    }

    const before = Object.keys(this.settings.merchantMap || {}).length;
    this.settings.merchantMap = { ...imported, ...(this.settings.merchantMap || {}) };
    this.settings.merchantMapMigrated = true;
    this._merchantSources = null;
    await this.saveSettings();
    const added = Object.keys(this.settings.merchantMap).length - before;
    if (added > 0 && options.notify !== false) {
      new Notice(
        `Finance: imported ${added} merchant rule${added === 1 ? "" : "s"} from ${file.basename}. They live in settings now, so that note can go whenever you like.`
      );
    }
    return added;
  }

  // Rules and history, plus both re-keyed by merchant root, in the shape
  // core.suggestCategoryForMerchant expects. Built once and held until a note or
  // a rule changes: a batched capture of twenty lines would otherwise rebuild
  // the whole index twenty times.
  async merchantSuggestionSources() {
    if (this._merchantSources) return this._merchantSources;
    const rules = await this.loadMerchantMap();
    const history = this.settings.learnCategoriesFromHistory === false ? new Map() : await this.loadMerchantHistory();
    this._merchantSources = {
      rules,
      history,
      rootRules: core.indexByMerchantRoot(rules),
      rootHistory: core.indexByMerchantRoot(history),
    };
    return this._merchantSources;
  }

  // What should this merchant be filed as, and why. The reason travels with the
  // answer because the inbox shows it: "how you filed it last time" is the
  // difference between a suggestion you can accept and one you have to check.
  async suggestCategoryForMerchant(merchant) {
    if (!core.normalizeMerchant(merchant)) return { category: "", source: "" };
    try {
      return core.suggestCategoryForMerchant(merchant, await this.merchantSuggestionSources());
    } catch (error) {
      // History sits behind a full vault walk, so it has far more ways to throw
      // than a map lookup does — and a throw here reaches the capture path,
      // which would quarantine the transaction. An uncategorised capture that
      // still lands beats one lost because a note somewhere is malformed.
      console.error("[finance-tracker] category suggestion failed", error);
      return { category: "", source: "" };
    }
  }

  async guessCategoryForMerchant(merchant) {
    return (await this.suggestCategoryForMerchant(merchant)).category;
  }

  describeSuggestionSource(source) {
    if (source === "rule" || source === "rule-root") return "from a merchant rule";
    if (source === "history" || source === "history-root") return "how you filed it last time";
    return "";
  }

  // Most recent categorised sighting of each merchant. Built off the same
  // per-file index the dashboards use, and dropped whenever a daily note
  // changes, so a correction takes effect on the very next capture.
  async loadMerchantHistory() {
    if (this._merchantHistory) return this._merchantHistory;
    const history = new Map();
    const recurringPrefix = core.normalizeCategoryPath(this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    for (const entry of await this.collectAllTransactions()) {
      if (entry.entryType === "balance" || entry.isIncome || entry.isGoalContribution) continue;
      // `entry.category` already has any trip prefix split off into holidayKey,
      // so a Japan 7-Eleven teaches "food/groceries", not "26/japanmidyear/…",
      // and the capture path re-applies the trip prefix only if a trip is on.
      const category = core.normalizeCategoryPath(entry.category || "");
      if (!category || category === "uncategorized") continue;
      // A bill category is not something to learn from a merchant name. Whether a
      // charge from Claude is the monthly subscription depends on its amount and
      // date, which bill matching checks; a merchant rule would file a one-off
      // $340 purchase as the $34 bill and invent a payment.
      if (category === recurringPrefix || category.startsWith(`${recurringPrefix}/`)) continue;
      const merchant = String(entry.merchant || "").trim();
      if (!merchant || /^skipped\b/i.test(merchant)) continue;
      const merchantKey = core.normalizeMerchant(merchant);
      if (!merchantKey) continue;
      const date = String(entry.date || "");
      const current = history.get(merchantKey);
      if (!current || date >= current.date) history.set(merchantKey, { category, date, name: merchant });
    }
    this._merchantHistory = history;
    return history;
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

    return {
      categories: Array.from(categoryCounts.entries())
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
    const next = core.replaceTransactionBlock(content, entry.rawLine, newExpense, this.settings, { lineIndex: entry.lineIndex });
    if (next == null) throw new Error("Could not locate that entry (the note may have changed).");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  // One place that opens the edit modal, so every caller gets the same options
  // and a test can hold on to the instance.
  openSnapshotBalances(options = {}) {
    const modal = new BalanceSnapshotModal(this.app, this, options);
    modal.open();
    return modal;
  }

  openQuickAdd(options = {}) {
    const modal = new QuickAddTransactionModal(this.app, this, options);
    modal.open();
    return modal;
  }

  openEditTransaction(entry, options = {}) {
    const modal = new EditTransactionModal(this.app, this, entry, options);
    modal.open();
    return modal;
  }

  // Moving an entry to another day means moving the bullet: it is removed from
  // one note and inserted into the other, and both running totals are rewritten
  // from what is left. The date on a capture is wrong often enough — a late-night
  // tap landing on tomorrow, a backfill typed into the wrong note — that editing
  // it by hand across two files was the most common reason to give up and leave
  // it wrong.
  async moveTransactionEntry(entry, newDate, patch = {}) {
    const date = core.parseIsoDate(newDate);
    if (!date) throw new Error("That date could not be read.");
    const sourceFile = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(sourceFile instanceof TFile)) throw new Error("Could not find the note this entry is in.");

    const sourceContent = await this.app.vault.cachedRead(sourceFile);
    const without = core.removeTransactionBlock(sourceContent, entry.rawLine, this.settings, { lineIndex: entry.lineIndex });
    if (without == null) throw new Error("Could not locate that entry (the note may have changed).");

    const targetPath = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    const targetFile = existing instanceof TFile ? existing : await this.createDailyNoteFromTemplate(targetPath, date);
    const expense = { ...entry, ...patch, date };

    if (targetFile.path === sourceFile.path) {
      // Same note after all (two date formats can land on one file): insert into
      // the content the entry was just removed from, and write once.
      await _ftModify(this.app, sourceFile, core.insertTransactionIntoDailyNote(without, expense, this.settings));
    } else {
      const targetContent = await this.app.vault.cachedRead(targetFile);
      await _ftModify(this.app, targetFile, core.insertTransactionIntoDailyNote(targetContent, expense, this.settings));
      await _ftModify(this.app, sourceFile, without);
      this.invalidateIndexEntry(targetFile.path);
    }

    this.invalidateIndexEntry(sourceFile.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    this.refreshInboxView();
    return targetFile;
  }

  // Other uncategorised entries from the same shop, so one correction can settle
  // them all without opening the inbox.
  async findSiblingUncategorised(entry) {
    const root = core.merchantRootKey(entry?.merchant || "");
    if (!root) return [];
    const entries = await this.collectAllTransactions();
    return entries.filter(
      (other) =>
        core.isSpendingEntry(other) &&
        (!other.category || other.category === "uncategorized") &&
        !(other.filePath === entry.filePath && other.lineIndex === entry.lineIndex) &&
        core.merchantRootKey(other.merchant || "") === root
    );
  }

  async deleteTransactionEntry(entry) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) throw new Error("Could not find the note for this entry.");
    const content = await this.app.vault.cachedRead(file);
    const next = core.removeTransactionBlock(content, entry.rawLine, this.settings, { lineIndex: entry.lineIndex });
    if (next == null) throw new Error("Could not locate that entry in the note.");
    await _ftModify(this.app,file, next);
    this.invalidateIndexEntry(file.path);
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
  }

  // Remembers the merchant *root*, not the exact descriptor. The bank sends a
  // different branch, terminal or truncation next time, and the root is what
  // those variants share — so one correction covers the lot. A root too short to
  // match safely as a fragment falls back to the full key.
  async rememberMerchantCategory(merchant, category) {
    const root = core.merchantRootKey(merchant);
    const key = root.length >= 4 ? root : core.normalizeMerchant(merchant);
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!key || !cleanCategory) return;
    if (this.settings.merchantMap?.[key] === cleanCategory) return;
    this.settings.merchantMap = { ...this.settings.merchantMap, [key]: cleanCategory };
    this._merchantSources = null;
    await this.saveSettings();
  }

  async forgetMerchantCategory(merchant) {
    if (!this.settings.merchantMap || !(merchant in this.settings.merchantMap)) return;
    const next = { ...this.settings.merchantMap };
    delete next[merchant];
    this.settings.merchantMap = next;
    this._merchantSources = null;
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
    if (!this.isCaptureMethodEnabled("inbox")) return 0;
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
        const result = await this.handleCaptureExpense(expense, { notify: false, method: "inbox" });
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

  // Same idea as quarantineCapture, but for a line that never had a file of its
  // own — a bad line inside a batch or a gist. Nothing is ever dropped silently.
  async quarantineCaptureText(raw, reason) {
    try {
      const failedFolder = normalizePath(`${this.settings.captureInboxFolder}/_failed`);
      await this.ensureFolder(failedFolder);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = normalizePath(`${failedFolder}/${stamp}-${Math.random().toString(36).slice(2, 6)}.txt`);
      const body = `<!-- finance-capture error: ${String(reason || "").replace(/--+>/g, "->")} -->\n${raw}`;
      await this.upsertFile(target, body);
    } catch (error) {
      console.warn("[finance-tracker] failed to quarantine capture line", error);
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

  // ---------------------------------------------------------------------------
  // GitHub gist capture
  //
  // The only transport that captures without launching Obsidian *and* works on
  // an Obsidian Sync vault: the phone appends a capture line to a private gist,
  // and the plugin polls it with requestUrl (which works on iOS too, and is not
  // subject to CORS). Drained lines are removed from the gist afterwards.
  // ---------------------------------------------------------------------------

  gistCaptureConfigured() {
    return Boolean(String(this.settings.gistCaptureId || "").trim() && String(this.settings.gistCaptureToken || "").trim());
  }

  async _gistRequest(method, body) {
    const id = String(this.settings.gistCaptureId || "").trim();
    const response = await requestUrl({
      url: `https://api.github.com/gists/${encodeURIComponent(id)}`,
      method,
      headers: {
        Authorization: `Bearer ${String(this.settings.gistCaptureToken || "").trim()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      throw: false,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub rejected the token (check it has the `gist` scope and has not expired).");
    }
    if (response.status === 404) {
      throw new Error("Gist not found — check the gist ID, and that the token can see it.");
    }
    if (response.status >= 400) {
      throw new Error(`GitHub returned ${response.status}.`);
    }
    return response.json;
  }

  // Gists over ~1MB come back truncated, with the full body behind raw_url.
  async _readGistFile(fileEntry) {
    let content = String(fileEntry?.content || "");
    if (fileEntry?.truncated && fileEntry.raw_url) {
      const raw = await requestUrl({ url: fileEntry.raw_url, throw: false });
      if (raw.status < 400) content = String(raw.text || "");
    }
    return content;
  }

  async syncCaptureGist(options = {}) {
    if (!this.isCaptureMethodEnabled("gist")) return 0;
    if (!this.gistCaptureConfigured()) {
      if (options.notify) new Notice("Finance: set a gist ID and token in settings first.");
      return 0;
    }
    if (this._gistSyncing) return 0;
    this._gistSyncing = true;

    try {
      const filename = String(this.settings.gistCaptureFilename || "").trim() || DEFAULT_SETTINGS.gistCaptureFilename;
      const gist = await this._gistRequest("GET");
      const files = gist?.files && typeof gist.files === "object" ? gist.files : {};
      const names = Object.keys(files);
      if (!names.length) {
        if (options.notify) new Notice("Finance: the capture gist is empty.");
        return 0;
      }

      const totals = { logged: 0, duplicates: 0, failed: 0 };
      const patch = {};
      let raced = false;

      for (const name of names) {
        const consumed = await this._readGistFile(files[name]);
        if (!consumed.trim()) continue;

        const result = await this.handleCaptureBatch(consumed, { method: "gist", notify: false });
        totals.logged += result.logged;
        totals.duplicates += result.duplicates;
        totals.failed += result.failed;
        if (result.logged + result.duplicates + result.failed === 0) continue;

        if (name === filename) {
          // The shared queue file is appended to, so it is cleared down to a
          // marker rather than deleted — and only the prefix we actually read
          // is removed, so anything added mid-sync survives to the next poll.
          const after = await this._gistRequest("GET");
          const currentContent = String(after?.files?.[name]?.content ?? consumed);
          const remainder = core.buildGistRemainder(consumed, currentContent);
          if (remainder === null) raced = true;
          else patch[name] = { content: `# drained ${new Date().toISOString()}\n${remainder}` };
        } else {
          // A one-file-per-capture drop from an automation. Nothing appends to
          // it, so there is no race to guard against — just delete it. A gist
          // must keep at least one file, which the queue file above provides.
          patch[name] = null;
        }
      }

      if (raced) {
        new Notice("Finance: the capture gist changed mid-sync and was left as-is — check it for anything logged twice.");
      }
      if (Object.keys(patch).length) {
        // A gist cannot be left with no files at all, which is what would happen
        // to one holding nothing but per-capture drops. Recreate the queue file
        // as the placeholder in that case.
        const deletingEverything = names.every((name) => patch[name] === null);
        if (deletingEverything) {
          patch[filename] = { content: `# drained ${new Date().toISOString()}\n` };
        }
        await this._gistRequest("PATCH", { files: patch });
      }

      this.settings.gistCaptureLastSync = new Date().toISOString();
      await this.saveSettings();

      if (options.notify) {
        const parts = [];
        if (totals.logged) parts.push(`logged ${totals.logged}`);
        if (totals.duplicates) parts.push(`skipped ${totals.duplicates} duplicate${totals.duplicates === 1 ? "" : "s"}`);
        if (totals.failed) parts.push(`${totals.failed} need attention`);
        new Notice(`Finance gist: ${parts.length ? parts.join(", ") : "nothing waiting"}.`);
      }
      if (totals.logged) this.refreshDailyBudgetView();
      return totals.logged;
    } catch (error) {
      if (options.notify) new Notice(`Finance gist sync failed: ${error.message}`);
      console.warn("[finance-tracker] gist sync failed", error);
      return 0;
    } finally {
      this._gistSyncing = false;
    }
  }

  // Polling is re-armed from scratch whenever the settings change, so toggling
  // the method or editing the interval takes effect without a reload.
  scheduleGistSync() {
    if (this._gistPollTimer) {
      window.clearInterval(this._gistPollTimer);
      this._gistPollTimer = null;
    }
    if (!this.isCaptureMethodEnabled("gist") || !this.gistCaptureConfigured()) return;
    const minutes = Math.max(1, Number(this.settings.gistCapturePollMinutes) || 15);
    this._gistPollTimer = window.setInterval(() => {
      this.syncCaptureGist({ notify: false }).catch(() => {});
    }, minutes * 60 * 1000);
    this.registerInterval(this._gistPollTimer);
  }

  // Called after every write the plugin makes. It no longer refreshes only the
  // sidebar: the hub, the inbox and every open finance block depend on the same
  // notes, and all of them are brought up to date together.
  refreshDailyBudgetView() {
    this.notifyFinanceDataChanged();
  }

  // Debounced, so a burst — a batch capture, a migration, Sync bringing in a
  // week of notes — costs one refresh. Rendering never writes a note, so a
  // refresh cannot trigger another one.
  notifyFinanceDataChanged() {
    clearTimeout(this._dataChangedTimer);
    this._dataChangedTimer = setTimeout(() => {
      this._dataChangedTimer = null;
      this.refreshFinanceSurfaces().catch((error) => console.warn("[finance-tracker] refresh failed", error));
    }, 500);
  }

  async refreshFinanceSurfaces() {
    for (const type of [DAILY_BUDGET_VIEW, FINANCE_INBOX_VIEW, FINANCE_HUB_VIEW]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        if (typeof leaf.view?.refresh === "function") leaf.view.refresh();
      }
    }
    for (const block of Array.from(this._liveBlocks || [])) {
      await block.refresh().catch((error) => console.warn("[finance-tracker] block refresh failed", error));
    }
    this._scheduleStatusBarUpdate();
  }

  // Notes whose changes can move a number somewhere: daily notes, the budgets
  // folder (budgets, goals, trips, bills) and the portfolio note.
  isFinanceSourcePath(path) {
    const value = String(path || "");
    if (!value.endsWith(".md")) return false;
    const folders = [this.settings.dailyNotesFolder, this.settings.budgetsFolderPath, this.settings.budgetArchiveFolderPath]
      .map((folder) => String(folder || "").trim())
      .filter(Boolean)
      .map((folder) => normalizePath(`${folder}/`));
    if (folders.some((folder) => value.startsWith(folder))) return true;
    return typeof this.getPortfolioNotePath === "function" && value === this.getPortfolioNotePath();
  }

  registerFinanceBlock(type, render) {
    this.registerMarkdownCodeBlockProcessor(type, async (source, el, ctx) => {
      this.trackLiveBlock(el, ctx, () => render.call(this, source, el, ctx));
      await render.call(this, source, el, ctx);
    });
  }

  // Ties a rendered block to the note's lifecycle: registered while the note is
  // open, dropped when it closes. A block holding focus — someone typing into
  // it — is left alone and caught up once focus moves on.
  trackLiveBlock(el, ctx, rerender) {
    if (typeof ctx?.addChild !== "function" || typeof MarkdownRenderChild !== "function") return null;
    const blocks = this._liveBlocks || (this._liveBlocks = new Set());
    const child = new MarkdownRenderChild(el);
    const entry = {
      el,
      refresh: async () => {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (active && typeof el.contains === "function" && el.contains(active)) {
          if (!entry.waiting) {
            entry.waiting = true;
            el.addEventListener("focusout", () => {
              entry.waiting = false;
              window.setTimeout(() => entry.refresh(), 0);
            }, { once: true });
          }
          return;
        }
        await rerender();
      },
    };
    child.onload = () => blocks.add(entry);
    child.onunload = () => blocks.delete(entry);
    ctx.addChild(child);
    return entry;
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
    this._allTransactions = null;
    // Merchant history is derived from the index, so any note that changes can
    // change what the next capture learns.
    this._merchantHistory = null;
    this._merchantSources = null;
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
        if (this.isFinanceSourcePath(file.path)) this.notifyFinanceDataChanged();
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        // A note arriving from Sync, or from another device, changes the numbers
        // exactly as much as one edited here does.
        if (_ftSelfWrites.has(file?.path) || !this.isFinanceSourcePath(file?.path)) return;
        this.notifyFinanceDataChanged();
        if (!file.path.startsWith(normalizePath(`${this.settings.dailyNotesFolder}/`))) return;
        this.invalidateIndexEntry(file.path);
        this._scheduleStatusBarUpdate();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.invalidateIndexEntry(file.path);
        if (this.isFinanceSourcePath(file.path)) this.notifyFinanceDataChanged();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.invalidateIndexEntry(oldPath);
        if (this.isFinanceSourcePath(file.path) || this.isFinanceSourcePath(oldPath)) this.notifyFinanceDataChanged();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file || !file.path) return;
        const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
        if (!file.path.startsWith(prefix)) return;
        window.setTimeout(() => this.reconcileDailyNoteTotal(file).catch(() => {}), 300);
      })
    );
  }

  // Recomputes the running total on every daily note in one pass. Individual
  // notes already heal when opened, but that only reaches notes you happen to
  // visit — this is for repairing a whole backlog at once (totals written
  // before 0.7.0 could count digits inside a merchant or note line).
  async repairAllDailyNoteTotals() {
    const prefix = normalizePath(`${this.settings.dailyNotesFolder}/`);
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix));
    if (!files.length) {
      new Notice(`No daily notes found under ${this.settings.dailyNotesFolder}.`);
      return 0;
    }

    const notice = new Notice(`Checking ${files.length} daily notes…`, 0);
    let repaired = 0;
    try {
      for (const file of files) {
        const content = await this.app.vault.cachedRead(file);
        const next = core.recomputeSpendingTotals(content, this.settings);
        if (next === content) continue;
        await _ftModify(this.app, file, next);
        this.invalidateIndexEntry(file.path);
        repaired += 1;
      }
    } finally {
      notice.hide();
    }

    new Notice(
      repaired > 0
        ? `Repaired the total on ${repaired} note${repaired === 1 ? "" : "s"}.`
        : `All ${files.length} daily note totals were already correct.`
    );
    if (repaired > 0) {
      this.refreshDailyBudgetView();
      this._scheduleStatusBarUpdate();
    }
    return repaired;
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

  // --- Note migrations ---------------------------------------------------------

  // Reads every daily note once and plans the legacy-trip-tag conversion over
  // it. Nothing is written here: the plan is what the preview shows and what
  // apply later consumes.
  async planLegacyTripTagMigration() {
    const payload = [];
    for (const file of this.getDailyNoteFiles()) {
      payload.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const trips = core.summarizeLegacyTripTags(payload);
    const transform = core.buildLegacyTripTagTransform({
      categoryFixes: LEGACY_CATEGORY_FIXES,
      heading: this.settings.spendingHeading || "## Finance",
      homeCurrency: this.settings.defaultCurrency,
      spendingRootTag: this.settings.spendingRootTag,
      tripCurrencies: Object.fromEntries(trips.map((trip) => [trip.key, trip.currency])),
    });
    return { plan: core.planNoteRewrite(payload, transform), trips };
  }

  // Writes an approved plan. A note that has changed since the preview is
  // skipped and reported, never overwritten with stale content.
  async applyNoteRewritePlan(plan) {
    const skipped = [];
    let written = 0;
    for (const change of plan?.files || []) {
      const file = this.app.vault.getAbstractFileByPath(change.path);
      if (change.create) {
        // A note this plan creates: written only if nothing is there yet, so
        // re-applying an old plan can never overwrite a note since edited.
        if (file) {
          skipped.push(change.path);
          continue;
        }
        await this.ensureFolder(change.path.split("/").slice(0, -1).join("/"));
        await this.upsertFile(change.path, change.after);
        written += 1;
        continue;
      }
      if (!(file instanceof TFile)) {
        skipped.push(change.path);
        continue;
      }
      const current = await this.app.vault.cachedRead(file);
      if (current !== change.before) {
        skipped.push(change.path);
        continue;
      }
      await _ftModify(this.app, file, change.after);
      this.invalidateIndexEntry(file.path);
      written += 1;
    }
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    return { written, skipped };
  }

  // A converted trip has entries but no note, so nothing renders them. This is
  // the note a trip would have had: archived from the start, since it is long
  // over, which keeps it out of the active goal lists while its dashboard still
  // works when opened.
  buildArchivedTripNoteContent(trip, title) {
    return [
      "---",
      `goal_name: ${title}`,
      `goal_key: ${core.normalizeCategoryPath(trip.key.split("/")[1] || "trip")}`,
      "target_amount: 0",
      "starting_balance: 0",
      `due_date: ${trip.firstDate || core.todayIsoLocal()}`,
      "active: false",
      `currency: ${core.normalizeCurrency(this.settings.defaultCurrency)}`,
      ...(trip.currency ? [`trip_currency: ${trip.currency}`] : []),
      `trip_tag: ${trip.key}`,
      `start_date: ${trip.firstDate || ""}`,
      `end_date: ${trip.lastDate || ""}`,
      "total_budget: 0",
      `archived: ${core.todayIsoLocal()}`,
      "---",
      "",
      `# ${title}`,
      "",
      `Created by **Convert legacy trip tags** from ${trip.entries} entries logged between ${trip.firstDate} and ${trip.lastDate}.`,
      "Set `total_budget` above if you want the reflection to compare against a budget.",
      "",
      "```holiday-dashboard",
      "```",
      "",
    ].join("\n");
  }

  // Only creates a note for a trip that has none: a second note carrying the
  // same trip_tag would make the dashboards ambiguous.
  async ensureArchivedTripNotes(trips) {
    const created = [];
    for (const trip of trips || []) {
      if (!trip.key) continue;
      const existing = await this.findHolidayBudgetByKey(trip.key);
      if (existing) continue;
      const [year, name] = trip.key.split("/");
      const fullYear = year.length === 2 ? `20${year}` : year;
      const title = `${core.titleCaseSegment(name)} ${fullYear}`;
      await this.ensureFolder(this.settings.budgetArchiveFolderPath);
      const path = normalizePath(`${this.settings.budgetArchiveFolderPath}/${sanitizeFilePart(title)}.md`);
      if (this.app.vault.getAbstractFileByPath(path)) continue;
      await this.ensureTextFile(path, () => this.buildArchivedTripNoteContent(trip, title));
      created.push(path);
    }
    return created;
  }

  async openLegacyTripTagMigration() {
    const { plan, trips } = await this.planLegacyTripTagMigration();
    const intro = trips
      .map((trip) => {
        const dates = trip.firstDate ? `, ${trip.firstDate} to ${trip.lastDate}` : "";
        const currency = trip.currency ? `, mostly ${trip.currency}` : "";
        return `${trip.key} — ${trip.entries} entries across ${trip.files} note${trip.files === 1 ? "" : "s"}${currency}${dates}`;
      })
      .join("; ");
    new RewritePreviewModal(this.app, this, {
      title: "Convert legacy trip tags",
      intro: intro
        ? `${intro}. They become ordinary trip spending, which keeps them out of your home budgets and lets the trip dashboards read them.`
        : "",
      plan,
      emptyText: "No legacy trip tags found, so there is nothing to convert.",
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        const created = written ? await this.ensureArchivedTripNotes(trips) : [];
        new Notice(
          [
            `Converted ${written} note${written === 1 ? "" : "s"}`,
            skipped.length ? `${skipped.length} changed since the preview and were left alone` : "",
            created.length ? `created ${created.map((path) => path.split("/").pop()).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(". ") + "."
        );
      },
    }).open();
  }

  async collectTransactionsForHoliday(holidayKey, range = {}) {
    const normalizedHolidayKey = core.normalizeHolidayKey(holidayKey);
    if (!normalizedHolidayKey) return [];
    const allEntries = await this.collectAllTransactions();
    const start = range.start || "1900-01-01";
    const end = range.end || "2999-12-31";
    return allEntries.filter(
      (entry) => entry.holidayKey === normalizedHolidayKey && core.isDateInRange(entry.date, { start, end })
    );
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
        const startDate = core.parseIsoDate(row.start || row.start_date || row["start date"] || "");
        const endDate = core.parseIsoDate(row.end || row.end_date || row["end date"] || "");
        const link = String(row.link || row.note || row.location || "").trim();
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
    // Spread rather than enumerate. This used to list each field by hand, which
    // silently dropped whatever parseGoalDefinition learned to return next — the
    // reason runway goals were parsed correctly by core and then never activated.
    return {
      ...goal,
      activeSavingsGoal: goal.active,
      archivedDate: goal.archivedDate || "",
      filePath,
      goalKey: goal.goalKey || buildGoalKeyFromName(goal.goalName || filePath),
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
        if (file instanceof TFile) await this.startTripFor(file);
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

    // An entry that already carries both amounts was converted by hand — keep
    // it exactly as typed rather than blanking the original or re-converting.
    if (expense.fxProvided) {
      return { ...expense, amount, currency: displayCurrency };
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
      "| Subscriptions | subscriptions | 40 | month | AUD |",
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
    const tripCurrency = core.normalizeCurrency(options.tripCurrency || "", "");
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
      `trip_currency: ${tripCurrency}`,
      `start_date: ${startDate}`,
      `end_date: ${endDate}`,
      "total_budget: 0",
      // Every new trip used to be born with yen rates, wherever it was going.
      "exchange_rates: ",
      "exchange_rate_periods: ",
      "---",
      "",
      `# ${appendBudgetSuffix(holidayTitle)}`,
      "",
      "Set your whole-trip budget in the frontmatter above, then use the tables below to plan expected costs before you travel.",
      "Use `exchange_rates` for one flat rate across the whole trip, or `exchange_rate_periods` for date-specific overrides.",
      "",
      "## Daily trip dashboard",
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
      "`Booked` means reserved or committed. If Booked is above 0 it overrides Planned for your remaining trip budget.",
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
    // A blank due date stays blank. It used to default to today, so a goal made
    // without one was due the moment it existed.
    const dueDate = core.parseIsoDate(options.dueDate || "") || "";
    const currency = core.normalizeCurrency(options.currency || this.settings.defaultCurrency);
    const target = Number(options.targetAmount) > 0 ? core.roundCurrencyAmount(options.targetAmount) : 0;
    return [
      "---",
      `goal_name: ${goalName}`,
      `goal_key: ${goalKey}`,
      `target_amount: ${target}`,
      "starting_balance: 0",
      `due_date: ${dueDate}`,
      // Made on purpose, so it counts straight away: in the sidebar, the
      // forecast and the prompts.
      "active: true",
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
    return stripBudgetSuffix(String(path || "").split("/").pop()?.replace(/\.md$/i, "")) || "Trip";
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
      .filter((file) => file.path !== recurringNotePath)
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
  }

  // Every goal key and income category already in use, so a new goal's key
  // can't collide with either.
  async collectTakenGoalKeys() {
    const goals = await this.collectSavingsGoalDefinitions();
    const entries = await this.collectAllTransactions();
    const keys = new Set(goals.map((goal) => goal.goalKey).filter(Boolean));
    for (const entry of entries) {
      if (entry.entryType === "income" && entry.goalKey) keys.add(entry.goalKey);
    }
    return Array.from(keys);
  }

  async collectTakenTripTags() {
    const entries = await this.collectAllTransactions();
    const tags = new Set(entries.map((entry) => entry.holidayKey).filter(Boolean));
    for (const goal of await this.collectSavingsGoalDefinitions()) {
      if (goal.goalType === "holiday" && goal.tripTag) tags.add(goal.tripTag);
    }
    return Array.from(tags);
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
      .filter((file) => file.path !== recurringNotePath)
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
  }

  async createOrOpenHolidayBudget(definition) {
    const holidayName = String(definition?.name || definition || "").trim();
    if (!holidayName) return null;
    await this.ensureBudgetInfrastructure();
    const safeName =
      holidayName
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Trip";
    const holidayKey = core.normalizeHolidayKey(definition?.holidayKey || "") || guessHolidayTagFromName(holidayName);
    const fileName = appendBudgetSuffix(safeName);
    const budgetPath = normalizePath(`${this.settings.budgetsFolderPath}/${fileName}.md`);
    const file = await this.ensureTextFile(budgetPath, () =>
      this.buildHolidayBudgetNoteContent(`${safeName}`, holidayKey, {
        currency: definition?.currency || this.settings.defaultCurrency,
        endDate: definition?.endDate,
        startDate: definition?.startDate,
        tripCurrency: definition?.tripCurrency,
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
        targetAmount: definition?.targetAmount,
      })
    );
  }

  async archiveActiveHolidayBudget() {
    const activeFile = this.app.vault.getAbstractFileByPath(this.settings.activeHolidayBudgetPath || "");
    if (!(activeFile instanceof TFile)) {
      this.settings.activeHolidayBudgetPath = "";
      await this.saveSettings();
      new Notice("No active trip budget to archive.");
      return;
    }
    const archivePath = await this.archiveGoalNote(activeFile);
    new Notice(`Archived trip budget to ${archivePath}`);
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
          : "No finished trips to archive."
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
    if (item?.billId) {
      // On the bill, not in a daily note: a skipped cycle is a fact about the
      // bill, and $0 of spending is not spending.
      const bill = await this.findBill(item.billId);
      const skipped = Array.from(new Set([...(bill?.skipped || []), item.nextDue || core.todayIsoLocal()])).sort();
      await this.updateBill(item.billId, { skipped });
      return null;
    }

    // The tag must name the bill. A bare `#log/spending/subscriptions/monthly`
    // skip line names no item, so the next parse can only fall back to the
    // line's own note text and invent a bill out of the marker.
    const tag = this.recurringPaymentTag(item);
    return this.appendFinanceLines(item.nextDue || core.todayIsoLocal(), [
      `\t- ${core.formatCurrency(0, item.currency || this.settings.defaultCurrency)} ${tag}`,
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

  // Logs money taken out of a goal (`- $X #log/spending/goal/<goalKey>/<category>`).
  // It counts against the goal's balance, not toward home spending.
  async logGoalWithdrawal(goalKey, goalName, amount, date, note = "", category = "") {
    const categoryPath = core.normalizeCategoryPath(category || "");
    const tag = `#log/spending/goal/${core.normalizeCategoryPath(goalKey)}${categoryPath ? `/${categoryPath}` : ""}`;
    const lines = [`- ${core.formatCurrency(amount, this.settings.defaultCurrency)} ${tag}`];
    lines.push(`\t- ${String(note || "").replace(/\s+/g, " ").trim() || `Withdrawal from ${goalName || goalKey}`}`);
    const file = await this.appendFinanceLines(date || core.todayIsoLocal(), lines);
    this.refreshDailyBudgetView();
    return file;
  }

  // --- Runway ---------------------------------------------------------------
  // "Keep N of outgoings in the bank at all times." It is an ordinary goal note
  // — contributions and withdrawals use the same tag grammar as every other
  // goal — except its target is recomputed from the recurring schedule instead
  // of being a number you typed. That is the only thing that makes it special,
  // so everything else (the goals block, archiving, the settings list) gets it
  // for free.

  // Runway: what you need available to be safe for the chosen period. Pure
  // computation from the bills you have already logged, so there is nothing to
  // set up and nothing to keep in sync.
  async computeRunwayState(referenceDate, options = {}) {
    const entries = options.entries || (await this.collectAllTransactions());
    const recurring = options.recurring || (await this.detectRecurring(referenceDate));
    const mode = core.normalizeRunwayMode(this.settings.runwayMode);
    const recurringPrefix = this.settings.recurringTagPrefix || "subscriptions";
    const forecast = mode === "spending"
      ? core.computeForecastInputs(entries, recurring, {
          referenceDate,
          goalKeys: (await this.collectSavingsGoalDefinitions()).map((item) => item.goalKey),
          recurringPrefix,
        })
      : null;
    const runway = core.computeRunway(recurring, {
      referenceDate,
      period: this.settings.runwayPeriod,
      mode,
      monthlyDiscretionary: forecast?.monthlyDiscretionary || 0,
    });

    // Against the account it comes out of, when one is chosen (the block's
    // `account:`, else Settings → Runway) and has a balance snapshot.
    const balances = core.summarizeBalanceSnapshots(entries);
    const accountKey = core.normalizeCategoryPath(options.account || this.settings.runwayAccount || "");
    const account = accountKey ? balances.accounts.find((item) => item.key === accountKey) : null;
    runway.accountKey = accountKey;
    runway.accountLabel = account?.label || (accountKey ? core.titleCaseSegment(accountKey.split("/").pop()) : "");
    runway.knownAccounts = balances.accounts.map((item) => item.key);
    runway.balance = account?.latest ? core.compareRunwayToBalance(runway, account.latest, { referenceDate }) : null;
    return runway;
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
      "- **Log now** logs the bill dated today, whenever you actually click it — the due-date",
      "  schedule stays anchored to its cadence regardless, even if you log it a few days late.",
      "- **Skip** records the skipped cycle on the bill — the schedule moves on, and no $0 line is written.",
      "- A price change is just the next logged amount; the plugin always uses the latest —",
      "  or use **Edit** in manage mode to schedule a future change with an exact date, or",
      "  correct the next due date directly.",
      "- **Push a week** moves just the next due date, leaving the cadence alone —",
      "  for the month the rent lands late, not a permanent change.",
      "- Pausing a bill moves it into the **Archived** section below, collapsed until you open it;",
      "  from there you can **Resume** it or **Remove completely** so it's never tracked again.",
      "- A bill that stops on its own — a fixed-term contract, an instalment plan —",
      "  gets an **End Date** or **Payments Left** in the registry and retires itself.",
      "- **Runway** below is how much to keep available for the period set in Settings → Runway,",
      "  worked out from these bills. Choose an account there to see whether its balance covers it.",
      "",
      "```finance-recurring",
      "manage: true",
      "```",
      "",
      "## Registry",
      "",
      ...RECURRING_REGISTRY_HELP,
      "",
      core.RECURRING_REGISTRY_HEADER_ROW,
      core.RECURRING_REGISTRY_SEPARATOR_ROW,
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
      "**Contribute to a goal** command (or a bullet like",
      "`- $150.00 #log/income/roadbike`) and nothing needs to move between real",
      "bank accounts. Create goals with **Create savings goal**, and trips with",
      "**Start trip** → type a new trip's name. The finance hub's Goals & trips tab",
      "has all of these too.",
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
      new Notice("Could not read that trip budget note.");
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
      .filter((file) => file.path !== this.getDefaultBudgetNotePath())
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
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
          endDate: holiday.endDate || "",
          file,
          goalKey: holiday.savingsGoalKey,
          goalName: holiday.holidayName,
          goalType: "holiday",
          tripTag: holiday.holidayKey,
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
      // A note left behind by the build where runway was briefly a goal would
      // otherwise show up here as a savings goal with a $0 target.
      if (generic?.goalKey && !generic.isLegacyRunwayNote) {
        goals.push({ ...generic, file });
      }
    }
    return goals;
  }

  async buildSavingsGoalSummary(goalDefinition, referenceDate, options = {}) {
    const allEntries = await this.collectAllTransactions();
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
    // An archived goal is finished business: no set-aside, no pace. The
    // archived Japan trip went on reporting "$7,926 a week, behind pace".
    summary.sinkingFund = summary.targetAmount > 0 && goalDefinition.dueDate && !goalDefinition.archivedDate
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
      // Daily notes carry `date`, but the Journals plugin's week/month/
      // quarter/year notes only carry `journal-date` — without this fallback
      // a dashboard block embedded in e.g. a monthly note has no frontmatter
      // date to read, and its filename (`2026-07.md`) has no day component
      // either, so it silently fell through to today's date instead of the
      // note's own month.
      const frontmatterDate =
        core.parseIsoDate(cache?.frontmatter?.date) || core.parseIsoDate(cache?.frontmatter?.["journal-date"]);
      if (frontmatterDate) return frontmatterDate;
      const pathDate = core.extractNoteDate("", sourceFile.path);
      if (pathDate) return pathDate;
    }
    return core.todayIsoLocal();
  }

  buildBudgetProgress(entries, budgets, range, groupBy, referenceDate, options = {}) {
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
            return entry.category === budget.category || String(entry.category || "").startsWith(`${budget.category}/`);
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

    renderStatCards(wrapper, cardData);
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
  // Two bands, not three, and the outer band only exists where there is real
  // detail to show.
  //
  // The previous version drew major / subcategory / leaf bands whenever *any*
  // category had a subcategory, which meant a category with nothing beneath it
  // got its wedge repeated three times in the same colour at the same angle —
  // concentric duplicates separated by seams, which read as a broken chart. Now
  // a category that does not split simply extends to the full radius, and the
  // ring appears only over the categories that do.
  renderPieChart(wrapper, hierarchy, currency, threshold = 0.08, options = {}) {
    const pieSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    pieSection.createEl("h4", { text: options.title || "Category proportions" });

    const total = hierarchy.groups.reduce((sum, group) => sum + group.total, 0);
    if (total <= 0) {
      pieSection.createDiv({ cls: "finance-tracker-empty", text: "No categorized spending found for this period." });
      return;
    }

    // The deepest genuine split under a major: its leaves where a subcategory
    // splits further, else its subcategories, else nothing.
    const splitOf = (group) => {
      const parts = [];
      for (const subgroup of group.children.filter((item) => item.total > 0)) {
        const leaves = subgroup.children.filter((leaf) => leaf.total > 0 && leaf.key !== subgroup.key);
        if (leaves.length > 1) parts.push(...leaves);
        else parts.push(subgroup);
      }
      return parts.length > 1 || (parts.length === 1 && parts[0].key !== group.key) ? parts : [];
    };

    const size = 460;
    const center = size / 2;
    const outerRadius = 200;
    const anySplit = hierarchy.groups.some((group) => splitOf(group).length);
    const innerRadius = anySplit ? 128 : outerRadius;
    const ringInner = 136;

    let angle = 0;
    const majorSlices = hierarchy.groups
      .filter((group) => group.total > 0)
      .map((group) => {
        const ratio = group.total / total;
        const startAngle = angle;
        angle += ratio * 360;
        return { ...group, ratio, startAngle, endAngle: angle, split: splitOf(group) };
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

    const label = (text, x, y) =>
      svg.createSvg("text", { cls: "finance-tracker-pie-label", text, attr: { x, y, "text-anchor": "middle" } });

    for (const slice of majorSlices) {
      // A category with no further detail runs all the way out; one that splits
      // stops at the inner radius and hands the outer band to its parts.
      const radius = slice.split.length ? innerRadius : outerRadius;
      let majorEl;
      if (slice.ratio >= 0.999) {
        majorEl = svg.createSvg("circle", {
          cls: "finance-tracker-pie-slice",
          attr: { cx: center, cy: center, r: radius, fill: slice.color },
        });
      } else {
        majorEl = svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: { d: describePieSlice(center, center, radius, slice.startAngle, slice.endAngle), fill: slice.color },
        });
      }
      attachTooltip(majorEl, slice.label, slice.total, slice.ratio);

      if (slice.ratio >= threshold) {
        const point = centroidForSlice(center, center, radius, slice.startAngle, slice.endAngle);
        label(slice.label, point.x, point.y + (slice.split.length ? 2 : -8));
        if (!slice.split.length) {
          svg.createSvg("text", {
            cls: "finance-tracker-pie-value",
            text: formatCurrencyShort(slice.total, currency),
            attr: { x: point.x, y: point.y + 12, "text-anchor": "middle" },
          });
        }
      }

      let partAngle = slice.startAngle;
      for (const part of slice.split) {
        const partRatio = part.total / total;
        const partEnd = partAngle + partRatio * 360;
        const partEl = svg.createSvg("path", {
          cls: "finance-tracker-pie-slice",
          attr: {
            d: describeAnnularSlice(center, center, ringInner, outerRadius, partAngle, partEnd),
            fill: part.color,
          },
        });
        attachTooltip(partEl, part.label, part.total, partRatio);
        if (partRatio >= threshold) {
          const mid = partAngle + (partEnd - partAngle) / 2;
          const point = polarToCartesian(center, center, (ringInner + outerRadius) / 2, mid);
          label(part.label.split(" / ").pop(), point.x, point.y + 4);
        }
        partAngle = partEnd;
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
      renderRowTitle(
        item,
        budget.name,
        `${core.formatCurrency(budget.spent, currency)} / ${core.formatCurrency(budget.effectiveLimit || budget.limit, currency)}`
      );
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
      renderRowTitle(item, row.goal.goalName, core.formatCurrency(row.contributedThisRange, row.currency));
      item.createDiv({ cls: "finance-tracker-budget-meta", text: `contributed this ${range.period}` });
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
    const cardData = [
      { label: "Trip budget", value: metrics.totalBudget > 0 ? core.formatCurrency(metrics.totalBudget, currency) : "Not set" },
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

    renderStatCards(wrapper, cardData);
  }

  renderPlannedExpenses(wrapper, plannedExpenses, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Planned expenses" });

    if (!plannedExpenses?.rows?.length) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: "No planned trip costs found yet. Add rows to the Planned expenses table in the trip budget note.",
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
        text: "No allocated in-trip costs found yet. Add rows to the Allocated expenses table in the trip budget note.",
      });
      return;
    }

    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const item of allocatedExpenses.rows) {
      const card = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(card, item.item, core.formatCurrency(item.allocated, currency));
      card.createDiv({ cls: "finance-tracker-budget-meta", text: `${core.formatCurrency(item.allocatedPerDay, currency)}/day` });
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
          text: "Add dated planned log entries like “#log/26/japanmidyear/planned/accommodation 2026-06-18 2026-06-22” in your daily notes to populate the calendar.",
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

      // Traces an outline around each month's days as a proper rectilinear
      // polygon (union of the grid cells belonging to that month), instead of
      // stitching together per-row segments left-to-right. The old approach
      // assumed each month's row segments nested neatly under one another —
      // true for a plain calendar month, but a trip calendar's rows rarely
      // start on column 0, so a month can occupy e.g. only the last column in
      // one row and only the first two in the next. Connecting those with a
      // simple left/right "staircase" produced a path that doubled back on
      // itself. Tracing actual cell-union boundary edges handles any shape.
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

        const outerInset = 2;
        const numRows = tripWeeks.length;

        // day -> {row, col}, plus each day's live rect keyed the same way.
        const dayAt = new Map();
        const posByDay = new Map();
        const rectByDay = new Map();
        for (let weekIndex = 0; weekIndex < numRows; weekIndex += 1) {
          for (const day of tripWeeks[weekIndex]) {
            const col = getWeekdayIndex(day);
            dayAt.set(`${weekIndex}:${col}`, day);
            posByDay.set(day, { col, row: weekIndex });
            const rect = calendarCellMeta.get(day)?.cell?.getBoundingClientRect();
            if (rect) rectByDay.set(day, rect);
          }
        }

        // Columns share the same 7-track grid width in every week row, so a
        // single column's left/right only needs to be read from whichever row
        // happens to have a day there.
        const colLeftRaw = new Array(7).fill(null);
        const colRightRaw = new Array(7).fill(null);
        for (let col = 0; col < 7; col += 1) {
          for (let row = 0; row < numRows; row += 1) {
            const rect = rectByDay.get(dayAt.get(`${row}:${col}`));
            if (rect) {
              colLeftRaw[col] = rect.left - bodyRect.left;
              colRightRaw[col] = rect.right - bodyRect.left;
              break;
            }
          }
        }
        // Plain midpoints, not offset by half the stroke width: two months
        // sharing a border draw their strokes on that exact same line, which
        // is what keeps every edge end-to-end connectable (see loop-stitch
        // below) instead of leaving a stroke-width gap that breaks the trace.
        const colBound = (col, side) => {
          if (side === "left") {
            if (colLeftRaw[col] == null) return null;
            if (col > 0 && colRightRaw[col - 1] != null) {
              return (colRightRaw[col - 1] + colLeftRaw[col]) / 2;
            }
            return colLeftRaw[col] - outerInset;
          }
          if (colRightRaw[col] == null) return null;
          if (col < 6 && colLeftRaw[col + 1] != null) {
            return (colRightRaw[col] + colLeftRaw[col + 1]) / 2;
          }
          return colRightRaw[col] + outerInset;
        };

        const rowTopRaw = new Array(numRows).fill(null);
        const rowBottomRaw = new Array(numRows).fill(null);
        for (let row = 0; row < numRows; row += 1) {
          const rect = rectByDay.get(tripWeeks[row][0]);
          if (rect) {
            rowTopRaw[row] = rect.top - bodyRect.top;
            rowBottomRaw[row] = rect.bottom - bodyRect.top;
          }
        }
        const rowBound = (row, side) => {
          if (side === "top") {
            if (rowTopRaw[row] == null) return null;
            if (row - 1 === selectedWeekIndex) return rowTopRaw[row] - outerInset;
            if (row > 0 && rowBottomRaw[row - 1] != null) {
              return (rowBottomRaw[row - 1] + rowTopRaw[row]) / 2;
            }
            return rowTopRaw[row] - outerInset;
          }
          if (rowBottomRaw[row] == null) return null;
          if (row === selectedWeekIndex) return rowBottomRaw[row] + outerInset;
          if (row < numRows - 1 && rowTopRaw[row + 1] != null) {
            return (rowBottomRaw[row] + rowTopRaw[row + 1]) / 2;
          }
          return rowBottomRaw[row] + outerInset;
        };

        const monthAt = (row, col) => {
          const day = dayAt.get(`${row}:${col}`);
          return day ? monthKeyForDay(day) : null;
        };

        const monthsInGrid = new Map();
        for (let row = 0; row < numRows; row += 1) {
          for (let col = 0; col < 7; col += 1) {
            const monthKey = monthAt(row, col);
            if (monthKey && !monthsInGrid.has(monthKey)) monthsInGrid.set(monthKey, monthMetaByKey.get(monthKey));
          }
        }

        const pointKey = (x, y) => `${x.toFixed(1)}:${y.toFixed(1)}`;

        for (const [monthKey, monthMeta] of monthsInGrid.entries()) {
          const edges = [];
          for (let row = 0; row < numRows; row += 1) {
            for (let col = 0; col < 7; col += 1) {
              if (monthAt(row, col) !== monthKey) continue;
              const left = colBound(col, "left");
              const right = colBound(col, "right");
              const top = rowBound(row, "top");
              const bottom = rowBound(row, "bottom");
              if (left == null || right == null || top == null || bottom == null) continue;

              // Emit an edge for each side whose neighbour isn't the same
              // month. Directions are chosen so a solid region's boundary
              // walks clockwise, letting adjacent cells' edges chain end-to-
              // start into one continuous loop. A row touching the expanded
              // detail panel (selectedWeekIndex) is never visually adjacent
              // to the row on the panel's far side, so that boundary always
              // gets an edge even when the same month sits on both sides —
              // otherwise the trace treats them as touching and cuts a
              // diagonal straight through the gap.
              const topOpen = (row - 1) === selectedWeekIndex || monthAt(row - 1, col) !== monthKey;
              const bottomOpen = row === selectedWeekIndex || monthAt(row + 1, col) !== monthKey;
              if (monthAt(row, col - 1) !== monthKey) edges.push([left, bottom, left, top]);
              if (monthAt(row, col + 1) !== monthKey) edges.push([right, top, right, bottom]);
              if (topOpen) edges.push([left, top, right, top]);
              if (bottomOpen) edges.push([right, bottom, left, bottom]);
            }
          }
          if (!edges.length) continue;

          const byStart = new Map();
          for (const edge of edges) {
            const k = pointKey(edge[0], edge[1]);
            const list = byStart.get(k) || [];
            list.push(edge);
            byStart.set(k, list);
          }

          const used = new Set();
          const loops = [];
          for (const startEdge of edges) {
            if (used.has(startEdge)) continue;
            const startPoint = [startEdge[0], startEdge[1]];
            const loopPoints = [startPoint];
            let current = startEdge;
            used.add(current);
            let guard = 0;
            while (guard <= edges.length) {
              guard += 1;
              const endPoint = [current[2], current[3]];
              if (endPoint[0] === startPoint[0] && endPoint[1] === startPoint[1]) break;
              loopPoints.push(endPoint);
              const candidates = (byStart.get(pointKey(endPoint[0], endPoint[1])) || []).filter((edge) => !used.has(edge));
              if (!candidates.length) break;
              current = candidates[0];
              used.add(current);
            }
            if (loopPoints.length > 2) loops.push(loopPoints);
          }
          if (!loops.length) continue;

          const pathData = loops
            .map((loop) => loop.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z")
            .join(" ");

          const path = svg.createSvg("path", { cls: "finance-tracker-calendar-month-path" });
          path.setAttr("d", pathData);
          path.setAttr("stroke", monthMeta?.accent || "var(--h1-color, var(--text-accent))");
          path.setAttr("fill", "none");

          const firstPos = monthMeta?.firstDay ? posByDay.get(monthMeta.firstDay) : null;
          if (monthMeta?.label && firstPos) {
            const labelLeft = colBound(firstPos.col, "left");
            const labelTop = rowBound(firstPos.row, "top");
            if (labelLeft != null && labelTop != null) {
              const label = overlayHost.createDiv({ cls: "finance-tracker-calendar-month-label", text: monthMeta.label });
              label.style.left = `${labelLeft + 14}px`;
              label.style.top = `${labelTop + 10}px`;
              label.style.color = monthMeta.accent;
            }
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
        text: "No exchange rates configured yet. Add “exchange_rates” or “exchange_rate_periods” to the trip budget frontmatter.",
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
    const cardData = goal.goalType === "holiday"
      ? [
        { label: "Target", value: core.formatCurrency(summary.targetAmount, currency) },
        { label: "In the account", value: core.formatCurrency(summary.currentAccountBalance, currency) },
        { label: "Planned costs paid", value: core.formatCurrency(summary.paidPlannedExpenses, currency) },
        { label: "Saved progress", value: core.formatCurrency(summary.savedProgress, currency) },
        { label: summary.amountRemainingLabel, value: core.formatCurrency(summary.amountRemaining, currency) },
        { label: "Saved %", value: summary.targetAmount > 0 ? `${summary.proportionSaved}%` : "0%" },
        { label: "Needed this period", value: core.formatCurrency(summary.requiredPerPeriod, currency) },
        { label: "This period", value: core.formatCurrency(summary.currentPeriodContribution, currency) },
        { label: "Avg accommodation / day", value: core.formatCurrency(extras.averageAccommodationPerDay || 0, currency) },
        { label: "Most per night", value: extras.maximumAccommodationPerNight ? core.formatCurrency(extras.maximumAccommodationPerNight, currency) : "Not set" },
        { label: "Least per night", value: extras.minimumAccommodationPerNight ? core.formatCurrency(extras.minimumAccommodationPerNight, currency) : "Not set" },
      ]
      : [
        { label: "Target", value: core.formatCurrency(summary.targetAmount, currency) },
        { label: "Saved so far", value: core.formatCurrency(summary.currentSaved, currency) },
        { label: summary.amountRemainingLabel, value: core.formatCurrency(summary.amountRemaining, currency) },
        { label: "Saved %", value: summary.targetAmount > 0 ? `${summary.proportionSaved}%` : "0%" },
        { label: "Needed this period", value: core.formatCurrency(summary.requiredPerPeriod, currency) },
        { label: "This period", value: core.formatCurrency(summary.currentPeriodContribution, currency) },
      ];
    if (summary.sinkingFund) {
      const fund = summary.sinkingFund;
      const paceLabels = {
        ahead: "Ahead of pace",
        behind: "Behind pace",
        complete: "Target reached",
        overdue: "Past due date",
        "on-track": "On track",
        saving: "Saving",
        "not-started": "Nothing saved yet",
      };
      cardData.push({ label: "Set aside / week", value: core.formatCurrency(fund.requiredPerWeek, currency) });
      cardData.push({
        label: "Pace",
        value: paceLabels[fund.status] || fund.status,
        cls: fund.status === "behind" || fund.status === "overdue" ? "is-over" : fund.status === "ahead" || fund.status === "complete" ? "is-down" : "",
      });
    }
    renderStatCards(section, cardData);
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
          archivedDate: holiday.archivedDate || "",
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
    renderStatCards(wrapper, cardData);

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
      text: "This trip has ended, so the dashboard shows the reflection. Add “view: live” to the block to bring the live dashboard back.",
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
          text: "Set “trip: 2026/japan” in this code block, or add a “trip_tag” to the budget note frontmatter.",
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
        text: config.title || `${toTitleFromHolidayKey(holidayKey)} trip`,
      });

      const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
      const exportButton = headerActions.createEl("button", { text: "Export trip CSV" });
      exportButton.addEventListener("click", async () => {
        await this.exportEntriesToCsv(actualEntries, `holiday-${holidayKey.replace(/\//g, "-")}-${effectiveEnd || referenceDate}`);
      });
      if (budgetFile instanceof TFile) {
        const budgetButton = headerActions.createEl("button", { text: "Open trip budget" });
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
        text: `Trip dashboard failed to render: ${error.message}`,
      });
      console.error("[finance-tracker] holiday dashboard render failed", error);
    }
  }

  async renderDailyBudgetCheckInto(el, referenceDate, groupBy = "full", options = {}) {
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
    addAction(headerActions, "Add", () => this.openQuickAdd(), {
      primary: true,
      opensModal: true,
      tooltip: "Quick add a transaction",
    });
    addAction(headerActions, "Budgets", () => this.openDefaultBudgetNote(), { errorPrefix: "Opening budgets note" });
    if (!options.inHub) {
      addAction(headerActions, "Hub", () => this.activateHubView(), { opensModal: true, tooltip: "Open the finance hub" });
    }

    // Summary cards: Today + this period (+ trip cards when one is running).
    // Collected first, rendered once, so the conditional cards join the same
    // grid without each one re-deciding its own markup.
    const summaryCards = [
      { label: "Today", value: core.formatCurrency(core.roundCurrencyAmount(todayTotal), currency) },
      { label: core.titleCaseSegment(basePeriod), value: core.formatCurrency(core.roundCurrencyAmount(periodTotal), currency) },
    ];

    // Safe-to-spend per remaining day, derived from the "all" budget for this period.
    const allBudget = budgets.find(
      (budget) => budget.category === "all" && core.normalizeBudgetPeriod(budget.period) === core.normalizeBudgetPeriod(basePeriod)
    );
    if (allBudget) {
      const scaledLimit = core.scaleBudgetLimit(Number(allBudget.limit || 0), allBudget.period, periodRange, referenceDate, this.settings.weekStartsOn);
      const pace = core.computeBudgetPace({ limit: scaledLimit, spent: periodTotal, periodStart: periodRange.start, periodEnd: periodRange.end, referenceDate });
      summaryCards.push({
        label: "Left / day",
        value: core.formatCurrency(pace.perDayRemaining, currency),
        cls: pace.projected > scaledLimit ? "is-over" : "",
        hint: pace.remainingDays > 0 ? `${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"} to go` : "",
      });
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

      summaryCards.push(
        { label: `${tripName} today`, value: core.formatCurrency(core.roundCurrencyAmount(tripTodaySpend), tripCurrency), cls: "is-trip" },
        { label: "Trip budget left", value: core.formatCurrency(metrics.spendableRemaining, tripCurrency), cls: "is-trip" },
        {
          label: "Safe / day",
          value: core.formatCurrency(dailyCanSpend, tripCurrency),
          cls: "is-trip",
          hint: metrics.remainingTripDays > 0 ? `${metrics.remainingTripDays} trip day${metrics.remainingTripDays === 1 ? "" : "s"} left` : "",
        }
      );
    }

    renderStatCards(wrapper, summaryCards);

    // Goals and trips that need a decision today: due, done, starting, over.
    await this.renderGoalPrompts(wrapper, { referenceDate });

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
          title: `${core.titleCaseSegment(sectionPeriod)} budgets`,
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
        const goalTotal = summary.targetAmount > 0 ? summary.targetAmount : summary.currentSaved + summary.amountRemaining;
        const fillRatio = goalTotal > 0 ? summary.currentSaved / goalTotal : 0;
        const row = goalsSection.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(row, goal.goalName, core.formatCurrency(summary.currentSaved, goal.currency || currency));
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `of ${core.formatCurrency(goalTotal, goal.currency || currency)}`,
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
        renderRowTitle(row, person.displayName, core.formatCurrency(person.outstanding, currency));
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Settle up",
          async () => {
            await this.settleUpWithPerson(person.person, person.displayName, person.outstanding);
            this.refreshDailyBudgetView();
          },
          { primary: true, errorPrefix: "Settle up" }
        );
      }
    }

    // Recurring bills due or overdue — stays here until each is logged.
    const dueRecurring = (await this.detectRecurring(referenceDate)).items.filter(
      (item) => item.active !== false && (item.status === "overdue" || item.status === "due")
    );
    if (dueRecurring.length) {
      const recurringSection = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      recurringSection.createEl("h4", { text: `Recurring bills due (${dueRecurring.length})` });
      for (const item of dueRecurring.slice(0, 8)) {
        const row = recurringSection.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, item.currency || currency));
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: item.status === "overdue" ? `overdue since ${item.nextDue}` : "due today",
        });
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Log now",
          async () => {
            if (item.variable) {
              new LogVariableBillModal(this.app, this, item, () => this.refreshDailyBudgetView()).open();
              return;
            }
            await this.logRecurringNow(item);
            this.refreshDailyBudgetView();
          },
          { primary: true, errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
        );
      }
    }

    // Triage. The count is the whole backlog, not just this period: an entry
    // from three weeks ago needs a category exactly as much as today's does, and
    // a list capped at the current fortnight hid 20 of the author's 24.
    const inboxGroups = await this.buildCategorisationInbox();
    const backlog = inboxGroups.reduce((sum, group) => sum + group.count, 0);
    if (backlog) {
      const triage = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-tracker-triage" });
      triage.createEl("h4", { text: `Needs a category (${backlog})` });
      const thisPeriod = spendEntries.filter((entry) => !entry.category || entry.category === "uncategorized");
      for (const entry of thisPeriod.slice(0, 6)) {
        const row = triage.createDiv({ cls: "finance-tracker-budget-card is-clickable is-uncategorized" });
        renderRowTitle(row, entry.merchant || entry.date || "Untitled", core.formatCurrency(entry.amount, currency));
        row.addEventListener("click", () => this.openEditTransaction(entry));
      }
      if (backlog > thisPeriod.length) {
        triage.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${backlog - thisPeriod.length} more from earlier, across ${inboxGroups.length} merchant${inboxGroups.length === 1 ? "" : "s"}.`,
        });
      }
      addAction(
        triage.createDiv({ cls: "finance-tracker-header-actions" }),
        "Open inbox",
        () => this.activateInboxView(),
        { primary: true, opensModal: true, errorPrefix: "Opening the inbox" }
      );
    }

  }

  // One sidebar render asks for every transaction about ten times over — split
  // balances, due bills, each savings goal, the merchant history. The per-file
  // index already avoids re-parsing unchanged notes, but each call still walked
  // the whole vault and rebuilt the list. This holds that list until a note
  // actually changes; invalidateIndexEntry drops it.
  //
  // Callers treat the result as read-only: collectTransactionsForRange builds a
  // fresh array each time, and nothing sorts or pushes into what it returns.
  // One card per merchant, not one row per entry: the decision is "what is this
  // shop", and answering it once should settle every capture from it — the ones
  // already logged and the ones still to come.
  async renderCategorisationInboxInto(el, options = {}) {
    el.empty();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-inbox" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: options.title || "Categorisation inbox" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    const rerender = () => this.renderCategorisationInboxInto(el, options);
    addAction(headerActions, "Refresh", () => rerender(), { errorPrefix: "Refreshing the inbox" });

    const groups = await this.buildCategorisationInbox();
    const known = await this.collectKnownSuggestions();
    const failed = this.failedCaptureFiles();
    const entryCount = groups.reduce((sum, group) => sum + group.count, 0);
    const suggested = groups.filter((group) => group.suggestion.category);

    if (!groups.length && !failed.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "Nothing waiting — everything logged has a category.",
      });
      return;
    }

    renderStatCards(wrapper, [
      { label: "Entries", value: String(entryCount) },
      { label: "Merchants", value: String(groups.length) },
      {
        label: "Suggested",
        value: String(suggested.length),
        hint: suggested.length ? "one tap each" : "",
      },
      ...(failed.length ? [{ label: "Failed captures", value: String(failed.length), cls: "is-over" }] : []),
    ]);

    if (groups.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Needs a category" });
      for (const group of groups) {
        this.renderInboxGroup(section, group, { currency, known, rerender });
      }
    }

    if (failed.length) await this.renderFailedCaptures(wrapper, failed, rerender);
  }

  renderInboxGroup(host, group, context) {
    const { currency, known, rerender } = context;
    const card = host.createDiv({ cls: "finance-tracker-budget-card finance-inbox-group" });
    renderRowTitle(card, group.label, core.formatCurrency(group.total, currency));

    const dates = group.firstDate === group.lastDate ? group.firstDate : `${group.firstDate} to ${group.lastDate}`;
    card.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${group.count} entr${group.count === 1 ? "y" : "ies"} · ${dates}`,
    });
    // The variants are worth showing: they are why these did not group before.
    if (group.merchants.length > 1) {
      card.createDiv({ cls: "finance-tracker-budget-meta", text: `as written: ${group.merchants.join(" · ")}` });
    }

    const remember = { value: !group.conflicted };
    const apply = async (category) => {
      const updated = await this.applyCategoryToEntries(group.entries, category, {
        remember: remember.value,
        merchant: group.merchant,
      });
      new Notice(`Filed ${updated} entr${updated === 1 ? "y" : "ies"} as ${core.displayCategoryPath(category)}.`);
      await rerender();
    };

    if (group.suggestion.category) {
      const reason = this.describeSuggestionSource(group.suggestion.source);
      card.createDiv({
        cls: "finance-tracker-budget-meta is-suggestion",
        text: `Suggested: ${core.displayCategoryPath(group.suggestion.category)}${reason ? ` — ${reason}` : ""}`,
      });
    }

    const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
    if (group.suggestion.category) {
      addAction(
        actions,
        `File ${group.count} as ${core.displayCategoryPath(group.suggestion.category)}`,
        () => apply(group.suggestion.category),
        { primary: true, errorPrefix: "Filing" }
      );
    }

    const pickerHost = card.createDiv({ cls: "finance-inbox-picker is-hidden" });
    let picker = null;
    addAction(
      actions,
      group.suggestion.category ? "Choose another" : "Choose a category",
      () => {
        pickerHost.toggleClass("is-hidden", !pickerHost.hasClass("is-hidden"));
        if (picker) return;
        picker = new CategoryPicker(pickerHost, {
          categories: known.categories,
          value: group.suggestion.category,
        });
        const pickerActions = pickerHost.createDiv({ cls: "finance-tracker-header-actions" });
        addAction(pickerActions, `File ${group.count}`, () => apply(picker.getValue()), {
          primary: true,
          errorPrefix: "Filing",
        });
      },
      { opensModal: true }
    );

    addToggleAction(
      card,
      group.conflicted ? "Remember (this shop has been filed two ways)" : "Remember this merchant",
      remember.value,
      (checked) => {
        remember.value = checked;
      }
    );

    const details = card.createEl("details", { cls: "finance-inbox-entries" });
    details.createEl("summary", { text: `Show ${group.count} entr${group.count === 1 ? "y" : "ies"}` });
    const sorted = group.entries.slice().sort((left, right) => String(right.date).localeCompare(String(left.date)));
    for (const entry of sorted) {
      const row = details.createDiv({ cls: "finance-tracker-budget-meta is-clickable" });
      row.setText(`${entry.date} · ${core.formatCurrency(entry.amount, currency)} · ${entry.merchant || "(no merchant)"}`);
      row.addEventListener("click", () => this.openEditTransaction(entry));
    }
  }

  // Captures that never became entries. They used to be invisible: a notice at
  // the time, then a file in a folder nobody opens.
  async renderFailedCaptures(wrapper, files, rerender) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: `Captures that failed (${files.length})` });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "These never became entries. Fix whatever sent them, then retry — or dismiss one for good.",
    });

    for (const file of files) {
      const { reason, body } = await this.readFailedCapture(file);
      const card = section.createDiv({ cls: "finance-tracker-budget-card" });
      card.createDiv({ cls: "finance-tracker-budget-title", text: body || file.name });
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: [reason || "No reason recorded", file.name].join(" · "),
      });
      const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
      addAction(
        actions,
        "Retry",
        async () => {
          const result = await this.retryFailedCapture(file);
          new Notice(result.logged ? "Logged." : `Still failing: ${result.reason}`);
          await rerender();
        },
        { primary: true, errorPrefix: "Retrying" }
      );
      let armed = false;
      const dismiss = addAction(
        actions,
        "Dismiss",
        async () => {
          // Deleting is final, so the button asks once rather than relying on a
          // modal nobody reads.
          if (!armed) {
            armed = true;
            dismiss.setText("Delete this capture?");
            dismiss.disabled = false;
            return;
          }
          await this.app.vault.delete(file);
          await rerender();
        },
        { warning: true, errorPrefix: "Dismissing" }
      );
    }
  }

  async collectAllTransactions() {
    if (this._allTransactions) return this._allTransactions;
    const entries = await this.collectTransactionsForRange({ period: "all", start: "1900-01-01", end: "2999-12-31" });
    this._allTransactions = entries;
    return entries;
  }

  // Appends raw finance lines (already tab-indented as needed) to the end of a
  // daily note's finance section, creating the note and heading when missing,
  // then heals the running total.
  async appendFinanceLines(date, newLines) {
    const notePath = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(notePath);
    const file = existing instanceof TFile ? existing : await this.createDailyNoteFromTemplate(notePath, date);
    const content = await this.app.vault.cachedRead(file);
    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    // The configured heading first, then whatever this note already uses, so a
    // note still headed "## Spending" gains lines in that section rather than a
    // second one below it.
    let headingIndex = core.findFinanceHeadingIndex(lines, this.settings.spendingHeading || "## Finance");
    if (headingIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push(this.settings.spendingHeading || "## Finance");
      lines.push(`- [ ] ${this.settings.spendingRootTag || "#log/spending"} 0`);
      headingIndex = lines.length - 2;
    }
    // The daily template ships the heading already present but empty, so the
    // branch above never runs on a real note and the root line never appeared.
    // Without it recomputeSpendingTotals bails out (no total is ever written)
    // and the tab-indented bullets below have no parent list item — markdown
    // then renders them as an indented code block rather than a nested list.
    const rootTag = this.settings.spendingRootTag || "#log/spending";
    const rootRe = new RegExp(`^- \\[[^\\]]\\] ${rootTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i");
    let hasRoot = false;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (/^#{1,6}\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) break;
      if (rootRe.test(trimmed)) {
        hasRoot = true;
        break;
      }
    }
    if (!hasRoot) lines.splice(headingIndex + 1, 0, `- [ ] ${rootTag} 0`);
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

  // --- Categorisation inbox -----------------------------------------------------

  // Everything still uncategorised, grouped by merchant root and carrying a
  // suggestion. Grouping is the point: twelve rows of "SQ * Rode Fresh" are one
  // decision, and the sidebar's date-limited list could never show them anyway.
  async buildCategorisationInbox() {
    const entries = (await this.collectAllTransactions()).filter(
      (entry) => core.isSpendingEntry(entry) && (!entry.category || entry.category === "uncategorized")
    );
    const sources = await this.merchantSuggestionSources();
    const conflicts = this.merchantRootConflicts(sources.history);

    return core.groupEntriesByMerchantRoot(entries).map((group) => {
      // The most recent spelling is the one to ask about.
      const latest = group.entries.reduce(
        (newest, entry) => (String(entry.date || "") >= String(newest.date || "") ? entry : newest),
        group.entries[0] || {}
      );
      const merchant = latest.merchant || group.merchants[0] || "";
      return {
        ...group,
        merchant,
        suggestion: core.suggestCategoryForMerchant(merchant, sources),
        // Where the same shop has been filed two different ways, remembering a
        // rule would overrule a distinction you drew on purpose.
        conflicted: (conflicts.get(group.key)?.size || 0) > 1,
      };
    });
  }

  // Has this shop been filed more than one way? Used for the "remember" default:
  // where you have drawn a distinction on purpose (Bagel Boys as breakfast and
  // as lunch), a rule would quietly overrule it.
  async merchantHasConflictingHistory(merchant) {
    const root = core.merchantRootKey(merchant || "");
    if (!root) return false;
    const sources = await this.merchantSuggestionSources();
    return (this.merchantRootConflicts(sources.history).get(root)?.size || 0) > 1;
  }

  merchantRootConflicts(history) {
    const byRoot = new Map();
    for (const [key, info] of history || []) {
      const root = core.merchantRootKey(info?.name || key);
      if (!root) continue;
      const seen = byRoot.get(root) || new Set();
      seen.add(info?.category || "");
      byRoot.set(root, seen);
    }
    return byRoot;
  }

  // Writes one category across a set of entries, note by note. Entries are found
  // by their exact raw line, so an edit elsewhere in the note cannot shift them,
  // and each note is written once however many of its lines changed.
  async applyCategoryToEntries(entries, category, options = {}) {
    const cleanCategory = core.normalizeCategoryPath(category);
    if (!cleanCategory) throw new Error("Pick a category first.");

    const byFile = new Map();
    for (const entry of entries || []) {
      const list = byFile.get(entry.filePath) || [];
      list.push(entry);
      byFile.set(entry.filePath, list);
    }

    let updated = 0;
    for (const [path, list] of byFile) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      let content = await this.app.vault.cachedRead(file);
      // Bottom-up, so replacing one entry cannot shift the line another is at.
      const ordered = list.slice().sort((left, right) => (right.lineIndex ?? -1) - (left.lineIndex ?? -1));
      for (const entry of ordered) {
        const next = core.replaceTransactionBlock(
          content,
          entry.rawLine,
          { ...entry, category: cleanCategory },
          this.settings,
          { lineIndex: entry.lineIndex }
        );
        if (next == null) continue;
        content = next;
        updated += 1;
      }
      await _ftModify(this.app, file, content);
      this.invalidateIndexEntry(path);
    }

    if (options.remember && options.merchant) {
      await this.rememberMerchantCategory(options.merchant, cleanCategory);
    }
    this._scheduleStatusBarUpdate();
    this.refreshDailyBudgetView();
    this.refreshInboxView();
    return updated;
  }

  openRecategorise(category = "") {
    const modal = new RecategoriseModal(this.app, this, { category });
    modal.open();
    return modal;
  }

  // --- Tidying up the old bill model ---------------------------------------------

  async planRecurringCleanup() {
    const payload = [];
    for (const file of this.getDailyNoteFiles()) {
      payload.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const plan = core.planNoteRewrite(
      payload,
      core.buildRecurringCleanupTransform({
        prefix: this.settings.recurringTagPrefix || "subscriptions",
        defaultCurrency: this.settings.defaultCurrency,
        heading: this.settings.spendingHeading,
        spendingRootTag: this.settings.spendingRootTag,
      })
    );

    // The registry keeps a row for every bill it has ever seen, including the
    // phantom "Skipped This Cycle" one the old nameless skip lines minted.
    const registryPlan = await this.planStaleRegistryRows();
    return {
      files: [...plan.files, ...registryPlan.files],
      samples: [...plan.samples, ...registryPlan.samples].slice(0, 5),
      warnings: [...plan.warnings, ...registryPlan.warnings],
      totals: {
        files: plan.totals.files + registryPlan.totals.files,
        entries: plan.totals.entries + registryPlan.totals.entries,
        warnings: plan.totals.warnings + registryPlan.totals.warnings,
      },
    };
  }

  // Ghost registry rows: the "Skipped This Cycle" one the old nameless skip lines
  // minted, and any other row with no history and no amount.
  //
  // Deliberately narrow. A row with an amount and no history is a bill set up
  // before its first payment — the author has one for car registration, $795 a
  // year, logged nowhere yet — and dropping that would throw away the setup.
  async planStaleRegistryRows() {
    const file = this.app.vault.getAbstractFileByPath(this.getRecurringNotePath());
    if (!(file instanceof TFile)) return { files: [], samples: [], warnings: [], totals: { files: 0, entries: 0, warnings: 0 } };
    const content = await this.app.vault.cachedRead(file);
    const detected = new Set(
      core
        .detectRecurringPayments(await this.collectAllTransactions(), {
          prefix: this.settings.recurringTagPrefix || "subscriptions",
        })
        .items.map((item) => item.name)
    );

    return core.planNoteRewrite([{ path: file.path, content }], (noteContent) => {
      const lines = String(noteContent).replace(/\r\n/g, "\n").split("\n");
      const keep = [];
      const warnings = [];
      const samples = [];
      let removed = 0;
      for (const line of lines) {
        const isRow = /^\s*\|/.test(line) && !/^\s*\|?[\s:-]+\|/.test(line);
        const cells = isRow ? line.split("|").slice(1, -1).map((cell) => cell.trim()) : [];
        const name = isRow ? core.normalizeCategoryPath(cells[0] || "") : "";
        const amount = core.parseNumber(cells[2] || "");
        const isGhost = !detected.has(name) && (!(amount > 0) || /^skipped/.test(name));
        if (name && name !== "item" && isGhost) {
          removed += 1;
          warnings.push({ line: line.trim(), reason: "no payments and no amount — a leftover row" });
          if (samples.length < 2) samples.push({ before: line.trim(), after: "(row removed)" });
          continue;
        }
        keep.push(line);
      }
      return { content: keep.join("\n"), entries: removed, samples, warnings };
    });
  }

  async openRecurringCleanup() {
    const plan = await this.planRecurringCleanup();
    new RewritePreviewModal(this.app, this, {
      title: "Tidy up recurring payments",
      intro:
        "Removes same-day duplicate bill charges — the same bill logged twice because wording variants were each treated as their own bill — along with the old $0 skip markers and registry rows for bills that no longer exist.",
      plan,
      warningsLabel: "Lines being removed",
      emptyText: "Nothing to tidy up.",
      applyLabel: `Remove ${plan.totals.entries} line${plan.totals.entries === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        new Notice(
          `Tidied ${written} note${written === 1 ? "" : "s"}${
            skipped.length ? `. ${skipped.length} changed since the preview and were left alone` : ""
          }.`
        );
      },
    }).open();
  }

  // --- Recategorising ---------------------------------------------------------

  // Everything filed under a category, grouped by merchant. A category rarely
  // needs renaming wholesale: bare "transport" in the author's vault is six
  // Translink trips, five rideshares, three Lime scooters and a car park, and
  // the merchant is what says which is which.
  async buildCategoryBreakdown(category) {
    const target = core.normalizeCategoryPath(category);
    if (!target) return { entries: [], groups: [] };
    const entries = (await this.collectAllTransactions()).filter(
      (entry) => core.isSpendingEntry(entry) && (entry.category === target || entry.category.startsWith(`${target}/`))
    );
    return { entries, groups: core.groupEntriesByMerchantRoot(entries) };
  }

  // Plans a set of per-entry category changes, plus the table cells that point at
  // the old path. Nothing is written: this is what the preview shows.
  async planCategoryAssignments(assignments, options = {}) {
    const byPath = new Map();
    for (const assignment of assignments || []) {
      const category = core.normalizeCategoryPath(assignment?.category);
      if (!category) continue;
      for (const entry of assignment.entries || []) {
        if (entry.category === category) continue;
        const list = byPath.get(entry.filePath) || [];
        list.push({ entry, category });
        byPath.set(entry.filePath, list);
      }
    }

    const files = [];
    for (const path of byPath.keys()) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      files.push({ path, content: await this.app.vault.cachedRead(file) });
    }

    const settings = this.settings;
    const plan = core.planNoteRewrite(files, (content, path) => {
      // Bottom-up, so rewriting one entry cannot shift the line another sits at.
      const changes = (byPath.get(path) || [])
        .slice()
        .sort((left, right) => (right.entry.lineIndex ?? -1) - (left.entry.lineIndex ?? -1));
      let next = content;
      let entries = 0;
      const samples = [];
      for (const { entry, category } of changes) {
        const expense = { ...entry, category };
        const replaced = core.replaceTransactionBlock(next, entry.rawLine, expense, settings, { lineIndex: entry.lineIndex });
        if (replaced == null) continue;
        if (samples.length < 3) {
          samples.push({ before: entry.rawLine.trim(), after: core.buildTransactionBlock(expense, settings)[0].trim() });
        }
        next = replaced;
        entries += 1;
      }
      return { content: next, entries, samples };
    });

    const tableRenames = options.tableRenames || [];
    if (!tableRenames.length) return plan;

    const tableFiles = [];
    for (const file of this.categoryReferenceFiles()) {
      tableFiles.push({ path: file.path, content: await this.app.vault.cachedRead(file) });
    }
    const tablePlan = core.planNoteRewrite(tableFiles, core.buildCategoryTableRenameTransform(tableRenames));

    return {
      files: [...plan.files, ...tablePlan.files],
      samples: [...plan.samples, ...tablePlan.samples].slice(0, 5),
      warnings: [...plan.warnings, ...tablePlan.warnings],
      totals: {
        files: plan.totals.files + tablePlan.totals.files,
        entries: plan.totals.entries + tablePlan.totals.entries,
        warnings: plan.totals.warnings + tablePlan.totals.warnings,
      },
    };
  }

  // Notes that mention categories outside the daily notes: the budgets table and
  // every goal or trip note with planned and allocated tables.
  categoryReferenceFiles() {
    const budgetsPrefix = normalizePath(`${this.settings.budgetsFolderPath}/`);
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(budgetsPrefix))
      .filter((file) => !file.path.startsWith(`${this.getBillsFolderPath()}/`));
  }

  // Merchant rules point at categories too.
  async renameCategoryInMerchantMap(renames) {
    const map = { ...(this.settings.merchantMap || {}) };
    let changed = 0;
    for (const [merchant, category] of Object.entries(map)) {
      for (const { from, to } of renames || []) {
        const cleanFrom = core.normalizeCategoryPath(from);
        const cleanTo = core.normalizeCategoryPath(to);
        if (!cleanFrom || !cleanTo) continue;
        if (category === cleanFrom) {
          map[merchant] = cleanTo;
          changed += 1;
        } else if (category.startsWith(`${cleanFrom}/`)) {
          map[merchant] = `${cleanTo}/${category.slice(cleanFrom.length + 1)}`;
          changed += 1;
        }
      }
    }
    if (!changed) return 0;
    this.settings.merchantMap = map;
    this._merchantSources = null;
    await this.saveSettings();
    return changed;
  }

  // --- Failed captures ------------------------------------------------------------

  failedCaptureFiles() {
    const folder = normalizePath(`${this.settings.captureInboxFolder || ""}/_failed`);
    if (!folder) return [];
    const prefix = `${folder}/`;
    return this.app.vault.getFiles().filter((file) => file.path.startsWith(prefix));
  }

  async readFailedCapture(file) {
    const raw = await this.app.vault.cachedRead(file);
    const lines = String(raw).split("\n");
    const reason = (lines[0].match(/finance-capture error:\s*(.*?)\s*-->/) || [])[1] || "";
    return { file, reason, body: lines.slice(1).join("\n").trim() };
  }

  // Retries a quarantined capture without re-quarantining it: a line that still
  // will not parse stays exactly where it is, with its original reason.
  async retryFailedCapture(file) {
    const { body } = await this.readFailedCapture(file);
    const params = core.parseInboxLine(body);
    if (!params) return { logged: 0, reason: "Still nothing to parse in this line." };
    try {
      const expense = this.parseCaptureParams(params);
      const result = await this.handleCaptureExpense(expense, { notify: false, method: "inbox" });
      if (result.skipped) return { logged: 0, reason: this.describeSkippedCapture(result) };
      await this.app.vault.delete(file);
      this.refreshInboxView();
      return { logged: 1, reason: "" };
    } catch (error) {
      return { logged: 0, reason: error?.message || String(error) };
    }
  }

  // --- Bills -------------------------------------------------------------------
  // One note per bill, in a Bills folder beside the budgets. Notes rather than a
  // table because a bill has ten fields and a table with eleven columns is not
  // hand-editable, and because Obsidian's own properties editor then works on
  // them — including on a phone.

  getBillsFolderPath() {
    return normalizePath(`${this.settings.budgetsFolderPath}/Bills`);
  }

  async loadBills(options = {}) {
    const prefix = `${this.getBillsFolderPath()}/`;
    const bills = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const content = await this.app.vault.cachedRead(file);
      const bill = core.parseBillDefinition(parseFrontmatter(content), {
        defaultCurrency: this.settings.defaultCurrency,
        notePath: file.path,
      });
      // A merged bill's note is kept as a record, but it no longer claims
      // payments — the bill it was merged into does, through the alias.
      if (bill && (!bill.mergedInto || options.includeMerged)) bills.push(bill);
    }
    return bills.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findBill(billId) {
    const id = core.normalizeBillId(billId);
    return (await this.loadBills()).find((bill) => bill.id === id) || null;
  }

  buildBillFrontmatter(bill) {
    const value = (input) => (input === null || input === undefined ? "" : String(input));
    return [
      "---",
      `bill_id: ${bill.id}`,
      `bill_name: ${bill.name}`,
      `aliases: [${(bill.aliases || []).join(", ")}]`,
      `cadence: ${bill.cadence}`,
      `due_rule: ${core.serializeBillDueRule(bill.dueRule)}`,
      `amount: ${value(bill.amount)}`,
      `amount_model: ${bill.amountModel || "fixed"}`,
      `reminder_days: ${value(bill.reminderDays ?? 3)}`,
      `active: ${bill.active === false ? "false" : "true"}`,
      `auto_log: ${bill.autoLog ? "true" : "false"}`,
      `next_amount: ${value(bill.nextAmount)}`,
      `change_date: ${value(bill.changeDate)}`,
      `end_date: ${value(bill.endDate)}`,
      `payments_left: ${value(bill.paymentsLeft)}`,
      `next_due: ${value(bill.nextDueOverride)}`,
      `skipped: [${(bill.skipped || []).join(", ")}]`,
      `start_date: ${value(bill.startDate)}`,
      `currency: ${bill.currency || this.settings.defaultCurrency}`,
      ...(bill.mergedInto ? [`merged_into: ${bill.mergedInto}`] : []),
      "---",
    ].join("\n");
  }

  buildBillNoteContent(bill) {
    return [
      this.buildBillFrontmatter(bill),
      "",
      `# ${bill.name}`,
      "",
      "Everything about this bill lives in the properties above — edit them here or",
      "from the Bills list. Payments are the entries tagged",
      `\`#log/spending/${this.settings.recurringTagPrefix || "subscriptions"}/${bill.cadence}/${bill.id}\`, plus anything`,
      "matching an alias.",
      "",
      "```finance-bill",
      "```",
      "",
    ].join("\n");
  }

  billNotePath(bill) {
    return normalizePath(`${this.getBillsFolderPath()}/${sanitizeFilePart(bill.name || bill.id)}.md`);
  }

  // Writes a bill note, keeping whatever the user has written below the
  // properties — notes, a receipt, the phone number for cancelling.
  async saveBill(bill) {
    const path = bill.notePath || this.billNotePath(bill);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const content = await this.app.vault.cachedRead(existing);
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
      await _ftModify(this.app, existing, `${this.buildBillFrontmatter(bill)}\n${body}`);
      return existing;
    }
    await this.ensureFolder(this.getBillsFolderPath());
    return this.upsertFile(path, this.buildBillNoteContent(bill));
  }

  async updateBill(billId, patch = {}) {
    const bill = await this.findBill(billId);
    if (!bill) throw new Error(`No bill note found for ${billId}.`);
    const next = { ...bill, ...patch };
    await this.saveBill(next);
    this.refreshDailyBudgetView();
    return next;
  }

  // The move from the registry to bill notes. Planned from what the old model
  // detected, with duplicates merged and removed bills kept as ended ones, and
  // shown in full before a single note is created.
  async planBillMigration(referenceDate = core.todayIsoLocal()) {
    const entries = await this.collectAllTransactions();
    const prefix = this.settings.recurringTagPrefix || "subscriptions";
    const detected = core.detectRecurringPayments(entries, { prefix, referenceDate });
    const applied = core.applyRecurringRegistry(detected, await this.loadRecurringRegistry(), referenceDate);
    const planned = core.planBillsFromLegacy(applied.items, {
      excluded: this.settings.excludedRecurringItems || [],
      referenceDate,
      defaultCurrency: this.settings.defaultCurrency,
    });

    const existing = new Set((await this.loadBills()).map((bill) => bill.id));
    const files = [];
    const samples = [];
    const warnings = [];
    for (const bill of planned) {
      if (existing.has(bill.id)) continue;
      const path = this.billNotePath(bill);
      files.push({ path, before: "", after: this.buildBillNoteContent(bill), entries: 1, create: true });
      if (bill.mergedFrom.length && samples.length < 5) {
        samples.push({
          before: [bill.id, ...bill.mergedFrom].join(", "),
          after: `${bill.name} — one bill, ${bill.payments} payments`,
        });
      }
      if (bill.retired) {
        warnings.push({
          line: `${bill.name} · ${cadenceLabel(bill.cadence)} · ${core.formatCurrency(bill.amount, bill.currency)}`,
          reason: `ended ${bill.endDate || "(no payments)"} — kept with its history, not tracked as due`,
        });
      }
    }

    return {
      planned,
      plan: {
        files,
        samples,
        warnings,
        totals: { files: files.length, entries: files.length, warnings: warnings.length },
      },
    };
  }

  async openBillMigration() {
    const { planned, plan } = await this.planBillMigration();
    const live = planned.filter((bill) => !bill.retired).length;
    const merged = planned.reduce((sum, bill) => sum + bill.mergedFrom.length, 0);
    new RewritePreviewModal(this.app, this, {
      title: "Convert recurring payments to bill notes",
      intro: `${planned.length} bill${planned.length === 1 ? "" : "s"}: ${live} running, ${planned.length - live} ended.${
        merged ? ` ${merged} duplicate wording${merged === 1 ? " is" : "s are"} merged into the bill they belong to.` : ""
      } Each becomes a note in ${this.getBillsFolderPath()}; your daily notes are not touched.`,
      plan,
      warningsLabel: "Ended bills",
      emptyText: "Every bill already has a note.",
      applyLabel: `Create ${plan.totals.files} bill note${plan.totals.files === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.applyNoteRewritePlan(approved);
        this.refreshDailyBudgetView();
        new Notice(
          `Created ${written} bill note${written === 1 ? "" : "s"}${skipped.length ? `, ${skipped.length} already existed` : ""}.`
        );
      },
    }).open();
  }

  // Registry-shaped patches from the existing UI, translated for a bill note.
  billPatchFromItemPatch(patch = {}) {
    const next = {};
    if ("active" in patch) next.active = patch.active;
    if ("autoLog" in patch) next.autoLog = patch.autoLog;
    if ("variable" in patch) next.amountModel = patch.variable ? "variable" : "fixed";
    if ("amount" in patch) next.amount = patch.amount;
    if ("nextAmount" in patch) next.nextAmount = patch.nextAmount;
    if ("changeDate" in patch) next.changeDate = patch.changeDate;
    if ("nextDue" in patch) next.nextDueOverride = patch.nextDue;
    if ("endDate" in patch) next.endDate = patch.endDate;
    if ("paymentsLeft" in patch) next.paymentsLeft = patch.paymentsLeft;
    if ("name" in patch) next.name = patch.name;
    if ("aliases" in patch) next.aliases = patch.aliases;
    if ("dueRule" in patch) next.dueRule = patch.dueRule;
    if ("reminderDays" in patch) next.reminderDays = patch.reminderDays;
    return next;
  }

  // One entry point for every per-bill change, whichever model is in play.
  openEditBill(item, onSaved) {
    const modal = new EditRecurringItemModal(this.app, this, item, onSaved);
    modal.open();
    return modal;
  }

  async updateRecurringItem(item, patch = {}) {
    if (item?.billId) {
      await this.updateBill(item.billId, this.billPatchFromItemPatch(patch));
      return;
    }
    await this.updateRecurringRegistryEntry(item, patch);
  }

  // Merging is how a duplicate is dealt with now: the loser's name becomes an
  // alias of the winner, so its history joins up instead of being hidden.
  async mergeBillInto(sourceItem, targetBillId) {
    const target = await this.findBill(targetBillId);
    if (!target) throw new Error("That bill no longer exists.");
    const names = [sourceItem.billId, sourceItem.label, sourceItem.merchant, sourceItem.name].filter(Boolean);
    const aliases = Array.from(new Set([...(target.aliases || []), ...names.map((name) => String(name).trim())]));
    await this.saveBill({ ...target, aliases });

    if (sourceItem.billId && sourceItem.notePath) {
      const file = this.app.vault.getAbstractFileByPath(sourceItem.notePath);
      // The merged bill's note is archived rather than deleted: it may hold
      // notes of your own, and deleting a note is not this plugin's decision.
      if (file instanceof TFile) {
        const bill = await this.findBill(sourceItem.billId);
        if (bill) await this.saveBill({ ...bill, active: false, mergedInto: target.id });
      }
    }
    this.refreshDailyBudgetView();
  }

  // --- Recurring payments -----------------------------------------------------

  async detectRecurring(referenceDate, prefix = "") {
    const entries = await this.collectAllTransactions();
    const today = referenceDate || core.todayIsoLocal();
    const activePrefix = prefix || this.settings.recurringTagPrefix || "subscriptions";

    // Once there are bill notes, they are the source of truth and detection is
    // only a source of suggestions. Until then — a fresh install, or one that
    // has not run the migration — the old path still works exactly as it did.
    const bills = await this.loadBills();
    if (bills.length) {
      const view = core.buildBillsView(bills, entries, { prefix: activePrefix, referenceDate: today });
      return { ...view, billsMode: true, items: this.sortRecurringItems(view.items) };
    }

    const detected = core.detectRecurringPayments(entries, { prefix: activePrefix, referenceDate: today });
    const applied = core.applyRecurringRegistry(detected, await this.loadRecurringRegistry(), today);
    const excluded = this.excludeRemovedRecurringItems(applied);
    return { ...excluded, items: this.sortRecurringItems(excluded.items), suggestions: [], unmatched: [] };
  }

  // Bills the user chose to "remove completely" from the Archived section
  // never resurface, even though detection is tag-driven off history — this
  // filter is the one place every consumer (settings, the dashboard block,
  // auto-logging) shares, so a single exclusion list covers all of them.
  excludeRemovedRecurringItems(applied) {
    const excluded = new Set(this.settings.excludedRecurringItems || []);
    if (!excluded.size) return applied;
    const items = applied.items.filter((item) => !excluded.has(item.name));
    // The totals have to be recomputed, not carried over. They were not, so a
    // bill you removed for good still counted toward cost per month, cost per
    // year, and everything downstream of them — in the author's vault twelve
    // removed duplicates, most of a thousand dollars a month of bills that do
    // not exist.
    const active = items.filter((item) => item.active !== false);
    return {
      ...applied,
      items,
      totals: {
        monthly: core.roundCurrencyAmount(active.reduce((sum, item) => sum + Number(item.monthlyCost || 0), 0)),
        yearly: core.roundCurrencyAmount(active.reduce((sum, item) => sum + Number(item.yearlyCost || 0), 0)),
      },
    };
  }

  // "Due date" (the default) keeps finance-core's own ordering — overdue
  // first, then due, then upcoming, each by next-due date ascending. The
  // other orders are a flat re-sort layered on top, shared by every consumer
  // (dashboard block, sidebar due-bills card, settings list) since they all
  // go through detectRecurring.
  sortRecurringItems(items) {
    const order = this.settings.recurringSortOrder || "dueDate";
    if (order === "dueDate") return items;
    const sorted = [...items];
    if (order === "amountDesc") sorted.sort((a, b) => (b.lastAmount || 0) - (a.lastAmount || 0));
    else if (order === "amountAsc") sorted.sort((a, b) => (a.lastAmount || 0) - (b.lastAmount || 0));
    else if (order === "nameAsc") sorted.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
    else if (order === "monthlyCostDesc") sorted.sort((a, b) => (b.monthlyCost || 0) - (a.monthlyCost || 0));
    return sorted;
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
    const variable = patch.variable ?? Boolean(current.variable);
    const amount = patch.amount !== undefined ? patch.amount : current.amount > 0 ? current.amount : item.lastAmount;
    const amountCell = core.formatPlainNumber(amount);
    const nextAmount = patch.nextAmount !== undefined ? patch.nextAmount : current.nextAmount;
    const changeDate = patch.changeDate !== undefined ? patch.changeDate : current.changeDate;
    const nextDue = patch.nextDue !== undefined ? patch.nextDue : current.nextDue;
    const endDate = patch.endDate !== undefined ? patch.endDate : current.endDate;
    const paymentsLeft = patch.paymentsLeft !== undefined ? patch.paymentsLeft : current.paymentsLeft;
    const row = `| ${[
      item.name,
      item.cadence,
      amountCell,
      active ? "yes" : "no",
      autoLog ? "yes" : "no",
      variable ? "yes" : "no",
      nextAmount > 0 ? core.formatPlainNumber(nextAmount) : "",
      changeDate || "",
      nextDue || "",
      endDate || "",
      Number.isFinite(paymentsLeft) && paymentsLeft !== null ? String(paymentsLeft) : "",
    ].join(" | ")} |`;

    const lines = String(content).replace(/\r\n/g, "\n").split("\n");
    const headerIndex = lines.findIndex(
      (line) => /^\s*\|/.test(line) && /\bitem\b/i.test(line) && /\bactive\b/i.test(line)
    );
    if (headerIndex === -1) {
      if (lines.length && lines[lines.length - 1].trim()) lines.push("");
      lines.push("## Registry");
      lines.push("");
      lines.push(...RECURRING_REGISTRY_HELP);
      lines.push("");
      lines.push(core.RECURRING_REGISTRY_HEADER_ROW);
      lines.push(core.RECURRING_REGISTRY_SEPARATOR_ROW);
      lines.push(row);
      lines.push("");
    } else {
      // Older notes have a narrower table — widen the header and every existing
      // row in place so the table stays one consistent width and
      // parseMarkdownTable keeps matching every row. Column counts seen in the
      // wild: 5 (original), 7 (+ Next Amount/Change Date), 8 (+ Next Due), 9
      // (+ Variable), 11 (+ End Date/Payments Left). Variable slots in at
      // position 5 (0-indexed), ahead of the columns added after it, so those
      // need shifting rather than just padding.
      const width = core.RECURRING_REGISTRY_COLUMNS.length;
      if (lines[headerIndex].split("|").length - 2 < width) {
        lines[headerIndex] = core.RECURRING_REGISTRY_HEADER_ROW;
        lines[headerIndex + 1] = core.RECURRING_REGISTRY_SEPARATOR_ROW;
        for (let index = headerIndex + 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
          const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
          if (cells.length === 5 || cells.length === 7 || cells.length === 8) cells.splice(5, 0, "");
          while (cells.length < width) cells.push("");
          lines[index] = `| ${cells.slice(0, width).join(" | ")} |`;
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
    // Every per-bill state change funnels through here — Push a week, Skip
    // cycle, Pause, Edit, auto-log and advanceRecurringSchedule. The sidebar's
    // due-bills card reads this registry but sits outside the block-local
    // rerender(), and the vault modify hook ignores both self-writes and
    // anything outside the daily-notes folder, so without this the card kept
    // showing pre-change state (a pushed bill still reading "overdue since").
    this.refreshDailyBudgetView();
  }

  // The tag a logged payment carries has to name its bill. Log now and auto-log
  // used to write the bare `subscriptions/<cadence>` tag the bill was detected
  // from, so every payment the plugin logged itself kept the identity problem
  // alive: the next parse had only the child line to go on, and a different
  // wording there minted a different bill. Skips were fixed in 0.8.0; logging
  // was not.
  recurringPaymentTag(item) {
    const category = core.normalizeCategoryPath(item.category || "");
    const named = category && item.name && !category.endsWith(`/${item.name}`) ? `${category}/${item.name}` : category;
    return named ? core.buildCategoryTag(named) : item.tag;
  }

  async logRecurringItem(item, date, amountOverride) {
    const amount = Number.isFinite(amountOverride) && amountOverride > 0 ? amountOverride : item.lastAmount;
    const logDate = date || core.todayIsoLocal();
    const bullet = [`\t- ${core.formatCurrency(amount, item.currency || this.settings.defaultCurrency)} ${this.recurringPaymentTag(item)}`];
    if (item.merchant) bullet.push(`\t\t- ${item.merchant}`);
    // No separate runway deduction is written: computeRunwayBalance derives the
    // draw-down from this very bullet, so there is only ever one line per bill.
    return this.appendFinanceLines(logDate, bullet);
  }

  // Shared "Log now" behavior for both the finance-recurring block and the
  // sidebar's due-bills card: logs on the real date it was actually paid, but
  // advances the schedule from the due date just fulfilled (not from today),
  // so a late payment never drifts the cadence. `amountOverride` is used for
  // variable bills, where the caller has already prompted for the real amount
  // rather than repeating the projected/average one.
  async logRecurringNow(item, amountOverride) {
    const logDate = core.todayIsoLocal();
    await this.logRecurringItem(item, logDate, amountOverride);
    await this.advanceRecurringSchedule(item);
    return logDate;
  }

  // Moves a bill on by exactly one cycle after it has been logged: the next-due
  // anchor steps forward, and a Payments Left countdown ticks down (reaching 0
  // retires the bill in applyRecurringRegistry). Shared by Log now, Pay from
  // reserve, Skip cycle, and the catch-up logger, so no path can advance one of
  // the two and forget the other.
  async advanceRecurringSchedule(item, patch = {}) {
    if (item?.billId) {
      // The payment that was just logged is what advances the schedule, so there
      // is no anchor to write. Only a countdown, and an override that has now
      // been overtaken, need saving.
      const updates = {};
      if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
        updates.paymentsLeft = Math.max(0, item.paymentsLeft - 1);
      }
      if (item.usedOverride) updates.nextDueOverride = null;
      const billPatch = { ...updates, ...this.billPatchFromItemPatch(patch) };
      if (Object.keys(billPatch).length) await this.updateBill(item.billId, billPatch);
      return;
    }

    const next = {};
    if (item.nextDue) next.nextDue = core.nextRecurringDate(item.nextDue, item.cadence);
    if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
      next.paymentsLeft = Math.max(0, item.paymentsLeft - 1);
    }
    if (!Object.keys(next).length && !Object.keys(patch).length) return;
    await this.updateRecurringRegistryEntry(item, { ...next, ...patch });
  }

  // Logs every recurring item whose next-due date has arrived, dated on the due
  // day so the cadence anchor never drifts. Loops so an item several periods
  // behind catches all the way up.
  async logDueRecurringPayments(options = {}) {
    // A reference date is only ever passed by tests; the plugin logs up to today.
    const today = core.parseIsoDate(options.referenceDate) || core.todayIsoLocal();
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
        // Keep any Next Due override advancing too — otherwise a stale
        // override would never move forward and the item would look
        // perpetually (re-)due on every future pass/check.
        await this.advanceRecurringSchedule(item);
        logged += 1;
      }
    }
    if (options.notify !== false && (logged > 0 || !options.autoOnly)) {
      new Notice(logged > 0 ? `Finance: logged ${logged} recurring payment${logged === 1 ? "" : "s"}` : "No recurring payments are due.");
    }
    if (logged > 0) this.refreshDailyBudgetView();
    return logged;
  }

  // A month-grid view of when the bills actually land, built the same way as
  // the trip's planned-expenses calendar: dots per day, click a day for the
  // detail. Seeing the cluster is the point — a list sorted by due date hides
  // that three bills all fall on the 10th. Occurrences come from the same
  // projection the runway uses, so a repriced cycle shows its new amount here.
  renderRecurringCalendar(wrapper, recurring, currency, referenceDate, options = {}) {
    const RANGE_CHOICES = [
      { label: "1 month", months: 1 },
      { label: "3 months", months: 3 },
      { label: "12 months", months: 12 },
    ];
    const normalizeMonths = (value) => {
      const months = Number(value);
      if (!Number.isFinite(months)) return null;
      // Snap to the nearest offered range so a hand-typed `months: 2` still
      // lands on something the buttons can show as selected.
      return RANGE_CHOICES.reduce(
        (best, choice) => (Math.abs(choice.months - months) < Math.abs(best - months) ? choice.months : best),
        RANGE_CHOICES[0].months
      );
    };
    // Block config wins, then the setting, then three months.
    let activeMonths =
      normalizeMonths(options.months) ??
      (Number.isFinite(options.weeks) && options.weeks > 0 ? normalizeMonths(Math.round(options.weeks / 4.345)) : null) ??
      normalizeMonths(this.settings?.paymentCalendarMonths) ??
      3;

    const weekStartsOn = this.settings?.weekStartsOn === "sunday" ? "sunday" : "monday";
    const weekdayLabels = weekStartsOn === "sunday"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const thisWeek = core.toPeriodRange({ period: "week", referenceDate, weekStartsOn });
    const start = thisWeek.start;

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const calendarHeader = section.createDiv({ cls: "finance-tracker-header" });
    calendarHeader.createEl("h4", { text: "Payment calendar" });
    const rangeBar = calendarHeader.createDiv({ cls: "finance-tracker-calendar-filter-bar" });

    const headers = section.createDiv({ cls: "finance-tracker-calendar-weekdays" });
    for (const label of weekdayLabels) {
      headers.createDiv({ cls: "finance-tracker-calendar-weekday", text: label });
    }

    const body = section.createDiv({ cls: "finance-tracker-calendar-body" });
    const monthLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    const dayLabel = (iso) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", weekday: "long" });

    let selectedDay = "";
    let cellRefs = new Map();
    // Each entry is { host, from, to }: the detail panel that owns a given span
    // of days. The week view has one per week, the year view a single one.
    let detailHosts = [];
    let seenMonth = "";
    let byDay = new Map();

    const renderDetail = (host, day) => {
      host.empty();
      const items = byDay.get(day) || [];
      if (!items.length) return;
      const panel = host.createDiv({ cls: "finance-tracker-calendar-inline-details" });
      const dayTotal = items.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
      const heading = panel.createDiv({ cls: "finance-tracker-calendar-inline-date" });
      heading.setText(`${dayLabel(day)} · ${core.formatCurrency(core.roundCurrencyAmount(dayTotal), currency)}`);
      for (const occurrence of items) {
        const row = panel.createDiv({ cls: "finance-tracker-calendar-inline-item" });
        const summary = row.createDiv({ cls: "finance-tracker-calendar-inline-summary" });
        summary.createSpan({ text: occurrence.label });
        const meta = [cadenceLabel(occurrence.cadence)];
        if (occurrence.isNewPrice) meta.push("new price");
        summary.createSpan({
          cls: "finance-tracker-budget-meta",
          text: `${core.formatCurrency(occurrence.amount, currency)} · ${meta.join(" · ")}`,
        });
      }
    };

    const refresh = () => {
      for (const [day, cell] of cellRefs.entries()) {
        cell.toggleClass("is-selected", day === selectedDay);
      }
      for (const { host, from, to } of detailHosts) {
        if (selectedDay && selectedDay >= from && selectedDay <= to) {
          renderDetail(host, selectedDay);
        } else {
          host.empty();
        }
      }
    };

    // A year of week grids would be 52 stacked rows — technically the same
    // information, useless to actually read. At twelve months the calendar
    // switches to a month-per-row heat grid instead: one line per month, one
    // cell per day-of-month, shaded by what falls due. Bills recur on the same
    // day each month, so the vertical stripes *are* the pattern — the 9th and
    // the 14th being heavy every month is visible in one glance.
    const drawYearGrid = (start, end) => {
      const monthCount = 12;
      const dayTotals = new Map();
      let heaviest = 0;
      for (const [day, items] of byDay.entries()) {
        const total = core.roundCurrencyAmount(items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
        dayTotals.set(day, total);
        if (total > heaviest) heaviest = total;
      }

      const grid = body.createDiv({ cls: "finance-tracker-year-grid" });
      grid.createDiv({ cls: "finance-tracker-year-head" });
      for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
        grid.createDiv({
          cls: "finance-tracker-year-head",
          // Labelling all 31 columns is unreadable at this size.
          text: dayOfMonth === 1 || dayOfMonth % 5 === 0 ? String(dayOfMonth) : "",
        });
      }
      grid.createDiv({ cls: "finance-tracker-year-head is-total", text: "Total" });

      const firstOfStartMonth = `${start.slice(0, 7)}-01`;
      for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
        const monthStart = core.addMonths(firstOfStartMonth, monthIndex);
        const monthKey = monthStart.slice(0, 7);
        const daysInMonth = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
        grid.createDiv({
          cls: "finance-tracker-year-month",
          text: new Date(`${monthStart}T12:00:00`).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
        });

        let monthTotal = 0;
        for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
          if (dayOfMonth > daysInMonth) {
            grid.createDiv({ cls: "finance-tracker-year-cell is-void" });
            continue;
          }
          const day = `${monthKey}-${String(dayOfMonth).padStart(2, "0")}`;
          const items = byDay.get(day) || [];
          const total = dayTotals.get(day) || 0;
          monthTotal += total;

          const cell = grid.createEl("button", { cls: "finance-tracker-year-cell", attr: { type: "button" } });
          if (day < start || day > end) cell.addClass("is-outside");
          if (day === referenceDate) cell.addClass("is-today");
          if (items.length) {
            cellRefs.set(day, cell);
            // Four bands rather than a continuous ramp: enough to read the
            // shape, few enough that neighbouring days stay distinguishable.
            const level = heaviest > 0 ? Math.max(1, Math.ceil((total / heaviest) * 4)) : 1;
            cell.addClass(`is-level-${level}`);
            if (items.some((item) => item.isNewPrice)) cell.addClass("is-repriced");
            if (day < referenceDate) cell.addClass("is-overdue");
            cell.setAttr(
              "title",
              `${dayLabel(day)} · ${core.formatCurrency(total, currency)} · ${items.length} bill${items.length === 1 ? "" : "s"}`
            );
            cell.addEventListener("click", () => {
              selectedDay = selectedDay === day ? "" : day;
              refresh();
            });
          } else {
            cell.addClass("is-quiet");
          }
        }

        grid.createDiv({
          cls: "finance-tracker-year-total",
          text: monthTotal > 0 ? core.formatCurrency(core.roundCurrencyAmount(monthTotal), currency) : "—",
        });
      }

      const legend = body.createDiv({ cls: "finance-tracker-year-legend" });
      legend.createSpan({ text: "Lighter to darker: smaller to larger day totals." });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-1" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-2" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-3" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-level-4" });
      legend.createSpan({ cls: "finance-tracker-year-swatch is-repriced" });
      legend.createSpan({ text: "repriced" });

      detailHosts.push({ from: start, host: body.createDiv({ cls: "finance-tracker-calendar-inline-host" }), to: end });
    };

    const drawCalendar = () => {
      body.empty();
      cellRefs = new Map();
      detailHosts = [];
      seenMonth = "";
      selectedDay = "";

      // Walk whole weeks so the grid always starts on the week's first column,
      // covering at least the requested months.
      const end = core.addMonths(start, activeMonths);
      const weeksAhead = Math.ceil(core.daysBetweenInclusive(start, end) / 7);
      const { occurrences } = core.sumRecurringDueWithin(recurring, start, end);

      byDay = new Map();
      for (const occurrence of occurrences) {
        const list = byDay.get(occurrence.date) || [];
        list.push(occurrence);
        byDay.set(occurrence.date, list);
      }

      if (!byDay.size) {
        body.createDiv({
          cls: "finance-tracker-empty",
          text: `No bills fall due in the next ${activeMonths === 1 ? "month" : `${activeMonths} months`}.`,
        });
        return;
      }

      const total = occurrences.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
      body.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${occurrences.length} payment${occurrences.length === 1 ? "" : "s"} · ${core.formatCurrency(core.roundCurrencyAmount(total), currency)} total`,
      });

      if (activeMonths >= 12) {
        drawYearGrid(start, end);
        return;
      }

      for (let weekIndex = 0; weekIndex < weeksAhead; weekIndex += 1) {
        const weekStart = core.addDays(start, weekIndex * 7);
        const days = Array.from({ length: 7 }, (_unused, offset) => core.addDays(weekStart, offset));
        // Only draw weeks that actually carry a bill — an empty fortnight in the
        // middle of the horizon is noise, not information.
        if (!days.some((day) => byDay.has(day))) continue;

        const month = monthLabel(days.find((day) => byDay.has(day)) || weekStart);
        if (month !== seenMonth) {
          body.createDiv({ cls: "finance-tracker-calendar-month-caption", text: month });
          seenMonth = month;
        }

        const weekBlock = body.createDiv({ cls: "finance-tracker-calendar-week-block" });
        const grid = weekBlock.createDiv({ cls: "finance-tracker-calendar-grid month-grid" });
        for (const day of days) {
          const items = byDay.get(day) || [];
          const cell = grid.createEl("button", { cls: "finance-tracker-calendar-day", attr: { type: "button" } });
          cellRefs.set(day, cell);
          if (!items.length) cell.addClass("is-empty");
          if (day === referenceDate) cell.addClass("is-today");

          const dots = cell.createDiv({ cls: "finance-tracker-calendar-dots" });
          for (const occurrence of items.slice(0, 4)) {
            const tone = day < referenceDate ? "is-bill-overdue" : occurrence.isNewPrice ? "is-bill-change" : "is-bill";
            dots.createDiv({ cls: `finance-tracker-calendar-dot ${tone}`, attr: { title: occurrence.label } });
          }
          if (items.length > 4) dots.createSpan({ cls: "finance-tracker-calendar-dot-more", text: `+${items.length - 4}` });

          const dateText = cell.createSpan({ cls: "finance-tracker-calendar-date", text: day });
          dateText.setAttr("data-short-date", day.slice(-2));
          if (items.length) {
            const dayTotal = items.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0);
            cell.createSpan({
              cls: "finance-tracker-calendar-day-total",
              text: core.formatCurrency(core.roundCurrencyAmount(dayTotal), currency),
            });
          }

          cell.addEventListener("click", () => {
            if (!items.length) return;
            selectedDay = selectedDay === day ? "" : day;
            refresh();
          });
        }
        detailHosts.push({
          from: weekStart,
          host: weekBlock.createDiv({ cls: "finance-tracker-calendar-inline-host" }),
          to: core.addDays(weekStart, 6),
        });
      }
    };

    const rangeButtons = new Map();
    for (const choice of RANGE_CHOICES) {
      const button = rangeBar.createEl("button", { cls: "finance-tracker-calendar-filter-button", text: choice.label });
      rangeButtons.set(choice.months, button);
      button.addEventListener("click", () => {
        activeMonths = choice.months;
        for (const [months, other] of rangeButtons.entries()) other.toggleClass("is-active", months === activeMonths);
        drawCalendar();
      });
    }
    for (const [months, button] of rangeButtons.entries()) button.toggleClass("is-active", months === activeMonths);

    drawCalendar();
  }

  async renderRecurringBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const prefix = core.normalizeCategoryPath(config.prefix || this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    const recurring = await this.detectRecurring(referenceDate, prefix);

    // Bill notes get the new list. The old one stays for vaults that have not
    // converted, so nothing changes for anyone until they choose it.
    if (recurring.billsMode) {
      await this.renderBillsBlock(source, el, ctx, recurring);
      return;
    }

    const manage = /^(?:true|yes|1)$/i.test(String(config.manage || ""));
    const entries = await this.collectAllTransactions();
    const runway = await this.computeRunwayState(referenceDate, { recurring, entries });
    // "Due next 30 days" is the same forward walk the runway target uses, just
    // over a fixed horizon, so it comes from the same helper.
    const dueNext30Days = core.fromCents(
      core.sumRecurringDueWithin(recurring, referenceDate, core.addDays(referenceDate, 30)).totalCents
    );

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Recurring payments" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Log all due", async () => {
      await this.logDueRecurringPayments({ notify: true });
      await this.renderRecurringBlock(source, el, ctx);
    }, { primary: true, errorPrefix: "Logging due payments" });

    if (!recurring.items.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `No recurring payments found yet. Tag one like #log/spending/${prefix}/monthly/spotify and it will appear here.`,
      });
      return;
    }

    const activeCount = recurring.items.filter((item) => item.active !== false).length;
    renderStatCards(wrapper, [
      { label: "Per month", value: core.formatCurrency(recurring.totals.monthly, currency) },
      { label: "Per year", value: core.formatCurrency(recurring.totals.yearly, currency) },
      { label: "Due next 30 days", value: core.formatCurrency(dueNext30Days, currency) },
      { label: "Tracked bills", value: String(activeCount) },
    ]);

    const rerender = () => this.renderRecurringBlock(source, el, ctx);

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Upcoming bills" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list is-recurring-grid" });
    for (const item of recurring.items) {
      // Paused and finished bills live only in the Archived section below.
      if (item.active === false) continue;
      const row = list.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row" });
      if (item.status === "overdue") row.addClass("is-overdue");
      // The headline is what the next payment will cost, which is not the same
      // as today's price once a scheduled change lands before the next due date.
      renderRowTitle(row, item.label, core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency));

      const statusText =
        item.status === "overdue"
          ? `overdue since ${item.nextDue}`
          : item.status === "due"
            ? "due today"
            : `due ${item.nextDue}`;
      const metaBits = [cadenceLabel(item.cadence), statusText, `${core.formatCurrency(item.monthlyCost, currency)}/month`];
      if (item.variable) metaBits.push("variable");
      if (item.nextAmount > 0 && item.changeDate) {
        // Say how many cycles are left at the old price rather than just naming
        // the change date — a change dated before the next due date reprices
        // every remaining payment, which "changing on 15 Aug" alone hides.
        const schedule = core.buildRecurringSchedule(item, { count: 12, referenceDate });
        const oldPrice = core.formatCurrency(item.lastAmount, currency);
        const newPrice = core.formatCurrency(item.nextAmount, currency);
        metaBits.push(
          schedule.beforeChange.count
            ? `${oldPrice} for ${schedule.beforeChange.count} more, then ${newPrice} from ${schedule.changeOccurrence || item.changeDate}`
            : `${newPrice} from ${item.changeDate} (was ${oldPrice})`
        );
      }
      if (item.endDate) metaBits.push(`ends ${item.endDate}`);
      if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) {
        metaBits.push(`${item.paymentsLeft} payment${item.paymentsLeft === 1 ? "" : "s"} left`);
      }
      row.createDiv({ cls: "finance-tracker-budget-meta", text: metaBits.join(" \u00b7 ") });

      const isDue = item.status === "overdue" || item.status === "due";
      if (isDue || manage) {
        // One primary action per row — the thing you came here to do — with
        // everything else quiet beside it.
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        addAction(actions, "Log now", async () => {
          if (item.variable) {
            new LogVariableBillModal(this.app, this, item, rerender).open();
            return;
          }
          const logDate = await this.logRecurringNow(item);
          new Notice(`Logged ${item.label} for ${logDate}`);
          await rerender();
        }, { primary: isDue, errorPrefix: `Logging ${item.label}`, opensModal: item.variable });

        if (item.nextDue) {
          // Moves only this occurrence; the cadence itself is untouched.
          addAction(actions, "Push a week", async () => {
            const nextDue = core.addDays(item.nextDue, 7);
            await this.updateRecurringItem(item, { nextDue });
            new Notice(`${item.label} now due ${nextDue}`);
            await rerender();
          }, { errorPrefix: `Rescheduling ${item.label}`, tooltip: "Push just this occurrence back a week, keeping the cadence" });
        }

        if (manage && item.nextDue) {
          addAction(actions, "Skip cycle", async () => {
            const nextDue = core.nextRecurringDate(item.nextDue, item.cadence);
            await this.logRecurringSkip(item);
            await this.advanceRecurringSchedule(item);
            new Notice(`Skipped ${item.label} — next due moves to ${nextDue}`);
            await rerender();
          }, { errorPrefix: `Skipping ${item.label}`, tooltip: "Log a $0 entry and move on to the next cycle" });
        }
      }

      if (manage) {
        const stateActions = row.createDiv({ cls: "finance-tracker-header-actions is-secondary" });
        addAction(stateActions, "Edit", () => {
          new EditRecurringItemModal(this.app, this, item, rerender).open();
        }, { opensModal: true });
        addAction(stateActions, "Pause", async () => {
          await this.updateRecurringItem(item, { active: false });
          await rerender();
        }, { errorPrefix: `Pausing ${item.label}` });
        addToggleAction(stateActions, "Auto-log", item.autoLog !== false, async (checked) => {
          await this.updateRecurringItem(item, { autoLog: checked });
        });
      }
    }

    this.renderRecurringCalendar(wrapper, recurring, currency, referenceDate, {
      months: core.parseNumber(config.months),
      weeks: core.parseNumber(config.weeks),
    });

    // Archived bills: paused by hand, or retired by their own End Date /
    // Payments Left. Collapsed by default, still reachable to resume or drop.
    const archivedItems = recurring.items.filter((item) => item.active === false);
    if (archivedItems.length) {
      const archiveDetails = wrapper.createEl("details", { cls: "finance-tracker-chart-card finance-tracker-archived" });
      archiveDetails.createEl("summary", { text: `Archived (${archivedItems.length})` });
      const archiveList = archiveDetails.createDiv({ cls: "finance-tracker-budget-list is-recurring-grid" });
      for (const item of archivedItems) {
        const row = archiveList.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row is-paused" });
        renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, currency));
        const reason =
          item.finishedReason === "end-date"
            ? `ended ${item.endDate}`
            : item.finishedReason === "payments"
              ? "all payments made"
              : "paused";
        row.createDiv({ cls: "finance-tracker-budget-meta", text: `${cadenceLabel(item.cadence)} \u00b7 ${reason}` });
        const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
        // A finished bill needs its terms cleared before it can run again, so
        // Resume is only the obvious next step for one that was merely paused.
        addAction(actions, item.finished ? "Restart" : "Resume", async () => {
          await this.updateRecurringItem(item, {
            active: true,
            ...(item.finished ? { endDate: null, paymentsLeft: null } : {}),
          });
          await rerender();
        }, { primary: !item.finished, errorPrefix: `Resuming ${item.label}` });
        addAction(actions, "Remove completely", async () => {
          await this.removeRecurringItemCompletely(item);
          new Notice(`Removed ${item.label} — it won't be tracked as a recurring payment again.`);
          await rerender();
        }, { warning: true, errorPrefix: `Removing ${item.label}` });
      }
    }

    this.renderRunwaySection(wrapper, runway, currency);
  }


  async renderRunwayBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const runway = await this.computeRunwayState(referenceDate, { account: config.account });

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Runway" });
    addAction(
      header.createDiv({ cls: "finance-tracker-header-actions" }),
      "Bills",
      () => this.openRecurringNote(),
      { errorPrefix: "Opening recurring payments note" }
    );
    this.renderRunwaySection(wrapper, runway, currency, { standalone: true });
  }

  // Runway: how much you need available to be safe for the chosen period.
  //
  // Read-only by design. There is no balance to fund and no bookkeeping — it
  // reads the bills you have already logged and tells you what the next window
  // costs, so you know how much to leave in the account it comes out of.
  renderRunwaySection(wrapper, runway, currency, options = {}) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    if (!options.standalone) {
      section.createEl("h4", { text: "Runway" });
    }

    if (!runway || runway.target <= 0) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `Nothing due between today and ${runway?.windowEnd || "the end of the window"}. Runway shows what your next ${
          runway?.period || this.settings.runwayPeriod
        } of outgoings costs once you have bills logged.`,
      });
      return;
    }

    const covers = runway.mode === "bills" ? "recurring bills only" : "bills due plus your usual spending";

    const headline = section.createDiv({ cls: "finance-tracker-forecast-headline" });
    headline.setText(`Keep ${core.formatCurrency(runway.target, currency)} available for the next ${runway.period}`);
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      // Sentence-case, not title-case: titleCaseSegment turned this fragment
      // into "Recurring Bills Only, between today and …".
      text: `${covers.charAt(0).toUpperCase()}${covers.slice(1)}, between today and ${runway.windowEnd}. Change the period or what counts in Settings → Runway.`,
    });

    this.renderRunwayBalance(section, runway, currency);

    renderStatCards(section, [
      {
        label: `Next ${runway.period}`,
        value: core.formatCurrency(runway.target, currency),
        hint:
          runway.mode === "spending" && runway.discretionary > 0
            ? `${core.formatCurrency(runway.bills, currency)} bills + ${core.formatCurrency(runway.discretionary, currency)} spending`
            : `${runway.occurrences.length} bill${runway.occurrences.length === 1 ? "" : "s"} due`,
      },
      { label: "Per week", value: core.formatCurrency(runway.perWeek, currency) },
      { label: "Per day", value: core.formatCurrency(runway.perDay, currency) },
      {
        label: "Bills due",
        value: String(runway.occurrences.length),
        hint: runway.occurrences.length ? `next on ${runway.occurrences[0].date}` : "",
      },
    ]);

    if (runway.occurrences.length) {
      section.createEl("h5", { text: `What makes up the ${runway.period}` });
      const list = section.createDiv({ cls: "ft-budget-rows" });
      for (const occurrence of runway.occurrences.slice(0, 12)) {
        const line = list.createDiv({ cls: "ft-budget-row" });
        const top = line.createDiv({ cls: "ft-budget-row-top" });
        top.createSpan({ cls: "ft-budget-row-name", text: `${occurrence.label} · ${occurrence.date}` });
        top.createSpan({ cls: "ft-budget-row-value", text: formatCurrencyShort(occurrence.amount, currency) });
      }
      if (runway.occurrences.length > 12) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `+ ${runway.occurrences.length - 12} more bills in the window.`,
        });
      }
      if (runway.mode === "spending" && runway.discretionary > 0) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `Plus ${core.formatCurrency(runway.discretionary, currency)} of usual spending, from your average over the last 90 days.`,
        });
      }
    }
  }

  // Whether the money is actually there. Runway on its own is a number to keep
  // available; next to a balance it's an answer.
  renderRunwayBalance(section, runway, currency) {
    const compare = runway.balance;
    const box = section.createDiv({ cls: "finance-runway-balance" });
    if (!compare) {
      box.addClass("is-empty");
      box.setText(
        runway.accountKey
          ? `No balance snapshot for ${runway.accountLabel} yet. Run Snapshot balances to see whether you're covered.`
          : runway.knownAccounts?.length
            ? "Choose the account this comes out of in Settings → Runway (or add account: to this block) to see whether you're covered."
            : "Run Snapshot balances, then choose that account in Settings → Runway, to see whether you're covered."
      );
      return;
    }
    const covered = compare.status === "covered";
    box.addClass(covered ? "is-covered" : "is-short");
    box.createDiv({
      cls: "finance-runway-balance-headline",
      text: covered
        ? `Covered, with ${core.formatCurrency(compare.difference, currency)} to spare`
        : `Short by ${core.formatCurrency(Math.abs(compare.difference), currency)}`,
    });
    const lasts = covered
      ? `enough for about ${compare.daysCovered} days of outgoings`
      : compare.runsOutOn
        ? `which runs out around ${compare.runsOutOn}`
        : `about ${compare.daysCovered} days of outgoings`;
    box.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${runway.accountLabel} had ${core.formatCurrency(compare.balance, currency)} on ${compare.asOf}, ${lasts}.`,
    });
    if (compare.stale) {
      box.createDiv({
        cls: "finance-tracker-budget-meta is-warning",
        text: `That snapshot is ${compare.ageDays} days old. Run Snapshot balances for a current answer.`,
      });
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
        text: "No split expenses yet. Quick-add with split=2 or owed=Sam:$8, or add a child line like “owes: Sam $8 #log/owed/sam” under any expense.",
      });
      return;
    }

    const owedCount = splits.people.filter((person) => person.outstanding > 0).length;
    renderStatCards(wrapper, [
      {
        label: "Outstanding",
        value: core.formatCurrency(splits.totalOutstanding, currency),
        hint: owedCount ? `across ${owedCount} ${owedCount === 1 ? "person" : "people"}` : "everyone settled up",
      },
    ]);

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Balances by person" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const personRow of splits.people) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, personRow.displayName, core.formatCurrency(personRow.outstanding, currency));
      const openEntries = personRow.entries.filter((item) => !item.settled);
      for (const item of openEntries.slice(0, 8)) {
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${item.date || ""} · ${core.formatCurrency(item.amount, currency)} · ${item.merchant || "Split expense"}`,
        });
      }
      if (personRow.outstanding > 0) {
        addAction(
          row.createDiv({ cls: "finance-tracker-header-actions" }),
          "Settle up",
          async () => {
            await this.settleUpWithPerson(personRow.person, personRow.displayName, personRow.outstanding);
            await this.renderSplitsBlock(source, el, ctx);
          },
          { primary: true, errorPrefix: "Settle up" }
        );
      } else {
        row.createDiv({ cls: "finance-tracker-budget-meta", text: "All settled ✅" });
      }
    }
  }

  // --- Net worth ------------------------------------------------------------------

  // Net worth as what it is: money in accounts plus the portfolio. Cash comes from
  // balance snapshots, shares from the portfolio at the prices already held. This
  // block never fetches a price, so a dashboard note never reaches the network —
  // only the portfolio block itself does, and only when a source is chosen.
  async renderNetWorthBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const referenceDate = core.todayIsoLocal();
    const entries = await this.collectAllTransactions();
    const summary = core.summarizeBalanceSnapshots(entries);
    const portfolio = await this.buildPortfolioModel(referenceDate);
    const hasPortfolio = portfolio.portfolio.trades.length > 0;
    const shares = hasPortfolio ? portfolio.value.totals.valueAud : 0;
    const rerender = () => this.renderNetWorthBlock(source, el, ctx);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Accounts & portfolio" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Snapshot balances", () => new BalanceSnapshotModal(this.app, this, { onSaved: rerender }).open(), {
      primary: true,
      opensModal: true,
    });
    addAction(headerActions, hasPortfolio ? "Portfolio" : "Log a trade", () => (hasPortfolio ? this.openPortfolioNote() : this.openLogTrade({ onSaved: rerender })), {
      opensModal: !hasPortfolio,
      errorPrefix: "Opening the portfolio",
    });

    if (!summary.accounts.length && !hasPortfolio) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "Nothing to add up yet. Snapshot your account balances — a bullet like “- $5,230.00 #log/balance/anz-plus” in today's note — or log a trade.",
      });
      return;
    }

    const cash = summary.latestTotal || 0;
    const cards = [{ label: "Net worth", value: core.formatCurrency(cash + shares, currency) }];
    cards.push({
      label: "Accounts",
      value: summary.accounts.length ? core.formatCurrency(cash, currency) : "No snapshots",
      hint: summary.accounts.length ? `${summary.accounts.length} account${summary.accounts.length === 1 ? "" : "s"}` : "",
    });
    if (hasPortfolio) {
      cards.push({
        label: "Portfolio",
        value: core.formatCurrency(shares, currency),
        hint: portfolio.value.missing.length ? `${portfolio.value.missing.length} unpriced` : "",
      });
    }
    if (Number.isFinite(summary.previousTotal)) {
      const delta = core.roundCurrencyAmount(summary.latestTotal - summary.previousTotal);
      cards.push({
        label: "Accounts since last snapshot",
        value: `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${core.formatCurrency(Math.abs(delta), currency)}`,
        cls: delta > 0 ? "is-down" : delta < 0 ? "is-up" : "",
      });
    }
    renderStatCards(wrapper, cards);

    this.renderLineChartCard(wrapper, "Net worth over time", core.mergeNetWorthSeries(summary.series, portfolio.series), {
      emptyText: hasPortfolio && !summary.accounts.length
        ? "The line starts once there is a balance snapshot, or price history for the portfolio."
        : "Take a second snapshot to draw the trend line.",
    });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    section.createEl("h4", { text: "Where it is" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list" });
    for (const account of summary.accounts) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, account.label, core.formatCurrency(account.latest?.amount || 0, currency));
      row.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `As of ${account.latest?.date || "?"} · ${account.history.length} snapshot${account.history.length === 1 ? "" : "s"}`,
      });
    }
    if (!summary.accounts.length) {
      list.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "No account balances yet, so net worth is the portfolio alone. Snapshot balances to add your cash.",
      });
    }
    if (hasPortfolio) {
      const row = list.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
      renderRowTitle(row, "Portfolio", core.formatCurrency(shares, currency));
      row.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${portfolio.value.rows.length} holding${portfolio.value.rows.length === 1 ? "" : "s"} · ${this.describePriceSource(portfolio)}`,
      });
      row.addEventListener("click", () => this.openPortfolioNote());
    }
  }

  // --- Forecast ---------------------------------------------------------------------

  async renderForecastBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const entries = await this.collectAllTransactions();
    // detectRecurring, not the raw detector: the registry's pauses, end dates and
    // removals have to apply here too. Without them the forecast counted every
    // bill ever detected — in the author's vault $1,134.90 a month against $316.82
    // of live bills, most of it duplicates and cancelled subscriptions.
    const recurring = await this.detectRecurring(referenceDate);

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
    renderStatCards(wrapper, cardData);

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

    // A projection from nothing is not a projection. Say which half is missing
    // rather than drawing a confident line down from zero.
    const missing = [];
    if (!(inputs.monthlyIncome > 0) && !Number.isFinite(core.parseNumber(config.income))) {
      missing.push(`no income logged in the last ${inputs.windowDays} days — add “income:” to this block, or log income as #log/income/salary`);
    }
    if (!(balances.latestTotal > 0) && !Number.isFinite(core.parseNumber(config.start))) {
      missing.push("no balance snapshots, so the line starts at zero — run Snapshot balances, or add `start:`");
    }
    if (missing.length) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: `This forecast is incomplete: ${missing.join("; ")}.` });
    }
  }

  // --- Frozen period reviews ---------------------------------------------------------

  // The finished markdown for the review commands and the Insert a finance block
  // list — a snapshot as of now, for the period containing `referenceDate`, not
  // a live block.
  async buildPeriodReview(period, referenceDate = core.todayIsoLocal()) {
    const entries = await this.collectAllTransactions();
    const goalKeys = (await this.collectSavingsGoalDefinitions()).map((goal) => goal.goalKey).filter(Boolean);
    const recurringPrefix = core.normalizeCategoryPath(this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    let billLabels = new Map();
    if (period === "week" || period === "month") {
      const recurring = await this.detectRecurring(core.todayIsoLocal(), recurringPrefix);
      billLabels = new Map(recurring.items.map((item) => [core.normalizeCategoryPath(item.category || ""), item.label]));
    }
    return core.buildPeriodReviewLines(entries, {
      period,
      referenceDate: core.parseIsoDate(referenceDate) || core.todayIsoLocal(),
      currency: this.settings.defaultCurrency,
      goalKeys,
      weekStartsOn: this.settings.weekStartsOn,
      recurringPrefix,
      billLabels,
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
    addAction(headerActions, "Contribute", () => this.openContribute({ onDone: () => this.renderGoalsBlock(source, el, ctx) }), {
      primary: true,
      opensModal: true,
    });

    const goals = (await this.collectSavingsGoalDefinitions()).filter(
      (goal) => !activeOnly || goal.activeSavingsGoal
    );
    if (!goals.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: "No goal notes yet. Create one with the Create savings goal command, or a trip via Select or create trip.",
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
      renderStatCards(wrapper, cardData);
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
      const goalCurrency = goal.currency || currency;
      renderRowTitle(
        card,
        goal.goalName,
        summary.targetAmount > 0
          ? `${core.formatCurrency(summary.currentSaved, goalCurrency)} / ${core.formatCurrency(summary.targetAmount, goalCurrency)}`
          : core.formatCurrency(summary.currentSaved, goalCurrency)
      );
      const bits = [];
      if (goal.goalType === "holiday") bits.push("trip");
      if (!goal.activeSavingsGoal) bits.push("inactive");
      if (summary.sinkingFund && summary.sinkingFund.requiredPerWeek > 0) {
        bits.push(`${core.formatCurrency(summary.sinkingFund.requiredPerWeek, goal.currency || currency)}/week needed`);
      }
      if (goal.dueDate) bits.push(`due ${goal.dueDate}`);
      if (summary.sinkingFund) {
        const paceLabels = {
          ahead: "ahead of pace",
          behind: "behind pace",
          complete: "target reached",
          overdue: "past due",
          "on-track": "on track",
          saving: "saving",
          "not-started": "nothing saved yet",
        };
        bits.push(paceLabels[summary.sinkingFund.status] || summary.sinkingFund.status);
      }
      if (bits.length) card.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });
      const goalTotal = summary.targetAmount > 0 ? summary.targetAmount : summary.currentSaved;
      const bar = card.createDiv({ cls: "finance-tracker-budget-bar" });
      const fill = bar.createDiv({ cls: "finance-tracker-budget-fill is-good" });
      fill.style.width = `${goalTotal > 0 ? Math.min((summary.currentSaved / goalTotal) * 100, 100) : 0}%`;
      addAction(
        card.createDiv({ cls: "finance-tracker-header-actions" }),
        "Contribute",
        () => this.openContribute({ goalKey: goal.goalKey, onDone: () => this.renderGoalsBlock(source, el, ctx) }),
        { primary: true, opensModal: true }
      );
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
    // The hub's Reviews tab steps through periods with no note behind them, so
    // it hands the date over directly.
    const referenceDate = core.parseIsoDate(ctx?.referenceDate) || this.getReferenceDateForSource(ctx?.sourcePath);
    const weekStartsOn = this.settings.weekStartsOn;
    const range = core.toPeriodRange({
      period: config.period || "week",
      referenceDate,
      start: config.start,
      end: config.end,
      weekStartsOn,
    });
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const groupBy = String(config.groupby || this.settings.dashboardDefaultGroupBy || "primary").toLowerCase();
    const { sections, unknown } = core.resolveDashboardSections(config, range.period);
    const on = new Set(sections);

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", {
      text: config.title || `Finance dashboard: ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}`,
    });

    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Export CSV", async () => {
      const entries = await this.collectTransactionsForRange(range);
      await this.exportEntriesToCsv(entries, `finance-${range.start}-${range.end}`);
    }, { errorPrefix: "Export" });

    addAction(headerActions, "Budgets", () => this.openDefaultBudgetNote(), { errorPrefix: "Opening budgets note" });

    const allEntries = await this.collectTransactionsForRange(range);
    const filterReal = (list) => list.filter((entry) => core.isSpendingEntry(entry));
    const entries = filterReal(allEntries);

    // The previous period: last month for a month, last week for a week, the
    // same number of days before for a custom range.
    const spanDays = core.daysBetweenInclusive(range.start, range.end);
    const previousRange = core.previousPeriodRange(range, { weekStartsOn });
    const prevEntries = filterReal(await this.collectTransactionsForRange(previousRange));
    const previousTotal = core.roundCurrencyAmount(prevEntries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0));

    // Sections render in the order resolveDashboardSections gives, which is
    // the order a `show:` line names them.
    const budgets = on.has("trend") || on.has("budgets") ? await this.loadBudgets("default") : [];
    // Budget pace is judged at today's date while the period is running, and at
    // its last day once it's over — not at the note's date, which for a weekly
    // note is its Monday.
    const today = core.todayIsoLocal();
    const paceDate = today < range.start ? range.start : today > range.end ? range.end : today;
    for (const section of sections) {
      if (section === "summary") this.renderSummary(wrapper, entries, currency, range, { previousTotal });
      if (section === "income") {
        const goalKeys = (await this.collectSavingsGoalDefinitions()).map((goal) => goal.goalKey).filter(Boolean);
        this.renderIncomeSection(wrapper, allEntries, currency, range, goalKeys);
      }
      if (section === "uncategorised") this.renderUncategorisedCallout(wrapper, entries, currency, range);
      if (section === "categories") {
        // Honour the Default grouping setting. This was hardcoded to "full", so a
        // vault set to "Primary category" still got subcategory rings it had
        // asked not to see.
        const hierarchy = core.buildHierarchicalCategoryGroups(entries, groupBy);
        this.renderPieChart(wrapper, hierarchy, currency, Number(this.settings.dashboardSliceLabelThreshold || 0.08));
      }
      if (section === "trend") {
        const allBudget = budgets.find((budget) => budget.category === "all");
        let perDayBudget = 0;
        if (allBudget) {
          const scaled = core.scaleBudgetLimit(Number(allBudget.limit || 0), allBudget.period, range, referenceDate || range.start, weekStartsOn);
          perDayBudget = spanDays > 0 ? core.roundCurrencyAmount(scaled / spanDays) : 0;
        }
        this.renderSpendTrend(wrapper, entries, range, currency, { perDayBudget });
      }
      if (section === "changes") this.renderCategoryChanges(wrapper, entries, prevEntries, currency, range);
      if (section === "merchants") this.renderTopMerchants(wrapper, entries, currency);
      if (section === "largest") this.renderLargestTransactions(wrapper, entries, currency);
      if (section === "budgets") {
        const budgetProgress = this.buildBudgetProgress(entries, budgets, range, groupBy, paceDate);
        this.renderBudgets(wrapper, budgetProgress, currency);
      }
      if (section === "bills") await this.renderBillsForPeriod(wrapper, allEntries, currency, range);
      if (section === "trips") this.renderTripSpendSection(wrapper, allEntries, currency);
      if (section === "savings") await this.renderSavingsActivity(wrapper, allEntries, currency, range, referenceDate);
      if (section === "portfolio") await this.renderPortfolioChange(wrapper, allEntries, currency, range);
    }

    if (unknown.length) {
      wrapper.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `Unknown section name${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Sections: ${core.DASHBOARD_SECTIONS.join(", ")}.`,
      });
    }
  }
}

// --- Goals and trips ------------------------------------------------------------------
// Prompts for the moments a goal or trip needs a decision, and the small flows
// they lead into. The decisions themselves (archive, trip mode, contribute)
// are the existing ones; this only makes them turn up when they're due.

Object.assign(FinanceTrackerPlugin.prototype, {
  async collectGoalPrompts(referenceDate = core.todayIsoLocal()) {
    const goals = await this.collectSavingsGoalDefinitions();
    const tripPath = this.settings.tripModeActive ? normalizePath(this.settings.activeTripGoalPath || "") : "";
    const inputs = [];
    for (const goal of goals) {
      if (goal.isLegacyRunwayNote) continue;
      let summary = null;
      if (goal.goalType !== "holiday") summary = await this.buildSavingsGoalSummary(goal, referenceDate);
      inputs.push({
        ...goal,
        currentSaved: summary ? summary.currentSaved : 0,
        targetAmount: summary ? summary.targetAmount : goal.targetAmount,
        tripModeOn: Boolean(tripPath && goal.file?.path === tripPath),
      });
    }
    return core.buildGoalPrompts(inputs, {
      referenceDate,
      currency: this.settings.defaultCurrency,
      dismissed: this.settings.dismissedPrompts || [],
      snoozed: this.settings.promptSnoozes || {},
    });
  },

  // Renders nothing when nothing is waiting. Returns how many prompts it showed.
  async renderGoalPrompts(host, options = {}) {
    const referenceDate = options.referenceDate || core.todayIsoLocal();
    const prompts = await this.collectGoalPrompts(referenceDate);
    if (!prompts.length) return 0;
    const rerender = options.rerender || (async () => this.refreshDailyBudgetView());

    const card = host.createDiv({ cls: "finance-tracker-chart-card finance-prompts" });
    for (const prompt of prompts) {
      const row = card.createDiv({ cls: "finance-prompt" });
      row.addClass(`is-${prompt.kind}`);
      row.createDiv({ cls: "finance-prompt-title", text: prompt.title });
      row.createDiv({ cls: "finance-tracker-budget-meta", text: prompt.detail });
      const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
      for (const action of this.goalPromptActions(prompt, rerender)) {
        addAction(actions, action.label, action.run, {
          primary: action.primary,
          opensModal: action.opensModal,
          errorPrefix: action.label,
        });
      }
      addAction(
        actions,
        "Not now",
        async () => {
          await this.snoozePrompt(prompt.key, referenceDate);
          await rerender();
        },
        { tooltip: "Hide this until tomorrow" }
      );
      addAction(
        actions,
        "Dismiss",
        async () => {
          await this.dismissPrompt(prompt.key);
          await rerender();
        },
        { tooltip: "Don't ask about this again" }
      );
    }
    return prompts.length;
  },

  goalPromptActions(prompt, rerender) {
    const goal = prompt.goal;
    const archive = { label: goal.goalType === "holiday" ? "Archive trip" : "Archive goal", primary: true, opensModal: true, run: () => this.confirmArchiveGoal(goal, rerender) };
    const newDueDate = { label: "New due date", opensModal: true, run: () => this.openGoalDueDate(goal, rerender) };
    switch (prompt.kind) {
      case "trip-start":
        return [{ label: "Start trip mode", primary: true, run: async () => { await this.startTripFor(goal.file); await rerender(); } }];
      case "trip-end":
        return [{ label: "End trip mode", primary: true, run: async () => { await this.endTrip(); await rerender(); } }];
      case "trip-archive":
      case "goal-complete":
        return [archive];
      case "goal-due":
        return [archive, newDueDate];
      case "goal-due-soon":
        return [
          { label: "Contribute", primary: true, opensModal: true, run: () => this.openContribute({ goalKey: goal.goalKey, onDone: rerender }) },
          newDueDate,
        ];
      default:
        return [];
    }
  },

  async snoozePrompt(key, date = core.todayIsoLocal()) {
    // Only today's snoozes matter, so older ones are dropped rather than kept
    // in data.json forever.
    const kept = Object.entries(this.settings.promptSnoozes || {}).filter(([, day]) => day >= date);
    this.settings.promptSnoozes = Object.fromEntries([...kept, [key, date]]);
    await this.saveSettings();
  },

  async dismissPrompt(key) {
    this.settings.dismissedPrompts = Array.from(new Set([...(this.settings.dismissedPrompts || []), key]));
    await this.saveSettings();
  },

  async startTripFor(file) {
    if (!(file instanceof TFile)) return false;
    const meta = await this.readHolidayBudgetFile(file);
    if (!meta?.holidayKey) {
      new Notice("That note has no trip tag. Add trip_tag to its frontmatter first.");
      return false;
    }
    this.settings.activeTripGoalPath = file.path;
    this.settings.tripModeActive = true;
    await this.saveSettings();
    new Notice(`Trip mode on: ${meta.holidayName || meta.holidayKey}`);
    this.refreshDailyBudgetView();
    return true;
  },

  // One request, only when asked. Returns { rate, date } or throws with a
  // message fit for a Notice.
  async fetchExchangeRate(from, to = this.settings.defaultCurrency) {
    const url = core.buildExchangeRateUrl(from, to);
    if (!url) throw new Error("use three-letter currency codes, like JPY");
    if (core.normalizeCurrency(from).replace(/\s+CASH$/, "") === core.normalizeCurrency(to)) return { rate: 1, date: core.todayIsoLocal() };
    let response;
    try {
      response = await this.requestJson(url);
    } catch (error) {
      throw new Error(`couldn't reach the rate service (${error.message || error})`);
    }
    if (response.status === 404 || response.status === 422) {
      throw new Error(`the European Central Bank doesn't publish a rate for ${String(from).toUpperCase()}; type it in instead`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`the rate service answered ${response.status}`);
    const parsed = core.parseExchangeRateResponse(response.json, to);
    if (!parsed) throw new Error("the rate service sent back something unexpected");
    return parsed;
  },

  openNewGoal(onComplete) {
    const modal = new SavingsGoalModal(this.app, this, onComplete);
    modal.open();
    return modal;
  },

  openContribute(options = {}) {
    const modal = new ContributeGoalModal(this.app, this, options);
    modal.open();
    return modal;
  },

  confirmArchiveGoal(goal, onDone) {
    const name = goal.goalName || goal.goalKey;
    const modal = new FinanceConfirmModal(this.app, {
      title: `Archive ${name}?`,
      body: [
        "A summary of what was saved and spent is added to the end of the note, it's marked archived, and it moves to the archive folder.",
        "It leaves the goal lists, capture routing and the forecast. To undo, move it back and delete the archived line; File recovery keeps the version from before.",
      ],
      confirmLabel: "Archive",
      onConfirm: async () => {
        if (!(goal.file instanceof TFile)) throw new Error("the goal note could not be found");
        const path = await this.archiveGoalNote(goal.file);
        new Notice(`Archived ${name} to ${path}.`);
        this.refreshDailyBudgetView();
        if (typeof onDone === "function") await onDone();
      },
    });
    modal.open();
    return modal;
  },

  openGoalDueDate(goal, onDone) {
    const modal = new GoalDueDateModal(this.app, {
      name: goal.goalName || goal.goalKey,
      dueDate: goal.dueDate || "",
      onSave: async (date) => {
        await this.setGoalDueDate(goal, date);
        if (typeof onDone === "function") await onDone();
      },
    });
    modal.open();
    return modal;
  },

  async setGoalDueDate(goal, date) {
    const due = core.parseIsoDate(date);
    if (!due) throw new Error("that isn't a date");
    if (!(goal.file instanceof TFile)) throw new Error("the goal note could not be found");
    const content = await this.app.vault.read(goal.file);
    const next = updateFrontmatterValue(content, "due_date", due);
    if (next !== content) await _ftModify(this.app, goal.file, next);
    new Notice(`${goal.goalName || goal.goalKey} is now due ${due}.`);
    this.refreshDailyBudgetView();
  },
});
// --- Bills list -----------------------------------------------------------------
// Plugin methods for the bill-notes model, kept out of the main class body, which
// was already six thousand lines. Attached to the prototype so they read exactly
// like any other method.

Object.assign(FinanceTrackerPlugin.prototype, {
  // Which heading a bill sits under. "Due soon" uses the bill's own reminder
  // window, so a bill you want a week's notice for shows up a week out.
  billGroupFor(item, referenceDate) {
    if (item.status === "overdue" || item.status === "due") return "overdue";
    if (!item.nextDue) return "later";
    const lead = Math.max(Number(item.reminderDays) || 0, 3);
    if (item.daysUntilDue !== null && item.daysUntilDue <= lead) return "soon";
    if (item.nextDue.slice(0, 7) === referenceDate.slice(0, 7)) return "month";
    return "later";
  },

  // Tiny inline price history: the amounts already exist, and a bill creeping up
  // is exactly the thing a list of today's prices hides.
  renderBillSparkline(host, amounts) {
    const values = (amounts || []).filter((value) => Number(value) > 0);
    if (values.length < 2) return;
    const width = 64;
    const height = 18;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * (width - 2) + 1;
        const y = height - 2 - ((value - min) / span) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const svg = host.createSvg("svg", {
      cls: ["finance-bill-spark"],
      attr: { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": "Recent amounts" },
    });
    svg.createSvg("polyline", { cls: ["finance-bill-spark-line"], attr: { points } });
  },

  async renderBillsBlock(source, el, ctx, recurring) {
    const config = parseConfigBlock(source);
    const referenceDate = this.getReferenceDateForSource(ctx.sourcePath);
    const currency = core.normalizeCurrency(config.currency || this.settings.defaultCurrency);
    const rerender = () => this.renderRecurringBlock(source, el, ctx);
    const dueNext30Days = core.fromCents(
      core.sumRecurringDueWithin(recurring, referenceDate, core.addDays(referenceDate, 30)).totalCents
    );

    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-bills" });
    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Bills" });
    const headerActions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(headerActions, "Add bill", () => this.openAddBill({ onSaved: rerender }), { opensModal: true });
    addAction(
      headerActions,
      "Log all due",
      async () => {
        await this.logDueRecurringPayments({ notify: true });
        await rerender();
      },
      { primary: true, errorPrefix: "Logging due bills" }
    );

    const live = recurring.items.filter((item) => item.active);
    renderStatCards(wrapper, [
      { label: "Per month", value: core.formatCurrency(recurring.totals.monthly, currency) },
      { label: "Per year", value: core.formatCurrency(recurring.totals.yearly, currency) },
      { label: "Due next 30 days", value: core.formatCurrency(dueNext30Days, currency) },
      { label: "Running bills", value: String(live.length) },
    ]);

    const groups = [
      ["overdue", "Overdue"],
      ["soon", "Due soon"],
      ["month", "Later this month"],
      ["later", "Later"],
    ];
    for (const [key, title] of groups) {
      const items = live.filter((item) => this.billGroupFor(item, referenceDate) === key);
      if (!items.length) continue;
      const section = wrapper.createDiv({ cls: `finance-tracker-chart-card finance-bills-group is-${key}` });
      section.createEl("h4", { text: `${title} (${items.length})` });
      for (const item of items) this.renderBillRow(section, item, { currency, referenceDate, rerender, live });
    }

    this.renderRecurringCalendar(wrapper, recurring, currency, referenceDate, {
      months: core.parseNumber(config.months),
      weeks: core.parseNumber(config.weeks),
    });

    const ignored = new Set(this.settings.ignoredBillSuggestions || []);
    const suggestions = (recurring.suggestions || []).filter((suggestion) => !ignored.has(suggestion.id));
    if (suggestions.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-suggestions" });
      section.createEl("h4", { text: `Looks recurring (${suggestions.length})` });
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Logged under a bill tag, but no bill claims them. Track one to give it a note, or add it to an existing bill.",
      });
      for (const suggestion of suggestions) this.renderBillSuggestion(section, suggestion, { currency, rerender, live });
    }

    const ended = recurring.items.filter((item) => !item.active);
    if (ended.length) {
      const details = wrapper.createEl("details", { cls: "finance-tracker-chart-card finance-tracker-archived" });
      details.createEl("summary", { text: `Ended and paused (${ended.length})` });
      for (const item of ended) this.renderEndedBill(details, item, { currency, rerender, live });
    }

    const runway = await this.computeRunwayState(referenceDate, { recurring, entries: await this.collectAllTransactions() });
    this.renderRunwaySection(wrapper, runway, currency);
  },

  renderBillRow(host, item, context) {
    const { currency, rerender, live } = context;
    const row = host.createDiv({ cls: "finance-tracker-budget-card finance-bill-row" });
    if (item.status === "overdue") row.addClass("is-overdue");

    const top = row.createDiv({ cls: "finance-bill-row-top" });
    const title = renderRowTitle(top, item.label, core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency));
    title.addClass("finance-bill-row-title");
    this.renderBillSparkline(top, item.recentAmounts);

    const when =
      item.status === "overdue"
        ? `overdue since ${item.nextDue}`
        : item.status === "due"
          ? "due today"
          : item.daysUntilDue === 1
            ? "due tomorrow"
            : `due ${item.nextDue}`;
    const bits = [cadenceLabel(item.cadence), when];
    if (item.variable) bits.push("varies");
    if (item.nextAmount > 0 && item.changeDate) bits.push(`${core.formatCurrency(item.nextAmount, currency)} from ${item.changeDate}`);
    if (item.endDate) bits.push(`ends ${item.endDate}`);
    if (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null) bits.push(`${item.paymentsLeft} left`);
    row.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });

    const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
    const isDue = item.status === "overdue" || item.status === "due";
    addAction(
      actions,
      "Mark paid",
      async () => {
        if (item.variable) {
          new LogVariableBillModal(this.app, this, item, rerender).open();
          return;
        }
        const date = await this.logRecurringNow(item);
        new Notice(`Logged ${item.label} for ${date}`);
        await rerender();
      },
      { primary: isDue, errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
    );

    // Everything else is one tap away rather than five buttons wide.
    const more = actions.createEl("button", { cls: "finance-bill-more", text: "⋯", attr: { "aria-label": "More actions" } });
    more.addEventListener("click", (event) => this.openBillMenu(event, item, { rerender, live }));
  },

  openBillMenu(event, item, context) {
    const { rerender, live } = context;
    const menu = new Menu();
    const add = (title, icon, run) =>
      menu.addItem((menuItem) =>
        menuItem
          .setTitle(title)
          .setIcon(icon)
          .onClick(async () => {
            try {
              await run();
              await rerender();
            } catch (error) {
              new Notice(`${title} failed: ${error.message}`);
            }
          })
      );

    if (item.nextDue) {
      add("Push a week", "calendar-plus", async () => {
        const nextDue = core.addDays(item.nextDue, 7);
        await this.updateRecurringItem(item, { nextDue });
        new Notice(`${item.label} now due ${nextDue}`);
      });
      add("Skip this cycle", "skip-forward", async () => {
        await this.logRecurringSkip(item);
        new Notice(`Skipped ${item.label} for ${item.nextDue}`);
      });
    }
    menu.addItem((menuItem) =>
      menuItem.setTitle("Edit").setIcon("pencil").onClick(() => new EditRecurringItemModal(this.app, this, item, rerender).open())
    );
    if (item.billId) {
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Merge into another bill…")
          .setIcon("merge")
          .onClick(() => this.openMergeBill(item, live, rerender))
      );
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Open note")
          .setIcon("file-text")
          .onClick(async () => {
            const file = this.app.vault.getAbstractFileByPath(item.notePath);
            if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
          })
      );
    }
    menu.addSeparator();
    add("Pause", "pause", () => this.updateRecurringItem(item, { active: false }));
    add("End now", "square", () => this.updateRecurringItem(item, { endDate: item.lastDate || core.todayIsoLocal() }));

    if (typeof menu.showAtMouseEvent === "function" && event) menu.showAtMouseEvent(event);
    return menu;
  },

  renderBillSuggestion(host, suggestion, context) {
    const { currency, rerender, live } = context;
    const card = host.createDiv({ cls: "finance-tracker-budget-card" });
    renderRowTitle(card, suggestion.name, core.formatCurrency(suggestion.lastAmount, currency));
    card.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${cadenceLabel(suggestion.cadence)} · ${suggestion.count} payment${suggestion.count === 1 ? "" : "s"} · last ${suggestion.lastDate}`,
    });
    const actions = card.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(
      actions,
      "Track",
      async () => {
        await this.createBillFromSuggestion(suggestion);
        new Notice(`Now tracking ${suggestion.name}.`);
        await rerender();
      },
      { primary: true, errorPrefix: "Tracking" }
    );
    if (live.length) {
      addAction(
        actions,
        "Add to a bill…",
        () => this.openMergeBill({ label: suggestion.name, merchant: suggestion.merchants[0], name: suggestion.id }, live, rerender),
        { opensModal: true }
      );
    }
    addAction(
      actions,
      "Ignore",
      async () => {
        this.settings.ignoredBillSuggestions = Array.from(new Set([...(this.settings.ignoredBillSuggestions || []), suggestion.id]));
        await this.saveSettings();
        await rerender();
      },
      { errorPrefix: "Ignoring" }
    );
  },

  renderEndedBill(host, item, context) {
    const { currency, rerender, live } = context;
    const row = host.createDiv({ cls: "finance-tracker-budget-card finance-tracker-recurring-row is-paused" });
    renderRowTitle(row, item.label, core.formatCurrency(item.lastAmount, currency));
    const reason =
      item.finishedReason === "end-date"
        ? `ended ${item.endDate}`
        : item.finishedReason === "payments"
          ? "all payments made"
          : "paused";
    row.createDiv({
      cls: "finance-tracker-budget-meta",
      text: `${cadenceLabel(item.cadence)} · ${reason} · ${item.count} payment${item.count === 1 ? "" : "s"}`,
    });
    const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(
      actions,
      item.finished ? "Restart" : "Resume",
      async () => {
        await this.updateRecurringItem(item, { active: true, ...(item.finished ? { endDate: null, paymentsLeft: null } : {}) });
        await rerender();
      },
      { primary: !item.finished, errorPrefix: `Resuming ${item.label}` }
    );
    if (item.billId && live.length) {
      addAction(actions, "Merge into…", () => this.openMergeBill(item, live, rerender), { opensModal: true });
    }
  },

  async createBillFromSuggestion(suggestion) {
    const bill = {
      id: core.normalizeBillId(suggestion.name) || suggestion.id,
      name: suggestion.name,
      aliases: Array.from(new Set([suggestion.id, ...(suggestion.merchants || [])])).filter(
        (alias) => core.normalizeBillId(alias) !== core.normalizeBillId(suggestion.name)
      ),
      cadence: suggestion.cadence,
      dueRule: { type: "after-last" },
      amount: suggestion.lastAmount,
      amountModel: "fixed",
      reminderDays: 3,
      active: true,
      autoLog: false,
      nextAmount: null,
      changeDate: null,
      endDate: null,
      paymentsLeft: null,
      nextDueOverride: null,
      skipped: [],
      startDate: suggestion.firstDate || null,
      currency: this.settings.defaultCurrency,
    };
    await this.saveBill(bill);
    return bill;
  },

  // A bill added by hand. With a first due date and no payments yet, that date is
  // the schedule's starting point; the override clears itself on the first
  // payment, like any other.
  async addBill({ name, cadence, amount = null, dueRule = { type: "after-last" }, firstDue = null }) {
    const id = core.normalizeBillId(name);
    if (!id) throw new Error("Give the bill a name.");
    if (!core.normalizeCadence(cadence)) throw new Error("Pick how often it is paid.");
    if (await this.findBill(id)) throw new Error(`There is already a bill called ${name}.`);
    const bill = {
      id,
      name: String(name).trim(),
      aliases: [],
      cadence: core.normalizeCadence(cadence),
      dueRule,
      amount,
      amountModel: "fixed",
      reminderDays: 3,
      active: true,
      autoLog: false,
      nextAmount: null,
      changeDate: null,
      endDate: null,
      paymentsLeft: null,
      nextDueOverride: firstDue,
      skipped: [],
      startDate: null,
      currency: this.settings.defaultCurrency,
    };
    await this.saveBill(bill);
    this.refreshDailyBudgetView();
    return bill;
  },

  describeDueRule(rule, cadence) {
    const ordinal = (value) => {
      const n = Number(value);
      const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
      return `${n}${suffix}`;
    };
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (rule?.type === "day-of-month") return `on the ${ordinal(rule.day)} of the month`;
    if (rule?.type === "nth-weekday") {
      const which = { 1: "first", 2: "second", 3: "third", 4: "fourth", "-1": "last" }[String(rule.ordinal)] || "first";
      return `on the ${which} ${weekdays[rule.weekday] || "Monday"}`;
    }
    return `${cadenceLabel(cadence).toLowerCase()}, counted from the last payment`;
  },

  // The block inside a bill note: what it costs, when it is next due, its price
  // history and every payment linked to it. The note is the bill, so this is
  // where a bill is looked at on its own.
  async renderBillBlock(source, el, ctx) {
    el.empty();
    const referenceDate = core.todayIsoLocal();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-bill-note" });
    const rerender = () => this.renderBillBlock(source, el, ctx);

    const recurring = await this.detectRecurring(referenceDate);
    const item = (recurring.items || []).find((entry) => entry.notePath === ctx.sourcePath);
    if (!item) {
      const merged = (await this.loadBills({ includeMerged: true })).find((bill) => bill.notePath === ctx.sourcePath);
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: merged?.mergedInto
          ? `Merged into ${merged.mergedInto}. Payments under this name count toward that bill now.`
          : "These properties do not describe a bill yet — it needs at least a bill_id and a cadence.",
      });
      return;
    }

    const status =
      item.status === "finished"
        ? item.finishedReason === "payments" ? "All payments made" : `Ended ${item.endDate}`
        : !item.active
          ? "Paused"
          : item.status === "overdue"
            ? `Overdue since ${item.nextDue}`
            : item.status === "due"
              ? "Due today"
              : item.nextDue ? `Due ${item.nextDue}` : "No due date yet";

    renderStatCards(wrapper, [
      { label: "Next payment", value: core.formatCurrency(item.nextDueAmount ?? item.lastAmount, currency) },
      { label: "When", value: status, cls: item.status === "overdue" ? "is-over" : "" },
      { label: "Per month", value: core.formatCurrency(item.monthlyCost, currency) },
      { label: "Payments logged", value: String(item.count) },
    ]);

    const about = [this.describeDueRule(item.dueRule, item.cadence)];
    if (item.variable) about.push("amount varies");
    if (item.bill?.aliases?.length) about.push(`also known as ${item.bill.aliases.join(", ")}`);
    wrapper.createDiv({ cls: "finance-tracker-budget-meta", text: about.join(" · ") });

    if (item.active) {
      const actions = wrapper.createDiv({ cls: "finance-tracker-header-actions" });
      addAction(
        actions,
        "Mark paid",
        async () => {
          if (item.variable) {
            new LogVariableBillModal(this.app, this, item, rerender).open();
            return;
          }
          const date = await this.logRecurringNow(item);
          new Notice(`Logged ${item.label} for ${date}`);
          await rerender();
        },
        { primary: item.status === "overdue" || item.status === "due", errorPrefix: `Logging ${item.label}`, opensModal: item.variable }
      );
      if (item.nextDue) {
        addAction(
          actions,
          "Skip this cycle",
          async () => {
            await this.logRecurringSkip(item);
            await rerender();
          },
          { errorPrefix: "Skipping" }
        );
      }
      addAction(actions, "Edit", () => new EditRecurringItemModal(this.app, this, item, rerender).open(), { opensModal: true });
    }

    const history = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const heading = history.createDiv({ cls: "finance-bill-row-top" });
    heading.createEl("h4", { text: "Payments" });
    this.renderBillSparkline(heading, item.payments.map((payment) => payment.amount).slice(-12));

    if (!item.payments.length) {
      history.createDiv({ cls: "finance-tracker-empty", text: "Nothing logged against this bill yet." });
    } else {
      const table = history.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Date", "Amount", "As written"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const payment of item.payments.slice().reverse().slice(0, 24)) {
        const row = body.createEl("tr");
        row.createEl("td", { text: payment.date });
        row.createEl("td", { text: core.formatCurrency(payment.amount, currency), cls: "is-numeric" });
        row.createEl("td", { text: payment.merchant || "" });
      }
    }

    if (item.skipped?.length) {
      wrapper.createDiv({ cls: "finance-tracker-budget-meta", text: `Skipped: ${item.skipped.join(", ")}` });
    }
  },

  // A card capture that is really a bill payment is filed under the bill. The
  // bank sends "CLAUDE.AI SUBSCRIPTION" with no category; the bill knows its
  // alias, its amount and when it is due.
  async matchCaptureToBill(expense) {
    const recurring = await this.detectRecurring(expense.date);
    if (!recurring.billsMode) return null;
    return core.findBillForPayment(
      { date: expense.date, amount: expense.amount, merchant: expense.merchant },
      recurring.items
    );
  },

  async undoLastBillMatch() {
    const last = this._lastBillMatch;
    if (!last) return false;
    this._lastBillMatch = null;
    const entries = await this.collectTransactionsForRange({ start: last.date, end: last.date });
    const entry = entries.find(
      (candidate) =>
        candidate.category === last.category &&
        Math.abs(candidate.amount - last.amount) < 0.005 &&
        (candidate.merchant || "") === (last.merchant || "")
    );
    if (!entry) return false;
    await this.updateTransactionEntry(entry, { category: "uncategorized" });
    return true;
  },

  openMergeBill(item, live, onDone) {
    const modal = new MergeBillModal(this.app, this, item, live, onDone);
    modal.open();
    return modal;
  },

  openAddBill(options = {}) {
    const modal = new AddBillModal(this.app, this, options);
    modal.open();
    return modal;
  },
});

// --- Portfolio -------------------------------------------------------------------
// Trades live in a portfolio note; prices come from the source chosen in settings
// — typed by hand, a published Google Sheet, or Yahoo — and every fetched price is
// cached, so the portfolio still renders offline or while a source is refusing.
//
// Network use is opt-in: with the price source left on "typed prices", nothing
// here makes a request.

const PORTFOLIO_BLOCK = "finance-portfolio";
const YAHOO_THROTTLE_MS = 400;

Object.assign(FinanceTrackerPlugin.prototype, {
  getPortfolioNotePath() {
    return normalizePath(this.settings.portfolioNotePath || DEFAULT_SETTINGS.portfolioNotePath);
  },

  buildPortfolioNoteContent() {
    return [
      "---",
      "# Prices you type in always win, e.g. VAS.AX=103.42, AAPL=229.10",
      "price_overrides: ",
      "# AUD per unit of a foreign currency, e.g. USD=1.51",
      "fx_rates: ",
      "---",
      "",
      "# 📈 Portfolio",
      "",
      "Figures here are arithmetic on the trades below, for your own records — not",
      "financial or tax advice.",
      "",
      "```finance-portfolio",
      "```",
      "",
      "## Trades",
      "",
      "Type is buy, sell, drp (dividend reinvestment) or split. For a split, Units is",
      "the ratio: 2 for a 2-for-1, 0.5 for a 1-for-2 consolidation. For a trade in",
      "another currency, AUD cost is what actually left your account, fees included.",
      "Log dividends in your daily notes as `#log/income/dividend/<ticker>`.",
      "",
      "| Date | Type | Ticker | Units | Price | Fees | Currency | AUD cost | Account | Note |",
      "| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |",
      "",
    ].join("\n");
  },

  async ensurePortfolioNote() {
    const path = this.getPortfolioNotePath();
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    return this.ensureTextFile(path, () => this.buildPortfolioNoteContent());
  },

  async loadPortfolio() {
    const file = this.app.vault.getAbstractFileByPath(this.getPortfolioNotePath());
    if (!(file instanceof TFile)) return { exists: false, trades: [], warnings: [], overrides: {}, fxOverrides: {} };
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = parseFrontmatter(content);
    const { trades, warnings } = core.parseTradesTable(content);
    const fxOverrides = {};
    for (const [currency, rate] of Object.entries(core.parsePriceOverrides(frontmatter.fx_rates || ""))) {
      fxOverrides[core.normalizeCurrency(currency)] = rate;
    }
    return {
      exists: true,
      content,
      file,
      trades,
      warnings,
      overrides: core.parsePriceOverrides(frontmatter.price_overrides || ""),
      fxOverrides,
    };
  },

  marketCache() {
    const cache = this.settings.marketCache && typeof this.settings.marketCache === "object" ? this.settings.marketCache : {};
    cache.quotes = cache.quotes || {};
    cache.history = cache.history || {};
    cache.fx = cache.fx || {};
    cache.fxHistory = cache.fxHistory || {};
    cache.dividends = cache.dividends || {};
    this.settings.marketCache = cache;
    return cache;
  },

  // Typed prices first, then the cache, marked stale when it is old.
  portfolioQuotes(portfolio) {
    const cache = this.marketCache();
    const quotes = core.markStaleQuotes(cache.quotes, {
      maxAgeMinutes: Math.max(60, Number(this.settings.priceRefreshMinutes) || 60) * 2,
    });
    for (const [ticker, price] of Object.entries(portfolio?.overrides || {})) {
      quotes[ticker] = { ...(quotes[ticker] || {}), price, source: "manual", stale: false };
    }
    return quotes;
  },

  portfolioFx(portfolio) {
    return { ...this.marketCache().fx, ...(portfolio?.fxOverrides || {}) };
  },

  async requestJson(url) {
    const response = await requestUrl({ url, method: "GET", throw: false, headers: { Accept: "application/json" } });
    return { status: response.status, json: response.json, text: response.text };
  },

  // Refreshes prices from the chosen source. Respects the refresh interval and
  // any backoff a source has earned by refusing; `force` skips the interval but
  // never the backoff, since hammering a source that is refusing only extends it.
  async refreshPrices(options = {}) {
    const source = this.settings.priceSource || "manual";
    const cache = this.marketCache();
    const now = Date.now();
    if (source === "manual") return { skipped: "manual" };

    if (cache.backoffUntil && Date.parse(cache.backoffUntil) > now) {
      return { skipped: "backoff", until: cache.backoffUntil, error: cache.lastError || "" };
    }
    const intervalMs = Math.max(5, Number(this.settings.priceRefreshMinutes) || 60) * 60 * 1000;
    if (!options.force && cache.lastRefresh && now - Date.parse(cache.lastRefresh) < intervalMs) {
      return { skipped: "fresh" };
    }

    const portfolio = options.portfolio || (await this.loadPortfolio());
    const tickers = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)));
    const currencies = Array.from(new Set(portfolio.trades.map((trade) => trade.currency).filter((currency) => currency !== "AUD")));
    if (!tickers.length) return { skipped: "no-trades" };

    const result = source === "sheet" ? await this.refreshFromSheet(cache) : await this.refreshFromYahoo(cache, tickers, currencies);
    cache.lastRefresh = new Date().toISOString();
    if (result.refused) {
      const backoff = core.nextBackoff(cache.failures || 0);
      cache.failures = backoff.failures;
      cache.backoffUntil = backoff.until;
      cache.lastError = result.error;
    } else if (!result.error) {
      cache.failures = 0;
      cache.backoffUntil = "";
      cache.lastError = "";
    } else {
      cache.lastError = result.error;
    }
    await this.saveSettings();
    return result;
  },

  async refreshFromSheet(cache) {
    const url = String(this.settings.priceSheetUrl || "").trim();
    if (!url) return { updated: 0, error: "Add the published sheet's CSV link in settings first." };
    const response = await requestUrl({ url, method: "GET", throw: false });
    if (response.status === 429 || response.status >= 500) return { updated: 0, refused: true, error: `The sheet answered ${response.status}.` };
    if (response.status >= 400) return { updated: 0, error: `The sheet answered ${response.status} — check it is published as CSV.` };
    const parsed = core.parseSheetPrices(response.text);
    if (parsed.error) return { updated: 0, error: parsed.error };
    const fetchedAt = new Date().toISOString();
    for (const [ticker, quote] of Object.entries(parsed.quotes)) {
      cache.quotes[ticker] = { ...quote, source: "sheet", fetchedAt };
    }
    Object.assign(cache.fx, parsed.fx);
    return { updated: Object.keys(parsed.quotes).length };
  },

  async refreshFromYahoo(cache, tickers, currencies) {
    let updated = 0;
    const errors = [];
    const fetchedAt = () => new Date().toISOString();
    const pause = () => new Promise((resolve) => setTimeout(resolve, this._yahooThrottleMs ?? YAHOO_THROTTLE_MS));

    const fetchChart = async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div`;
      const response = await this.requestJson(url);
      if (response.status === 429 || response.status >= 500) return { refused: true, status: response.status };
      if (response.status >= 400) return { error: `${symbol}: ${response.status}` };
      return core.parseYahooChart(response.json);
    };

    for (const [index, ticker] of tickers.entries()) {
      if (index) await pause();
      const chart = await fetchChart(ticker);
      if (chart.refused) {
        return { updated, refused: true, error: `Yahoo refused requests (${chart.status}). Cached prices are shown until it recovers.` };
      }
      if (chart.error || !chart.quote) {
        errors.push(chart.error || `${ticker}: no price`);
        continue;
      }
      cache.quotes[ticker] = { ...chart.quote, source: "yahoo", fetchedAt: fetchedAt() };
      cache.history[ticker] = chart.history;
      cache.dividends[ticker] = chart.dividends;
      updated += 1;
    }

    for (const currency of currencies) {
      await pause();
      // AUDUSD=X is US dollars per Australian dollar; the portfolio wants the
      // reverse, AUD per unit of the foreign currency.
      const chart = await fetchChart(`AUD${currency}=X`);
      if (chart.refused) return { updated, refused: true, error: `Yahoo refused requests (${chart.status}).` };
      if (!chart.quote?.price) continue;
      cache.fx[currency] = Number((1 / chart.quote.price).toFixed(6));
      cache.fxHistory[currency] = chart.history.map((point) => ({ date: point.date, audPerUnit: Number((1 / point.close).toFixed(6)) }));
    }

    return { updated, error: errors.join("; ") };
  },

  // Tickers for autocomplete: those already traded, plus Yahoo's search when it is
  // the chosen source and is not in backoff.
  async searchTickers(query) {
    const needle = core.normalizeTicker(query);
    const portfolio = await this.loadPortfolio();
    const own = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)))
      .filter((ticker) => !needle || ticker.includes(needle))
      .map((ticker) => ({ symbol: ticker, name: this.marketCache().quotes[ticker]?.name || "", exchange: core.tickerMarket(ticker), type: "" }));

    const cache = this.marketCache();
    const blocked = cache.backoffUntil && Date.parse(cache.backoffUntil) > Date.now();
    if (this.settings.priceSource !== "yahoo" || blocked || String(query || "").trim().length < 2) return own;

    const response = await this.requestJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(String(query).trim())}&quotesCount=8&newsCount=0`
    );
    if (response.status !== 200) return own;
    const found = core.parseYahooSearch(response.json).filter((result) => !own.some((item) => item.symbol === result.symbol));
    return [...own, ...found];
  },

  // Everything the portfolio block draws, in one place.
  async buildPortfolioModel(referenceDate = core.todayIsoLocal()) {
    const portfolio = await this.loadPortfolio();
    const fx = this.portfolioFx(portfolio);
    const quotes = this.portfolioQuotes(portfolio);
    const holdings = core.buildHoldings(portfolio.trades, { fx, referenceDate });
    const value = core.valuePortfolio(holdings, quotes, fx);
    const dividends = core.summarizeDividends(await this.collectAllTransactions(), holdings, { referenceDate });
    const cache = this.marketCache();
    const series = core.buildPortfolioValueSeries(portfolio.trades, cache.history, cache.fxHistory, {
      end: referenceDate,
      fx,
      stepDays: 7,
    });

    // Money in and out, for an annualised return: buys out, sales and dividends
    // in, and what is held now as if sold today.
    const cashflows = [];
    for (const trade of portfolio.trades) {
      if (trade.type === "split") continue;
      const gross = trade.units * trade.price;
      const rate = trade.currency === "AUD" ? 1 : Number(fx[trade.currency]) || 0;
      if (trade.type === "buy") cashflows.push({ date: trade.date, amount: -(trade.audCost ?? (gross + trade.fees) * rate) });
      if (trade.type === "sell") cashflows.push({ date: trade.date, amount: trade.audCost ?? (gross - trade.fees) * rate });
    }
    for (const row of dividends.rows) for (const payment of row.payments) cashflows.push({ date: payment.date, amount: payment.amount });
    if (value.totals.valueAud > 0) cashflows.push({ date: referenceDate, amount: value.totals.valueAud });

    return {
      cache,
      dividends,
      holdings,
      portfolio,
      quotes,
      series,
      source: this.settings.priceSource || "manual",
      value,
      xirr: core.computeXirr(cashflows),
    };
  },
});

// --- Portfolio block and trade logging --------------------------------------------

Object.assign(FinanceTrackerPlugin.prototype, {
  describePriceSource(model) {
    const cache = model.cache || {};
    const when = (iso) => (iso ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
    if (model.source === "manual") return "Prices are the ones typed into this note's properties.";
    const label = model.source === "sheet" ? "your Google Sheet" : "Yahoo Finance";
    if (cache.backoffUntil && Date.parse(cache.backoffUntil) > Date.now()) {
      return `${label} is refusing requests, so the last prices fetched are shown. Trying again after ${when(cache.backoffUntil)}.`;
    }
    if (cache.lastError) return `Prices from ${label}, last refreshed ${when(cache.lastRefresh) || "never"} — ${cache.lastError}`;
    return cache.lastRefresh ? `Prices from ${label}, refreshed ${when(cache.lastRefresh)}.` : `Prices from ${label} — not fetched yet.`;
  },

  async renderPortfolioBlock(source, el, ctx) {
    el.empty();
    const config = parseConfigBlock(source);
    const referenceDate = core.todayIsoLocal();
    const currency = "AUD";
    const rerender = () => this.renderPortfolioBlock(source, el, ctx);
    const wrapper = el.createDiv({ cls: "finance-tracker-dashboard finance-portfolio" });

    const header = wrapper.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h3", { text: config.title || "Portfolio" });
    const actions = header.createDiv({ cls: "finance-tracker-header-actions" });
    addAction(actions, "Log trade", () => this.openLogTrade({ onSaved: rerender }), { primary: true, opensModal: true });

    let model = await this.buildPortfolioModel(referenceDate);
    if (!model.portfolio.exists) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "No portfolio note yet. Logging a trade creates one." });
      return;
    }
    if (model.source !== "manual") {
      addAction(
        actions,
        "Refresh prices",
        async () => {
          const result = await this.refreshPrices({ force: true, portfolio: model.portfolio });
          if (result.refused || result.error) new Notice(result.error || "Could not refresh prices.");
          await rerender();
        },
        { errorPrefix: "Refreshing prices" }
      );
      // Opening the portfolio is the moment prices are wanted, so a refresh is
      // attempted then — no background polling. The interval and any backoff
      // still apply.
      if (config.refresh !== "no") {
        const result = await this.refreshPrices({ portfolio: model.portfolio });
        if (!result.skipped) model = await this.buildPortfolioModel(referenceDate);
      }
    }

    wrapper.createDiv({ cls: "finance-tracker-budget-meta finance-portfolio-source", text: this.describePriceSource(model) });

    if (!model.portfolio.trades.length) {
      wrapper.createDiv({ cls: "finance-tracker-empty", text: "No trades yet. Log one, or add rows to the Trades table below." });
      return;
    }

    const totals = model.value.totals;
    const signed = (amount) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${core.formatCurrency(Math.abs(amount), currency)}`;
    renderStatCards(wrapper, [
      { label: "Value", value: core.formatCurrency(totals.valueAud, currency), hint: model.value.missing.length ? `${model.value.missing.length} unpriced` : "" },
      { label: "Cost base", value: core.formatCurrency(totals.costAud, currency) },
      {
        label: "Gain",
        value: signed(totals.gainAud),
        hint: totals.gainPct === null ? "" : `${totals.gainPct > 0 ? "+" : ""}${totals.gainPct}%`,
        cls: totals.gainAud < 0 ? "is-over" : "is-down",
      },
      { label: "Today", value: signed(totals.dayChangeAud) },
      { label: "Realised", value: signed(totals.realisedAud) },
      { label: "Dividends, 12 months", value: core.formatCurrency(model.dividends.lastTwelveMonths, currency) },
      ...(model.xirr === null ? [] : [{ label: "Annualised return", value: `${(model.xirr * 100).toFixed(1)}%` }]),
    ]);

    this.renderHoldingsTable(wrapper, model, currency);

    if (model.value.missing.length) {
      wrapper.createDiv({
        cls: "finance-tracker-empty",
        text: `No price for ${model.value.missing.join(", ")}. Type one into this note's price_overrides (e.g. ${model.value.missing[0]}=10.50), or choose a price source in settings.`,
      });
    }

    const pricedRows = model.value.rows.filter((row) => row.valueAud > 0);
    if (pricedRows.length) {
      // The same two-ring donut the spending dashboards use: markets inside,
      // holdings outside.
      const groups = model.value.allocation.byMarket.map((market, index) => {
        const base = core.categoryBaseColor(index);
        const children = pricedRows
          .filter((row) => row.market === market.key)
          .map((row, childIndex, list) => ({
            key: row.ticker,
            label: row.ticker,
            total: row.valueAud,
            color: core.categoryShadeColor(base, childIndex, list.length),
            children: [],
          }));
        return { key: market.key, label: market.key, total: market.value, color: core.categoryShadeColor(base, 0), children };
      });
      const hierarchy = { groups, slices: groups.flatMap((group) => group.children) };
      const donut = wrapper.createDiv({ cls: "finance-portfolio-allocation" });
      this.renderPieChart(donut, hierarchy, currency, 0.06, { title: "Allocation" });
    }

    this.renderPortfolioValueChart(wrapper, model, currency, config);

    if (model.dividends.rows.length) {
      const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
      section.createEl("h4", { text: "Dividends" });
      const table = section.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Ticker", "Last 12 months", "All time", "Yield on cost"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const row of model.dividends.rows) {
        const tr = body.createEl("tr");
        tr.createEl("td", { text: row.ticker });
        tr.createEl("td", { text: core.formatCurrency(row.lastTwelveMonths, currency), cls: "is-numeric" });
        tr.createEl("td", { text: core.formatCurrency(row.total, currency), cls: "is-numeric" });
        tr.createEl("td", { text: row.yieldOnCostPct === null ? "—" : `${row.yieldOnCostPct}%`, cls: "is-numeric" });
      }
    }

    const tradesSection = wrapper.createEl("details", { cls: "finance-tracker-chart-card" });
    tradesSection.createEl("summary", { text: `Trades (${model.portfolio.trades.length})` });
    const tradeTable = tradesSection.createEl("table", { cls: "finance-tracker-table" });
    const tradeHead = tradeTable.createEl("thead").createEl("tr");
    for (const label of ["Date", "Type", "Ticker", "Units", "Price", "Account"]) tradeHead.createEl("th", { text: label });
    const tradeBody = tradeTable.createEl("tbody");
    for (const trade of model.portfolio.trades.slice().reverse().slice(0, 40)) {
      const tr = tradeBody.createEl("tr");
      tr.createEl("td", { text: trade.date });
      tr.createEl("td", { text: trade.type });
      tr.createEl("td", { text: trade.ticker });
      tr.createEl("td", { text: String(trade.units), cls: "is-numeric" });
      tr.createEl("td", { text: trade.price === null ? "—" : core.formatCurrencyWithCode(trade.price, trade.currency), cls: "is-numeric" });
      tr.createEl("td", { text: trade.account || "" });
    }

    const warnings = [...model.portfolio.warnings, ...model.holdings.warnings];
    if (warnings.length) {
      const section = wrapper.createEl("details", { cls: "finance-tracker-chart-card" });
      section.createEl("summary", { text: `Rows to check (${warnings.length})` });
      for (const warning of warnings) {
        section.createDiv({
          cls: "finance-tracker-budget-meta",
          text: [warning.ticker, warning.row ? `row ${warning.row}` : "", warning.reason].filter(Boolean).join(" · "),
        });
      }
    }

    wrapper.createDiv({
      cls: "finance-tracker-budget-meta finance-portfolio-disclaimer",
      text: "Arithmetic on your own records, not financial or tax advice. The CGT discount flag is a reminder to check, not a ruling.",
    });
  },

  renderHoldingsTable(wrapper, model, currency) {
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-portfolio-holdings" });
    section.createEl("h4", { text: "Holdings" });
    const scroller = section.createDiv({ cls: "finance-portfolio-scroll" });
    const table = scroller.createEl("table", { cls: "finance-tracker-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const label of ["Holding", "Units", "Avg cost", "Price", "Value", "Gain", "Today", "Weight"]) head.createEl("th", { text: label });
    const body = table.createEl("tbody");

    for (const row of model.value.rows) {
      const tr = body.createEl("tr", { cls: "is-clickable" });
      const name = tr.createEl("td");
      name.createDiv({ text: row.ticker, cls: "finance-portfolio-ticker" });
      if (row.name && row.name !== row.ticker) name.createDiv({ text: row.name, cls: "finance-tracker-budget-meta" });
      tr.createEl("td", { text: String(Number(row.units.toFixed(4))), cls: "is-numeric" });
      tr.createEl("td", { text: core.formatCurrencyWithCode(row.averageCostNative, row.currency), cls: "is-numeric" });
      const price = tr.createEl("td", { cls: "is-numeric" });
      price.setText(row.price === null ? "—" : core.formatCurrencyWithCode(row.price, row.currency));
      if (row.stale) price.createSpan({ cls: "finance-portfolio-stale", text: " old" });
      tr.createEl("td", { text: row.valueAud === null ? "—" : core.formatCurrency(row.valueAud, currency), cls: "is-numeric" });
      const gain = tr.createEl("td", { cls: "is-numeric" });
      if (row.gainAud === null) gain.setText("—");
      else {
        gain.setText(`${core.formatCurrency(row.gainAud, currency)}${row.gainPct === null ? "" : ` (${row.gainPct}%)`}`);
        gain.addClass(row.gainAud < 0 ? "is-negative" : "is-positive");
      }
      tr.createEl("td", { text: row.dayChangePct === null ? "—" : `${row.dayChangePct}%`, cls: "is-numeric" });
      tr.createEl("td", { text: `${row.weight}%`, cls: "is-numeric" });

      // A holding's parcels, on click: what was bought when, and which have been
      // held long enough that the CGT discount would apply to a sale.
      const detail = body.createEl("tr", { cls: "finance-portfolio-detail is-hidden" });
      const cell = detail.createEl("td", { attr: { colspan: "8" } });
      for (const parcel of row.parcels) {
        cell.createDiv({
          cls: "finance-tracker-budget-meta",
          text: `${parcel.acquired} · ${Number(parcel.units.toFixed(4))} units · cost ${core.formatCurrency(parcel.costAud, currency)}${
            parcel.discountEligible ? " · held 12 months+" : ""
          }`,
        });
      }
      if (row.realisedAud) {
        cell.createDiv({ cls: "finance-tracker-budget-meta", text: `Realised so far: ${core.formatCurrency(row.realisedAud, currency)}` });
      }
      if (row.accounts.length) cell.createDiv({ cls: "finance-tracker-budget-meta", text: `Held with ${row.accounts.join(", ")}` });
      tr.addEventListener("click", () => detail.toggleClass("is-hidden", !detail.hasClass("is-hidden")));
    }
  },

  renderPortfolioValueChart(wrapper, model, currency, config) {
    const points = model.series.filter((point) => point.valueAud > 0 || point.costAud > 0);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card" });
    const header = section.createDiv({ cls: "finance-tracker-header" });
    header.createEl("h4", { text: "Value and cost" });
    if (points.length < 2) {
      section.createDiv({
        cls: "finance-tracker-empty",
        text: model.source === "manual"
          ? "The history chart needs past prices, which typed prices do not have. It fills in once prices come from a sheet or Yahoo."
          : "Not enough price history yet.",
      });
      return;
    }

    const ranges = [["3M", 3], ["1Y", 12], ["All", 0]];
    const bar = header.createDiv({ cls: "finance-tracker-calendar-filter-bar" });
    const chartHost = section.createDiv();
    let months = Number(config.months) || 12;

    const draw = () => {
      chartHost.empty();
      const cutoff = months ? core.addMonths(core.todayIsoLocal(), -months) : "";
      const shown = points.filter((point) => !cutoff || point.date >= cutoff);
      if (shown.length < 2) {
        chartHost.createDiv({ cls: "finance-tracker-empty", text: "Not enough history in this range." });
        return;
      }
      const W = 600;
      const H = 170;
      const pad = 8;
      const values = shown.flatMap((point) => [point.valueAud, point.costAud]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const x = (index) => pad + (index * (W - pad * 2)) / (shown.length - 1);
      const y = (value) => H - pad - ((value - min) / span) * (H - pad * 2);
      const svg = chartHost.createDiv({ cls: "finance-tracker-line-chart" }).createSvg("svg", {
        cls: ["ft-line-svg"],
        attr: { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Portfolio value against cost base" },
      });
      const line = (key) => shown.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
      svg.createSvg("polyline", { cls: ["ft-line-path", "finance-portfolio-cost-line"], attr: { points: line("costAud") } });
      svg.createSvg("polyline", { cls: ["ft-line-path"], attr: { points: line("valueAud") } });
      const last = shown[shown.length - 1];
      const axis = chartHost.createDiv({ cls: "finance-tracker-line-axis" });
      axis.createSpan({ text: shown[0].date });
      axis.createSpan({
        text: `${last.date} · value ${core.formatCurrency(last.valueAud, currency)} · cost ${core.formatCurrency(last.costAud, currency)}`,
      });
    };

    const buttons = [];
    for (const [label, count] of ranges) {
      const button = bar.createEl("button", { cls: "finance-tracker-calendar-filter-button", text: label });
      buttons.push(button);
      if (count === months) button.addClass("is-active");
      button.addEventListener("click", () => {
        months = count;
        for (const other of buttons) other.toggleClass("is-active", other === button);
        draw();
      });
    }
    draw();
  },

  // Appends a trade as a row of the Trades table, creating the note (and the
  // table) if needed. The note stays the record: this writes exactly what a
  // person would have typed.
  async appendTrade(trade) {
    const file = await this.ensurePortfolioNote();
    const content = await this.app.vault.cachedRead(file);
    const cell = (value) => (value === null || value === undefined ? "" : String(value).replace(/\|/g, "/"));
    const row = `| ${[
      trade.date,
      trade.type,
      core.normalizeTicker(trade.ticker),
      trade.units,
      trade.type === "split" ? "" : trade.price,
      trade.fees || "",
      trade.currency || "",
      trade.audCost || "",
      trade.account || "",
      trade.note || "",
    ].map(cell).join(" | ")} |`;

    const lines = String(content).split("\n");
    const headerIndex = lines.findIndex((line) => /^\s*\|/.test(line) && /\btype\b/i.test(line) && /\bticker\b/i.test(line));
    if (headerIndex < 0) {
      const trimmed = lines.join("\n").replace(/\n+$/, "");
      const table = [
        "",
        "## Trades",
        "",
        "| Date | Type | Ticker | Units | Price | Fees | Currency | AUD cost | Account | Note |",
        "| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |",
        row,
        "",
      ];
      await _ftModify(this.app, file, `${trimmed}\n${table.join("\n")}`);
      return row;
    }
    let insertAt = headerIndex + 2;
    while (insertAt < lines.length && /^\s*\|/.test(lines[insertAt])) insertAt += 1;
    lines.splice(insertAt, 0, row);
    await _ftModify(this.app, file, lines.join("\n"));
    return row;
  },

  openLogTrade(options = {}) {
    const modal = new LogTradeModal(this.app, this, options);
    modal.open();
    return modal;
  },

  async openPortfolioNote() {
    const file = await this.ensurePortfolioNote();
    await this.app.workspace.getLeaf(true).openFile(file);
  },
});

class LogTradeModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onSaved = options.onSaved;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Log a trade" });

    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const typeSelect = row("Type").createEl("select", { attr: { "aria-label": "Trade type" } });
    for (const [value, label] of [["buy", "Buy"], ["sell", "Sell"], ["drp", "Dividend reinvestment"], ["split", "Split or consolidation"]]) {
      typeSelect.createEl("option", { text: label, value });
    }

    const dateInput = row("Date").createEl("input", { type: "date", attr: { "aria-label": "Trade date" } });
    dateInput.value = core.todayIsoLocal();

    const tickerInput = row("Ticker").createEl("input", {
      type: "text",
      attr: { placeholder: "VAS.AX or AAPL", "aria-label": "Ticker" },
    });
    // Suggestions are fetched as you type; a small cache keeps each query to one
    // request, and the list is never allowed to block typing a ticker directly.
    const found = new Map();
    let pending = "";
    this.tickerSuggest = new FinanceSuggest(tickerInput, {
      scope: this.scope,
      getItems: (query) => {
        const key = String(query || "").trim().toLowerCase();
        if (key && !found.has(key) && pending !== key) {
          pending = key;
          this.plugin
            .searchTickers(query)
            .then((results) => {
              found.set(key, results);
              if (String(tickerInput.value || "").trim().toLowerCase() === key) this.tickerSuggest.refresh();
            })
            .catch(() => found.set(key, []));
        }
        return (found.get(key) || []).slice(0, 8).map((result) => ({
          value: result.symbol,
          label: result.symbol,
          kind: result.exchange || "",
          hint: result.name || "",
        }));
      },
      onChoose: (item) => {
        currencySelect.value = core.tickerMarket(item.value) === "US" ? "USD" : "AUD";
        syncCurrency();
      },
    });
    contentEl.createEl("p", { cls: "finance-edit-hint", text: "ASX tickers end in .AX; US tickers are written plain." });

    const unitsRow = contentEl.createDiv({ cls: "finance-edit-row" });
    const unitsLabel = unitsRow.createEl("label", { text: "Units" });
    const unitsInput = unitsRow.createEl("input", { type: "number", attr: { step: "any", inputmode: "decimal", "aria-label": "Units" } });
    const priceRow = row("Price");
    const priceInput = priceRow.createEl("input", { type: "number", attr: { step: "any", inputmode: "decimal", "aria-label": "Price" } });
    const feesRow = row("Brokerage");
    const feesInput = feesRow.createEl("input", { type: "number", attr: { step: "0.01", inputmode: "decimal", "aria-label": "Brokerage" } });

    const currencySelect = row("Currency").createEl("select", { attr: { "aria-label": "Currency" } });
    for (const code of ["AUD", "USD", "NZD", "GBP", "EUR"]) currencySelect.createEl("option", { text: code, value: code });
    const audRow = row("AUD cost");
    const audInput = audRow.createEl("input", {
      type: "number",
      attr: { step: "0.01", inputmode: "decimal", "aria-label": "AUD cost" },
    });
    const audHint = contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "What actually left your account in dollars, brokerage included. Without it the cost is estimated at today's rate.",
    });

    const accountInput = row("Account").createEl("input", { type: "text", attr: { placeholder: "Pearler", "aria-label": "Account" } });
    const noteInput = row("Note").createEl("input", { type: "text", attr: { "aria-label": "Note" } });

    const syncCurrency = () => {
      const foreign = currencySelect.value !== "AUD";
      audRow.toggleClass("is-hidden", !foreign);
      audHint.toggleClass("is-hidden", !foreign);
    };
    const syncType = () => {
      const split = typeSelect.value === "split";
      priceRow.toggleClass("is-hidden", split);
      feesRow.toggleClass("is-hidden", split);
      unitsLabel.setText(split ? "Ratio" : "Units");
    };
    currencySelect.addEventListener("change", syncCurrency);
    typeSelect.addEventListener("change", syncType);
    syncCurrency();
    syncType();

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Log trade", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const trade = {
          type: typeSelect.value,
          date: core.parseIsoDate(dateInput.value),
          ticker: core.normalizeTicker(tickerInput.value),
          units: core.parseNumber(unitsInput.value),
          price: typeSelect.value === "split" ? null : core.parseNumber(priceInput.value),
          fees: core.parseNumber(feesInput.value) || 0,
          currency: currencySelect.value,
          audCost: currencySelect.value === "AUD" ? null : core.parseNumber(audInput.value) || null,
          account: accountInput.value.trim(),
          note: noteInput.value.trim(),
        };
        if (!trade.date || !trade.ticker) throw new Error("A trade needs a date and a ticker.");
        if (!(trade.units > 0)) throw new Error(trade.type === "split" ? "Give the split ratio, e.g. 2 for a 2-for-1." : "Give the number of units.");
        if (trade.type !== "split" && !(trade.price >= 0)) throw new Error("Give the price per unit.");
        await this.plugin.appendTrade(trade);
        new Notice(`Logged ${trade.type} of ${trade.units} ${trade.ticker}.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(error.message);
        save.disabled = false;
      }
    });
    window.setTimeout(() => tickerInput.focus(), 0);
  }

  onClose() {
    this.tickerSuggest?.destroy();
    this.contentEl.empty();
  }
}

// --- Finance hub ------------------------------------------------------------------
// What each hub tab shows. Almost all of it is the render code the blocks and
// the sidebar already use, given a fresh element and no source note.

const HUB_REVIEW_PERIODS = [
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
];

Object.assign(FinanceTrackerPlugin.prototype, {
  createHubView(leaf) {
    return new FinanceHubView(leaf, this);
  },

  openInsertBlock(editor, sourcePath = "") {
    const modal = new InsertBlockModal(this.app, this, editor, sourcePath);
    modal.open();
    return modal;
  },

  async activateHubView(tab = "") {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FINANCE_HUB_VIEW)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: FINANCE_HUB_VIEW, active: true, state: tab ? { tab } : {} });
    } else if (tab && typeof leaf.view?.showTab === "function") {
      await leaf.view.showTab(tab);
    }
    workspace.revealLeaf(leaf);
    return leaf;
  },

  async renderHubTab(tab, host, view) {
    switch (tab) {
      case "inbox":
        return this.renderHubInbox(host, view);
      case "budgets":
        return this.renderHubBudgets(host, view);
      case "bills":
        return this.renderRecurringBlock("", host.createDiv(), { sourcePath: "" });
      case "goals":
        return this.renderHubGoals(host, view);
      case "portfolio":
        return this.renderHubPortfolio(host, view);
      case "reviews":
        return this.renderHubReviews(host, view);
      default:
        return this.renderDailyBudgetCheckInto(host.createDiv(), core.todayIsoLocal(), "full", { inHub: true });
    }
  },

  // Bills that want attention now, bills still unclaimed, then the
  // categorisation inbox. Legacy vaults without bill notes get a pointer to the
  // Bills tab rather than a second copy of the old list.
  async hubBillsNeedingAttention(referenceDate = core.todayIsoLocal()) {
    const recurring = await this.detectRecurring(referenceDate);
    if (!recurring.billsMode) {
      const due = recurring.items.filter((item) => item.active !== false && (item.status === "overdue" || item.status === "due"));
      return { recurring, due, suggestions: [] };
    }
    const live = recurring.items.filter((item) => item.active);
    const due = live.filter((item) => ["overdue", "soon"].includes(this.billGroupFor(item, referenceDate)));
    const ignored = new Set(this.settings.ignoredBillSuggestions || []);
    const suggestions = (recurring.suggestions || []).filter((suggestion) => !ignored.has(suggestion.id));
    return { recurring, due, live, suggestions };
  },

  async countInboxItems() {
    const entries = await this.collectAllTransactions();
    const uncategorised = entries.filter((entry) => core.isUncategorisedEntry(entry)).length;
    const failed = typeof this.failedCaptureFiles === "function" ? this.failedCaptureFiles().length : 0;
    const bills = await this.hubBillsNeedingAttention();
    return uncategorised + failed + bills.due.length + bills.suggestions.length;
  },

  async renderHubInbox(host, view) {
    const today = core.todayIsoLocal();
    const currency = core.normalizeCurrency(this.settings.defaultCurrency);
    const rerender = () => view.refresh();
    const { recurring, due, live, suggestions } = await this.hubBillsNeedingAttention(today);

    if (due.length || suggestions.length) {
      const wrapper = host.createDiv({ cls: "finance-tracker-dashboard finance-bills finance-hub-inbox-bills" });
      if (due.length) {
        const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-group is-overdue" });
        section.createEl("h4", { text: `Bills due (${due.length})` });
        if (recurring.billsMode) {
          for (const item of due) this.renderBillRow(section, item, { currency, referenceDate: today, rerender, live });
        } else {
          for (const item of due) {
            renderRowTitle(section.createDiv({ cls: "finance-tracker-budget-card" }), item.label, core.formatCurrency(item.nextDueAmount || item.lastAmount, currency));
          }
          addAction(section.createDiv({ cls: "finance-tracker-header-actions" }), "Open bills", () => view.showTab("bills"), { opensModal: true });
        }
      }
      if (suggestions.length) {
        const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-bills-suggestions" });
        section.createEl("h4", { text: `Looks recurring (${suggestions.length})` });
        for (const suggestion of suggestions) this.renderBillSuggestion(section, suggestion, { currency, rerender, live });
      }
    }

    await this.renderCategorisationInboxInto(host.createDiv(), { title: "Uncategorised spending" });
  },

  async renderHubBudgets(host, view) {
    const budgets = await this.loadBudgets("default");
    const order = ["day", "week", "fortnight", "month", "bimonth", "quarter", "year"];
    const periods = Array.from(new Set(budgets.map((budget) => core.normalizeBudgetPeriod(budget.period)))).sort(
      (left, right) => order.indexOf(left) - order.indexOf(right)
    );

    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    if (!budgets.length) {
      addAction(toolbar, "Open budgets note", () => this.openDefaultBudgetNote(), { primary: true, errorPrefix: "Opening budgets note" });
      host.createDiv({
        cls: "finance-tracker-empty",
        text: "No budgets yet. Add rows to the budgets note (category, limit, period) and they show up here.",
      });
      return;
    }

    const fallback = core.normalizeBudgetPeriod(this.settings.budgetCheckPeriod || "week");
    const period = periods.includes(view.budgetPeriod) ? view.budgetPeriod : periods.includes(fallback) ? fallback : periods[0];
    this.renderHubChips(toolbar, periods.map((key) => [key, core.titleCaseSegment(key)]), period, (key) => {
      view.budgetPeriod = key;
      view.app.workspace?.requestSaveLayout?.();
      return view.render({ resetScroll: true });
    });

    await this.renderDashboard(
      [`period: ${period}`, `title: This ${period}`, "show: summary, budgets, uncategorised, trend, categories"].join("\n"),
      host.createDiv(),
      { sourcePath: "" }
    );
  },

  async renderHubGoals(host, view) {
    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    addAction(toolbar, "Withdraw", () => this.openContribute({ mode: "withdraw", onDone: () => view.refresh() }), { opensModal: true });
    addAction(toolbar, "New goal", () => this.openNewGoal(async () => view.refresh()), {
      opensModal: true,
    });
    addAction(toolbar, this.settings.tripModeActive ? "End trip mode" : "Start trip mode", async () => {
      if (this.settings.tripModeActive) await this.endTrip();
      else await this.startTrip();
      await view.refresh();
    }, { errorPrefix: "Trip mode" });

    await this.renderGoalPrompts(host, { rerender: () => view.refresh() });
    await this.renderGoalsBlock("", host.createDiv(), { sourcePath: "" });

    const today = core.todayIsoLocal();
    const trips = (await this.collectSavingsGoalDefinitions()).filter((goal) => goal.goalType === "holiday");
    if (!trips.length) return;
    const wrapper = host.createDiv({ cls: "finance-tracker-dashboard" });
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-hub-trips" });
    section.createEl("h4", { text: "Trips" });
    const activePath = this.settings.tripModeActive ? this.settings.activeTripGoalPath || "" : "";
    for (const trip of trips) {
      const row = section.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(row, trip.goalName, trip.file?.path === activePath ? "Trip mode on" : "");
      row.createDiv({ cls: "finance-tracker-budget-meta", text: this.describeTripTiming(trip, today) });
      const actions = row.createDiv({ cls: "finance-tracker-header-actions" });
      if (trip.file) {
        addAction(actions, "Open note", () => this.app.workspace.getLeaf(false).openFile(trip.file), {
          errorPrefix: "Opening the trip",
        });
      }
    }
  },

  describeTripTiming(trip, today = core.todayIsoLocal()) {
    const start = core.parseIsoDate(trip.startDate || "");
    const end = core.parseIsoDate(trip.endDate || "");
    if (!start) return "No dates yet";
    if (today < start) {
      const days = core.daysBetweenInclusive(today, start) - 1;
      return `Starts ${start} · in ${days} day${days === 1 ? "" : "s"}`;
    }
    if (!end || today <= end) return `On now · since ${start}${end ? ` · until ${end}` : ""}`;
    return `Finished ${end}`;
  },

  async renderHubPortfolio(host) {
    // Opening the note creates it, and an empty portfolio already offers Log
    // trade, so the button only appears once there is a note to open.
    if (this.app.vault.getAbstractFileByPath(this.getPortfolioNotePath())) {
      const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
      addAction(toolbar, "Open portfolio note", () => this.openPortfolioNote(), { errorPrefix: "Opening the portfolio" });
    }
    await this.renderPortfolioBlock("", host.createDiv(), { sourcePath: this.getPortfolioNotePath() });
  },

  async renderHubReviews(host, view) {
    const today = core.todayIsoLocal();
    const period = HUB_REVIEW_PERIODS.some(([key]) => key === view.reviewPeriod) ? view.reviewPeriod : "week";
    const anchor = core.parseIsoDate(view.reviewAnchor) || today;
    const weekStartsOn = this.settings.weekStartsOn;
    const range = core.toPeriodRange({ period, referenceDate: anchor, weekStartsOn });
    const isCurrent = core.isDateInRange(today, range);

    const toolbar = host.createDiv({ cls: "finance-hub-toolbar" });
    this.renderHubChips(toolbar, HUB_REVIEW_PERIODS, period, (key) => {
      view.reviewPeriod = key;
      view.app.workspace?.requestSaveLayout?.();
      return view.render({ resetScroll: true });
    });

    const nav = toolbar.createDiv({ cls: "finance-hub-review-nav" });
    const goTo = (anchorDate) => {
      view.reviewAnchor = anchorDate;
      return view.render({ resetScroll: true });
    };
    addAction(nav, "‹", () => goTo(core.previousPeriodRange(range, { weekStartsOn }).start), { tooltip: `Previous ${period}` });
    const current = addAction(nav, `This ${period}`, () => goTo(""));
    if (isCurrent) current.disabled = true;
    addAction(nav, "›", () => goTo(core.nextPeriodRange(range, { weekStartsOn }).start), { tooltip: `Next ${period}` });

    addAction(toolbar, "Copy as text", async () => {
      const lines = await this.buildPeriodReview(period, range.start);
      const text = `${lines.join("\n")}\n`;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        new Notice("Review copied. Paste it into a note to keep it.");
      } else {
        new Notice("Copying isn't available here. Use Insert weekly review in a note instead.");
      }
    }, { errorPrefix: "Copying the review", tooltip: "Copy a frozen snapshot of this review as markdown" });

    const title = core.describePeriodTitle(range);
    await this.renderDashboard([`period: ${period}`, `title: ${title}`, "show: all"].join("\n"), host.createDiv(), {
      sourcePath: "",
      referenceDate: range.start,
    });
  },

  renderHubChips(host, options, selected, onSelect) {
    const chips = host.createDiv({ cls: "finance-hub-chips", attr: { role: "group" } });
    for (const [key, label] of options) {
      const chip = chips.createEl("button", { cls: "finance-hub-chip", text: label, attr: { "aria-pressed": String(key === selected) } });
      if (key === selected) chip.addClass("is-active");
      chip.addEventListener("click", () => (key !== selected ? onSelect(key) : undefined));
    }
    return chips;
  },

  // "Insert weekly review" / "Insert monthly review": the period is the note's
  // own — a review inserted into W19 covers week 19, not whatever week it is
  // when you get round to writing it up.
  async insertPeriodReview(editor, view, period) {
    const referenceDate = this.getReferenceDateForSource(view?.file?.path || "");
    const lines = await this.buildPeriodReview(period, referenceDate);
    editor.replaceSelection(`${lines.join("\n")}\n`);
  },
});
// --- Dashboard sections -----------------------------------------------------------
// The review sections of `finance-dashboard`. Each one renders nothing when it
// has nothing to say, so a quiet week doesn't fill up with empty cards. The
// numbers come from finance-core; these only lay them out.

function periodWordFor(range) {
  const period = String(range?.period || "").toLowerCase();
  return ["day", "week", "fortnight", "month", "quarter", "year"].includes(period) ? period : "period";
}

function formatSignedChange(delta, currency) {
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return `${arrow} ${core.formatCurrency(Math.abs(delta), currency)}`;
}

Object.assign(FinanceTrackerPlugin.prototype, {
  renderIncomeSection(wrapper, allEntries, currency, range, goalKeys = []) {
    const summary = core.summarizeIncomeAndSavings(allEntries, { goalKeys });
    const word = periodWordFor(range);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-income" });
    section.createEl("h4", { text: "Income and savings" });
    if (!summary.incomeCount) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `No income logged this ${word}, so there's no savings rate. Log pay as #log/income/salary to see one.`,
      });
      return;
    }
    const rate = Math.round(summary.savingsRate * 100);
    renderStatCards(section, [
      { label: "Income", value: core.formatCurrency(summary.income, currency) },
      { label: "Spent", value: core.formatCurrency(summary.spending, currency) },
      {
        label: summary.saved >= 0 ? "Saved" : "Overspent",
        value: core.formatCurrency(Math.abs(summary.saved), currency),
        cls: summary.saved < 0 ? "is-over" : "",
      },
      { label: "Savings rate", value: `${rate}%`, cls: rate < 0 ? "is-over" : "" },
    ]);
    if (summary.sources.length > 1) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `From ${summary.sources.map((row) => `${row.label} ${core.formatCurrency(row.total, currency)}`).join(" · ")}`,
      });
    }
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "Goal contributions, settle-ups and trip spending are transfers, so they're left out.",
    });
  },

  renderUncategorisedCallout(wrapper, entries, currency, range) {
    const { count, total } = core.summarizeUncategorised(entries);
    if (!count) return;
    const callout = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-callout" });
    callout.createDiv({
      cls: "finance-dashboard-callout-text",
      text: `${count} entr${count === 1 ? "y" : "ies"} this ${periodWordFor(range)} (${core.formatCurrency(total, currency)}) ${
        count === 1 ? "has" : "have"
      } no category yet, so ${count === 1 ? "it's" : "they're"} counted as Uncategorized.`,
    });
    addAction(callout.createDiv({ cls: "finance-tracker-header-actions" }), "Open inbox", () => this.activateHubView("inbox"), {
      primary: true,
      opensModal: true,
    });
  },

  renderCategoryChanges(wrapper, entries, previousEntries, currency, range) {
    const { rows, previousTotal } = core.compareCategoryTotals(entries, previousEntries, { limit: 6 });
    // Against an empty previous period every category is "new", which says
    // nothing.
    if (!rows.length || !(previousTotal > 0)) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-changes" });
    section.createEl("h4", { text: `Change vs previous ${periodWordFor(range)}` });
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const row of rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      item.addClass(row.delta > 0 ? "is-up" : "is-down");
      renderRowTitle(item, row.label, formatSignedChange(row.delta, currency));
      const pct = row.pct === null ? "new" : `${row.pct >= 0 ? "+" : ""}${row.pct}%`;
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${core.formatCurrency(row.previous, currency)} → ${core.formatCurrency(row.current, currency)} (${pct})`,
      });
    }
  },

  renderTopMerchants(wrapper, entries, currency) {
    const result = core.summarizeTopMerchants(entries, { limit: 5 });
    if (!result.rows.length) return;
    const spend = entries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-merchants" });
    section.createEl("h4", { text: "Top merchants" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const row of result.rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(item, row.label, core.formatCurrency(row.total, currency));
      const share = spend > 0 ? Math.round((row.total / spend) * 100) : 0;
      item.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${row.count} visit${row.count === 1 ? "" : "s"} · ${share}% of spending`,
      });
    }
    if (result.unnamedCount) {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${result.unnamedCount} entr${result.unnamedCount === 1 ? "y" : "ies"} (${core.formatCurrency(result.unnamedTotal, currency)}) ${
          result.unnamedCount === 1 ? "has" : "have"
        } no merchant.`,
      });
    }
  },

  renderLargestTransactions(wrapper, entries, currency) {
    const rows = core.largestTransactions(entries, { limit: 5 });
    if (!rows.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-largest" });
    section.createEl("h4", { text: "Largest transactions" });
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const { entry, spend } of rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card is-clickable" });
      const name = core.cleanMerchantDisplay(entry.merchant || "") || entry.categoryDisplay || core.displayCategoryPath(entry.category || "uncategorized");
      renderRowTitle(item, name, core.formatCurrency(spend, currency));
      const bits = [entry.date, core.displayCategoryPath(entry.category || "uncategorized")];
      if (spend < Number(entry.amount || 0)) bits.push(`your share of ${core.formatCurrency(entry.amount, currency)}`);
      item.createDiv({ cls: "finance-tracker-budget-meta", text: bits.filter(Boolean).join(" · ") });
      item.setAttribute("aria-label", "Edit this transaction");
      item.addEventListener("click", () => this.openEditTransaction(entry));
    }
  },

  // What was paid in the period, and — for a period that isn't over yet — what
  // is still to come in it and in the one after. A past week only gets the
  // first part: "due next week" for a week in May is history, not a plan.
  async renderBillsForPeriod(wrapper, allEntries, currency, range) {
    const today = core.todayIsoLocal();
    const prefix = core.normalizeCategoryPath(this.settings.recurringTagPrefix || "subscriptions") || "subscriptions";
    const recurring = await this.detectRecurring(today, prefix);
    const labels = new Map(recurring.items.map((item) => [core.normalizeCategoryPath(item.category || ""), item.label]));
    const paid = core.summarizeBillPayments(allEntries, { prefix, labels });

    let stillDue = [];
    let dueNext = [];
    let nextRange = null;
    if (range.end >= today) {
      nextRange = core.nextPeriodRange(range, { weekStartsOn: this.settings.weekStartsOn });
      const from = range.start > today ? range.start : today;
      const { occurrences } = core.sumRecurringDueWithin(recurring, from, nextRange.end);
      stillDue = occurrences.filter((occurrence) => occurrence.date <= range.end);
      dueNext = occurrences.filter((occurrence) => occurrence.date > range.end);
    }
    if (!paid.count && !stillDue.length && !dueNext.length) return;

    const word = periodWordFor(range);
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-bills" });
    section.createEl("h4", { text: "Bills" });

    const group = (title, rows) => {
      section.createDiv({ cls: "finance-dashboard-subheading", text: title });
      const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
      for (const row of rows) {
        const item = list.createDiv({ cls: "finance-tracker-budget-card" });
        renderRowTitle(item, row.label, core.formatCurrency(row.amount, currency));
        if (row.meta) item.createDiv({ cls: "finance-tracker-budget-meta", text: row.meta });
      }
    };

    if (paid.count) {
      group(
        `Paid this ${word}: ${core.formatCurrency(paid.total, currency)}`,
        paid.rows.map((row) => ({
          label: row.label,
          amount: row.total,
          meta: row.count > 1 ? `${row.count} payments` : row.dates[0] || "",
        }))
      );
    }
    const occurrenceRows = (list) => list.map((occurrence) => ({ label: occurrence.label, amount: occurrence.amount, meta: occurrence.date }));
    if (stillDue.length) group(`Still due this ${word}`, occurrenceRows(stillDue));
    if (dueNext.length) {
      const total = core.roundCurrencyAmount(dueNext.reduce((sum, occurrence) => sum + Number(occurrence.amount || 0), 0));
      group(`Due next ${word}: ${core.formatCurrency(total, currency)}`, occurrenceRows(dueNext));
    }
  },

  renderTripSpendSection(wrapper, allEntries, currency) {
    const trips = core.summarizeTripSpend(allEntries);
    if (!trips.rows.length) return;
    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-trips" });
    section.createEl("h4", { text: `Trip spending: ${core.formatCurrency(trips.total, currency)}` });
    section.createDiv({
      cls: "finance-tracker-budget-meta",
      text: "Paid from trip savings, so it isn't in the totals above.",
    });
    const list = section.createDiv({ cls: "finance-tracker-budget-list finance-dashboard-rows" });
    for (const trip of trips.rows) {
      const item = list.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(item, trip.label, core.formatCurrency(trip.total, currency));
      item.createDiv({ cls: "finance-tracker-budget-meta", text: `${trip.count} entr${trip.count === 1 ? "y" : "ies"}` });
    }
  },

  // Money moved into and out of shares during the period, dividends received,
  // and — when there is price history for both ends — how the value changed.
  // Never fetches: a dashboard in a weekly note is not a reason to call out.
  async renderPortfolioChange(wrapper, allEntries, currency, range) {
    const portfolio = await this.loadPortfolio();
    if (!portfolio?.exists || !portfolio.trades?.length) return;
    const today = core.todayIsoLocal();
    const model = await this.buildPortfolioModel(range.end < today ? range.end : today);
    const fx = this.portfolioFx(portfolio);
    const audValue = (trade, sign) => {
      if (Number.isFinite(trade.audCost)) return trade.audCost;
      const rate = trade.currency === "AUD" ? 1 : Number(fx[trade.currency]) || 0;
      return (trade.units * trade.price + sign * (trade.fees || 0)) * rate;
    };
    const inRange = portfolio.trades.filter((trade) => core.isDateInRange(trade.date, range));
    const bought = core.roundCurrencyAmount(inRange.filter((trade) => trade.type === "buy").reduce((sum, trade) => sum + audValue(trade, 1), 0));
    const sold = core.roundCurrencyAmount(inRange.filter((trade) => trade.type === "sell").reduce((sum, trade) => sum + audValue(trade, -1), 0));
    const dividends = core.roundCurrencyAmount(
      allEntries
        .filter((entry) => entry.entryType === "income" && core.normalizeCategoryPath(entry.category || "").startsWith("dividend/"))
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );

    const series = model.series || [];
    const pointAt = (date) => series.filter((point) => point.date <= date).pop() || null;
    const startPoint = pointAt(core.addDays(range.start, -1));
    const endPoint = pointAt(range.end);

    const cards = [];
    if (core.isDateInRange(today, range) && model.value?.totals?.valueAud > 0) {
      cards.push({ label: "Value now", value: core.formatCurrency(model.value.totals.valueAud, currency) });
    }
    if (startPoint?.complete && endPoint?.complete && startPoint.date !== endPoint.date) {
      const change = core.roundCurrencyAmount(endPoint.valueAud - startPoint.valueAud);
      cards.push({
        label: "Value change",
        value: formatSignedChange(change, currency),
        hint: bought || sold ? "includes buying and selling" : "",
      });
    }
    if (bought) cards.push({ label: "Bought", value: core.formatCurrency(bought, currency) });
    if (sold) cards.push({ label: "Sold", value: core.formatCurrency(sold, currency) });
    if (dividends) cards.push({ label: "Dividends", value: core.formatCurrency(dividends, currency) });

    const section = wrapper.createDiv({ cls: "finance-tracker-chart-card finance-dashboard-portfolio" });
    section.createEl("h4", { text: "Portfolio" });
    if (cards.length) {
      renderStatCards(section, cards);
    } else {
      section.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `No trades or dividends this ${periodWordFor(range)}, and no price history to compare values with.`,
      });
    }
    section.createDiv({ cls: "finance-tracker-budget-meta", text: "For information only, not financial advice." });
  },
});
class DailyBudgetView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DAILY_BUDGET_VIEW; }
  getDisplayText() { return "Daily budget"; }
  getIcon() { return "coins"; }

  // Note changes reach this view through the plugin's single, debounced
  // refresh (notifyFinanceDataChanged), shared with the hub and open blocks.
  async onOpen() {
    await this.refresh();
  }

  async onClose() {}

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

// The inbox is a view rather than a modal: it is somewhere you work through a
// backlog, and a modal cannot stay open beside the notes it is about. It is now
// the hub's Inbox tab; this standalone view is kept registered only so a
// workspace saved with it open still loads.
class FinanceInboxView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return FINANCE_INBOX_VIEW; }
  getDisplayText() { return "Categorisation inbox"; }
  getIcon() { return "inbox"; }

  async onOpen() {
    await this.refresh();
  }

  async onClose() {}

  async refresh() {
    try {
      await this.plugin.renderCategorisationInboxInto(this.contentEl);
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: `The inbox failed to render: ${error?.message || error}`,
      });
    }
  }
}

// The finance hub: one place for everything beyond logging. Each tab renders
// what a code block or the sidebar already renders, so a fix to one shows up in
// both, and the blocks keep working inside notes.
class FinanceHubView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = "today";
    this.budgetPeriod = "";
    this.reviewPeriod = "week";
    this.reviewAnchor = "";
    this._renderId = 0;
    this._opened = false;
  }

  getViewType() { return FINANCE_HUB_VIEW; }
  getDisplayText() { return "Finance"; }
  getIcon() { return "wallet"; }

  getState() {
    const base = typeof super.getState === "function" ? super.getState() : {};
    return { ...base, tab: this.tab, reviewPeriod: this.reviewPeriod, budgetPeriod: this.budgetPeriod };
  }

  async setState(state, result) {
    if (state && FINANCE_HUB_TABS.some((tab) => tab.id === state.tab)) this.tab = state.tab;
    if (state?.reviewPeriod) this.reviewPeriod = state.reviewPeriod;
    if (typeof state?.budgetPeriod === "string") this.budgetPeriod = state.budgetPeriod;
    if (typeof super.setState === "function") await super.setState(state, result);
    if (this._opened) await this.render({ resetScroll: true });
  }

  async onOpen() {
    this._opened = true;
    await this.render();
  }

  async onClose() {
    this._opened = false;
    this._renderId += 1;
  }

  async showTab(id) {
    if (!FINANCE_HUB_TABS.some((tab) => tab.id === id)) return;
    this.tab = id;
    this.app.workspace?.requestSaveLayout?.();
    await this.render({ resetScroll: true });
  }

  // Called when notes change. Typing into a field in the hub (a category
  // search, say) must not be wiped by a refresh, so that waits for focus to
  // leave.
  refresh() {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || "");
    if (typing && typeof this.contentEl.contains === "function" && this.contentEl.contains(active)) {
      if (!this._waitingForBlur) {
        this._waitingForBlur = true;
        active.addEventListener(
          "blur",
          () => {
            this._waitingForBlur = false;
            window.setTimeout(() => this.refresh(), 0);
          },
          { once: true }
        );
      }
      return Promise.resolve();
    }
    return this.render();
  }

  async render(options = {}) {
    const renderId = ++this._renderId;
    const root = this.contentEl;
    const scrollTop = options.resetScroll ? 0 : Number(root.scrollTop) || 0;
    root.empty();
    root.addClass("finance-hub");

    const nav = root.createDiv({ cls: "finance-hub-tabs", attr: { role: "tablist" } });
    let inboxButton = null;
    for (const tab of FINANCE_HUB_TABS) {
      const selected = tab.id === this.tab;
      const button = nav.createEl("button", {
        cls: "finance-hub-tab",
        text: tab.label,
        attr: { role: "tab", "aria-selected": String(selected), "data-tab": tab.id },
      });
      if (selected) button.addClass("is-active");
      if (tab.id === "inbox") inboxButton = button;
      button.addEventListener("click", () => this.showTab(tab.id));
    }

    const body = root.createDiv({ cls: "finance-hub-body" });
    try {
      await this.plugin.renderHubTab(this.tab, body, this);
    } catch (error) {
      if (renderId !== this._renderId) return;
      body.empty();
      body.createDiv({ cls: "finance-tracker-empty", text: `This tab failed to render: ${error?.message || error}` });
    }
    if (renderId !== this._renderId) return;
    if (scrollTop) root.scrollTop = scrollTop;

    // The badge is worked out after the tab so it never holds the tab up.
    try {
      const count = await this.plugin.countInboxItems();
      if (renderId === this._renderId && count > 0 && inboxButton) {
        inboxButton.createSpan({ cls: "finance-hub-badge", text: count > 99 ? "99+" : String(count) });
        inboxButton.setAttribute("aria-label", `Inbox, ${count} waiting`);
      }
    } catch (_error) {
      // A missing badge is not worth an error on top of the tab.
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
      attr: { placeholder: "12 nobu restaurants   ·   58 USD : 83.64 obsidian sync   ·   24 dinner split=2   ·   4.50 coffee @yesterday" },
    });

    // Suggestions derived from logging history: categories, merchants, people.
    // Arrows cycle, Tab accepts, Esc closes; Enter always submits the entry.
    const known = await this.plugin.collectKnownSuggestions();
    this._known = known;

    // Fingerprints of what is already on this date, so a double-tap on the same
    // purchase can be flagged before it becomes a second bullet.
    try {
      const sameDay = await this.plugin.collectTransactionsForRange({ start: this.date, end: this.date });
      this._todayFingerprints = new Set(sameDay.map((entry) => core.transactionFingerprint(entry)));
    } catch (_error) {
      this._todayFingerprints = new Set();
    }
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
        const parsedNow = core.parseQuickAddInput(input.value, known.categories, { defaultCurrency: this.plugin.settings.defaultCurrency });
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

    const duplicateWarning = contentEl.createDiv({ cls: "finance-quick-add-duplicate is-hidden" });

    const buttons = contentEl.createDiv({ cls: "finance-quick-add-buttons" });
    const keepOpenLabel = buttons.createEl("label", { cls: "finance-quick-add-keep" });
    const keepOpen = keepOpenLabel.createEl("input", { type: "checkbox" });
    keepOpenLabel.appendText(" Keep open for next entry");
    const submit = buttons.createEl("button", { text: "Add", cls: "mod-cta" });

    // The preview used to say "Uncategorized" while the capture path went on to
    // fill in a learned category a moment later — so the one screen that could
    // have shown the guess was the one place that denied there was one.
    let suggestedFor = null;
    let suggestion = { category: "", source: "" };
    const ensureSuggestion = async (merchant) => {
      const key = String(merchant || "").trim().toLowerCase();
      if (key === suggestedFor) return;
      suggestedFor = key;
      suggestion = key ? await this.plugin.suggestCategoryForMerchant(merchant) : { category: "", source: "" };
      update();
    };

    const parseCurrent = () => {
      const parsed = core.parseQuickAddInput(input.value, known.categories, { defaultCurrency: this.plugin.settings.defaultCurrency });
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
      const home = this.plugin.settings.defaultCurrency;

      // A foreign amount on its own cannot be converted without a stored rate,
      // and guessing one would be worse than asking. Say which half is missing.
      if (parsed.needsConvertedAmount) {
        preview.setText(
          `${core.formatCurrencyWithCode(parsed.originalAmount, parsed.originalCurrency)} — now add what it cost in ${home}, e.g. "${parsed.originalAmount} ${parsed.originalCurrency} : 83.64"`
        );
        preview.removeClass("is-ready");
        submit.disabled = true;
        return;
      }
      if (!Number.isFinite(parsed.amount)) {
        preview.setText("Type an amount to begin…");
        preview.removeClass("is-ready");
        submit.disabled = true;
        return;
      }

      if (!parsed.category) ensureSuggestion(parsed.merchant);
      const guessed = !parsed.category && suggestion.category ? suggestion.category : "";
      const category = parsed.category || guessed || "uncategorized";
      const bits = [core.formatCurrency(parsed.amount, home)];
      if (parsed.originalCurrency) {
        bits.push(
          `${core.formatCurrencyWithCode(parsed.originalAmount, parsed.originalCurrency)}${
            parsed.impliedRate ? ` @ ${parsed.impliedRate}` : ""
          }`
        );
      }
      bits.push(
        guessed
          ? `${core.displayCategoryPath(category)} (${this.plugin.describeSuggestionSource(suggestion.source)})`
          : core.displayCategoryPath(category)
      );
      if (parsed.merchant) bits.push(parsed.merchant);
      const owedPreview = core.buildOwedSharesFromTokens(parsed.amount, parsed.splitCount, parsed.owedTokens || []);
      if (owedPreview.length) {
        bits.push(`my share ${core.formatCurrency(parsed.amount - owedPreview.reduce((sum, item) => sum + item.amount, 0), home)}`);
      }
      bits.push(date);
      preview.setText(bits.join("  ·  "));
      preview.addClass("is-ready");
      submit.disabled = false;

      // Same amount, same merchant, same day, already logged — almost always a
      // double-tap rather than a real second purchase.
      const fingerprint = core.transactionFingerprint({ date, amount: parsed.amount, merchant: parsed.merchant });
      const isDuplicate = Boolean(parsed.merchant) && this._todayFingerprints?.has(fingerprint);
      duplicateWarning.toggleClass("is-hidden", !isDuplicate);
      if (isDuplicate) {
        duplicateWarning.setText(`Already logged today: ${core.formatCurrency(parsed.amount, home)} at ${parsed.merchant}. Add anyway?`);
      }
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
            originalAmount: parsed.originalAmount,
            originalCurrency: parsed.originalCurrency,
            originalRateKey: parsed.originalCurrency,
            // Both amounts were typed, so no stored rate is involved and trip
            // mode must not re-convert this entry.
            fxProvided: Boolean(parsed.originalCurrency),
            owedTokens: parsed.owedTokens || [],
            splitCount: parsed.splitCount,
            source: "quick-add",
          },
          // `force` because this modal does its own duplicate warning above and
          // the user has just answered it by pressing the button. A deliberate
          // human action is never silently dropped by the cross-method check.
          { notify: true, method: "quick-add", force: true }
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
        if (event.key === "Tab" || event.key === "Enter") {
          // First Enter (like Tab) accepts the highlighted suggestion; once the
          // popup has nothing open, a second Enter falls through below and
          // submits the entry instead.
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

// Correcting one entry. This was the weakest screen in the plugin: a plain text
// box for the category with twelve flat chips beside it, no way to change the
// date, and no way to say "and the other four from this shop as well" — so the
// backlog was fixed one line at a time, or not at all.
class EditTransactionModal extends Modal {
  constructor(app, plugin, entry, options = {}) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
    this.onSaved = options.onSaved;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Edit transaction" });

    const entry = this.entry;
    const currency = core.normalizeCurrency(entry.currency || this.plugin.settings.defaultCurrency);
    const known = await this.plugin.collectKnownSuggestions();
    const siblings = await this.plugin.findSiblingUncategorised(entry);

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", {
      type: "number",
      // A phone keyboard with a decimal point on it.
      attr: { step: "0.01", inputmode: "decimal" },
    });
    amountInput.value = String(entry.amount ?? "");

    const dateRow = contentEl.createDiv({ cls: "finance-edit-row" });
    dateRow.createEl("label", { text: "Date" });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = entry.date || core.todayIsoLocal();
    const dateHint = contentEl.createEl("p", { cls: "finance-edit-hint", text: "" });
    const updateDateHint = () => {
      const next = core.parseIsoDate(dateInput.value);
      dateHint.setText(
        next && next !== entry.date
          ? `The entry moves to ${next}'s note, and both totals are rewritten.`
          : "Changing this moves the entry to that day's note."
      );
    };
    dateInput.addEventListener("change", updateDateHint);
    updateDateHint();

    contentEl.createEl("label", { cls: "finance-edit-label", text: "Category" });
    const picker = new CategoryPicker(contentEl, {
      categories: known.categories,
      value: entry.category === "uncategorized" ? "" : entry.category,
      scope: this.scope,
    });

    const merchantRow = contentEl.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text" });
    merchantInput.value = entry.merchant || "";
    const merchantSuggest = new FinanceSuggest(merchantInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        return known.merchants
          .filter((merchant) => !needle || merchant.name.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((merchant) => ({
            value: merchant.name,
            label: merchant.name,
            kind: "merchant",
            hint: merchant.category ? core.displayCategoryPath(merchant.category) : "",
          }));
      },
      onChoose: (item) => {
        // Accepting a known merchant fills in how it was last filed, unless a
        // category has already been chosen here.
        if (!picker.getValue() && item.hint) picker.setValue(core.normalizeCategoryPath(item.hint));
      },
    });

    let applySiblings = null;
    if (siblings.length) {
      const label = contentEl.createEl("label", { cls: "finance-edit-remember" });
      applySiblings = label.createEl("input", { type: "checkbox" });
      applySiblings.checked = true;
      label.appendText(
        ` Apply to ${siblings.length} other uncategorised entr${siblings.length === 1 ? "y" : "ies"} from this merchant`
      );
    }

    // Ticked by default, because remembering is almost always right — except
    // where this shop has already been filed two different ways on purpose.
    const conflicted = await this.plugin.merchantHasConflictingHistory(entry.merchant);
    const rememberLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const rememberCheckbox = rememberLabel.createEl("input", { type: "checkbox" });
    rememberCheckbox.checked = !conflicted;
    rememberLabel.appendText(
      conflicted
        ? " Remember this merchant → category (you have filed it more than one way)"
        : " Remember this merchant → category"
    );

    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: `Logged as ${core.formatCurrency(entry.amount, currency)} on ${entry.date} in ${String(entry.filePath || "").split("/").pop()}.`,
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const deleteButton = buttons.createEl("button", { text: "Delete", cls: "mod-warning" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const category = picker.getValue() || "uncategorized";
        const merchant = merchantInput.value.trim();
        const patch = { amount: core.parseNumber(amountInput.value), category, merchant };
        const nextDate = core.parseIsoDate(dateInput.value);

        if (nextDate && nextDate !== entry.date) {
          await this.plugin.moveTransactionEntry(entry, nextDate, patch);
        } else {
          await this.plugin.updateTransactionEntry(entry, patch);
        }

        let alsoFiled = 0;
        if (applySiblings?.checked && category !== "uncategorized") {
          alsoFiled = await this.plugin.applyCategoryToEntries(siblings, category);
        }
        if (rememberCheckbox.checked && merchant && category !== "uncategorized") {
          await this.plugin.rememberMerchantCategory(merchant, category);
        }

        new Notice(alsoFiled ? `Updated, and filed ${alsoFiled} more from this merchant.` : "Transaction updated");
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;
      try {
        await this.plugin.deleteTransactionEntry(entry);
        new Notice("Transaction deleted");
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Delete failed: ${error.message}`);
        deleteButton.disabled = false;
      }
    });

    this._suggests = [merchantSuggest, picker];
  }

  onClose() {
    for (const component of this._suggests || []) component.destroy?.();
    this.contentEl.empty();
  }
}

// Renaming a category is rarely the whole story. Bare "transport" in a real
// vault turns out to be six Translink trips, five rideshares, three scooter
// hires and one car park — one name covering four things, and the merchant is
// what tells them apart. So this asks per merchant, with an "everything" row for
// the plain rename case.
class RecategoriseModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.category = core.normalizeCategoryPath(options.category || "");
    this.rows = [];
  }

  categoryInput(host, value, onDirty) {
    const wrapper = host.createDiv({ cls: "finance-recategorise-input" });
    const input = wrapper.createEl("input", { type: "text", attr: { placeholder: "food/takeaway", "aria-label": "New category" } });
    input.value = value;
    new FinanceSuggest(input, {
      scope: this.scope,
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        const out = this.known.categories
          .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
          .slice(0, 8)
          .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
        if (needle && !this.known.categories.includes(needle)) {
          out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
        }
        return out;
      },
      onChoose: () => onDirty?.(),
    });
    input.addEventListener("change", () => onDirty?.());
    return input;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    // One class per argument: addClass goes to classList.add, which rejects a
    // string with a space in it — and the throw happens before anything renders,
    // leaving an empty modal.
    contentEl.addClass("finance-edit", "finance-recategorise");
    // Merchant rows carry a name, an amount, a count and a target box each; at
    // Obsidian's default modal width they were squeezed into two lines apiece.
    this.modalEl?.addClass("finance-wide-modal");
    contentEl.createEl("h3", { text: "Rename or split a category" });
    this.known = await this.plugin.collectKnownSuggestions();

    const row = contentEl.createDiv({ cls: "finance-edit-row" });
    row.createEl("label", { text: "Category" });
    const input = row.createEl("input", { type: "text", attr: { placeholder: "transport", "aria-label": "Category to change" } });
    input.value = this.category;
    new FinanceSuggest(input, {
      scope: this.scope,
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        return this.known.categories
          .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
          .slice(0, 8)
          .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
      },
      onChoose: (item) => {
        this.category = item.value;
        this.renderBreakdown();
      },
    });
    input.addEventListener("change", () => {
      this.category = core.normalizeCategoryPath(input.value);
      this.renderBreakdown();
    });

    this.body = contentEl.createDiv({ cls: "finance-recategorise-body" });
    this.footer = contentEl.createDiv({ cls: "finance-edit-buttons" });
    if (this.category) await this.renderBreakdown();
  }

  async renderBreakdown() {
    this.body.empty();
    this.footer.empty();
    this.rows = [];
    if (!this.category) return;

    const currency = core.normalizeCurrency(this.plugin.settings.defaultCurrency);
    const { entries, groups } = await this.plugin.buildCategoryBreakdown(this.category);
    if (!entries.length) {
      this.body.createDiv({
        cls: "finance-tracker-empty",
        text: `Nothing is filed under ${core.displayCategoryPath(this.category)}.`,
      });
      return;
    }

    const total = core.roundCurrencyAmount(entries.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0));
    this.body.createEl("p", {
      cls: "finance-edit-hint",
      text: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${core.formatCurrency(total, currency)} · ${groups.length} merchant${groups.length === 1 ? "" : "s"}. Change the top row to rename the lot, or a single row to split that merchant off.`,
    });

    const everything = this.body.createDiv({ cls: "finance-tracker-budget-card" });
    renderRowTitle(everything, "Everything", core.formatCurrency(total, currency));
    this.allInput = this.categoryInput(everything, this.category, () => {
      // Rows the user has not touched follow the top row.
      for (const entry of this.rows) {
        if (!entry.dirty) entry.input.value = this.allInput.value;
      }
    });

    for (const group of groups) {
      const card = this.body.createDiv({ cls: "finance-tracker-budget-card" });
      renderRowTitle(card, group.label, core.formatCurrency(group.total, currency));
      const current = Array.from(new Set(group.entries.map((entry) => entry.category)));
      card.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${group.count} entr${group.count === 1 ? "y" : "ies"} · now ${current.map((path) => core.displayCategoryPath(path)).join(", ")}`,
      });
      const state = { group, dirty: false, input: null };
      state.input = this.categoryInput(card, this.category, () => {
        state.dirty = true;
      });
      this.rows.push(state);
    }

    const preview = this.footer.createEl("button", { text: "Preview changes", cls: "mod-cta" });
    preview.addEventListener("click", async () => {
      preview.disabled = true;
      try {
        await this.preview();
      } catch (error) {
        new Notice(`Could not work out the changes: ${error.message}`);
        preview.disabled = false;
      }
    });
  }

  async preview() {
    const assignments = this.rows
      .map((row) => ({ entries: row.group.entries, category: core.normalizeCategoryPath(row.input.value) }))
      .filter((assignment) => assignment.category);

    // A rename only counts as a rename — and so only then follows into the
    // budgets table and the merchant rules — when every row moves together.
    const everything = core.normalizeCategoryPath(this.allInput.value);
    const isWholeRename =
      everything &&
      everything !== this.category &&
      this.rows.every((row) => core.normalizeCategoryPath(row.input.value) === everything);
    const tableRenames = isWholeRename ? [{ from: this.category, to: everything }] : [];

    const plan = await this.plugin.planCategoryAssignments(assignments, { tableRenames });
    const summary = Array.from(
      new Set(assignments.filter((a) => a.category !== this.category).map((a) => core.displayCategoryPath(a.category)))
    );

    this.close();
    new RewritePreviewModal(this.app, this.plugin, {
      title: isWholeRename ? "Rename a category" : "Split a category",
      intro: summary.length
        ? `${core.displayCategoryPath(this.category)} → ${summary.join(", ")}.${
            isWholeRename ? " The budgets table and any merchant rules follow it." : ""
          }`
        : "Nothing would change.",
      plan,
      emptyText: "Nothing to change — those entries are already filed that way.",
      applyLabel: `Update ${plan.totals.files} note${plan.totals.files === 1 ? "" : "s"}`,
      onApply: async (approved) => {
        const { written, skipped } = await this.plugin.applyNoteRewritePlan(approved);
        const rules = tableRenames.length ? await this.plugin.renameCategoryInMerchantMap(tableRenames) : 0;
        new Notice(
          [
            `Updated ${written} note${written === 1 ? "" : "s"}`,
            rules ? `${rules} merchant rule${rules === 1 ? "" : "s"}` : "",
            skipped.length ? `${skipped.length} changed since the preview and were left alone` : "",
          ]
            .filter(Boolean)
            .join(", ") + "."
        );
      },
    }).open();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// A migration that edits notes shows its work first: how many notes and entries,
// a few lines before and after, anything it could not convert cleanly, and where
// the undo lives. Nothing is written until Apply is pressed, and the plan shown
// here is the exact content that gets written.
class RewritePreviewModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-rewrite-preview");
    this.modalEl?.addClass("finance-wide-modal");
    contentEl.createEl("h3", { text: this.options.title || "Review changes" });

    const plan = this.options.plan || { files: [], totals: {}, warnings: [], samples: [] };
    if (this.options.intro) {
      contentEl.createEl("p", { cls: "finance-tracker-settings-section-copy", text: this.options.intro });
    }

    if (!plan.files.length) {
      contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: this.options.emptyText || "Nothing to change — your notes are already up to date.",
      });
      const closeActions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
      const close = closeActions.createEl("button", { text: "Close" });
      close.addEventListener("click", () => this.close());
      return;
    }

    renderStatCards(contentEl, [
      { label: "Notes", value: String(plan.totals?.files || 0) },
      { label: "Entries", value: String(plan.totals?.entries || 0) },
      ...(plan.totals?.warnings
        ? [{ label: "To check after", value: String(plan.totals.warnings), cls: "is-over" }]
        : []),
    ]);

    if (plan.samples?.length) {
      const samples = contentEl.createDiv({ cls: "finance-tracker-chart-card" });
      samples.createEl("h4", { text: "Before and after" });
      for (const sample of plan.samples.slice(0, 4)) {
        const row = samples.createDiv({ cls: "finance-rewrite-sample" });
        row.createDiv({ cls: "finance-rewrite-sample-line is-before", text: String(sample.before || "").trim() });
        row.createDiv({ cls: "finance-rewrite-sample-line is-after", text: String(sample.after || "").trim() });
      }
    }

    if (plan.warnings?.length) {
      const warnings = contentEl.createEl("details", { cls: "finance-tracker-chart-card" });
      warnings.createEl("summary", {
        text: `${this.options.warningsLabel || "Lines worth checking afterwards"} (${plan.warnings.length})`,
      });
      for (const warning of plan.warnings.slice(0, 25)) {
        const row = warnings.createDiv({ cls: "finance-tracker-budget-card" });
        row.createDiv({ cls: "finance-tracker-budget-title", text: String(warning.line || "").trim() });
        row.createDiv({
          cls: "finance-tracker-budget-meta",
          text: [warning.path, warning.reason].filter(Boolean).join(" · "),
        });
      }
    }

    const fileList = contentEl.createEl("details", { cls: "finance-tracker-chart-card" });
    fileList.createEl("summary", { text: `Notes to change (${plan.files.length})` });
    for (const file of plan.files.slice(0, 250)) {
      fileList.createDiv({
        cls: "finance-tracker-budget-meta",
        text: `${file.path} · ${file.entries} entr${file.entries === 1 ? "y" : "ies"}`,
      });
    }

    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Obsidian's File recovery — or Sync version history — is the undo. Open one of the notes afterwards before carrying on.",
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const apply = actions.createEl("button", {
      text: this.options.applyLabel || `Update ${plan.files.length} note${plan.files.length === 1 ? "" : "s"}`,
      cls: "mod-cta",
    });
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      cancel.disabled = true;
      try {
        await this.options.onApply(plan);
        this.close();
      } catch (error) {
        new Notice(`Could not apply the changes: ${error.message}`);
        apply.disabled = false;
        cancel.disabled = false;
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

    // A bill note has an identity the old registry row never did: a name, the
    // other names its payments arrive under, and a rule for when it falls due.
    const billFields = item.billId ? this.renderBillIdentityFields(contentEl, item) : null;

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { inputmode: "decimal", step: "0.01" } });
    amountInput.value = String(item.lastAmount ?? "");

    const nextDueRow = contentEl.createDiv({ cls: "finance-edit-row" });
    nextDueRow.createEl("label", { text: "Next due" });
    const nextDueInput = nextDueRow.createEl("input", { type: "date" });
    nextDueInput.value = item.nextDue || "";
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Corrects the due-date schedule directly — logging or skipping a cycle normally keeps it on track by itself.",
    });

    const variableLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const variableCheckbox = variableLabel.createEl("input", { type: "checkbox" });
    variableCheckbox.checked = Boolean(item.variable);
    variableLabel.appendText(" Variable amount (e.g. a utility bill)");
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Projects off the average of recent payments instead of the last one, and Log now prompts for the actual amount each time.",
    });

    const scheduleLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const scheduleCheckbox = scheduleLabel.createEl("input", { type: "checkbox" });
    scheduleCheckbox.checked = Boolean(item.nextAmount && item.changeDate);
    scheduleLabel.appendText(" Price changes on a future date");

    const scheduleFields = contentEl.createDiv({ cls: "finance-edit-schedule" });
    scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);

    const nextAmountRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    nextAmountRow.createEl("label", { text: "New amount" });
    const nextAmountInput = nextAmountRow.createEl("input", { type: "number", attr: { inputmode: "decimal", step: "0.01" } });
    nextAmountInput.value = String(item.nextAmount ?? "");

    const changeDateRow = scheduleFields.createDiv({ cls: "finance-edit-row" });
    changeDateRow.createEl("label", { text: "Changes on" });
    const changeDateInput = changeDateRow.createEl("input", { type: "date" });
    changeDateInput.value = item.changeDate || "";

    const hasTerm = Boolean(item.endDate) || (Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null);
    const termLabel = contentEl.createEl("label", { cls: "finance-edit-remember" });
    const termCheckbox = termLabel.createEl("input", { type: "checkbox" });
    termCheckbox.checked = hasTerm;
    termLabel.appendText(" This bill stops eventually");

    const termFields = contentEl.createDiv({ cls: "finance-edit-schedule" });
    termFields.toggleClass("is-hidden", !hasTerm);
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "For a fixed-term contract or an instalment plan. Fill either one — the bill retires itself and moves to Archived when it runs out.",
    });

    const endDateRow = termFields.createDiv({ cls: "finance-edit-row" });
    endDateRow.createEl("label", { text: "Ends on" });
    const endDateInput = endDateRow.createEl("input", { type: "date" });
    endDateInput.value = item.endDate || "";

    const paymentsRow = termFields.createDiv({ cls: "finance-edit-row" });
    paymentsRow.createEl("label", { text: "Payments left" });
    const paymentsInput = paymentsRow.createEl("input", { type: "number", attr: { inputmode: "numeric", step: "1", min: "0" } });
    paymentsInput.value = Number.isFinite(item.paymentsLeft) && item.paymentsLeft !== null ? String(item.paymentsLeft) : "";

    // Live schedule preview. A price change is easy to mis-set by a few days —
    // the date decides which cycles are still billed at the old price, and that
    // is invisible from two input boxes. This lays the upcoming cycles out with
    // the price each one will actually be charged at, and updates as you type.
    const previewSection = contentEl.createDiv({ cls: "finance-edit-preview" });
    const previewHeading = previewSection.createEl("h4", { text: "Upcoming payments" });
    const previewSummary = previewSection.createDiv({ cls: "finance-edit-preview-summary" });
    const previewGrid = previewSection.createDiv({ cls: "finance-edit-preview-grid" });
    const currency = core.normalizeCurrency(this.plugin.settings.defaultCurrency);
    const today = core.todayIsoLocal();

    const shortDate = (iso) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

    const renderPreview = () => {
      previewGrid.empty();
      previewSummary.empty();
      const scheduling = scheduleCheckbox.checked && nextAmountInput.value && changeDateInput.value;
      const terming = termCheckbox.checked;
      const schedule = core.buildRecurringSchedule(item, {
        amount: core.parseNumber(amountInput.value),
        changeDate: scheduling ? core.parseIsoDate(changeDateInput.value) : null,
        count: 8,
        endDate: terming ? core.parseIsoDate(endDateInput.value) || null : null,
        nextAmount: scheduling ? core.parseNumber(nextAmountInput.value) : null,
        nextDue: core.parseIsoDate(nextDueInput.value) || item.nextDue,
        paymentsLeft: terming ? core.parseNumber(paymentsInput.value) : null,
        referenceDate: today,
      });

      previewHeading.setText(`Upcoming payments · ${cadenceLabel(item.cadence)}`);

      if (!schedule.occurrences.length) {
        previewSummary.createSpan({ text: "No upcoming payments — check the next due date and the bill's terms." });
        return;
      }

      for (const occurrence of schedule.occurrences) {
        const cell = previewGrid.createDiv({ cls: "finance-edit-preview-cell" });
        if (occurrence.isNewPrice) cell.addClass("is-new-price");
        // The first cycle at the new price is the one worth spotting at a glance.
        if (occurrence.date === schedule.changeOccurrence) cell.addClass("is-change");
        cell.createDiv({ cls: "finance-edit-preview-date", text: shortDate(occurrence.date) });
        cell.createDiv({
          cls: "finance-edit-preview-amount",
          text: core.formatCurrency(occurrence.amount, currency),
        });
      }

      if (schedule.changeOccurrence) {
        const before = schedule.beforeChange;
        const oldPrice = core.formatCurrency(core.parseNumber(amountInput.value) || 0, currency);
        const newPrice = core.formatCurrency(schedule.nextAmount || 0, currency);
        previewSummary.createSpan({
          text: before.count
            ? `${before.count} more payment${before.count === 1 ? "" : "s"} at ${oldPrice} (${core.formatCurrency(before.total, currency)}), then ${newPrice} from ${shortDate(schedule.changeOccurrence)}.`
            : `Every upcoming payment is already at the new ${newPrice}, from ${shortDate(schedule.changeOccurrence)}.`,
        });
      } else if (scheduling) {
        // The change is real but lands beyond the previewed cycles.
        previewSummary.createSpan({
          text: `The new price does not apply to any of the next ${schedule.occurrences.length} payments — it starts ${shortDate(core.parseIsoDate(changeDateInput.value) || today)}.`,
        });
      } else {
        previewSummary.createSpan({
          text: `${schedule.occurrences.length} upcoming payment${schedule.occurrences.length === 1 ? "" : "s"} at ${core.formatCurrency(schedule.occurrences[0].amount, currency)}.`,
        });
      }

      if (schedule.finishReason) {
        previewSummary.createSpan({
          cls: "finance-edit-preview-note",
          text: schedule.finishesOn
            ? ` Last payment ${shortDate(schedule.finishesOn)}, then the bill retires.`
            : " The bill has no payments left.",
        });
      }
    };

    scheduleCheckbox.addEventListener("change", () => {
      scheduleFields.toggleClass("is-hidden", !scheduleCheckbox.checked);
      renderPreview();
    });

    termCheckbox.addEventListener("change", () => {
      termFields.toggleClass("is-hidden", !termCheckbox.checked);
      renderPreview();
    });

    for (const input of [amountInput, nextDueInput, nextAmountInput, changeDateInput, endDateInput, paymentsInput]) {
      input.addEventListener("input", renderPreview);
      input.addEventListener("change", renderPreview);
    }
    renderPreview();

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const saveButton = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const patch = {
          amount: core.parseNumber(amountInput.value),
          nextDue: core.parseIsoDate(nextDueInput.value) || null,
          variable: variableCheckbox.checked,
        };
        if (billFields) {
          Object.assign(patch, billFields.read());
          // For a bill, next due is a correction, not a field to re-save: pinning
          // the date it already had would turn a derived schedule into a fixed one.
          if (patch.nextDue === (item.nextDue || null)) delete patch.nextDue;
        }
        if (scheduleCheckbox.checked && nextAmountInput.value && changeDateInput.value) {
          patch.nextAmount = core.parseNumber(nextAmountInput.value);
          patch.changeDate = core.parseIsoDate(changeDateInput.value);
        } else {
          patch.nextAmount = null;
          patch.changeDate = null;
        }
        if (termCheckbox.checked) {
          patch.endDate = core.parseIsoDate(endDateInput.value) || null;
          const left = core.parseNumber(paymentsInput.value);
          patch.paymentsLeft = Number.isFinite(left) && left >= 0 ? Math.floor(left) : null;
        } else {
          patch.endDate = null;
          patch.paymentsLeft = null;
        }
        await this.plugin.updateRecurringItem(item, patch);
        new Notice(`${item.label} updated`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Update failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  renderBillIdentityFields(contentEl, item) {
    const bill = item.bill || {};
    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const nameInput = row("Name").createEl("input", { type: "text", attr: { "aria-label": "Bill name" } });
    nameInput.value = bill.name || item.label || "";

    const aliasInput = row("Also paid as").createEl("input", {
      type: "text",
      attr: { placeholder: "CLAUDE.AI SUBSCRIPTION, Anthropic", "aria-label": "Aliases" },
    });
    aliasInput.value = (bill.aliases || []).join(", ");
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Other names this bill's payments arrive under, separated by commas — how a bank feed or a differently worded entry is recognised as this bill.",
    });

    const dueSelect = row("Due").createEl("select", { attr: { "aria-label": "Due rule" } });
    for (const [value, label] of [["after-last", "Counted from the last payment"], ["day-of-month", "On a day of the month"], ["nth-weekday", "On a weekday of the month"]]) {
      dueSelect.createEl("option", { text: label, value });
    }
    dueSelect.value = bill.dueRule?.type || "after-last";

    const dayRow = row("Day");
    const dayInput = dayRow.createEl("input", { type: "number", attr: { inputmode: "numeric", min: "1", max: "31", "aria-label": "Day of month" } });
    dayInput.value = bill.dueRule?.type === "day-of-month" ? String(bill.dueRule.day) : "";

    const weekdayRow = row("Which");
    const ordinalSelect = weekdayRow.createEl("select", { attr: { "aria-label": "Which weekday" } });
    for (const [value, label] of [["1", "First"], ["2", "Second"], ["3", "Third"], ["4", "Fourth"], ["-1", "Last"]]) {
      ordinalSelect.createEl("option", { text: label, value });
    }
    const weekdaySelect = weekdayRow.createEl("select", { attr: { "aria-label": "Weekday" } });
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((label, index) => {
      weekdaySelect.createEl("option", { text: label, value: String(index) });
    });
    if (bill.dueRule?.type === "nth-weekday") {
      ordinalSelect.value = String(bill.dueRule.ordinal);
      weekdaySelect.value = String(bill.dueRule.weekday);
    }

    const syncDueRows = () => {
      dayRow.toggleClass("is-hidden", dueSelect.value !== "day-of-month");
      weekdayRow.toggleClass("is-hidden", dueSelect.value !== "nth-weekday");
    };
    dueSelect.addEventListener("change", syncDueRows);
    syncDueRows();

    const reminderInput = row("Remind me").createEl("input", {
      type: "number",
      attr: { min: "0", max: "60", inputmode: "numeric", "aria-label": "Reminder days" },
    });
    reminderInput.value = String(bill.reminderDays ?? 3);
    contentEl.createEl("p", { cls: "finance-edit-hint", text: "Days before the due date this bill moves into Due soon." });

    return {
      read: () => ({
        name: nameInput.value.trim() || bill.name,
        aliases: aliasInput.value
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        dueRule:
          dueSelect.value === "day-of-month"
            ? { type: "day-of-month", day: Math.min(31, Math.max(1, Number(dayInput.value) || 1)) }
            : dueSelect.value === "nth-weekday"
              ? { type: "nth-weekday", ordinal: Number(ordinalSelect.value), weekday: Number(weekdaySelect.value) }
              : { type: "after-last" },
        reminderDays: Math.max(0, Number(reminderInput.value) || 0),
      }),
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// "Log now" for a Variable bill (a fluctuating utility, say) prompts for the
// actual amount instead of silently repeating the last/average one — logging
// a made-up fixed number for something that genuinely varies would just be
// wrong in the daily note.
class LogVariableBillModal extends Modal {
  constructor(app, plugin, item, onLogged) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onLogged = onLogged;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    const item = this.item;
    const currency = item.currency || this.plugin.settings.defaultCurrency;
    contentEl.createEl("h3", { text: `Log ${item.label}` });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: `This bill is variable — enter today's actual amount (recent average: ${core.formatCurrency(item.averageAmount ?? item.lastAmount, currency)}).`,
    });

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { text: "Amount" });
    const amountInput = amountRow.createEl("input", { type: "number", attr: { inputmode: "decimal", step: "0.01" } });
    amountInput.value = String(item.averageAmount ?? item.lastAmount ?? "");

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const logButton = buttons.createEl("button", { text: "Log", cls: "mod-cta" });
    logButton.addEventListener("click", async () => {
      logButton.disabled = true;
      try {
        const amount = core.parseNumber(amountInput.value);
        const logDate = await this.plugin.logRecurringNow(item, amount);
        new Notice(`Logged ${item.label} for ${logDate}`);
        this.close();
        if (typeof this.onLogged === "function") await this.onLogged();
      } catch (error) {
        new Notice(`Could not log ${item.label}: ${error.message}`);
        logButton.disabled = false;
      }
    });
    window.setTimeout(() => amountInput.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Merging replaces "Remove completely" as the answer to a duplicate. Removing
// hid a bill's name while its payments went on existing, uncounted; merging
// makes the name an alias of the bill it really was, so the history joins up.
class MergeBillModal extends Modal {
  constructor(app, plugin, item, bills, onDone) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.bills = (bills || []).filter((bill) => bill.billId && bill.billId !== item.billId);
    this.onDone = onDone;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: `Merge ${this.item.label} into…` });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Its name becomes an alias of the bill you pick, so its payments count toward that one. Your daily notes do not change.",
    });

    const search = contentEl.createEl("input", { type: "text", attr: { placeholder: "Find a bill", "aria-label": "Find a bill" } });
    const list = contentEl.createDiv({ cls: "finance-tracker-holiday-results" });

    const render = () => {
      list.empty();
      const needle = String(search.value || "").toLowerCase();
      const matches = this.bills.filter((bill) => !needle || bill.label.toLowerCase().includes(needle));
      if (!matches.length) {
        list.createDiv({ cls: "finance-tracker-empty", text: "No bill matches." });
        return;
      }
      for (const bill of matches) {
        const row = list.createDiv({ cls: "finance-tracker-holiday-result" });
        row.createDiv({ cls: "finance-tracker-holiday-result-title", text: bill.label });
        row.createDiv({
          cls: "finance-tracker-holiday-result-path",
          text: `${cadenceLabel(bill.cadence)} · ${core.formatCurrency(bill.lastAmount, this.plugin.settings.defaultCurrency)} · ${bill.count} payment${bill.count === 1 ? "" : "s"}`,
        });
        row.addEventListener("click", async () => {
          try {
            await this.plugin.mergeBillInto(this.item, bill.billId);
            new Notice(`${this.item.label} now counts toward ${bill.label}.`);
            this.close();
            if (typeof this.onDone === "function") await this.onDone();
          } catch (error) {
            new Notice(`Merge failed: ${error.message}`);
          }
        });
      }
    };
    search.addEventListener("input", render);
    render();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Adding a bill by hand, for one that has not been logged yet — the car
// registration due next August — or one you would rather set up than wait for.
class AddBillModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onSaved = options.onSaved;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("finance-edit");
    contentEl.createEl("h3", { text: "Add a bill" });
    const known = await this.plugin.collectKnownSuggestions();

    const row = (label) => {
      const element = contentEl.createDiv({ cls: "finance-edit-row" });
      element.createEl("label", { text: label });
      return element;
    };

    const nameInput = row("Name").createEl("input", { type: "text", attr: { placeholder: "Claude", "aria-label": "Bill name" } });
    this.nameSuggest = new FinanceSuggest(nameInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        if (!needle) return [];
        return known.merchants
          .filter((merchant) => merchant.name.toLowerCase().includes(needle))
          .slice(0, 6)
          .map((merchant) => ({ value: merchant.name, label: merchant.name, kind: "merchant" }));
      },
    });

    const cadenceSelect = row("How often").createEl("select", { attr: { "aria-label": "Cadence" } });
    for (const [value, label] of [["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]]) {
      cadenceSelect.createEl("option", { text: label, value });
    }
    cadenceSelect.value = "monthly";

    const amountInput = row("Amount").createEl("input", {
      type: "number",
      attr: { step: "0.01", inputmode: "decimal", placeholder: "34.00", "aria-label": "Amount" },
    });

    const dueSelect = row("Due").createEl("select", { attr: { "aria-label": "Due rule" } });
    for (const [value, label] of [["after-last", "Counted from the last payment"], ["day-of-month", "On a day of the month"], ["nth-weekday", "On a weekday of the month"]]) {
      dueSelect.createEl("option", { text: label, value });
    }
    dueSelect.value = "after-last";

    const dayRow = row("Day");
    const dayInput = dayRow.createEl("input", { type: "number", attr: { inputmode: "numeric", min: "1", max: "31", placeholder: "26", "aria-label": "Day of month" } });
    const weekdayRow = row("Which");
    const ordinalSelect = weekdayRow.createEl("select", { attr: { "aria-label": "Which weekday" } });
    for (const [value, label] of [["1", "First"], ["2", "Second"], ["3", "Third"], ["4", "Fourth"], ["-1", "Last"]]) {
      ordinalSelect.createEl("option", { text: label, value });
    }
    const weekdaySelect = weekdayRow.createEl("select", { attr: { "aria-label": "Weekday" } });
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((label, index) => {
      weekdaySelect.createEl("option", { text: label, value: String(index) });
    });

    const syncDueRows = () => {
      dayRow.toggleClass("is-hidden", dueSelect.value !== "day-of-month");
      weekdayRow.toggleClass("is-hidden", dueSelect.value !== "nth-weekday");
    };
    dueSelect.addEventListener("change", syncDueRows);
    syncDueRows();

    const firstDueInput = row("First due").createEl("input", { type: "date", attr: { "aria-label": "First due date" } });
    contentEl.createEl("p", {
      cls: "finance-edit-hint",
      text: "Optional. Set it for a bill that has never been paid, so it knows when to start.",
    });

    const buttons = contentEl.createDiv({ cls: "finance-edit-buttons" });
    const save = buttons.createEl("button", { text: "Add bill", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error("Give the bill a name.");
        const dueRule =
          dueSelect.value === "day-of-month"
            ? { type: "day-of-month", day: Math.min(31, Math.max(1, Number(dayInput.value) || 1)) }
            : dueSelect.value === "nth-weekday"
              ? { type: "nth-weekday", ordinal: Number(ordinalSelect.value), weekday: Number(weekdaySelect.value) }
              : { type: "after-last" };
        const amount = core.parseNumber(amountInput.value);
        const bill = await this.plugin.addBill({
          name,
          cadence: cadenceSelect.value,
          amount: Number.isFinite(amount) && amount > 0 ? amount : null,
          dueRule,
          firstDue: core.parseIsoDate(firstDueInput.value) || null,
        });
        new Notice(`Added ${bill.name}.`);
        this.close();
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(error.message);
        save.disabled = false;
      }
    });
    window.setTimeout(() => nameInput.focus(), 0);
  }

  onClose() {
    this.nameSuggest?.destroy();
    this.contentEl.empty();
  }
}

// Answers "are two of my capture methods logging the same thing?" from the
// capture ledger rather than from guesswork about what each Shortcut covers.
class CaptureOverlapModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Capture method overlap" });

    const active = core.CAPTURE_METHODS.filter((method) => this.plugin.isCaptureMethodEnabled(method));
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: active.length
        ? `Active methods: ${active.map((method) => core.captureMethodLabel(method)).join(", ")}. Quick add and hand-typed bullets always work.`
        : "No capture methods are turned on — only quick add and hand-typed bullets will log anything.",
    });

    const overlap = this.plugin.captureOverlapReport(60);
    if (!overlap.length) {
      contentEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No two methods have captured the same transaction in the last 60 days. Nothing is overlapping.",
      });
    } else {
      contentEl.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "These pairs have captured the same transaction. That is fine while duplicate handling is on — but if one pair dominates, you are paying for a method you could turn off.",
      });
      const table = contentEl.createEl("table", { cls: "finance-tracker-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const label of ["Methods", "Collisions", "Most recent"]) head.createEl("th", { text: label });
      const body = table.createEl("tbody");
      for (const pair of overlap) {
        const row = body.createEl("tr");
        row.createEl("td", { text: pair.channels.map((channel) => core.describeCaptureChannel(channel)).join("  ↔  ") });
        row.createEl("td", { text: String(pair.count) });
        row.createEl("td", {
          text: pair.sample
            ? `${pair.sample.date} · ${core.formatCurrency(pair.sample.amount, this.plugin.settings.defaultCurrency)}${pair.sample.merchant ? ` · ${pair.sample.merchant}` : ""}`
            : pair.lastDate,
        });
      }
    }

    const handling = this.plugin.settings.crossMethodDuplicates || "skip";
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: `Duplicate handling is set to "${handling}". Detection only ever compares captures from different methods, so two identical purchases down the same method are still logged as two.`,
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
      nameEdited: false,
      startDate: core.todayIsoLocal(),
      tagOverride: "",
      tripCurrency: "",
    };
    this.takenTripTags = [];
  }

  getMatchingFiles() {
    const query = this.query.trim().toLowerCase();
    // Only trips: a plain savings goal lives in the same folder but has no
    // trip tag, and choosing one here only led to "That note has no trip tag".
    const files = this.plugin.getHolidayBudgetFiles().filter((file) => {
      const frontmatter = this.app.metadataCache?.getFileCache?.(file)?.frontmatter;
      return !frontmatter || Boolean(frontmatter.trip_tag || frontmatter.holiday_tag || frontmatter.holiday);
    });
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
    if (!this.createForm.nameEdited) this.createForm.name = name;
    const override = core.normalizeHolidayKey(this.createForm.tagOverride || "");
    this.createForm.holidayKey =
      override ||
      core.deriveTripTag(this.createForm.name || name || "Trip", {
        startDate: this.createForm.startDate,
        existingTags: this.takenTripTags || [],
      });
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
      tripCurrency: this.createForm.tripCurrency,
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
        text: "Type to search your trips, or a new trip's name to create one.",
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
    this.createPanelEl.createEl("h3", { text: "New trip" });

    const field = (label, type, key, attrs = {}) => {
      const row = this.createPanelEl.createDiv({ cls: "finance-edit-row" });
      row.createEl("label", { cls: "finance-edit-label", text: label });
      const input = row.createEl("input", { type, attr: { ...attrs, "aria-label": label } });
      input.value = this.createForm[key] || "";
      input.addEventListener("input", () => {
        this.createForm[key] = input.value;
        if (key === "name") this.createForm.nameEdited = true;
        this.updateCreateDefaults();
        updateHint();
      });
      return input;
    };
    field("Name", "text", "name", { placeholder: "Japan 2026" });
    field("Start", "date", "startDate");
    field("End", "date", "endDate");
    const currencyInput = field("Currency", "text", "tripCurrency", { placeholder: "JPY", maxlength: "3", autocapitalize: "characters" });
    currencyInput.addEventListener("change", () => {
      this.createForm.tripCurrency = core.normalizeCurrency(currencyInput.value, "");
      currencyInput.value = this.createForm.tripCurrency;
      updateHint();
    });

    const hint = this.createPanelEl.createDiv({ cls: "finance-tracker-budget-meta finance-goal-tag-hint" });
    const updateHint = () => {
      const currency = core.normalizeCurrency(this.createForm.tripCurrency || "", "");
      hint.setText(
        `Spending on the trip is tagged #log/spending/${this.createForm.holidayKey}/food and so on.` +
          (currency ? ` Amounts in ${currency} need a rate; add one with Add trip exchange rate.` : " Leave the currency blank if you're spending your own.")
      );
    };
    updateHint();

    const advanced = this.createPanelEl.createEl("details", { cls: "finance-goal-advanced" });
    advanced.createEl("summary", { text: "Advanced" });
    const overrideRow = advanced.createDiv({ cls: "finance-edit-row" });
    overrideRow.createEl("label", { cls: "finance-edit-label", text: "Trip tag" });
    const overrideInput = overrideRow.createEl("input", { type: "text", attr: { placeholder: this.createForm.holidayKey, "aria-label": "Trip tag" } });
    overrideInput.value = this.createForm.tagOverride || "";
    overrideInput.addEventListener("input", () => {
      this.createForm.tagOverride = overrideInput.value;
      this.updateCreateDefaults();
      updateHint();
    });

    const actions = this.createPanelEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create trip", cls: "mod-cta" });
    createButton.addEventListener("click", async () => {
      await this.createFromForm();
    });
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.takenTripTags = await this.plugin.collectTakenTripTags();
    contentEl.createEl("h2", { text: "Select or create a trip" });
    const intro = contentEl.createEl("p", {
      text: "Search your trips. If nothing matches, type the new trip's name to create it.",
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
      sourceCurrency: core.normalizeCurrency(holidayMeta?.tripCurrency || "", ""),
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

    let rateText = null;
    const rateSetting = new Setting(contentEl)
      .setName("Rate")
      .setDesc("How much 1 unit of the source currency is worth in the target currency.")
      .addText((text) => {
        rateText = text;
        text.inputEl.setAttribute("inputmode", "decimal");
        text.setPlaceholder("0.00877").setValue(this.form.rate).onChange((value) => {
          this.form.rate = value.trim();
        });
      })
      .addButton((button) =>
        button.setButtonText("Fetch current rate").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.fetchExchangeRate(this.form.sourceCurrency, this.form.targetCurrency);
            this.form.rate = String(result.rate);
            rateText?.setValue(this.form.rate);
            rateSetting.setDesc(
              `European Central Bank reference rate for ${result.date}. Card and cash rates are usually a little worse, so adjust it if you know yours.`
            );
          } catch (error) {
            new Notice(`Couldn't fetch a rate: ${error.message}`);
          } finally {
            button.setDisabled(false);
          }
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

// A goal is a name, a target and (optionally) a date. The key its tags are built
// from is worked out from the name and only shown as the tag it produces; the
// Advanced section is there for someone who wants a different one.
class SavingsGoalModal extends Modal {
  constructor(app, plugin, onComplete) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.form = { dueDate: "", name: "", target: "", keyOverride: "" };
    this.takenKeys = [];
  }

  currentKey() {
    const override = core.slugifyName(this.form.keyOverride);
    return override || core.deriveGoalKey(this.form.name, this.takenKeys);
  }

  async submit() {
    const name = String(this.form.name || "").trim();
    if (!name) {
      new Notice("Give the goal a name first.");
      return;
    }
    const goalKey = this.currentKey();
    if (this.form.keyOverride && this.takenKeys.includes(goalKey)) {
      new Notice(`#log/income/${goalKey} is already in use. Choose another tag name, or leave it blank.`);
      return;
    }
    const target = core.parseNumber(this.form.target);
    const file = await this.plugin.createOrOpenSavingsGoal({
      dueDate: this.form.dueDate,
      goalKey,
      name,
      targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
    });
    if (file) {
      await this.app.workspace.getLeaf(true).openFile(file);
      if (typeof this.onComplete === "function") await this.onComplete(file);
    }
    this.close();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "New savings goal" });
    this.takenKeys = await this.plugin.collectTakenGoalKeys();

    const field = (label, attrs, key) => {
      const row = contentEl.createDiv({ cls: "finance-edit-row" });
      row.createEl("label", { cls: "finance-edit-label", text: label });
      const input = row.createEl("input", { type: attrs.type || "text", attr: { ...attrs.attr, "aria-label": label } });
      input.value = this.form[key];
      input.addEventListener("input", () => {
        this.form[key] = input.value;
        updateHint();
      });
      return input;
    };

    const nameInput = field("Name", { attr: { placeholder: "House deposit" } }, "name");
    field("Target", { type: "number", attr: { step: "0.01", min: "0", inputmode: "decimal", placeholder: "2000" } }, "target");
    field("Due date", { type: "date", attr: {} }, "dueDate");
    const hint = contentEl.createDiv({ cls: "finance-tracker-budget-meta finance-goal-tag-hint" });

    const advanced = contentEl.createEl("details", { cls: "finance-goal-advanced" });
    advanced.createEl("summary", { text: "Advanced" });
    const overrideRow = advanced.createDiv({ cls: "finance-edit-row" });
    overrideRow.createEl("label", { cls: "finance-edit-label", text: "Tag name" });
    const overrideInput = overrideRow.createEl("input", { type: "text", attr: { placeholder: "worked out from the name", "aria-label": "Tag name" } });
    overrideInput.addEventListener("input", () => {
      this.form.keyOverride = overrideInput.value;
      updateHint();
    });

    const updateHint = () => {
      const name = String(this.form.name || "").trim();
      hint.setText(
        name
          ? `Contributions are logged as #log/income/${this.currentKey()}. The due date is optional.`
          : "The due date is optional; with one, the goal shows what to set aside each week."
      );
    };
    updateHint();

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const createButton = actions.createEl("button", { text: "Create goal", cls: "mod-cta" });
    createButton.addEventListener("click", async () => {
      createButton.disabled = true;
      try {
        await this.submit();
      } catch (error) {
        new Notice(`Creating the goal failed: ${error.message}`);
      } finally {
        createButton.disabled = false;
      }
    });
    window.setTimeout(() => nameInput.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
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
      ["createRecurring", "🔁 Recurring payments", "The bill management page: due dates, log/skip, and your runway."],
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

// Contributions and withdrawals share one dialog: the same goal, amount and
// date, differing only in the tag written and, for a withdrawal, what the money
// was spent on. The goal is typed with autocomplete rather than picked from a
// dropdown, which on a phone meant scrolling a native picker of every goal.
class ContributeGoalModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.goalKey = core.normalizeCategoryPath(options.goalKey || "");
    this.mode = options.mode === "withdraw" ? "withdraw" : "contribute";
    this.onDone = options.onDone;
    this.form = { amount: "", date: core.todayIsoLocal(), note: "" };
    this.goals = [];
  }

  findGoal(text) {
    const needle = String(text || "").trim().toLowerCase();
    if (!needle) return null;
    return (
      this.goals.find((goal) => goal.goalName.toLowerCase() === needle) ||
      this.goals.find((goal) => goal.goalKey === core.normalizeCategoryPath(needle)) ||
      null
    );
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl?.setText?.("");
    const heading = contentEl.createEl("h2");
    const copy = contentEl.createEl("p", { cls: "finance-tracker-settings-section-copy" });

    this.goals = (await this.plugin.collectSavingsGoalDefinitions()).filter((goal) => !goal.isLegacyRunwayNote);
    if (!this.goals.length) {
      heading.setText("Contribute to a goal");
      contentEl.createDiv({ cls: "finance-tracker-empty", text: "No goals yet. Create one with New goal in the hub, or the Create savings goal command." });
      return;
    }
    const known = await this.plugin.collectKnownSuggestions();

    const modeRow = contentEl.createDiv({ cls: "finance-hub-chips finance-goal-mode" });
    const modeButtons = {};
    for (const [key, label] of [["contribute", "Contribute"], ["withdraw", "Withdraw"]]) {
      modeButtons[key] = modeRow.createEl("button", { cls: "finance-hub-chip", text: label });
      modeButtons[key].addEventListener("click", () => {
        this.mode = key;
        sync();
      });
    }

    const goalRow = contentEl.createDiv({ cls: "finance-edit-row" });
    goalRow.createEl("label", { cls: "finance-edit-label", text: "Goal" });
    const goalInput = goalRow.createEl("input", { type: "text", attr: { placeholder: "Start typing a goal", "aria-label": "Goal" } });
    const preset = this.goals.find((goal) => goal.goalKey === this.goalKey) || (this.goals.length === 1 ? this.goals[0] : null);
    goalInput.value = preset ? preset.goalName : "";
    this.goalSuggest = new FinanceSuggest(goalInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = String(query || "").trim().toLowerCase();
        return this.goals
          .filter((goal) => !needle || goal.goalName.toLowerCase().includes(needle) || goal.goalKey.includes(core.normalizeCategoryPath(needle)))
          .map((goal) => ({ value: goal.goalName, label: goal.goalName, kind: goal.goalType === "holiday" ? "trip" : "goal", hint: goal.goalKey }));
      },
    });

    const amountRow = contentEl.createDiv({ cls: "finance-edit-row" });
    amountRow.createEl("label", { cls: "finance-edit-label", text: "Amount" });
    const amountInput = amountRow.createEl("input", {
      type: "number",
      attr: { step: "0.01", min: "0", inputmode: "decimal", placeholder: "150", "aria-label": "Amount" },
    });
    amountInput.addEventListener("input", () => {
      this.form.amount = amountInput.value;
    });

    const categoryLabel = contentEl.createEl("label", { cls: "finance-edit-label", text: "Spent on" });
    const categoryHost = contentEl.createDiv({ cls: "finance-contribute-category" });
    const picker = new CategoryPicker(categoryHost, { categories: known.categories, value: "", scope: this.scope });
    this.picker = picker;

    const dateRow = contentEl.createDiv({ cls: "finance-edit-row" });
    dateRow.createEl("label", { cls: "finance-edit-label", text: "Date" });
    const dateInput = dateRow.createEl("input", { type: "date", attr: { "aria-label": "Date" } });
    dateInput.value = this.form.date;
    dateInput.addEventListener("input", () => {
      this.form.date = core.parseIsoDate(dateInput.value) || core.todayIsoLocal();
    });

    const noteRow = contentEl.createDiv({ cls: "finance-edit-row" });
    noteRow.createEl("label", { cls: "finance-edit-label", text: "Note" });
    const noteInput = noteRow.createEl("input", { type: "text", attr: { placeholder: "Optional", "aria-label": "Note" } });
    noteInput.addEventListener("input", () => {
      this.form.note = noteInput.value;
    });

    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    const saveButton = actions.createEl("button", { cls: "mod-cta" });

    const sync = () => {
      const withdrawing = this.mode === "withdraw";
      heading.setText(withdrawing ? "Withdraw from a goal" : "Contribute to a goal");
      copy.setText(
        withdrawing
          ? "Logs spending paid from the goal, like “- $80.00 #log/spending/goal/roadbike/repairs”. It lowers what the goal has saved and stays out of your home spending."
          : "Logs a contribution like “- $150.00 #log/income/roadbike”. The goal is an envelope tracked in your notes, so no money has to move between accounts."
      );
      for (const [key, button] of Object.entries(modeButtons)) {
        button.toggleClass("is-active", key === this.mode);
        button.setAttribute("aria-pressed", String(key === this.mode));
      }
      categoryLabel.toggleClass("is-hidden", !withdrawing);
      categoryHost.toggleClass("is-hidden", !withdrawing);
      saveButton.setText(withdrawing ? "Log withdrawal" : "Log contribution");
    };
    sync();

    saveButton.addEventListener("click", async () => {
      const goal = this.findGoal(goalInput.value);
      if (!goal) {
        new Notice("Choose one of your goals first.");
        return;
      }
      const amount = core.parseNumber(this.form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        new Notice("Enter an amount first.");
        return;
      }
      saveButton.disabled = true;
      try {
        const money = core.formatCurrency(amount, goal.currency || this.plugin.settings.defaultCurrency);
        if (this.mode === "withdraw") {
          await this.plugin.logGoalWithdrawal(goal.goalKey, goal.goalName, amount, this.form.date, this.form.note, picker.getValue());
          new Notice(`Logged ${money} taken from ${goal.goalName}`);
        } else {
          await this.plugin.logGoalContribution(goal.goalKey, goal.goalName, amount, this.form.date, this.form.note);
          new Notice(`Logged ${money} to ${goal.goalName}`);
        }
        if (typeof this.onDone === "function") await this.onDone();
        this.close();
      } catch (error) {
        new Notice(`${this.mode === "withdraw" ? "Withdrawal" : "Contribution"} failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });

    window.setTimeout(() => (preset ? amountInput : goalInput).focus(), 0);
  }

  onClose() {
    this.goalSuggest?.destroy();
    this.picker?.destroy?.();
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
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.rows = [];
    this.accountOptions = [];
    this.onSaved = options.onSaved;
  }

  addRow(container, account = "", amount = "") {
    const row = container.createDiv({ cls: "finance-edit-row" });
    const accountInput = row.createEl("input", { type: "text", attr: { placeholder: "anz-plus", "aria-label": "Account" } });
    accountInput.value = account;
    // Accounts already snapshotted, and the ones captures say money came from, so
    // "anz-plus" is picked rather than retyped as "anz plus" and split in two.
    const suggest = new FinanceSuggest(accountInput, {
      scope: this.scope,
      getItems: (query) => {
        const needle = core.normalizeCategoryPath(query);
        return this.accountOptions
          .filter((option) => !needle || option.includes(needle))
          .filter((option) => !this.rows.some((other) => other.accountInput !== accountInput && core.normalizeCategoryPath(other.accountInput.value) === option))
          .map((option) => ({ value: option, label: option, kind: "account" }));
      },
    });
    this.suggests = [...(this.suggests || []), suggest];
    const amountInput = row.createEl("input", { type: "number", attr: { step: "0.01", placeholder: "5230", inputmode: "decimal", "aria-label": "Balance" } });
    amountInput.value = amount === "" ? "" : String(amount);
    this.rows.push({ accountInput, amountInput });
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Snapshot balances" });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Logs one bullet per account into today's note, like “- $5,230.00 #log/balance/anz-plus”. Accounts you have snapshotted before are pre-filled with their last balance.",
    });

    const rowsHost = contentEl.createDiv();
    const entries = await this.plugin.collectAllTransactions();
    const summary = core.summarizeBalanceSnapshots(entries);
    const ledgerSources = (this.plugin.settings.captureLedger || [])
      .map((record) => core.normalizeCategoryPath(record?.source || ""))
      .filter((sourceName) => sourceName && !["manual", "quick-add", "csv-reconcile", "apple-pay"].includes(sourceName));
    this.accountOptions = Array.from(new Set([...summary.accounts.map((account) => account.key), ...ledgerSources])).sort();
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
        if (typeof this.onSaved === "function") await this.onSaved();
      } catch (error) {
        new Notice(`Snapshot failed: ${error.message}`);
        saveButton.disabled = false;
      }
    });
  }

  onClose() {
    for (const suggest of this.suggests || []) suggest.destroy();
    this.contentEl.empty();
  }
}

// The eight "Insert … block" commands were eight near-identical palette rows
// that pushed the commands doing real work further down the list. One entry
// opens this instead, where each block gets a sentence saying what it is —
// which the palette had no room for.
const INSERTABLE_BLOCKS = [
  {
    name: "Dashboard",
    block: DASHBOARD_BLOCK,
    body: "period: week",
    description: "Spend for a period: totals, income and savings rate, categories, top merchants, bills and budgets.",
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
    name: "Accounts & portfolio",
    block: NETWORTH_BLOCK,
    body: "",
    description: "Account balances plus the share portfolio, and net worth over time.",
  },
  {
    name: "Portfolio",
    block: PORTFOLIO_BLOCK,
    body: "",
    description: "Holdings, value, gains, dividends and trades from the portfolio note.",
  },
  {
    name: "Query",
    block: QUERY_BLOCK,
    body: "period: month\ngroup: category\nview: table",
    description: "A filtered table or bar chart over any slice of your logged entries.",
  },
];

class InsertBlockModal extends Modal {
  constructor(app, plugin, editor, sourcePath = "") {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.sourcePath = sourcePath;
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
    // The period is the note's own: a weekly note gets its week.
    const referenceDate = this.plugin.getReferenceDateForSource(this.sourcePath);
    for (const [period, name, description] of [
      ["week", "Weekly review", "Spent, income and savings rate, where it went, top merchants and largest transactions for this note's week, as plain text."],
      ["month", "Monthly review", "The same review for this note's month."],
      ["quarter", "Quarter in review", "Totals, best and worst month, top categories and transfers for the quarter."],
      ["year", "Year in review", "The same summary for the whole year."],
    ]) {
      const option = list.createDiv({ cls: "finance-tracker-holiday-result" });
      option.createDiv({ cls: "finance-tracker-holiday-result-title", text: name });
      option.createDiv({ cls: "finance-tracker-holiday-result-path", text: description });
      option.addEventListener("click", async () => {
        const lines = await this.plugin.buildPeriodReview(period, referenceDate);
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


// A yes/no for anything that moves or rewrites a note. The body says what will
// happen and how to undo it; the action runs only on the confirm button.
class FinanceConfirmModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.options = options;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.options.title || "Are you sure?" });
    for (const paragraph of [].concat(this.options.body || [])) {
      contentEl.createEl("p", { cls: "finance-tracker-settings-section-copy", text: paragraph });
    }
    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: this.options.confirmLabel || "Confirm", cls: "mod-cta" });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await this.options.onConfirm?.();
        this.close();
      } catch (error) {
        new Notice(`${this.options.confirmLabel || "That"} failed: ${error.message}`);
        confirm.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class GoalDueDateModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.options = options;
    this.value = options.dueDate || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `New due date for ${this.options.name}` });
    contentEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Changes due_date in the goal note. The weekly set-aside is worked out again from the new date.",
    });
    const input = contentEl.createEl("input", { type: "date", attr: { "aria-label": "Due date" } });
    input.addClass("finance-tracker-holiday-input");
    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    const actions = contentEl.createDiv({ cls: "finance-tracker-settings-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", async () => {
      if (!core.parseIsoDate(this.value)) {
        new Notice("Pick a date first.");
        return;
      }
      save.disabled = true;
      try {
        await this.options.onSave?.(this.value);
        this.close();
      } catch (error) {
        new Notice(`Saving the due date failed: ${error.message}`);
        save.disabled = false;
      }
    });
  }

  onClose() {
    this.contentEl.empty();
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
      text: "Settings follow the finance hub's areas. Everything here can also be changed later without losing anything you've logged.",
    });

    // Jump links to each section, filled in once they exist: the tab is long,
    // and on a phone scrolling to Portfolio took a while.
    const nav = containerEl.createDiv({ cls: "finance-settings-nav" });
    const sections = [];
    const addSection = (title, description) => {
      sections.push(containerEl.createEl("h3", { text: title }));
      if (description) {
        containerEl.createEl("p", {
          cls: "finance-tracker-settings-section-copy",
          text: description,
        });
      }
    };

    // Progressive disclosure: settings that are auto-detected or set once by
    // the wizard live behind a collapsed "Advanced" block, so the default view
    // shows only what someone would actually come here to change.
    const addAdvanced = (summary, description) => {
      const details = containerEl.createEl("details", { cls: "finance-tracker-advanced" });
      details.createEl("summary", { text: summary });
      if (description) {
        details.createEl("p", { cls: "finance-tracker-settings-section-copy", text: description });
      }
      return details;
    };

    addSection("General", "Applies everywhere: totals, dashboards, the sidebar and the hub.");

    this.renderVaultStatus(containerEl).catch(() => {});

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

    const hubActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(hubActions, "Open finance hub", () => this.plugin.activateHubView(), { primary: true, opensModal: true });

    addSection("Capture", "How transactions get into your daily notes.");

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

    containerEl.createEl("h4", { text: "Capture methods" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Every method below can run at the same time. Quick add and hand-typed bullets always work and are not listed.",
    });

    for (const method of core.CAPTURE_METHODS) {
      new Setting(containerEl)
        .setName(core.captureMethodLabel(method))
        .setDesc(CAPTURE_METHOD_DESCRIPTIONS[method] || "")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.isCaptureMethodEnabled(method)).onChange(async (value) => {
            if (!this.plugin.settings.captureMethods || typeof this.plugin.settings.captureMethods !== "object") {
              this.plugin.settings.captureMethods = { ...DEFAULT_SETTINGS.captureMethods };
            }
            this.plugin.settings.captureMethods[method] = value;
            await this.plugin.saveSettings();
            if (method === "gist") this.plugin.scheduleGistSync();
            this.display();
          })
        );
    }

    new Setting(containerEl)
      .setName("When two methods capture the same transaction")
      .setDesc(
        "Only ever compares captures that arrived by different methods — two identical purchases down the same method are still logged as two."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("skip", "Skip the second one")
          .addOption("warn", "Log it, but tell me")
          .addOption("off", "Log everything")
          .setValue(this.plugin.settings.crossMethodDuplicates || "skip")
          .onChange(async (value) => {
            this.plugin.settings.crossMethodDuplicates = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Duplicate window (days)")
      .setDesc("How far apart two captures can be and still count as the same purchase. Bank feeds often settle a day after the tap.")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(String(this.plugin.settings.duplicateWindowDays ?? DEFAULT_SETTINGS.duplicateWindowDays))
          .onChange(async (value) => {
            const parsed = Number(String(value).trim());
            this.plugin.settings.duplicateWindowDays = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SETTINGS.duplicateWindowDays;
            await this.plugin.saveSettings();
          })
      );

    // Evidence, not guesswork: which pairs of methods have actually been
    // logging the same transactions lately.
    const overlap = this.plugin.captureOverlapReport(60);
    new Setting(containerEl)
      .setName("Overlap check")
      .setDesc(
        overlap.length
          ? `${overlap[0].channels.map((channel) => core.describeCaptureChannel(channel)).join(" and ")} have captured the same transaction ${overlap[0].count} time${overlap[0].count === 1 ? "" : "s"} in the last 60 days.`
          : "No two methods have captured the same transaction in the last 60 days."
      )
      .addButton((button) =>
        button.setButtonText("Details").onClick(() => new CaptureOverlapModal(this.app, this.plugin).open())
      );

    if (this.plugin.isCaptureMethodEnabled("gist")) {
      const gistAdvanced = addAdvanced(
        "GitHub gist capture",
        "The phone appends a capture line to a private gist; the plugin polls it and drains it. The only method that captures without opening Obsidian and still works on an Obsidian Sync vault."
      );

      new Setting(gistAdvanced)
        .setName("Gist ID")
        .setDesc("The ID from the gist URL — the part after your username.")
        .addText((text) =>
          text.setPlaceholder("a1b2c3d4…").setValue(this.plugin.settings.gistCaptureId).onChange(async (value) => {
            this.plugin.settings.gistCaptureId = value.trim();
            await this.plugin.saveSettings();
            this.plugin.scheduleGistSync();
          })
        );

      new Setting(gistAdvanced)
        .setName("Access token")
        .setDesc("A fine-grained token with only the Gists permission. Stored in this vault's data.json in plain text — treat it like a password and revoke it if the vault is ever shared.")
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder("github_pat_…").setValue(this.plugin.settings.gistCaptureToken).onChange(async (value) => {
            this.plugin.settings.gistCaptureToken = value.trim();
            await this.plugin.saveSettings();
            this.plugin.scheduleGistSync();
          });
        });

      new Setting(gistAdvanced)
        .setName("File name")
        .setDesc("The file inside the gist that captures are appended to.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.gistCaptureFilename)
            .setValue(this.plugin.settings.gistCaptureFilename)
            .onChange(async (value) => {
              this.plugin.settings.gistCaptureFilename = value.trim() || DEFAULT_SETTINGS.gistCaptureFilename;
              await this.plugin.saveSettings();
            })
        );

      new Setting(gistAdvanced)
        .setName("Check every (minutes)")
        .setDesc("How often to poll while Obsidian is open. It also syncs on launch.")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(String(this.plugin.settings.gistCapturePollMinutes ?? DEFAULT_SETTINGS.gistCapturePollMinutes))
            .onChange(async (value) => {
              const parsed = Number(String(value).trim());
              this.plugin.settings.gistCapturePollMinutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_SETTINGS.gistCapturePollMinutes;
              await this.plugin.saveSettings();
              this.plugin.scheduleGistSync();
            })
        );

      new Setting(gistAdvanced)
        .setName(this.plugin.settings.gistCaptureLastSync ? `Last synced ${new Date(this.plugin.settings.gistCaptureLastSync).toLocaleString()}` : "Never synced")
        .addButton((button) =>
          button
            .setButtonText("Sync now")
            .setCta()
            .onClick(async () => {
              await this.plugin.syncCaptureGist({ notify: true });
              this.display();
            })
        );
    }

    const captureAdvanced = addAdvanced(
      "Advanced: note format",
      "Auto-detected from the Journals or core Daily notes plugin, and set for you by first-time setup. Changing these will not rewrite notes you have already logged."
    );

    new Setting(captureAdvanced)
      .setName("Daily notes folder")
      .setDesc("Folder that stores your daily notes. The plugin follows your core Daily notes folder and infers the existing file layout from notes already in the vault.")
      .addText((text) =>
        text.setPlaceholder("Journal/Periodics/1. Daily").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (value) => {
          this.plugin.settings.dailyNotesFolder = value.trim() || DEFAULT_SETTINGS.dailyNotesFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Finance heading")
      .setDesc("Heading the plugin looks for when reading a daily note. Legacy ## Spending notes are still parsed.")
      .addText((text) =>
        text.setPlaceholder("## Finance").setValue(this.plugin.settings.spendingHeading).onChange(async (value) => {
          this.plugin.settings.spendingHeading = value.trim() || DEFAULT_SETTINGS.spendingHeading;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Spending root tag")
      .setDesc("The root task line the plugin keeps a running total on. Changing this after you have logged anything will orphan every existing note's total.")
      .addText((text) =>
        text.setPlaceholder("#log/spending").setValue(this.plugin.settings.spendingRootTag).onChange(async (value) => {
          this.plugin.settings.spendingRootTag = value.trim() || DEFAULT_SETTINGS.spendingRootTag;
          await this.plugin.saveSettings();
        })
      );

    new Setting(captureAdvanced)
      .setName("Capture inbox folder")
      .setDesc("Folder an Apple Shortcut writes capture files into. The plugin drains it automatically.")
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.captureInboxFolder).setValue(this.plugin.settings.captureInboxFolder).onChange(async (value) => {
          this.plugin.settings.captureInboxFolder = value.trim() || DEFAULT_SETTINGS.captureInboxFolder;
          await this.plugin.saveSettings();
        })
      );

    addSection(
      "Categories",
      "Merchant → category rules. A rule matches a capture's merchant exactly, or as a whole chunk inside it, so \"woolworths\" also covers \"Woolworths/cnr Brisbane H\". Add or edit one below, or tick \"Remember this merchant\" when you categorise a transaction; remove one here if it guesses wrong."
    );

    new Setting(containerEl)
      .setName("Learn categories from past notes")
      .setDesc(
        "When no rule above matches, file the capture the way the same merchant was filed last time in your daily notes. Categorising a merchant by hand once is then enough to catch every later capture from it, with nothing to remember to tick. Rules above always win over history."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.learnCategoriesFromHistory !== false).onChange(async (value) => {
          this.plugin.settings.learnCategoriesFromHistory = value;
          await this.plugin.saveSettings();
        })
      );

    this.renderMerchantMapList(containerEl.createDiv({ cls: "finance-tracker-goal-list" })).catch(() => {});

    addSection(
      "Budgets and reviews",
      "Budgets live in a table in the budgets note. Weekly and monthly finance-dashboard blocks show every review section; show: and hide: in a block choose which."
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

    const budgetActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(budgetActions, "Open budgets note", () => this.plugin.openBudgetNote(), {
      primary: true,
      errorPrefix: "Opening budgets note",
    });

    addSection(
      "Bills and runway",
      "Bills are the notes in the Bills folder, matched to payments tagged like #log/spending/subscriptions/monthly/spotify. Until you convert, they are detected from those tags."
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
      .setName("Auto-log recurring payments")
      .setDesc("Master switch: log recurring items automatically on their due day. Each bill below can opt out with its Auto-log toggle.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.autoLogRecurring)).onChange(async (value) => {
          this.plugin.settings.autoLogRecurring = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sort bills by")
      .setDesc("Order for the Upcoming bills list, the sidebar's due-bills card, and the list below.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("dueDate", "Due date (overdue first)")
          .addOption("monthlyCostDesc", "Cost per month (highest first)")
          .addOption("amountDesc", "Amount (highest first)")
          .addOption("amountAsc", "Amount (lowest first)")
          .addOption("nameAsc", "Name (A–Z)")
          .setValue(this.plugin.settings.recurringSortOrder || "dueDate")
          .onChange(async (value) => {
            this.plugin.settings.recurringSortOrder = value;
            await this.plugin.saveSettings();
            await this.renderRecurringList(recurringListEl);
          })
      );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "Detected bills. Untick Active to pause one — it moves to the Archived section of the recurring payments block, where it can be resumed or removed for good. Auto-log logs it automatically on its due day. Both are saved on the bill's own note (or, before you convert to bill notes, in the registry table of the recurring payments note).",
    });
    const recurringListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderRecurringList(recurringListEl).catch(() => {});
    const recurringActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(recurringActions, "Open recurring payments note", () => this.plugin.openRecurringNote(), {
      primary: true,
      errorPrefix: "Opening recurring payments note",
    });
    new Setting(containerEl)
      .setName("Payment calendar range")
      .setDesc("How far ahead the recurring block's payment calendar looks. The buttons above the calendar switch it for one session.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1", "1 month")
          .addOption("3", "3 months")
          .addOption("12", "12 months")
          .setValue(String(this.plugin.settings.paymentCalendarMonths || DEFAULT_SETTINGS.paymentCalendarMonths))
          .onChange(async (value) => {
            this.plugin.settings.paymentCalendarMonths = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h4", { text: "Runway" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: "How much you need available to be safe for a chosen period, worked out from the bills above. Choose the account it comes out of and runway says whether that account's latest balance covers it. Show it with the Runway block, or at the bottom of the Bills tab.",
    });

    new Setting(containerEl)
      .setName("Runway period")
      .setDesc("How far ahead to cover. The figure is the bills that actually fall inside that window, not an average.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1 week", "1 week")
          .addOption("2 weeks", "2 weeks")
          .addOption("1 month", "1 month")
          .addOption("2 months", "2 months")
          .addOption("3 months", "3 months")
          .addOption("6 months", "6 months")
          .setValue(core.parseRunwayPeriod(this.plugin.settings.runwayPeriod).label)
          .onChange(async (value) => {
            this.plugin.settings.runwayPeriod = value;
            await this.plugin.saveSettings();
            this.plugin.refreshDailyBudgetView();
          })
      );

    new Setting(containerEl)
      .setName("What counts toward runway")
      .setDesc("Bills only, or bills plus your average discretionary spend over the last 90 days.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("spending", "Bills + usual spending")
          .addOption("bills", "Recurring bills only")
          .setValue(core.normalizeRunwayMode(this.plugin.settings.runwayMode))
          .onChange(async (value) => {
            this.plugin.settings.runwayMode = value;
            await this.plugin.saveSettings();
            this.plugin.refreshDailyBudgetView();
          })
      );

    new Setting(containerEl)
      .setName("Account")
      .setDesc("Where your bills and spending come out of. Runway compares itself with this account's latest balance snapshot: covered, or short by how much.")
      .addDropdown((dropdown) => {
        const current = this.plugin.settings.runwayAccount || "";
        dropdown.addOption("", "None");
        if (current) dropdown.addOption(current, current);
        dropdown.setValue(current);
        this.plugin
          .collectAllTransactions()
          .then((entries) => {
            for (const account of core.summarizeBalanceSnapshots(entries).accounts) {
              if (account.key !== current) dropdown.addOption(account.key, account.key);
            }
            dropdown.setValue(current);
          })
          .catch(() => {});
        dropdown.onChange(async (value) => {
          this.plugin.settings.runwayAccount = value;
          await this.plugin.saveSettings();
          this.plugin.refreshDailyBudgetView();
          this.renderRunwayStatus(runwayStatus).catch(() => {});
        });
      });

    const runwayStatus = containerEl.createDiv({ cls: "finance-tracker-vault-status" });
    this.renderRunwayStatus(runwayStatus).catch(() => {});

    addSection("Goals and trips", "Savings goals are envelopes tracked in your notes. Any goal with a target and a due date shows what to set aside each week, and prompts you when it's due or done. The finance hub's Goals & trips tab does all of this too.");
    containerEl.createEl("h4", { text: "Savings goals" });
    const savingsActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(savingsActions, "New goal", () => {
      this.plugin.openNewGoal(async () => this.display());
    }, { primary: true, opensModal: true });

    const savingsGoalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(savingsGoalListEl, "savings").catch(() => {});

    // Trips: the notes, plus trip mode, in one place. Trip mode used to be its
    // own section further down, which read as a separate feature rather than a
    // switch belonging to the trip you just picked.
    containerEl.createEl("h4", { text: "Trips" });
    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text:
      "Save for several trips at once — each note below can be active simultaneously. Spending counts as trip spending automatically when the note date falls inside a trip's start and end dates. Archiving a finished trip freezes its savings steps and spending record into the note.",
    });

    const tripActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(tripActions, "New or existing trip", () => {
      new HolidayBudgetModal(this.app, this.plugin, async () => this.display()).open();
    }, { primary: true, opensModal: true });
    addAction(tripActions, "Archive finished trips", async () => {
      await this.plugin.archiveFinishedHolidays({ notify: true });
      this.display();
    }, { errorPrefix: "Archiving trips" });
    addAction(
      tripActions,
      this.plugin.settings.tripModeActive ? "End trip mode" : "Start trip mode",
      async () => {
        if (this.plugin.settings.tripModeActive) await this.plugin.endTrip();
        else await this.plugin.startTrip();
        this.display();
      },
      { errorPrefix: "Trip mode" }
    );

    containerEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: this.plugin.settings.tripModeActive
        ? `Trip mode is on — quick add and URL captures default to this trip's tag and currency: ${this.plugin.settings.activeTripGoalPath || this.plugin.settings.activeHolidayBudgetPath}`
        : "Trip mode is off. Turn it on while you are away and quick add will default to the trip's tag and currency.",
    });

    const goalListEl = containerEl.createDiv({ cls: "finance-tracker-goal-list" });
    this.renderGoalList(goalListEl, "holiday").catch(() => {});

    addSection(
      "Portfolio",
      "Shares and ETFs, from the Trades table in your portfolio note. Figures are arithmetic on your own records, not financial or tax advice."
    );

    new Setting(containerEl)
      .setName("Price source")
      .setDesc(
        "Where share prices come from. Typed prices make no network requests. A Google Sheet and Yahoo both fetch over the internet, only when the portfolio is opened or refreshed, and only the tickers you hold are sent."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Typed in the portfolio note")
          .addOption("sheet", "A published Google Sheet")
          .addOption("yahoo", "Yahoo Finance (unofficial)")
          .setValue(this.plugin.settings.priceSource || "manual")
          .onChange(async (value) => {
            this.plugin.settings.priceSource = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    const source = this.plugin.settings.priceSource || "manual";
    if (source === "sheet") {
      new Setting(containerEl)
        .setName("Sheet link")
        .setDesc("In Google Sheets: File → Share → Publish to web → the sheet → Comma-separated values → Publish, then paste the link here.")
        .addText((text) =>
          text
            .setPlaceholder("https://docs.google.com/spreadsheets/d/e/…/pub?output=csv")
            .setValue(this.plugin.settings.priceSheetUrl || "")
            .onChange(async (value) => {
              this.plugin.settings.priceSheetUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );
      const help = containerEl.createEl("details", { cls: "finance-tracker-advanced" });
      help.createEl("summary", { text: "Set up the sheet" });
      help.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "Copy this into cell A1 of a new Google Sheet. It has a row for each ticker you hold and each foreign currency, with the formulas already written.",
      });
      const template = help.createEl("textarea", { cls: "finance-price-sheet-template", attr: { rows: "6", readonly: "readonly" } });
      this.plugin
        .loadPortfolio()
        .then((portfolio) => {
          const tickers = Array.from(new Set(portfolio.trades.map((trade) => trade.ticker)));
          const currencies = Array.from(new Set(portfolio.trades.map((trade) => trade.currency)));
          template.value = core.buildPriceSheetTemplate(tickers.length ? tickers : ["VAS.AX", "AAPL"], currencies.length ? currencies : ["USD"]);
        })
        .catch(() => {});
    }
    if (source === "yahoo") {
      containerEl.createEl("p", {
        cls: "finance-tracker-settings-section-copy",
        text: "Yahoo's price feed is free but unofficial: it can refuse requests or change without notice. When it refuses, the plugin backs off and keeps showing the last prices it fetched, marked as old.",
      });
    }
    if (source !== "manual") {
      new Setting(containerEl)
        .setName("Refresh at most every (minutes)")
        .setDesc("Opening the portfolio refreshes prices when they are older than this.")
        .addText((text) =>
          text.setValue(String(this.plugin.settings.priceRefreshMinutes || 60)).onChange(async (value) => {
            const minutes = Number(value);
            this.plugin.settings.priceRefreshMinutes = Number.isFinite(minutes) && minutes >= 5 ? Math.floor(minutes) : 60;
            await this.plugin.saveSettings();
          })
        );
    }

    const portfolioActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(portfolioActions, "Open portfolio", () => this.plugin.openPortfolioNote(), { primary: true, errorPrefix: "Opening the portfolio" });

    addSection("Files and setup", "Where the plugin keeps its notes, and the guided setup, which creates any starter notes that are missing and never overwrites one.");
    const setupActions = containerEl.createDiv({ cls: "finance-tracker-settings-actions" });
    addAction(setupActions, "Set up finance notes", () => new SetupWizardModal(this.app, this.plugin).open(), {
      opensModal: true,
    });
    const filesAdvanced = addAdvanced("Advanced: file locations", "Set for you by first-time setup.");

    new Setting(filesAdvanced)
      .setName("Budgets folder")
      .setDesc("Folder where the default budget, trip budgets, and the recurring payments note live.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets").setValue(this.plugin.settings.budgetsFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetsFolderPath = value.trim() || DEFAULT_SETTINGS.budgetsFolderPath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(filesAdvanced)
      .setName("Budget archive folder")
      .setDesc("Trips and goals are moved here when you archive them.")
      .addText((text) =>
        text.setPlaceholder("Utility/Budgets/Archive").setValue(this.plugin.settings.budgetArchiveFolderPath).onChange(async (value) => {
          this.plugin.settings.budgetArchiveFolderPath = value.trim() || DEFAULT_SETTINGS.budgetArchiveFolderPath;
          await this.plugin.saveSettings();
        })
      );

    new Setting(filesAdvanced)
      .setName("Recurring payments note")
      .setDesc("Filename of the bill-management note, inside the budgets folder.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.recurringNoteName)
          .setValue(this.plugin.settings.recurringNoteName)
          .onChange(async (value) => {
            this.plugin.settings.recurringNoteName = value.trim() || DEFAULT_SETTINGS.recurringNoteName;
            await this.plugin.saveSettings();
          })
      );

    new Setting(filesAdvanced)
      .setName("Budgets note name")
      .setDesc("Filename of the default budget note, inside the budgets folder.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultBudgetNoteName)
          .setValue(this.plugin.settings.defaultBudgetNoteName)
          .onChange(async (value) => {
            this.plugin.settings.defaultBudgetNoteName = value.trim() || DEFAULT_SETTINGS.defaultBudgetNoteName;
            await this.plugin.saveSettings();
          })
      );


    for (const heading of sections) {
      const link = nav.createEl("button", { cls: "finance-settings-nav-link", text: heading.textContent || heading.text || "" });
      link.addEventListener("click", () => heading.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  }

  // The three note-format settings are each a text box where a wrong value
  // silently yields empty dashboards and no error at all. This says out loud
  // what the plugin can currently see, which catches a misconfiguration faster
  // than any amount of setting description.
  async renderVaultStatus(containerEl) {
    const statusEl = containerEl.createDiv({ cls: "finance-tracker-vault-status" });
    statusEl.setText("Checking your vault…");
    try {
      const entries = await this.plugin.collectAllTransactions();
      const notes = new Set(entries.map((entry) => entry.filePath).filter(Boolean));
      statusEl.empty();
      if (!entries.length) {
        statusEl.addClass("is-warning");
        statusEl.setText(
          `No logged entries found yet. The plugin is reading "${this.plugin.settings.dailyNotesFolder}" and looking for a "${this.plugin.settings.spendingHeading}" heading — check those under Advanced if you expected to see something here.`
        );
        return;
      }
      statusEl.addClass("is-ok");
      const dates = entries.map((entry) => entry.date).filter(Boolean).sort();
      statusEl.setText(
        `Reading ${entries.length} entries across ${notes.size} note${notes.size === 1 ? "" : "s"}` +
          (dates.length ? ` — ${dates[0]} to ${dates[dates.length - 1]}.` : ".")
      );
    } catch (error) {
      statusEl.empty();
      statusEl.addClass("is-warning");
      statusEl.setText(`Could not read your notes: ${error.message}`);
    }
  }

  // Shows the figure the two dropdowns above produce, so the setting is not
  // abstract: you pick a period and immediately see what it costs.
  async renderRunwayStatus(statusEl) {
    statusEl.setText("Working out your runway…");
    try {
      const runway = await this.plugin.computeRunwayState(core.todayIsoLocal());
      statusEl.empty();
      statusEl.addClass(runway.target > 0 ? "is-ok" : "is-warning");
      const currency = this.plugin.settings.defaultCurrency;
      const balance = runway.balance
        ? runway.balance.status === "covered"
          ? ` ${runway.accountLabel} covers it with ${core.formatCurrency(runway.balance.difference, currency)} to spare.`
          : ` ${runway.accountLabel} is short by ${core.formatCurrency(Math.abs(runway.balance.difference), currency)}.`
        : "";
      statusEl.setText(
        runway.target > 0
          ? `Right now: keep ${core.formatCurrency(runway.target, currency)} available for the next ${runway.period}, with ${runway.occurrences.length} bill${
              runway.occurrences.length === 1 ? "" : "s"
            } due by ${runway.windowEnd}.${balance}`
          : `No bills fall inside the next ${runway.period}, so there is nothing to set aside yet.`
      );
    } catch (error) {
      statusEl.empty();
      statusEl.addClass("is-warning");
      statusEl.setText(`Could not work out your runway: ${error.message}`);
    }
  }

  // The merchant map was remove-only, and its empty state said the checkbox was
  // the only way in — which stopped being true when learning from history
  // shipped. You can add and edit rules here, and ask what a given descriptor
  // would be filed as before it arrives.
  async renderMerchantMapList(listEl) {
    listEl.empty();
    const plugin = this.plugin;
    const known = await plugin.collectKnownSuggestions();

    const categoryItems = (query) => {
      const needle = core.normalizeCategoryPath(query);
      const out = known.categories
        .filter((path) => !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle)))
        .slice(0, 8)
        .map((path) => ({ value: path, label: core.displayCategoryPath(path), kind: "category" }));
      if (needle && !known.categories.includes(needle)) {
        out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
      }
      return out;
    };

    const addCard = listEl.createDiv({ cls: "finance-tracker-budget-card" });
    addCard.createDiv({ cls: "finance-tracker-budget-title", text: "Add a rule" });
    const merchantRow = addCard.createDiv({ cls: "finance-edit-row" });
    merchantRow.createEl("label", { text: "Merchant" });
    const merchantInput = merchantRow.createEl("input", { type: "text", attr: { placeholder: "Woolworths", "aria-label": "Merchant" } });
    new FinanceSuggest(merchantInput, {
      getItems: (query) => {
        const needle = String(query || "").toLowerCase();
        return known.merchants
          .filter((merchant) => !needle || merchant.name.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((merchant) => ({ value: merchant.name, label: merchant.name, kind: "merchant" }));
      },
    });
    const categoryRow = addCard.createDiv({ cls: "finance-edit-row" });
    categoryRow.createEl("label", { text: "Category" });
    const categoryInput = categoryRow.createEl("input", { type: "text", attr: { placeholder: "food/groceries", "aria-label": "Rule category" } });
    new FinanceSuggest(categoryInput, { getItems: categoryItems });
    addAction(
      addCard.createDiv({ cls: "finance-tracker-header-actions" }),
      "Add rule",
      async () => {
        await plugin.rememberMerchantCategory(merchantInput.value, categoryInput.value);
        await this.renderMerchantMapList(listEl);
      },
      { primary: true, errorPrefix: "Adding the rule" }
    );

    const testCard = listEl.createDiv({ cls: "finance-tracker-budget-card" });
    testCard.createDiv({ cls: "finance-tracker-budget-title", text: "What would this be filed as?" });
    const testInput = testCard.createEl("input", {
      type: "text",
      attr: { placeholder: "SQ * Milk N Mochi Pty Ltd", "aria-label": "Test a merchant" },
    });
    const testResult = testCard.createDiv({ cls: "finance-tracker-budget-meta", text: "Paste a merchant exactly as your bank sends it." });
    const runTest = async () => {
      const value = testInput.value.trim();
      if (!value) {
        testResult.setText("Paste a merchant exactly as your bank sends it.");
        return;
      }
      const suggestion = await plugin.suggestCategoryForMerchant(value);
      const reason = plugin.describeSuggestionSource(suggestion.source);
      testResult.setText(
        suggestion.category
          ? `${core.displayCategoryPath(suggestion.category)} — ${reason}. Grouped as "${core.merchantRootKey(value)}".`
          : `Nothing matches, so it would be logged uncategorised. Grouped as "${core.merchantRootKey(value)}".`
      );
    };
    testInput.addEventListener("input", () => runTest());
    testInput.addEventListener("change", () => runTest());

    const entries = Object.entries(plugin.settings.merchantMap || {}).sort((left, right) => left[0].localeCompare(right[0]));
    if (!entries.length) {
      listEl.createDiv({
        cls: "finance-tracker-empty",
        text: "No rules yet. Add one above, tick \"remember this merchant\" when filing an entry, or let the plugin follow how you filed a merchant last time.",
      });
      return;
    }

    listEl.createEl("p", {
      cls: "finance-tracker-settings-section-copy",
      text: `${entries.length} rule${entries.length === 1 ? "" : "s"}. A rule beats what your notes say, so this is where you overrule a bad precedent.`,
    });

    for (const [merchant, category] of entries) {
      const setting = new Setting(listEl).setName(merchant);
      setting.addText((text) => {
        text.setValue(category).onChange(async (value) => {
          const next = core.normalizeCategoryPath(value);
          if (!next) return;
          plugin.settings.merchantMap = { ...plugin.settings.merchantMap, [merchant]: next };
          plugin._merchantSources = null;
          await plugin.saveSettings();
        });
        new FinanceSuggest(text.inputEl, { getItems: categoryItems });
      });
      setting.addButton((button) =>
        button.setButtonText("Remove").onClick(async () => {
          await plugin.forgetMerchantCategory(merchant);
          await this.renderMerchantMapList(listEl);
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
    // Every bill in the author's registry said Auto-log "yes" while the master
    // switch was off, so nothing was ever auto-logged and nothing said so.
    if (!this.plugin.settings.autoLogRecurring) {
      listEl.createDiv({
        cls: "finance-tracker-budget-meta",
        text: "Auto-log is switched off above, so the Auto-log ticks below have no effect until you turn it on.",
      });
    }
    const scroll = listEl.createDiv({ cls: "finance-tracker-recurring-settings-scroll" });
    const header = scroll.createDiv({ cls: "finance-tracker-recurring-settings-header" });
    header.createSpan({ text: "Bill" });
    header.createSpan({ text: "Active" });
    header.createSpan({ text: "Auto-log" });
    for (const item of items) {
      const bits = [
        cadenceLabel(item.cadence),
        core.formatCurrency(item.lastAmount, item.currency || this.plugin.settings.defaultCurrency),
      ];
      if (item.nextDue) bits.push(`next due ${item.nextDue}`);
      const row = scroll.createDiv({ cls: "finance-tracker-recurring-settings-row" });
      const nameCell = row.createDiv({ cls: "finance-tracker-recurring-name" });
      nameCell.createDiv({ text: item.label });
      nameCell.createDiv({ cls: "finance-tracker-budget-meta", text: bits.join(" · ") });

      const currentLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Active" } });
      const currentCheckbox = currentLabel.createEl("input", { type: "checkbox" });
      currentCheckbox.checked = true;
      currentCheckbox.addEventListener("change", async () => {
        currentCheckbox.disabled = true;
        await this.plugin.updateRecurringItem(item, { active: currentCheckbox.checked });
        await this.renderRecurringList(listEl);
      });

      const autoLabel = row.createEl("label", { cls: "finance-tracker-recurring-check", attr: { "aria-label": "Auto-log" } });
      const autoCheckbox = autoLabel.createEl("input", { type: "checkbox" });
      autoCheckbox.checked = item.autoLog !== false;
      autoCheckbox.addEventListener("change", async () => {
        autoCheckbox.disabled = true;
        await this.plugin.updateRecurringItem(item, { autoLog: autoCheckbox.checked });
        autoCheckbox.disabled = false;
      });
    }
  }

  // Lists non-archived goal notes with an Active toggle (several holidays can
  // be saved for at once) and a per-note Archive button. `kind` scopes the
  // list to just trips ("holiday") or just plain savings goals ("savings") so
  // each settings section only shows its own notes — a savings goal has no
  // trip_tag and shouldn't render under Holiday budgets.
  async renderGoalList(listEl, kind = "all") {
    listEl.empty();
    const today = core.todayIsoLocal();
    const files = this.plugin.getHolidayBudgetFiles();
    const rows = [];
    for (const file of files) {
      const meta = await this.plugin.readHolidayBudgetFile(file);
      const generic = meta?.holidayKey ? null : this.plugin.parseSavingsGoalContent(await this.app.vault.cachedRead(file), file.path);
      if (!meta?.holidayKey && !generic?.goalKey) continue;
      if (meta?.archivedDate || generic?.archivedDate) continue;
      const isHoliday = Boolean(meta?.holidayKey);
      if (kind === "holiday" && !isHoliday) continue;
      if (kind === "savings" && isHoliday) continue;
      rows.push({ file, meta, generic });
    }

    if (!rows.length) {
      const emptyText =
        kind === "holiday" ? "No trips yet." : kind === "savings" ? "No savings goals yet." : "No goal or holiday notes yet.";
      listEl.createDiv({ cls: "finance-tracker-empty", text: emptyText });
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
          await this.renderGoalList(listEl, kind);
        })
      );
    }
  }
}

module.exports = FinanceTrackerPlugin;

/* nosourcemap */