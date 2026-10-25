// config.js — every ChatGPT page selector and the default settings live here.
// When chatgpt.com changes its website, this is the only file that should need an update.
// Each selector is a list: the first one that matches on the page is used.

(function () {
  const MaskIN = (globalThis.MaskIN = globalThis.MaskIN || {});

  MaskIN.config = {
    selectors: {
      // The box where the user types. Logged-in ChatGPT uses a contenteditable div,
      // the logged-out page (checked Oct 2026) uses a plain <textarea name="prompt">.
      input: [
        "#prompt-textarea",
        'textarea[name="prompt"]',
        "form textarea",
        'form div[contenteditable="true"]',
        'div[contenteditable="true"]'
      ],
      // ChatGPT's Send button.
      send: [
        'button[data-testid="send-button"]',
        '[data-slot="composer-send-control"] button',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'form button[type="submit"]'
      ],
      // Where the Mask button is placed if the Send button is hidden (empty box shows a voice button).
      buttonAnchor: [
        'button[data-testid="send-button"]',
        '[data-slot="composer-send-control"]',
        'button[data-testid="composer-speech-button"]',
        '[data-slot="composer-dictation-control"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Voice"]',
        'button[aria-label*="dictation"]'
      ],
      // Messages. ChatGPT's newer page (checked Oct 2026) uses <li data-message-role="...">
      // inside <ol data-conversation-transcript>; the older page used data-message-author-role.
      assistantMessage: [
        '[data-message-role="assistant"]',
        '[data-message-author-role="assistant"]',
        'div[data-message-author-role="assistant"]',
        'article[data-testid*="conversation-turn"] .agent-turn',
        'div[class*="agent-turn"]',
        'article:not(:has([data-message-author-role="user"])) div.markdown',
        'article:not(:has([data-message-role="user"])) div.markdown',
        'div.markdown.prose:not([data-message-author-role="user"] *)',
        '[data-testid*="assistant"]'
      ],
      userMessage: ['[data-message-role="user"]', '[data-message-author-role="user"]', "[data-user-message-bubble]"],
      anyMessage: ["[data-message-role]", "[data-message-author-role]"],
      // An assistant reply that is still being written (the newer page adds
      // data-message-complete when a reply is done).
      replyInProgress: ['[data-message-role="assistant"]:not([data-message-complete])'],
      // Restore walks every text node in this area (first match wins, else the whole page).
      // The input box and MaskIN's own UI are always skipped.
      chatArea: ["[data-conversation-transcript]", "main", '[role="main"]', "#thread"],
      // The box a restored value belongs to: the badge is placed after it.
      // The nearest matching ancestor wins, so the inner markdown block is used when present.
      replyContainer: [
        ".markdown",
        '[class*="markdown"]',
        "[data-assistant-markdown-root]",
        "[data-user-message-bubble]",
        '[data-message-role="assistant"]',
        '[data-message-role="user"]',
        '[data-message-author-role="assistant"]',
        '[data-message-author-role="user"]',
        '[data-testid^="conversation-turn"]',
        "article"
      ],
      // Shown while ChatGPT is still writing a reply (we wait until it is gone).
      stopButton: [
        'button[data-testid="stop-button"]',
        'button[aria-label="Stop streaming"]',
        'button[aria-label*="Stop generating"]',
        'button[aria-label="Stop"]'
      ]
    },

    // Defaults for the settings shown in the side panel.
    defaults: {
      model: "gemma4:e4b",
      sendGuard: true,
      fakeStyle: "realistic" // "realistic" or "tags"
    },

    // The chat id from a ChatGPT URL path, or null if the chat has no real id yet.
    // A brand new chat first gets a temporary URL like /c/local-chatgpt%3A<uuid>
    // (seen Oct 2026); that counts as "no id yet", so the mapping stays under the
    // tab's pending key until the real /c/<id> arrives.
    chatIdFromPath(path) {
      // /c/<id> when logged in, /uc/<id> on the logged-out page.
      const m = /\/u?c\/([^/?#]+)/.exec(path || "");
      if (!m) return null;
      let id = m[1];
      try {
        id = decodeURIComponent(id);
      } catch (err) {}
      if (/^local-/i.test(id) || id.includes(":")) return null;
      return id;
    },

    models: ["gemma4:e4b", "gemma4:e2b"],

    ollamaUrl: "http://localhost:11434",
    chunkSize: 1500, // characters per Gemma request
    ollamaTimeoutMs: 60000, // per chunk
    statusTimeoutMs: 2000,
    replyQuietMs: 1500, // no Stop button: a reply is finished when its text has not changed for this long
    replyStuckMs: 8000, // Stop button still found: restore anyway after this long without changes
    pdfMaxPages: 20,
    ocrMaxPages: 10
  };

  if (typeof module !== "undefined") module.exports = MaskIN.config;
})();
