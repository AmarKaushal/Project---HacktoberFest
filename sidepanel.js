// sidepanel.js — MaskIN's side panel: local AI status, settings, document input
// (PDF text with pdf.js, scans and photos with Tesseract.js OCR, all on this laptop),
// the masked items of the open chat, and the clear buttons.
// Loaded as a module after tesseract.min.js, config.js and storage.js.

import * as pdfjsLib from "./lib/pdfjs/pdf.min.mjs";

const M = globalThis.MaskIN;
const $ = (id) => document.getElementById(id);

const TYPES = {
  NAME: ["Name", "#2563eb"],
  NAME_PART: ["Name part", "#60a5fa"],
  ADDRESS: ["Address", "#0891b2"],
  AADHAAR: ["Aadhaar", "#dc2626"],
  PAN: ["PAN", "#ea580c"],
  IFSC: ["IFSC", "#a16207"],
  PHONE: ["Phone", "#16a34a"],
  EMAIL: ["Email", "#7c3aed"],
  UPI: ["UPI ID", "#db2777"],
  ACCOUNT: ["Bank account", "#9333ea"],
  PIN: ["PIN code", "#0d9488"],
  DOB: ["Date of birth", "#4f46e5"],
  CUSTOM: ["Added by you", "#6b7280"]
};

function chip(type) {
  const [label, color] = TYPES[type] || TYPES.CUSTOM;
  const el = document.createElement("span");
  el.className = "chip";
  el.style.background = color;
  el.textContent = label;
  return el;
}

function ask(msg) {
  return chrome.runtime.sendMessage(msg).then((res) => {
    if (res && res.error) throw new Error(res.error);
    return res;
  });
}

// The ChatGPT tab that is open in this window: { tabId, chatId } or null.
async function activeChat() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith("https://chatgpt.com")) return null;
  return { tabId: tab.id, chatId: M.config.chatIdFromPath(new URL(tab.url).pathname) };
}

// ---------- 1. Status ----------
async function refreshStatus() {
  const card = $("status-card");
  $("status-text").textContent = "Checking local AI...";
  card.className = "card";
  $("status-dot").className = "dot";
  let st;
  try {
    st = await ask({ action: "status" });
  } catch (err) {
    st = { connected: false, reason: err.message };
  }
  const on = st.connected;
  card.className = "card " + (on ? "on" : "off");
  $("status-dot").className = "dot " + (on ? "on" : "off");
  $("status-text").textContent = on ? `Local AI: connected · ${st.model}` : "Local AI offline · IDs and numbers only";
  const fix = $("status-fix");
  fix.hidden = on;
  fix.textContent = on
    ? ""
    : `How to fix: ${st.reason || ""} Open the Ollama app, check OLLAMA_ORIGINS is set to "chrome-extension://*" (then restart Ollama), and pull the model.`;
}

// ---------- 2. Settings ----------
async function loadSettings() {
  const s = await M.storage.getSettings();
  $("set-model").value = s.model;
  $("set-guard").checked = !!s.sendGuard;
  document.querySelectorAll('input[name="fake-style"]').forEach((r) => (r.checked = r.value === s.fakeStyle));
}

async function saveSettings() {
  const style = document.querySelector('input[name="fake-style"]:checked');
  await M.storage.saveSettings({
    model: $("set-model").value,
    sendGuard: $("set-guard").checked,
    fakeStyle: style ? style.value : "realistic"
  });
  const saved = $("set-saved");
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
}

// ---------- 3. Document (read on this laptop, never uploaded) ----------
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");

const doc = { text: "", items: [], status: null };

function progress(text, warn) {
  const p = $("doc-progress");
  p.hidden = !text;
  p.textContent = text || "";
  p.classList.toggle("warn", !!warn);
}

// Joins pdf.js text pieces into lines.
function pageText(content) {
  let out = "";
  let lastY = null;
  for (const it of content.items) {
    if (typeof it.str !== "string") continue;
    const y = it.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y;
  }
  return out;
}

let ocrWorker = null;

// Tesseract.js with English, Hindi and Marathi. Every file comes from lib/ inside the extension.
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  progress("Starting the OCR engine on your laptop (first time takes a few seconds)...");
  ocrWorker = await Tesseract.createWorker(["eng", "hin", "mar"], 1, {
    workerPath: chrome.runtime.getURL("lib/tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("lib/tesseract/core/"),
    langPath: chrome.runtime.getURL("lib/tesseract/lang"),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none"
  });
  return ocrWorker;
}

// OCR one image (canvas or file). A page counts as readable only with fair confidence and some text.
async function ocr(image) {
  const worker = await getOcr();
  const { data } = await worker.recognize(image);
  const text = (data.text || "").trim();
  const readable = (data.confidence || 0) >= 40 && text.replace(/\s/g, "").length >= 20;
  return { text, readable };
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({
    data,
    wasmUrl: chrome.runtime.getURL("lib/pdfjs/wasm/"),
    isEvalSupported: false
  }).promise;
  const maxText = Math.min(pdf.numPages, M.config.pdfMaxPages);
  const pages = [];
  for (let i = 1; i <= maxText; i++) {
    progress(`Reading page ${i} of ${maxText}...`);
    const page = await pdf.getPage(i);
    pages.push(pageText(await page.getTextContent()));
  }
  let note = pdf.numPages > maxText ? `Only the first ${maxText} pages were read.` : "";

  // Draws one page as an image and reads it with OCR.
  async function ocrPage(i) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
    return ocr(canvas);
  }

  const allText = pages.join("");
  if (allText.replace(/\s/g, "").length < 30 * maxText) {
    // Almost no text: this is a scan. OCR every page (up to the limit).
    const maxScan = Math.min(pdf.numPages, M.config.ocrMaxPages);
    note = pdf.numPages > maxScan ? `Only the first ${maxScan} scanned pages were read.` : "";
    const parts = [];
    let readable = 0;
    for (let i = 1; i <= maxScan; i++) {
      progress(`Reading scanned page ${i} of ${maxScan} on your laptop...`);
      const r = await ocrPage(i);
      if (r.readable) readable++;
      parts.push(r.text);
    }
    if (!readable) return { text: "", unreadable: true };
    return { text: parts.join("\n\n"), note };
  }

  // The text layer of many PDFs drops Devanagari vowel signs (शर्मा becomes शमा),
  // so pages with Devanagari are read again with OCR, which handles them well.
  const devaPages = pages.map((t, i) => (/[ऀ-ॿ]/.test(t) ? i : -1)).filter((i) => i >= 0).slice(0, M.config.ocrMaxPages);
  for (let k = 0; k < devaPages.length; k++) {
    const i = devaPages[k];
    progress(`Reading Hindi/Marathi page ${k + 1} of ${devaPages.length} with OCR on your laptop...`);
    const r = await ocrPage(i + 1);
    if (r.readable) pages[i] = r.text;
  }
  return { text: pages.join("\n\n"), note };
}

async function readImage(file) {
  progress("Reading the photo on your laptop...");
  const r = await ocr(file);
  if (!r.readable) return { text: "", unreadable: true };
  return { text: r.text, note: "" };
}

async function handleFile(file) {
  if (!file) return;
  $("doc-review").hidden = true;
  $("doc-insert-msg").textContent = "";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
  if (!isPdf && !isImage) {
    progress("Please choose a PDF, JPG or PNG file.", true);
    return;
  }
  try {
    const res = isPdf ? await readPdf(file) : await readImage(file);
    if (res.unreadable || !res.text.trim()) {
      progress("Could not read this clearly. Try a sharper photo.", true);
      return;
    }
    doc.text = res.text.replace(/\n{3,}/g, "\n\n").trim();
    progress("Looking for private details on your laptop...");
    const chat = await activeChat();
    const scan = await ask({ action: "scan", text: doc.text, chatId: chat && chat.chatId, tabId: chat && chat.tabId });
    doc.items = scan.items.map((i) => Object.assign({ on: true }, i));
    doc.status = scan.status;
    progress(`Read ${doc.text.length.toLocaleString("en-IN")} characters from ${file.name}. ${res.note || ""}`.trim());
    $("doc-status").textContent = scan.status.message + (scan.note ? " " + scan.note : "");
    renderDocItems();
    $("doc-review").hidden = false;
  } catch (err) {
    progress("Could not read this file: " + err.message, true);
  }
}

function renderDocItems() {
  const box = $("doc-items");
  box.textContent = "";
  const n = doc.items.length;
  $("doc-title").textContent = n ? `MaskIN found ${n} private detail${n === 1 ? "" : "s"}` : "No private details found";
  const order = Object.keys(TYPES);
  const types = [...new Set(doc.items.map((i) => i.type))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const t of types) {
    box.appendChild(chip(t));
    for (const it of doc.items.filter((i) => i.type === t)) {
      const row = document.createElement("label");
      row.className = "item" + (it.on ? "" : " off");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = it.on;
      cb.addEventListener("change", () => {
        it.on = cb.checked;
        row.classList.toggle("off", !it.on);
      });
      const body = document.createElement("div");
      const vals = document.createElement("div");
      vals.className = "vals";
      const real = document.createElement("span");
      real.className = "real";
      real.textContent = it.real;
      const fake = document.createElement("span");
      fake.className = "fake";
      fake.textContent = it.fake;
      vals.append(real, " → ", fake);
      const reason = document.createElement("div");
      reason.className = "reason";
      reason.textContent = it.reason + (it.count > 1 ? ` · appears ${it.count} times` : "");
      body.append(vals, reason);
      row.append(cb, body);
      box.appendChild(row);
    }
  }
}

async function addDocItem() {
  const input = $("doc-add-input");
  const msg = $("doc-add-msg");
  const word = input.value.trim();
  msg.textContent = "";
  if (!word) return;
  if (!doc.text.includes(word)) {
    msg.textContent = "That text is not in the document.";
    return;
  }
  if (doc.items.some((i) => i.real === word)) {
    msg.textContent = "Already in the list.";
    return;
  }
  const chat = await activeChat();
  try {
    const r = await ask({
      action: "fakeFor",
      text: word,
      type: "CUSTOM",
      chatId: chat && chat.chatId,
      tabId: chat && chat.tabId,
      fullText: doc.text,
      current: doc.items.map((i) => ({ real: i.real, fake: i.fake, type: i.type }))
    });
    doc.items.push({ id: "custom" + doc.items.length, type: "CUSTOM", real: word, fake: r.fake, parts: r.parts || [], reason: "Added by you", count: 1, on: true });
    input.value = "";
    renderDocItems();
  } catch (err) {
    msg.textContent = "Could not add: " + err.message;
  }
}

// Sends the document and the ticked items to the ChatGPT tab, which masks it,
// puts it in the message box and saves the mapping (same as Apply mask).
async function insertDoc() {
  const msg = $("doc-insert-msg");
  const chat = await activeChat();
  if (!chat) {
    msg.textContent = "Open chatgpt.com in this window first.";
    return;
  }
  try {
    const items = doc.items.filter((i) => i.on).map((i) => ({ type: i.type, real: i.real, fake: i.fake, parts: i.parts }));
    const res = await chrome.tabs.sendMessage(chat.tabId, { action: "insertMasked", text: doc.text, items });
    if (res && res.ok) msg.textContent = `Done. ${res.count} detail${res.count === 1 ? "" : "s"} masked. Type your question and press Send.`;
    else msg.textContent = (res && res.error) || "Could not put the text into ChatGPT. Refresh the ChatGPT tab and try again.";
  } catch (err) {
    msg.textContent = "Could not reach the ChatGPT tab. Refresh it and try again.";
  }
}

const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  handleFile(e.dataTransfer.files[0]);
});
$("file").addEventListener("change", (e) => {
  handleFile(e.target.files[0]);
  e.target.value = "";
});
$("doc-add").addEventListener("click", addDocItem);
$("doc-add-input").addEventListener("keydown", (e) => e.key === "Enter" && addDocItem());
$("doc-insert").addEventListener("click", insertDoc);

// ---------- 4. This chat ----------
async function refreshChat() {
  const list = $("chat-list");
  const where = $("chat-where");
  list.textContent = "";
  const chat = await activeChat();
  if (!chat) {
    where.textContent = "Open a chat on chatgpt.com to see what was masked in it.";
    $("view-card").hidden = true;
    return;
  }
  let key = M.storage.mapKey(chat.chatId, chat.tabId);
  let map = await M.storage.getMap(key);
  // Masked before ChatGPT gave the chat an id: the mapping may still be under the tab's pending key.
  if (chat.chatId && !map.entries.length) {
    key = M.storage.mapKey(null, chat.tabId);
    map = await M.storage.getMap(key);
  }
  await renderView(key, map.entries);
  const entries = map.entries.filter((e) => e.type !== "NAME_PART");
  where.textContent = entries.length
    ? `${entries.length} masked item${entries.length === 1 ? "" : "s"} in ${chat.chatId ? "this chat" : "this new chat"}.`
    : "Nothing masked in this chat yet.";
  for (const e of entries) {
    const li = document.createElement("li");
    const fake = document.createElement("span");
    fake.textContent = e.fake;
    const real = document.createElement("span");
    real.className = "realv";
    real.textContent = "Real: " + e.real;
    real.hidden = true;
    const show = document.createElement("button");
    show.className = "show";
    show.textContent = "show";
    show.addEventListener("click", () => {
      real.hidden = !real.hidden;
      show.textContent = real.hidden ? "show" : "hide";
    });
    li.append(chip(e.type), fake, show, real);
    list.appendChild(li);
  }
}

// ---------- 4b. Show real values on screen (per-chat filter) ----------
const VIEW_TYPES = [
  ["NAME", "Name"], ["ADDRESS", "Address"], ["PHONE", "Phone"], ["AADHAAR", "Aadhaar"], ["PAN", "PAN"],
  ["IFSC", "IFSC"], ["EMAIL", "Email"], ["UPI", "UPI"], ["ACCOUNT", "Account"], ["PIN", "PIN"],
  ["DOB", "DOB"], ["CUSTOM", "Custom"]
];

// One tick box per type found in this chat, plus "All". Ticked = real value on screen.
async function renderView(key, entries) {
  const card = $("view-card");
  const box = $("view-list");
  const present = new Set(entries.map((e) => (e.type === "NAME_PART" ? "NAME" : e.type)));
  const types = VIEW_TYPES.filter(([t]) => present.has(t));
  card.hidden = !types.length;
  box.textContent = "";
  if (!types.length) return;
  const hidden = new Set((await M.storage.getView(key)).hidden);

  const save = () => M.storage.saveView(key, [...hidden]);
  const all = document.createElement("input");
  all.type = "checkbox";
  const boxes = [];
  const syncAll = () => {
    const shown = types.filter(([t]) => !hidden.has(t)).length;
    all.checked = shown === types.length;
    all.indeterminate = shown > 0 && shown < types.length;
  };
  all.addEventListener("change", () => {
    for (const [t] of types) all.checked ? hidden.delete(t) : hidden.add(t);
    boxes.forEach((b) => (b.checked = all.checked));
    syncAll();
    save();
  });
  const allLabel = document.createElement("label");
  allLabel.className = "all";
  allLabel.append(all, "All");
  box.appendChild(allLabel);

  for (const [t, label] of types) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !hidden.has(t);
    cb.addEventListener("change", () => {
      cb.checked ? hidden.delete(t) : hidden.add(t);
      syncAll();
      save();
    });
    boxes.push(cb);
    const l = document.createElement("label");
    l.append(cb, label);
    box.appendChild(l);
  }
  syncAll();
}

// Asks the ChatGPT tab to restore every message of the open chat right now.
async function restoreNow() {
  const out = $("restore-msg");
  const chat = await activeChat();
  if (!chat) {
    out.textContent = "Open a chat on chatgpt.com first.";
    return;
  }
  out.textContent = "Restoring...";
  try {
    const r = await chrome.tabs.sendMessage(chat.tabId, { action: "restoreNow" });
    if (!r || r.error) throw new Error((r && r.error) || "no answer");
    out.textContent =
      `${r.replaced} value${r.replaced === 1 ? "" : "s"} restored now, ${r.total} on the page, ` +
      `${r.replies} reply box${r.replies === 1 ? "" : "es"} with a badge. ` +
      `Mapping: ${r.entries} entries from ${r.key || "nowhere"}.`;
  } catch (err) {
    out.textContent = "Could not reach the ChatGPT tab. Refresh it and try again.";
  }
}

// ---------- 5. Clear (with a confirm step) ----------
let pendingClear = null;

function askConfirm(kind) {
  pendingClear = kind;
  $("confirm-text").textContent =
    kind === "all"
      ? "Delete every saved mapping and your settings? Restored replies will show fakes after a refresh."
      : "Delete the saved mapping for this chat?";
  $("confirm").hidden = false;
  $("clear-msg").textContent = "";
}

async function doClear() {
  const kind = pendingClear;
  $("confirm").hidden = true;
  pendingClear = null;
  if (kind === "all") {
    const n = await M.storage.clearAll();
    $("clear-msg").textContent = `Cleared ${n} saved item${n === 1 ? "" : "s"}.`;
    await loadSettings();
  } else {
    const chat = await activeChat();
    if (!chat) {
      $("clear-msg").textContent = "Open a chat on chatgpt.com first.";
      return;
    }
    await M.storage.clearChat(M.storage.mapKey(chat.chatId, chat.tabId));
    $("clear-msg").textContent = "This chat's mapping was deleted.";
  }
  refreshChat();
}

// ---------- Start ----------
$("status-refresh").addEventListener("click", refreshStatus);
$("set-model").addEventListener("change", async () => {
  await saveSettings();
  refreshStatus();
});
$("set-guard").addEventListener("change", saveSettings);
document.querySelectorAll('input[name="fake-style"]').forEach((r) => r.addEventListener("change", saveSettings));
$("restore-now").addEventListener("click", restoreNow);
$("clear-chat").addEventListener("click", () => askConfirm("chat"));
$("clear-all").addEventListener("click", () => askConfirm("all"));
$("confirm-yes").addEventListener("click", doClear);
$("confirm-no").addEventListener("click", () => {
  $("confirm").hidden = true;
  pendingClear = null;
});

chrome.tabs.onActivated.addListener(refreshChat);
chrome.tabs.onUpdated.addListener((tabId, info) => info.url && refreshChat());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k.startsWith("maskin:map:"))) refreshChat();
});

loadSettings();
refreshStatus();
refreshChat();
