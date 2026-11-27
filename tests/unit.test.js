"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extractor = require("../src/extractor/chat_extractor.js");
const exporter = require("../src/formatter/markdown_exporter.js");

// Lightweight zero-dependency DOM shim for unit testing DOM traversal
function createMockDom(htmlAttrs = {}) {
  class MockNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.childNodes = [];
      this.parentElement = null;
    }
    appendChild(child) {
      child.parentElement = this;
      this.childNodes.push(child);
      return child;
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join("");
    }
  }

  class MockText extends MockNode {
    constructor(value) {
      super(3);
      this.nodeValue = value;
    }
    get textContent() {
      return this.nodeValue;
    }
  }

  class MockElement extends MockNode {
    constructor(tagName, attrs = {}, children = []) {
      super(1);
      this.tagName = tagName.toUpperCase();
      this.attrs = { ...attrs };
      this.className = attrs.class || "";
      this.classList = {
        contains: (token) => this.className.split(/\s+/).filter(Boolean).includes(token)
      };
      for (const ch of children) {
        if (typeof ch === "string") this.appendChild(new MockText(ch));
        else if (ch) this.appendChild(ch);
      }
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    getAttribute(name) {
      if (name === "class") return this.className;
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
    contains(other) {
      if (other === this) return true;
      for (const c of this.childNodes) {
        if (c === other) return true;
        if (c.nodeType === 1 && c.contains(other)) return true;
      }
      return false;
    }
    closest(selector) {
      const selectors = selector.split(",").map((s) => s.trim()).filter(Boolean);
      let cur = this;
      while (cur) {
        if (selectors.some((sel) => matchesSimpleSelector(cur, sel))) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((s) => s.trim()).filter(Boolean);
      const out = [];
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 1) {
            if (selectors.some((sel) => matchesSimpleSelector(child, sel))) {
              out.push(child);
            }
            walk(child);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  function matchesSimpleSelector(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    // Handle descendant "a b" very simply if needed
    const parts = sel.trim().split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (!matchesAtom(el, last)) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (cur && !matchesAtom(cur, parts[i])) cur = cur.parentElement;
        if (!cur) return false;
        cur = cur.parentElement;
      }
      return true;
    }
    return matchesAtom(el, sel);
  }

  function matchesAtom(el, atom) {
    let rest = atom;
    // Handle :first-child etc by ignoring pseudo
    rest = rest.replace(/:[a-zA-Z-]+/g, "");
    const tagMatch = rest.match(/^([a-zA-Z0-9_-]+)/);
    if (tagMatch && !rest.startsWith(".") && !rest.startsWith("[")) {
      if (el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      rest = rest.slice(tagMatch[1].length);
    }
    const classMatches = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
    for (const m of classMatches) {
      if (!el.classList.contains(m[1])) return false;
    }
    const attrMatches = [...rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:(\^|\*|\$)?=["']?([^"'\]]+)["']?)?\]/g)];
    for (const m of attrMatches) {
      const val = el.getAttribute(m[1]);
      if (val === null) return false;
      if (m[3] !== undefined) {
        if (m[2] === "^" && !val.startsWith(m[3])) return false;
        else if (m[2] === "*" && !val.includes(m[3])) return false;
        else if (m[2] === "$" && !val.endsWith(m[3])) return false;
        else if (!m[2] && val !== m[3]) return false;
      }
    }
    return true;
  }

  const el = (tag, attrs, children) => new MockElement(tag, attrs, children);
  const body = el("body", {}, []);
  const documentElement = el("html", htmlAttrs, [body]);
  const doc = {
    title: "Test Chat",
    location: { href: "https://example.com/chat" },
    documentElement,
    body,
    querySelectorAll: (s) => documentElement.querySelectorAll(s),
    querySelector: (s) => documentElement.querySelector(s)
  };
  return { doc, el };
}

test("DeepSeek adapter extracts <think> reasoning, KaTeX <annotation>, and python code fence", () => {
  const { doc, el } = createMockDom();
  doc.title = "Softmax Notes - DeepSeek";
  doc.location.href = "https://chat.deepseek.com/a/chat/s/123";

  const userTurn = el("div", { class: "ds-message", "data-ds-role": "user" }, [
    el("div", { class: "fbb737a4" }, ["Explain Softmax stability"])
  ]);

  const inlineMath = el("span", { class: "katex" }, [
    el("span", { class: "katex-mathml" }, [
      el("math", {}, [el("semantics", {}, [el("annotation", { encoding: "application/x-tex" }, ["e^{z_i}"])])])
    ]),
    el("span", { class: "katex-html", "aria-hidden": "true" }, ["e z i gibberish"])
  ]);

  const displayMath = el("span", { class: "katex-display" }, [
    el("span", { class: "katex" }, [
      el("span", { class: "katex-mathml" }, [
        el("math", {}, [
          el("semantics", {}, [
            el("annotation", { encoding: "application/x-tex" }, ["\\sigma(z)_i = \\frac{e^{z_i - m}}{\\sum_j e^{z_j - m}}"])
          ])
        ])
      ]),
      el("span", { class: "katex-html" }, ["broken visual glyphs"])
    ])
  ]);

  const codeWrap = el("div", { class: "md-code-block" }, [
    el("div", { class: "code-header" }, [el("span", {}, ["python"]), el("button", {}, ["Copy"])]),
    el("pre", {}, [el("code", { class: "language-python" }, ["def softmax(x):\n    return x\n"])])
  ]);

  const assistantTurn = el("div", { class: "ds-message", "data-ds-role": "assistant" }, [
    el("div", { class: "ds-think-content" }, [
      el("p", {}, ["Need max subtraction trick first."])
    ]),
    el("div", { class: "ds-markdown" }, [
      el("p", {}, ["To stabilize ", inlineMath, ", subtract the max:"]),
      displayMath,
      codeWrap
    ])
  ]);

  doc.body.appendChild(userTurn);
  doc.body.appendChild(assistantTurn);

  const conv = extractor.extractConversation(doc);
  assert.equal(conv.platform, "deepseek");
  assert.equal(conv.title, "Softmax Notes");
  assert.equal(conv.messages.length, 2);
  assert.equal(conv.messages[0].role, "user");
  assert.equal(conv.messages[1].reasoning, "Need max subtraction trick first.");
  assert.match(conv.messages[1].content, /\$e\^\{z_i\}\$/);
  assert.match(conv.messages[1].content, /\$\$\n\\sigma\(z\)_i = \\frac\{e\^\{z_i - m\}\}\{\\sum_j e\^\{z_j - m\}\}\n\$\$/);
  assert.doesNotMatch(conv.messages[1].content, /gibberish|broken visual glyphs/);
  assert.match(conv.messages[1].content, /```python\ndef softmax\(x\):\n    return x\n```/);
});

test("Markdown exporter handles Reasoning toggle ON/OFF and YAML Frontmatter toggle ON/OFF", () => {
  const sample = {
    title: 'Test "Quote" Chat',
    platform: "deepseek",
    platformLabel: "DeepSeek",
    url: "https://chat.deepseek.com/a/chat/s/999",
    exportedAt: "2026-11-27T04:30:00.000Z",
    messages: [
      { index: 1, role: "user", content: "Hi", reasoning: "" },
      {
        index: 2,
        role: "assistant",
        reasoning: "Step 1: verify math.",
        content: "Final answer.\n<think>Residual hidden thought</think>"
      }
    ]
  };

  const mdFull = exporter.formatConversationMarkdown(sample, {
    includeFrontmatter: true,
    includeReasoning: true
  });
  assert.match(mdFull, /^---\ntitle: "Test \\"Quote\\" Chat"/);
  assert.match(mdFull, /<details>\n<summary>Reasoning<\/summary>\n\nStep 1: verify math\.\n\n<\/details>/);

  const mdStripped = exporter.formatConversationMarkdown(sample, {
    includeFrontmatter: false,
    includeReasoning: false
  });
  assert.doesNotMatch(mdStripped, /^---/);
  assert.doesNotMatch(mdStripped, /Step 1: verify math/);
  assert.doesNotMatch(mdStripped, /Residual hidden thought/);
  assert.match(mdStripped, /Final answer\./);

  const jsonStripped = JSON.parse(exporter.formatConversationJson(sample, { includeReasoning: false }));
  assert.equal(jsonStripped.messages[1].reasoning, undefined);
  assert.equal(jsonStripped.messages[1].content, "Final answer.");
});

test("ChatGPT and Claude adapters extract code fences, tables, and thinking blocks cleanly", () => {
  const { doc: gptDoc, el } = createMockDom();
  gptDoc.title = "SQL Query - ChatGPT";
  gptDoc.location.href = "https://chatgpt.com/c/abc";
  gptDoc.body.appendChild(
    el("article", { "data-testid": "conversation-turn-1" }, [
      el("div", { "data-message-author-role": "user" }, [
        el("div", { class: "whitespace-pre-wrap" }, ["Give me a summary table."])
      ])
    ])
  );
  gptDoc.body.appendChild(
    el("article", { "data-testid": "conversation-turn-2" }, [
      el("details", { "data-testid": "thought-panel" }, [
        el("summary", {}, ["Thought for 4s"]),
        el("p", {}, ["Checking schema columns."])
      ]),
      el("div", { "data-message-author-role": "assistant" }, [
        el("div", { class: "markdown" }, [
          el("table", {}, [
            el("tr", {}, [el("th", {}, ["Col"]), el("th", {}, ["Type"])]),
            el("tr", {}, [el("td", {}, ["id"]), el("td", {}, ["int"])])
          ]),
          el("pre", {}, [el("code", { class: "language-sql" }, ["SELECT id FROM users;"])])
        ])
      ])
    ])
  );

  const gptConv = extractor.extractConversation(gptDoc);
  assert.equal(gptConv.platform, "chatgpt");
  assert.equal(gptConv.title, "SQL Query");
  assert.equal(gptConv.messages[1].reasoning, "Checking schema columns.");
  assert.match(gptConv.messages[1].content, /\| Col \| Type \|\n\| --- \| --- \|\n\| id \| int \|/);
  assert.match(gptConv.messages[1].content, /```sql\nSELECT id FROM users;\n```/);

  const { doc: claudeDoc, el: cel } = createMockDom();
  claudeDoc.title = "TS Types - Claude";
  claudeDoc.location.href = "https://claude.ai/chat/xyz";
  claudeDoc.body.appendChild(cel("div", { "data-testid": "user-message" }, ["Show interface"]));
  claudeDoc.body.appendChild(
    cel("div", { "data-testid": "assistant-message" }, [
      cel("div", { "data-testid": "thinking-block" }, ["Thinking about generics"]),
      cel("pre", { "data-language": "ts" }, [cel("code", {}, ["export interface Item { id: string; }"])])
    ])
  );
  const claudeConv = extractor.extractConversation(claudeDoc);
  assert.equal(claudeConv.platform, "claude");
  assert.equal(claudeConv.messages[1].reasoning, "Thinking about generics");
  assert.match(claudeConv.messages[1].content, /```ts\nexport interface Item \{ id: string; \}\n```/);
});

test("Static zero-network audit & Manifest V3 CSP check", () => {
  const rootDir = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name.length <= 75, `Name length ${manifest.name.length} must be <= 75`);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  assert.match(manifest.content_security_policy.extension_pages, /object-src 'self'/);

  const runtimeFiles = [
    "content.js",
    "popup.js",
    "print.js",
    "src/extractor/chat_extractor.js",
    "src/formatter/markdown_exporter.js",
    "src/samples/builtin_sample.js"
  ];
  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bnavigator\.sendBeacon\b/,
    /\beval\s*\(/,
    /\bnew Function\b/
  ];

  for (const rel of runtimeFiles) {
    const code = fs.readFileSync(path.join(rootDir, rel), "utf8");
    for (const pat of forbiddenPatterns) {
      assert.doesNotMatch(code, pat, `${rel} matched forbidden pattern ${pat}`);
    }
  }
});
