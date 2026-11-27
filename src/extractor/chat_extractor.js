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

  function extractGeneric(doc) {
    const candidates = safeQueryAll(
      doc,
      "[data-role], [data-author], .chat-message, .message, article, [role='listitem']"
    );
    // Keep only outermost candidate elements so nested messages don't duplicate
    const topLevel = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)));
    if (topLevel.length) {
      return topLevel.map((el, idx) => {
        const roleAttr = (getAttr(el, "data-role") || getAttr(el, "data-author") || "").toLowerCase();
        let role = "assistant";
        if (roleAttr === "user" || roleAttr === "human" || getClassName(el).toLowerCase().includes("user")) {
          role = "user";
        } else if (!roleAttr && idx % 2 === 0 && !getClassName(el).toLowerCase().includes("assistant")) {
          role = "user";
        }
        return extractMessageFromElement(el, role);
      }).filter((m) => m.content || m.reasoning);
    }

    const rootEl = safeQuery(doc, "main") || doc.body;
    if (!rootEl) return [];
    const fallback = extractMessageFromElement(rootEl, "assistant");
    return fallback.content || fallback.reasoning ? [fallback] : [];
  }

  function extractConversation(doc, options) {
    const opts = options || {};
    const url = opts.url || (doc && doc.location ? doc.location.href : "") || "";
    const platform = opts.platform || detectPlatform(url, doc);
    const title = cleanTitle(opts.title || (doc && doc.title ? doc.title : ""), platform);

    let messages = [];
    if (platform === "chatgpt") messages = extractChatGPT(doc);
    else if (platform === "deepseek") messages = extractDeepSeek(doc);
    else if (platform === "claude") messages = extractClaude(doc);
    else if (platform === "gemini") messages = extractGemini(doc);

    if (!messages.length) {
      messages = extractGeneric(doc);
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
        content: m.content,
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
      }
    };
  }

  function messageSignature(msg) {
    const head = (msg.content || "").slice(0, 120);
    const rHead = (msg.reasoning || "").slice(0, 80);
    return `${msg.role}::${head}::${rHead}`;
  }

  async function scrollCollectMessages(doc, win, options) {
    const opts = options || {};
    const settleMs = typeof opts.settleMs === "number" ? opts.settleMs : 60;
    const maxSteps = typeof opts.maxSteps === "number" ? opts.maxSteps : 36;

    const first = extractConversation(doc, opts);
    if (!win || typeof doc.querySelectorAll !== "function") {
      return first;
    }

    // Find tallest scrollable container or document scrollingElement
    let scroller = doc.scrollingElement || doc.documentElement;
    const allContainers = safeQueryAll(doc, "main, [class*='scroll'], [class*='overflow-y-auto'], [style*='overflow']");
    let bestHeight = scroller ? scroller.scrollHeight || 0 : 0;
    for (const c of allContainers) {
      if ((c.scrollHeight || 0) > (c.clientHeight || 0) + 120 && (c.scrollHeight || 0) > bestHeight * 0.4) {
        scroller = c;
        bestHeight = c.scrollHeight;
      }
    }

    if (!scroller || (scroller.scrollHeight || 0) <= (scroller.clientHeight || 0) + 120) {
      return first;
    }

    const originalTop = scroller.scrollTop || 0;
    const totalHeight = scroller.scrollHeight || 0;
    const step = Math.max(320, Math.floor((scroller.clientHeight || 600) * 0.8));

    const ordered = [];
    const seen = new Map();

    function mergeSnapshot(conv) {
      for (const msg of conv.messages) {
        const sig = messageSignature(msg);
        if (!seen.has(sig)) {
          seen.set(sig, ordered.length);
          ordered.push(msg);
        } else {
          // Keep richer version if virtual scroll finished hydrating content
          const existingIdx = seen.get(sig);
          const prev = ordered[existingIdx];
          if ((msg.content.length + msg.reasoning.length) > (prev.content.length + prev.reasoning.length)) {
            ordered[existingIdx] = msg;
          }
        }
      }
    }

    mergeSnapshot(first);

    try {
      let y = 0;
      for (let i = 0; i < maxSteps && y <= totalHeight; i += 1) {
        scroller.scrollTop = y;
        if (settleMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, settleMs));
        }
        mergeSnapshot(extractConversation(doc, opts));
        if (y + (scroller.clientHeight || 600) >= (scroller.scrollHeight || totalHeight)) {
          break;
        }
        y += step;
      }
    } finally {
      scroller.scrollTop = originalTop;
    }

    const finalMessages = ordered.map((m, idx) => ({
      index: idx + 1,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning || ""
    }));

    return {
      ...first,
      messages: finalMessages,
      stats: {
        ...first.stats,
        messageCount: finalMessages.length,
        reasoningCount: finalMessages.filter((m) => Boolean(m.reasoning)).length
      }
    };
  }

  return {
    PLATFORM_LABELS,
    detectPlatform,
    cleanTitle,
    extractConversation,
    scrollCollectMessages,
    normalizeMarkdown,
    splitLiteralThinkTags
  };
});
