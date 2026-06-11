"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../finance-core");

test("parses uppercase log spending tags and picks the final visible amount", () => {
  const content = `
## Spending
- [ ] #log/spending
\t- R$90.20 - $25.85 #log/25/Brazil/Spending/Food/Restaurants
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2025/10/2025-10-04.md", {
    defaultCurrency: "AUD",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 25.85);
  assert.equal(entries[0].category, "food/restaurants");
});

test("parses lowercase travel spending tags like japan trip notes", () => {
  const content = `
## Spending
- [ ] #log/spending
\t- YEN 2200 - $22.15 #log/25/japan/spending/food/snacks
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2025/10/2025-10-04.md", {
    defaultCurrency: "AUD",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 22.15);
  assert.equal(entries[0].category, "food/snacks");
  assert.equal(entries[0].holidayKey, "25/japan");
});

test("parses holiday spending tags without polluting the category path", () => {
  const content = `
## Spending
- [ ] #log/spending
\t- $41.50 #log/spending/2026/japan/food/restaurants
\t\t- Ichiran
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/04/2026-04-30.md", {
    defaultCurrency: "AUD",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "food/restaurants");
  assert.equal(entries[0].holidayKey, "2026/japan");
  assert.equal(entries[0].merchant, "Ichiran");
});

test("parses planned holiday payment tags separately from real spending", () => {
  const content = `
## Spending
- $671.49 #log/spending/26/japanmidyear/planned/flights
\t- Jetstar return
\t\t- 2026-06-18
\t\t- [[_ Brisbane Airport]]
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/04/2026-04-30.md", {
    defaultCurrency: "AUD",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].holidayKey, "26/japanmidyear");
  assert.equal(entries[0].isPlannedExpense, true);
  assert.equal(entries[0].plannedCategory, "flights");
  assert.equal(entries[0].category, "flights");
  assert.equal(entries[0].plannedStartDate, "2026-06-18");
  assert.equal(entries[0].plannedEndDate, "2026-06-18");
  assert.equal(entries[0].plannedDetailLinks[0].path, "_ Brisbane Airport");
});

test("parses short planned holiday tags with inline start and end dates", () => {
  const content = `
## Finance
- $500 #log/26/Japanmidyear/planned/accommodation 2026-06-18 2026-06-22
\t- [[_ Tokyo Hotel Example]]
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/05/2026-05-04.md", {
    defaultCurrency: "AUD",
    financeHeading: "## Finance",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].holidayKey, "26/japanmidyear");
  assert.equal(entries[0].isPlannedExpense, true);
  assert.equal(entries[0].plannedCategory, "accommodation");
  assert.equal(entries[0].plannedStartDate, "2026-06-18");
  assert.equal(entries[0].plannedEndDate, "2026-06-22");
  assert.equal(entries[0].plannedDetailLinks[0].path, "_ Tokyo Hotel Example");
});

test("parses finance-section income contributions", () => {
  const content = `
## Finance
- $300 #log/income/japanmidyear
\t- Savings transfer
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/05/2026-05-01.md", {
    defaultCurrency: "AUD",
    financeHeading: "## Finance",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].entryType, "income");
  assert.equal(entries[0].goalKey, "japanmidyear");
  assert.equal(entries[0].isGoalContribution, true);
});

test("parses comma-formatted finance income amounts and ignores child note lines", () => {
  const content = `
## Finance
- $750 #log/income/JapanMidYear
\t- transfer from holiday fund
- $1,460.32 #log/income/JapanMidYear
\t- Income for Flights
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/05/2026-05-04.md", {
    defaultCurrency: "AUD",
    financeHeading: "## Finance",
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].amount, 750);
  assert.equal(entries[1].amount, 1460.32);
  assert.equal(entries[1].goalKey, "japanmidyear");
});

test("parses generic savings-goal withdrawals", () => {
  const content = `
## Finance
- $120 #log/spending/goal/rainy-day-fund/emergency
\t- Tyre replacement
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/05/2026-05-01.md", {
    defaultCurrency: "AUD",
    financeHeading: "## Finance",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].entryType, "goal-withdrawal");
  assert.equal(entries[0].goalKey, "rainy-day-fund");
  assert.equal(entries[0].isGoalWithdrawal, true);
});

test("inserts a new transaction and updates the daily spending total", () => {
  const initial = `---\ndate: 2026-04-29\n---\n\n## Spending\n- [ ] #log/spending 0\n`;
  const next = core.insertTransactionIntoDailyNote(
    initial,
    {
      amount: 14.95,
      category: "food/groceries",
      currency: "AUD",
      date: "2026-04-29",
      merchant: "Woolworths",
      note: "Milk and fruit",
      source: "apple-pay",
    },
    {
      spendingHeading: "## Spending",
      spendingRootTag: "#log/spending",
    }
  );

  assert.match(next, /#log\/spending 14\.95/);
  assert.match(next, /- \$14\.95/);
  assert.match(next, /\t\t- Woolworths/);
  assert.match(next, /#log\/spending\/food\/groceries/);
  assert.doesNotMatch(next, /\[finance-/);
});

test("parses budgets from a markdown table", () => {
  const content = `
| Name | Category | Limit | Period | Currency |
| --- | --- | ---: | --- | --- |
| Groceries | food/groceries | 120 | week | AUD |
| All Spending | all | 400 | month | AUD |
`.trim();

  const budgets = core.parseBudgets(content, "AUD");
  assert.equal(budgets.length, 2);
  assert.equal(budgets[0].category, "food/groceries");
  assert.equal(budgets[1].category, "all");
});

test("builds CSV output with stable headers", () => {
  const csv = core.buildCsv([
    {
      amount: 14.95,
      card: "Visa",
      category: "food/groceries",
      categoryDisplay: "Food / Groceries",
      currency: "AUD",
      date: "2026-04-29",
      filePath: "Journal/Periodics/1. Daily/2026/04/2026-04-29.md",
      merchant: "Woolworths",
      name: "Woolworths",
      note: "Milk",
      transaction: "Apple Pay",
      source: "apple-pay",
    },
  ]);

  assert.match(csv, /^date,amount,currency,category,/);
  assert.match(csv, /2026-04-29,14\.95,AUD,food\/groceries/);
});

test("writes holiday-tagged captures when a holiday key is supplied", () => {
  const block = core.buildTransactionBlock(
    {
      amount: 32,
      category: "shopping",
      currency: "AUD",
      holidayKey: "2026/japan",
      merchant: "Loft",
    },
    {
      defaultCurrency: "AUD",
    }
  );

  assert.equal(block[0], "\t- $32.00 #log/spending/2026/japan/shopping");
});

test("writes foreign-currency holiday captures with converted AUD display", () => {
  const block = core.buildTransactionBlock(
    {
      amount: 17.46,
      category: "food/restaurants",
      currency: "AUD",
      holidayKey: "2026/japan",
      merchant: "Ichiran",
      originalAmount: 1800,
      originalCurrency: "YEN",
    },
    {
      defaultCurrency: "AUD",
    }
  );

  assert.equal(block[0], "\t- ¥1,800 JPY : $17.46 AUD #log/spending/2026/japan/food/restaurants");
});

test("writes cash exchange lines distinctly from card exchange lines", () => {
  const block = core.buildTransactionBlock(
    {
      amount: 18.1,
      category: "food/restaurants",
      currency: "AUD",
      holidayKey: "2026/japan",
      merchant: "Ramen Alley",
      originalAmount: 1800,
      originalCurrency: "YEN",
      originalRateKey: "JPY_CASH",
    },
    {
      defaultCurrency: "AUD",
    }
  );

  assert.equal(block[0], "\t- ¥1,800 JPY CASH : $18.10 AUD #log/spending/2026/japan/food/restaurants");
});

test("calculates monday-start week ranges", () => {
  const range = core.toPeriodRange({
    period: "week",
    referenceDate: "2026-04-30",
    weekStartsOn: "monday",
  });

  assert.equal(range.start, "2026-04-27");
  assert.equal(range.end, "2026-05-03");
});

test("parses fortnight budget periods", () => {
  const content = `
| Name | Category | Limit | Period | Currency |
| --- | --- | ---: | --- | --- |
| Fun | recreation | 120 | fortnight | AUD |
`.trim();

  const budgets = core.parseBudgets(content, "AUD");
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].period, "fortnight");
});

test("orders daily budget sections from a weekly base period", () => {
  assert.deepEqual(core.getDailyBudgetSectionPeriods("week"), [
    "week",
    "fortnight",
    "month",
    "quarter",
    "year",
  ]);
});

test("orders daily budget sections from a fortnight base period", () => {
  assert.deepEqual(core.getDailyBudgetSectionPeriods("fortnight"), [
    "fortnight",
    "month",
    "quarter",
    "year",
  ]);
});

test("orders daily budget sections from a monthly base period", () => {
  assert.deepEqual(core.getDailyBudgetSectionPeriods("month"), [
    "month",
    "quarter",
    "year",
  ]);
});

test("allows shorter budget periods to roll into larger daily sections", () => {
  assert.equal(core.canRollBudgetPeriodIntoSection("week", "fortnight"), true);
  assert.equal(core.canRollBudgetPeriodIntoSection("week", "month"), true);
  assert.equal(core.canRollBudgetPeriodIntoSection("fortnight", "month"), true);
  assert.equal(core.canRollBudgetPeriodIntoSection("month", "quarter"), true);
});

test("does not roll larger budget periods into smaller daily sections", () => {
  assert.equal(core.canRollBudgetPeriodIntoSection("fortnight", "week"), false);
  assert.equal(core.canRollBudgetPeriodIntoSection("month", "fortnight"), false);
  assert.equal(core.canRollBudgetPeriodIntoSection("quarter", "month"), false);
});

test("calculates yearly ranges", () => {
  const range = core.toPeriodRange({
    period: "year",
    referenceDate: "2026-04-30",
  });

  assert.equal(range.start, "2026-01-01");
  assert.equal(range.end, "2026-12-31");
});

test("scales weekly budgets into fortnight ranges", () => {
  const scaled = core.scaleBudgetLimit(
    100,
    "week",
    { start: "2026-04-27", end: "2026-05-10" },
    "2026-04-30",
    "monday"
  );

  assert.equal(scaled, 200);
});

test("scales weekly and fortnight budgets into a monthly range using calendar days", () => {
  const weeklyScaled = core.scaleBudgetLimit(
    100,
    "week",
    { start: "2026-04-01", end: "2026-04-30" },
    "2026-04-30",
    "monday"
  );
  const fortnightScaled = core.scaleBudgetLimit(
    200,
    "fortnight",
    { start: "2026-04-01", end: "2026-04-30" },
    "2026-04-30",
    "monday"
  );

  assert.equal(weeklyScaled, 428.57);
  assert.equal(fortnightScaled, 428.57);
});

test("scales weekly, fortnight, and monthly budgets into a quarter range", () => {
  const weeklyScaled = core.scaleBudgetLimit(
    100,
    "week",
    { start: "2026-04-01", end: "2026-06-30" },
    "2026-05-01",
    "monday"
  );
  const fortnightScaled = core.scaleBudgetLimit(
    200,
    "fortnight",
    { start: "2026-04-01", end: "2026-06-30" },
    "2026-05-01",
    "monday"
  );
  const monthlyScaled = core.scaleBudgetLimit(
    500,
    "month",
    { start: "2026-04-01", end: "2026-06-30" },
    "2026-05-01",
    "monday"
  );

  assert.equal(weeklyScaled, 1300);
  assert.equal(fortnightScaled, 1300);
  assert.equal(monthlyScaled, 1467.74);
});

test("builds planned expense summaries with booked overrides and fully paid matching", () => {
  const summary = core.buildPlannedExpenseSummary(
    [
      { item: "Flights", category: "flights", planned: 1300, booked: 1296.47, startDate: "2026-06-18", endDate: "2026-06-18", link: "[[_ Brisbane Airport]]" },
      { item: "Shopping", category: "shopping", planned: 400, booked: 0 },
    ],
    [
      { amount: 624.98, holidayKey: "26/japanmidyear", isPlannedExpense: true, plannedCategory: "flights" },
      { amount: 671.49, holidayKey: "26/japanmidyear", isPlannedExpense: true, plannedCategory: "flights" },
    ]
  );

  assert.equal(summary.rows[0].effectiveAmount, 1296.47);
  assert.equal(summary.rows[0].paidFromLog, 1296.47);
  assert.equal(summary.rows[0].isFullyPaid, true);
  assert.equal(summary.rows[0].startDate, "2026-06-18");
  assert.equal(summary.rows[0].endDate, "2026-06-18");
  assert.equal(summary.rows[0].link, "[[_ Brisbane Airport]]");
  assert.equal(summary.rows[1].effectiveAmount, 400);
  assert.equal(summary.totals.effective, 1696.47);
});

test("builds allocated expense summaries with per-day amounts", () => {
  const summary = core.buildAllocatedExpenseSummary(
    [
      { item: "Food Across Trip", category: "food", allocated: 900, startDate: "2026-06-18", endDate: "2026-07-08", link: "[[_ Japan Food Ideas]]" },
      { item: "Transport", category: "transport", allocated: 400 },
    ],
    "2026-06-18",
    "2026-07-08"
  );

  assert.equal(summary.rows.length, 2);
  assert.equal(summary.rows[0].allocatedPerDay, 42.86);
  assert.equal(summary.rows[1].startDate, "2026-06-18");
  assert.equal(summary.rows[1].endDate, "2026-07-08");
  assert.equal(summary.totals.allocated, 1300);
});

test("calculates remaining trip days inclusively", () => {
  assert.equal(core.getRemainingTripDaysInclusive("2026-06-18", "2026-07-08", "2026-06-18"), 21);
  assert.equal(core.getRemainingTripDaysInclusive("2026-06-18", "2026-07-08", "2026-06-20"), 19);
  assert.equal(core.getRemainingTripDaysInclusive("2026-06-18", "2026-07-08", "2026-07-09"), 0);
});

test("summarizes dual-phase holiday savings goals", () => {
  const beforeTrip = core.summarizeGoalProgress(
    {
      goalKey: "japanmidyear",
      savingsDisplayMode: "dual-phase",
      savingsProgressMode: "account-plus-paid-planned",
      savingsGoalAmount: 7000,
      savingsStartingBalance: 800,
      savingsDueDate: "2026-06-18",
      startDate: "2026-06-18",
      totalBudget: 7000,
      paidPlannedExpenses: 1460.32,
    },
    [
      { amount: 1000, date: "2026-05-01", goalKey: "japanmidyear", isGoalContribution: true, isGoalWithdrawal: false },
      { amount: 500, date: "2026-05-10", goalKey: "japanmidyear", isGoalContribution: false, isGoalWithdrawal: true },
    ],
    "2026-05-15",
    { period: "week", weekStartsOn: "monday" }
  );

  assert.equal(beforeTrip.currentAccountBalance, 1300);
  assert.equal(beforeTrip.paidPlannedExpenses, 1460.32);
  assert.equal(beforeTrip.savedProgress, 2760.32);
  assert.equal(beforeTrip.currentSaved, 2760.32);
  assert.equal(beforeTrip.amountRemaining, 4239.68);
  assert.equal(beforeTrip.amountRemainingLabel, "Still Need To Save");
});

test("parseInboxLine reads pipe-delimited capture payloads", () => {
  const params = core.parseInboxLine("amount=12 | cat=food/restaurants | merchant=Nobu | date=2026-06-08 | source=apple-pay");
  assert.equal(params.amount, "12");
  assert.equal(params.category, "food/restaurants");
  assert.equal(params.merchant, "Nobu");
  assert.equal(params.name, "Nobu");
  assert.equal(params.date, "2026-06-08");
  assert.equal(params.source, "apple-pay");
});

test("parseInboxLine reads obsidian capture URLs and aliases", () => {
  const params = core.parseInboxLine("obsidian://finance-capture?vault=Brain&amount=8.50&category=transport&payee=Lime&wiseid=ABC123");
  assert.equal(params.amount, "8.50");
  assert.equal(params.category, "transport");
  assert.equal(params.merchant, "Lime");
  assert.equal(params.externalid, "ABC123");
});

test("parseInboxLine reads bullet and positional shorthand", () => {
  const bullet = core.parseInboxLine("- $12 #log/spending/food/restaurants Nobu");
  assert.equal(bullet.amount, 12);
  assert.equal(bullet.category, "food/restaurants");
  assert.equal(bullet.merchant, "Nobu");

  const positional = core.parseInboxLine("12 food/snacks Morning Coffee");
  assert.equal(positional.amount, 12);
  assert.equal(positional.category, "food/snacks");
  assert.equal(positional.merchant, "Morning Coffee");

  assert.equal(core.parseInboxLine("# a comment"), null);
  assert.equal(core.parseInboxLine("no amount here"), null);
});

test("buildInboxLine round-trips through parseInboxLine", () => {
  const line = core.buildInboxLine({ amount: 12.5, category: "food/restaurants", merchant: "Nobu", date: "2026-06-08", currency: "AUD", source: "manual" });
  const params = core.parseInboxLine(line);
  assert.equal(core.parseNumber(params.amount), 12.5);
  assert.equal(params.category, "food/restaurants");
  assert.equal(params.merchant, "Nobu");
  assert.equal(params.date, "2026-06-08");
});

test("parseQuickAddInput extracts amount, category, merchant and date token", () => {
  const a = core.parseQuickAddInput("12 nobu restaurants", ["food/restaurants", "transport"]);
  assert.equal(a.amount, 12);
  assert.equal(a.category, "food/restaurants");
  assert.equal(a.merchant, "nobu");

  const b = core.parseQuickAddInput("12.50 coffee snacks @sat", ["food/snacks"]);
  assert.equal(b.amount, 12.5);
  assert.equal(b.category, "food/snacks");
  assert.equal(b.merchant, "coffee");
  assert.equal(b.dateToken, "sat");

  const c = core.parseQuickAddInput("$8 #transport/rideshare Lime");
  assert.equal(c.amount, 8);
  assert.equal(c.category, "transport/rideshare");
  assert.equal(c.merchant, "Lime");
});

test("transactionFingerprint is stable across merchant casing and currency formatting", () => {
  const a = core.transactionFingerprint({ date: "2026-06-08", amount: 12, merchant: "NOBU Sydney" });
  const b = core.transactionFingerprint({ date: "2026-06-08", amount: 12.0, merchant: "nobu sydney" });
  assert.equal(a, b);
  assert.equal(a, "2026-06-08|12.00|nobusydney");
});

test("parseBankCsv reads a single signed-amount statement (ANZ-style)", () => {
  const csv = [
    "Date,Amount,Description",
    "08/06/2026,-12.50,NOBU SYDNEY",
    "08/06/2026,2400.00,SALARY ACME",
    "09/06/2026,-4.20,COFFEE CLUB",
  ].join("\n");
  const rows = core.parseBankCsv(csv, { dateOrder: "DMY" });
  assert.equal(rows.length, 2); // income row skipped
  assert.equal(rows[0].date, "2026-06-08");
  assert.equal(rows[0].amount, 12.5);
  assert.equal(rows[0].merchant, "NOBU SYDNEY");
  assert.equal(rows[1].amount, 4.2);
});

test("parseBankCsv reads separate debit/credit columns (Wise-style) with currency", () => {
  const csv = [
    "Date,Merchant,Debit,Credit,Currency",
    "2026-06-21,FamilyMart,330,,JPY",
    "2026-06-21,Refund,,500,JPY",
  ].join("\n");
  const rows = core.parseBankCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 330);
  assert.equal(rows[0].currency, "JPY");
  assert.equal(rows[0].merchant, "FamilyMart");
});

test("recomputeSpendingTotals heals a stale running total but preserves correct ones", () => {
  const settings = { spendingHeading: "## Finance", spendingRootTag: "#log/spending", defaultCurrency: "AUD" };
  const stale = [
    "---",
    "date: 2026-06-10",
    "---",
    "",
    "## Finance",
    "- [ ] #log/spending 999",
    "\t- $12.00 #log/spending/food/restaurants",
    "\t\t- Nobu",
    "\t- $4.20 #log/spending/food/snacks",
    "",
    "## Notes",
  ].join("\n");
  const healed = core.recomputeSpendingTotals(stale, settings);
  assert.match(healed, /- \[ \] #log\/spending 16\.2\b/);
  // checkbox state is preserved
  const checked = stale.replace("- [ ]", "- [x]");
  const healedChecked = core.recomputeSpendingTotals(checked, settings);
  assert.match(healedChecked, /- \[x\] #log\/spending 16\.2\b/);
  // already-correct totals return the input unchanged (no spurious writes)
  assert.equal(core.recomputeSpendingTotals(healed, settings), healed);
});

test("computeBudgetPace projects overspend and a safe per-day amount mid-period", () => {
  const pace = core.computeBudgetPace({
    limit: 140,
    spent: 90,
    periodStart: "2026-06-08", // Monday
    periodEnd: "2026-06-14",   // Sunday
    referenceDate: "2026-06-10", // Wednesday, day 3 of 7
  });
  assert.equal(pace.totalDays, 7);
  assert.equal(pace.elapsedDays, 3);
  assert.equal(pace.pacedSpend, 60); // 140 * 3/7
  assert.equal(pace.projected, 210); // 90 / (3/7)
  assert.equal(pace.onPace, false);
  assert.equal(pace.remainingDays, 5); // Wed..Sun inclusive
  assert.equal(pace.perDayRemaining, 10); // (140-90)/5
});

test("computeBudgetPace reports on-pace when under the time-scaled line", () => {
  const pace = core.computeBudgetPace({
    limit: 140, spent: 30,
    periodStart: "2026-06-08", periodEnd: "2026-06-14", referenceDate: "2026-06-10",
  });
  assert.equal(pace.onPace, true);
  assert.equal(pace.projected, 70);
  assert.equal(pace.perDayRemaining, 22); // (140-30)/5
});

test("replaceTransactionBlock rewrites an entry in place and fixes the total", () => {
  const settings = { spendingHeading: "## Finance", spendingRootTag: "#log/spending", defaultCurrency: "AUD" };
  const content = [
    "---", "date: 2026-06-10", "---", "",
    "## Finance",
    "- [ ] #log/spending 16.2",
    "\t- $12.00 #log/spending/food/restaurants",
    "\t\t- Nobu",
    "\t- $4.20 #log/spending/food/snacks",
  ].join("\n");
  const oldLine = "\t- $12.00 #log/spending/food/restaurants";
  const next = core.replaceTransactionBlock(content, oldLine, {
    amount: 20, category: "food/restaurants", merchant: "Nobu", currency: "AUD",
  }, settings);
  assert.ok(next.includes("#log/spending/food/restaurants"));
  assert.match(next, /- \[ \] #log\/spending 24\.2\b/); // 20 + 4.20
  assert.equal(core.replaceTransactionBlock(content, "\t- $999 #log/spending/x", {}, settings), null);
});

test("removeTransactionBlock deletes an entry and its children, fixing the total", () => {
  const settings = { spendingHeading: "## Finance", spendingRootTag: "#log/spending", defaultCurrency: "AUD" };
  const content = [
    "## Finance",
    "- [ ] #log/spending 16.2",
    "\t- $12.00 #log/spending/food/restaurants",
    "\t\t- Nobu",
    "\t- $4.20 #log/spending/food/snacks",
  ].join("\n");
  const next = core.removeTransactionBlock(content, "\t- $12.00 #log/spending/food/restaurants", settings);
  assert.ok(!next.includes("Nobu"));
  assert.match(next, /- \[ \] #log\/spending 4\.2\b/);
});

test("canonicalizeFinanceTag rewrites legacy holiday orderings to the canonical form", () => {
  assert.equal(core.canonicalizeFinanceTag("#log/25/japan/spending/food/snacks"), "log/spending/25/japan/food/snacks");
  assert.equal(core.canonicalizeFinanceTag("log/26/japanmidyear/spending/planned/flights"), "log/spending/26/japanmidyear/planned/flights");
  assert.equal(core.canonicalizeFinanceTag("log/26/japanmidyear/planned/accommodation"), "log/spending/26/japanmidyear/planned/accommodation");
  // already canonical, plain spending, income, and goal tags are left alone
  assert.equal(core.canonicalizeFinanceTag("#log/spending/26/japanmidyear/food"), null);
  assert.equal(core.canonicalizeFinanceTag("#log/spending/food/restaurants"), null);
  assert.equal(core.canonicalizeFinanceTag("#log/income/salary"), null);
  assert.equal(core.canonicalizeFinanceTag("#log/spending/goal/rainy-day/medical"), null);
});

test("migrated legacy tags parse identically to before the refactor", () => {
  const legacy = core.extractFinanceTagContext("- $22 #log/25/japan/spending/food/snacks");
  const canonical = core.extractFinanceTagContext("- $22 #log/spending/25/japan/food/snacks");
  assert.deepEqual(legacy, canonical);
  assert.equal(legacy.holidayKey, "25/japan");
  assert.equal(legacy.category, "food/snacks");
});
