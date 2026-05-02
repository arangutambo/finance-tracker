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
`.trim();

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/Periodics/1. Daily/2026/04/2026-04-30.md", {
    defaultCurrency: "AUD",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].holidayKey, "26/japanmidyear");
  assert.equal(entries[0].isPlannedExpense, true);
  assert.equal(entries[0].plannedCategory, "flights");
  assert.equal(entries[0].category, "flights");
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
      { item: "Flights", category: "flights", planned: 1300, booked: 1296.47 },
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
  assert.equal(summary.rows[1].effectiveAmount, 400);
  assert.equal(summary.totals.effective, 1696.47);
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
      savingsGoalAmount: 7000,
      savingsStartingBalance: 800,
      savingsDueDate: "2026-06-18",
      startDate: "2026-06-18",
      totalBudget: 7000,
    },
    [
      { amount: 1000, date: "2026-05-01", goalKey: "japanmidyear", isGoalContribution: true, isGoalWithdrawal: false },
      { amount: 500, date: "2026-05-10", goalKey: "japanmidyear", isGoalContribution: false, isGoalWithdrawal: true },
    ],
    "2026-05-15",
    { period: "week", weekStartsOn: "monday" }
  );

  assert.equal(beforeTrip.currentSaved, 1800);
  assert.equal(beforeTrip.amountRemaining, 5200);
  assert.equal(beforeTrip.amountRemainingLabel, "Still Need To Save");
});
