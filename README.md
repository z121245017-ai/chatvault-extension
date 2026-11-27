# ChatVault — DeepSeek 对话导出 Markdown

1.1.0 只支持 DeepSeek（`https://chat.deepseek.com/*`），导出 Markdown / JSON。不含打印 / PDF。

## 核心承诺：读到哪儿，就承诺到哪儿

- 导出前显示来源、条数、首末片段和完整性状态：`complete`（完整）/ `partial`（部分导出）/ `current_range`（已读取当前范围）/ `not_found`（未找到对话）。
- 滚动校验从对话顶部开始，等更早的消息加载完再逐屏向下；每一屏必须与上一屏有唯一可验证的重叠才拼接，出现缺口或无法唯一对齐就停止，并标为「部分导出」。
- 消息按完整内容比对，内容相同的消息按位置保留，不会被合并。
- 不完整时，Markdown 正文开头写明原因；文件头信息（YAML，按 JSON 字符串序列化，可原样解析回读）和文末都记录状态与条数。
- 未找到对话时不生成任何导出内容；内置示例只供查看，不能导出。

## 安全与隐私

- 内容脚本只在 `https://chat.deepseek.com/*` 运行；弹窗按需注入前也会先校验当前标签页域名。
- 扩展页面 CSP：`script-src 'self'; object-src 'none'; connect-src 'none';`
- 权限：`activeTab`、`scripting`、`storage`。对话内容不写入浏览器存储。

## 测试

```bash
node --test tests/unit.test.js
# 真实 Chromium 加载扩展的端到端测试（需要 playwright）
node tests/e2e.spec.mjs
```

## License

MIT
