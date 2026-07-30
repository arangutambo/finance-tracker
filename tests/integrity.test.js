"use strict";

// Invariant tests, as distinct from the unit tests in finance-core.test.js.
// These are the properties that must hold across the whole write→read cycle,
// because the code paths they cover are the ones that silently corrupt a user's
// notes when they break: a transaction that cannot be read back after being
// written, or a running total that drifts from the entries beneath it.

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../finance-core");

const SETTINGS = {
  spendingHeading: "## Finance",
  spendingRootTag: "#log/spending",
  defaultCurrency: "AUD",
};

const EMPTY_NOTE = ["---", "date: 2026-07-29", "---", "", "## Finance", "- [ ] #log/spending 0", ""].join("\n");

function parse(content) {
  return core.parseTransactionsFromNoteContent(content, "Journal/2026-07-29.md", SETTINGS);
}

function sectionTotal(content) {
  const lines = content.split("\n");
  const root = lines.findIndex((line) => line.trim().startsWith("- [ ] #log/spending"));
  return core.parseNumber(lines[root].replace(/^- \[[^\]]\] #log\/spending\s*/, ""));
}

// --- Round trip ---------------------------------------------------------------
// Every field the writer emits must survive being read back by the parser. A
// generated matrix rather than one hand-picked case, because the failure mode
// is a specific combination (a split plus a foreign currency, say) rather than
// any single feature.

const AMOUNTS = [0.01, 7, 12.5, 99.99, 1234.56];
const CATEGORIES = ["food/groceries", "transport", "subscriptions/monthly/spotify", "a/b/c/d"];
const MERCHANTS = ["", "Coles", "Café de l'Île", "A | B"];

test("every written transaction parses back with the same amount and category", () => {
  for (const amount of AMOUNTS) {
    for (const category of CATEGORIES) {
      for (const merchant of MERCHANTS) {
        const expense = { amount, category, merchant, date: "2026-07-29", currency: "AUD" };
        const next = core.insertTransactionIntoDailyNote(EMPTY_NOTE, expense, SETTINGS);
        const entries = parse(next);
        const label = `${amount} / ${category} / "${merchant}"`;
        assert.equal(entries.length, 1, `expected exactly one entry for ${label}`);
        assert.equal(entries[0].amount, amount, `amount changed for ${label}`);
        assert.equal(entries[0].category, category, `category changed for ${label}`);
        assert.equal(entries[0].merchant, merchant, `merchant changed for ${label}`);
      }
    }
  }
});

test("a split survives the round trip with its owed shares and my share intact", () => {
  const expense = {
    amount: 60,
    category: "food/restaurants",
    merchant: "Nobu",
    date: "2026-07-29",
    currency: "AUD",
    owed: [
      { person: "sam", displayName: "Sam", amount: 20 },
      { person: "alex", displayName: "Alex", amount: 15 },
    ],
  };
  const entries = parse(core.insertTransactionIntoDailyNote(EMPTY_NOTE, expense, SETTINGS));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 60);
  assert.equal(entries[0].owedTotal, 35);
  assert.equal(entries[0].myShare, 25);
  assert.deepEqual(entries[0].owed.map((item) => item.person).sort(), ["alex", "sam"]);
  // Budgets must count my share, never the whole bill.
  assert.equal(core.entrySpendAmount(entries[0]), 25);
});

test("a foreign-currency transaction keeps both the original and converted amounts", () => {
  const expense = {
    amount: 25.85,
    category: "food/restaurants",
    date: "2026-07-29",
    currency: "AUD",
    originalAmount: 90.2,
    originalCurrency: "BRL",
    originalRateKey: "BRL",
  };
  const entries = parse(core.insertTransactionIntoDailyNote(EMPTY_NOTE, expense, SETTINGS));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 25.85, "the converted amount is what counts toward budgets");
  assert.equal(entries[0].originalAmount, 90.2);
  assert.equal(entries[0].originalCurrency, "BRL");
});

test("appending many transactions leaves every one readable", () => {
  let content = EMPTY_NOTE;
  const expected = [];
  for (let index = 0; index < 25; index += 1) {
    const amount = Number(((index + 1) * 3.33).toFixed(2));
    expected.push(amount);
    content = core.insertTransactionIntoDailyNote(
      content,
      { amount, category: CATEGORIES[index % CATEGORIES.length], merchant: `Shop ${index}`, date: "2026-07-29", currency: "AUD" },
      SETTINGS
    );
  }
  const entries = parse(content);
  assert.equal(entries.length, expected.length);
  assert.deepEqual(entries.map((entry) => entry.amount).sort((a, b) => a - b), expected.slice().sort((a, b) => a - b));
});

// --- Total healing -------------------------------------------------------------

test("the root-line total always equals the sum of the entries beneath it", () => {
  let content = EMPTY_NOTE;
  const amounts = [12.5, 0.01, 99.99, 7, 1234.56];
  for (const amount of amounts) {
    content = core.insertTransactionIntoDailyNote(
      content,
      { amount, category: "food/groceries", date: "2026-07-29", currency: "AUD" },
      SETTINGS
    );
  }
  const expected = core.roundCurrencyAmount(amounts.reduce((sum, value) => sum + value, 0));
  assert.equal(sectionTotal(content), expected);
  assert.equal(core.roundCurrencyAmount(parse(content).reduce((sum, entry) => sum + entry.amount, 0)), expected);
});

test("recomputeSpendingTotals is idempotent and repairs a hand-edited total", () => {
  let content = EMPTY_NOTE;
  for (const amount of [10, 20, 30]) {
    content = core.insertTransactionIntoDailyNote(content, { amount, category: "transport", date: "2026-07-29", currency: "AUD" }, SETTINGS);
  }
  const once = core.recomputeSpendingTotals(content, SETTINGS);
  assert.equal(once, core.recomputeSpendingTotals(once, SETTINGS), "a second pass must change nothing");

  // Someone edits an amount by hand; the stale total must heal, not persist.
  const edited = once.replace("$30.00", "$45.00");
  assert.equal(sectionTotal(core.recomputeSpendingTotals(edited, SETTINGS)), 75);
});

test("income, balances and goal contributions never inflate the spending total", () => {
  const content = [
    "## Finance",
    "- [ ] #log/spending 0",
    "\t- $10.00 #log/spending/food/groceries",
    "\t- $5000.00 #log/income/salary",
    "\t- $200.00 #log/income/house-deposit",
    "\t- $9000.00 #log/balance/anz-plus",
    "",
  ].join("\n");
  assert.equal(sectionTotal(core.recomputeSpendingTotals(content, SETTINGS)), 10);
});

// Regression: merchant and note child lines are bullets too, and
// extractVisibleAmount will read a number out of one. "Shell Coorparoo 1234"
// used to add 1234 to the note's running total while the dashboards — which
// have always required a #log/ tag — read the same note correctly.
test("numbers inside merchant and note lines never reach the running total", () => {
  let content = EMPTY_NOTE;
  const rows = [
    [45.2, "7-Eleven"],
    [12, "Uber Eats"],
    [30, "Shell Coorparoo 1234"],
    [8.5, "Bakery"],
  ];
  for (const [amount, merchant] of rows) {
    content = core.insertTransactionIntoDailyNote(
      content,
      { amount, category: "transport", merchant, note: "split 3 ways, receipt 99887", date: "2026-07-29", currency: "AUD" },
      SETTINGS
    );
  }
  const expected = core.roundCurrencyAmount(rows.reduce((sum, [amount]) => sum + amount, 0));
  assert.equal(expected, 95.7);
  assert.equal(sectionTotal(content), expected, "the written total must match the entries, not the digits in their labels");
  assert.equal(sectionTotal(core.recomputeSpendingTotals(content, SETTINGS)), expected);
  assert.equal(core.roundCurrencyAmount(parse(content).reduce((sum, entry) => sum + entry.amount, 0)), expected);
});

test("editing and removing a transaction both keep the total consistent", () => {
  let content = EMPTY_NOTE;
  for (const amount of [10, 25]) {
    content = core.insertTransactionIntoDailyNote(content, { amount, category: "transport", merchant: `M${amount}`, date: "2026-07-29", currency: "AUD" }, SETTINGS);
  }
  const target = parse(content).find((entry) => entry.amount === 25);

  const edited = core.replaceTransactionBlock(content, target.rawLine, { ...target, amount: 5 }, SETTINGS);
  assert.notEqual(edited, null);
  assert.equal(sectionTotal(edited), 15);

  const removed = core.removeTransactionBlock(content, target.rawLine, SETTINGS);
  assert.notEqual(removed, null);
  assert.equal(sectionTotal(removed), 10);
  assert.equal(parse(removed).length, 1);
});

// --- Recurring lifecycle -------------------------------------------------------

function recurringFixture(dates, { amount = 15, name = "subscriptions/monthly/spotify" } = {}) {
  return dates.map((date) => ({
    date,
    amount,
    category: name,
    merchant: "Spotify",
    entryType: "spending",
    currency: "AUD",
  }));
}

test("a bill past its end date retires itself and drops out of the totals", () => {
  const detected = core.detectRecurringPayments(recurringFixture(["2026-04-01", "2026-05-01", "2026-06-01"]), {
    referenceDate: "2026-07-29",
  });
  const registry = new Map([["spotify", { active: true, autoLog: null, endDate: "2026-06-15", paymentsLeft: null }]]);
  const applied = core.applyRecurringRegistry(detected, registry, "2026-07-29");

  const item = applied.items[0];
  assert.equal(item.finished, true);
  assert.equal(item.finishedReason, "end-date");
  assert.equal(item.active, false, "a finished bill is inactive, so every existing consumer drops it");
  assert.equal(item.status, "finished");
  assert.equal(applied.totals.monthly, 0, "and stops counting toward monthly cost");
});

test("a bill still due on its end date is not retired early", () => {
  const detected = core.detectRecurringPayments(recurringFixture(["2026-05-01", "2026-06-01"]), { referenceDate: "2026-07-01" });
  const registry = new Map([["spotify", { active: true, autoLog: null, endDate: "2026-07-01", paymentsLeft: null }]]);
  const item = core.applyRecurringRegistry(detected, registry, "2026-07-01").items[0];
  assert.equal(item.nextDue, "2026-07-01");
  assert.equal(item.finished, false, "the final payment is still owed on the end date itself");
  assert.equal(item.active, true);
});

test("a bill with no payments left retires, and one with payments left keeps running", () => {
  const detected = core.detectRecurringPayments(recurringFixture(["2026-05-01", "2026-06-01", "2026-07-01"]), {
    referenceDate: "2026-07-29",
  });

  const spent = core.applyRecurringRegistry(detected, new Map([["spotify", { active: true, autoLog: null, paymentsLeft: 0 }]]), "2026-07-29");
  assert.equal(spent.items[0].finished, true);
  assert.equal(spent.items[0].finishedReason, "payments");
  assert.equal(spent.totals.monthly, 0);

  const remaining = core.applyRecurringRegistry(detected, new Map([["spotify", { active: true, autoLog: null, paymentsLeft: 3 }]]), "2026-07-29");
  assert.equal(remaining.items[0].finished, false);
  assert.equal(remaining.items[0].paymentsLeft, 3);
  assert.equal(remaining.totals.monthly, 15);
});

test("the registry parses End Date and Payments Left from the markdown table", () => {
  const note = [
    core.RECURRING_REGISTRY_HEADER_ROW,
    core.RECURRING_REGISTRY_SEPARATOR_ROW,
    "| monthly/spotify | monthly | 15 | yes | yes | no | | | | 2026-12-01 | 4 |",
    "| monthly/gym | monthly | 60 | yes | no | no | | | | | |",
  ].join("\n");
  const registry = core.parseRecurringRegistry(note);

  assert.equal(registry.get("monthly/spotify").endDate, "2026-12-01");
  assert.equal(registry.get("monthly/spotify").paymentsLeft, 4);
  assert.equal(registry.get("monthly/gym").endDate, null);
  assert.equal(registry.get("monthly/gym").paymentsLeft, null, "a blank cell must stay unset, not become 0");
});

test("a registry table written before End Date existed still parses", () => {
  const legacy = [
    "| Item | Cadence | Amount | Active | Auto-log |",
    "| --- | --- | ---: | --- | --- |",
    "| monthly/spotify | monthly | 15 | yes | yes |",
  ].join("\n");
  const entry = core.parseRecurringRegistry(legacy).get("monthly/spotify");
  assert.equal(entry.active, true);
  assert.equal(entry.autoLog, true);
  assert.equal(entry.endDate, null);
  assert.equal(entry.paymentsLeft, null);
});

// --- Category and spend classification ------------------------------------------

test("isSpendingEntry and entrySpendAmount agree on what counts as home spending", () => {
  const content = [
    "## Finance",
    "- [ ] #log/spending 0",
    "\t- $10.00 #log/spending/food/groceries",
    "\t- $60.00 #log/spending/food/restaurants",
    "\t\t- Nobu",
    "\t\t- owes: Sam $20.00 #log/owed/sam",
    "\t- $500.00 #log/income/salary",
    "\t- $80.00 #log/spending/26/japan/food",
    "\t- $40.00 #log/spending/goal/house-deposit/furniture",
    "\t- $9000.00 #log/balance/anz-plus",
    "",
  ].join("\n");
  const entries = parse(content);
  const spending = entries.filter((entry) => core.isSpendingEntry(entry));

  assert.deepEqual(spending.map((entry) => entry.category).sort(), ["food/groceries", "food/restaurants"]);
  assert.equal(
    core.roundCurrencyAmount(spending.reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0)),
    50,
    "10 groceries + 40 my share of the 60 restaurant bill"
  );
});

test("integer cents keep the forecast line exact over many months", () => {
  const projection = core.buildForecastProjection({
    referenceDate: "2026-07-29",
    months: 60,
    startBalance: 1000,
    monthlyIncome: 5000.1,
    monthlyBills: 1234.56,
    monthlyDiscretionary: 2000.03,
    monthlyGoalSetAside: 100.07,
  });
  const net = 5000.1 - 1234.56 - 2000.03 - 100.07;
  assert.equal(projection.monthlyNet, core.roundCurrencyAmount(net));
  // Every point must be exactly start + net x n — no drifting cents at month 60.
  projection.points.forEach((point, index) => {
    assert.equal(point.balance, core.fromCents(core.toCents(1000) + core.toCents(net) * index), `month ${index}`);
  });
  assert.equal(projection.endBalance, projection.points[60].balance);
});

test("quick add reads two amounts as original + converted, in either order", () => {
  const opts = { defaultCurrency: "AUD" };
  const expected = { amount: 83.64, originalAmount: 58, originalCurrency: "USD" };

  for (const input of [
    "58 USD : 83.64 AUD obsidian sync",
    "58usd 83.64 obsidian sync",
    "USD58 83.64 obsidian sync",
    "$58 USD = $83.64 AUD obsidian sync",
    "58 USD -> 83.64 obsidian sync",
  ]) {
    const parsed = core.parseQuickAddInput(input, [], opts);
    assert.equal(parsed.amount, expected.amount, input);
    assert.equal(parsed.originalAmount, expected.originalAmount, input);
    assert.equal(parsed.originalCurrency, expected.originalCurrency, input);
    assert.equal(parsed.merchant, "obsidian sync", `merchant must not keep the codes or separator: ${input}`);
    assert.equal(parsed.impliedRate, 1.4421, "shown only, never stored");
  }
});

test("quick add flags a foreign amount with no converted amount instead of guessing", () => {
  const parsed = core.parseQuickAddInput("58 USD obsidian sync", [], { defaultCurrency: "AUD" });
  assert.equal(parsed.needsConvertedAmount, true);
  assert.equal(parsed.amount, null, "no rate is stored, so there is nothing to convert with");
  assert.equal(parsed.originalAmount, 58);
});

test("quick add treats the home currency as no conversion at all", () => {
  const both = core.parseQuickAddInput("90 AUD groceries", [], { defaultCurrency: "AUD" });
  assert.equal(both.amount, 90);
  assert.equal(both.originalAmount, null);
  assert.equal(both.originalCurrency, "");
  assert.equal(both.needsConvertedAmount, false);
});

test("quick add does not mistake an ordinary word for a currency code", () => {
  const parsed = core.parseQuickAddInput("58 oak table", [], { defaultCurrency: "AUD" });
  assert.equal(parsed.amount, 58);
  assert.equal(parsed.originalCurrency, "", "OAK is not a currency");
  assert.equal(parsed.merchant, "oak table");
  assert.equal(core.isCurrencyCode("oak"), false);
  assert.equal(core.isCurrencyCode("usd"), true);
});

test("a foreign-currency quick add round-trips to the documented markdown and back", () => {
  const parsed = core.parseQuickAddInput(
    "58 USD : 83.64 AUD obsidian sync #subscriptions/yearly/obsidian-sync",
    [],
    { defaultCurrency: "AUD" }
  );
  const note = EMPTY_NOTE.replace("2026-07-29", "2026-07-30");
  const content = core.insertTransactionIntoDailyNote(
    note,
    {
      amount: parsed.amount,
      category: parsed.category,
      currency: "AUD",
      date: "2026-07-30",
      merchant: parsed.merchant,
      originalAmount: parsed.originalAmount,
      originalCurrency: parsed.originalCurrency,
      originalRateKey: parsed.originalCurrency,
    },
    SETTINGS
  );

  assert.match(content, /\$58\.00 USD : \$83\.64 AUD #log\/spending\/subscriptions\/yearly\/obsidian-sync/);

  const entries = core.parseTransactionsFromNoteContent(content, "Journal/2026-07-30.md", SETTINGS);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-07-30");
  assert.equal(entries[0].amount, 83.64, "the converted amount is what counts toward budgets");
  assert.equal(entries[0].originalAmount, 58);
  assert.equal(entries[0].originalCurrency, "USD");
  assert.equal(entries[0].category, "subscriptions/yearly/obsidian-sync");
  assert.equal(sectionTotal(content), 83.64, "the note total uses the home amount, not both");

  // And it registers as a yearly recurring bill due again next July.
  const recurring = core.detectRecurringPayments(entries, { prefix: "subscriptions", referenceDate: "2026-07-30" });
  assert.equal(recurring.items.length, 1);
  assert.equal(recurring.items[0].cadence, "yearly");
  assert.equal(recurring.items[0].name, "obsidian-sync");
  assert.equal(recurring.items[0].lastAmount, 83.64);
  assert.equal(recurring.items[0].nextDue, "2027-07-30");
});

// --- Runway: a read-only figure, not a pot -------------------------------------

test("runway is the bills that fall inside the window, plus optional spending", () => {
  const recurring = core.detectRecurringPayments(
    [
      { amount: 100, category: "subscriptions/monthly/rent", date: "2026-07-10", merchant: "Landlord" },
      { amount: 900, category: "subscriptions/yearly/insurance", date: "2026-09-01", merchant: "AAMI" },
    ],
    { prefix: "subscriptions", referenceDate: "2026-07-16" }
  );
  const base = { referenceDate: "2026-07-16", period: "1 month", monthlyDiscretionary: 1000 };

  const bills = core.computeRunway(recurring, { ...base, mode: "bills" });
  assert.equal(bills.bills, 100, "the yearly renewal is 14 months away, so it is worth nothing yet");
  assert.equal(bills.discretionary, 0);
  assert.equal(bills.target, 100);

  const spending = core.computeRunway(recurring, { ...base, mode: "spending" });
  assert.equal(spending.bills, 100);
  assert.ok(spending.discretionary > 950 && spending.discretionary < 1080, "≈ a month of the trailing average");
  assert.equal(spending.target, core.roundCurrencyAmount(spending.bills + spending.discretionary));

  // An unknown mode falls back to the default rather than producing nothing.
  assert.equal(core.computeRunway(recurring, { ...base, mode: "nonsense" }).mode, "spending");
});

test("runway breaks the figure down per week and per day", () => {
  const recurring = core.detectRecurringPayments(
    [{ amount: 310, category: "subscriptions/monthly/rent", date: "2026-07-10", merchant: "Landlord" }],
    { prefix: "subscriptions", referenceDate: "2026-07-16" }
  );
  const runway = core.computeRunway(recurring, { referenceDate: "2026-07-16", period: "1 month", mode: "bills" });
  assert.equal(runway.target, 310);
  assert.equal(runway.windowDays, 31);
  assert.equal(runway.perDay, core.fromCents(Math.round(core.toCents(310) / 31)));
  assert.equal(runway.perWeek, core.fromCents(Math.round((core.toCents(310) / 31) * 7)));
  // Nothing about a balance, a target to fund, or a top-up.
  for (const gone of ["saved", "shortfall", "surplus", "onTarget", "topUpPerWeek", "coveredLabel"]) {
    assert.equal(runway[gone], undefined, `${gone} should no longer exist — runway is read-only`);
  }
});

test("a longer runway period scales the window and the figure", () => {
  const recurring = core.detectRecurringPayments(
    [{ amount: 100, category: "subscriptions/monthly/rent", date: "2026-07-10", merchant: "Landlord" }],
    { prefix: "subscriptions", referenceDate: "2026-07-16" }
  );
  const at = (period) => core.computeRunway(recurring, { referenceDate: "2026-07-16", period, mode: "bills" });
  assert.equal(at("1 month").windowEnd, "2026-08-15");
  assert.equal(at("3 months").windowEnd, "2026-10-15");
  assert.equal(at("6 months").windowEnd, "2027-01-15");
  assert.equal(at("1 month").target, 100);
  assert.equal(at("3 months").target, 300);
  assert.equal(at("6 months").target, 600);
});

test("a leftover runway or bill-reserve note is not treated as a savings goal", () => {
  for (const frontmatter of [
    { goal_key: "runway", goal_type: "runway", runway_period: "1 month" },
    { goal_key: "billreserve", target_amount: "0" },
  ]) {
    const goal = core.parseGoalDefinition(frontmatter);
    if (goal) {
      assert.equal(goal.isLegacyRunwayNote, true, "flagged so goal lists can filter it out");
      assert.equal(core.RUNWAY_LEGACY_KEYS.has(goal.goalKey), true);
    }
  }
});

test("legacy runway contributions still count as transfers, not income", () => {
  const entries = parse([
    "## Finance",
    "- [ ] #log/spending 0",
    "\t- $5000.00 #log/income/salary",
    "\t- $500.00 #log/income/runway",
    "\t- $200.00 #log/income/billreserve",
    "",
  ].join("\n"));

  const lines = core.buildPeriodReviewLines(entries, { period: "year", referenceDate: "2026-07-29", currency: "AUD" });
  const text = lines.join("\n");
  assert.match(text, /Total income: \$5,000\.00/, "the two transfers must not inflate real income");
  assert.match(text, /Runway contributions: \$700\.00 \(2\)/, "but they are still reported separately");
});
