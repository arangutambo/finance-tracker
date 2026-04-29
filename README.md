# Finance Tracker

Finance Tracker is an Obsidian plugin for logging spending from Apple Shortcuts straight into your daily note, keeping the `#log/spending` total updated, and turning those notes into weekly budget and category dashboards.

## What it does

- Captures spending through a custom `obsidian://finance-capture` URL.
- Appends each transaction to your `## Spending` section.
- Recalculates the running total next to `#log/spending` every time.
- Writes entries as plain markdown using `#log/spending/{{category}}` tags.
- Renders a weekly `finance-dashboard` code block with a pie chart and budget progress.
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

## Budgets

The plugin reads budgets from a markdown table, by default in `Utility/Finance/Budgets.md`.

Example:

```md
| Name | Category | Limit | Period | Currency |
| --- | --- | ---: | --- | --- |
| Groceries | food/groceries | 120 | week | AUD |
| Restaurants | food/restaurants | 80 | week | AUD |
| All Spending | all | 450 | week | AUD |
```

## Settings

The settings tab lets you configure:

- daily notes folder
- spending heading and root tag
- default currency
- shortcut category list
- dashboard grouping defaults
- pie chart label threshold
- budget note path
- CSV export folder

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
