(function () {
  "use strict";

  const SAMPLES = {
    deepseek: {
      title: "DeepSeek-R1 Softmax 推导与实现",
      platform: "deepseek",
      platformLabel: "DeepSeek",
      url: "https://chat.deepseek.com/a/chat/s/demo-softmax",
      rawHtml: `<div class="ds-message" data-ds-role="user">
  <div class="fbb737a4">给出数值稳定 Softmax 公式与 Python 实现</div>
</div>
<div class="ds-message" data-ds-role="assistant">
  <div class="ds-think-content">核心技巧：减去最大值 m 避免 exp(z) 溢出。</div>
  <div class="ds-markdown">
    <p>令 <span class="katex"><annotation encoding="application/x-tex">m = \\max_j z_j</annotation></span>：</p>
    <span class="katex-display"><annotation encoding="application/x-tex">\\text{Softmax}(z_i) = \\frac{e^{z_i - m}}{\\sum_j e^{z_j - m}}</annotation></span>
    <pre><code class="language-python">def stable_softmax(logits):
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp_vals = np.exp(shifted)
    return exp_vals / np.sum(exp_vals, axis=-1, keepdims=True)</code></pre>
  </div>
</div>`,
      messages: [
        { role: "user", content: "给出数值稳定 Softmax 公式与 Python 实现", reasoning: "" },
        {
          role: "assistant",
          reasoning: "核心技巧：减去最大值 m 避免 exp(z) 溢出。",
          content:
            "令 $m = \\max_j z_j$：\n\n$$\n\\text{Softmax}(z_i) = \\frac{e^{z_i - m}}{\\sum_j e^{z_j - m}}\n$$\n\n```python\ndef stable_softmax(logits):\n    shifted = logits - np.max(logits, axis=-1, keepdims=True)\n    exp_vals = np.exp(shifted)\n    return exp_vals / np.sum(exp_vals, axis=-1, keepdims=True)\n```"
        }
      ]
    },
    chatgpt: {
      title: "SQL 索引优化对比",
      platform: "chatgpt",
      platformLabel: "ChatGPT",
      url: "https://chatgpt.com/c/demo-sql",
      rawHtml: `<article data-testid="conversation-turn-2">
  <details data-testid="thought-panel">
    <summary>Thought for 3s</summary>
    <p>对比 B-Tree 与 Hash 索引适用范围。</p>
  </details>
  <div data-message-author-role="assistant">
    <div class="markdown">
      <table>
        <tr><th>类型</th><th>范围查询</th></tr>
        <tr><td>B-Tree</td><td>支持</td></tr>
      </table>
      <pre><code class="language-sql">CREATE INDEX idx_created_at ON orders(created_at);</code></pre>
    </div>
  </div>
</article>`,
      messages: [
        { role: "user", content: "对比 B-Tree 与 Hash 索引并给出建索引 SQL", reasoning: "" },
        {
          role: "assistant",
          reasoning: "对比 B-Tree 与 Hash 索引适用范围。",
          content:
            "| 类型 | 范围查询 |\n| --- | --- |\n| B-Tree | 支持 |\n\n```sql\nCREATE INDEX idx_created_at ON orders(created_at);\n```"
        }
      ]
    },
    claude: {
      title: "TypeScript 泛型结果封装",
      platform: "claude",
      platformLabel: "Claude",
      url: "https://claude.ai/chat/demo-ts",
      rawHtml: `<div data-testid="assistant-message">
  <div data-testid="thinking-block">使用 discriminated union 保证类型收窄安全。</div>
  <pre data-language="ts"><code>export type Result&lt;T, E = Error&gt; =
  | { ok: true; value: T }
  | { ok: false; error: E };</code></pre>
</div>`,
      messages: [
        { role: "user", content: "写出类型安全的 Result 泛型封装", reasoning: "" },
        {
          role: "assistant",
          reasoning: "使用 discriminated union 保证类型收窄安全。",
          content: "```ts\nexport type Result<T, E = Error> =\n  | { ok: true; value: T }\n  | { ok: false; error: E };\n```"
        }
      ]
    }
  };

  function buildMarkdown(sample, includeFrontmatter, includeReasoning) {
    const out = [];
    if (includeFrontmatter) {
      out.push(
        "---",
        `title: "${sample.title}"`,
        `source: "${sample.platformLabel}"`,
        `platform: ${sample.platform}`,
        `url: "${sample.url}"`,
        `exported_at: "2026-11-27T04:30:00.000Z"`,
        `message_count: ${sample.messages.length}`,
        "tags:",
        "  - ai-chat",
        `  - ${sample.platform}`,
        "---",
        ""
      );
    }
    out.push(`# ${sample.title}`, "");
    for (const msg of sample.messages) {
      out.push(msg.role === "user" ? "## User" : "## Assistant", "");
      if (includeReasoning && msg.reasoning) {
        out.push("<details>", "<summary>Reasoning</summary>", "", msg.reasoning, "", "</details>", "");
      }
      out.push(msg.content, "");
    }
    return out.join("\n").trim() + "\n";
  }

  function render() {
    const key = document.getElementById("demoPlatform").value;
    const includeFrontmatter = document.getElementById("demoFrontmatter").checked;
    const includeReasoning = document.getElementById("demoReasoning").checked;
    const sample = SAMPLES[key] || SAMPLES.deepseek;
    document.getElementById("demoInputHtml").textContent = sample.rawHtml;
    document.getElementById("demoOutputMd").textContent = buildMarkdown(sample, includeFrontmatter, includeReasoning);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("demoPlatform").addEventListener("change", render);
    document.getElementById("demoFrontmatter").addEventListener("change", render);
    document.getElementById("demoReasoning").addEventListener("change", render);
    document.getElementById("demoDownloadMd").addEventListener("click", () => {
      const md = document.getElementById("demoOutputMd").textContent;
      const key = document.getElementById("demoPlatform").value;
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${key}-chatvault-demo.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    render();
  });
})();
