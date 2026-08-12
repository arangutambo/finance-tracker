"use strict";

// Functional tests that load main.js itself against a stub vault, rather than
// only exercising finance-core.js. The capture wiring is exactly the kind of
// change that has silently no-opped before — a core function landing without
// its plugin-side caller — and only actually running the plugin catches it.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

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

let requestUrlHandler = async () => ({ status: 404, json: null, text: "" });

const obsidianStub = {
  ItemView: class {},
  Modal: class {
    constructor(app) {
      this.app = app;
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
    files.set(p, new StubTFile(p, body));
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
