"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");

const ICON_SVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="26" fill="url(#bg)"/>
  <rect x="24" y="28" width="80" height="72" rx="14" fill="#ffffff" fill-opacity="0.96"/>
  <path d="M38 48h52M38 64h36" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
  <path d="M84 62v22m0 0l-9-9m9 9l9-9" stroke="#059669" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

async function main() {
  fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "store-assets"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "docs", "assets"), { recursive: true });

  // Ensure docs/assets/wechat-coffee-light.png exists
  fs.copyFileSync(
    path.join(ROOT, "assets", "wechat-coffee-light.png"),
    path.join(ROOT, "docs", "assets", "wechat-coffee-light.png")
  );

  const browser = await chromium.launch({ headless: true });
  try {
    // 1. Render crisp 16x16, 48x48, 128x128 PNG icons
    for (const size of [16, 48, 128]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;">${ICON_SVG(size)}</body></html>`
      );
      await page.screenshot({
        path: path.join(ROOT, "icons", `icon${size}.png`),
        omitBackground: true
      });
      await page.close();
    }

    // 2. Render 1280x800 Chrome Web Store promo screenshots
    const shotPage = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

    // Screenshot 1: Docs Live Demo + Feature Showcase (1280x800)
    await shotPage.goto(`file://${path.join(ROOT, "docs", "index.html")}`, { waitUntil: "load" });
    await shotPage.screenshot({ path: path.join(ROOT, "store-assets", "screenshot-1-overview.png") });

    // Screenshot 2: Interactive Popup + DeepSeek <think> & KaTeX Preview framed on clean backdrop
    const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
    const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
    await shotPage.setViewportSize({ width: 1280, height: 800 });
    await shotPage.goto(`file://${path.join(ROOT, "popup.html")}`, { waitUntil: "load" });
    const innerBody = await shotPage.evaluate(() => document.body.innerHTML);
    await shotPage.setContent(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; gap:44px; background:linear-gradient(135deg,#ecfdf5 0%,#e0f2fe 100%); font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; padding:40px; }
  .hero-copy { max-width:460px; color:#0f172a; }
  .hero-copy .tag { display:inline-block; background:#059669; color:#fff; font-weight:700; font-size:13px; padding:4px 12px; border-radius:999px; margin-bottom:14px; }
  .hero-copy h1 { font-size:38px; line-height:1.2; margin:0 0 14px; }
  .hero-copy ul { margin:0; padding-left:20px; font-size:16px; line-height:1.8; color:#334155; }
  .popup-frame { width:400px; border-radius:16px; overflow:hidden; box-shadow:0 24px 60px rgba(15,23,42,0.22); border:1px solid #cbd5e1; background:#f8fafc; }
  .popup-frame .app { width:400px; }
</style>
<style>${popupCss.replace(/body\s*\{[^}]*\}/, "")}</style>
</head>
<body>
  <div class="hero-copy">
    <span class="tag">100% Local-First · connect-src 'none'</span>
    <h1>ChatVault 一键无损导出 AI 对话</h1>
    <ul>
      <li>DeepSeek &lt;think&gt; 思考过程折叠保留或一键剥离</li>
      <li>KaTeX / MathJax 公式还原为标准 $...$ / $$...$$</li>
      <li>保留 python / ts / sql 代码语言围栏，无复制按钮噪声</li>
      <li>纯净 @media print PDF 打印，零水印、零登录墙</li>
    </ul>
  </div>
  <div class="popup-frame">${innerBody}</div>
</body>
</html>`);
    // Populate preview text cleanly inside the framed popup
    await shotPage.evaluate(() => {
      document.getElementById("platformBadge").textContent = "DeepSeek";
      document.getElementById("platformBadge").setAttribute("data-platform", "deepseek");
      document.getElementById("convTitle").textContent = "DeepSeek-R1 Softmax 推导与 PyTorch 实现";
      document.getElementById("statMessages").textContent = "2 条消息";
      document.getElementById("statReasoning").textContent = "1 思考块";
      document.getElementById("statFormulas").textContent = "3 公式";
      document.getElementById("statCode").textContent = "1 代码块";
      document.getElementById("markdownPreview").textContent =
        '---\ntitle: "DeepSeek-R1 Softmax 推导与 PyTorch 实现"\nsource: "DeepSeek"\n---\n\n<details>\n<summary>Reasoning</summary>\n核心技巧：减去最大值 m = \\max_j z_j 防止指数溢出。\n</details>\n\n$$\n\\text{Softmax}(z_i) = \\frac{e^{z_i - m}}{\\sum_{j=1}^K e^{z_j - m}}\n$$';
    });
    // Rewrite relative icon/qr paths to file URLs for the standalone screenshot frame
    const iconUrl = `file://${path.join(ROOT, "icons", "icon48.png")}`;
    await shotPage.evaluate((u) => {
      const img = document.querySelector(".brand-icon");
      if (img) img.src = u;
    }, iconUrl);
    await shotPage.screenshot({ path: path.join(ROOT, "store-assets", "screenshot-2-popup.png") });

    // Screenshot 3: Clean Print PDF View (1280x800)
    await shotPage.goto(`file://${path.join(ROOT, "print.html")}`, { waitUntil: "load" });
    await shotPage.screenshot({ path: path.join(ROOT, "store-assets", "screenshot-3-print-pdf.png") });

    await shotPage.close();
  } finally {
    await browser.close();
  }
  console.log("Generated icons and store-assets screenshots.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
