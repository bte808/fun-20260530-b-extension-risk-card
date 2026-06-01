import assert from "node:assert/strict";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === "string" ? new FakeText(node) : node;
      this.children.push(child);
      this.textContent += child.textContent || "";
    }
  }

  click() {
    return this.dispatch("click");
  }

  async dispatch(type) {
    for (const handler of this.listeners.get(type) || []) {
      await handler({ currentTarget: this, target: this });
    }
  }

  remove() {}

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }
}

class FakeText {
  constructor(text) {
    this.textContent = text;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement("body");
    this.nodes = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createRange() {
    return { selectNodeContents() {} };
  }

  createTextNode(text) {
    return new FakeText(text);
  }

  querySelector(selector) {
    return this.nodes.get(selector) || null;
  }
}

const document = new FakeDocument();
const ids = [
  "manifest-input",
  "load-sample",
  "clear-input",
  "analyze",
  "copy-md",
  "download-md",
  "score",
  "decision",
  "summary",
  "next-move-title",
  "next-move-detail",
  "metadata",
  "signals",
  "positives",
  "checklist",
  "markdown",
  "status"
];

for (const id of ids) {
  document.nodes.set(`#${id}`, new FakeElement(id === "manifest-input" ? "textarea" : "div"));
}

const storage = new Map();
let copiedMarkdown = "";

globalThis.document = document;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  removeItem: (key) => {
    storage.delete(key);
  },
  setItem: (key, value) => {
    storage.set(key, String(value));
  }
};
globalThis.window = {
  clearTimeout,
  getSelection: () => ({ addRange() {}, removeAllRanges() {} }),
  setTimeout
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      writeText: async (value) => {
        copiedMarkdown = value;
      }
    }
  }
});

await import(`../src/app.js?smoke=${Date.now()}`);

assert.equal(document.querySelector("#decision").textContent, "Avoid until verified");
assert.equal(document.querySelector("#next-move-title").textContent, "Read the install-time script first");
assert.equal(document.querySelector("#copy-md").disabled, false);
assert.match(document.querySelector("#markdown").textContent, /## Next Review Move/);

await document.querySelector("#clear-input").click();
assert.equal(document.querySelector("#score").textContent, "--");
assert.equal(document.querySelector("#decision").textContent, "Needs input");
assert.equal(document.querySelector("#copy-md").disabled, true);

document.querySelector("#manifest-input").value =
  "This extension reads ~/.ssh/config, fetches https://example.com, then runs child_process.exec.";
await document.querySelector("#analyze").click();
assert.equal(document.querySelector("#next-move-title").textContent, "Verify secret handling before signing in");
assert.equal(document.querySelector("#copy-md").disabled, false);

await document.querySelector("#copy-md").click();
assert.match(copiedMarkdown, /Verify secret handling before signing in/);
assert.equal(document.querySelector("#status").textContent, "Markdown copied.");

console.log("app smoke test passed");
