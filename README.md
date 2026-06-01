# Extension Risk Card

Paste a VS Code extension `package.json` or marketplace notes and get a quick local-first install risk card: risk score, red flags, trust signals, a before-install checklist, and copyable Markdown.

## Why this exists

Small productivity extensions can save real time, but installing one into a work editor is still a trust decision. Extension Risk Card turns the parts worth checking into a short, repeatable checklist before you give a tool access to projects, terminals, settings, or tokens.

## What it can do

- Parse a VS Code extension manifest when the input is valid JSON.
- Scan freeform notes when you only have a marketplace description or copied README text.
- Flag install-time scripts, broad activation events, sensitive settings, network terms, file access terms, and shell/process execution terms.
- Surface trust signals such as repository, license, command-scoped activation, and narrow contributions.
- Recommend the next review move, such as reading install-time scripts, verifying secret handling, or trying a disposable workspace.
- Generate a Markdown review card that can be copied or downloaded.
- Store the current draft locally in the browser only.

## Why it is useful

It keeps the review small enough to actually do: paste, scan, decide whether to install normally, review first, try a sandbox profile, or avoid until verified.

## Quick example

If a manifest includes `onStartupFinished` plus a `postinstall` script, the card now highlights both the risk score and the first practical next move:

```text
Next review move: Read the install-time script first.
Decision: Avoid until verified.
```

That makes the output easy to paste into a team thread before someone installs a small extension into a sensitive workspace.

## Why it is worth starring

- It is local-first and works as a plain static page.
- It turns extension trust review into a repeatable card instead of a vague gut check.
- It is intentionally small, so teams can fork it and tune the checklist for stricter install policies.

## Inspiration

- Product Hunt's productivity listings show a continuing stream of small tools meant to reduce daily friction: https://www.producthunt.com/categories/productivity
- The VS Code extension manifest reference documents the fields this tool inspects, including activation events, contributions, scripts, repository, and license: https://code.visualstudio.com/api/references/extension-manifest

This project borrows the general idea of practical tool triage, not any source code, design, or copy.

## Run locally

```bash
python3 -m http.server 5207 --bind localhost
```

Then open:

```text
http://localhost:5207
```

No account, build step, network call, or API key is required.

## Development checks

```bash
npm test
npm run check
npm run verify:browser
```

`verify:browser` expects a Chromium-compatible browser. On non-macOS machines, set `CHROME_BIN` if Chrome is not on the normal command path.
Set `VERIFY_URL=file:///absolute/path/to/index.html` when a local server is unavailable.

## Core flow

1. Paste a VS Code extension manifest or notes.
2. Click **Analyze risk**.
3. Review the score, red flags, trust signals, and checklist.
4. Follow the next review move before installing anything risky.
5. Copy or download the Markdown card for later review.

## Later ideas

- Add a side-by-side diff mode for comparing two versions of an extension manifest.
- Add a browser-extension manifest preset.
- Add custom rule weights for teams with stricter install policies.
