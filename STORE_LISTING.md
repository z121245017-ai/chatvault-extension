# Chrome Web Store Listing — ChatVault

## Extension Name (61 / 75 chars)
`ChatVault - Export ChatGPT, DeepSeek & Claude to Markdown/PDF`

## Short Description (EN)
`100% local-first exporter for ChatGPT, DeepSeek, Claude & Gemini. Preserves <think> blocks, KaTeX LaTeX & code fences with zero watermarks.`

## Short Description (ZH)
`100% 本地离线导出 ChatGPT/DeepSeek/Claude 为 Markdown/PDF：完整保留 <think> 思考过程、KaTeX 公式与代码围栏，零水印零外连。`

## Detailed Description (Bilingual EN / ZH)

Export your AI conversations cleanly without virtual-scroll truncation, broken LaTeX, mangled DeepSeek `<think>` blocks, or forced watermarks and login walls.

### Why ChatVault?
- **DeepSeek `<think>` & Claude Thinking Support**: Wraps reasoning traces in clean collapsible `<details><summary>Reasoning</summary>...</details>` blocks—or strips them cleanly with one toggle.
- **Lossless KaTeX / MathJax LaTeX Restoration**: Reads original `<annotation encoding="application/x-tex">` nodes so `$...$` and `$$...$$` formulas paste directly into Obsidian, Notion, and Typora.
- **Exact Fenced Code Languages & GFM Tables**: Keeps `python`, `ts`, `sql`, `bash` fence tags intact without "Copy code" button noise.
- **Scroll Collection for Long Threads**: Safely traverses long virtualized threads to avoid missing early turns.
- **Clean Watermark-Free PDF Print**: Built-in `@media print` view hides sidebars and composers for instant Save-as-PDF.
- **Obsidian / Notion YAML Frontmatter**: One-click toggle for title, source platform, URL, timestamp, and tags.

### 核心亮点（中文）
- **100% 本地离线（`connect-src 'none'`）**：不登录、不联网、不上传对话数据，无任何广告与水印。
- **DeepSeek `<think>` 与公式无损**：思考过程折叠导出/一键剥离，KaTeX 源码还原 `$...$` / `$$...$$`。
- **一键导出 Markdown / JSON / 复制 / 纯净 PDF 打印**。

## Minimal Permission Justification (Chrome Web Store Review)

| Permission | Justification |
| :--- | :--- |
| `activeTab` | Only accesses the currently active tab when the user clicks the ChatVault extension icon to extract the visible conversation DOM locally. |
| `scripting` | Injects the local extraction script on demand when the user triggers export on a generic or unsupported chat UI tab without requesting `<all_urls>`. |
| `storage` | Stores user preferences locally in `chrome.storage.local` (YAML Frontmatter toggle, Reasoning toggle, Scroll-collect toggle, and Print view payload). |

## Privacy & Host Policy
- `connect-src 'none'` enforced in `manifest.json`.
- No remote analytics, no telemetry, no remote code execution.
- Privacy Policy URL: `https://z121245017-ai.github.io/chatvault-extension/privacy.html`
