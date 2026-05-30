import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "src/app.js",
  "src/risk-engine.js",
  "README.md",
  "LICENSE"
];

for (const file of requiredFiles) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.ok(content.trim().length > 0, `${file} should not be empty`);
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /<textarea[\s\S]+id="manifest-input"/);
assert.match(html, /src\/app\.js/);
assert.match(html, /viewport/);

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
assert.match(css, /@media \(max-width: 860px\)/);
assert.match(css, /@media \(max-width: 620px\)/);

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(app, /navigator\.clipboard\.writeText/);
assert.match(app, /downloadMarkdown/);

console.log("static check passed");
