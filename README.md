# Finance Tracker

An Obsidian plugin that logs spending as tagged bullets inside your daily notes,
keeps a running total, and turns those notes into spending, budget, holiday and
savings dashboards. Your markdown notes stay the source of truth — no database.

Support the project: [Buy Me a Coffee](https://buymeacoffee.com/tonyhad)

## First-time setup (empty vault)

On a fresh install the **setup wizard** opens automatically (or run the
**Run first-time setup** command / the button at the top of settings any time —
it never overwrites existing notes). It asks three things — where your daily
notes live, where finance notes should be stored, and your currency — then
creates the starter notes from templates embedded in the plugin:

- `💸 Budgets.md` — the budget table
- `📊 Finance Dashboard.md` — weekly/monthly dashboards, net worth, forecast, a sample query
- `🔁 Recurring Payments.md` — the bill management page
- `🎯 Goals.md` — the goals overview with one-tap contributions

The manual path, if you prefer:

1. **Install & enable.** Copy this plugin to `.obsidian/plugins/finance-tracker/`,
   then Settings → Community plugins → enable **Finance Tracker**. (On mobile, turn
   on community plugins first.)
2. **Set two things** in the plugin's settings tab:
   - **Default currency** (e.g. `AUD`, `USD`).
   - **Daily notes folder** — point it at where you keep daily notes. Default is
     `Journal/Periodics/1. Daily`; the plugin routes captures to `<folder>/YYYY-MM-DD.md`
     (or `<folder>/YYYY/MM/YYYY-MM-DD.md` if you already use that structure).
3. **Open the panel.** Click the **coin** ribbon icon (or run *Open daily budget*).
   This creates, on first run:
   - `Utility/Budgets/💸 Budgets.md` — a starter budget table you can edit.
   - `Utility/Finance/Inbox/` — the capture folder Shortcuts write to.
4. **Log your first transaction.** Run command **Quick add transaction**, type
   `12 coffee snacks`, press Enter. Today's note is created with a `## Finance`
   section and the entry; the panel and status bar update.
5. **Set your budgets.** Open `💸 Budgets.md` and edit the table rows to your own
   categories, limits and periods. Keep an `all` row for the overall bar + Left/Day.
6. **Add a dashboard (optional).** Put a ` ```finance-dashboard ` block (see
   [Dashboards](#dashboards)) in any note for charts and pace bars.
7. **Phone capture (optional but the point).** Pick the method that matches your sync
   (see [How logging works](#how-logging-works)): on **Obsidian Sync**, use a Shortcut
   that opens `obsidian://finance-capture?…` (no special storage needed); on an **iCloud
   Drive / Mac-local** vault you can instead drop capture files into your configured
   inbox folder. Step-by-step Shortcut recipes are in [How logging works](#how-logging-works) below.

Nothing else is required — daily notes, the budget note, and the inbox folder are
all created for you on demand.

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

You rarely type this by hand. Four ways to log:

| Method | Use it for |
| --- | --- |
| **`obsidian://finance-capture` Shortcut** | phone capture with **any** sync (incl. Obsidian Sync); briefly opens Obsidian |
| **Apple Shortcuts → capture inbox file** | phone capture when the vault is **Files-writable** (iCloud Drive / Mac-local); no Obsidian launch |
| **Quick add modal** (command or status bar) | logging while you're in Obsidian |
| **Type the bullet yourself** | edge cases; the total self-heals on note open |

**Which phone method?** It depends on how the vault syncs:
- **Obsidian Sync** (the vault lives inside the Obsidian app) → use the **URL Shortcut**.
  Shortcuts can't write into Obsidian's sandbox, so the inbox-file method won't work on the phone.
- **iCloud Drive / Mac-local folder** → the **inbox-file** method is best (silent, no app launch),
  and the same folder lets Mac-side scripts and the in-app bank-CSV reconcile drop captures in.

### URL Shortcut (works with any sync)
A Shortcut opens `obsidian://finance-capture?amount=12.5&merchant=Coles&category=food/groceries&source=manual`.
The plugin logs it to today's note. This briefly foregrounds Obsidian but needs no filesystem access.

### Capture inbox (Files-writable vaults)
A Shortcut (or Mac script, or the bank-CSV reconcile) drops a one-line file into the
inbox folder (default `Utility/Finance/Inbox/`); the plugin drains it into the right daily
note on arrival and on launch. Capture line format:

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

**Autocomplete** — as you type, suggestions appear for **categories**,
**merchants**, and **people** (`owed=…`), all derived from what you have
actually logged plus your budget table — there is no category list to maintain.
Arrow keys cycle, **Tab** accepts, **Esc** dismisses; **Enter always submits**
the entry. Accepting a known merchant also fills in its remembered category.

**Date from the open note** — with the *Quick add uses the open daily note's
date* setting on (off by default), opening quick add while a daily note is
active pre-fills that note's date, so backfilling an old day is frictionless.

## Tag language

| Kind | Tag | Example bullet |
| --- | --- | --- |
| Spending | `#log/spending/<category>[/<sub>]` | `- $12 #log/spending/food/restaurants` |
| Income | `#log/income/<key>` | `- $2400 #log/income/salary` |
| Savings contribution | `#log/income/<goalKey>` | `- $500 #log/income/japanmidyear` |
| Savings withdrawal | `#log/spending/goal/<goalKey>/<category>` | `- $90 #log/spending/goal/rainy-day/medical` |
| Holiday spend | `#log/spending/<year>/<key>/<category>` | `- $40 #log/spending/26/japanmidyear/food` |
| Recurring bill | `#log/spending/subscriptions/<cadence>/<name>` | `- $12.99 #log/spending/subscriptions/monthly/spotify` |
| Owed share (child line) | `#log/owed/<person>` | `	- owes: Sam $8.00 #log/owed/sam` |
| Balance snapshot | `#log/balance/<account>` | `- $5,230.00 #log/balance/anz-plus` |

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
- **Trip-tagged spending never counts toward home budgets.** An entry like
  `- $40 #log/spending/26/japan/shopping` is a withdrawal from that trip's
  savings goal: it shows on the holiday dashboard and reduces the goal, but is
  excluded from regular budgets, dashboards, the sidebar totals, and the
  forecast. Use `type: all` in a `finance-query` block for a report that
  includes trip entries.

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

Shows summary cards (total, avg/day, vs previous period, top category), a
**two-ring category donut** — inner ring is the major categories, outer ring is
every subcategory as a shade of its parent's hue, with a nested legend — a
daily-spend sparkline with your budget line, pace-aware budget bars, and
savings activity. Export CSV from the header. (The sidebar's mini pie stays at
major categories; the donut falls back to a flat pie when nothing has
subcategories.)

`holiday-dashboard` — planned vs actual trip spend, per-day budget remaining, and a
trip calendar. Reads a goal note that has a `trip_tag` (see [Goals](#goals-savings--trips)),
plus its Planned/Allocated tables. **Once the trip has ended** (past `end_date`,
or the note is archived) the same block automatically becomes a **trip
reflection**: total and after-trip spend, how it landed against the budget,
average per day, biggest and quietest days, a per-category table (total, avg/day,
share, and the biggest single expense with its merchant), a spend-by-day chart,
and planned-vs-paid. Force either mode with `view: live` or `view: reflection`.

`savings-dashboard` — per-goal progress, contributions, sinking-fund set-aside and
pace. Reads a goal note (frontmatter `goal_key`, `target_amount`, `due_date`, …).

Every chart shares one **hue-family colour system**: each major category gets a
base hue, its subcategories render as lighter/darker shades of that hue, and
pies and legends rank by major-group total with subgroups nested beneath.

## Goals (savings + trips)

Savings goals and holiday budgets share **one frontmatter schema**. Any goal with
`target_amount` and `due_date` automatically shows sinking-fund math — the
set-aside needed per week and whether you're ahead of or behind the linear pace.
A holiday is simply a goal that also has a `trip_tag`, dates, and a currency.
Command: **Create savings goal** (or the buttons in settings).

```md
---
goal_name: Roadbike
goal_key: roadbike
target_amount: 3000
starting_balance: 0
due_date: 2026-12-10
active: true
currency: AUD
---

```savings-dashboard
```
```

A trip goal adds the trip keys (and optionally `trip_currency` for trip-mode capture):

```md
---
goal_name: Japan Mid-Year
goal_key: japanmidyear
target_amount: 6000
due_date: 2026-06-18
trip_tag: 26/japanmidyear
trip_currency: JPY
start_date: 2026-06-21
end_date: 2026-07-08
total_budget: 6000
currency: AUD
exchange_rates: JPY=0.00877
---
```

Contributions are `- $500 #log/income/roadbike` bullets; withdrawals are
`- $90 #log/spending/goal/roadbike/<category>`. The legacy `goal_key` /
`holiday_tag` frontmatter still parses, so un-migrated notes keep rendering.

### Contributing to goals

Command: **Contribute to savings goal** (also the Contribute buttons in the
goals block below)

Logs a contribution bullet — `- $150.00 #log/income/roadbike` — into the chosen
day's note. Contributions are **virtual envelopes**: nothing requires a real
bank transfer, so this works whether each goal has its own account or every
goal lives inside one lump-sum savings account.

### Goals overview block

Command: **Insert goals block**

````md
```finance-goals
account: short-term-savings   # optional — reconcile against a real account
```
````

One card per goal: saved vs target, the weekly set-aside still needed,
ahead/behind pace, and a **Contribute** button. With `account:` it compares the
sum of your goal envelopes against that account's latest `#log/balance/…`
snapshot and shows the **unallocated** remainder — the piece of the lump sum
not yet promised to any goal (or a warning when you've over-allocated).

### Multiple holidays & archiving

Commands: **Archive finished holidays** · **Archive completed savings goals**
(or the per-note toggles and Archive buttons in Settings → Holiday budgets)

You can save for **several holidays at once** — every goal note with
`active: true` shows in the sidebar and counts toward forecast set-asides, and
capture routes to whichever trip's dates match.

When a trip is over — or a savings goal has hit its target — archive it.
Archiving writes a frozen **Archive summary** into the note: the savings steps
(every contribution, dated), withdrawals, and for trips how the money was
spent during the trip and after its end date. The note is then marked
`archived: <date>` and moved to the archive folder. The note keeps its full
history and its dashboards still render when you open it, but it leaves the
active set: no more capture routing, sidebar cards, or forecast set-asides.

```md
## Archive summary (2026-07-25)

- Target: $3,500.00
- Saved: $3,500.00 (100% of target) — $500.00 starting balance + 2 contributions

### Savings steps

| Date       |    Amount | Note             |
| ---------- | --------: | ---------------- |
| 2026-05-01 | $1,500.00 | Savings transfer |
| 2026-06-01 | $1,500.00 | Savings transfer |

### How it was spent

- Trip budget: $3,500.00
- Spent during the trip: $2,914.00 across 41 entries
- Spent after 2026-07-24: $40.00 across 1 entry
```

## Recurring payments

Command: **Log due recurring payments** · **Insert recurring payments block**

Tag a bill once with a cadence subtag under the recurring prefix (default
`subscriptions`; configurable in settings) and it becomes a tracked recurring
payment. The amount is inferred from the last logged entry, and next-due from
the last logged date plus the cadence (`weekly`, `fortnightly`, `monthly`,
`quarterly`, `yearly`):

```md
## Finance
- [ ] #log/spending 31.49
	- $12.99 #log/spending/subscriptions/monthly/spotify
		- Spotify
	- $18.50 #log/spending/subscriptions/weekly/gym
		- Anytime Fitness
```

Then drop this block into any note:

````md
```finance-recurring
```
````

It shows upcoming bills, overdue items with a one-tap **Log now**, the total
due in the next 30 days, and the cost per month and per year. An optional
setting (**Auto-log recurring payments**) logs each item automatically on its
due day.

**Managing bills** — command **Open recurring payments note** creates a
management page (a normal note with a `manage: true` block). In manage mode
every item gets **Log now** plus **Skip cycle** (logs a $0 entry on the due day,
so the schedule moves on but the price is remembered — a price change is simply
the next amount you log). The block also has a **Bill reserve** section: the
sinking fund for bills. It shows how much should already be set aside (each
bill accrues day by day since it was last paid — half a year after an annual
bill, half its cost should be reserved) and the steady per-week / per-month
set-aside that keeps every cadence covered.

## Split expenses

Command: **Settle up split expenses** · **Insert split expenses block**

Quick-add and `obsidian://finance-capture` accept `split=N` (even split — your
share is amount ÷ N) and `owed=Name:$X` tokens:

```
24 nobu restaurants split=2          → you owe $12, someone owes you $12
30 dinner restaurants owed=Sam:$10   → Sam owes $10 of the $30
```

The full amount stays on the bullet, with a hand-editable child line per person.
Only **your share** counts toward budgets:

```md
	- $24.00 #log/spending/food/restaurants
		- Nobu
		- owes: Sam $12.00 #log/owed/sam
```

The ` ```finance-splits``` ` block and a sidebar card sum outstanding balances
per person. **Settle up** logs the repayment as income
(`- $12.00 #log/income/settleup/sam`) and appends `· settled <date>` to the owed
lines.

## Trip mode

Commands: **Start trip** · **End trip**

Start trip picks a trip goal note and, until you end the trip, quick-add and URL
captures default to the trip tag — and to the trip currency when `trip_currency`
is set, converting to your home currency through the note's stored exchange
rates. The sidebar shows spent-today, trip budget remaining, and a safe $/day
for the days left.

## Forecast

Command: **Insert forecast block**

````md
```finance-forecast
months: 6
```
````

Projects recurring income, minus recurring bills, minus your trailing-90-day
average discretionary spend, forward N months — including committed goal
set-asides — as a line chart with a `~$X by <date>` headline. Override any
input with `income:`, `bills:`, `discretionary:`, `setaside:`, or `start:`.

## Net worth

Command: **Snapshot balances** · **Insert net worth block**

Snapshot balances logs one bullet per account into today's daily note (accounts
you've snapshotted before are pre-filled):

```md
- $5,230.00 #log/balance/anz-plus
- $812.40 #log/balance/wise
```

The dashboard renders the balance trend from those bullets — no extra files:

````md
```networth-dashboard
```
````

## Query block

Command: **Insert finance query block**

A read-only report over your entries — filter by category, tag, merchant, or
date range; group by category, merchant, or month; sum or count:

````md
```finance-query
period: month        # or start: / end: dates
category: food       # optional prefix filter
merchant: nobu       # optional substring filter
type: spending       # spending | income | all
group: category      # category | category-full | merchant | month | none
op: sum              # sum | count
view: table          # table | categories | bars | income-expense | cumulative
```
````

Views: `table` (grouped sums), `categories` (ranked category table with
percentages), `bars` (ranked bars), `income-expense` (monthly income-vs-expense
bars), `cumulative` (cumulative balance line).

## Daily Budget sidebar & status bar

The **Daily Budget** sidebar (ribbon coin icon) shows today + period spend, a
Left/Day card, a mini pie, compact pace-aware budget rows (tap a row for the
detail), savings goals, split balances, and a **Needs a Category** triage list.
Tap a triage entry to edit its amount, category or merchant, delete it, or tick
"remember this merchant → category" to teach `Utility/Finance/Merchant Map.md`.
Captures with a known merchant auto-categorise from that file.

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
- Run first-time setup
- Log due recurring payments · Open recurring payments note · Insert recurring payments block
- Contribute to savings goal · Insert goals block · Archive completed savings goals
- Settle up split expenses · Insert split expenses block
- Start trip · End trip · Archive finished holidays
- Snapshot balances · Insert net worth block
- Insert forecast block · Insert finance query block
- Export finance transactions to CSV

## Key settings

`dailyNotesFolder`, `spendingHeading` (`## Finance`), `defaultCurrency`,
`budgetsFolderPath` / `defaultBudgetNoteName`, `captureInboxFolder`,
`merchantMapPath`, `autoDrainInbox`, `budgetCheckPeriod`, `weekStartsOn`,
`activeHolidayBudgetPath`, `recurringTagPrefix` (`subscriptions`),
`autoLogRecurring`, `quickAddUseNoteDate`, `tripModeActive` / `activeTripGoalPath`.

The daily-note folder and date format are auto-detected from the **Journals**
community plugin or the core **Daily notes** plugin when present; the manual
setting is the fallback.

## Development

```bash
npm test   # node --test, runs tests/*.test.js
```

Shared logic lives in `finance-core.js` (unit-tested) and is mirrored into a `core`
IIFE inside `main.js`, which Obsidian loads directly (no build step). A change to a
core function must be made in **both** places.
