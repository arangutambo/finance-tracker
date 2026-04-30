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

test("calculates yearly ranges", () => {
  const range = core.toPeriodRange({
    period: "year",
    referenceDate: "2026-04-30",
  });

  assert.equal(range.start, "2026-01-01");
  assert.equal(range.end, "2026-12-31");
});
