(function () {
  "use strict";

  const STORAGE_KEY = "chatvault_print_payload";
  let payload = null;

  function loadPayload() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res && res[STORAGE_KEY] ? res[STORAGE_KEY] : null));
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          resolve(raw ? JSON.parse(raw) : null);
        } catch (_e) {
          resolve(null);
        }
      }
    });
  }

  function render() {
    const exporter = globalThis.ChatVaultExporter;
    const conv = (payload && payload.conversation) || globalThis.ChatVaultSample;
    const includeReasoning = document.getElementById("printIncludeReasoning").checked;

    document.title = `${conv.title || "AI Conversation"} - ChatVault`;
    document.getElementById("docTitle").textContent = conv.title || "AI Conversation";
    document.getElementById("docMeta").textContent = `${conv.platformLabel || conv.platform || "AI Chat"} · ${conv.exportedAt || ""}`;

    const body = document.getElementById("docBody");
    body.innerHTML = "";

    for (const msg of conv.messages || []) {
      const turn = document.createElement("article");
      turn.className = "turn";

      const badge = document.createElement("div");
      badge.className = `turn-role ${msg.role === "user" ? "user" : "assistant"}`;
      badge.textContent = msg.role === "user" ? "User" : "Assistant";
      turn.appendChild(badge);

      if (includeReasoning && msg.reasoning) {
        const details = document.createElement("details");
        details.className = "reasoning-box";
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = "Reasoning";
        details.appendChild(summary);
        const rContent = document.createElement("div");
        rContent.innerHTML = exporter.renderSimpleMarkdownHtml(msg.reasoning);
        details.appendChild(rContent);
        turn.appendChild(details);
      }

      const contentText = includeReasoning ? msg.content : exporter.stripThinkTags(msg.content);
      if (contentText) {
        const contentDiv = document.createElement("div");
        contentDiv.className = "turn-content";
        contentDiv.innerHTML = exporter.renderSimpleMarkdownHtml(contentText);
        turn.appendChild(contentDiv);
      }

      body.appendChild(turn);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    payload = await loadPayload();
    if (payload && payload.options && payload.options.includeReasoning === false) {
      document.getElementById("printIncludeReasoning").checked = false;
    }
    render();
    document.getElementById("printIncludeReasoning").addEventListener("change", render);
    document.getElementById("btnTriggerPrint").addEventListener("click", () => window.print());
  });
})();
