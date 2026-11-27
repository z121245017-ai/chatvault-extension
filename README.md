# ChatVault — Local-First ChatGPT, DeepSeek & Claude Exporter

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-059669)]() [![Zero Network](https://img.shields.io/badge/connect--src-'none'-0369a1)]() [![License: MIT](https://img.shields.io/badge/License-MIT-slate)]()

**100% 本地离线、零水印、零登录墙的 AI 对话无损导出 Chrome 扩展。**
专为解决现有导出插件的五大真实痛点而设计：
1. **防虚拟滚动长对话截断**：内置安全滚动全量采集，逐段合并对话节点，完整抓取长会话。
2. **DeepSeek `<think>` 思考过程无损保留**：自动识别 `<think>` / `.ds-think-content` / Claude Thinking / ChatGPT o1-o3 Thought 块，折叠为 `<details><summary>Reasoning</summary>...</details>`，并支持一键剥离或保留。
3. **KaTeX / MathJax LaTeX 公式完整还原**：提取 `<annotation encoding="application/x-tex">`，精准还原 `$...$` 与 `$$...$$`，彻底告别公式乱码。
4. **精确代码块语言围栏**：保留 `python`、`ts`、`sql`、`bash` 等原始语言标签，自动过滤网页“复制代码”按钮噪声。
5. **纯净 PDF 打印 + Obsidian YAML Frontmatter**：提供 `@media print` 纯净打印视图（自动隐藏侧边栏与输入框，零水印另存为 PDF）及 Obsidian/Notion YAML 元数据开关。

## 安全与隐私承诺 (Local-First Guarantee)

- **Strict CSP**：`script-src 'self'; object-src 'self'; connect-src 'none';`
- **Minimal Permissions**：仅申请 `activeTab`、`scripting`、`storage`，无 `<all_urls>`、无 `cookies`、无后台静默上传。
- **Zero External Dependencies**：运行时 0 第三方脚本、0 外部字体或 CDN 请求。

## 本地安装与开发验证

1. 下载 [v1.0.0 扩展包](https://github.com/z121245017-ai/chatvault-extension/releases/download/v1.0.0/chatvault-extension-v1.0.0.zip) 并解压（或直接克隆本仓库）。
2. 打开 Chrome `chrome://extensions/`，开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择项目根目录。
3. 运行本地单元测试（零外部依赖）：
   ```bash
   node --test tests/unit.test.js
   ```

## License

MIT
