(function () {
  "use strict";

  if (globalThis.__chatvaultContentInstalled) return;
  globalThis.__chatvaultContentInstalled = true;

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.type) return false;

      if (message.type === "CHATVAULT_PING") {
        const platform = globalThis.ChatVaultExtractor
          ? globalThis.ChatVaultExtractor.detectPlatform(location.href, document)
          : "generic";
        sendResponse({ ok: true, platform, url: location.href });
        return false;
      }

      if (message.type === "CHATVAULT_EXTRACT") {
        const extractor = globalThis.ChatVaultExtractor;
        if (!extractor) {
          sendResponse({ ok: false, error: "Extractor not loaded" });
          return false;
        }
        const doScroll = Boolean(message.scrollCollect);
        const opts = { url: location.href, title: document.title };
        if (doScroll) {
          extractor
            .scrollCollectMessages(document, window, opts)
            .then((conversation) => sendResponse({ ok: true, conversation }))
            .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
          return true;
        }
        const conversation = extractor.extractConversation(document, opts);
        sendResponse({ ok: true, conversation });
        return false;
      }

      if (message.type === "CHATVAULT_PREPARE_PRINT") {
        document.documentElement.classList.add("chatvault-print-ready");
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }
})();
