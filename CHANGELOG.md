# Changelog

## 1.0.1

**Adding your first bill works in a new vault.**

- **Fixed: a new vault had no way to add a bill.** The Bills tab only said to tag a
  payment by hand. It now has **Add bill** from the start, and there's an **Add a
  bill** command.
- **Fixed: a bill added with a calendar rule had no due date until it was paid.**
  "The 14th of each month" is now due on the next 14th straight away, so it counts
  toward what's due in the next 30 days and toward runway.

## 1.0.0

**Shares that keep themselves up to date.**

- **Yahoo prices work.** Yahoo refuses requests that don't look like a browser's —
  every request from the author's Mac was refused — so the plugin's requests now
  identify as one, try Yahoo's second server when the first refuses, and time out
  after eight seconds. London prices quoted in pence become pounds.
- **Fixed: "today" was the gain over two years.** Yesterday's close is now the last
  daily bar before the current trading day, dated on the exchange's own calendar.
- **A page for each holding**: its price over 1M to 2Y with your trades marked,
  your average cost as a line and ex-dividend dates as ticks, plus parcels, recent
  dividends, Log trade and a link to Yahoo Finance.
- **Watchlist**: follow tickers you don't own, with price, today, the month and a
  sparkline. Holdings get a month sparkline too.
- **Dividends to log**: from Yahoo's dividend history and the units you held
  before each ex-date, dividends with nothing logged are listed in the portfolio
  and the inbox, ready to log with the estimate or dismiss.
- **Shares today** on the hub's Today tab: the day's move and the biggest mover.

**A home for everything beyond logging: the finance hub.**

- **The finance hub** (ribbon wallet icon, **Open finance hub**) puts Today, Inbox,
  Budgets, Bills, Goals & trips, Portfolio and Reviews in one view, each tab with its
  own command. The Inbox tab's badge counts what's waiting. The Daily budget sidebar
  stays, with a **Hub** button.
- **Blocks keep themselves current.** Every finance block open in a note, the hub
  and the sidebar refresh once when a daily note, budget, goal, bill or the portfolio
  note changes, including changes synced from another device. A block you're typing
  into waits until you click away.

**Categorising is one pass through an inbox, not a daily chore.**

- **Categorisation inbox**: every uncategorised entry, whatever its date, grouped by
  merchant, with a suggested category and where it came from, and one tap to file
  them all. Failed captures are listed with Retry and Dismiss.
- **Suggestions learn from your notes**: merchant rules, then how the same shop was
  filed before, then shops with the same root ("SQ * Milk N Mochi Pty Ltd" and
  "Milk N Mochi" are one shop). Quick add's preview now shows the guess it will use.
- **Merchant rules can be added, edited and tested in settings**, not only removed.
  The `Merchant Map.md` import, gated off since 0.7, runs again, and your own rules
  win over the file.
- **Rename or split a category** rewrites it across daily notes, the budgets table
  and merchant rules, or splits it by merchant, behind a preview.
- **Edit transaction** gains a category picker with search, a date that moves the
  entry to that day's note, and "apply to the other N from this shop".
- **Fixed: trips filed under `#log/archive/<year>/<trip>/…` counted as home
  spending.** **Convert legacy trip tags** rewrites them to the current trip format.

**Bills are notes.**

- **One note per bill** in `Utility/Budgets/Bills/`, with its terms as properties:
  cadence, due rule (after the last payment, a day of the month, or the nth weekday),
  amount, aliases, reminder days, price changes, end date. **Convert recurring
  payments to bill notes** builds them from the old tags and registry, merging
  duplicate wordings, behind a preview.
- **The Bills list** groups bills as Overdue, Due soon, Later this month and Later,
  with **Mark paid** and a menu for push, skip, edit, merge, pause and end. Skips are
  recorded on the bill instead of as $0 lines. Payments no bill claims are offered as
  **Track**, **Add to a bill** or **Ignore**.
- **Captures are matched to bills** by merchant alias, with an Undo.
- **Tidy up recurring payments** removes same-day duplicate charges (the author had
  $570 of triple-logged gym payments), old $0 skip lines and leftover registry rows.
- **Fixed: bills you had removed still counted** toward cost per month, cost per
  year and everything downstream of them.
- **Fixed: the forecast used every bill ever detected** and started from $0 without
  saying so; it now uses live bills and says which inputs are missing.

**Shares and ETFs.**

- **A portfolio** from a Trades table in `📈 Portfolio.md`: holdings (first in, first
  out, brokerage in the cost base), gains, dividends (`#log/income/dividend/<ticker>`)
  with yield on cost, an annualised return, value against cost over time, and a
  12-month-held flag. **Log a trade** has ticker search. Not financial or tax advice.
- **Prices are a choice**: typed into the note (the default, no network), a Google
  Sheet you publish (settings give you the template), or Yahoo Finance's unofficial
  feed, which backs off when it refuses and keeps showing the last prices, marked old.
- **Net worth becomes Accounts & portfolio**: balance snapshots plus the portfolio.
  Snapshot balances suggests the accounts you already use.

**Reviews that answer more than "how much".**

- **`finance-dashboard` sections**: income and savings rate, an uncategorised callout,
  category changes against the previous period, top merchants, largest transactions,
  bills paid and still due, trip spending (never in home totals), and portfolio
  activity. Weekly and monthly dashboards show them all, existing notes included;
  `show:` and `hide:` choose them and their order.
- **Insert weekly review** and **Insert monthly review** paste a frozen review of
  the note's own week or month. Yearly and quarterly reviews use the note's date too.
- **Fixed: "vs previous month" compared a 31-day stretch**, not the previous calendar
  month. A finished week's budget bars no longer say "keep to $X/day".

**Goals and trips that speak up.**

- **Prompts** when a goal is due soon, due, or at its target, and when a trip starts,
  ends with trip mode still on, or is over: each leads into contributing, a new due
  date, trip mode or archiving (after a confirmation), and can wait until tomorrow.
- **Fixed: a goal with nothing saved called itself "on track"** (the author's iPhone
  goal, $0 of $2,000, due the next day).
- **Goal keys and trip tags are made from the name** and shown as the tag they'll
  produce, kept unique; the old "Goal key" and "Trip tracking tag" fields are under
  Advanced. New trips ask for their currency instead of every note being born with
  yen rates. A goal without a due date is no longer due the day it's created.
- **Withdraw from a goal**, alongside Contribute, with goal autocomplete.
- **Runway against a real balance**: choose the account it comes out of and runway
  says covered (with how many days it lasts) or short by how much, and when.
- **Fetch current rate** on trip exchange rates: the European Central Bank's
  reference rate, one request, only when pressed.

**Everything else.**

- Settings follow the hub's areas, with jump links. Command names match the buttons
  (**Log due bills**, **Start trip mode**); ids are unchanged, so hotkeys survive.
- Money fields ask a phone for a decimal keyboard; forms, stat cards and the
  12-month grid fit a phone.
- CSV export adds `entry_type`, `my_share`, `trip` and `goal` columns at the end.
- Labels are sentence case, and messages no longer show raw markdown backticks.
- Fixed: two entries on the same line could overwrite each other when edited.
- `main.js` is now generated from `finance-core.js` and `src/` by a dependency-free
  script; `npm test` fails if it drifts.

## 0.8.0

**Bills know which cycles a price change actually applies to.**

- **Fixed: a scheduled price change was ignored by every projection.** A bill repricing on
  15 Aug whose next payment is not until 8 Oct was still shown, totalled, and projected at
  its old price — the new amount only took effect once the change *date* passed, regardless
  of whether any payment remained at the old price. Per-month/per-year totals, the runway
  target and "due next 30 days" now price each cycle at what will actually be charged.
  Logging is deliberately unchanged: **Log now** and auto-log still use today's price, since
  a payment made today is charged today's price.
- **Fixed: a bill with an End Date or Payments Left was projected past its own end** in the
  runway and due-within windows.
- **Upcoming-payments preview in the edit-bill dialog.** The next eight cycles are laid out
  with the price each one will be charged at, the first repriced cycle highlighted, and a
  plain-language summary ("3 more payments at $89.00, then $66.50 from 10 Nov 2026"). It
  updates as you type, so a change date set a few days either side of a due date shows its
  consequences before you save.
- **Payment calendar** in the recurring-payments block: a month grid of when bills actually
  land, built like the trip planner's planned-expenses calendar — dots per bill, daily totals,
  click a day for the detail. Overdue, normal and repriced payments are dotted differently.
  Weeks with nothing due are skipped. **1 month / 3 months / 12 months** buttons switch the
  horizon for the session, Settings → Dashboard → **Payment calendar range** sets the default,
  and `months:` in the block config pins it per note.
- **The 12-month range gets its own compact view.** A year of week grids is 52 stacked rows —
  the same information, unreadable. At twelve months the calendar switches to a month-per-row
  heat grid: one line per month, one small cell per day-of-month, shaded in four bands by that
  day's total, with the month's total down the right-hand side. Because bills recur on the same
  day each month, the vertical stripes *are* the pattern — the 9th and the 14th being heavy
  every month reads in one glance. Repriced and overdue days keep their own colour, and clicking
  any cell opens the same day detail.
- **Fixed: skipping a cycle could invent a bill called "Skipped This Cycle".** When a bill's
  tag carried no item name, **Skip cycle** wrote a bare `#log/spending/subscriptions/monthly`
  line, and the next parse — having no name to go on — named a bill after the marker's own
  note text. Skipping *that* wrote another nameless line, so the ghost renewed itself every
  cycle. A $0 line is now only ever a skip marker for a bill that already exists, and the
  skip line always names its bill.
- The bill row now leads with what the *next* payment costs, and says how many cycles remain
  at the old price rather than only naming the change date.

**Two new capture methods, and the ability to run them all at once.**

- **Batched queue.** `obsidian://finance-capture?lines=…` accepts a whole queue of
  transactions in one open, so an Apple Pay automation can accumulate spending on the phone
  all day and flush it with a single app switch instead of foregrounding Obsidian on every
  tap. Each line is parsed independently — one bad line lands in `Inbox/_failed/` with the
  reason and never costs you the rest of the batch.
- **GitHub gist capture.** The phone appends a capture line to a private gist and the plugin
  polls it, logs what's waiting, and clears it. This is the only method that captures without
  opening Obsidian *and* works on an Obsidian Sync vault — and the only one that works from an
  Apple Watch. The drain re-reads before clearing, so a transaction added mid-sync is
  preserved; if the gist was rewritten underneath it, it is left alone and says so rather than
  destroying captures.
- **Capture methods can be switched on and off individually** (Settings → Capture methods) and
  are designed to run together. Quick add and hand-typed bullets always work and have no toggle.
- **Cross-method duplicate detection.** The same purchase arriving by two different methods is
  logged once. Detection compares amount + date + merchant, but only ever across *different*
  methods or `source=` values — so two identical coffees down the same pipe are still two
  entries, while one Coles charge seen by both the ANZ automation and the Wise sync is one.
  Configurable as skip / warn / off, with a duplicate window (1 day by default) for feeds that
  settle late. Quick add is exempt: it has its own pre-submit warning, so pressing the button
  always logs.
- **Overlap report.** Settings shows which pairs of capture methods have actually been logging
  the same transactions, with a **Check capture methods for overlap** command for the detail —
  measured from what happened rather than guessed from what each Shortcut is meant to cover.
- **Sync capture gist now** command.
- README documents both new methods with Shortcut recipes, and adds an (explicitly untested)
  Android section covering Tasker / MacroDroid / HTTP Shortcuts equivalents.

## 0.7.0

**Fixed: daily-note totals could be wrong.** The running total written onto the
`#log/spending` root line counted numbers appearing inside a transaction's own
merchant or note child lines — so `Shell Coorparoo 1234` added 1234 to the
total, and `7-Eleven` added 11. Dashboards, budgets and every chart were always
correct (they parse the tagged entry lines only); the wrong number was the one
written into the note. Totals now heal whenever a note is opened, and the new
**Repair daily note totals** command fixes an entire backlog in one pass. Run it
once after upgrading.

Also in this release:

- **Runway replaces the bill reserve.** The bill reserve was an envelope you
  funded and drew down. Runway is simpler: a read-only figure answering "how much
  do I need available to be safe for the next month?", computed by walking your
  actual bill schedule. Pick a period (1 week to 6 months) and whether usual
  spending counts, both in Settings → Runway, and it shows the total, a per-week
  and per-day breakdown, and every bill making it up. No contributions, no
  balance, no bookkeeping. Existing `#log/income/billreserve` bullets are left
  alone and still count as transfers rather than income.
- **Fixed: the dashboard donut ignored your Default grouping setting** and always
  used full category paths. It also drew three concentric bands whenever any one
  category had a subcategory, which meant categories without one had their wedge
  repeated three times in the same colour — the fragmented look. Now two bands,
  and the outer ring only appears over categories that actually split.
- **Foreign currency in quick add.** `58 USD : 83.64 obsidian sync` records what
  you were charged and what it cost, with no stored rate.
- **Bills that stop on their own.** Give a recurring bill an **End Date** or
  **Payments Left** and it retires itself — for fixed-term contracts and
  instalment plans. See [Recurring payments](#recurring-payments).
- **Push a week** on any bill: moves just the next due date, leaves the cadence
  alone.
- **One `Insert a finance block` command** replaces eight near-identical
  `Insert … block` commands, and picks from a list that describes each block.
  Several other commands were renamed to Obsidian's conventions; 27 commands
  became 21.
- **Clearer action hierarchy.** The main action on a row (Log now, Contribute,
  Settle up) is now a filled button and everything else is a quiet outline, so a
  row with six controls no longer reads as six equal choices. Amounts sit apart
  from names and are set larger, the way a receipt reads.
- **Trips, not holidays.** User-facing copy settles on one word. Tags,
  frontmatter and block names are unchanged, so nothing in your vault needs
  editing.
- **Simpler settings.** Six sections instead of nine, with folder paths, note
  filenames and the merchant map tucked behind **Advanced**. The Capture section
  now reports what the plugin can actually see in your vault, so a wrong folder
  says so instead of yielding an empty dashboard.
- **Exact money in the compounding maths.** The runway and forecast calculations
  work in integer cents instead of floats — those were the two places several
  arithmetic steps stacked up before anything got rounded.
