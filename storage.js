// storage.js — reads and writes MaskIN data in chrome.storage.local (never sync).
// One mapping per chat:   "maskin:map:<chatId>"      -> { entries: [{ real, fake, type }], updatedAt }
// A new chat with no id:  "maskin:map:pending:<tabId>" (moved to the real key once ChatGPT gives an id)
// Settings:               "maskin:settings"          -> { model, sendGuard, fakeStyle }
// On-screen filter:       "maskin:view:<chatId>"     -> { hidden: ["PHONE", ...] } (types kept as fakes on screen)
// Used by the background worker and the side panel.

(function () {
  const MaskIN = (globalThis.MaskIN = globalThis.MaskIN || {});
  const MAP_PREFIX = "maskin:map:";
  const SETTINGS_KEY = "maskin:settings";
  const LAST_ACTIVE_KEY = "maskin:last_active_map";

  // The storage key for a chat. Without a chat id we use the tab's pending key.
  function mapKey(chatId, tabId) {
    return chatId ? MAP_PREFIX + chatId : MAP_PREFIX + "pending:" + tabId;
  }

  // The filter key that belongs to a mapping key ("maskin:map:abc" -> "maskin:view:abc").
  function viewKey(mapKeyValue) {
    return mapKeyValue.replace(MAP_PREFIX, "maskin:view:");
  }

  // Types the user chose to keep as fakes on screen for this chat. Default: none (all real).
  async function getView(mapKeyValue) {
    const key = viewKey(mapKeyValue);
    const got = await chrome.storage.local.get(key);
    return { hidden: (got[key] && got[key].hidden) || [] };
  }

  async function saveView(mapKeyValue, hidden) {
    await chrome.storage.local.set({ [viewKey(mapKeyValue)]: { hidden: hidden || [], updatedAt: Date.now() } });
  }

  async function getMap(key) {
    const got = await chrome.storage.local.get(key);
    return got[key] || { entries: [], updatedAt: 0 };
  }

  // Adds new entries to a chat's mapping. An existing real value keeps its fake,
  // and a fake that is already used for another real value is never added twice.
  async function saveMap(key, newEntries) {
    const current = await getMap(key);
    const entries = current.entries.slice();
    const reals = new Set(entries.map((e) => e.real));
    const fakes = new Set(entries.map((e) => e.fake));
    for (const e of newEntries || []) {
      if (!e || !e.real || !e.fake || reals.has(e.real) || fakes.has(e.fake)) continue;
      entries.push({ real: e.real, fake: e.fake, type: e.type || "CUSTOM" });
      reals.add(e.real);
      fakes.add(e.fake);
    }
    const value = { entries, updatedAt: Date.now() };
    await chrome.storage.local.set({ [key]: value });
    await saveLastActiveMap(value.entries);
    return value;
  }

  async function getLastActiveMap() {
    const got = await chrome.storage.local.get(LAST_ACTIVE_KEY);
    return got[LAST_ACTIVE_KEY] || { entries: [], updatedAt: 0 };
  }

  async function saveLastActiveMap(newEntries) {
    const current = await getLastActiveMap();
    const entries = current.entries.slice();
    const reals = new Set(entries.map((e) => e.real));
    const fakes = new Set(entries.map((e) => e.fake));
    for (const e of newEntries || []) {
      if (!e || !e.real || !e.fake || reals.has(e.real) || fakes.has(e.fake)) continue;
      entries.push({ real: e.real, fake: e.fake, type: e.type || "CUSTOM" });
      reals.add(e.real);
      fakes.add(e.fake);
    }
    const value = { entries, updatedAt: Date.now() };
    await chrome.storage.local.set({ [LAST_ACTIVE_KEY]: value });
    return value;
  }

  // A new chat just got its id: move the tab's pending mapping to the chat's key.
  async function migratePending(tabId, chatId) {
    const pendingKey = mapKey(null, tabId);
    const pending = await getMap(pendingKey);
    if (!pending.entries.length) return false;
    await saveMap(mapKey(chatId), pending.entries);
    // The on-screen filter chosen before the chat had an id moves with it.
    const view = await getView(pendingKey);
    if (view.hidden.length) await saveView(mapKey(chatId), view.hidden);
    await chrome.storage.local.remove([pendingKey, viewKey(pendingKey)]);
    return true;
  }

  async function clearChat(key) {
    await chrome.storage.local.remove([key, viewKey(key)]);
  }

  // Deletes every key MaskIN has written (mappings and settings).
  async function clearAll() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("maskin:"));
    if (keys.length) await chrome.storage.local.remove(keys);
    return keys.length;
  }

  async function getSettings() {
    const got = await chrome.storage.local.get(SETTINGS_KEY);
    return Object.assign({}, MaskIN.config.defaults, got[SETTINGS_KEY] || {});
  }

  async function saveSettings(changes) {
    const next = Object.assign(await getSettings(), changes || {});
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  MaskIN.storage = {
    MAP_PREFIX,
    SETTINGS_KEY,
    LAST_ACTIVE_KEY,
    mapKey,
    viewKey,
    getView,
    saveView,
    getMap,
    saveMap,
    getLastActiveMap,
    saveLastActiveMap,
    migratePending,
    clearChat,
    clearAll,
    getSettings,
    saveSettings
  };

  if (typeof module !== "undefined") module.exports = MaskIN.storage;
})();
