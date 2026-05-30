const HIGH_RISK_TERMS = [
  "token",
  "password",
  "secret",
  "apikey",
  "api_key",
  "credential",
  "private key",
  ".ssh",
  "ssh key",
  "cookie",
  "session",
  "oauth"
];

const FILE_ACCESS_TERMS = [
  "workspace.fs",
  "fs.",
  "readfile",
  "writefile",
  "deletefile",
  "unlink",
  "rm -rf",
  "chmod",
  "homedir",
  "~/",
  "$home"
];

const EXEC_TERMS = [
  "child_process",
  "exec(",
  "spawn(",
  "powershell",
  "osascript",
  "shell",
  "terminal",
  "curl ",
  "wget "
];

const NETWORK_TERMS = [
  "fetch(",
  "axios",
  "node-fetch",
  "got",
  "request",
  "http://",
  "https://",
  "websocket",
  "ws://",
  "wss://"
];

const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly"
];

const SEVERE_ACTIVATION_EVENTS = ["*", "onStartupFinished"];

const BROAD_ACTIVATION_PREFIXES = [
  "workspaceContains:",
  "onFileSystem:",
  "onDebug",
  "onTerminal",
  "onAuthenticationRequest"
];

export const sampleManifest = `{
  "name": "daily-standup-helper",
  "displayName": "Daily Standup Helper",
  "publisher": "unknown-labs",
  "version": "0.4.2",
  "license": "MIT",
  "activationEvents": [
    "onStartupFinished",
    "onCommand:standup.scanWorkspace"
  ],
  "main": "./dist/extension.js",
  "extensionKind": ["workspace"],
  "repository": {
    "type": "git",
    "url": "https://github.com/example/daily-standup-helper"
  },
  "contributes": {
    "commands": [
      {
        "command": "standup.scanWorkspace",
        "title": "Standup: Scan Workspace"
      }
    ],
    "configuration": {
      "properties": {
        "standup.apiToken": {
          "type": "string",
          "description": "Token for optional sync"
        }
      }
    }
  },
  "scripts": {
    "postinstall": "node scripts/setup.js",
    "test": "node test/run.js"
  },
  "dependencies": {
    "node-fetch": "^3.3.2"
  }
}`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function flattenJson(value, path = []) {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, [...path, String(index)]));
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flattenJson(item, [...path, key]));
  }
  return [{ path: path.join("."), value: String(value) }];
}

function parseManifest(rawInput) {
  const text = String(rawInput ?? "").trim();
  if (!text) {
    return { manifest: null, text: "", error: "Paste a VS Code extension package.json or a marketplace description." };
  }

  try {
    const manifest = JSON.parse(text);
    return { manifest, text, error: "" };
  } catch (error) {
    return { manifest: null, text, error: "" };
  }
}

function readArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function addSignal(signals, id, severity, points, title, detail, evidence = "") {
  signals.push({ id, severity, points, title, detail, evidence });
}

function findTerms(haystack, terms) {
  const lower = normalizeText(haystack);
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function extractUrls(text) {
  return uniq(String(text ?? "").match(/https?:\/\/[^\s"'<>),]+/gi) ?? []).slice(0, 8);
}

function describeManifest(manifest) {
  if (!manifest) {
    return {
      name: "Text-only review",
      publisher: "Unknown",
      version: "Unknown",
      activationEvents: [],
      contributes: [],
      lifecycleScripts: [],
      extensionKind: []
    };
  }

  return {
    name: manifest.displayName || manifest.name || "Unnamed extension",
    publisher: manifest.publisher || "Unknown",
    version: manifest.version || "Unknown",
    activationEvents: readArray(manifest.activationEvents),
    contributes: Object.keys(manifest.contributes || {}),
    lifecycleScripts: Object.keys(manifest.scripts || {}).filter((script) => LIFECYCLE_SCRIPTS.includes(script)),
    extensionKind: readArray(manifest.extensionKind)
  };
}

function evaluateManifest(manifest, text) {
  const signals = [];
  const positives = [];
  const flat = manifest ? flattenJson(manifest) : [];
  const flatText = `${text}\n${flat.map((entry) => `${entry.path}: ${entry.value}`).join("\n")}`;
  const metadata = describeManifest(manifest);

  if (manifest) {
    const activationEvents = metadata.activationEvents;
    const lifecycleScripts = metadata.lifecycleScripts;
    const contributes = manifest.contributes || {};
    const configText = JSON.stringify(contributes.configuration || {});
    const dependenciesText = JSON.stringify({
      dependencies: manifest.dependencies || {},
      optionalDependencies: manifest.optionalDependencies || {}
    });

    const severeActivations = activationEvents.filter((event) => SEVERE_ACTIVATION_EVENTS.includes(event));
    if (severeActivations.length) {
      addSignal(
        signals,
        "startup-activation",
        "high",
        24,
        "Runs without a clear user action",
        "Startup or wildcard activation means the extension can wake up before you ask it to do anything.",
        severeActivations.join(", ")
      );
    }

    const broadActivations = activationEvents.filter((event) =>
      BROAD_ACTIVATION_PREFIXES.some((prefix) => event.startsWith(prefix))
    );
    if (broadActivations.length) {
      addSignal(
        signals,
        "broad-activation",
        "medium",
        12,
        "Broad activation trigger",
        "Workspace, file-system, terminal, debug, or auth triggers deserve a closer look before install.",
        broadActivations.slice(0, 4).join(", ")
      );
    }

    if (lifecycleScripts.length) {
      addSignal(
        signals,
        "lifecycle-script",
        "high",
        24,
        "Install-time script present",
        "Lifecycle scripts can run code during install or packaging. Review the script before trusting the extension.",
        lifecycleScripts.join(", ")
      );
    }

    const sensitiveConfigTerms = findTerms(configText, HIGH_RISK_TERMS);
    if (sensitiveConfigTerms.length) {
      addSignal(
        signals,
        "sensitive-settings",
        "high",
        20,
        "Sensitive setting requested",
        "Settings mentioning tokens, passwords, cookies, or private keys should have a clear reason and storage model.",
        sensitiveConfigTerms.join(", ")
      );
    }

    if (!manifest.repository) {
      addSignal(
        signals,
        "missing-repository",
        "medium",
        10,
        "No repository link",
        "Without a source repository, it is harder to inspect changes, issues, and release history."
      );
    } else {
      positives.push("Repository link is present for source review.");
    }

    if (!manifest.license) {
      addSignal(
        signals,
        "missing-license",
        "low",
        5,
        "No license field",
        "A missing license is not always dangerous, but it reduces trust and reuse clarity."
      );
    } else {
      positives.push(`License field is present: ${manifest.license}.`);
    }

    if (metadata.extensionKind.includes("workspace")) {
      addSignal(
        signals,
        "workspace-extension",
        "medium",
        10,
        "Workspace-side extension",
        "Workspace extensions can run near project files and build tools, so review their file and process access.",
        metadata.extensionKind.join(", ")
      );
    }

    const networkDeps = findTerms(dependenciesText, NETWORK_TERMS);
    if (networkDeps.length) {
      addSignal(
        signals,
        "network-dependency",
        "medium",
        10,
        "Network-capable dependency",
        "Network libraries are normal for some tools, but they should match the extension's advertised purpose.",
        networkDeps.join(", ")
      );
    }

    if (activationEvents.length && activationEvents.every((event) => event.startsWith("onCommand:"))) {
      positives.push("Activation is command-scoped, so the extension waits for a deliberate action.");
    }

    if (!lifecycleScripts.length) {
      positives.push("No install-time lifecycle script was found.");
    }

    if (metadata.contributes.includes("commands") && metadata.contributes.length <= 2) {
      positives.push("Contributions are narrow enough to review quickly.");
    }
  }

  const textChecks = [
    ["secret-terms", "high", 18, "Sensitive words in text", HIGH_RISK_TERMS],
    ["filesystem-terms", "medium", 12, "File-system access words", FILE_ACCESS_TERMS],
    ["exec-terms", "high", 20, "Shell or process execution words", EXEC_TERMS],
    ["network-terms", "medium", 10, "Network access words", NETWORK_TERMS]
  ];

  for (const [id, severity, points, title, terms] of textChecks) {
    const matched = findTerms(flatText, terms);
    if (matched.length) {
      addSignal(
        signals,
        id,
        severity,
        points,
        title,
        "The pasted manifest or notes include terms that should be checked against the extension's stated job.",
        matched.slice(0, 5).join(", ")
      );
    }
  }

  const urls = extractUrls(flatText);
  if (urls.length > 2) {
    addSignal(
      signals,
      "many-urls",
      "low",
      6,
      "Several external URLs",
      "Multiple external URLs are worth checking for docs, telemetry, update, or download behavior.",
      urls.slice(0, 4).join(", ")
    );
  }

  const score = clamp(
    signals.reduce((sum, signal) => sum + signal.points, manifest ? 6 : 12),
    0,
    100
  );

  return { signals, positives, metadata, urls, score };
}

function classify(score) {
  if (score >= 75) {
    return {
      label: "Avoid until verified",
      tone: "critical",
      summary: "Too many high-risk signals for a quick install."
    };
  }
  if (score >= 50) {
    return {
      label: "Use a sandbox first",
      tone: "high",
      summary: "Install only after source review or in a disposable profile."
    };
  }
  if (score >= 25) {
    return {
      label: "Review before install",
      tone: "watch",
      summary: "Likely manageable, but a few signals need human review."
    };
  }
  return {
    label: "Normal checks",
    tone: "low",
    summary: "No major red flags were detected from the pasted text."
  };
}

function buildChecklist(analysis) {
  const checklist = [
    "Open the repository and compare the latest release tag with the marketplace version.",
    "Scan lifecycle scripts, activation events, and sensitive settings before installing.",
    "Install in a temporary VS Code profile if the extension touches files, terminals, auth, or network."
  ];

  if (analysis.signals.some((signal) => signal.id === "sensitive-settings" || signal.id === "secret-terms")) {
    checklist.push("Do not paste real tokens or private keys until storage and telemetry behavior are clear.");
  }

  if (analysis.signals.some((signal) => signal.id === "lifecycle-script")) {
    checklist.push("Read the lifecycle script source and dependencies before running install.");
  }

  if (analysis.signals.some((signal) => signal.id === "startup-activation")) {
    checklist.push("Prefer disabling auto-start features until the extension has earned trust.");
  }

  if (analysis.signals.length === 0) {
    checklist.push("Still check publisher history and recent issue reports before trusting it with private workspaces.");
  }

  return checklist;
}

export function analyzeExtensionRisk(rawInput) {
  const parsed = parseManifest(rawInput);
  if (parsed.error) {
    return {
      ok: false,
      error: parsed.error,
      score: 0,
      level: classify(0),
      metadata: describeManifest(null),
      signals: [],
      positives: [],
      checklist: [],
      markdown: ""
    };
  }

  const evaluated = evaluateManifest(parsed.manifest, parsed.text);
  const level = classify(evaluated.score);
  const analysis = {
    ok: true,
    mode: parsed.manifest ? "manifest" : "text",
    score: evaluated.score,
    level,
    metadata: evaluated.metadata,
    signals: evaluated.signals.sort((a, b) => b.points - a.points),
    positives: uniq(evaluated.positives),
    urls: evaluated.urls,
    checklist: [],
    markdown: ""
  };

  analysis.checklist = buildChecklist(analysis);
  analysis.markdown = toRiskMarkdown(analysis);
  return analysis;
}

export function toRiskMarkdown(analysis) {
  if (!analysis?.ok) {
    return "";
  }

  const signalLines = analysis.signals.length
    ? analysis.signals.map((signal) => `- [${signal.severity}] ${signal.title}: ${signal.detail}${signal.evidence ? ` (${signal.evidence})` : ""}`)
    : ["- No major red flags were detected from the pasted text."];

  const positiveLines = analysis.positives.length
    ? analysis.positives.map((positive) => `- ${positive}`)
    : ["- No explicit trust-building signals were detected."];

  return [
    `# VS Code Extension Risk Card: ${analysis.metadata.name}`,
    "",
    `Risk score: ${analysis.score}/100`,
    `Decision: ${analysis.level.label}`,
    `Summary: ${analysis.level.summary}`,
    "",
    "## Metadata",
    `- Publisher: ${analysis.metadata.publisher}`,
    `- Version: ${analysis.metadata.version}`,
    `- Activation events: ${analysis.metadata.activationEvents.length ? analysis.metadata.activationEvents.join(", ") : "Not listed"}`,
    `- Extension kind: ${analysis.metadata.extensionKind.length ? analysis.metadata.extensionKind.join(", ") : "Not listed"}`,
    `- Contribution areas: ${analysis.metadata.contributes.length ? analysis.metadata.contributes.join(", ") : "Not listed"}`,
    "",
    "## Red Flags",
    ...signalLines,
    "",
    "## Trust Signals",
    ...positiveLines,
    "",
    "## Install Checklist",
    ...analysis.checklist.map((item) => `- [ ] ${item}`),
    "",
    "_Generated locally by Extension Risk Card._"
  ].join("\n");
}
