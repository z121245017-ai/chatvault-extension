(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChatVaultExporter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPORTER_VERSION = "1.1.0";

  const STATUS_LABELS = {
    complete: "完整",
    partial: "部分导出",
    current_range: "已读取当前范围",
    not_found: "未找到对话",
    unsupported: "不支持的页面",
    sample: "示例数据"
  };

  /**
   * YAML scalar that round-trips exactly: a JSON string is a valid YAML double-quoted scalar,
   * so newlines, backslashes, quotes and `---` are preserved instead of breaking the frontmatter.
   * U+2028/U+2029 are escaped explicitly so YAML 1.1 parsers do not treat them as line breaks.
   */
  function yamlString(val) {
    return JSON.stringify(String(val == null ? "" : val))
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function stripThinkTags(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function preview(text, max) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  function completenessOf(conversation) {
    const c = (conversation && conversation.completeness) || {};
    const status = c.status || "current_range";
    return {
      status,
      label: STATUS_LABELS[status] || status,
      reasons: Array.isArray(c.reasons) ? c.reasons : [],
      method: c.method || "",
      extractorVersion: c.extractorVersion || ""
    };
  }

  function formatFrontmatter(conversation) {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const first = messages[0];
    const last = messages[messages.length - 1];
    const c = completenessOf(conversation);
    const platform = conversation.platform || "deepseek";

    const lines = [
      "---",
      `title: ${yamlString(conversation.title || "AI Conversation")}`,
      `source: ${yamlString(conversation.platformLabel || conversation.platform || "DeepSeek")}`,
      `platform: ${yamlString(platform)}`,
      `url: ${yamlString(conversation.url || "")}`,
      `exported_at: ${yamlString(conversation.exportedAt || new Date().toISOString())}`,
      `message_count: ${messages.length}`,
      `export_status: ${yamlString(c.status)}`,
      `export_status_label: ${yamlString(c.label)}`
    ];
    if (c.reasons.length) {
      lines.push("export_notes:");
      for (const r of c.reasons) lines.push(`  - ${yamlString(r)}`);
    }
    if (first) lines.push(`first_message_preview: ${yamlString(preview(first.content || first.reasoning, 60))}`);
    if (last) lines.push(`last_message_preview: ${yamlString(preview(last.content || last.reasoning, 60))}`);
    lines.push(`exporter: ${yamlString(`ChatVault ${EXPORTER_VERSION}`)}`);
    lines.push("tags:", `  - ${yamlString("ai-chat")}`, `  - ${yamlString(platform)}`, "---", "");
    return lines.join("\n");
  }

  function statusFooter(conversation) {
    const c = completenessOf(conversation);
    const count = Array.isArray(conversation.messages) ? conversation.messages.length : 0;
    const when = conversation.exportedAt || new Date().toISOString();
    return `> 由 ChatVault ${EXPORTER_VERSION} 导出 · ${c.label} · ${count} 条消息 · ${when}`;
  }

  function statusCallout(conversation) {
    const c = completenessOf(conversation);
    if (c.status === "complete") return "";
    const count = Array.isArray(conversation.messages) ? conversation.messages.length : 0;
    const why = c.reasons.length ? c.reasons.join("；") : "未做完整性校验";
    return `> **ChatVault 提示：${c.label}**。本文件只包含已读取到的 ${count} 条消息。原因：${why}`;
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

    const callout = statusCallout(conv);
    if (callout) {
      lines.push(callout);
      lines.push("");
    }

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

    lines.push("---");
    lines.push("");
    lines.push(statusFooter(conv));

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function formatConversationJson(conversation, options) {
    const conv = conversation || { title: "AI Conversation", messages: [] };
    const opts = options || {};
    const includeReasoning = opts.includeReasoning !== false;
    const c = completenessOf(conv);

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
        schemaVersion: "1.1.0",
        exporter: `ChatVault ${EXPORTER_VERSION}`,
        title: conv.title || "AI Conversation",
        platform: conv.platform || "deepseek",
        platformLabel: conv.platformLabel || "DeepSeek",
        url: conv.url || "",
        exportedAt: conv.exportedAt || new Date().toISOString(),
        completeness: {
          status: c.status,
          label: c.label,
          reasons: c.reasons,
          method: c.method
        },
        includeReasoning,
        messageCount: messages.length,
        messages
      },
      null,
      2
    ) + "\n";
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
    EXPORTER_VERSION,
    STATUS_LABELS,
    yamlString,
    formatFrontmatter,
    formatConversationMarkdown,
    formatConversationJson,
    buildSafeFilename,
    stripThinkTags
  };
});
