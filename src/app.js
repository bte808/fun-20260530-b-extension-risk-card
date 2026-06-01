import { analyzeExtensionRisk, sampleManifest } from "./risk-engine.js";

const draftKey = "extension-risk-card:draft:v1";

const nodes = {
  input: document.querySelector("#manifest-input"),
  sampleButton: document.querySelector("#load-sample"),
  clearButton: document.querySelector("#clear-input"),
  analyzeButton: document.querySelector("#analyze"),
  copyButton: document.querySelector("#copy-md"),
  downloadButton: document.querySelector("#download-md"),
  score: document.querySelector("#score"),
  decision: document.querySelector("#decision"),
  summary: document.querySelector("#summary"),
  nextMoveTitle: document.querySelector("#next-move-title"),
  nextMoveDetail: document.querySelector("#next-move-detail"),
  metadata: document.querySelector("#metadata"),
  signals: document.querySelector("#signals"),
  positives: document.querySelector("#positives"),
  checklist: document.querySelector("#checklist"),
  markdown: document.querySelector("#markdown"),
  status: document.querySelector("#status")
};

let currentAnalysis = null;

function setStatus(message) {
  nodes.status.textContent = message;
}

function renderList(container, items, renderItem) {
  container.replaceChildren();
  for (const item of items) {
    const element = document.createElement("li");
    element.append(renderItem(item));
    container.append(element);
  }
}

function textNode(value) {
  return document.createTextNode(value);
}

function renderAnalysis(analysis) {
  currentAnalysis = analysis;

  if (!analysis.ok) {
    nodes.score.textContent = "--";
    nodes.decision.textContent = "Needs input";
    nodes.summary.textContent = analysis.error;
    nodes.nextMoveTitle.textContent = "Start with a manifest";
    nodes.nextMoveDetail.textContent = "Paste package.json or marketplace notes to get the first review step.";
    nodes.metadata.replaceChildren();
    nodes.signals.replaceChildren();
    nodes.positives.replaceChildren();
    nodes.checklist.replaceChildren();
    nodes.markdown.textContent = "";
    nodes.copyButton.disabled = true;
    nodes.downloadButton.disabled = true;
    document.body.dataset.tone = "empty";
    return;
  }

  document.body.dataset.tone = analysis.level.tone;
  nodes.score.textContent = String(analysis.score);
  nodes.decision.textContent = analysis.level.label;
  nodes.summary.textContent = analysis.level.summary;
  nodes.nextMoveTitle.textContent = analysis.nextMove.title;
  nodes.nextMoveDetail.textContent = analysis.nextMove.detail;
  nodes.copyButton.disabled = false;
  nodes.downloadButton.disabled = false;

  const metaRows = [
    ["Name", analysis.metadata.name],
    ["Publisher", analysis.metadata.publisher],
    ["Version", analysis.metadata.version],
    ["Mode", analysis.mode === "manifest" ? "Parsed package.json" : "Text scan"],
    ["Activation", analysis.metadata.activationEvents.length ? analysis.metadata.activationEvents.join(", ") : "Not listed"],
    ["Contributes", analysis.metadata.contributes.length ? analysis.metadata.contributes.join(", ") : "Not listed"]
  ];

  nodes.metadata.replaceChildren();
  for (const [label, value] of metaRows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    nodes.metadata.append(dt, dd);
  }

  renderList(nodes.signals, analysis.signals.length ? analysis.signals : [{ severity: "low", title: "No major red flags", detail: "The pasted text still needs normal publisher and release checks.", evidence: "" }], (signal) => {
    const wrapper = document.createElement("div");
    wrapper.className = `signal signal-${signal.severity}`;
    const title = document.createElement("strong");
    title.textContent = signal.title;
    const detail = document.createElement("span");
    detail.textContent = signal.evidence ? `${signal.detail} Evidence: ${signal.evidence}` : signal.detail;
    wrapper.append(title, detail);
    return wrapper;
  });

  renderList(nodes.positives, analysis.positives.length ? analysis.positives : ["No explicit trust-building signals were detected."], (item) => textNode(item));
  renderList(nodes.checklist, analysis.checklist, (item) => textNode(item));
  nodes.markdown.textContent = analysis.markdown;
}

function analyze() {
  const analysis = analyzeExtensionRisk(nodes.input.value);
  renderAnalysis(analysis);
  if (analysis.ok) {
    localStorage.setItem(draftKey, nodes.input.value);
    setStatus(`Risk card updated: ${analysis.level.label}.`);
  } else {
    setStatus("Paste a manifest or notes to begin.");
  }
}

async function copyMarkdown() {
  if (!currentAnalysis?.markdown) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentAnalysis.markdown);
    setStatus("Markdown copied.");
  } catch (error) {
    const range = document.createRange();
    range.selectNodeContents(nodes.markdown);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setStatus("Clipboard blocked; Markdown selected for copying.");
  }
}

function downloadMarkdown() {
  if (!currentAnalysis?.markdown) {
    return;
  }

  const slug = currentAnalysis.metadata.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "extension-risk-card";
  const blob = new Blob([currentAnalysis.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}-risk-card.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Markdown downloaded.");
}

function loadSample() {
  nodes.input.value = sampleManifest;
  analyze();
}

function clearInput() {
  nodes.input.value = "";
  localStorage.removeItem(draftKey);
  analyze();
}

nodes.sampleButton.addEventListener("click", loadSample);
nodes.clearButton.addEventListener("click", clearInput);
nodes.analyzeButton.addEventListener("click", analyze);
nodes.copyButton.addEventListener("click", copyMarkdown);
nodes.downloadButton.addEventListener("click", downloadMarkdown);
nodes.input.addEventListener("input", () => {
  window.clearTimeout(nodes.input.updateTimer);
  nodes.input.updateTimer = window.setTimeout(analyze, 250);
});

nodes.input.value = localStorage.getItem(draftKey) || sampleManifest;
analyze();
