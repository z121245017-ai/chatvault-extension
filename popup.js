(function () {
  "use strict";

  const STORAGE_KEYS = {
    includeFrontmatter: "chatvault_include_frontmatter",
    includeReasoning: "chatvault_include_reasoning",
    scrollCollect: "chatvault_scroll_collect",
    coffeeSupported: "chatvault_coffee_supported"
  };
  const SUPPORTED_HOST = "chat.deepseek.com";
  const EXPORTABLE = new Set(["complete", "partial", "current_range"]);
  const STATUS_TEXT = {
    pending: "读取中",
    complete: "完整",
    partial: "部分导出",
    current_range: "已读取当前范围",
    not_found: "未找到对话",
    unsupported: "不支持的页面",
    sample: "示例数据"
  };

  let currentConversation = null;
  let readToken = 0;

  const $ = (id) => document.getElementById(id);
  const els = {
    statusBanner: $("statusBanner"),
    platformBadge: $("platformBadge"),
    convTitle: $("convTitle"),
    statusPill: $("statusPill"),
    statMessages: $("statMessages"),
    statReasoning: $("statReasoning"),
    rangeSource: $("rangeSource"),
    rangeFirst: $("rangeFirst"),
    rangeLast: $("rangeLast"),
    rangeReasons: $("rangeReasons"),
    btnExportMd: $("btnExportMd"),
    btnCopyMd: $("btnCopyMd"),
    btnExportJson: $("btnExportJson"),
    toggleFrontmatter: $("toggleFrontmatter"),
    toggleReasoning: $("toggleReasoning"),
    toggleScrollCollect: $("toggleScrollCollect"),
    btnRefreshPage: $("btnRefreshPage"),
    btnLoadSample: $("btnLoadSample"),
    markdownPreview: $("markdownPreview"),
    btnOpenCoffeeTop: $("btnOpenCoffeeTop"),
    btnOpenCoffeeFooter: $("btnOpenCoffeeFooter"),
    coffeeFooterCard: $("coffeeFooterCard"),
    btnReopenCoffee: $("btnReopenCoffee"),
    coffeeModal: $("coffeeModal"),
    btnCloseCoffee: $("btnCloseCoffee"),
    btnCoffeeLater: $("btnCoffeeLater"),
    btnCoffeeSupported: $("btnCoffeeSupported")
  };

  function showStatus(text, isOk) {
    els.statusBanner.textContent = text;
    els.statusBanner.classList.remove("is-hidden", "is-ok");
    if (isOk) els.statusBanner.classList.add("is-ok");
  }

  function hideStatus() {
    els.statusBanner.classList.add("is-hidden");
  }

  function hasChromeStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function storageGet(defaults) {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        chrome.storage.local.get(defaults, (res) => resolve(res || defaults));
        return;
      }
      const out = {};
      for (const k of Object.keys(defaults)) {
        try {
          const raw = localStorage.getItem(k);
          out[k] = raw === null ? defaults[k] : JSON.parse(raw);
        } catch (_e) {
          out[k] = defaults[k];
        }
      }
      resolve(out);
    });
  }

  // Only small preference flags are stored; conversation content never touches persistent storage.
  function storageSet(obj) {
    return new Promise((resolve) => {
      if (hasChromeStorage()) {
        chrome.storage.local.set(obj, () => {
          resolve(!(chrome.runtime && chrome.runtime.lastError));
        });
        return;
      }
      try {
        for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
        resolve(true);
      } catch (_e) {
        resolve(false);
      }
    });
  }

  function getExportOptions() {
    return {
      includeFrontmatter: els.toggleFrontmatter.checked,
      includeReasoning: els.toggleReasoning.checked
    };
  }

  function preview(text, max) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    if (!flat) return "-";
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  function statusOf(conv) {
    return (conv && conv.completeness && conv.completeness.status) || "pending";
  }

  function canExport(conv) {
    return Boolean(conv && conv.messages && conv.messages.length && EXPORTABLE.has(statusOf(conv)));
  }

  function setExportEnabled(enabled) {
    els.btnExportMd.disabled = !enabled;
    els.btnCopyMd.disabled = !enabled;
    els.btnExportJson.disabled = !enabled;
  }

  function renderState(conv, sourceText) {
    currentConversation = conv;
    const status = statusOf(conv);
    const messages = (conv && conv.messages) || [];
    const reasons = (conv && conv.completeness && conv.completeness.reasons) || [];

    els.platformBadge.textContent = status === "sample" ? "示例" : status === "unsupported" || status === "not_found" ? "未识别" : "DeepSeek";
    els.platformBadge.setAttribute("data-platform", "deepseek");
    els.convTitle.textContent = (conv && conv.title) || "未读取到对话";
    els.convTitle.title = els.convTitle.textContent;
    els.statusPill.textContent = STATUS_TEXT[status] || status;
    els.statusPill.setAttribute("data-status", status);
    els.statMessages.textContent = `${messages.length} 条消息`;
    els.statReasoning.textContent = `${messages.filter((m) => m.reasoning).length} 思考块`;
    els.rangeSource.textContent = sourceText || (conv && conv.url) || "-";
    els.rangeSource.title = els.rangeSource.textContent;
    const first = messages[0];
    const last = messages[messages.length - 1];
    els.rangeFirst.textContent = first ? `${first.role === "user" ? "用户" : "助手"}：${preview(first.content || first.reasoning, 40)}` : "-";
    els.rangeLast.textContent = last ? `${last.role === "user" ? "用户" : "助手"}：${preview(last.content || last.reasoning, 40)}` : "-";

    els.rangeReasons.innerHTML = "";
    if (reasons.length) {
      for (const r of reasons) {
        const li = document.createElement("li");
        li.textContent = r;
        els.rangeReasons.appendChild(li);
      }
      els.rangeReasons.classList.remove("is-hidden");
    } else {
      els.rangeReasons.classList.add("is-hidden");
    }

    setExportEnabled(canExport(conv));
    els.markdownPreview.textContent = messages.length
      ? globalThis.ChatVaultExporter.formatConversationMarkdown(conv, getExportOptions())
      : "没有可导出的内容。";
  }

  function renderEmpty(status, title, message) {
    renderState(
      {
        title,
        messages: [],
        completeness: { status, reasons: [] }
      },
      "-"
    );
    els.markdownPreview.textContent = message;
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
    els.coffeeFooterCard.classList.toggle("is-hidden", supported);
    els.btnReopenCoffee.classList.toggle("is-hidden", !supported);
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

  function isSupportedUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" && u.hostname === SUPPORTED_HOST;
    } catch (_e) {
      return false;
    }
  }

  function describeSource(url) {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`;
    } catch (_e) {
      return url || "-";
    }
  }

  async function extractFromActiveTab() {
    const token = ++readToken;
    // Never keep a previous conversation around while reading a new one.
    currentConversation = null;
    setExportEnabled(false);
    hideStatus();

    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
      renderEmpty("not_found", "当前不在扩展环境", "请在 Chrome 中打开 DeepSeek 对话页后使用。也可以点「载入示例」查看导出效果。");
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !isSupportedUrl(tab.url || "")) {
      renderEmpty(
        "unsupported",
        "请打开 DeepSeek 对话页",
        "ChatVault 目前只支持 DeepSeek（chat.deepseek.com）。"
      );
      showStatus("请打开 chat.deepseek.com 的对话页，再点「重新读取」。", false);
      return;
    }

    const scrollCollect = els.toggleScrollCollect.checked;
    renderEmpty("pending", "正在读取…", scrollCollect ? "正在从顶部逐屏滚动核对，长对话需要几秒，请不要切换标签页。" : "正在读取当前已加载的消息…");
    const payload = { type: "CHATVAULT_EXTRACT", scrollCollect };

    try {
      let resp = await sendMessageToTab(tab.id, payload).catch(() => null);
      if (!resp && chrome.scripting && chrome.scripting.executeScript) {
        // Host already verified above; inject only into the DeepSeek tab.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/extractor/chat_extractor.js", "src/formatter/markdown_exporter.js", "content.js"]
        });
        resp = await sendMessageToTab(tab.id, payload);
      }
      if (token !== readToken) return;
      if (!resp || !resp.ok || !resp.conversation) {
        throw new Error((resp && resp.error) || "页面没有返回结果");
      }
      const conv = resp.conversation;
      const status = statusOf(conv);
      if (status === "not_found" || !conv.messages.length) {
        renderEmpty("not_found", "未找到对话", "这个页面里没有找到 DeepSeek 对话内容。如果是已过期或无效的分享页，请打开有效的对话后点「重新读取」。");
        showStatus("未找到对话，未生成任何导出内容。", false);
        return;
      }
      renderState(conv, describeSource(conv.url || tab.url));
      if (status === "complete") {
        showStatus(`已完整读取 ${conv.messages.length} 条消息。`, true);
      } else if (status === "partial") {
        showStatus(`只确认读取到 ${conv.messages.length} 条消息，导出文件会标注为「部分导出」。`, false);
      } else {
        showStatus(`已读取当前已加载的 ${conv.messages.length} 条消息，未做滚动校验。`, false);
      }
    } catch (err) {
      if (token !== readToken) return;
      renderEmpty("not_found", "读取失败", "读取失败，未生成任何导出内容。请刷新 DeepSeek 页面后点「重新读取」。");
      showStatus(`读取失败：${err.message}`, false);
    }
  }

  function exportSummary(conv) {
    const status = statusOf(conv);
    return `${STATUS_TEXT[status] || status} · ${conv.messages.length} 条`;
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

    const rerender = () => {
      if (currentConversation && currentConversation.messages.length) {
        renderState(currentConversation, els.rangeSource.textContent);
      }
    };
    els.toggleFrontmatter.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.includeFrontmatter]: els.toggleFrontmatter.checked });
      rerender();
    });
    els.toggleReasoning.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.includeReasoning]: els.toggleReasoning.checked });
      rerender();
    });
    els.toggleScrollCollect.addEventListener("change", () => {
      storageSet({ [STORAGE_KEYS.scrollCollect]: els.toggleScrollCollect.checked });
    });

    els.btnExportMd.addEventListener("click", () => {
      const conv = currentConversation;
      if (!canExport(conv)) return;
      const md = globalThis.ChatVaultExporter.formatConversationMarkdown(conv, getExportOptions());
      const filename = globalThis.ChatVaultExporter.buildSafeFilename(conv.title, conv.platform, "md");
      downloadTextFile(filename, md, "text/markdown;charset=utf-8");
      showStatus(`已导出 ${filename}（${exportSummary(conv)}）`, statusOf(conv) === "complete");
    });

    els.btnExportJson.addEventListener("click", () => {
      const conv = currentConversation;
      if (!canExport(conv)) return;
      const jsonText = globalThis.ChatVaultExporter.formatConversationJson(conv, getExportOptions());
      const filename = globalThis.ChatVaultExporter.buildSafeFilename(conv.title, conv.platform, "json");
      downloadTextFile(filename, jsonText, "application/json;charset=utf-8");
      showStatus(`已导出 ${filename}（${exportSummary(conv)}）`, statusOf(conv) === "complete");
    });

    els.btnCopyMd.addEventListener("click", async () => {
      const conv = currentConversation;
      if (!canExport(conv)) return;
      const md = globalThis.ChatVaultExporter.formatConversationMarkdown(conv, getExportOptions());
      try {
        await navigator.clipboard.writeText(md);
        showStatus(`已复制 Markdown（${exportSummary(conv)}）`, statusOf(conv) === "complete");
      } catch (_err) {
        showStatus("剪贴板不可用，请改用「导出 Markdown」。", false);
      }
    });

    els.btnRefreshPage.addEventListener("click", extractFromActiveTab);
    els.btnLoadSample.addEventListener("click", () => {
      readToken += 1;
      const sample = { ...globalThis.ChatVaultSample, completeness: { status: "sample", reasons: [] } };
      renderState(sample, "内置示例（不可导出）");
      showStatus("这是内置示例，仅用于查看导出效果，不能导出。", true);
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
      showStatus("感谢请作者喝咖啡！", true);
    });

    await extractFromActiveTab();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
