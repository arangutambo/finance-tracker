"use strict";

// finance-core.js is the single source of truth for the plugin's pure logic and
// the only file the unit tests import. Obsidian loads main.js directly (no
// bundler), so that same logic also has to exist inside main.js as the `core`
// IIFE. This script owns that copy: it derives the IIFE from finance-core.js by
// a deterministic transform, so the two can never drift by hand again.
//
//   node scripts/mirror-core.js --check   verify main.js matches (used by npm test)
//   node scripts/mirror-core.js --write   regenerate the IIFE inside main.js
//
// The transform is: drop the leading "use strict", indent everything by two,
// turn `module.exports = {` into `return {`, and wrap the result in the IIFE.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CORE_PATH = path.join(ROOT, "finance-core.js");
const MAIN_PATH = path.join(ROOT, "main.js");

const OPEN_MARKER = "const core = (() => {";
const CLOSE_MARKER = "})();";

function buildMirror(coreSource) {
  const body = String(coreSource)
    .replace(/\r\n/g, "\n")
    .replace(/^"use strict";\n+/, "")
    .replace(/^module\.exports = \{$/m, "return {")
    .trimEnd();

  const indented = body
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n");

  return `${OPEN_MARKER}\n${indented}\n${CLOSE_MARKER}`;
}

function locateMirror(mainSource) {
  const start = mainSource.indexOf(OPEN_MARKER);
  if (start === -1) throw new Error(`Could not find "${OPEN_MARKER}" in main.js`);
  // The IIFE is the only construct closed by a `})();` at column 0.
  const closeIndex = mainSource.indexOf(`\n${CLOSE_MARKER}\n`, start);
  if (closeIndex === -1) throw new Error(`Could not find the closing "${CLOSE_MARKER}" in main.js`);
  return { start, end: closeIndex + 1 + CLOSE_MARKER.length };
}

function main() {
  const mode = process.argv[2] === "--write" ? "write" : "check";
  const coreSource = fs.readFileSync(CORE_PATH, "utf8");
  const mainSource = fs.readFileSync(MAIN_PATH, "utf8").replace(/\r\n/g, "\n");
  const expected = buildMirror(coreSource);
  const { start, end } = locateMirror(mainSource);
  const actual = mainSource.slice(start, end);

  if (actual === expected) {
    console.log("mirror-core: main.js core IIFE matches finance-core.js");
    return;
  }

  if (mode === "write") {
    fs.writeFileSync(MAIN_PATH, mainSource.slice(0, start) + expected + mainSource.slice(end));
    console.log("mirror-core: regenerated the core IIFE in main.js from finance-core.js");
    return;
  }

  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const sample = [];
  for (let index = 0; index < Math.max(actualLines.length, expectedLines.length); index += 1) {
    if (actualLines[index] === expectedLines[index]) continue;
    sample.push(`  line ${index + 1}:\n    main.js:         ${actualLines[index] ?? "(missing)"}\n    finance-core.js: ${expectedLines[index] ?? "(missing)"}`);
    if (sample.length >= 5) break;
  }

  console.error(
    [
      "mirror-core: main.js's core IIFE has drifted from finance-core.js.",
      "",
      "First differences:",
      ...sample,
      "",
      "Edit finance-core.js (the source of truth), then run:",
      "  npm run mirror",
      "",
    ].join("\n")
  );
  process.exit(1);
}

main();
