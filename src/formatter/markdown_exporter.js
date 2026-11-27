(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChatVaultExporter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function yamlQuote(val) {
    const str = String(val == null ? "" : val).replace(/\r?\n/g, " ").trim();
    return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  function stripThinkTags(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function formatFrontmatter(conversation) {
    const title = conversation.title || "AI Conversation";
    const source = conversation.platformLabel || conversation.platform || "AI Chat";
    const platform = conversation.platform || "generic";
    const url = conversation.url || "";
    const exportedAt = conversation.exportedAt || new Date().toISOString();
    const count = Array.isArray(conversation.messages) ? conversation.messages.length : 0;

    return [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(source)}`,
      `platform: ${platform}`,
      `url: ${yamlQuote(url)}`,
      `exported_at: ${yamlQuote(exportedAt)}`,
      `message_count: ${count}`,
      "tags:",
      "  - ai-chat",
      `  - ${platform}`,
      "---",
      ""
    ].join("\n");
  }

  function formatConversationMarkdown(conversation, options) {
    const conv = conversation || { title: "AI Conversation", messages: [] };
    const opts = options || {};
    const includeFrontmatter = opts.includeFrontmatter !== false;
    const includeReasoning = opts.includeReasoning !== false;

    const lines = [];
    if (includeFrontmatter) {
      lines.push(formatFrontmatter(conv));
    }

    lines.push(`# ${conv.title || "AI Conversation"}`);
    lines.push("");

    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    for (const msg of messages) {
      const roleHeading = msg.role === "user" ? "## User" : "## Assistant";
      lines.push(roleHeading);
      lines.push("");

      const cleanReasoning = includeReasoning ? String(msg.reasoning || "").trim() : "";
      if (cleanReasoning) {
        lines.push("<details>");
        lines.push("<summary>Reasoning</summary>");
        lines.push("");
        lines.push(cleanReasoning);
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      const body = includeReasoning ? String(msg.content || "").trim() : stripThinkTags(msg.content);
      if (body) {
        lines.push(body);
        lines.push("");
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function formatConversationJson(conversation, options) {
    const conv = conversation || { title: "AI Conversation", messages: [] };
    const opts = options || {};
    const includeReasoning = opts.includeReasoning !== false;

    const messages = (conv.messages || []).map((m, idx) => {
      const item = {
        index: m.index || idx + 1,
        role: m.role,
        content: includeReasoning ? String(m.content || "") : stripThinkTags(m.content)
      };
      if (includeReasoning && m.reasoning) {
        item.reasoning = m.reasoning;
      }
      return item;
    });

    return JSON.stringify(
      {
        schemaVersion: "1.0.0",
        title: conv.title || "AI Conversation",
        platform: conv.platform || "generic",
        platformLabel: conv.platformLabel || "AI Chat",
        url: conv.url || "",
        exportedAt: conv.exportedAt || new Date().toISOString(),
        includeReasoning,
        messageCount: messages.length,
        messages
      },
      null,
      2
    ) + "\n";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderSimpleMarkdownHtml(mdText) {
    const raw = String(mdText || "").replace(/\r\n/g, "\n");
    const blocks = [];
    const fenceRe = /(^|\n)(`{3,})([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let last = 0;
    let match;
    while ((match = fenceRe.exec(raw)) !== null) {
      blocks.push({ type: "text", value: raw.slice(last, match.index + match[1].length) });
      blocks.push({ type: "code", lang: match[3].trim(), value: match[4] });
      last = fenceRe.lastIndex;
    }
    blocks.push({ type: "text", value: raw.slice(last) });

    return blocks
      .map((blk) => {
        if (blk.type === "code") {
          const langAttr = blk.lang ? `<div class="code-lang">${escapeHtml(blk.lang)}</div>` : "";
          return `<div class="code-wrap">${langAttr}<pre><code>${escapeHtml(blk.value)}</code></pre></div>`;
        }
        return blk.value
          .split(/\n{2,}/)
          .map((para) => para.trim())
          .filter(Boolean)
          .map((para) => {
            if (/^#{1,6}\s+/.test(para)) {
              const lvl = para.match(/^(#{1,6})/)[1].length;
              const txt = para.replace(/^#{1,6}\s+/, "");
              return `<h${lvl}>${escapeHtml(txt)}</h${lvl}>`;
            }
            if (para.startsWith("$$") && para.endsWith("$$")) {
              return `<pre class="math-block">${escapeHtml(para)}</pre>`;
            }
            const formatted = escapeHtml(para)
              .replace(/`([^`]+)`/g, "<code>$1</code>")
              .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br />");
            return `<p>${formatted}</p>`;
          })
          .join("\n");
      })
      .join("\n");
  }

  function buildSafeFilename(title, platform, ext) {
    const clean = String(title || "chat-export")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
    const prefix = platform && platform !== "generic" ? `${platform}-` : "";
    return `${prefix}${clean || "chat-export"}.${ext}`;
  }

  return {
    formatFrontmatter,
    formatConversationMarkdown,
    formatConversationJson,
    renderSimpleMarkdownHtml,
    buildSafeFilename,
    escapeHtml,
    stripThinkTags
  };
});
