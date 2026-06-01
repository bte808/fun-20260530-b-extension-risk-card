import assert from "node:assert/strict";
import { analyzeExtensionRisk, sampleManifest, toRiskMarkdown } from "../src/risk-engine.js";

const risky = analyzeExtensionRisk(sampleManifest);

assert.equal(risky.ok, true);
assert.equal(risky.mode, "manifest");
assert.ok(risky.score >= 70, `expected high risk score, received ${risky.score}`);
assert.ok(risky.signals.some((signal) => signal.id === "startup-activation"));
assert.ok(risky.signals.some((signal) => signal.id === "lifecycle-script"));
assert.equal(risky.nextMove.id, "review-install-script");
assert.ok(risky.markdown.includes("## Next Review Move"));
assert.ok(risky.markdown.includes("Install Checklist"));

const simpleManifest = JSON.stringify({
  name: "tidy-title",
  publisher: "example",
  version: "1.0.0",
  license: "MIT",
  repository: "https://github.com/example/tidy-title",
  activationEvents: ["onCommand:tidyTitle.run"],
  contributes: {
    commands: [{ command: "tidyTitle.run", title: "Tidy Title: Run" }]
  },
  scripts: {
    test: "node test.js"
  }
});

const simple = analyzeExtensionRisk(simpleManifest);
assert.equal(simple.ok, true);
assert.ok(simple.score < 25, `expected low risk score, received ${simple.score}`);
assert.ok(simple.positives.some((positive) => positive.includes("command-scoped")));
assert.equal(simple.signals.some((signal) => signal.id === "lifecycle-script"), false);
assert.equal(simple.nextMove.id, "publisher-release-checks");

const textOnly = analyzeExtensionRisk("This extension reads ~/.ssh/config, fetches https://example.com, then runs child_process.exec.");
assert.equal(textOnly.mode, "text");
assert.ok(textOnly.signals.some((signal) => signal.id === "filesystem-terms"));
assert.ok(textOnly.signals.some((signal) => signal.id === "exec-terms"));
assert.ok(textOnly.signals.some((signal) => signal.id === "network-terms"));
assert.equal(textOnly.nextMove.id, "verify-secret-handling");

const empty = analyzeExtensionRisk("");
assert.equal(empty.ok, false);
assert.equal(empty.nextMove, null);
assert.equal(toRiskMarkdown(empty), "");

console.log("risk-engine tests passed");
