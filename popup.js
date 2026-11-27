(function () {
  "use strict";

  const STORAGE_KEYS = {
    includeFrontmatter: "chatvault_include_frontmatter",
    includeReasoning: "chatvault_include_reasoning",
    scrollCollect: "chatvault_scroll_collect",
    coffeeSupported: "chatvault_coffee_supported",
    printPayload: "chatvault_print_payload"
  };

  let currentConversation = null;

  const els = {
    statusBanner: document.getElementById("statusBanner"),
    platformBadge: document.getElementById("platformBadge"),
    convTitle: document.getElementById("convTitle"),
    statMessages: document.getElementById("statMessages"),
    statReasoning: document.getElementById("statReasoning"),
    statFormulas: document.getElementById("statFormulas"),
    statCode: document.getElementById("statCode"),
    btnExportMd: document.getElementById("btnExportMd"),
    btnPrintPdf: document.getElementById("btnPrintPdf"),
    btnCopyMd: document.getElementById("btnCopyMd"),
    btnExportJson: document.getElementById("btnExportJson"),
    toggleFrontmatter: document.getElementById("toggleFrontmatter"),
    toggleReasoning: document.getElementById("toggleReasoning"),
    toggleScrollCollect: document.getElementById("toggleScrollCollect"),
    btnRefreshPage: document.getElementById("btnRefreshPage"),
    btnLoadSample: document.getElementById("btnLoadSample"),
    markdownPreview: document.getElementById("markdownPreview"),
    btnOpenCoffeeTop: document.getElementById("btnOpenCoffeeTop"),
    btnOpenCoffeeFooter: document.getElementById("btnOpenCoffeeFooter"),
    coffeeFooterCard: document.getElementById("coffeeFooterCard"),
    btnReopenCoffee: document.getElementById("btnReopenCoffee"),
    coffeeModal: document.getElementById("coffeeModal"),
    btnCloseCoffee: document.getElementById("btnCloseCoffee"),
    btnCoffeeLater: document.getElementById("btnCoffeeLater"),
    btnCoffeeSupported: document.getElementById("btnCoffeeSupported")
  };

  function showStatus(text, isOk) {
    els.statusBanner.textContent = text;
    els.statusBanner.classList.remove("is-hidden", "is-ok");
    if (isOk) els.statusBanner.classList.add("is-ok");
  }

  function hideStatus() {
    els.statusBanner.classList.add("is-hidden");
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } else {
        const out = {};
        for (const k of Object.keys(keys)) {
          try {
            const raw = localStorage.getItem(k);
            out[k] = raw === null ? keys[k] : JSON.parse(raw);
          } catch (_e) {
            out[k] = keys[k];
          }
        }
        resolve(out);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, () => resolve());
      } else {
        for (const [k, v] of Object.entries(obj)) {
          try {
            localStorage.setItem(k, JSON.stringify(v));
          } catch (_e) {
            // ignore
          }
        }
        resolve();
      }
    });
  }

  function getExportOptions() {
    return {
      includeFrontmatter: els.toggleFrontmatter.checked,
      includeReasoning: els.toggleReasoning.checked,
      scrollCollect: els.toggleScrollCollect.checked
    };
  }

  function renderConversation() {
    if (!currentConversation) return;
    const conv = currentConversation;
    const stats = conv.stats || {};
    const msgCount = stats.messageCount != null ? stats.messageCount : (conv.messages || []).length;
    const reasoningCount =
      stats.reasoningCount != null
        ? stats.reasoningCount
        : (conv.messages || []).filter((m) => Boolean(m.reasoning)).length;

    els.platformBadge.textContent = conv.platformLabel || conv.platform || "AI Chat";
    els.platformBadge.setAttribute("data-platform", conv.platform || "generic");
    els.convTitle.textContent = conv.title || "AI Conversation";
    els.convTitle.title = conv.title || "AI Conversation";
    els.statMessages.textContent = `${msgCount} 条消息`;
    els.statReasoning.textContent = `${reasoningCount} 思考块`;
    els.statFormulas.textContent = `${stats.formulaCount || 0} 公式`;
    els.statCode.textContent = `${stats.codeBlockCount || 0} 代码块`;

    const md = globalThis.ChatVaultExporter.formatConversationMarkdown(conv, getExportOptions());
    els.markdownPreview.textContent = md;
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applyCoffeeSupportedUI(supported) {
    if (supported) {
      els.coffeeFooterCard.classList.add("is-hidden");
      els.btnReopenCoffee.classList.remove("is-hidden");
    } else {
      els.coffeeFooterCard.classList.remove("is-hidden");
      els.btnReopenCoffee.classList.add("is-hidden");
    }
  }

  function openCoffeeModal() {
    els.coffeeModal.classList.remove("is-hidden");
  }

  function closeCoffeeModal() {
    els.coffeeModal.classList.add("is-hidden");
  }

  function sendMessageToTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function extractFromActiveTab() {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
      currentConversation = globalThis.ChatVaultSample;
      renderConversation();
      showStatus("当前为独立预览环境，已载入 DeepSeek 示例对话。", true);
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      currentConversation = globalThis.ChatVaultSample;
      renderConversation();
      showStatus("当前标签页不可注入脚本，已载入 DeepSeek 示例便于体验。", true);
      return;
    }

    const opts = { scrollCollect: els.toggleScrollCollect.checked };
    try {
      let resp = await sendMessageToTab(tab.id, { type: "CHATVAULT_EXTRACT", ...opts }).catch(() => null);
      if (!resp && chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/extractor/chat_extractor.js", "src/formatter/markdown_exporter.js", "content.js"]
        });
        resp = await sendMessageToTab(tab.id, { type: "CHATVAULT_EXTRACT", ...opts });
      }
      if (resp && resp.ok && resp.conversation && resp.conversation.messages.length > 0) {
        currentConversation = resp.conversation;
        renderConversation();
        hideStatus();
        return;
      }
      currentConversation = globalThis.ChatVaultSample;
      renderConversation();
      showStatus("当前页未检测到对话节点，已载入内置示例（可点击“重新抓取”）。", false);
    } catch (err) {
      currentConversation = globalThis.ChatVaultSample;
      renderConversation();
      showStatus(`抓取受限（${err.message}），已载入内置示例。`, false);
    }
  }

  async function handlePrintPdf() {
    if (!currentConversation) return;
    const opts = getExportOptions();
    await storageSet({
      [STORAGE_KEYS.printPayload]: {
        conversation: currentConversation,
        options: opts
      }
    });

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create && chrome.runtime && chrome.runtime.getURL) {
      const url = chrome.runtime.getURL("print.html");
      chrome.tabs.create({ url });
      showStatus("已打开纯净 PDF 打印视图（零水印）。", true);
    } else {
      window.open("print.html", "_blank");
    }
  }

  async function init() {
    const saved = await storageGet({
      [STORAGE_KEYS.includeFrontmatter]: true,
      [STORAGE_KEYS.includeReasoning]: true,
      [STORAGE_KEYS.scrollCollect]: true,
      [STORAGE_KEYS.coffeeSupported]: false
    });

    els.toggleFrontmatter.checked = saved[STORAGE_KEYS.includeFrontmatter] !== false;
    els.toggleReasoning.checked = saved[STORAGE_KEYS.includeReasoning] !== false;
    els.toggleScrollCollect.checked = saved[STORAGE_KEYS.scrollCollect] !== false;
    applyCoffeeSupportedUI(Boolean(saved[STORAGE_KEYS.coffeeSupported]));

    els.toggleFrontmatter.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.includeFrontmatter]: els.toggleFrontmatter.checked });
      renderConversation();
    });
    els.toggleReasoning.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.includeReasoning]: els.toggleReasoning.checked });
      renderConversation();
    });
    els.toggleScrollCollect.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.scrollCollect]: els.toggleScrollCollect.checked });
    });

    els.btnExportMd.addEventListener("click", () => {
      if (!currentConversation) return;
      const md = globalThis.ChatVaultExporter.formatConversationMarkdown(currentConversation, getExportOptions());
      const filename = globalThis.ChatVaultExporter.buildSafeFilename(
        currentConversation.title,
        currentConversation.platform,
        "md"
      );
      downloadTextFile(filename, md, "text/markdown;charset=utf-8");
      showStatus(`已导出 ${filename}`, true);
    });

    els.btnExportJson.addEventListener("click", () => {
      if (!currentConversation) return;
      const jsonText = globalThis.ChatVaultExporter.formatConversationJson(currentConversation, getExportOptions());
      const filename = globalThis.ChatVaultExporter.buildSafeFilename(
        currentConversation.title,
        currentConversation.platform,
        "json"
      );
      downloadTextFile(filename, jsonText, "application/json;charset=utf-8");
      showStatus(`已导出 ${filename}`, true);
    });

    els.btnCopyMd.addEventListener("click", async () => {
      if (!currentConversation) return;
      const md = globalThis.ChatVaultExporter.formatConversationMarkdown(currentConversation, getExportOptions());
      try {
        await navigator.clipboard.writeText(md);
        showStatus("已复制纯净 Markdown 到剪贴板。", true);
      } catch (_err) {
        showStatus("剪贴板权限受限，请直接导出 .md 文件。", false);
      }
    });

    els.btnPrintPdf.addEventListener("click", handlePrintPdf);
    els.btnRefreshPage.addEventListener("click", extractFromActiveTab);
    els.btnLoadSample.addEventListener("click", () => {
      currentConversation = globalThis.ChatVaultSample;
      renderConversation();
      showStatus("已载入 DeepSeek <think> + KaTeX 示例对话。", true);
    });

    els.btnOpenCoffeeTop.addEventListener("click", openCoffeeModal);
    els.btnOpenCoffeeFooter.addEventListener("click", openCoffeeModal);
    els.btnReopenCoffee.addEventListener("click", openCoffeeModal);
    els.btnCloseCoffee.addEventListener("click", closeCoffeeModal);
    els.btnCoffeeLater.addEventListener("click", closeCoffeeModal);
    els.coffeeModal.addEventListener("click", (e) => {
      if (e.target === els.coffeeModal) closeCoffeeModal();
    });
    els.btnCoffeeSupported.addEventListener("click", async () => {
      await storageSet({ [STORAGE_KEYS.coffeeSupported]: true });
      applyCoffeeSupportedUI(true);
      closeCoffeeModal();
      showStatus("感谢请作者喝咖啡！祝研究与开发顺利 ☕", true);
    });

    await extractFromActiveTab();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
