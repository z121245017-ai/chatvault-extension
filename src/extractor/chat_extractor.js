(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChatVaultExtractor = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PLATFORM_LABELS = {
    chatgpt: "ChatGPT",
    deepseek: "DeepSeek",
    claude: "Claude",
    gemini: "Gemini",
    perplexity: "Perplexity",
    generic: "AI Chat"
  };

  const IGNORE_LANG_WORDS = new Set([
    "copy",
    "copied",
    "copy code",
    "code",
    "复制",
    "已复制",
    "复制代码",
    "run",
    "edit",
    "download",
    "wrap"
  ]);

  function getAttr(el, name) {
    if (!el || typeof el.getAttribute !== "function") return "";
    return String(el.getAttribute(name) || "");
  }

  function getClassName(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    if (el.className && typeof el.className.baseVal === "string") return el.className.baseVal;
    return getAttr(el, "class");
  }

  function hasClass(el, token) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === "function") {
      return el.classList.contains(token);
    }
    return getClassName(el).split(/\s+/).includes(token);
  }

  function getTagName(el) {
    return el && el.tagName ? String(el.tagName).toLowerCase() : "";
  }

  function isElement(node) {
    return Boolean(node && node.nodeType === 1);
  }

  function isTextNode(node) {
    return Boolean(node && node.nodeType === 3);
  }

  function safeQueryAll(rootEl, selector) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return [];
    try {
      return Array.from(rootEl.querySelectorAll(selector));
    } catch (_err) {
      return [];
    }
  }

  function safeQuery(rootEl, selector) {
    if (!rootEl || typeof rootEl.querySelector !== "function") return null;
    try {
      return rootEl.querySelector(selector);
    } catch (_err) {
      return null;
    }
  }

  function detectPlatform(urlOrHost, doc) {
    const raw = String(urlOrHost || "").toLowerCase();
    if (raw.includes("chatgpt.com") || raw.includes("chat.openai.com")) return "chatgpt";
    if (raw.includes("deepseek.com")) return "deepseek";
    if (raw.includes("claude.ai")) return "claude";
    if (raw.includes("gemini.google.com")) return "gemini";
    if (raw.includes("perplexity.ai")) return "perplexity";

    if (doc) {
      const explicit = getAttr(doc.documentElement, "data-chatvault-platform") ||
        (doc.body ? getAttr(doc.body, "data-chatvault-platform") : "");
      if (explicit && PLATFORM_LABELS[explicit.toLowerCase()]) {
        return explicit.toLowerCase();
      }
      if (safeQuery(doc, "[data-message-author-role]")) return "chatgpt";
      if (safeQuery(doc, ".ds-markdown, .ds-think-content, .ds-message, think")) return "deepseek";
      if (safeQuery(doc, '[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message')) {
        return "claude";
      }
      if (safeQuery(doc, "user-query, model-response")) return "gemini";
    }
    return "generic";
  }

  function cleanTitle(rawTitle, platform) {
    let title = String(rawTitle || "").replace(/\s+/g, " ").trim();
    const suffixes = [
      /\s*[-|–—]\s*ChatGPT$/i,
      /\s*[-|–—]\s*DeepSeek$/i,
      /\s*[-|–—]\s*Claude$/i,
      /\s*[-|–—]\s*Google Gemini$/i,
      /\s*[-|–—]\s*Gemini$/i,
      /\s*[-|–—]\s*Perplexity$/i
    ];
    for (const re of suffixes) {
      title = title.replace(re, "").trim();
    }
    if (!title || /^(ChatGPT|DeepSeek|Claude|Gemini|Perplexity|New chat)$/i.test(title)) {
      return `${PLATFORM_LABELS[platform] || "AI"} Conversation`;
    }
    return title;
  }

  function isReasoningElement(el) {
    if (!isElement(el)) return false;
    const tag = getTagName(el);
    if (tag === "think") return true;

    const cls = getClassName(el).toLowerCase();
    const testId = getAttr(el, "data-testid").toLowerCase();
    const aria = getAttr(el, "aria-label").toLowerCase();
    const roleAttr = getAttr(el, "data-role").toLowerCase();

    if (
      cls.includes("ds-think") ||
      cls.includes("think-content") ||
      cls.includes("thinking-content") ||
      cls.includes("thought-process") ||
      cls.includes("reasoning-content") ||
      testId.includes("think") ||
      testId.includes("reasoning") ||
      testId.includes("thought") ||
      roleAttr === "reasoning" ||
      getAttr(el, "data-is-thinking") === "true"
    ) {
      return true;
    }

    if (tag === "details") {
      const summary = safeQuery(el, "summary");
      const summaryText = summary ? String(summary.textContent || "").trim() : "";
      if (/^(?:thought|thinking|reasoning|deep\s*thought|已深度思考|深度思考|思考过程)/i.test(summaryText)) {
        return true;
      }
    }

    if (aria && /(?:thinking|thought process|reasoning)/i.test(aria) && tag !== "button") {
      return true;
    }

    return false;
  }

  function isUiNoiseElement(el) {
    if (!isElement(el)) return false;
    const tag = getTagName(el);
    if (["script", "style", "noscript", "svg", "button"].includes(tag)) return true;
    const cls = getClassName(el).toLowerCase();
    const testId = getAttr(el, "data-testid").toLowerCase();
    if (
      cls.includes("copy-button") ||
      cls.includes("ds-markdown-code-copy-button") ||
      testId.includes("copy-turn") ||
      testId.includes("action-bar") ||
      getAttr(el, "aria-hidden") === "true" && !hasClass(el, "katex") && !hasClass(el, "katex-display")
    ) {
      return true;
    }
    return false;
  }

  function extractKatexTex(el) {
    const annotation = safeQuery(el, 'annotation[encoding="application/x-tex"]') || safeQuery(el, "annotation");
    if (annotation && annotation.textContent) {
      return String(annotation.textContent).trim();
    }
    const attrTex = getAttr(el, "data-tex") || getAttr(el, "data-latex") || getAttr(el, "data-math");
    if (attrTex) return attrTex.trim();
    return "";
  }

  function isMathElement(el) {
    if (!isElement(el)) return null;
    const tag = getTagName(el);
    if (hasClass(el, "katex-display")) {
      const tex = extractKatexTex(el);
      if (tex) return { tex, display: true };
    }
    if (hasClass(el, "katex")) {
      const tex = extractKatexTex(el);
      if (tex) {
        const display = Boolean(el.parentElement && hasClass(el.parentElement, "katex-display"));
        return { tex, display };
      }
    }
    if (tag === "mjx-container") {
      const tex = extractKatexTex(el) || getAttr(el, "aria-label");
      if (tex) return { tex: tex.trim(), display: getAttr(el, "display") === "true" };
    }
    if (tag === "script") {
      const type = getAttr(el, "type").toLowerCase();
      if (type.startsWith("math/tex")) {
        const tex = String(el.textContent || "").trim();
        if (tex) return { tex, display: type.includes("mode=display") };
      }
    }
    if (getAttr(el, "data-math") || getAttr(el, "data-tex")) {
      const tex = (getAttr(el, "data-math") || getAttr(el, "data-tex")).trim();
      if (tex) return { tex, display: getAttr(el, "data-display") === "true" };
    }
    return null;
  }

  function detectCodeLanguage(preEl, codeEl) {
    const candidates = [];
    if (codeEl) {
      candidates.push(getClassName(codeEl), getAttr(codeEl, "data-language"), getAttr(codeEl, "data-lang"));
    }
    if (preEl) {
      candidates.push(getClassName(preEl), getAttr(preEl, "data-language"), getAttr(preEl, "data-lang"));
    }

    for (const raw of candidates) {
      if (!raw) continue;
      const clsMatch = String(raw).match(/(?:^|\s)(?:language|lang)-([a-zA-Z0-9_+#.-]+)/i);
      if (clsMatch) return clsMatch[1].toLowerCase();
      if (/^[a-zA-Z0-9_+#.-]{1,24}$/.test(String(raw).trim()) && !IGNORE_LANG_WORDS.has(String(raw).trim().toLowerCase())) {
        return String(raw).trim().toLowerCase();
      }
    }

    // Look for language header bars inside <pre> or its wrapper
    const searchRoots = [preEl, preEl && preEl.parentElement].filter(Boolean);
    for (const container of searchRoots) {
      const headerEls = safeQueryAll(container, "span, div.code-lang, [class*='lang'], [class*='header'] > div:first-child");
      for (const h of headerEls) {
        if (codeEl && h === codeEl) continue;
        const txt = String(h.textContent || "").trim();
        if (
          txt &&
          txt.length <= 20 &&
          /^[a-zA-Z0-9_+#.-]+$/.test(txt) &&
          !IGNORE_LANG_WORDS.has(txt.toLowerCase())
        ) {
          return txt.toLowerCase();
        }
      }
    }
    return "";
  }

  function extractCodeText(preEl, codeEl) {
    if (codeEl) {
      return String(codeEl.textContent || "").replace(/\r\n/g, "\n");
    }
    // Collect text nodes excluding button controls
    const parts = [];
    function walk(n) {
      if (isTextNode(n)) {
        parts.push(n.nodeValue || "");
        return;
      }
      if (!isElement(n)) return;
      if (getTagName(n) === "button" || isUiNoiseElement(n)) return;
      for (const child of Array.from(n.childNodes || [])) {
        walk(child);
      }
    }
    walk(preEl);
    return parts.join("").replace(/\r\n/g, "\n");
  }

  function buildCodeFence(codeText, lang) {
    const cleaned = String(codeText || "").replace(/\n+$/, "");
    let maxRun = 2;
    const matches = cleaned.match(/`+/g);
    if (matches) {
      for (const m of matches) {
        if (m.length > maxRun) maxRun = m.length;
      }
    }
    const fence = "`".repeat(maxRun + 1);
    return `\n\n${fence}${lang || ""}\n${cleaned}\n${fence}\n\n`;
  }

  function serializeTable(tableEl, ctx) {
    const rows = safeQueryAll(tableEl, "tr");
    if (!rows.length) return "";
    const matrix = rows.map((tr) => {
      const cells = safeQueryAll(tr, "th, td");
      return cells.map((cell) =>
        serializeChildren(cell, ctx)
          .replace(/\s*\n+\s*/g, " ")
          .replace(/\|/g, "\\|")
          .trim()
      );
    }).filter((r) => r.length > 0);
    if (!matrix.length) return "";

    const colCount = Math.max(...matrix.map((r) => r.length));
    const padRow = (r) => {
      const out = r.slice();
      while (out.length < colCount) out.push("");
      return `| ${out.join(" | ")} |`;
    };
    const header = padRow(matrix[0]);
    const sep = `| ${Array(colCount).fill("---").join(" | ")} |`;
    const body = matrix.slice(1).map(padRow);
    return `\n\n${[header, sep, ...body].join("\n")}\n\n`;
  }

  function serializeList(listEl, ordered, ctx, depth) {
    const items = Array.from(listEl.children || []).filter((c) => getTagName(c) === "li");
    if (!items.length) return "";
    const indent = "  ".repeat(depth);
    const lines = [];
    let index = Number(getAttr(listEl, "start")) || 1;

    for (const li of items) {
      const prefix = ordered ? `${index}. ` : "- ";
      index += 1;
      const inlineParts = [];
      const nestedParts = [];
      for (const child of Array.from(li.childNodes || [])) {
        const tag = getTagName(child);
        if (tag === "ul" || tag === "ol") {
          nestedParts.push(serializeList(child, tag === "ol", ctx, depth + 1));
        } else {
          inlineParts.push(serializeNode(child, ctx, depth));
        }
      }
      const text = inlineParts.join("").replace(/\n{2,}/g, "\n").trim();
      lines.push(`${indent}${prefix}${text}`);
      for (const nested of nestedParts) {
        if (nested.trim()) lines.push(nested.replace(/^\n+|\n+$/g, ""));
      }
    }
    return `\n\n${lines.join("\n")}\n\n`;
  }

  function serializeNode(node, ctx, depth) {
    if (!node) return "";
    if (isTextNode(node)) {
      return String(node.nodeValue || "");
    }
    if (!isElement(node)) return "";

    // Check reasoning node capture vs skip
    if (!ctx.insideReasoning && isReasoningElement(node)) {
      const innerCtx = {
        ...ctx,
        insideReasoning: true
      };
      const tag = getTagName(node);
      let reasoningMd = "";
      if (tag === "details") {
        const parts = [];
        for (const child of Array.from(node.childNodes || [])) {
          if (getTagName(child) === "summary") continue;
          parts.push(serializeNode(child, innerCtx, depth));
        }
        reasoningMd = normalizeMarkdown(parts.join(""));
      } else {
        reasoningMd = normalizeMarkdown(serializeChildren(node, innerCtx, depth));
      }
      if (reasoningMd) {
        ctx.reasoningBlocks.push(reasoningMd);
      }
      return "";
    }

    if (isUiNoiseElement(node)) {
      return "";
    }

    const math = isMathElement(node);
    if (math) {
      ctx.formulaCount += 1;
      if (math.display) {
        return `\n\n$$\n${math.tex}\n$$\n\n`;
      }
      return `$${math.tex}$`;
    }

    const tag = getTagName(node);

    if (tag === "pre") {
      const codeEl = safeQuery(node, "code");
      const lang = detectCodeLanguage(node, codeEl);
      const codeText = extractCodeText(node, codeEl);
      ctx.codeBlockCount += 1;
      return buildCodeFence(codeText, lang);
    }

    if (tag === "code") {
      const txt = String(node.textContent || "");
      if (txt.includes("\n")) {
        const lang = detectCodeLanguage(null, node);
        ctx.codeBlockCount += 1;
        return buildCodeFence(txt, lang);
      }
      const tick = txt.includes("`") ? "``" : "`";
      return `${tick}${txt}${tick}`;
    }

    if (tag === "br") return "\n";
    if (tag === "hr") return "\n\n---\n\n";

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const inner = serializeChildren(node, ctx, depth).replace(/\s*\n+\s*/g, " ").trim();
      return inner ? `\n\n${"#".repeat(level)} ${inner}\n\n` : "";
    }

    if (tag === "p") {
      const inner = serializeChildren(node, ctx, depth).trim();
      return inner ? `\n\n${inner}\n\n` : "";
    }

    if (tag === "blockquote") {
      const inner = normalizeMarkdown(serializeChildren(node, ctx, depth));
      if (!inner) return "";
      const quoted = inner
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
      return `\n\n${quoted}\n\n`;
    }

    if (tag === "ul") return serializeList(node, false, ctx, depth || 0);
    if (tag === "ol") return serializeList(node, true, ctx, depth || 0);
    if (tag === "table") return serializeTable(node, ctx);

    if (tag === "strong" || tag === "b") {
      const inner = serializeChildren(node, ctx, depth).trim();
      return inner ? `**${inner}**` : "";
    }
    if (tag === "em" || tag === "i") {
      const inner = serializeChildren(node, ctx, depth).trim();
      return inner ? `*${inner}*` : "";
    }
    if (tag === "del" || tag === "s") {
      const inner = serializeChildren(node, ctx, depth).trim();
      return inner ? `~~${inner}~~` : "";
    }
    if (tag === "a") {
      const inner = serializeChildren(node, ctx, depth).trim();
      const href = getAttr(node, "href").trim();
      if (!href || href.startsWith("javascript:")) return inner;
      return `[${inner || href}](${href})`;
    }
    if (tag === "img") {
      const alt = getAttr(node, "alt").trim();
      const src = getAttr(node, "src").trim();
      if (!src) return alt;
      return `![${alt}](${src})`;
    }

    if (tag === "details") {
      const parts = [];
      for (const child of Array.from(node.childNodes || [])) {
        if (ctx.insideReasoning && getTagName(child) === "summary") continue;
        parts.push(serializeNode(child, ctx, depth));
      }
      return parts.join("");
    }

    if (tag === "div" || tag === "section" || tag === "article" || tag === "li") {
      const inner = serializeChildren(node, ctx, depth);
      return inner;
    }

    return serializeChildren(node, ctx, depth);
  }

  function serializeChildren(el, ctx, depth) {
    let out = "";
    for (const child of Array.from(el.childNodes || [])) {
      out += serializeNode(child, ctx, depth);
    }
    return out;
  }

  function normalizeMarkdown(md) {
    const raw = String(md || "").replace(/\r\n/g, "\n");
    // Preserve fenced code blocks while normalizing surrounding spacing
    const segments = [];
    const fenceRe = /(^|\n)(`{3,})([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let lastIdx = 0;
    let match;
    while ((match = fenceRe.exec(raw)) !== null) {
      const before = raw.slice(lastIdx, match.index + match[1].length);
      segments.push({ code: false, text: before });
      segments.push({ code: true, text: `${match[2]}${match[3]}\n${match[4]}\n${match[2]}` });
      lastIdx = fenceRe.lastIndex;
    }
    segments.push({ code: false, text: raw.slice(lastIdx) });

    const rebuilt = segments
      .map((seg) => {
        if (seg.code) return `\n\n${seg.text}\n\n`;
        return seg.text
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n");
      })
      .join("");

    return rebuilt.replace(/\n{3,}/g, "\n\n").trim();
  }

  function splitLiteralThinkTags(md, reasoningBlocks) {
    let text = String(md || "");
    const re = /<think>([\s\S]*?)<\/think>/gi;
    text = text.replace(re, (_full, inner) => {
      const trimmed = normalizeMarkdown(inner);
      if (trimmed) reasoningBlocks.push(trimmed);
      return "";
    });
    return normalizeMarkdown(text);
  }

  function extractMessageFromElement(el, roleHint) {
    const ctx = {
      insideReasoning: false,
      reasoningBlocks: [],
      formulaCount: 0,
      codeBlockCount: 0
    };
    const rawMd = serializeNode(el, ctx, 0);
    const content = splitLiteralThinkTags(rawMd, ctx.reasoningBlocks);
    const reasoning = ctx.reasoningBlocks.map((r) => normalizeMarkdown(r)).filter(Boolean).join("\n\n");
    return {
      role: roleHint || "assistant",
      content,
      reasoning,
      formulaCount: ctx.formulaCount,
      codeBlockCount: ctx.codeBlockCount
    };
  }

  function extractChatGPT(doc) {
    const roleNodes = safeQueryAll(doc, "[data-message-author-role]");
    if (roleNodes.length) {
      return roleNodes.map((node) => {
        const roleRaw = getAttr(node, "data-message-author-role").toLowerCase();
        const role = roleRaw === "user" ? "user" : "assistant";
        const contentRoot = safeQuery(node, ".markdown, .whitespace-pre-wrap") || node;
        const turnEl = node.closest ? node.closest("article, [data-testid^='conversation-turn-']") : null;
        const msg = extractMessageFromElement(contentRoot, role);
        const searchScope = turnEl || node;
        if (!msg.reasoning && searchScope) {
          const thoughtEl = safeQuery(searchScope, '[data-testid*="thought"], .thought-process, details, think');
          if (thoughtEl && isReasoningElement(thoughtEl) && !contentRoot.contains(thoughtEl)) {
            const rCtx = { insideReasoning: true, reasoningBlocks: [], formulaCount: 0, codeBlockCount: 0 };
            msg.reasoning = normalizeMarkdown(serializeNode(thoughtEl, rCtx, 0));
          }
        }
        return msg;
      }).filter((m) => m.content || m.reasoning);
    }

    const turns = safeQueryAll(doc, 'article[data-testid^="conversation-turn-"]');
    return turns.map((turn, idx) => {
      const role = idx % 2 === 0 ? "user" : "assistant";
      return extractMessageFromElement(turn, role);
    }).filter((m) => m.content || m.reasoning);
  }

  function extractDeepSeek(doc) {
    const dsMessages = safeQueryAll(doc, ".ds-message, [data-ds-role], [data-role='user'], [data-role='assistant']");
    if (dsMessages.length) {
      return dsMessages.map((el) => {
        const roleAttr = (getAttr(el, "data-ds-role") || getAttr(el, "data-role")).toLowerCase();
        let role = roleAttr === "user" ? "user" : roleAttr === "assistant" ? "assistant" : "";
        if (!role) {
          const cls = getClassName(el).toLowerCase();
          if (cls.includes("user") || safeQuery(el, ".fbb737a4")) {
            role = "user";
          } else if (safeQuery(el, ".ds-markdown, .ds-think-content, think")) {
            role = "assistant";
          } else {
            role = "assistant";
          }
        }
        return extractMessageFromElement(el, role);
      }).filter((m) => m.content || m.reasoning);
    }

    // Fallback: pair user prompts (.fbb737a4) and assistant markdown (.ds-markdown) in DOM order
    const nodes = safeQueryAll(doc, ".fbb737a4, .ds-markdown, .ds-think-content, think");
    const messages = [];
    let pendingReasoning = "";
    for (const n of nodes) {
      if (isReasoningElement(n)) {
        const rCtx = { insideReasoning: true, reasoningBlocks: [], formulaCount: 0, codeBlockCount: 0 };
        const rText = normalizeMarkdown(serializeChildren(n, rCtx, 0));
        if (rText) pendingReasoning = pendingReasoning ? `${pendingReasoning}\n\n${rText}` : rText;
        continue;
      }
      if (hasClass(n, "fbb737a4")) {
        const msg = extractMessageFromElement(n, "user");
        if (msg.content) messages.push(msg);
        continue;
      }
      const msg = extractMessageFromElement(n, "assistant");
      if (pendingReasoning && !msg.reasoning) {
        msg.reasoning = pendingReasoning;
        pendingReasoning = "";
      }
      if (msg.content || msg.reasoning) messages.push(msg);
    }
    if (pendingReasoning) {
      messages.push({ role: "assistant", content: "", reasoning: pendingReasoning, formulaCount: 0, codeBlockCount: 0 });
    }
    return messages;
  }

  function extractClaude(doc) {
    const claudeNodes = safeQueryAll(
      doc,
      '[data-testid="user-message"], [data-testid="assistant-message"], .font-user-message, .font-claude-message'
    );
    if (claudeNodes.length) {
      return claudeNodes.map((el) => {
        const testId = getAttr(el, "data-testid").toLowerCase();
        const cls = getClassName(el).toLowerCase();
        const isUser = testId.includes("user") || cls.includes("user");
        return extractMessageFromElement(el, isUser ? "user" : "assistant");
      }).filter((m) => m.content || m.reasoning);
    }
    return [];
  }

  function extractGemini(doc) {
    const nodes = safeQueryAll(doc, "user-query, model-response");
    if (nodes.length) {
      return nodes.map((el) => {
        const isUser = getTagName(el) === "user-query";
        return extractMessageFromElement(el, isUser ? "user" : "assistant");
      }).filter((m) => m.content || m.reasoning);
    }
    return [];
  }

  const EXTRACTOR_VERSION = "1.1.0";
  const SUPPORTED_PLATFORMS = new Set(["deepseek"]);

  function isSupportedPlatform(platform) {
    return SUPPORTED_PLATFORMS.has(platform);
  }

  /**
   * Read the conversation currently present in the DOM.
   * Only DeepSeek is supported; every other page reports `unsupported` instead of guessing.
   * When nothing is found we return an explicit `not_found` status, never the whole page body.
   */
  function extractConversation(doc, options) {
    const opts = options || {};
    const url = opts.url || (doc && doc.location ? doc.location.href : "") || "";
    const platform = opts.platform || detectPlatform(url, doc);
    const title = cleanTitle(opts.title || (doc && doc.title ? doc.title : ""), platform);

    let messages = [];
    let status = "not_found";
    if (!isSupportedPlatform(platform)) {
      status = "unsupported";
    } else {
      messages = extractDeepSeek(doc);
      status = messages.length ? "current_range" : "not_found";
    }

    let reasoningCount = 0;
    let formulaCount = 0;
    let codeBlockCount = 0;
    const cleanMessages = messages.map((m, idx) => {
      if (m.reasoning) reasoningCount += 1;
      formulaCount += m.formulaCount || 0;
      codeBlockCount += m.codeBlockCount || 0;
      return {
        index: idx + 1,
        role: m.role,
        content: m.content || "",
        reasoning: m.reasoning || ""
      };
    });

    return {
      title,
      platform,
      platformLabel: PLATFORM_LABELS[platform] || "AI Chat",
      url,
      exportedAt: opts.exportedAt || new Date().toISOString(),
      messages: cleanMessages,
      stats: {
        messageCount: cleanMessages.length,
        reasoningCount,
        formulaCount,
        codeBlockCount
      },
      completeness: {
        status,
        method: "single_snapshot",
        reasons: status === "current_range" ? ["只读取了页面当前已加载的消息，未做滚动校验"] : [],
        extractorVersion: EXTRACTOR_VERSION
      }
    };
  }

  // Full-content identity. Repeated identical messages stay distinct because stitching is positional.
  function messageKey(msg) {
    return `${msg.role}\u0000${msg.content || ""}\u0000${msg.reasoning || ""}`;
  }

  /**
   * Append a newly read window to the accumulated sequence.
   * The window must overlap the accumulated tail by exactly one verifiable length,
   * otherwise we refuse to guess (gap or ambiguous alignment).
   */
  function stitchWindow(acc, win) {
    if (!win.length) return { ok: true, merged: acc, added: 0, overlap: 0 };
    if (!acc.length) return { ok: true, merged: win.slice(), added: win.length, overlap: 0 };

    const accKeys = acc.map(messageKey);
    const winKeys = win.map(messageKey);
    const maxK = Math.min(accKeys.length, winKeys.length);
    const candidates = [];
    for (let k = maxK; k >= 1; k -= 1) {
      let equal = true;
      for (let i = 0; i < k; i += 1) {
        if (accKeys[accKeys.length - k + i] !== winKeys[i]) {
          equal = false;
          break;
        }
      }
      if (equal) candidates.push(k);
    }

    if (!candidates.length) {
      return { ok: false, reason: "gap", merged: acc, added: 0, overlap: 0 };
    }
    // Several overlap lengths fit only when identical messages repeat at the boundary.
    // If they would all produce the same appended tail it does not matter; otherwise it is ambiguous.
    const tails = new Set(candidates.map((k) => winKeys.slice(k).join("\u0001")));
    const lengths = new Set(candidates.map((k) => win.length - k));
    if (candidates.length > 1 && (tails.size > 1 || lengths.size > 1)) {
      return { ok: false, reason: "ambiguous", merged: acc, added: 0, overlap: candidates[0] };
    }
    const k = candidates[0];
    const added = win.slice(k);
    return { ok: true, merged: acc.concat(added), added: added.length, overlap: k };
  }

  function sameSequence(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (messageKey(a[i]) !== messageKey(b[i])) return false;
    }
    return true;
  }

  function findScroller(doc) {
    let scroller = doc.scrollingElement || doc.documentElement;
    let bestHeight = scroller ? scroller.scrollHeight || 0 : 0;
    const containers = safeQueryAll(doc, "main, [class*='scroll'], [class*='overflow-y-auto'], [style*='overflow']");
    for (const c of containers) {
      if ((c.scrollHeight || 0) > (c.clientHeight || 0) + 120 && (c.scrollHeight || 0) > bestHeight * 0.4) {
        scroller = c;
        bestHeight = c.scrollHeight;
      }
    }
    return scroller;
  }

  function sleep(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  /**
   * Scroll from the very top to the bottom, stitching each rendered window onto the previous one.
   * Result carries an explicit completeness verdict:
   * - complete: top was stable, bottom reached, every window joined by a unique overlap
   * - partial: anything that prevents proving the above (reasons listed)
   * - not_found / unsupported: nothing trustworthy to export
   */
  async function scrollCollectMessages(doc, win, options) {
    const opts = options || {};
    const settleMs = typeof opts.settleMs === "number" ? opts.settleMs : 220;
    const maxSteps = typeof opts.maxSteps === "number" ? opts.maxSteps : 400;
    const maxTopTries = typeof opts.maxTopTries === "number" ? opts.maxTopTries : 8;
    const read = typeof opts.extract === "function" ? opts.extract : (d) => extractConversation(d, opts);

    const first = read(doc);
    const base = first.completeness ? first.completeness.status : "not_found";
    if (base === "unsupported") return first;

    const scroller = opts.scroller || (win && doc && typeof doc.querySelectorAll === "function" ? findScroller(doc) : null);
    const scrollable = Boolean(
      scroller && (scroller.scrollHeight || 0) > (scroller.clientHeight || 0) + 2
    );

    if (!scrollable) {
      if (!first.messages.length) return first;
      return {
        ...first,
        completeness: {
          status: "complete",
          method: "single_snapshot",
          reasons: [],
          reachedTop: true,
          reachedBottom: true,
          windows: 1,
          extractorVersion: EXTRACTOR_VERSION
        }
      };
    }

    const reasons = [];
    const originalTop = scroller.scrollTop || 0;
    let acc = [];
    let windows = 0;
    let reachedTop = false;
    let reachedBottom = false;
    let stoppedEarly = false;
    let prevWindow = null;
    const stableRead = async () => {
      let last = read(doc);
      for (let i = 0; i < 2; i += 1) {
        await sleep(settleMs > 0 ? Math.max(40, Math.floor(settleMs / 2)) : 0);
        const again = read(doc);
        if (sameSequence(again.messages, last.messages)) return again;
        last = again;
      }
      return last;
    };

    try {
      // 1) Go to the top and wait until older history stops loading.
      let prevHeight = -1;
      for (let t = 0; t < maxTopTries; t += 1) {
        scroller.scrollTop = 0;
        await sleep(settleMs);
        const h = scroller.scrollHeight || 0;
        if ((scroller.scrollTop || 0) <= 1 && h === prevHeight) {
          reachedTop = true;
          break;
        }
        prevHeight = h;
      }
      if (!reachedTop) reasons.push("顶部仍在加载更早的消息，无法确认已到对话开头");

      // 2) Walk down one viewport at a time.
      const step = Math.max(200, Math.floor((scroller.clientHeight || 600) * 0.7));
      let steps = 0;
      while (steps < maxSteps) {
        const snap = await stableRead();
        windows += 1;
        // Identical consecutive windows carry no new information (e.g. the page renders everything).
        const res = prevWindow && sameSequence(snap.messages, prevWindow)
          ? { ok: true, merged: acc, added: 0, overlap: snap.messages.length }
          : stitchWindow(acc, snap.messages);
        prevWindow = snap.messages;
        if (!res.ok) {
          stoppedEarly = true;
          reasons.push(
            res.reason === "ambiguous"
              ? `第 ${acc.length} 条之后出现内容相同的相邻消息，无法唯一确定衔接位置，已停止拼接`
              : `第 ${acc.length} 条之后与下一屏没有可验证的重叠，可能存在缺口，已停止拼接`
          );
          break;
        }
        acc = res.merged;
        const top = scroller.scrollTop || 0;
        const atBottom = top + (scroller.clientHeight || 0) >= (scroller.scrollHeight || 0) - 2;
        if (atBottom) {
          reachedBottom = true;
          break;
        }
        scroller.scrollTop = top + step;
        await sleep(settleMs);
        if ((scroller.scrollTop || 0) <= top) {
          // Could not move further although not at the bottom.
          reasons.push("页面无法继续向下滚动，未读到对话末尾");
          break;
        }
        steps += 1;
      }
      if (!reachedBottom && !stoppedEarly && steps >= maxSteps) {
        reasons.push(`滚动达到 ${maxSteps} 屏上限，未读到对话末尾`);
      }
    } finally {
      scroller.scrollTop = originalTop;
    }

    // Prefer the plain snapshot when the page renders everything at once and both reads agree.
    let messages = acc;
    let method = "scroll_stitch";
    if (sameSequence(acc, first.messages)) {
      messages = first.messages;
      method = "single_snapshot_verified";
    } else if (acc.length < first.messages.length && reachedBottom && !stoppedEarly) {
      reasons.push("滚动拼接得到的消息少于页面初始读取，结果不一致");
    }

    if (!messages.length) {
      return {
        ...first,
        messages: [],
        stats: { ...first.stats, messageCount: 0, reasoningCount: 0 },
        completeness: {
          status: "not_found",
          method,
          reasons,
          reachedTop,
          reachedBottom,
          windows,
          extractorVersion: EXTRACTOR_VERSION
        }
      };
    }

    const status = reachedTop && reachedBottom && !stoppedEarly && reasons.length === 0 ? "complete" : "partial";
    const finalMessages = messages.map((m, idx) => ({
      index: idx + 1,
      role: m.role,
      content: m.content || "",
      reasoning: m.reasoning || ""
    }));

    return {
      ...first,
      messages: finalMessages,
      stats: {
        ...first.stats,
        messageCount: finalMessages.length,
        reasoningCount: finalMessages.filter((m) => Boolean(m.reasoning)).length
      },
      completeness: {
        status,
        method,
        reasons,
        reachedTop,
        reachedBottom,
        windows,
        extractorVersion: EXTRACTOR_VERSION
      }
    };
  }

  return {
    PLATFORM_LABELS,
    EXTRACTOR_VERSION,
    detectPlatform,
    isSupportedPlatform,
    cleanTitle,
    extractConversation,
    scrollCollectMessages,
    stitchWindow,
    normalizeMarkdown,
    splitLiteralThinkTags
  };
});
