# Finance Tracker

Finance Tracker is an Obsidian plugin for logging spending from Apple Shortcuts straight into your daily note, keeping the `#log/spending` total updated, and turning those notes into weekly budget and category dashboards.

## What it does

- Captures spending through a custom `obsidian://finance-capture` URL.
- Appends each transaction to your `## Spending` section.
- Recalculates the running total next to `#log/spending` every time.
- Writes entries as plain markdown using `#log/spending/{{category}}` tags.
- Renders a weekly `finance-dashboard` code block with a pie chart and budget progress.
- Renders a dedicated `holiday-dashboard` code block for trip spending and holiday budget progress.
- Exports parsed transactions to CSV.

## Entry format

New payments are written in this shape:

```md
## Spending
- [ ] #log/spending 18.48
	- $18.48 #log/spending/food/groceries
		- Woolworths
```

Travel and historical notes using paths such as `#log/25/japan/spending/food/snacks` are also parsed by the dashboard.

Holiday notes can use tags like:

```md
#log/spending/2026/japan/food/restaurants
#log/spending/2026/japan/accommodation
#log/spending/2026/japan/shopping
```

The holiday dashboard treats `2026/japan` as the holiday key and still groups the spending by the real category like `food`, `accommodation`, or `shopping`.

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

- `period`: `day`, `week`, or `month`
- `groupBy`: `primary` or `full`
- `currency`: override display currency
- `start` and `end`: explicit date range in `YYYY-MM-DD`

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

- total spent out of the whole holiday budget
- average spend per day excluding accommodation
- average food spend per day so far
- average shopping spend per day so far
- planned, booked, and prepaid trip costs from the holiday budget note

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

Holiday budget notes can also include frontmatter and a planned-expenses table. Example:

```md
---
holiday_name: Japan 2026
holiday_tag: 2026/japan
total_budget: 5000
currency: AUD
start_date: 2026-09-10
end_date: 2026-09-24
---

| Item | Category | Planned | Booked | Paid | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Flights | flights | 1200 | 1200 | 1200 | |
| Accommodation | accommodation | 1800 | 900 | 900 | First half booked |
| Recreation | recreation | 700 | 0 | 0 | |
```

When you create a new holiday from settings, the modal now lets you set:

- the holiday tracking tag, for example `2026/japan`
- the start date as a date property
- the end date as a date property
- the file is saved with `Budget` appended to the holiday name automatically

New holiday notes now seed planned expenses with only `flights`, `accommodation`, and `recreation`.

## Settings

The settings tab lets you configure:

- daily notes folder
- spending heading and root tag
- default currency
- shortcut category list
- dashboard grouping defaults
- pie chart label threshold
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
