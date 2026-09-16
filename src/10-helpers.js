
// [self-write guard] Tracks paths the plugin is currently writing so its own
// vault.on("modify"/"create") handlers don't re-fire on them — prevents the
// write -> modify-event -> write feedback loops (100% CPU freezes).
const _ftSelfWrites = new Set();
function _ftModify(app, file, data) {
  if (file && file.path) {
    _ftSelfWrites.add(file.path);
    setTimeout(() => _ftSelfWrites.delete(file.path), 1500);
  }
  return app.vault.modify(file, data);
}
function _ftCreate(app, path, data) {
  const p = typeof path === "string" ? path : path && path.path;
  if (p) {
    _ftSelfWrites.add(p);
    setTimeout(() => _ftSelfWrites.delete(p), 1500);
  }
  return app.vault.create(path, data);
}

// Shortest merchant key allowed to match as a substring rather than in full.
// Bank feeds pad the merchant with branch and terminal noise ("Woolworths/cnr
// Brisbane H", "SQ * Taco De Birria"), so one rule has to cover every variant —
// but a two- or three-letter key ("iga") turns up inside unrelated names, so
// short keys stay exact-match only.
const MERCHANT_SUBSTRING_MIN = 4;

// Bank feeds also truncate to a fixed column width ("S & H Pharmacy Investm"),
// which containment cannot catch because there the stored name is the longer
// string. Truncation always keeps the prefix, so a prefix match recovers those
// — with a higher floor, since a short prefix is a far weaker signal than a
// whole name sitting inside a padded descriptor.
const MERCHANT_PREFIX_MIN = 8;

// Resolves a merchant key against a set of stored keys, in descending order of
// how sure the match makes us: the key itself, then the longest stored key
// sitting inside it, then an unambiguous truncation of a stored key.
function lookupMerchantKey(key, entries, read) {
  if (!key) return "";

  const exact = entries.get(key);
  if (exact) {
    const resolved = read(exact);
    if (resolved) return resolved;
  }

  // Longest wins, so a specific rule ("costcogas") beats a general one
  // ("costco") regardless of what order the map happens to be in.
  let contained = "";
  let containedLength = 0;
  for (const [candidate, value] of entries) {
    if (candidate.length < MERCHANT_SUBSTRING_MIN || candidate.length <= containedLength) continue;
    if (candidate === key || !key.includes(candidate)) continue;
    const resolved = read(value);
    if (!resolved) continue;
    contained = resolved;
    containedLength = candidate.length;
  }
  if (contained) return contained;

  // A truncated descriptor is a prefix of several stored merchants as often as
  // one ("costco" prefixes both Costco rules), and there is no basis for
  // picking between them. Only act when every candidate agrees on the category
  // — a wrong guess here is worse than leaving it uncategorized.
  if (key.length < MERCHANT_PREFIX_MIN) return "";
  const agreed = new Set();
  for (const [candidate, value] of entries) {
    if (candidate === key || !candidate.startsWith(key)) continue;
    const resolved = read(value);
    if (resolved) agreed.add(resolved);
  }
  return agreed.size === 1 ? [...agreed][0] : "";
}

const DEFAULT_SETTINGS = {
  dailyNotesFolder: "Journal/Periodics/1. Daily",
  spendingHeading: "## Finance",
  spendingRootTag: "#log/spending",
  defaultCurrency: "AUD",
  budgetsFolderPath: "Utility/Budgets",
  budgetArchiveFolderPath: "Utility/Budgets/Archive",
  defaultBudgetNoteName: "💸 Budgets.md",
  activeHolidayBudgetPath: "",
  openDailyNoteAfterCapture: false,
  dashboardDefaultGroupBy: "primary",
  dashboardSliceLabelThreshold: 0.08,
  // How far the recurring block's payment calendar looks ahead: "1", "3" or
  // "12" months. A `months:` (or `weeks:`) key in the block overrides it.
  paymentCalendarMonths: "3",
  budgetCheckPeriod: "week",
  weekStartsOn: "monday",
  captureInboxFolder: "Utility/Finance/Inbox",
  merchantMapPath: "Utility/Finance/Merchant Map.md",
  merchantMap: {},
  merchantMapMigrated: false,
  learnCategoriesFromHistory: true,
  autoDrainInbox: true,
  processedExternalIds: [],
  // Which transports are live. Every one of these can run at the same time —
  // crossMethodDuplicates is what stops that turning into double-logging.
  captureMethods: { url: true, batch: true, inbox: true, gist: false },
  crossMethodDuplicates: "skip",
  duplicateWindowDays: 1,
  captureLedger: [],
  gistCaptureId: "",
  gistCaptureToken: "",
  gistCaptureFilename: "finance-capture.txt",
  gistCapturePollMinutes: 15,
  gistCaptureLastSync: "",
  recurringTagPrefix: "subscriptions",
  recurringNoteName: "🔁 Recurring Payments.md",
  recurringSortOrder: "dueDate",
  runwayPeriod: "1 month",
  runwayMode: "spending",
  excludedRecurringItems: [],
  autoLogRecurring: false,
  quickAddUseNoteDate: false,
  tripModeActive: false,
  activeTripGoalPath: "",
  schemaVersion: 1,
};

// Settings migrations run once and then never again, gated on the stored
// `schemaVersion`. Before this existed every heal below re-ran on every single
// load — cheap individually, but nothing recorded when one had done its job, so
// none could ever safely be deleted. Add a step by appending an entry and
// bumping DEFAULT_SETTINGS.schemaVersion; a migration whose `to` is older than
// every install you care about can then just be dropped.
const SETTINGS_MIGRATIONS = [
  {
    to: 1,
    describe: "0.1–0.6 settings cleanup",
    run(settings) {
      // The finance section was called "## Spending" before 0.2.0.
      if (!settings.spendingHeading || settings.spendingHeading === "## Spending") {
        settings.spendingHeading = DEFAULT_SETTINGS.spendingHeading;
      }
      // 0.2.0 could persist a Journals folder template verbatim
      // (e.g. "Journal/Daily/{{date:YYYY}}/{{date:MM}}").
      if (String(settings.dailyNotesFolder || "").includes("{{")) {
        settings.dailyNotesFolder = stripFolderTemplate(settings.dailyNotesFolder) || DEFAULT_SETTINGS.dailyNotesFolder;
      }
      if (settings.defaultBudgetNoteName === "Budget.md") {
        settings.defaultBudgetNoteName = DEFAULT_SETTINGS.defaultBudgetNoteName;
      }
      // Drop keys from schemas this plugin no longer has: the pre-0.1.0
      // csvExportFolder/categoryTagRoot/sourceTagRoot/budgetNotePath/
      // shortcutGuidePath, and categoryOptions (suggestions come from history
      // via collectKnownSuggestions, so the hand-maintained list did nothing).
      for (const key of Object.keys(settings)) {
        if (!(key in DEFAULT_SETTINGS)) delete settings[key];
      }
    },
  },
];

// Shown against each toggle in Settings → Capture methods.
const CAPTURE_METHOD_DESCRIPTIONS = {
  url: "A Shortcut opens obsidian://finance-capture?amount=… and Obsidian logs it. Works with any sync, but briefly foregrounds Obsidian for every transaction.",
  batch: "A Shortcut queues transactions on the phone and flushes them all at once via obsidian://finance-capture?lines=… — one app switch a day instead of one per tap.",
  inbox: "A Shortcut, Mac script, or the CSV reconcile drops a capture file into the inbox folder. Needs a vault the Files app can write to (iCloud Drive or Mac-local), so it does not work on the phone with Obsidian Sync.",
  gist: "The phone appends a line to a private GitHub gist and the plugin polls it. Captures without opening Obsidian, works on Obsidian Sync, and is the only method that works from an Apple Watch.",
};

const FINANCE_CAPTURE_ACTION = "finance-capture";
const DASHBOARD_BLOCK = "finance-dashboard";
const HOLIDAY_DASHBOARD_BLOCK = "holiday-dashboard";
const SAVINGS_DASHBOARD_BLOCK = "savings-dashboard";
const RECURRING_BLOCK = "finance-recurring";
const SPLITS_BLOCK = "finance-splits";
const FORECAST_BLOCK = "finance-forecast";
const NETWORTH_BLOCK = "networth-dashboard";
const QUERY_BLOCK = "finance-query";
const GOALS_BLOCK = "finance-goals";
const RUNWAY_BLOCK = "finance-runway";
const DAILY_BUDGET_VIEW = "finance-tracker-daily";
// Cadence display names live in core.RECURRING_CADENCES alongside the maths;
// this reads them from there rather than keeping a second copy in sync.
function cadenceLabel(cadence) {
  return core.RECURRING_CADENCES[cadence]?.label || core.titleCaseSegment(cadence);
}

// The registry table's prose, written into the recurring payments note both
// when the note is first created and when an older note is missing its table.
// One copy, because two had already drifted apart.
const RECURRING_REGISTRY_HELP = [
  "Hand-editable per-bill state (the checkboxes in settings and the manage block",
  "write to this table):",
  "",
  "- **Active** `no` pauses a bill; it moves to the Archived section, ready to resume.",
  "- **Auto-log** `yes` logs it automatically on its due day.",
  "- **Amount** overrides the inferred price.",
  "- **Variable** `yes` suits a fluctuating bill like a utility: it projects off the",
  "  average of recent payments rather than just the last one, and **Log now** prompts",
  "  for the real amount each time.",
  "- **Next Amount** + **Change Date** schedule a future price change, applied",
  "  automatically once the date arrives.",
  "- **Next Due** corrects the due-date schedule directly.",
  "- **End Date** retires the bill once nothing is due on or before it — for a",
  "  fixed-term contract.",
  "- **Payments Left** retires it after that many more payments, counting down each",
  "  time one is logged — for an instalment plan.",
];

// Runway is a computed display, not something you fund. Its only configuration
// is a period and a mode, both plugin settings — there is no note, no balance and
// no contribution.

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "finance";
}

function parseConfigBlock(source) {
  const config = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.+)$/);
    if (!match) continue;
    config[match[1].toLowerCase()] = match[2].trim();
  }
  return config;
}

function parseFrontmatter(content) {
  const match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!parsed) continue;
    data[parsed[1].toLowerCase()] = parsed[2].trim();
  }
  return data;
}

function toTitleFromHolidayKey(holidayKey) {
  const normalized = core.normalizeHolidayKey(holidayKey);
  if (!normalized) return "Trip";
  const [year, name] = normalized.split("/");
  return `${String(name || "")
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")} ${year}`.trim();
}

function guessHolidayTagFromName(name, referenceDate = core.todayIsoLocal()) {
  const raw = String(name || "").trim();
  const yearMatch = raw.match(/\b(20\d{2}|\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : referenceDate.slice(0, 4);
  const holidayName = core
    .normalizeCategoryPath(raw.replace(/\b(20\d{2}|\d{2})\b/g, " "))
    .split("/")
    .filter(Boolean)
    .join("-");
  return core.normalizeHolidayKey(`${year}/${holidayName || "holiday"}`);
}

function sumBy(entries, predicate) {
  return Number(
    entries
      .filter(predicate)
      .reduce((sum, entry) => sum + core.entrySpendAmount(entry), 0)
      .toFixed(2)
  );
}

function normalizeExchangeRateKey(value, fallbackCurrency) {
  const descriptor = core.parseCurrencyDescriptor(value, fallbackCurrency);
  return descriptor.rateKey;
}

function parseFlatExchangeRates(value, fallbackCurrency) {
  const rates = {};
  for (const rawPart of String(value || "").split(/[,|\n]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^([A-Za-z _]{3,})\s*=\s*([0-9.]+)$/);
    if (!match) continue;
    const rateKey = normalizeExchangeRateKey(match[1], fallbackCurrency);
    const rate = Number(match[2]);
    if (!rateKey || !Number.isFinite(rate) || rate <= 0) continue;
    rates[rateKey] = rate;
  }
  return rates;
}

function parseExchangeRatePeriods(value, fallbackCurrency) {
  const periods = [];
  for (const rawPart of String(value || "").split(/\s*;\s*/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to)\s*(\d{4}-\d{2}-\d{2})\s*[:|]\s*(.+)$/i);
    if (!match) continue;
    periods.push({
      end: core.parseIsoDate(match[2]),
      rates: parseFlatExchangeRates(match[3], fallbackCurrency),
      start: core.parseIsoDate(match[1]),
    });
  }
  return periods.filter((period) => period.start && period.end && Object.keys(period.rates).length);
}

function serializeFlatExchangeRates(rates) {
  return Object.entries(rates || {})
    .filter(([, rate]) => Number.isFinite(Number(rate)) && Number(rate) > 0)
    .map(([rateKey, rate]) => `${rateKey.replace(/_CASH$/i, " CASH")}=${Number(rate)}`)
    .join(", ");
}

function serializeExchangeRatePeriods(periods) {
  return (periods || [])
    .filter((period) => period?.start && period?.end)
    .map((period) => `${period.start}..${period.end}:${serializeFlatExchangeRates(period.rates || {})}`)
    .filter(Boolean)
    .join("; ");
}

function updateFrontmatterValue(content, key, value) {
  const text = String(content || "");
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return text;
  const lines = frontmatterMatch[1].split("\n");
  const normalizedKey = String(key || "").trim().toLowerCase();
  let updated = false;
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match || match[1].toLowerCase() !== normalizedKey) return line;
    updated = true;
    return `${match[1]}: ${value}`;
  });
  if (!updated) {
    nextLines.push(`${key}: ${value}`);
  }
  return text.replace(frontmatterMatch[0], `---\n${nextLines.join("\n")}\n---`);
}

// Spelling slips in old tags, which would otherwise become permanent categories
// of their own. Applied per segment by the legacy-trip migration.
const LEGACY_CATEGORY_FIXES = {
  accommadation: "accommodation",
  accomodation: "accommodation",
  resturants: "restaurants",
  transporation: "transportation",
};

const DEFAULT_HOLIDAY_PLANNED_EXPENSES = [
  { item: "Flights", category: "flights" },
  { item: "Accommodation", category: "accommodation" },
  { item: "Recreation", category: "recreation" },
];

const DEFAULT_HOLIDAY_ALLOCATED_EXPENSES = [
  { item: "Transport", category: "transport" },
  { item: "Shopping", category: "shopping" },
  { item: "Food", category: "food" },
];

function buildGoalKeyFromName(name) {
  return core.normalizeCategoryPath(String(name || "")) || "savings-goal";
}

function stripBudgetSuffix(value) {
  return String(value || "").replace(/\s+budget$/i, "").trim();
}

function appendBudgetSuffix(value) {
  const base = stripBudgetSuffix(value) || "Trip";
  return `${base} Budget`;
}

function parseWikiLinks(text) {
  const matches = Array.from(String(text || "").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g));
  return matches.map((match) => ({
    path: String(match[1] || "").trim(),
    label: String(match[2] || match[1] || "").trim(),
    raw: match[0],
  })).filter((link) => link.path);
}

// Compact money label for tight layouts: whole dollars lose the ".00".
function formatCurrencyShort(amount, currency) {
  return core.formatCurrency(amount, currency).replace(/\.00(?=\D|$)/, "");
}

// --- Shared card/row/button primitives ---------------------------------------
// Every block used to hand-build these three shapes, which meant the type scale
// and button weighting were re-decided (and re-diverged) at ~20 call sites.
// They are decided once, here.

// A strip of stat cards: small muted label above a large number, optionally a
// third muted line for supporting detail that should not compete with it.
function renderStatCards(host, cards) {
  const grid = host.createDiv({ cls: "finance-tracker-summary" });
  for (const card of (cards || []).filter(Boolean)) {
    const element = grid.createDiv({ cls: `finance-tracker-summary-card${card.cls ? ` ${card.cls}` : ""}` });
    element.createDiv({ cls: "finance-tracker-summary-label", text: card.label });
    element.createDiv({ cls: "finance-tracker-summary-value", text: card.value });
    if (card.hint) element.createDiv({ cls: "finance-tracker-summary-hint", text: card.hint });
  }
  return grid;
}

// A row's identity line: name left, money right and heavier — the way a receipt
// reads. Call sites used to concatenate the two into one span at one weight,
// which left the eye nothing to land on.
function renderRowTitle(host, name, amount = "") {
  const title = host.createDiv({ cls: "finance-tracker-budget-title ft-row-title" });
  title.createSpan({ cls: "ft-row-name", text: name });
  if (amount) title.createSpan({ cls: "ft-row-amount", text: amount });
  return title;
}

// Buttons are quiet outlines by default; `primary` marks the single action a
// row exists for. Also handles the disable-while-running / re-enable-on-failure
// dance that all 50-odd call sites were repeating by hand.
function addAction(host, label, onClick, options = {}) {
  const button = host.createEl("button", { text: label });
  if (options.primary) button.addClass("mod-cta");
  if (options.warning) button.addClass("mod-warning");
  if (options.tooltip) button.setAttribute("aria-label", options.tooltip);
  button.addEventListener("click", async (event) => {
    if (options.opensModal) {
      onClick(event);
      return;
    }
    button.disabled = true;
    try {
      await onClick(event);
    } catch (error) {
      new Notice(`${options.errorPrefix || label} failed: ${error.message}`);
      button.disabled = false;
    }
  });
  return button;
}

// A labelled checkbox for a genuine boolean. A button whose text reports its
// own state ("Auto-log: on") is the weakest way to show one.
function addToggleAction(host, label, checked, onChange) {
  const wrapper = host.createEl("label", { cls: "ft-inline-toggle" });
  const input = wrapper.createEl("input", { type: "checkbox" });
  input.checked = Boolean(checked);
  wrapper.createSpan({ text: label });
  input.addEventListener("change", async () => {
    input.disabled = true;
    try {
      await onChange(input.checked);
    } catch (error) {
      new Notice(`${label} failed: ${error.message}`);
      input.checked = !input.checked;
      input.disabled = false;
    }
  });
  return wrapper;
}

// Reduces a possibly-templated folder path ("Journal/Daily/{{date:YYYY}}") to
// its static prefix ("Journal/Daily"). Returns "" when nothing static remains.
function stripFolderTemplate(value) {
  return String(value || "")
    .split("{{")[0]
    .replace(/\/+$/, "")
    .trim();
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describePieSlice(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M",
    centerX,
    centerY,
    "L",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

function centroidForSlice(centerX, centerY, radius, startAngle, endAngle) {
  const midpoint = startAngle + (endAngle - startAngle) / 2;
  return polarToCartesian(centerX, centerY, radius * 0.6, midpoint);
}

// Ring segment between two radii, for the outer subcategory ring of the donut.
function describeAnnularSlice(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  const span = Math.min(endAngle - startAngle, 359.9);
  const cappedEnd = startAngle + span;
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, cappedEnd);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, cappedEnd);
  const largeArcFlag = span <= 180 ? "0" : "1";
  return [
    "M", outerStart.x, outerStart.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, outerEnd.x, outerEnd.y,
    "L", innerStart.x, innerStart.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerEnd.x, innerEnd.y,
    "Z",
  ].join(" ");
}

