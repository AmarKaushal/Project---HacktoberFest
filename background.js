// background.js — the brain of MaskIN (an ES module service worker).
// Runs the detection pipeline (regex + local Gemma), merges results, builds fakes,
// reads and writes the per-chat mapping, reports Ollama status and handles the
// Option+Shift+M shortcut. It never sends data anywhere except localhost:11434 (via ollama.js).

// These files are plain scripts that fill globalThis.MaskIN (they have no exports),
// so the same files also work as content scripts and in the Node tests.
import "./config.js";
import "./detectors.js";
import "./names.js";
import "./fakes.js";
import "./storage.js";
import "./ollama.js";

const M = globalThis.MaskIN;

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Option+Shift+M: ask the ChatGPT tab to start masking.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "mask") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { action: "mask" }).catch(() => {});
});

// A closed tab's pending (not yet saved to a chat) mapping is no longer needed.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(M.storage.mapKey(null, tabId));
});

// ---------- Helpers ----------
const tabIdOf = (msg, sender) => (msg.tabId != null ? msg.tabId : sender.tab && sender.tab.id);
const keyOf = (msg, sender) => M.storage.mapKey(msg.chatId || null, tabIdOf(msg, sender));

async function getStatus() {
  const settings = await M.storage.getSettings();
  const st = await M.ollama.getStatus(settings.model);
  st.message = st.connected ? `Local AI: connected, ${settings.model}` : "Local AI offline: IDs and numbers only";
  return st;
}

// Gemma gives text only. Find every place that text appears in the full input.
function withPositions(text, aiItems) {
  const out = [];
  const seen = new Set();
  for (const it of aiItems) {
    if (seen.has(it.type + "|" + it.text)) continue;
    seen.add(it.type + "|" + it.text);
    for (const p of M.detectors.findAll(text, it.text)) {
      const actual = text.slice(p.start, p.end);
      out.push(Object.assign({}, it, p, { text: actual }));
    }
  }
  return out;
}

// Values masked earlier in this chat that appear again in the new text.
function earlierItems(text, entries) {
  const out = [];
  for (const e of entries) {
    for (const p of M.detectors.findAll(text, e.real)) {
      out.push({
        text: e.real,
        start: p.start,
        end: p.end,
        type: e.type === "NAME_PART" ? "NAME" : e.type,
        source: "memory",
        reason: "Masked earlier in this chat"
      });
    }
  }
  return out;
}

// ---------- The pipeline ----------
// text -> regex items + Gemma items (+ items masked earlier in this chat)
// -> merged, one row per distinct value -> fake for each value.
async function scan(msg, sender) {
  const text = msg.text || "";
  const settings = await M.storage.getSettings();
  const saved = await M.storage.getMap(keyOf(msg, sender));

  const regexItems = M.detectors.detectRegex(text);
  let aiItems = [];
  let status = { connected: false, message: "Quick check: IDs and numbers only" };
  let note = "";

  if (msg.mode !== "regex") {
    status = await getStatus();
    if (status.connected) {
      const tabId = sender.tab && sender.tab.id;
      const r = await M.ollama.findNamesAndAddresses(text, settings.model, (done, total) => {
        // Tell the ChatGPT tab how far the scan is (shown in its toast).
        if (tabId != null && total > 1) chrome.tabs.sendMessage(tabId, { action: "scanProgress", done, total }).catch(() => {});
      });
      aiItems = withPositions(text, r.items);
      if (r.skipped) note = `${r.skipped} of ${r.chunks} parts could not be checked by the local AI. ${r.error || ""}`.trim();
    }
  }

  const merged = M.detectors.mergeItems(regexItems.concat(earlierItems(text, saved.entries)), aiItems);

  // One row per distinct real value.
  const groups = [];
  const byReal = new Map();
  for (const it of merged) {
    if (byReal.has(it.text)) {
      byReal.get(it.text).count++;
      continue;
    }
    const g = { real: it.text, type: it.type, reason: it.reason, source: it.source, lang: it.lang, gender: it.gender, count: 1 };
    byReal.set(it.text, g);
    groups.push(g);
  }

  const session = M.fakes.createSession({
    text,
    existing: saved.entries,
    style: settings.fakeStyle,
    reals: groups.map((g) => g.real)
  });

  const items = groups.map((g, i) => {
    const r = session.fakeFor({ text: g.real, type: g.type, lang: g.lang, gender: g.gender });
    return Object.assign(g, { id: "item" + i, fake: r.fake, parts: r.parts });
  });

  return { items, status, note, aiUsed: aiItems.length > 0 || status.connected };
}

// A fake for an item the user typed into "+ Add item".
async function fakeFor(msg, sender) {
  const settings = await M.storage.getSettings();
  const saved = await M.storage.getMap(keyOf(msg, sender));
  const current = msg.current || [];
  const session = M.fakes.createSession({
    text: msg.fullText || "",
    existing: saved.entries.concat(current),
    style: settings.fakeStyle,
    reals: current.map((c) => c.real).concat([msg.text])
  });
  return session.fakeFor({ text: msg.text, type: msg.type || "CUSTOM" });
}

const log = (...args) => console.log("[MaskIN]", ...args);

// Loads a chat's mapping. If the chat key is empty but this tab still has a pending
// mapping (masked before ChatGPT gave the chat an id), move it to the chat first.
async function getMapping(msg, sender) {
  const key = keyOf(msg, sender);
  let map = await M.storage.getMap(key);
  let usedPending = false;
  if (msg.chatId && !map.entries.length) {
    const tabId = tabIdOf(msg, sender);
    const pendingKey = M.storage.mapKey(null, tabId);
    const pending = await M.storage.getMap(pendingKey);
    if (pending.entries.length) {
      await M.storage.migratePending(tabId, msg.chatId);
      map = await M.storage.getMap(key);
      usedPending = true;
      log(`load: ${key} was empty, used ${pendingKey} (${pending.entries.length} entries) and moved it`);
    }
  }
  const view = await M.storage.getView(key);
  log(`load: ${key} -> ${map.entries.length} entries, kept as fakes on screen: ${view.hidden.join(", ") || "none"}`);
  return { key, usedPending, entries: map.entries, updatedAt: map.updatedAt, hidden: view.hidden };
}

async function saveMapping(msg, sender) {
  const key = keyOf(msg, sender);
  const map = await M.storage.saveMap(key, msg.entries);
  log(`save: ${key} -> ${map.entries.length} entries`);
  return { key, entries: map.entries, updatedAt: map.updatedAt };
}

async function migratePending(msg, sender) {
  const tabId = tabIdOf(msg, sender);
  const from = M.storage.mapKey(null, tabId);
  const to = M.storage.mapKey(msg.chatId);
  const moved = await M.storage.migratePending(tabId, msg.chatId);
  log(`migrate: ${from} -> ${to}: ${moved ? "moved" : "nothing pending"}`);
  return { moved, from, to };
}

const HANDLERS = {
  scan,
  fakeFor,
  status: () => getStatus(),
  getSettings: () => M.storage.getSettings(),
  saveSettings: (msg) => M.storage.saveSettings(msg.settings),
  getMapping,
  saveMapping,
  migratePending,
  clear: async (msg, sender) => {
    if (msg.scope === "all") return { removed: await M.storage.clearAll() };
    await M.storage.clearChat(keyOf(msg, sender));
    return { removed: 1 };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = HANDLERS[msg && msg.action];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse, (err) => sendResponse({ error: String((err && err.message) || err) }));
  return true; // keep the channel open for the async answer
});
