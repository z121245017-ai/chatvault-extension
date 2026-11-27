// Real Chromium end-to-end check for ChatVault 1.1.0 (DeepSeek only).
// Run: NODE_PATH=<dir containing playwright> node tests/e2e.spec.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
const ZIP_PATH = path.join(ROOT, "dist", `chatvault-extension-v${VERSION}.zip`);

const BASIC = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>DeepSeek Softmax Test - DeepSeek</title></head><body>
<div class="ds-message" data-ds-role="user"><div class="fbb737a4">请推导数值稳定 Softmax 并给出 Python 函数</div></div>
<div class="ds-message" data-ds-role="assistant">
  <div class="ds-think-content"><p>首先解释减去最大值 m 的数学意义。</p></div>
  <div class="ds-markdown">
    <p>令 <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">m = \\max_j z_j</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">m=max z</span></span>：</p>
    <div class="code-box"><div class="code-header"><span>python</span><button>复制代码</button></div><pre><code class="language-python">def stable_softmax(logits):
    return logits</code></pre></div>
  </div>
</div></body></html>`;

const EXPIRED = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>DeepSeek</title></head><body><main><div class="error">分享链接已失效或不存在，请返回首页。</div><p>这里有很多文字但没有任何对话节点。</p></main></body></html>`;

// Same generator as the unit tests: 120 messages, repeated "继续" user turns and assistant replies sharing a long prefix.
function conversation(n) {
  const msgs = [];
  for (let i = 0; i < n; i += 1) {
    const role = i % 2 === 0 ? "user" : "assistant";
    let content = role === "user" ? `问题 ${i}` : `回答 ${i}：${"长文本".repeat((i % 7) + 1)}`;
    if (role === "user" && i % 10 === 4) content = "继续";
    if (role === "assistant" && i % 12 === 5) content = `${"同一段开头".repeat(30)} 结尾不同 ${i}`;
    msgs.push({ role, content, h: 90 + (i % 5) * 40 });
  }
  return msgs;
}
const LONG_MSGS = conversation(120);

// A real virtualized list: only rows intersecting the viewport exist in the DOM.
const VIRTUAL = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Long Virtual Chat - DeepSeek</title>
<style>body{margin:0}#scroller{height:600px;overflow-y:auto;position:relative}#spacer{position:relative}.ds-message{position:absolute;left:0;right:0;overflow:hidden}</style></head>
<body><main id="scroller" class="scroll-area"><div id="spacer"></div></main>
<script>
const msgs = ${JSON.stringify(LONG_MSGS)};
const scroller = document.getElementById("scroller");
const spacer = document.getElementById("spacer");
const tops = []; let y = 0;
for (const m of msgs) { tops.push(y); y += m.h; }
spacer.style.height = y + "px";
function render() {
  const st = scroller.scrollTop, vh = scroller.clientHeight;
  spacer.textContent = "";
  msgs.forEach((m, i) => {
    if (tops[i] + m.h <= st || tops[i] >= st + vh) return;
    const row = document.createElement("div");
    row.className = "ds-message";
    row.setAttribute("data-ds-role", m.role);
    row.style.top = tops[i] + "px";
    row.style.height = m.h + "px";
    const inner = document.createElement("div");
    inner.className = m.role === "user" ? "fbb737a4" : "ds-markdown";
    const p = document.createElement(m.role === "user" ? "span" : "p");
    p.textContent = m.content;
    inner.appendChild(p);
    row.appendChild(inner);
    spacer.appendChild(row);
  });
}
scroller.addEventListener("scroll", render);
render();
const start = location.hash.slice(1);
if (start === "middle") scroller.scrollTop = y / 2;
if (start === "bottom") scroller.scrollTop = y;
</script></body></html>`;

const ROUTES = new Map([
  ["https://chat.deepseek.com/a/chat/s/basic", BASIC],
  ["https://chat.deepseek.com/share/expired", EXPIRED],
  ["https://chat.deepseek.com/a/chat/s/long", VIRTUAL],
  ["https://chatgpt.com/c/not-supported", BASIC]
]);

async function run() {
  execFileSync("bash", [path.join(ROOT, "scripts", "package.sh")], { stdio: "ignore" });
  assert.ok(fs.existsSync(ZIP_PATH), `Release zip missing: ${ZIP_PATH}`);
  const listing = execFileSync("unzip", ["-Z1", ZIP_PATH]).toString().trim().split("\n");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatvault-e2e-"));
  const extDir = path.join(tmpRoot, "ext");
  const userDataDir = path.join(tmpRoot, "profile");
  fs.mkdirSync(extDir, { recursive: true });
  execFileSync("unzip", ["-q", ZIP_PATH, "-d", extDir]);

  let passed = 0;
  async function check(name, fn) {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  }

  await check("zip contains runtime files only (no print, tests, docs, store assets)", async () => {
    for (const bad of [/^print/, /^tests\//, /^docs\//, /^store-assets\//, /^xhs-editorial-kit\//, /^dist\//, /print_clean/]) {
      assert.ok(!listing.some((f) => bad.test(f)), `zip should not contain ${bad}: ${listing.join(", ")}`);
    }
    for (const must of ["manifest.json", "popup.js", "content.js", "src/extractor/chat_extractor.js"]) {
      assert.ok(listing.includes(must), `zip missing ${must}`);
    }
  });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]
  });
  const consoleErrors = [];
  const pageErrors = [];
  const external = [];
  const watch = (p, label) => {
    p.on("console", (m) => m.type() === "error" && consoleErrors.push(`${label}: ${m.text()}`));
    p.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
    p.on("request", (r) => {
      const u = r.url().split("#")[0];
      if (!ROUTES.has(u) && !/^(chrome|chrome-extension|data|blob|about):/.test(u)) external.push(`${label}: ${u}`);
    });
  };

  try {
    await context.route(/^https?:\/\//, (route) => {
      const u = route.request().url().split("#")[0];
      if (ROUTES.has(u)) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ROUTES.get(u) });
      return route.abort();
    });

    const extPage = await context.newPage();
    await extPage.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
    await extPage.waitForTimeout(300);
    const extensionId = await extPage.evaluate(() => {
      const mgr = document.querySelector("extensions-manager");
      const list = mgr && mgr.shadowRoot && mgr.shadowRoot.querySelector("extensions-item-list");
      const items = list && list.shadowRoot ? Array.from(list.shadowRoot.querySelectorAll("extensions-item")) : [];
      return items[0] ? items[0].getAttribute("id") : null;
    });
    await extPage.close();
    assert.ok(extensionId, "extension id");

    const chatPage = await context.newPage();
    watch(chatPage, "chat");
    const popup = await context.newPage();
    watch(popup, "popup");
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "load" });
    await popup.waitForFunction(() => document.getElementById("statusPill").dataset.status !== "pending", null, { timeout: 10000 });

    await check("popup opened outside DeepSeek shows unsupported, no content, export disabled", async () => {
      assert.equal(await popup.getAttribute("#statusPill", "data-status"), "unsupported");
      assert.equal(await popup.isDisabled("#btnExportMd"), true);
      assert.equal(await popup.isDisabled("#btnCopyMd"), true);
      assert.equal(await popup.isDisabled("#btnExportJson"), true);
      assert.doesNotMatch(await popup.textContent("#markdownPreview"), /^---/);
    });

    await popup.click("#btnLoadSample");
    await check("built-in sample is preview-only (export stays disabled)", async () => {
      assert.equal(await popup.getAttribute("#statusPill", "data-status"), "sample");
      assert.equal(await popup.isDisabled("#btnExportMd"), true);
      assert.match(await popup.textContent("#markdownPreview"), /^---\ntitle:/);
    });

    // Without the "tabs" permission tab.url is hidden, so ask every other tab and keep the first answer.
    const ask = (scrollCollect) =>
      popup.evaluate(async (scrollCollect) => {
        const self = await chrome.tabs.getCurrent();
        const tabs = (await chrome.tabs.query({})).filter((x) => !self || x.id !== self.id);
        const errors = [];
        for (const t of tabs) {
          const r = await new Promise((resolve) => {
            chrome.tabs.sendMessage(t.id, { type: "CHATVAULT_EXTRACT", scrollCollect }, (resp) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(resp);
            });
          });
          if (r && r.ok) return r;
          errors.push(r && r.error);
        }
        return { ok: false, error: errors.join(" | ") || "no tabs" };
      }, scrollCollect);

    await chatPage.goto("https://chat.deepseek.com/a/chat/s/basic", { waitUntil: "load" });
    await chatPage.waitForTimeout(300);
    const basic = await ask(true);
    await check("DeepSeek basic page: complete, reasoning + LaTeX + code fence preserved", async () => {
      assert.equal(basic.ok, true, JSON.stringify(basic));
      const conv = basic.conversation;
      assert.equal(conv.completeness.status, "complete");
      assert.equal(conv.messages.length, 2);
      assert.match(conv.messages[1].reasoning, /减去最大值 m/);
      assert.match(conv.messages[1].content, /\$m = \\max_j z_j\$/);
      assert.match(conv.messages[1].content, /```python\ndef stable_softmax\(logits\):\n    return logits\n```/);
      const md = await popup.evaluate((c) => globalThis.ChatVaultExporter.formatConversationMarkdown(c, {}), conv);
      assert.match(md, /export_status: "complete"/);
      assert.match(md, /完整 · 2 条消息/);
    });

    await chatPage.goto("https://chat.deepseek.com/share/expired", { waitUntil: "load" });
    await chatPage.waitForTimeout(300);
    const expired = await ask(true);
    await check("expired share page: not_found, zero messages (no whole-page fallback)", async () => {
      assert.equal(expired.ok, true, JSON.stringify(expired));
      assert.equal(expired.conversation.completeness.status, "not_found");
      assert.equal(expired.conversation.messages.length, 0);
    });

    await chatPage.goto("https://chatgpt.com/c/not-supported", { waitUntil: "load" });
    await chatPage.waitForTimeout(300);
    const gpt = await ask(true);
    await check("content script is not registered on non-DeepSeek sites", async () => {
      assert.equal(gpt.ok, false, JSON.stringify(gpt));
    });

    const expected = LONG_MSGS.map((m) => `${m.role}:${m.content}`);
    for (const start of ["bottom", "middle"]) {
      await chatPage.goto(`https://chat.deepseek.com/a/chat/s/long#${start}`, { waitUntil: "load" });
      await chatPage.waitForTimeout(400);
      const before = await chatPage.evaluate(() => document.getElementById("scroller").scrollTop);
      const rendered = await chatPage.evaluate(() => document.querySelectorAll(".ds-message").length);
      const t0 = Date.now();
      const long = await ask(true);
      const after = await chatPage.evaluate(() => document.getElementById("scroller").scrollTop);
      await check(`virtualized 120-message chat from ${start} (DOM shows ${rendered}): complete, exact order, duplicates kept, scroll restored`, async () => {
        assert.equal(long.ok, true, JSON.stringify(long).slice(0, 300));
        const conv = long.conversation;
        assert.equal(conv.completeness.status, "complete", (conv.completeness.reasons || []).join("; "));
        assert.equal(conv.messages.length, 120);
        assert.deepEqual(conv.messages.map((m) => `${m.role}:${m.content}`), expected);
        assert.ok(rendered < 20, `fixture must be virtualized, rendered=${rendered}`);
        assert.equal(after, before);
        console.log(`   (${start}: ${conv.completeness.windows} windows, ${Date.now() - t0} ms)`);
      });

      const quick = await ask(false);
      await check(`scroll check OFF on virtualized chat from ${start}: labeled current_range, not complete`, async () => {
        assert.equal(quick.conversation.completeness.status, "current_range");
        assert.ok(quick.conversation.messages.length < 120);
        const md = await popup.evaluate((c) => globalThis.ChatVaultExporter.formatConversationMarkdown(c, {}), quick.conversation);
        assert.match(md, /ChatVault 提示：已读取当前范围/);
      });
    }

    await check("zero console errors, page errors and external requests", async () => {
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(external, []);
    });
    console.log(`ALL E2E CHECKS PASSED: ${passed}`);
  } finally {
    await context.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
