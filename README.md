# Finance Tracker

Finance Tracker is an Obsidian plugin for logging spending from Apple Shortcuts straight into your daily note, keeping the `#log/spending` total updated, and turning those notes into spending, holiday, and savings-goal dashboards.

## What it does

- Captures spending through a custom `obsidian://finance-capture` URL.
- Appends each transaction to your `## Spending` section.
- Recalculates the running total next to `#log/spending` every time.
- Writes entries as plain markdown using `#log/spending/{{category}}` tags.
- Renders a weekly `finance-dashboard` code block with a pie chart and budget progress.
- Renders a dedicated `holiday-dashboard` code block for trip spending and holiday budget progress.
- Renders a `savings-dashboard` code block for savings goals and a holiday trip-preparation dashboard.
- Adds a command to write flat or period-based exchange rates into a holiday budget note.
- Adds a command to create standalone savings goal notes.
- Exports parsed transactions to CSV.

## Entry format

New spending payments are written in this shape:

```md
## Finance
- [ ] #log/spending 18.48
	- $18.48 #log/spending/food/groceries
		- Woolworths
```

You can also track income and savings-goal activity in the same section:

```md
## Finance
- $1200 #log/income/pay
	- Salary
- $300 #log/income/japanmidyear
	- Transfer to Japan fund
- $90 #log/spending/goal/rainy-day-fund/emergency
	- Car battery
```

Travel and historical notes using paths such as `#log/25/japan/spending/food/snacks` are also parsed by the dashboard.

Holiday notes can use tags like:

```md
#log/spending/2026/japan/food/restaurants
#log/spending/2026/japan/accommodation
#log/spending/2026/japan/shopping
#log/spending/26/japanmidyear/planned/flights
```

The plugin also parses older travel-note styles like `#log/25/japan/spending/food/snacks` and planned-payment tags like `#log/spending/26/japanmidyear/planned/flights`.

## Apple Shortcuts URL

The plugin accepts this URL shape:

```text
obsidian://finance-capture?vault=<vault>&amount=12.50&merchant=Coles&name=Coles&card=Visa&category=food/groceries&source=apple-pay
```

Expected fields:

- `amount`: numeric amount to log
- `merchant`: merchant shown under the payment line
- `name`: optional display name from Shortcuts
- `card`: optional card or pass name
- `category`: category path such as `food/groceries`
- `source`: optional source, for example `apple-pay`

Suggested day-to-day categories:

- `groceries`
- `restaurants`
- `snacks`
- `transport`
- `subscription`
- `medical`
- `clothes`
- `uncategorized`

## Weekly dashboard

Add this code block to your weekly note:

```finance-dashboard
period: week
groupBy: primary
```

Supported options:

- `period`: `day`, `week`, `fortnight`, `month`, `bimonth`, `quarter`, or `year`
- `groupBy`: `primary` or `full`
- `currency`: override display currency
- `start` and `end`: explicit date range in `YYYY-MM-DD`

## Daily budget check

Add this code block to your daily note template:

```daily-budget-check
groupBy: full
```

This block evaluates your budgeting progress over the current budget period and highlights overspent categories in red.
It uses your configured `Week starts on` setting and your chosen `Budget check period` setting by default, so it can check a week, fortnight, month, bi-month, quarter, or year.
If the daily note falls inside a holiday budget date range, this block also shows `Can Spend / Day` from the active holiday plan.
If you mark savings goals as active, it also shows the required savings target for the current period.

## Savings dashboard

Add this code block to a savings goal note or holiday budget note:

```savings-dashboard
```

For normal savings goals it shows:

- target amount
- current saved
- amount remaining
- required this period
- saved percentage
- current period contributions

For holiday notes the same block renders a Trip Preparation dashboard that shows:

- current account balance
- paid planned expenses
- saved progress
- still need to save before departure
- travel budget remaining after departure
- required this period
- a planned-expenses calendar
- planned and allocated expense sections

## Holiday dashboard

Add this code block to your holiday daily note template:

```holiday-dashboard
holiday: 2026/japan
```

Supported options:

- `holiday`: the holiday tag root after `#log/spending/`, for example `2026/japan`
- `budget`: optional path to the holiday budget note
- `currency`: optional display currency override
- `start` and `end`: optional date limits in `YYYY-MM-DD`

The holiday dashboard shows:

- holiday budget
- total spent
- total spent as a percentage of the holiday budget
- remaining amount after planned and booked commitments
- can spend per day based on remaining amount and remaining trip days
- trip days so far
- average spend per day excluding accommodation
- average accommodation spend per day
- average transport spend per day
- average food spend per day
- foldable planned-expense items with their matched payment logs

## Budgets

The plugin reads budgets from a markdown table, by default in `Utility/Budgets/💸 Budgets.md`.

Example:

```md
| Name | Category | Limit | Period | Currency |
| --- | --- | ---: | --- | --- |
| Groceries | food/groceries | 120 | week | AUD |
| Restaurants | food/restaurants | 80 | week | AUD |
| All Spending | all | 450 | week | AUD |
```

Holiday budget notes include frontmatter, savings fields, a planned-expenses table, and an allocated-expenses table. Example:

```md
---
holiday_name: Japan 2026
holiday_tag: 2026/japan
total_budget: 5000
savings_goal_key: japanmidyear
savings_goal_amount: 5000
savings_starting_balance: 0
savings_due_date: 2026-09-10
active_savings_goal: true
carry_missed_savings: false
savings_display_mode: dual-phase
savings_progress_mode: account-plus-paid-planned
currency: AUD
start_date: 2026-09-10
end_date: 2026-09-24
exchange_rates: JPY=0.0097, JPY CASH=0.0100, USD=1.53
exchange_rate_periods: 2026-09-10..2026-09-14:JPY=0.0098, JPY CASH=0.0101; 2026-09-15..2026-09-24:JPY=0.0095
---

| Item | Category | Planned | Booked |
| --- | --- | ---: | ---: |
| Flights | flights | 1200 | 1200 |
| Accommodation Total | accommodation | 1800 | 900 |
| Recreation | recreation | 700 | 0 |

| Item | Category | Allocated | Start | End | Link |
| --- | --- | ---: | --- | --- | --- |
| Transport | transport | 250 |  |  |  |
| Shopping | shopping | 400 |  |  | [[_ Tokyo Shopping List]] |
| Food | food | 600 |  |  | [[_ Japan Food Ideas]] |
```

When you create a new holiday from settings, the modal now lets you set:

- the holiday tracking tag, for example `2026/japan`
- the start date as a date property
- the end date as a date property
- the file is saved with `Budget` appended to the holiday name automatically

Holiday detection:

- you do not need to turn a holiday mode on or off
- the plugin treats spending as holiday spending automatically when the transaction date falls between a holiday budget note's `start_date` and `end_date`
- holiday budgets can still be created, selected, and archived from settings

New holiday notes seed planned expenses with `flights`, `accommodation`, and `recreation`, and allocated expenses with `transport`, `shopping`, and `food`.

Standalone savings goal notes:

- Use the command palette action `Create savings goal`
- Log contributions with `#log/income/{goal_key}`
- Log non-holiday withdrawals with `#log/spending/goal/{goal_key}/{category}`

Exchange rate rules:

- `currency` is the budget and dashboard currency the plugin should use, for example `AUD`
- `exchange_rates` is the flat fallback rate map for the whole trip, and can include several source currencies
- `exchange_rate_periods` lets you override rates for specific date ranges
- rates are interpreted as `1 foreign currency unit = X budget currency units`
- cash can use a separate rate key like `JPY CASH`

Frontmatter format:

- `exchange_rates` format: `SOURCE=RATE, SOURCE CASH=RATE, OTHER=RATE`
- `exchange_rate_periods` format: `YYYY-MM-DD..YYYY-MM-DD:SOURCE=RATE, SOURCE CASH=RATE; YYYY-MM-DD..YYYY-MM-DD:SOURCE=RATE`
- use commas to separate multiple rate keys inside one period
- use semicolons to separate different periods
- period-specific rates override the flat `exchange_rates` values for matching dates

Frontmatter examples:

```md
exchange_rates: JPY=0.0097, JPY CASH=0.0100, USD=1.53
exchange_rate_periods: 2026-06-18..2026-06-24:JPY=0.0098, JPY CASH=0.0101; 2026-06-25..2026-07-02:JPY=0.0095, USD=1.50
```

Example:

- `exchange_rates: JPY=0.0097, JPY CASH=0.0100, USD=1.53` means the same holiday can convert card yen, cash yen, and USD into the holiday budget currency
- `exchange_rate_periods: 2026-06-18..2026-06-24:JPY=0.0098, JPY CASH=0.0101; 2026-06-25..2026-07-02:JPY=0.0095` uses different rates during different parts of the trip

Exchange-rate command:

- Run `Add holiday exchange rate` from the command palette.
- Pick the holiday budget note you want to update.
- Choose `Whole holiday` for a flat rate or `Date range` for a period override.
- Enter the source currency, target currency, and rate.
- Period rates are written into `exchange_rate_periods`, and flat rates are written into `exchange_rates`.

When a captured holiday spend arrives in another currency and a matching exchange rate exists, the daily note line is written like:

```md
- ¥1,800 JPY : $17.46 AUD #log/spending/2026/japan/food/restaurants
	- Ichiran
```

For cash, the currency input can be something like `YEN CASH`, which writes:

```md
- ¥1,800 JPY CASH : $18.10 AUD #log/spending/2026/japan/food/restaurants
	- Cash ramen
```

If no currency is supplied, the plugin assumes your normal default currency, which is usually `AUD`.

Planned expense columns:

- `Planned`: the fallback amount used for holiday planning
- `Booked`: the committed amount that overrides `Planned` once it is above `0`
- these rows are for whole-trip planning metrics only and do not create calendar events

Allocated expense columns:

- `Allocated`: your predicted in-trip spend for that bucket
- `Start` and `End`: optional span for that allocation; if blank it uses the whole trip
- `Link`: optional supporting note or location link

Planned-payment rules:

- Log planned holiday payments in the daily note with tags like `#log/spending/26/japanmidyear/planned/flights`
- These planned-payment entries are used by the holiday dashboard only
- They do not count toward normal weekly, monthly, quarterly, or yearly budget checks

Savings frontmatter:

- `active_savings_goal: true|false`
- `carry_missed_savings: true|false`
- `savings_display_mode: standard|dual-phase`
- `savings_progress_mode: account-plus-paid-planned|account-only`
- `savings_goal_key`
- `savings_goal_amount`
- `savings_starting_balance`
- `savings_due_date`

Holiday savings math:

- `Current Account Balance` = starting balance + contributions - withdrawals
- `Paid Planned Expenses` = paid amounts matched from planned-expense logs like `#log/spending/26/japanmidyear/planned/flights`
- `Saved Progress` = current account balance + paid planned expenses when `savings_progress_mode: account-plus-paid-planned`
- `Still Need To Save` = savings goal amount - saved progress before the trip

Trip Preparation calendar:

- the calendar is driven only by planned holiday log entries in daily notes
- planned table rows do not create calendar events
- use dated planned log entries like:

```md
- $1460.32 #log/26/japanmidyear/planned/flights 2026-06-18
	- [[_ Brisbane Airport]]
- $500 #log/26/japanmidyear/planned/accommodation 2026-06-18 2026-06-22
	- [[_ Tokyo Hotel Example]]
- $120 #log/26/japanmidyear/planned/recreation 2026-06-24
	- [[_ Kyoto Tea Ceremony Example]]
```

- when you click a day in the Trip Preparation calendar, that day's matching flight, accommodation, and recreation entries appear underneath with their indented notes and clickable `[[...]]` links

Example standalone savings goal:

- `Utility/Budgets/Roadbike Savings Goal.md`
- target amount `3000`
- goal key `roadbike`
- standard savings mode with a working `savings-dashboard` block

## Settings

The settings tab lets you configure:

- daily notes folder
- spending heading and root tag
- default currency
- shortcut category list
- dashboard grouping defaults
- pie chart label threshold
- week start day
- budget check period
- budgets folder and archive folder

## CSV export

Every time you export, the plugin asks which folder you want to save the CSV into before writing the file.

## Development

Run tests with:

```bash
npm test
```

Plugin files:

- `main.js`: plugin entrypoint
- `styles.css`: dashboard and settings styles
- `manifest.json`: Obsidian plugin manifest
- `versions.json`: minimum Obsidian version map
- `tests/`: parser and formatting tests

## Publishing notes

Before publishing to GitHub or the Obsidian community plugin ecosystem:

- keep `manifest.json`, `package.json`, and `versions.json` on the same release version
- tag releases with the plugin version, for example `0.1.0`
- include `manifest.json`, `main.js`, and `styles.css` in the release assets if you publish binaries
