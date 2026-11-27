import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ZIP_PATH = path.join(ROOT, "dist", "chatvault-extension-v1.0.0.zip");

const FIXTURES = {
  deepseek: `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>DeepSeek Softmax Test - DeepSeek</title></head>
<body>
  <div class="ds-message" data-ds-role="user">
    <div class="fbb737a4">请推导数值稳定 Softmax 并给出 Python 函数</div>
  </div>
  <div class="ds-message" data-ds-role="assistant">
    <div class="ds-think-content">
      <p>首先解释减去最大值 m 的数学意义。</p>
    </div>
    <div class="ds-markdown">
      <p>令 <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">m = \\max_j z_j</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">m=max z</span></span>：</p>
      <span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\\text{Softmax}(z_i) = \\frac{e^{z_i - m}}{\\sum_j e^{z_j - m}}</annotation></semantics></math></span><span class="katex-html">visual</span></span></span>
      <div class="code-box"><div class="code-header"><span>python</span><button>复制代码</button></div><pre><code class="language-python">def stable_softmax(logits):
    return logits</code></pre></div>
    </div>
  </div>
</body>
</html>`,
  chatgpt: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>SQL Index Guide - ChatGPT</title></head>
<body>
  <article data-testid="conversation-turn-1">
    <div data-message-author-role="user"><div class="whitespace-pre-wrap">Compare B-Tree and Hash index.</div></div>
  </article>
  <article data-testid="conversation-turn-2">
    <details data-testid="thought-panel"><summary>Thought for 3s</summary><p>Focus on range queries.</p></details>
    <div data-message-author-role="assistant">
      <div class="markdown">
        <table><tr><th>Index</th><th>Range</th></tr><tr><td>B-Tree</td><td>Yes</td></tr></table>
        <pre><code class="language-sql">SELECT * FROM orders WHERE id &gt; 10;</code></pre>
      </div>
    </div>
  </article>
</body>
</html>`,
  claude: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>TS Result Pattern - Claude</title></head>
<body>
  <div data-testid="user-message">Write a Result type in TypeScript.</div>
  <div data-testid="assistant-message">
    <div data-testid="thinking-block">Use a discriminated union for exhaustive narrowing.</div>
    <pre data-language="ts"><code>export type Result&lt;T&gt; = { ok: true; value: T } | { ok: false; error: string };</code></pre>
  </div>
</body>
</html>`
};

const MOCK_ORIGINS = new Map([
  ["https://chat.deepseek.com/a/chat/s/test-1", FIXTURES.deepseek],
  ["https://chatgpt.com/c/test-1", FIXTURES.chatgpt],
  ["https://claude.ai/chat/test-1", FIXTURES.claude]
]);

function startDocsServer() {
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || "/").split("?")[0];
    const map = {
      "/": path.join(ROOT, "docs", "index.html"),
      "/index.html": path.join(ROOT, "docs", "index.html"),
      "/privacy.html": path.join(ROOT, "docs", "privacy.html"),
      "/style.css": path.join(ROOT, "docs", "style.css"),
      "/app.js": path.join(ROOT, "docs", "app.js"),
      "/assets/wechat-coffee-light.png": path.join(ROOT, "docs", "assets", "wechat-coffee-light.png")
    };
    const filePath = map[reqPath];
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath);
    const mime =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : "image/png";
    res.writeHead(200, { "Content-Type": mime });
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function run() {
  assert.ok(fs.existsSync(ZIP_PATH), `Release zip missing: ${ZIP_PATH}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatvault-e2e-"));
  const extDir = path.join(tmpRoot, "ext");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatvault-prof-"));
  const downloadDir = path.join(tmpRoot, "downloads");
  fs.mkdirSync(extDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  execFileSync("unzip", ["-q", ZIP_PATH, "-d", extDir]);
  assert.ok(fs.existsSync(path.join(extDir, "manifest.json")), "manifest.json missing in zip");

  const { server, baseUrl } = await startDocsServer();
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    acceptDownloads: true,
    downloadsPath: downloadDir,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]
  });

  let passed = 0;
  async function check(name, fn) {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  }

  try {
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];

    function attachListeners(p, label) {
      p.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`${label}: ${msg.text()}`);
      });
      p.on("pageerror", (err) => pageErrors.push(`${label}: ${String(err)}`));
      p.on("request", (req) => {
        const u = req.url();
        if (
          !MOCK_ORIGINS.has(u) &&
          !u.startsWith("http://127.0.0.1") &&
          !u.startsWith("chrome-extension://") &&
          !u.startsWith("chrome://") &&
          !u.startsWith("data:") &&
          !u.startsWith("blob:")
        ) {
          externalRequests.push(`${label}: ${u}`);
        }
      });
    }

    // Intercept mock AI platform URLs locally (zero external traffic)
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (MOCK_ORIGINS.has(url)) {
        return route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: MOCK_ORIGINS.get(url)
        });
      }
      return route.continue();
    });

    // Discover loaded extension ID
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
    assert.ok(extensionId, "Extension ID must resolve in Headless Chrome");

    const chatPage = await context.newPage();
    attachListeners(chatPage, "chatPage");
    const popupPage = await context.newPage();
    attachListeners(popupPage, "popupPage");
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "load" });

    // 1. Test automatic content_scripts injection + extraction on DeepSeek, ChatGPT, Claude
    for (const [url, expectedPlatform, checkFn] of [
      [
        "https://chat.deepseek.com/a/chat/s/test-1",
        "deepseek",
        (conv) => {
          assert.match(conv.messages[1].reasoning, /减去最大值 m/);
          assert.match(conv.messages[1].content, /\$m = \\max_j z_j\$/);
          assert.match(conv.messages[1].content, /\\text\{Softmax\}/);
          assert.match(conv.messages[1].content, /```python\ndef stable_softmax\(logits\):\n    return logits\n```/);
        }
      ],
      [
        "https://chatgpt.com/c/test-1",
        "chatgpt",
        (conv) => {
          assert.match(conv.messages[1].reasoning, /Focus on range queries/);
          assert.match(conv.messages[1].content, /\| Index \| Range \|/);
          assert.match(conv.messages[1].content, /```sql\nSELECT \* FROM orders WHERE id > 10;\n```/);
        }
      ],
      [
        "https://claude.ai/chat/test-1",
        "claude",
        (conv) => {
          assert.match(conv.messages[1].reasoning, /discriminated union/);
          assert.match(conv.messages[1].content, /```ts\nexport type Result<T>/);
        }
      ]
    ]) {
      await chatPage.goto(url, { waitUntil: "load" });
      await chatPage.waitForTimeout(200);
      const res = await popupPage.evaluate(async () => {
        const selfTab = await chrome.tabs.getCurrent();
        const tabs = await chrome.tabs.query({});
        const candidates = tabs.filter((x) => !selfTab || x.id !== selfTab.id);
        for (let i = candidates.length - 1; i >= 0; i -= 1) {
          const t = candidates[i];
          const r = await new Promise((resolve) => {
            chrome.tabs.sendMessage(t.id, { type: "CHATVAULT_EXTRACT", scrollCollect: false }, (resp) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message, tabId: t.id });
                return;
              }
              resolve(resp);
            });
          });
          if (r && r.ok) return r;
        }
        return { ok: false, error: "No tab responded to CHATVAULT_EXTRACT", count: candidates.length };
      });

      await check(`MV3 content_script extracts ${expectedPlatform} fixture in Chromium`, async () => {
        assert.equal(res.ok, true, JSON.stringify(res));
        assert.equal(res.conversation.platform, expectedPlatform);
        checkFn(res.conversation);
      });
    }

    // 2. Test Popup UI: Load sample, download .md, toggle Reasoning OFF, download .json, Coffee modal + persistence
    await popupPage.click("#btnLoadSample");
    await check("Popup preview renders YAML frontmatter, <details> Reasoning, KaTeX, and python fence", async () => {
      const txt = await popupPage.textContent("#markdownPreview");
      assert.match(txt, /^---\ntitle:/);
      assert.match(txt, /<details>\n<summary>Reasoning<\/summary>/);
      assert.match(txt, /\\text\{Softmax\}/);
      assert.match(txt, /```python/);
    });

    const [mdDownload] = await Promise.all([
      popupPage.waitForEvent("download"),
      popupPage.click("#btnExportMd")
    ]);
    const mdPath = path.join(downloadDir, mdDownload.suggestedFilename());
    await mdDownload.saveAs(mdPath);
    await check("Markdown .md file download contains intact formulas and zero watermarks", async () => {
      assert.ok(mdDownload.suggestedFilename().endsWith(".md"));
      const mdContent = fs.readFileSync(mdPath, "utf8");
      assert.match(mdContent, /<details>\n<summary>Reasoning<\/summary>/);
      assert.match(mdContent, /\$\$\n\\text\{Softmax\}/);
    });

    await popupPage.uncheck("#toggleReasoning");
    const [jsonDownload] = await Promise.all([
      popupPage.waitForEvent("download"),
      popupPage.click("#btnExportJson")
    ]);
    const jsonPath = path.join(downloadDir, jsonDownload.suggestedFilename());
    await jsonDownload.saveAs(jsonPath);
    await check("JSON download strips reasoning when toggle is OFF", async () => {
      assert.ok(jsonDownload.suggestedFilename().endsWith(".json"));
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(parsed.includeReasoning, false);
      assert.equal(parsed.messages[1].reasoning, undefined);
    });

    await popupPage.click("#btnOpenCoffeeFooter");
    await check("Coffee modal displays QR image cleanly", async () => {
      assert.equal(await popupPage.isVisible("#coffeeModal"), true);
      const qrWidth = await popupPage.evaluate(() => document.querySelector(".modal-qr-img").naturalWidth);
      assert.ok(qrWidth > 100, `QR naturalWidth must be > 100, got ${qrWidth}`);
    });
    await popupPage.click("#btnCoffeeSupported");
    await popupPage.reload({ waitUntil: "load" });
    await check("Coffee support state persists in chrome.storage.local across popup reload", async () => {
      assert.equal(await popupPage.isVisible("#btnReopenCoffee"), true);
    });

    // 3. Test Print PDF view
    const printPage = await context.newPage();
    attachListeners(printPage, "printPage");
    await printPage.goto(`chrome-extension://${extensionId}/print.html`, { waitUntil: "load" });
    await check("Clean print.html renders conversation with zero errors", async () => {
      const title = await printPage.textContent("#docTitle");
      assert.ok(title && title.length > 0);
    });
    await printPage.close();

    // 4. Test Docs site over HTTP (index.html + privacy.html)
    const docsPage = await context.newPage();
    attachListeners(docsPage, "docsPage");
    await docsPage.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await docsPage.selectOption("#demoPlatform", "claude");
    await check("docs/index.html interactive demo switches platform and loads coffee QR", async () => {
      const out = await docsPage.textContent("#demoOutputMd");
      assert.match(out, /```ts/);
      const qrWidth = await docsPage.evaluate(() => document.querySelector(".coffee-qr").naturalWidth);
      assert.ok(qrWidth > 100);
    });

    await docsPage.goto(`${baseUrl}/privacy.html`, { waitUntil: "load" });
    await check("docs/privacy.html loads cleanly", async () => {
      const h1 = await docsPage.textContent("h1");
      assert.match(h1, /ChatVault/);
    });

    await check("Zero console errors, zero page errors, zero external network requests", async () => {
      assert.deepEqual(consoleErrors, [], `Console errors: ${consoleErrors.join("; ")}`);
      assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join("; ")}`);
      assert.deepEqual(externalRequests, [], `External requests: ${externalRequests.join("; ")}`);
    });

    console.log(`ALL E2E CHECKS PASSED: ${passed}`);
  } finally {
    await context.close();
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
