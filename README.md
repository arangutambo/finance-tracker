# Finance Tracker

An Obsidian plugin that logs spending as tagged bullets inside your daily notes,
keeps a running total, and turns those notes into spending, budget, holiday and
savings dashboards. Your markdown notes stay the source of truth — no database.

## First-time setup (empty vault)

From a brand-new vault, in order:

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
