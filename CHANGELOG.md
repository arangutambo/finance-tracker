# Changelog

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
