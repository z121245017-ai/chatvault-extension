# Chrome Web Store Listing — ChatVault 1.1.0

> 范围说明：1.1.0 只支持 DeepSeek（`https://chat.deepseek.com/*`）导出 Markdown / JSON。不含打印 / PDF，不支持其它平台。

## Extension Name（34 / 75）
`ChatVault - DeepSeek 对话导出 Markdown`

## Short Description（ZH，≤132）
`把 DeepSeek 对话导出为 Markdown，保留思考过程、公式和代码块。导出前显示读取条数与完整性，不完整会明确标注。本地运行，不上传数据。`

## Short Description（EN, reference）
`Export DeepSeek chats to Markdown with reasoning, formulas and code blocks. Shows message count and completeness before export; partial reads are labeled. Runs locally.`

## Detailed Description（中文）

ChatVault 把 DeepSeek 网页版的对话保存成 Markdown 文件，方便放进 Obsidian、Typora 或笔记库归档。

**读到哪儿，就承诺到哪儿**
- 导出前先显示：来源页面、读取到的条数、首条和末条内容片段。
- 状态分四种：「完整」「部分导出」「已读取当前范围」「未找到对话」。只有从对话顶部滚到底部、每一屏都能和上一屏核对上，才标「完整」。
- 不完整时，导出的文件开头会写明原因，文件头信息（YAML）和文件末尾也会记录状态和条数，离开插件也能辨认。
- 过期或无效的分享页会直接提示「未找到对话」，不会把整页文字当成一条消息导出。

**保留原始内容**
- DeepSeek 思考过程可折叠保留，也可一键去掉。
- 公式按原始 LaTeX 还原，代码块保留语言标记。
- 内容相同的消息（比如多次发送「继续」）按原顺序保留，不会被合并。

**本地运行**
- 只在 chat.deepseek.com 页面上读取，不访问其它网站。
- 不联网、不上传对话、无广告、无水印、不需要登录。
- 对话内容不写入浏览器存储，只保存三个开关的偏好设置。

## Permission Justification

| Permission | Justification |
| :--- | :--- |
| `activeTab` | 用户点击扩展图标时，读取当前 DeepSeek 标签页中的对话。 |
| `scripting` | 若页面在安装扩展前已打开、内容脚本尚未注入，仅在确认当前标签页是 `chat.deepseek.com` 后注入本地读取脚本。 |
| `storage` | 仅保存三个开关偏好（文件头信息、思考过程、滚动校验）和打赏状态，不保存对话内容。 |

Content scripts run only on `https://chat.deepseek.com/*`.

## Privacy
- Extension pages enforce `connect-src 'none'`; no analytics, telemetry or remote code.
- Privacy Policy URL: `https://z121245017-ai.github.io/chatvault-extension/privacy.html`

## Store assets to refresh before resubmission
- 旧截图包含多平台和打印功能，需要按 1.1.0 界面重新截图（已删除 `screenshot-3-print-pdf.png`）。
