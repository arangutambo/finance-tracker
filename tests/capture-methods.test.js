"use strict";

// Functional tests that load main.js itself against a stub vault, rather than
// only exercising finance-core.js. The capture wiring is exactly the kind of
// change that has silently no-opped before — a core function landing without
// its plugin-side caller — and only actually running the plugin catches it.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { StubEl } = require("./stub-dom.js");

// --- Obsidian stub ------------------------------------------------------------

class StubTFile {
  constructor(pathValue, content) {
    this.path = pathValue;
    this.content = content;
    this.name = pathValue.split("/").pop();
    this.extension = this.name.includes(".") ? this.name.split(".").pop() : "";
  }
}

const notices = [];

// The plugin reaches for window.setTimeout in a few places (focusing an input,
// scheduling the gist poll). Node has the timers but not the window.
global.window = global.window || {
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
  setInterval: (...args) => setInterval(...args),
  clearInterval: (...args) => clearInterval(...args),
};

let requestUrlHandler = async () => ({ status: 404, json: null, text: "" });

const obsidianStub = {
  ItemView: class {},
  Modal: class {
    constructor(app) {
      this.app = app;
      this.contentEl = new StubEl();
      this.ready = null;
      this.closed = false;
    }
    open() {
      this.ready = Promise.resolve(this.onOpen?.());
      return this.ready;
    }
    close() {
      this.closed = true;
      this.onClose?.();
    }
  },
  Notice: class {
    constructor(message) {
      notices.push(String(message));
    }
  },
  Plugin: class {
    constructor(app) {
      this.app = app;
    }
    registerInterval() {}
    registerEvent() {}
  },
  PluginSettingTab: class {},
  Setting: class {},
  TFile: StubTFile,
  normalizePath: (value) => String(value).replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
  requestUrl: (options) => requestUrlHandler(options),
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === "obsidian") return obsidianStub;
  return originalLoad.call(this, request, parent, isMain);
};

const FinanceTrackerPlugin = require(path.join(__dirname, "..", "main.js"));
Module._load = originalLoad;

// --- Stub vault ---------------------------------------------------------------

function makePlugin(overrides = {}) {
  const files = new Map();

  const app = {
    vault: {
      getAbstractFileByPath: (p) => files.get(p) || null,
      getFiles: () => [...files.values()],
      // Category guessing now falls back to what the daily notes already say a
      // merchant was filed as, which walks the vault through getDailyNoteFiles.
      getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === "md"),
      cachedRead: async (file) => file.content,
      read: async (file) => file.content,
      modify: async (file, content) => {
        file.content = content;
      },
      create: async (p, content) => {
        const file = new StubTFile(p, content);
        files.set(p, file);
        return file;
      },
      delete: async (file) => {
        files.delete(file.path);
      },
      createFolder: async () => {},
      on: () => ({}),
    },
    workspace: { getLeavesOfType: () => [], getLeaf: () => ({ openFile: async () => {} }) },
    metadataCache: { getFileCache: () => null },
  };

  const plugin = new FinanceTrackerPlugin(app);
  plugin.app = app;
  plugin.settings = {
    dailyNotesFolder: "Daily",
    spendingHeading: "## Finance",
    spendingRootTag: "#log/spending",
    defaultCurrency: "AUD",
    captureInboxFolder: "Utility/Finance/Inbox",
    merchantMap: {},
    processedExternalIds: [],
    captureMethods: { url: true, batch: true, inbox: true, gist: true },
    crossMethodDuplicates: "skip",
    duplicateWindowDays: 1,
    captureLedger: [],
    gistCaptureId: "abc123",
    gistCaptureToken: "token",
    gistCaptureFilename: "finance-capture.txt",
    gistCapturePollMinutes: 15,
    openDailyNoteAfterCapture: false,
    ...overrides,
  };

  // Only the bits of the plugin the capture path actually reaches.
  plugin.saveSettings = async () => {};
  plugin.invalidateIndexEntry = () => {};
  plugin._scheduleStatusBarUpdate = () => {};
  plugin.refreshDailyBudgetView = () => {};
  plugin.findHolidayContextForDate = async () => null;
  plugin.getActiveTripContext = async () => null;
  plugin.ensureFolder = async () => {};
  plugin.upsertFile = async (p, body) => {
    const file = new StubTFile(p, body);
    files.set(p, file);
    // The real one returns the file, and callers read it back.
    return file;
  };
  plugin.getDailyNotePath = (date) => `Daily/${date}.md`;
  plugin.createDailyNoteFromTemplate = async (p) =>
    app.vault.create(p, ["## Finance", "- [ ] #log/spending 0", ""].join("\n"));

  return { plugin, files, app };
}

function financeLines(files, date) {
  const file = files.get(`Daily/${date}.md`);
  if (!file) return [];
  return file.content
    .split("\n")
    .filter((line) => line.includes("#log/spending/"))
    .map((line) => line.trim());
}

test.beforeEach(() => {
  notices.length = 0;
});

// --- Batched capture ----------------------------------------------------------

test("a batched URL open logs every queued transaction into the daily note", async () => {
  const { plugin, files } = makePlugin();

  await plugin.handleCapture({
    lines: [
      "amount=12.50 | cat=food/groceries | merchant=Coles | date=2026-07-30 | source=anz",
      "amount=4.20 | cat=food/snacks | merchant=Boost Juice | date=2026-07-30 | source=anz",
      "amount=31.00 | cat=food/restaurants | merchant=Nobu | date=2026-07-29 | source=anz",
    ].join("\n"),
  });

  const july30 = financeLines(files, "2026-07-30");
  assert.equal(july30.length, 2);
  assert.ok(july30.some((line) => line.includes("12.50") && line.includes("food/groceries")));
  assert.ok(july30.some((line) => line.includes("4.20")));
  assert.equal(financeLines(files, "2026-07-29").length, 1);
});

test("a bad line in a batch is quarantined without costing the good ones", async () => {
  const { plugin, files } = makePlugin();

  await plugin.handleCapture({
    lines: ["amount=12.50 | merchant=Coles | date=2026-07-30", "total nonsense here", "amount=4.20 | merchant=Boost | date=2026-07-30"].join("\n"),
  });

  assert.equal(financeLines(files, "2026-07-30").length, 2);
  const quarantined = [...files.values()].filter((file) => file.path.includes("/_failed/"));
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0].content, /total nonsense here/);
});

test("batched capture can be switched off independently of single-URL capture", async () => {
  const { plugin, files } = makePlugin({ captureMethods: { url: true, batch: false, inbox: true, gist: false } });

  await plugin.handleCapture({ lines: "amount=12.50 | merchant=Coles | date=2026-07-30" });
  assert.equal(financeLines(files, "2026-07-30").length, 0);
  assert.match(notices.join(" "), /batched capture is turned off/i);

  // The single-transaction path still works.
  await plugin.handleCapture({ amount: "9.90", merchant: "Kmart", date: "2026-07-30" });
  assert.equal(financeLines(files, "2026-07-30").length, 1);
});

test("switching off URL capture stops single captures but leaves the batch path", async () => {
  const { plugin, files } = makePlugin({ captureMethods: { url: false, batch: true, inbox: true, gist: false } });

  await plugin.handleCapture({ amount: "9.90", merchant: "Kmart", date: "2026-07-30" });
  assert.equal(financeLines(files, "2026-07-30").length, 0);

  await plugin.handleCapture({ lines: "amount=12.50 | merchant=Coles | date=2026-07-30" });
  assert.equal(financeLines(files, "2026-07-30").length, 1);
});

// --- Cross-method duplicates ---------------------------------------------------

test("the same purchase arriving by two methods is logged once", async () => {
  const { plugin, files } = makePlugin();

  await plugin.handleCapture({ amount: "12.50", merchant: "Coles", date: "2026-07-30", source: "anz" });
  assert.equal(financeLines(files, "2026-07-30").length, 1);

  // Same purchase, now down the gist pipe from the bank feed.
  await plugin.handleCaptureBatch("amount=12.50 | merchant=Coles | date=2026-07-30 | source=wise", { method: "gist", notify: false });

  assert.equal(financeLines(files, "2026-07-30").length, 1, "the second method should not have logged a second bullet");
});

test("two identical purchases down the same method are both logged", async () => {
  const { plugin, files } = makePlugin();

  await plugin.handleCaptureBatch(
    ["amount=4.20 | merchant=Boost Juice | date=2026-07-30 | source=anz", "amount=4.20 | merchant=Boost Juice | date=2026-07-30 | source=anz"].join("\n"),
    { method: "batch", notify: false }
  );

  assert.equal(financeLines(files, "2026-07-30").length, 2, "two real coffees are two entries");
});

test("duplicate handling set to warn logs the entry anyway", async () => {
  const { plugin, files } = makePlugin({ crossMethodDuplicates: "warn" });

  await plugin.handleCapture({ amount: "12.50", merchant: "Coles", date: "2026-07-30", source: "anz" });
  await plugin.handleCaptureBatch("amount=12.50 | merchant=Coles | date=2026-07-30 | source=wise", { method: "gist", notify: false });

  assert.equal(financeLines(files, "2026-07-30").length, 2);
  assert.match(notices.join(" "), /already captured via/i);
});

test("duplicate handling set to off logs everything", async () => {
  const { plugin, files } = makePlugin({ crossMethodDuplicates: "off" });

  await plugin.handleCapture({ amount: "12.50", merchant: "Coles", date: "2026-07-30", source: "anz" });
  await plugin.handleCaptureBatch("amount=12.50 | merchant=Coles | date=2026-07-30 | source=wise", { method: "gist", notify: false });

  assert.equal(financeLines(files, "2026-07-30").length, 2);
});

test("the overlap report names the two methods that collided", async () => {
  const { plugin } = makePlugin();

  await plugin.handleCapture({ amount: "12.50", merchant: "Coles", date: "2026-07-30", source: "anz" });
  await plugin.handleCaptureBatch("amount=12.50 | merchant=Coles | date=2026-07-30 | source=wise", { method: "gist", notify: false });

  const overlap = plugin.captureOverlapReport(60);
  assert.equal(overlap.length, 1);
  assert.deepEqual(overlap[0].channels.sort(), ["gist:wise", "url:anz"]);
});

// --- Gist capture --------------------------------------------------------------

test("a gist sync logs the waiting lines and clears the gist", async () => {
  const { plugin, files } = makePlugin();
  let stored = "amount=12.50 | cat=food/groceries | merchant=Coles | date=2026-07-30 | source=anz\namount=4.20 | merchant=Boost | date=2026-07-30 | source=anz\n";
  const patches = [];

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patches.push(JSON.parse(options.body));
      stored = JSON.parse(options.body).files["finance-capture.txt"].content;
      return { status: 200, json: {} };
    }
    return { status: 200, json: { files: { "finance-capture.txt": { content: stored, truncated: false } } } };
  };

  const logged = await plugin.syncCaptureGist({ notify: true });

  assert.equal(logged, 2);
  assert.equal(financeLines(files, "2026-07-30").length, 2);
  assert.equal(patches.length, 1);
  // Cleared down to just the drain marker, so the next poll has nothing to do.
  assert.match(patches[0].files["finance-capture.txt"].content, /^# drained /);
  assert.equal(await plugin.syncCaptureGist({ notify: false }), 0);
});

test("a line appended mid-sync survives the clear", async () => {
  const { plugin } = makePlugin();
  const first = "amount=12.50 | merchant=Coles | date=2026-07-30\n";
  const appended = "amount=7.00 | merchant=Later | date=2026-07-30\n";
  let reads = 0;
  let patched = "";

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patched = JSON.parse(options.body).files["finance-capture.txt"].content;
      return { status: 200, json: {} };
    }
    reads += 1;
    // The second read (the pre-clear re-read) sees a line the phone just added.
    const content = reads === 1 ? first : first + appended;
    return { status: 200, json: { files: { "finance-capture.txt": { content, truncated: false } } } };
  };

  await plugin.syncCaptureGist({ notify: false });
  assert.match(patched, /amount=7\.00/, "the mid-sync append must not be discarded");
  assert.doesNotMatch(patched, /amount=12\.50/, "the consumed line must be cleared");
});

test("a gist rewritten mid-sync is left alone and flagged", async () => {
  const { plugin } = makePlugin();
  let reads = 0;
  let patchCount = 0;

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patchCount += 1;
      return { status: 200, json: {} };
    }
    reads += 1;
    const content = reads === 1 ? "amount=12.50 | merchant=Coles | date=2026-07-30\n" : "something else entirely\n";
    return { status: 200, json: { files: { "finance-capture.txt": { content, truncated: false } } } };
  };

  await plugin.syncCaptureGist({ notify: false });
  assert.equal(patchCount, 0, "a gist that changed underneath us must not be overwritten");
  assert.match(notices.join(" "), /changed mid-sync/i);
});

test("a bad token surfaces a useful message instead of failing silently", async () => {
  const { plugin } = makePlugin();
  requestUrlHandler = async () => ({ status: 401, json: null });

  await plugin.syncCaptureGist({ notify: true });
  assert.match(notices.join(" "), /token/i);
});

test("gist sync does nothing while the method is switched off", async () => {
  const { plugin } = makePlugin({ captureMethods: { url: true, batch: true, inbox: true, gist: false } });
  let called = false;
  requestUrlHandler = async () => {
    called = true;
    return { status: 200, json: { files: {} } };
  };

  assert.equal(await plugin.syncCaptureGist({ notify: false }), 0);
  assert.equal(called, false, "a disabled method must not touch the network");
});

// --- one file per capture (the automation-safe shape) --------------------------

test("every file in the gist is drained, and per-capture drops are deleted", async () => {
  const { plugin, files } = makePlugin();
  let patched = null;

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patched = JSON.parse(options.body).files;
      return { status: 200, json: {} };
    }
    return {
      status: 200,
      json: {
        files: {
          "finance-capture.txt": { content: "# queue\n", truncated: false },
          "capture-2026-07-30T101500-4821.txt": { content: "amount=12.50 | merchant=Coles | date=2026-07-30 | source=anz\n", truncated: false },
          "capture-2026-07-30T101502-9013.txt": { content: "amount=4.20 | merchant=Boost | date=2026-07-30 | source=anz\n", truncated: false },
        },
      },
    };
  };

  const logged = await plugin.syncCaptureGist({ notify: false });

  assert.equal(logged, 2);
  assert.equal(financeLines(files, "2026-07-30").length, 2);
  // Per-capture drops are removed outright; the shared queue file is untouched
  // because it held nothing but a comment.
  assert.equal(patched["capture-2026-07-30T101500-4821.txt"], null);
  assert.equal(patched["capture-2026-07-30T101502-9013.txt"], null);
  assert.ok(!("finance-capture.txt" in patched));
});

test("two captures written at the same instant both survive", async () => {
  const { plugin, files } = makePlugin();
  // The race the shared-file approach has: both automation runs read the same
  // content and the second write wins. Separate files cannot collide at all.
  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") return { status: 200, json: {} };
    return {
      status: 200,
      json: {
        files: {
          "capture-a.txt": { content: "amount=12.50 | merchant=Coles | date=2026-07-30 | source=anz\n", truncated: false },
          "capture-b.txt": { content: "amount=12.50 | merchant=Woolworths | date=2026-07-30 | source=anz\n", truncated: false },
        },
      },
    };
  };

  await plugin.syncCaptureGist({ notify: false });
  const lines = financeLines(files, "2026-07-30");
  assert.equal(lines.length, 2, "neither capture may be lost");
});

test("the shared queue file still clears by remainder while drops are deleted", async () => {
  const { plugin } = makePlugin();
  let reads = 0;
  let patched = null;
  const queued = "amount=5.00 | merchant=Queued | date=2026-07-30\n";

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patched = JSON.parse(options.body).files;
      return { status: 200, json: {} };
    }
    reads += 1;
    return {
      status: 200,
      json: {
        files: {
          "finance-capture.txt": { content: queued, truncated: false },
          "capture-x.txt": { content: "amount=9.00 | merchant=Drop | date=2026-07-30\n", truncated: false },
        },
      },
    };
  };

  await plugin.syncCaptureGist({ notify: false });
  assert.match(patched["finance-capture.txt"].content, /^# drained /);
  assert.equal(patched["capture-x.txt"], null);
  assert.ok(reads >= 2, "the shared file is re-read before being cleared");
});

test("a gist of nothing but per-capture drops keeps a placeholder file", async () => {
  const { plugin } = makePlugin();
  let patched = null;

  requestUrlHandler = async (options) => {
    if (options.method === "PATCH") {
      patched = JSON.parse(options.body).files;
      return { status: 200, json: {} };
    }
    return {
      status: 200,
      json: {
        files: {
          "capture-a.txt": { content: "amount=12.50 | merchant=Coles | date=2026-07-30\n", truncated: false },
        },
      },
    };
  };

  await plugin.syncCaptureGist({ notify: false });
  assert.equal(patched["capture-a.txt"], null);
  // GitHub rejects a gist left with no files, so the queue file is recreated.
  assert.match(patched["finance-capture.txt"].content, /^# drained /);
});

// --- Merchant map import ---------------------------------------------------------

test("the merchant map note is imported even on an already-migrated install", async () => {
  const { plugin, app, files } = makePlugin({
    merchantMapPath: "Utility/Finance/Merchant Map.md",
    merchantMapMigrated: false,
    merchantMap: {},
  });
  await app.vault.create(
    "Utility/Finance/Merchant Map.md",
    ["| Merchant | Category |", "| --- | --- |", "| Woolworths | food/groceries |", "| Dan Murphys | alcohol |"].join("\n")
  );

  const added = await plugin.migrateMerchantMapFile();

  assert.equal(added, 2);
  assert.equal(plugin.settings.merchantMap.woolworths, "food/groceries");
  assert.equal(plugin.settings.merchantMap.danmurphys, "alcohol");
  // The note is the user's; importing it is not a reason to delete it.
  assert.ok(files.has("Utility/Finance/Merchant Map.md"), "the merchant map note must survive the import");
  assert.match(notices.join(" "), /imported 2 merchant rules/i);

  // Second run is a no-op.
  assert.equal(await plugin.migrateMerchantMapFile(), 0);
});

test("importing the merchant map never overwrites a category you have corrected", async () => {
  const { plugin, app } = makePlugin({
    merchantMapPath: "Utility/Finance/Merchant Map.md",
    merchantMapMigrated: false,
    merchantMap: { woolworths: "food/groceries/woolworths" },
  });
  await app.vault.create("Utility/Finance/Merchant Map.md", ["| Merchant | Category |", "| --- | --- |", "| Woolworths | food/groceries |"].join("\n"));

  await plugin.migrateMerchantMapFile();

  assert.equal(plugin.settings.merchantMap.woolworths, "food/groceries/woolworths");
});

// --- Legacy trip tag migration -----------------------------------------------------

const LEGACY_NOTE = [
  "---",
  "date: 2025-10-04",
  "---",
  "",
  "## Spending",
  "- [ ] #log/spending ",
  "\t- R$195.16 - $55.60 #log/archive/25/Brazil/Spending/Accommadation ",
  "\t\t- 1 Night Pousada La Luna",
  "\t- 18BRL - 5.16 AUD #log/archive/25/Brazil/Spending/Food/Snacks ",
  "",
].join("\n");

test("legacy trip tags are planned, previewed and applied", async () => {
  const { plugin, app, files } = makePlugin();
  await app.vault.create("Daily/2025-10-04.md", LEGACY_NOTE);
  await app.vault.create("Daily/2026-09-14.md", "## Finance\n- [ ] #log/spending 27.3\n\t- $27.30 #log/spending/food/takeaway\n");

  const { plan, trips } = await plugin.planLegacyTripTagMigration();

  assert.equal(trips.length, 1);
  assert.equal(trips[0].key, "25/brazil");
  assert.equal(trips[0].currency, "BRL", "the fallback currency is read from the trip's own lines");
  assert.equal(plan.totals.files, 1, "only the note holding legacy tags is touched");
  assert.equal(plan.totals.entries, 2);

  const { written, skipped } = await plugin.applyNoteRewritePlan(plan);

  assert.equal(written, 1);
  assert.equal(skipped.length, 0);
  const after = files.get("Daily/2025-10-04.md").content;
  assert.ok(!after.includes("#log/archive/"), "no archive tags survive");
  assert.ok(after.includes("## Finance"), "the heading is brought up to date");
  assert.ok(after.includes("BRL 195.16 : $55.60 AUD #log/spending/25/brazil/accommodation"), after);
  assert.ok(after.includes("BRL 18.00 : $5.16 AUD #log/spending/25/brazil/food/snacks"), after);
  assert.ok(after.includes("\t\t- 1 Night Pousada La Luna"), "the merchant child line stays with its entry");
  // The untouched note is exactly as it was.
  assert.equal(files.get("Daily/2026-09-14.md").content, "## Finance\n- [ ] #log/spending 27.3\n\t- $27.30 #log/spending/food/takeaway\n");

  // Running it again finds nothing left to do.
  const second = await plugin.planLegacyTripTagMigration();
  assert.equal(second.plan.totals.files, 0);
});

test("a note edited since the preview is skipped, not overwritten", async () => {
  const { plugin, app, files } = makePlugin();
  await app.vault.create("Daily/2025-10-04.md", LEGACY_NOTE);

  const { plan } = await plugin.planLegacyTripTagMigration();
  // Someone edits the note while the preview is open.
  const edited = `${LEGACY_NOTE}\t- $9.00 #log/spending/food/snacks\n`;
  files.get("Daily/2025-10-04.md").content = edited;

  const { written, skipped } = await plugin.applyNoteRewritePlan(plan);

  assert.equal(written, 0);
  assert.deepEqual(skipped, ["Daily/2025-10-04.md"]);
  assert.equal(files.get("Daily/2025-10-04.md").content, edited, "the newer content must survive");
});

test("appending finance lines joins a note's existing legacy heading", async () => {
  const { plugin, app, files } = makePlugin();
  await app.vault.create("Daily/2026-02-03.md", "## Spending\n- [ ] #log/spending 10\n\t- $10.00 #log/spending/food/takeaway\n");

  await plugin.appendFinanceLines("2026-02-03", ["\t- $5.00 #log/spending/food/snacks"]);

  const content = files.get("Daily/2026-02-03.md").content;
  assert.equal((content.match(/^## /gm) || []).length, 1, "a second finance section must not appear");
  assert.ok(content.includes("- [ ] #log/spending 15"), content);
});

// --- Entry cache -------------------------------------------------------------------

test("the all-entries walk happens once until a note changes", async () => {
  const { plugin, app, files } = makePlugin();
  // The real invalidation, not the harness stub: that is what clears the cache.
  delete plugin.invalidateIndexEntry;
  await app.vault.create("Daily/2026-09-14.md", "## Finance\n- [ ] #log/spending 27.3\n\t- $27.30 #log/spending/food/takeaway\n");

  let reads = 0;
  const read = app.vault.cachedRead;
  app.vault.cachedRead = async (file) => {
    reads += 1;
    return read(file);
  };

  const first = await plugin.collectAllTransactions();
  const afterFirst = reads;
  const second = await plugin.collectAllTransactions();

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(reads, afterFirst, "a second pass must not re-read the vault");

  files.get("Daily/2026-09-14.md").content += "\t- $5.00 #log/spending/food/snacks\n";
  plugin.invalidateIndexEntry("Daily/2026-09-14.md");

  const third = await plugin.collectAllTransactions();
  assert.equal(third.length, 2, "an edited note is picked up again");
  assert.ok(reads > afterFirst);
});

test("a capture invalidates the cached entries", async () => {
  const { plugin, app } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create("Daily/2026-07-30.md", "## Finance\n- [ ] #log/spending 0\n");

  assert.equal((await plugin.collectAllTransactions()).length, 0);
  await plugin.handleCapture({ amount: "12.50", merchant: "Coles", date: "2026-07-30", source: "anz" });

  assert.equal((await plugin.collectAllTransactions()).length, 1, "the new capture must be visible immediately");
});

test("a converted trip gets an archived note so its dashboard has something to read", async () => {
  const { plugin, app, files } = makePlugin({
    budgetsFolderPath: "Utility/Budgets",
    budgetArchiveFolderPath: "Utility/Budgets/Archive",
    defaultBudgetNoteName: "Budgets.md",
    recurringNoteName: "Recurring.md",
  });
  await app.vault.create("Daily/2025-10-04.md", LEGACY_NOTE);

  const { plan, trips } = await plugin.planLegacyTripTagMigration();
  await plugin.applyNoteRewritePlan(plan);
  const created = await plugin.ensureArchivedTripNotes(trips);

  assert.equal(created.length, 1);
  const note = files.get(created[0]);
  assert.match(note.path, /Archive\/brazil-2025\.md$/);
  assert.match(note.content, /trip_tag: 25\/brazil/);
  assert.match(note.content, /archived: \d{4}-\d{2}-\d{2}/);
  assert.match(note.content, /trip_currency: BRL/);
  assert.match(note.content, /```holiday-dashboard/);

  // Running it again must not create a second note for the same trip.
  assert.deepEqual(await plugin.ensureArchivedTripNotes(trips), []);
});

// --- Learning across a merchant's variants -------------------------------------------

test("categorising one branch of a shop teaches the other branches", async () => {
  const { plugin, app, files } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-08.md",
    "## Finance\n- [ ] #log/spending 6\n\t- $6.00 #log/spending/food/groceries\n\t\t- Woolworths/cnr Brisbane H\n"
  );

  // A different branch. Neither descriptor contains the other, which is exactly
  // why this capture used to land uncategorised.
  await plugin.handleCapture({ amount: "20.00", merchant: "Woolworths/8 Sherwood Roa", date: "2026-08-16", source: "anz" });

  const logged = financeLines(files, "2026-08-16");
  assert.equal(logged.length, 1);
  assert.match(logged[0], /#log\/spending\/food\/groceries/, logged[0]);
});

test("a processor prefix does not stop a capture from being filed", async () => {
  const { plugin, app, files } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-15.md",
    "## Finance\n- [ ] #log/spending 11.5\n\t- $11.50 #log/spending/food/takeaway\n\t\t- Rode Fresh\n"
  );

  await plugin.handleCapture({ amount: "10.00", merchant: "SQ * Rode Fresh", date: "2026-09-12", source: "anz" });

  assert.match(financeLines(files, "2026-09-12")[0], /#log\/spending\/food\/takeaway/);
});

test("remembering a merchant stores its root, so the next descriptor matches", async () => {
  const { plugin } = makePlugin();

  await plugin.rememberMerchantCategory("SQ * Milk N Mochi Pty Ltd", "food/takeaway");

  assert.deepEqual(Object.keys(plugin.settings.merchantMap), ["milknmochi"]);
  assert.equal(await plugin.guessCategoryForMerchant("SQ * Milk N Mochi"), "food/takeaway");
  assert.equal(await plugin.guessCategoryForMerchant("Milk N Mochi Pty Ltd"), "food/takeaway");
});

test("a suggestion says where it came from", async () => {
  const { plugin, app } = makePlugin({ merchantMap: { danmurphys: "alcohol" } });
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-08.md",
    "## Finance\n- [ ] #log/spending 6\n\t- $6.00 #log/spending/food/groceries\n\t\t- Woolworths/cnr Brisbane H\n"
  );

  assert.deepEqual(await plugin.suggestCategoryForMerchant("Dan Murphy's/blunder Rd &"), {
    category: "alcohol",
    source: "rule",
  });
  // Neither branch contains the other, so only the root reaches this one.
  assert.deepEqual(await plugin.suggestCategoryForMerchant("Woolworths/8 Sherwood Roa"), {
    category: "food/groceries",
    source: "history-root",
  });
  assert.equal(plugin.describeSuggestionSource("history-root"), "how you filed it last time");
});

// --- Categorisation inbox -----------------------------------------------------------

async function inboxWithBacklog(overrides = {}) {
  const made = makePlugin(overrides);
  delete made.plugin.invalidateIndexEntry;
  // Three captures from one shop, spelled three ways, across two notes.
  await made.app.vault.create(
    "Daily/2026-08-15.md",
    "## Finance\n- [ ] #log/spending 11.5\n\t- $11.50 #log/spending/uncategorized\n\t\t- SQ * Rode Fresh\n"
  );
  await made.app.vault.create(
    "Daily/2026-09-12.md",
    [
      "## Finance",
      "- [ ] #log/spending 33.72",
      "\t- $10.00 #log/spending/uncategorized",
      "\t\t- SQ * Rode Fresh",
      "\t- $10.00 #log/spending/uncategorized",
      "\t\t- Rode Fresh",
      "\t- $13.72 #log/spending/uncategorized",
      "\t\t- Mebami",
      "",
    ].join("\n")
  );
  return made;
}

test("the inbox groups a shop's spellings into one decision", async () => {
  const { plugin } = await inboxWithBacklog();

  const groups = await plugin.buildCategorisationInbox();

  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "rodefresh");
  assert.equal(groups[0].count, 3, "three captures, one decision");
  assert.equal(groups[0].total, 31.5);
  assert.equal(groups[0].label, "Rode Fresh");
  assert.equal(groups[0].merchants.length, 2);
  assert.equal(groups[1].label, "Mebami");
});

test("filing a group categorises every entry in it and remembers the merchant", async () => {
  const { plugin, files } = await inboxWithBacklog();
  const [group] = await plugin.buildCategorisationInbox();

  const updated = await plugin.applyCategoryToEntries(group.entries, "food/takeaway", {
    remember: true,
    merchant: group.merchant,
  });

  assert.equal(updated, 3);
  assert.ok(!files.get("Daily/2026-08-15.md").content.includes("uncategorized"));
  const september = files.get("Daily/2026-09-12.md").content;
  assert.equal((september.match(/#log\/spending\/food\/takeaway/g) || []).length, 2);
  assert.ok(september.includes("#log/spending/uncategorized"), "the unrelated shop is untouched");
  // Totals are rewritten from the entries, so they cannot drift.
  assert.ok(september.includes("- [ ] #log/spending 33.72"), september);
  assert.equal(plugin.settings.merchantMap.rodefresh, "food/takeaway");

  // And the next capture from that shop files itself.
  await plugin.handleCapture({ amount: "9.00", merchant: "SQ * Rode Fresh Pty Ltd", date: "2026-09-15", source: "anz" });
  assert.match(financeLines(files, "2026-09-15")[0], /food\/takeaway/);
});

test("the inbox renders its groups, suggestions and actions", async () => {
  const { plugin, files } = await inboxWithBacklog();
  // A rule, so one group arrives with a suggestion.
  plugin.settings.merchantMap = { mebami: "food/takeaway/lunch" };
  plugin._merchantSources = null;

  const el = new StubEl();
  await plugin.renderCategorisationInboxInto(el);

  const text = el.allText();
  assert.match(text, /Categorisation inbox/);
  assert.match(text, /Rode Fresh/);
  assert.match(text, /3 entries · 2026-08-15 to 2026-09-12/);
  assert.match(text, /as written: SQ \* Rode Fresh · Rode Fresh/);
  assert.match(text, /Suggested: Food \/ Takeaway \/ Lunch — from a merchant rule/);

  // The suggested group can be filed in one click.
  await el.click("File 1 as Food / Takeaway / Lunch");
  assert.match(files.get("Daily/2026-09-12.md").content, /#log\/spending\/food\/takeaway\/lunch/);
});

test("a failed capture can be retried from the inbox", async () => {
  const { plugin, app, files } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Utility/Finance/Inbox/_failed/2026-08-27.txt",
    "<!-- finance-capture error: Could not parse a transaction from this line -->\namount=| merchant=| date= 2026-08-27| source=anz"
  );

  const el = new StubEl();
  await plugin.renderCategorisationInboxInto(el);
  assert.match(el.allText(), /Captures that failed \(1\)/);
  assert.match(el.allText(), /Could not parse a transaction/);

  // Retrying a line that still cannot parse leaves it exactly where it is.
  await el.click("Retry");
  assert.ok(files.has("Utility/Finance/Inbox/_failed/2026-08-27.txt"));
  assert.match(notices.join(" "), /Still failing/);

  // One that can parse is logged and the quarantine file goes away.
  files.get("Utility/Finance/Inbox/_failed/2026-08-27.txt").content =
    "<!-- finance-capture error: whatever -->\namount=12.50 | merchant=Coles | date=2026-08-27 | source=anz";
  const retried = new StubEl();
  await plugin.renderCategorisationInboxInto(retried);
  await retried.click("Retry");
  assert.ok(!files.has("Utility/Finance/Inbox/_failed/2026-08-27.txt"));
  assert.equal(financeLines(files, "2026-08-27").length, 1);
});

// --- Editing one entry ---------------------------------------------------------------

test("moving an entry to another day moves the bullet and fixes both totals", async () => {
  const { plugin, app, files } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-09-14.md",
    "## Finance\n- [ ] #log/spending 40.72\n\t- $27.00 #log/spending/food/takeaway\n\t\t- Riser\n\t- $13.72 #log/spending/food/snacks\n\t\t- Mebami\n"
  );
  await app.vault.create("Daily/2026-09-13.md", "## Finance\n- [ ] #log/spending 0\n");

  const entry = (await plugin.collectAllTransactions()).find((item) => item.merchant === "Riser");
  await plugin.moveTransactionEntry(entry, "2026-09-13");

  const from = files.get("Daily/2026-09-14.md").content;
  const to = files.get("Daily/2026-09-13.md").content;
  assert.ok(!from.includes("Riser"), "the bullet leaves the old note");
  assert.ok(from.includes("- [ ] #log/spending 13.72"), from);
  assert.ok(to.includes("$27.00 #log/spending/food/takeaway"), to);
  assert.ok(to.includes("\t\t- Riser"), "the merchant line travels with it");
  assert.ok(to.includes("- [ ] #log/spending 27"), to);
});

test("the edit modal files the entry, its siblings and the rule in one save", async () => {
  const { plugin, files } = await inboxWithBacklog();
  const entry = (await plugin.collectAllTransactions()).find((item) => item.merchant === "SQ * Rode Fresh" && item.date === "2026-09-12");

  const modal = plugin.openEditTransaction(entry);
  await modal.ready;

  const text = modal.contentEl.allText();
  assert.match(text, /Apply to 2 other uncategorised entries from this merchant/);
  assert.match(text, /Remember this merchant/);

  // Choose a category the way a person would, then save.
  const categoryInput = modal.contentEl.find((node) => node.tag === "input" && node.attrs["aria-label"] === "Category");
  categoryInput.value = "food/takeaway";
  await modal.contentEl.click("Save");

  assert.equal(modal.closed, true);
  const september = files.get("Daily/2026-09-12.md").content;
  assert.equal((september.match(/#log\/spending\/food\/takeaway/g) || []).length, 2, september);
  assert.match(files.get("Daily/2026-08-15.md").content, /#log\/spending\/food\/takeaway/);
  assert.equal(plugin.settings.merchantMap.rodefresh, "food/takeaway");
});

test("the remember box is unticked when a shop has been filed two ways", async () => {
  const { plugin, app } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-17.md",
    [
      "## Finance",
      "- [ ] #log/spending 10.47",
      "\t- $4.98 #log/spending/food/takeaway/lunch",
      "\t\t- Bagel Boys",
      "\t- $5.49 #log/spending/food/takeaway/breakfast",
      "\t\t- The Bagel Boys",
      "\t- $0.00 #log/spending/uncategorized",
      "\t\t- Bagel Boys",
      "",
    ].join("\n")
  );

  assert.equal(await plugin.merchantHasConflictingHistory("Bagel Boys"), true);
  assert.equal(await plugin.merchantHasConflictingHistory("Mebami"), false);

  const entry = (await plugin.collectAllTransactions()).find((item) => item.category === "uncategorized");
  const modal = plugin.openEditTransaction(entry);
  await modal.ready;
  assert.match(modal.contentEl.allText(), /you have filed it more than one way/);
});

// --- Renaming and splitting categories -------------------------------------------------

async function vaultWithTransport() {
  const made = makePlugin({ budgetsFolderPath: "Utility/Budgets", merchantMap: { translink: "transport" } });
  delete made.plugin.invalidateIndexEntry;
  await made.app.vault.create(
    "Daily/2026-05-20.md",
    [
      "## Finance",
      "- [ ] #log/spending 23.4",
      "\t- $4.80 #log/spending/transport",
      "\t\t- Translink",
      "\t- $12.60 #log/spending/transport",
      "\t\t- Uber to Home from Airport",
      "\t- $6.00 #log/spending/transport",
      "\t\t- lime",
      "",
    ].join("\n")
  );
  await made.app.vault.create(
    "Utility/Budgets/Budgets.md",
    ["| Name | Category | Limit | Period |", "| --- | --- | ---: | --- |", "| Transport | transport | 60 | week |", "| Groceries | food/groceries | 140 | week |", ""].join("\n")
  );
  return made;
}

test("a category can be split by merchant in one pass", async () => {
  const { plugin, files } = await vaultWithTransport();
  const { groups } = await plugin.buildCategoryBreakdown("transport");

  const target = (label, category) => ({
    entries: groups.find((group) => group.label.toLowerCase().includes(label)).entries,
    category,
  });
  const plan = await plugin.planCategoryAssignments([
    target("translink", "transport/public-transport"),
    target("uber", "transport/rideshare"),
    target("lime", "transport/scooter"),
  ]);

  assert.equal(plan.totals.files, 1);
  assert.equal(plan.totals.entries, 3);
  await plugin.applyNoteRewritePlan(plan);

  const content = files.get("Daily/2026-05-20.md").content;
  assert.match(content, /\$4\.80 #log\/spending\/transport\/public-transport/);
  assert.match(content, /\$12\.60 #log\/spending\/transport\/rideshare/);
  assert.match(content, /\$6\.00 #log\/spending\/transport\/scooter/);
  assert.match(content, /- \[ \] #log\/spending 23\.4/, "the total is unchanged — nothing moved in or out");
  assert.match(content, /\t\t- Uber to Home from Airport/, "merchant lines stay with their entries");
  // A split is not a rename, so the budget row is left pointing where it did.
  assert.match(files.get("Utility/Budgets/Budgets.md").content, /\| Transport \| transport \| 60 \| week \|/);
});

test("a whole rename follows into the budgets table and the merchant rules", async () => {
  const { plugin, files } = await vaultWithTransport();
  const { entries } = await plugin.buildCategoryBreakdown("transport");

  const plan = await plugin.planCategoryAssignments([{ entries, category: "travel" }], {
    tableRenames: [{ from: "transport", to: "travel" }],
  });
  await plugin.applyNoteRewritePlan(plan);
  const rules = await plugin.renameCategoryInMerchantMap([{ from: "transport", to: "travel" }]);

  assert.equal((files.get("Daily/2026-05-20.md").content.match(/#log\/spending\/travel/g) || []).length, 3);
  assert.match(files.get("Utility/Budgets/Budgets.md").content, /\| Transport \| travel \| 60 \| week \|/);
  assert.match(files.get("Utility/Budgets/Budgets.md").content, /\| Groceries \| food\/groceries \| 140 \| week \|/, "other rows untouched");
  assert.equal(rules, 1);
  assert.equal(plugin.settings.merchantMap.translink, "travel");
});

test("the rename modal lists every merchant in the category", async () => {
  const { plugin } = await vaultWithTransport();

  const modal = plugin.openRecategorise("transport");
  await modal.ready;

  const text = modal.contentEl.allText();
  assert.match(text, /Rename or split a category/);
  assert.match(text, /3 entries · \$23\.40 · 3 merchants/);
  assert.match(text, /Everything/);
  assert.match(text, /Translink/);
  assert.match(text, /Uber to Home from Airport/);
  assert.match(text, /now Transport/);
});

test("quick add previews the category the capture will actually use", async () => {
  const { plugin, app } = makePlugin();
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-15.md",
    "## Finance\n- [ ] #log/spending 11.5\n\t- $11.50 #log/spending/food/takeaway\n\t\t- Rode Fresh\n"
  );

  const modal = plugin.openQuickAdd();
  await modal.ready;
  const input = modal.contentEl.find((node) => node.tag === "input" && node.classList.has("finance-quick-add-input"));
  const preview = modal.contentEl.find((node) => node.classList.has("finance-quick-add-preview"));

  input.value = "10 rode fresh";
  await input.fire("input");
  // The suggestion is looked up asynchronously, then the preview redraws.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(preview.text, /\$10\.00/);
  assert.match(preview.text, /Food \/ Takeaway \(how you filed it last time\)/, preview.text);

  // A category typed by hand still wins.
  input.value = "10 rode fresh #food/groceries";
  await input.fire("input");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(preview.text, /Food \/ Groceries/);
  assert.doesNotMatch(preview.text, /how you filed it/);
});

// --- Recurring bills ------------------------------------------------------------------

function billSettings(extra = {}) {
  return {
    budgetsFolderPath: "Utility/Budgets",
    budgetArchiveFolderPath: "Utility/Budgets/Archive",
    defaultBudgetNoteName: "Budgets.md",
    recurringNoteName: "Recurring.md",
    recurringTagPrefix: "subscriptions",
    ...extra,
  };
}

test("the forecast counts the bills that are live, not every bill ever detected", async () => {
  const { plugin, app } = makePlugin(billSettings({ excludedRecurringItems: ["hbo-max-subscription"] }));
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-06.md",
    [
      "## Finance",
      "- [ ] #log/spending 60.98",
      "\t- $34.00 #log/spending/subscriptions/monthly/claude",
      "\t- $14.99 #log/spending/subscriptions/monthly/telstra",
      "\t- $11.99 #log/spending/subscriptions/monthly/hbo-max-subscription",
      "",
    ].join("\n")
  );
  // Telstra is paused in the registry; HBO was removed for good.
  await app.vault.create(
    "Utility/Budgets/Recurring.md",
    [
      "| Item | Cadence | Amount | Active | Auto-log |",
      "| --- | --- | ---: | --- | --- |",
      "| telstra | monthly | 14.99 | no | yes |",
      "",
    ].join("\n")
  );

  const el = new StubEl();
  await plugin.renderForecastBlock("months: 6", el, { sourcePath: "Dashboard.md" });

  const text = el.allText();
  // Only Claude is live: $34.00 a month, not $60.98.
  assert.match(text, /Recurring bills \/ month \| \$34\.00/, text);
  // And it says why the projection is thin, instead of drawing a line from zero.
  assert.match(text, /no income logged in the last 90 days/);
  assert.match(text, /no balance snapshots/);
});

test("logging a bill writes a tag that names it", async () => {
  const { plugin, app, files } = makePlugin(billSettings());
  delete plugin.invalidateIndexEntry;
  await app.vault.create(
    "Daily/2026-08-14.md",
    "## Finance\n- [ ] #log/spending 30\n\t- $30.00 #log/spending/subscriptions/weekly\n\t\t- Urban Climb Subscription\n"
  );

  const recurring = await plugin.detectRecurring("2026-09-16");
  const item = recurring.items.find((entry) => entry.name === "urban-climb-subscription");
  assert.ok(item, "the bill is detected from its child line");
  // The bare tag is what made the identity fragile in the first place.
  assert.equal(item.tag, "#log/spending/subscriptions/weekly");

  await plugin.logRecurringNow(item);

  const logged = Object.values(Object.fromEntries(files))
    .map((file) => file.content)
    .join("\n");
  assert.match(logged, /#log\/spending\/subscriptions\/weekly\/urban-climb-subscription/, "the logged payment names its bill");
});
