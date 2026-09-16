"use strict";

// main.js is the artifact Obsidian loads: one file, no bundler, committed to the
// repo and attested by the release workflow. It is *generated* from two sources:
//
//   finance-core.js   the pure logic, and the only file the unit tests import
//   src/*.js          the plugin itself, split into fragments, concatenated in
//                     file-name order
//
// This script owns that generation, the way scripts/mirror-core.js used to own
// the core IIFE on its own.
//
//   node scripts/build-main.js --check   verify main.js matches (used by npm test)
//   node scripts/build-main.js --write   regenerate main.js
//
// The core transform is unchanged: drop the leading "use strict", indent by two,
// turn `module.exports = {` into `return {`, and wrap the result in the `core`
// IIFE, which replaces the //@@CORE@@ placeholder in src/00-header.js. Fragments
// are copied verbatim, so each one is ordinary readable JavaScript and the
// generated file carries no build artefacts.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CORE_PATH = path.join(ROOT, "finance-core.js");
const SRC_DIR = path.join(ROOT, "src");
const MAIN_PATH = path.join(ROOT, "main.js");

const CORE_TOKEN = "//@@CORE@@\n";
const OPEN_MARKER = "const core = (() => {";
const CLOSE_MARKER = "})();";

function buildCoreMirror(coreSource) {
  const body = String(coreSource)
    .replace(/\r\n/g, "\n")
    .replace(/^"use strict";\n+/, "")
    .replace(/^module\.exports = \{$/m, "return {")
    .trimEnd();

  const indented = body
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n");

  return `${OPEN_MARKER}\n${indented}\n${CLOSE_MARKER}\n`;
}

function fragmentPaths() {
  if (!fs.existsSync(SRC_DIR)) throw new Error("src/ is missing — main.js is generated from it.");
  const names = fs.readdirSync(SRC_DIR).filter((name) => name.endsWith(".js")).sort();
  if (!names.length) throw new Error("src/ holds no .js fragments.");
  return names.map((name) => path.join(SRC_DIR, name));
}

function buildMain() {
  const mirror = buildCoreMirror(fs.readFileSync(CORE_PATH, "utf8"));
  let out = "";
  let placeholders = 0;
  for (const fragment of fragmentPaths()) {
    const body = fs.readFileSync(fragment, "utf8").replace(/\r\n/g, "\n");
    if (body.includes(CORE_TOKEN)) {
      placeholders += 1;
      // A function replacement, because the core source contains "\\$&" and a
      // string replacement would treat that as a backreference.
      out += body.replace(CORE_TOKEN, () => mirror);
    } else {
      out += body;
    }
  }
  if (placeholders !== 1) {
    throw new Error(`Expected exactly one ${CORE_TOKEN.trim()} placeholder in src/, found ${placeholders}.`);
  }
  return out;
}

function main() {
  const mode = process.argv[2] === "--write" ? "write" : "check";
  const expected = buildMain();
  const actual = fs.existsSync(MAIN_PATH) ? fs.readFileSync(MAIN_PATH, "utf8").replace(/\r\n/g, "\n") : "";

  if (actual === expected) {
    console.log("build-main: main.js matches finance-core.js + src/");
    return;
  }

  if (mode === "write") {
    fs.writeFileSync(MAIN_PATH, expected);
    console.log(`build-main: regenerated main.js from finance-core.js + ${fragmentPaths().length} src fragments`);
    return;
  }

  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const sample = [];
  for (let index = 0; index < Math.max(actualLines.length, expectedLines.length); index += 1) {
    if (actualLines[index] === expectedLines[index]) continue;
    sample.push(`  line ${index + 1}:\n    main.js:  ${actualLines[index] ?? "(missing)"}\n    sources:  ${expectedLines[index] ?? "(missing)"}`);
    if (sample.length >= 5) break;
  }

  console.error(
    [
      "build-main: main.js has drifted from finance-core.js + src/.",
      "",
      "First differences:",
      ...sample,
      "",
      "Edit finance-core.js or src/*.js (the sources), then run:",
      "  npm run build:main",
      "",
    ].join("\n")
  );
  process.exit(1);
}

main();
