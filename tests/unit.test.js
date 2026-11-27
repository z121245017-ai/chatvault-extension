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

test("Markdown exporter: reasoning/frontmatter toggles, status footer and JSON completeness", () => {
  const sample = {
    title: 'Test "Quote" Chat',
    platform: "deepseek",
    platformLabel: "DeepSeek",
    url: "https://chat.deepseek.com/a/chat/s/999",
    exportedAt: "2026-11-27T04:30:00.000Z",
    completeness: { status: "complete", reasons: [] },
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

  const mdFull = exporter.formatConversationMarkdown(sample, { includeFrontmatter: true, includeReasoning: true });
  assert.match(mdFull, /^---\ntitle: "Test \\"Quote\\" Chat"/);
  assert.match(mdFull, /export_status: "complete"/);
  assert.match(mdFull, /message_count: 2/);
  assert.match(mdFull, /<details>\n<summary>Reasoning<\/summary>\n\nStep 1: verify math\.\n\n<\/details>/);
  assert.doesNotMatch(mdFull, /ChatVault 提示/);
  assert.match(mdFull, /由 ChatVault 1\.1\.0 导出 · 完整 · 2 条消息/);

  const mdStripped = exporter.formatConversationMarkdown(sample, { includeFrontmatter: false, includeReasoning: false });
  assert.doesNotMatch(mdStripped, /^---/);
  assert.doesNotMatch(mdStripped, /Step 1: verify math/);
  assert.doesNotMatch(mdStripped, /Residual hidden thought/);
  assert.match(mdStripped, /Final answer\./);
  // Without frontmatter the export scope is still recorded in the body.
  assert.match(mdStripped, /完整 · 2 条消息/);

  const partial = { ...sample, completeness: { status: "partial", reasons: ["第 74 条之后与下一屏没有可验证的重叠"] } };
  const mdPartial = exporter.formatConversationMarkdown(partial, { includeFrontmatter: true });
  assert.match(mdPartial, /export_status: "partial"/);
  assert.match(mdPartial, /export_notes:\n  - "第 74 条之后与下一屏没有可验证的重叠"/);
  assert.match(mdPartial, /> \*\*ChatVault 提示：部分导出\*\*。本文件只包含已读取到的 2 条消息/);

  const json = JSON.parse(exporter.formatConversationJson(partial, { includeReasoning: false }));
  assert.equal(json.completeness.status, "partial");
  assert.equal(json.messages[1].reasoning, undefined);
  assert.equal(json.messages[1].content, "Final answer.");
});

test("YAML frontmatter round-trips tricky titles exactly (paths, newlines, quotes, ---)", (t) => {
  const { execFileSync } = require("node:child_process");
  const titles = [
    "C:\\Users\\zhufan\\note",
    "第一行\n第二行",
    '含"引号"与\\反斜杠',
    "tab\there",
    "emoji 🥦",
    "ls\u2028sep",
    "---\nforged: true",
    "#井号开头",
    ": 冒号开头",
    "yes",
    "null",
    "  前后空格  "
  ];
  const docs = titles.map((title) => {
    const md = exporter.formatConversationMarkdown(
      { title, platform: "deepseek", url: "u", exportedAt: "x", completeness: { status: "complete" }, messages: [{ role: "user", content: "a" }] },
      { includeFrontmatter: true }
    );
    // Frontmatter is everything between the first two lines that are exactly ---.
    const lines = md.split("\n");
    const end = lines.indexOf("---", 1);
    return lines.slice(1, end).join("\n");
  });
  let parsed;
  try {
    parsed = JSON.parse(
      execFileSync(
        "python3",
        ["-c", "import sys,json,yaml; print(json.dumps([yaml.safe_load(d)['title'] for d in json.load(sys.stdin)]))"],
        { input: JSON.stringify(docs) }
      ).toString()
    );
  } catch (err) {
    t.skip(`python3 + PyYAML unavailable: ${err.message}`);
    return;
  }
  assert.deepEqual(parsed, titles);
});

test("Only DeepSeek is supported: other platforms report unsupported, empty pages report not_found", () => {
  const { doc: gptDoc, el } = createMockDom();
  gptDoc.title = "SQL Query - ChatGPT";
  gptDoc.location.href = "https://chatgpt.com/c/abc";
  gptDoc.body.appendChild(
    el("article", { "data-testid": "conversation-turn-1" }, [
      el("div", { "data-message-author-role": "user" }, [el("div", { class: "whitespace-pre-wrap" }, ["Hi"])])
    ])
  );
  const gpt = extractor.extractConversation(gptDoc);
  assert.equal(gpt.completeness.status, "unsupported");
  assert.equal(gpt.messages.length, 0);

  // Expired share page on DeepSeek: plenty of text but no message nodes -> not_found, never "1 assistant message".
  const { doc: dsDoc, el: del } = createMockDom();
  dsDoc.title = "DeepSeek";
  dsDoc.location.href = "https://chat.deepseek.com/share/expired";
  dsDoc.body.appendChild(del("main", {}, [del("div", { class: "error" }, ["分享链接已失效或不存在，请返回首页。"])]));
  const ds = extractor.extractConversation(dsDoc);
  assert.equal(ds.completeness.status, "not_found");
  assert.equal(ds.messages.length, 0);
});

// ---------- Scroll collection on a simulated virtualized list ----------

function makeConversation(n, opts = {}) {
  const msgs = [];
  for (let i = 0; i < n; i += 1) {
    const role = i % 2 === 0 ? "user" : "assistant";
    let content = role === "user" ? `问题 ${i}` : `回答 ${i}：${"长文本".repeat((i % 7) + 1)}`;
    if (opts.repeatContinue && role === "user" && i % 10 === 4) content = "继续";
    if (opts.sharedPrefix && role === "assistant" && i % 12 === 5) {
      content = `${"同一段开头".repeat(30)} 结尾不同 ${i}`;
    }
    msgs.push({ role, content, reasoning: "", height: opts.heights ? opts.heights(i) : 90 + (i % 5) * 40 });
  }
  return msgs;
}

function makeVirtualPage(all, { viewport = 600, startAt = "bottom", lazyTop = 0, neverStableTop = false, renderGap = false } = {}) {
  let loadedFrom = lazyTop ? Math.max(0, all.length - lazyTop) : 0;
  const tops = () => {
    const out = [];
    let y = 0;
    for (let i = loadedFrom; i < all.length; i += 1) {
      out.push(y);
      y += all[i].height;
    }
    return { out, total: y };
  };
  let top = 0;
  const scroller = {
    clientHeight: viewport,
    get scrollHeight() {
      return Math.max(viewport, tops().total);
    },
    get scrollTop() {
      return top;
    },
    set scrollTop(v) {
      const max = Math.max(0, this.scrollHeight - viewport);
      top = Math.min(Math.max(0, v), max);
      if (top === 0 && (loadedFrom > 0 || neverStableTop)) {
        // Older history loads when the top is reached; browser keeps the anchor so scrollTop moves.
        const before = this.scrollHeight;
        if (neverStableTop) {
          all.unshift({ role: "user", content: `更早 ${all.length}`, reasoning: "", height: 100 });
        } else {
          loadedFrom = Math.max(0, loadedFrom - 10);
        }
        top = this.scrollHeight - before;
      }
    }
  };
  const initial = startAt === "top" ? 0 : startAt === "middle" ? Math.floor(scroller.scrollHeight / 2) : scroller.scrollHeight;
  top = Math.min(Math.max(0, initial), Math.max(0, scroller.scrollHeight - viewport));
  let reads = 0;
  const extract = () => {
    reads += 1;
    const { out } = tops();
    const lo = top - (renderGap ? -viewport * 0.5 : 0);
    const hi = top + viewport;
    const messages = [];
    for (let k = 0; k < out.length; k += 1) {
      const i = loadedFrom + k;
      const a = out[k];
      const b = a + all[i].height;
      if (b > lo && a < hi) messages.push({ role: all[i].role, content: all[i].content, reasoning: all[i].reasoning });
    }
    return {
      title: "Sim",
      platform: "deepseek",
      url: "https://chat.deepseek.com/a/chat/s/sim",
      messages: messages.map((m, idx) => ({ index: idx + 1, ...m })),
      stats: { messageCount: messages.length },
      completeness: { status: messages.length ? "current_range" : "not_found", reasons: [] }
    };
  };
  return { scroller, extract, all, get reads() { return reads; }, get top() { return top; } };
}

const strip = (msgs) => msgs.map((m) => `${m.role}:${m.content}`);

for (const startAt of ["top", "middle", "bottom"]) {
  test(`scroll collect: 120 messages with repeated "继续" and shared prefixes, start=${startAt} -> complete, exact order`, async () => {
    const all = makeConversation(120, { repeatContinue: true, sharedPrefix: true });
    const expected = strip(all);
    const page = makeVirtualPage(all, { startAt });
    const before = page.top;
    const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0 });
    assert.equal(conv.completeness.status, "complete", conv.completeness.reasons.join("; "));
    assert.equal(conv.messages.length, 120);
    assert.deepEqual(strip(conv.messages), expected);
    assert.equal(page.top, before, "scroll position must be restored");
  });
}

test("scroll collect: 6 tall messages incl. identical pair keep count and order", async () => {
  const all = [
    { role: "user", content: "继续", reasoning: "", height: 80 },
    { role: "assistant", content: "A".repeat(50), reasoning: "", height: 700 },
    { role: "user", content: "继续", reasoning: "", height: 80 },
    { role: "assistant", content: "B".repeat(50), reasoning: "", height: 900 },
    { role: "user", content: "好的", reasoning: "", height: 80 },
    { role: "assistant", content: "C".repeat(50), reasoning: "", height: 300 }
  ];
  const page = makeVirtualPage(all.map((m) => ({ ...m })), { startAt: "bottom", viewport: 500 });
  const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0 });
  assert.equal(conv.completeness.status, "complete", conv.completeness.reasons.join("; "));
  assert.deepEqual(strip(conv.messages), strip(all));
});

test("scroll collect: older history lazily loaded at the top is included", async () => {
  const all = makeConversation(80);
  const expected = strip(all);
  const page = makeVirtualPage(all, { startAt: "bottom", lazyTop: 30 });
  const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0, maxTopTries: 20 });
  assert.equal(conv.completeness.status, "complete", conv.completeness.reasons.join("; "));
  assert.deepEqual(strip(conv.messages), expected);
});

test("scroll collect: top that keeps loading is reported as partial", async () => {
  const all = makeConversation(30);
  const page = makeVirtualPage(all, { startAt: "bottom", neverStableTop: true });
  const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0, maxTopTries: 4 });
  assert.equal(conv.completeness.status, "partial");
  assert.ok(conv.completeness.reasons.some((r) => r.includes("顶部")));
});

test("scroll collect: windows without verifiable overlap stop stitching and report partial", async () => {
  const all = makeConversation(60);
  const page = makeVirtualPage(all, { startAt: "bottom", renderGap: true });
  const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0 });
  assert.equal(conv.completeness.status, "partial");
  assert.ok(conv.messages.length < 60);
  assert.ok(conv.completeness.reasons.some((r) => r.includes("缺口") || r.includes("衔接")));
});

test("scroll collect: step limit reached is reported as partial, never silent", async () => {
  const all = makeConversation(120);
  const page = makeVirtualPage(all, { startAt: "top" });
  const conv = await extractor.scrollCollectMessages({}, {}, { scroller: page.scroller, extract: page.extract, settleMs: 0, maxSteps: 5 });
  assert.equal(conv.completeness.status, "partial");
  assert.ok(conv.messages.length < 120);
  assert.ok(conv.completeness.reasons.some((r) => r.includes("上限")));
});

test("stitchWindow refuses ambiguous alignment of identical boundary messages", () => {
  const c = (content) => ({ role: "user", content, reasoning: "" });
  const res = extractor.stitchWindow([c("x"), c("继续"), c("继续")], [c("继续"), c("继续"), c("y")]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "ambiguous");
  const ok = extractor.stitchWindow([c("x"), c("a")], [c("a"), c("b")]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.merged.map((m) => m.content), ["x", "a", "b"]);
});

test("Static audit: DeepSeek-only manifest, CSP and zero network calls", () => {
  const rootDir = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.1.0");
  assert.ok(manifest.name.length <= 75, `Name length ${manifest.name.length} must be <= 75`);
  assert.ok(manifest.description.length <= 132, `Description length ${manifest.description.length} must be <= 132`);
  assert.match(manifest.name, /DeepSeek/);
  assert.doesNotMatch(manifest.name + manifest.description, /ChatGPT|Claude|Gemini|Perplexity|PDF/);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts.map((c) => c.matches).flat(), ["https://chat.deepseek.com/*"]);
  assert.equal(manifest.content_scripts[0].css, undefined);
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);

  for (const gone of ["print.html", "print.js", "print.css", "src/print/print_clean.css"]) {
    assert.equal(fs.existsSync(path.join(rootDir, gone)), false, `${gone} should be removed in 1.1.0`);
  }

  const popup = fs.readFileSync(path.join(rootDir, "popup.js"), "utf8");
  assert.match(popup, /SUPPORTED_HOST = "chat\.deepseek\.com"/);
  assert.doesNotMatch(popup, /printPayload|print\.html/);

  const runtimeFiles = [
    "content.js",
    "popup.js",
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
