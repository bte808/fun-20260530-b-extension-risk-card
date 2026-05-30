import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const targetUrl = "http://localhost:5207/";
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium",
  "chrome"
].filter(Boolean);

if (typeof WebSocket === "undefined") {
  throw new Error("This browser verification script needs a Node.js runtime with global WebSocket.");
}

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findChromePath() {
  for (const candidate of chromeCandidates) {
    if (candidate.includes("/")) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    const lookup = spawnSync("which", [candidate], { encoding: "utf8" });
    if (lookup.status === 0 && lookup.stdout.trim()) {
      return lookup.stdout.trim();
    }
  }

  throw new Error("Chrome was not found. Set CHROME_BIN to a Chromium-compatible browser executable.");
}

async function waitForDevToolsPort(userDataDir) {
  const portFile = join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 8000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const content = await readFile(portFile, "utf8");
      const [port] = content.trim().split(/\s+/);
      if (port) {
        return port;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }

  throw new Error(`Chrome did not expose a DevTools port: ${lastError?.message || "timeout"}`);
}

async function openCdp(port) {
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = pages.find((entry) => entry.type === "page");
  assert.ok(page, "Chrome should expose a page target");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
      return;
    }
    if (message.method) {
      events.push(message);
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function close() {
    socket.close();
  }

  return { send, events, close };
}

async function verifyViewport({ width, height, label }) {
  const userDataDir = await mkdtemp(join(tmpdir(), "extension-risk-card-"));
  const chromePath = await findChromePath();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "about:blank"
  ], {
    stdio: "ignore"
  });

  let cdp;
  try {
    const port = await waitForDevToolsPort(userDataDir);
    cdp = await openCdp(port);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });

    const loadPromise = new Promise((resolve) => {
      const check = setInterval(() => {
        if (cdp.events.some((event) => event.method === "Page.loadEventFired")) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
    await cdp.send("Page.navigate", { url: targetUrl });
    await loadPromise;

    const result = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const clear = document.querySelector('#clear-input');
        const sample = document.querySelector('#load-sample');
        const copy = document.querySelector('#copy-md');
        clear.click();
        await sleep(120);
        const cleared = {
          score: document.querySelector('#score').textContent,
          decision: document.querySelector('#decision').textContent
        };
        sample.click();
        await sleep(120);
        copy.click();
        await sleep(120);
        return {
          title: document.title,
          score: document.querySelector('#score').textContent,
          decision: document.querySelector('#decision').textContent,
          status: document.querySelector('#status').textContent,
          markdownHasChecklist: document.querySelector('#markdown').textContent.includes('Install Checklist'),
          hasRiskSignal: document.body.textContent.includes('Install-time script present'),
          cleared,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          viewportHeight: window.innerHeight,
          workspaceColumns: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,
          topbarDirection: getComputedStyle(document.querySelector('.topbar')).flexDirection,
          buttonsVisible: [...document.querySelectorAll('button')].every((button) => {
            const box = button.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          })
        };
      })()`
    });

    const value = result.result.value;
    const errors = cdp.events
      .filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded")
      .map((event) => event.params);

    assert.equal(value.title, "Extension Risk Card", `${label}: page title`);
    assert.equal(value.cleared.score, "--", `${label}: clear button should reset score`);
    assert.equal(value.decision, "Avoid until verified", `${label}: sample should produce a clear decision`);
    assert.equal(value.markdownHasChecklist, true, `${label}: markdown should include checklist`);
    assert.equal(value.hasRiskSignal, true, `${label}: sample should show risk signal`);
    assert.equal(value.buttonsVisible, true, `${label}: buttons should be visible`);
    assert.equal(value.scrollWidth <= value.clientWidth + 1, true, `${label}: no horizontal overflow`);
    assert.equal(errors.length, 0, `${label}: no runtime errors`);

    return { label, ...value };
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await rm(userDataDir, { force: true, recursive: true });
  }
}

const results = [];
results.push(await verifyViewport({ width: 1280, height: 720, label: "desktop" }));
results.push(await verifyViewport({ width: 390, height: 844, label: "mobile" }));

console.log(JSON.stringify(results, null, 2));
