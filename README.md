# Finance Tracker

An Obsidian plugin that logs spending as tagged bullets inside your daily notes,
keeps a running total, and turns those notes into spending, budget, holiday and
savings dashboards. Your markdown notes stay the source of truth — no database.

## How logging works

Every transaction is a bullet under a `## Finance` heading in a daily note
(`…/YYYY/MM/YYYY-MM-DD.md`). The plugin maintains the checkbox total automatically:

```md
## Finance
- [ ] #log/spending 16.20
	- $12.00 #log/spending/food/restaurants
		- Nobu
	- $4.20 #log/spending/food/snacks
```

You rarely type this by hand. Four ways to log, fastest first:

| Method | Use it for |
| --- | --- |
| **Apple Shortcuts → capture inbox** | logging from your phone / Apple Pay, no Obsidian launch |
| **Quick add modal** (command or status bar) | logging while you're in Obsidian |
| **`obsidian://finance-capture?…` URL** | a Shortcut that wants the instant dashboard update |
| **Type the bullet yourself** | edge cases; the total self-heals on note open |

### Apple Shortcuts (capture inbox)
A Shortcut drops a one-line file into `Utility/Finance/Inbox/`; the plugin drains it
into the right daily note on arrival and on launch. Full step-by-step setup
(manual, Apple Pay automation, Wise sync, ANZ reconcile) lives in
`Utility/Finance/Apple Shortcuts - Finance Capture.md`. Capture line format:

```
amount=12 | cat=food/restaurants | merchant=Nobu | date=2026-06-10 | source=apple-pay
```

Only `amount` is required; omit `cat` to log as `uncategorized` and categorise later.
Bad files are moved to `Inbox/_failed/` with the error, never dropped.

### Quick add modal
Command **Quick add transaction** (bind a hotkey) or click the status bar. One field,
natural language, live preview:

```
12 nobu restaurants        $8 #transport Lime        4.50 coffee snacks @yesterday
```

First number = amount · a `cat/sub`, `#tag` or known category word = category ·
`@date` (ISO, `yesterday`, weekday, or anything the Natural Language Dates plugin parses) ·
the rest = merchant.

## Tag language

| Kind | Tag | Example bullet |
| --- | --- | --- |
| Spending | `#log/spending/<category>[/<sub>]` | `- $12 #log/spending/food/restaurants` |
| Income | `#log/income/<key>` | `- $2400 #log/income/salary` |
| Savings contribution | `#log/income/<goalKey>` | `- $500 #log/income/japanmidyear` |
| Savings withdrawal | `#log/spending/goal/<goalKey>/<category>` | `- $90 #log/spending/goal/rainy-day/medical` |
| Holiday spend | `#log/spending/<year>/<key>/<category>` | `- $40 #log/spending/26/japanmidyear/food` |

The amount is a `$`-prefixed number on the bullet; a child line is the merchant, a
second child is a note. Categories are slash paths (`food/restaurants`).

## Budgets

Budgets are a markdown table in `Utility/Budgets/💸 Budgets.md`:

```md
| Name         | Category   | Limit | Period | Currency |
| ------------ | ---------- | ----: | ------ | -------- |
| Groceries    | groceries  |   140 | week   | AUD      |
| Shopping     | shopping   |   200 | month  | AUD      |
| All Spending | all        |   250 | week   | AUD      |
```

- **Category** is a top-level group (`food`) or a path (`food/restaurants`); `all`
  budgets everything.
- **Period**: `day`, `week`, `fortnight`, `month`, `bimonth`, `quarter`, `year`.
  Limits scale by calendar days when shown over a different range (a weekly $140
  shows as ~$600 on a monthly dashboard).
- Bars are **pace-aware**: a marker shows where you should be today, the colour
  reflects whether you're ahead of pace (not just over the cap), and each bar
  shows the projected end-of-period spend and a safe `$/day` for the days left.
- An `all` budget also drives the **Left / Day** card and the daily-spend trend line.

## Dashboards

Add a fenced code block to any note; each reads transactions from your daily notes.

````md
```finance-dashboard
period: week        # day | week | fortnight | month | bimonth | quarter | year
groupBy: primary    # primary | full
currency: AUD       # optional override
start: 2026-06-01   # optional explicit range (needs end)
end: 2026-06-30
title: June Spending
```
````

Shows summary cards (total, avg/day, vs previous period, top category), a category
pie, a daily-spend sparkline with your budget line, pace-aware budget bars, and
savings activity. Export CSV from the header.

`holiday-dashboard` — planned vs actual trip spend, per-day budget remaining, and a
trip calendar. Reads a holiday budget note (frontmatter `holiday_tag`,
`total_budget`, `start_date`, `end_date`, plus Planned/Allocated tables).

`savings-dashboard` — per-goal progress, contributions, projected completion. Reads
a savings goal note (frontmatter `goal_key`, `target_amount`, `due_date`, …).

## Daily Budget sidebar & status bar

The **Daily Budget** sidebar (ribbon coin icon) shows today + period spend, a
Left/Day card, a mini pie, pace-aware budget bars, savings goals, a **Needs a
Category** triage list, and today's entries. Tap any entry to edit its amount,
category or merchant, delete it, or tick "remember this merchant → category" to
teach `Utility/Finance/Merchant Map.md`. Captures with a known merchant
auto-categorise from that file.

The **status bar** shows `💸 Today $X · Week $Y · 📥 N` (N = pending captures);
click it to quick-add.

## Reconciling against the bank

Command **Reconcile bank/Wise CSV against logged spending**: paste an ANZ or Wise
export. Rows are matched by date+amount (so merchant-name differences don't cause
duplicates); unmatched charges can be sent to the capture inbox to log and triage.

## Commands

- Quick add transaction
- Drain capture inbox now
- Reconcile bank/Wise CSV against logged spending
- Open daily budget · Open finance budgets note
- Add holiday exchange rate · Create savings goal
- Export finance transactions to CSV

## Key settings

`dailyNotesFolder`, `spendingHeading` (`## Finance`), `defaultCurrency`,
`budgetsFolderPath` / `defaultBudgetNoteName`, `captureInboxFolder`,
`merchantMapPath`, `autoDrainInbox`, `budgetCheckPeriod`, `weekStartsOn`,
`activeHolidayBudgetPath`.

## Development

```bash
npm test   # node --test, runs tests/*.test.js
```

Shared logic lives in `finance-core.js` (unit-tested) and is mirrored into a `core`
IIFE inside `main.js`, which Obsidian loads directly (no build step). A change to a
core function must be made in **both** places.
