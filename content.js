// content.js — runs inside chatgpt.com.
// Adds the Mask button next to Send, shows the Review popup, swaps private
// details for fakes in the input box and saves the mapping for this chat.
// All popups and toasts live in a Shadow DOM so ChatGPT's CSS and ours never mix.
// Needs config.js, detectors.js, names.js and fakes.js (loaded before it by the manifest).

(function () {
  if (globalThis.__maskinLoaded) return;
  globalThis.__maskinLoaded = true;

  const M = globalThis.MaskIN;
  const SEL = M.config.selectors;

  const state = {
    settings: Object.assign({}, M.config.defaults),
    entries: [], // mapping { real, fake, type } for the chat that is open
    path: location.pathname,
    chatId: chatIdFromPath(location.pathname),
    lastMasked: null, // the masked text we put in the box (Send guard lets it through)
    pendingMasked: false, // masked in a brand new chat that has no id yet
    mapKey: null, // storage key of the mapping in use (for logs and the side panel)
    bypassOnce: false, // "Send anyway" was clicked
    busy: false
  };

  // ---------- Small helpers ----------
  // Debug lines in the page console. Real values are never logged, only counts, keys and fakes.
  const log = (...args) => console.log("[MaskIN]", ...args);

  function findEl(list, root) {
    for (const s of list) {
      const el = (root || document).querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function chatIdFromPath(path) {
    return M.config.chatIdFromPath(path);
  }

  // Makes two texts comparable even if line breaks or spaces changed a little.
  function norm(s) {
    return (s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  }

  // Builds a DOM element: h("div", { class: "x" }, "text", childEl). Text is never parsed as HTML.
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  // Talks to background.js. Shows a clear message if the extension was reloaded.
  async function ask(msg) {
    try {
      const res = await chrome.runtime.sendMessage(msg);
      if (res === undefined) throw new Error("no answer from MaskIN's background worker");
      if (res && res.error) throw new Error(res.error);
      return res;
    } catch (err) {
      if (/context invalidated|Receiving end/i.test(String(err && err.message))) {
        toast("MaskIN was updated. Please refresh this tab.", "warn");
      }
      throw err;
    }
  }

  const TYPES = {
    NAME: { label: "Name", plural: "names", color: "#2563eb" },
    ADDRESS: { label: "Address", plural: "addresses", color: "#0891b2" },
    AADHAAR: { label: "Aadhaar", plural: "Aadhaar numbers", one: "Aadhaar", color: "#dc2626" },
    PAN: { label: "PAN", plural: "PAN numbers", color: "#ea580c" },
    IFSC: { label: "IFSC", plural: "IFSC codes", color: "#a16207" },
    PHONE: { label: "Phone", plural: "phone numbers", one: "phone number", color: "#16a34a" },
    EMAIL: { label: "Email", plural: "emails", color: "#7c3aed" },
    UPI: { label: "UPI ID", plural: "UPI IDs", color: "#db2777" },
    ACCOUNT: { label: "Bank account", plural: "bank account numbers", one: "bank account number", color: "#9333ea" },
    PIN: { label: "PIN code", plural: "PIN codes", color: "#0d9488" },
    DOB: { label: "Date of birth", plural: "dates of birth", color: "#4f46e5" },
    CUSTOM: { label: "Added by you", plural: "custom items", color: "#6b7280" }
  };
  const typeInfo = (t) => TYPES[t] || TYPES.CUSTOM;

  // "1 Aadhaar, 2 phone numbers"
  function summarise(items) {
    const counts = {};
    for (const it of items) counts[it.type] = (counts[it.type] || 0) + 1;
    return Object.entries(counts)
      .map(([t, n]) => `${n} ${n === 1 ? typeInfo(t).one || typeInfo(t).label : typeInfo(t).plural}`)
      .join(", ");
  }

  // ---------- ChatGPT's input box ----------
  const getInput = () => findEl(SEL.input);

  function readInput(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value;
    // ChatGPT's editor keeps one <p> per line. Only use that shape if every child is a <p>.
    const kids = Array.from(el.childNodes).filter((n) => !(n.nodeType === 3 && !n.nodeValue.trim()));
    if (kids.length && kids.every((n) => n.nodeName === "P")) {
      return kids.map((p) => p.innerText.replace(/\n$/, "")).join("\n");
    }
    return el.innerText;
  }

  function selectAllIn(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Replaces the whole input with `text` in a way ChatGPT notices (so Send uses the new text).
  // 1) execCommand("insertText")  2) a paste event  3) set the text and fire an input event.
  function writeInput(el, text) {
    const ok = () => norm(readInput(getInput() || el)) === norm(text);
    el.focus();

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.select();
      try {
        document.execCommand("insertText", false, text);
      } catch (err) {}
      if (!ok()) {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return ok();
    }

    selectAllIn(el);
    try {
      document.execCommand("insertText", false, text);
    } catch (err) {}
    if (ok()) return true;

    selectAllIn(el);
    try {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    } catch (err) {}
    if (ok()) return true;

    el.innerText = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return ok();
  }

  // ---------- Shadow DOM root for popups, toasts ----------
  let ui = null;

  const UI_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .toast { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; max-width: 360px;
      background: #111827; color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    .toast.warn { background: #92400e; }
    .toast.ok { background: #065f46; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #fff; color: #111827; width: 640px; max-width: 100%; max-height: 85vh; display: flex;
      flex-direction: column; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden; }
    .head { padding: 18px 20px 10px; }
    .title { font-size: 18px; font-weight: 700; margin: 0; }
    .sub { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .body { padding: 4px 20px 12px; overflow-y: auto; flex: 1; }
    .group { margin-top: 12px; }
    .chip { display: inline-block; color: #fff; font-size: 12px; font-weight: 600; padding: 2px 10px;
      border-radius: 999px; margin-bottom: 6px; }
    .row { display: grid; grid-template-columns: 22px 1fr; gap: 8px; padding: 8px 6px; border-radius: 8px; align-items: start; }
    .row:hover { background: #f3f4f6; }
    .row input { margin-top: 3px; width: 16px; height: 16px; cursor: pointer; }
    .vals { font-size: 14px; word-break: break-word; white-space: pre-wrap; }
    .real { font-weight: 600; }
    .arrow { color: #9ca3af; margin: 0 6px; }
    .fake { color: #6d28d9; }
    .reason { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .row.off .vals { opacity: .45; text-decoration: line-through; }
    .add { display: flex; gap: 8px; margin-top: 14px; }
    .add input { flex: 1; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; color: #111827; background: #fff; }
    .add-msg { font-size: 12px; color: #b45309; min-height: 16px; margin-top: 4px; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
    .status { flex: 1; font-size: 12px; display: flex; align-items: center; gap: 6px; color: #374151; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; flex-shrink: 0; }
    .dot.off { background: #d97706; }
    button { font-size: 14px; padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff;
      color: #111827; cursor: pointer; font-weight: 600; }
    button:hover { background: #f3f4f6; }
    button.primary { background: #6d28d9; border-color: #6d28d9; color: #fff; }
    button.primary:hover { background: #5b21b6; }
    .empty { padding: 24px 0; text-align: center; color: #374151; font-size: 15px; }
  `;

  function getUi() {
    if (ui && ui.host.isConnected) return ui;
    const host = h("div", { id: "maskin-ui-root" });
    const root = host.attachShadow({ mode: "open" });
    root.appendChild(h("style", {}, UI_CSS));
    document.documentElement.appendChild(host);
    ui = { host, root, toast: null, modal: null };
    return ui;
  }

  let toastTimer = null;
  // Shows a small message bottom-right. ms = 0 keeps it until replaced.
  function toast(text, kind, ms) {
    const u = getUi();
    if (u.toast) u.toast.remove();
    clearTimeout(toastTimer);
    u.toast = h("div", { class: "toast " + (kind || ""), role: "status" }, text);
    u.root.appendChild(u.toast);
    if (ms !== 0) toastTimer = setTimeout(hideToast, ms || 4000);
  }

  function hideToast() {
    if (ui && ui.toast) ui.toast.remove();
    if (ui) ui.toast = null;
  }

  function closeModal() {
    if (ui && ui.modal) ui.modal.remove();
    if (ui) ui.modal = null;
    document.removeEventListener("keydown", onModalKey, true);
  }

  function onModalKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    }
  }

  function openModal(card) {
    closeModal();
    const u = getUi();
    u.modal = h("div", { class: "overlay", onclick: (e) => e.target === u.modal && closeModal() }, card);
    u.root.appendChild(u.modal);
    document.addEventListener("keydown", onModalKey, true);
  }

  function statusLine(status) {
    const on = status && status.connected;
    return h("div", { class: "status" }, h("span", { class: "dot" + (on ? "" : " off") }), status ? status.message : "");
  }

  // ---------- Review popup ----------
  // items: [{ id, type, real, fake, parts, reason, source, count }]
  function showReview(text, res) {
    const items = res.items.map((it) => Object.assign({ on: true }, it));
    const title = h("p", { class: "title" });
    const list = h("div");

    if (!items.length) {
      openModal(
        h("div", { class: "card", role: "dialog", "aria-label": "MaskIN review" },
          h("div", { class: "head" }, h("p", { class: "title" }, "No private details found")),
          h("div", { class: "body" },
            h("div", { class: "empty" }, "MaskIN did not find names, addresses, IDs or account numbers in this text."),
            addBox()
          ),
          h("div", { class: "foot" }, statusLine(res.status), h("button", { class: "primary", onclick: closeModal }, "Close"))
        )
      );
      return;
    }

    const setTitle = () => (title.textContent = `MaskIN found ${items.length} private detail${items.length === 1 ? "" : "s"}`);

    function render() {
      setTitle();
      list.textContent = "";
      const order = Object.keys(TYPES);
      const types = [...new Set(items.map((i) => i.type))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      for (const t of types) {
        const info = typeInfo(t);
        const group = h("div", { class: "group" }, h("span", { class: "chip", style: `background:${info.color}` }, info.label));
        for (const it of items.filter((i) => i.type === t)) {
          const box = h("input", { type: "checkbox", "aria-label": "Mask " + it.real });
          box.checked = it.on;
          const row = h("label", { class: "row" + (it.on ? "" : " off") }, box,
            h("div", {},
              h("div", { class: "vals" }, h("span", { class: "real" }, it.real), h("span", { class: "arrow" }, "→"), h("span", { class: "fake" }, it.fake)),
              h("div", { class: "reason" }, it.reason + (it.count > 1 ? ` · appears ${it.count} times` : ""))
            )
          );
          box.addEventListener("change", () => {
            it.on = box.checked;
            row.classList.toggle("off", !it.on);
          });
          group.appendChild(row);
        }
        list.appendChild(group);
      }
    }

    // "+ Add item": the word must be in the text; it becomes a CUSTOM item.
    function addBox() {
      const input = h("input", { type: "text", placeholder: "Missed something? Type a word or phrase from your text" });
      const msg = h("div", { class: "add-msg" });
      const add = async () => {
        const word = input.value.trim();
        msg.textContent = "";
        if (!word) return;
        const current = readInput(getInput()) || text;
        if (!current.includes(word)) {
          msg.textContent = "That text is not in your message.";
          return;
        }
        if (items.some((i) => i.real === word)) {
          msg.textContent = "Already in the list.";
          return;
        }
        try {
          const r = await ask({
            action: "fakeFor",
            text: word,
            type: "CUSTOM",
            chatId: state.chatId,
            fullText: current,
            current: items.map((i) => ({ real: i.real, fake: i.fake, type: i.type }))
          });
          items.push({ id: "custom" + items.length, type: "CUSTOM", real: word, fake: r.fake, parts: r.parts || [], reason: "Added by you", count: 1, on: true });
          input.value = "";
          if (list.isConnected) render();
          else showReview(text, Object.assign({}, res, { items }));
        } catch (err) {
          msg.textContent = "Could not add: " + err.message;
        }
      };
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          add();
        }
      });
      return h("div", {}, h("div", { class: "add" }, input, h("button", { onclick: add }, "+ Add item")), msg);
    }

    render();
    openModal(
      h("div", { class: "card", role: "dialog", "aria-label": "MaskIN review" },
        h("div", { class: "head" }, title,
          h("div", { class: "sub" }, "Untick anything you want to keep. Nothing is sent until you press Send." + (res.note ? " " + res.note : ""))),
        h("div", { class: "body" }, list, addBox()),
        h("div", { class: "foot" }, statusLine(res.status),
          h("button", { onclick: closeModal }, "Cancel"),
          h("button", { class: "primary", onclick: () => applyItems(items) }, "Apply mask"))
      )
    );
  }

  // ---------- Applying the mask ----------
  function entriesFor(items) {
    const entries = [];
    for (const it of items) {
      if (it.on === false) continue;
      entries.push({ real: it.real, fake: it.fake, type: it.type });
      for (const p of it.parts || []) entries.push(p);
    }
    return entries;
  }

  // Swaps the ticked items in the input box and saves the mapping for this chat.
  async function applyItems(items, sourceText) {
    closeModal();
    const chosen = items.filter((i) => i.on !== false);
    const el = getInput();
    if (!el) {
      toast("Could not find ChatGPT's message box.", "warn");
      return { ok: false };
    }
    if (!chosen.length) {
      toast("Nothing was masked.");
      return { ok: true, count: 0 };
    }
    const entries = entriesFor(chosen);
    const original = sourceText != null ? sourceText : readInput(el);
    const masked = M.fakes.applyMask(original, entries).text;

    if (!writeInput(el, masked)) {
      toast("Could not update the message box. Please try again.", "warn");
      return { ok: false };
    }
    state.lastMasked = norm(masked);
    if (!state.chatId) state.pendingMasked = true;

    // Merge entries locally immediately
    const mergedEntries = state.entries.slice();
    const reals = new Set(mergedEntries.map((e) => e.real));
    for (const e of entries) {
      if (!reals.has(e.real)) {
        mergedEntries.push(e);
        reals.add(e.real);
      }
    }
    setEntries(mergedEntries);

    try {
      const saved = await ask({ action: "saveMapping", chatId: state.chatId, entries });
      state.mapKey = saved.key;
      log(`mapping saved under ${saved.key}: ${saved.entries.length} entries (${entries.length} new from this mask)`);
      setEntries(saved.entries);
    } catch (err) {
      setEntries(state.entries.concat(entries));
    }
    toast(`${chosen.length} detail${chosen.length === 1 ? "" : "s"} masked. Nothing has been sent yet.`, "ok");
    return { ok: true, count: chosen.length };
  }

  // Mask button / Option+Shift+M: scan the box and open the Review popup.
  async function runMask() {
    if (state.busy) return;
    const el = getInput();
    const text = readInput(el);
    if (!el || !text.trim()) {
      toast("Type or paste something into ChatGPT first.");
      return;
    }
    state.busy = true;
    setButtonBusy(true);
    toast("Scanning on your laptop...", "", 0);
    try {
      const res = await ask({ action: "scan", text, chatId: state.chatId });
      hideToast();
      showReview(text, res);
    } catch (err) {
      toast("MaskIN could not scan: " + err.message, "warn");
    } finally {
      state.busy = false;
      setButtonBusy(false);
    }
  }

  // Side panel: put a masked document into the box.
  async function insertMasked(msg) {
    const items = (msg.items || []).map((i) => Object.assign({ on: true }, i));
    return applyItems(items, msg.text || "");
  }

  // ---------- Mask buttons in Prompt Section ----------
  const MASK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12c0-3 2.5-5 5-5 2 0 3 1 5 1s3-1 5-1c2.5 0 5 2 5 5s-2 5-4.5 5c-2 0-3.5-2-5.5-2s-3.5 2-5.5 2C4 17 2 15 2 12z"/><circle cx="7.5" cy="11.5" r="1.3"/><circle cx="16.5" cy="11.5" r="1.3"/></svg>';

  const PDF_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = "maskin-mask-btn";
    btn.type = "button"; // never submits ChatGPT's form
    btn.title = "Mask private details in prompt (Option+Shift+M)";
    btn.insertAdjacentHTML("afterbegin", MASK_ICON);
    btn.appendChild(document.createTextNode("Mask"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runMask();
    });
    return btn;
  }

  async function handlePdfFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast("Please choose a PDF file.", "warn");
      return;
    }
    if (state.busy) return;
    state.busy = true;
    setButtonBusy(true);
    toast(`Reading PDF "${file.name}" locally on your laptop...`, "", 0);

    try {
      let pdfText = "";
      try {
        const pdfjsLib = await import(chrome.runtime.getURL("lib/pdfjs/pdf.min.mjs"));
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({
          data,
          wasmUrl: chrome.runtime.getURL("lib/pdfjs/wasm/"),
          isEvalSupported: false
        }).promise;
        const maxPages = Math.min(pdf.numPages, (M.config && M.config.pdfMaxPages) || 20);
        const pages = [];
        for (let i = 1; i <= maxPages; i++) {
          toast(`Reading PDF page ${i} of ${maxPages}...`, "", 0);
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let out = "";
          let lastY = null;
          for (const it of content.items) {
            if (typeof it.str !== "string") continue;
            const y = it.transform ? it.transform[5] : 0;
            if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
            out += it.str;
            if (it.hasEOL) out += "\n";
            lastY = y;
          }
          pages.push(out);
        }
        pdfText = pages.join("\n\n").trim();
      } catch (err) {
        log("PDF text extraction error:", err);
      }

      if (!pdfText) {
        toast(`Could not extract text from "${file.name}". If this is a scanned document, please use the MaskIN side panel for OCR.`, "warn", 6000);
        return;
      }

      // Read any prompt instructions the user already typed into ChatGPT's input box
      const el = getInput();
      const userInstruction = readInput(el).trim();

      // Combine user instruction with the extracted PDF content
      let combinedText = "";
      if (userInstruction) {
        combinedText = `${userInstruction}\n\n--- DOCUMENT (Masked): ${file.name} ---\n${pdfText}`;
      } else {
        combinedText = `--- DOCUMENT (Masked): ${file.name} ---\n${pdfText}`;
      }

      toast("Scanning for private details on your laptop...", "", 0);
      const res = await ask({ action: "scan", text: combinedText, chatId: state.chatId });
      hideToast();
      showReview(combinedText, res);
    } catch (err) {
      toast("MaskIN could not process PDF: " + err.message, "warn");
    } finally {
      state.busy = false;
      setButtonBusy(false);
    }
  }

  function setButtonBusy(busy) {
    const btn = document.getElementById("maskin-mask-btn");
    if (btn) btn.disabled = busy;
  }

  // Puts the Mask button next to Send (re-run whenever ChatGPT re-renders).
  let maskButton = null;

  function ensureButton() {
    const input = getInput();
    if (!maskButton) maskButton = makeButton();
    const btn = maskButton;
    if (!input) {
      btn.remove();
      return;
    }
    const anchor = findEl(SEL.buttonAnchor);
    if (anchor && anchor.parentElement) {
      if (btn.isConnected && btn.parentElement === anchor.parentElement) {
        return;
      }
      btn.classList.remove("maskin-floating");
      btn.style.left = btn.style.top = "";
      anchor.parentElement.insertBefore(btn, anchor);
    } else {
      // Fallback: float the button at the bottom-right corner of the input box.
      const r = input.getBoundingClientRect();
      btn.classList.add("maskin-floating");
      btn.style.left = Math.max(8, r.right - 90) + "px";
      btn.style.top = Math.max(8, r.bottom - 40) + "px";
      if (!btn.isConnected) document.body.appendChild(btn);
    }
  }

  let buttonTimer = null;
  function scheduleButton() {
    if (buttonTimer) return;
    buttonTimer = setTimeout(() => {
      buttonTimer = null;
      ensureButton();
    }, 250);
  }

  // ---------- Send guard ----------
  // Catches Enter and the Send click before ChatGPT does (capture phase). If the
  // text was not masked, a quick regex-only check runs (no Gemma, so it is instant).
  function onKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    const input = getInput();
    if (!input || !(e.target === input || input.contains(e.target))) return;
    guardSend(e);
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest(SEL.send.join(",")) : null;
    if (!btn || btn.id === "maskin-mask-btn") return;
    guardSend(e);
  }

  function guardSend(e) {
    const text = readInput(getInput());
    if (state.bypassOnce) {
      state.bypassOnce = false;
      return;
    }
    if (!state.settings.sendGuard || !text.trim()) return;
    if (state.lastMasked && norm(text) === state.lastMasked) return;

    // Fakes we made ourselves are fine to send.
    const fakes = new Set(state.entries.map((x) => x.fake));
    const found = M.detectors.detectRegex(text).filter((i) => !fakes.has(i.text));
    if (!found.length) return; // nothing private: let ChatGPT send as usual

    e.preventDefault();
    e.stopImmediatePropagation();
    showGuard(found);
  }

  function showGuard(found) {
    const n = found.length;
    openModal(
      h("div", { class: "card", role: "alertdialog", "aria-label": "MaskIN send guard", style: "width:460px" },
        h("div", { class: "head" },
          h("p", { class: "title" }, `MaskIN found ${n} private detail${n === 1 ? "" : "s"} (${summarise(found)})`),
          h("div", { class: "sub" }, "This message has not been masked. ChatGPT would see the real values.")),
        h("div", { class: "foot" },
          h("span", { style: "flex:1" }),
          h("button", { onclick: () => { closeModal(); focusInput(); } }, "Cancel"),
          h("button", { onclick: sendAnyway }, "Send anyway"),
          h("button", { class: "primary", onclick: () => { closeModal(); runMask(); } }, "Mask now"))
      )
    );
  }

  function focusInput() {
    const el = getInput();
    if (el) el.focus();
  }

  // Lets exactly one send through, then presses Send again for the user.
  function sendAnyway() {
    closeModal();
    state.bypassOnce = true;
    setTimeout(() => (state.bypassOnce = false), 1500);
    const btn = findEl(SEL.send);
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }
    const el = getInput();
    if (!el) return;
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  // ---------- Restore: fakes back to real values, on screen only ----------
  // Restore does not depend on finding message elements: it walks every text node in
  // the chat area (paragraphs, tables, lists, inline code, code blocks, bold text).
  // ChatGPT's input box and MaskIN's own UI are skipped. Restored values are a display
  // overlay only: nothing is typed into ChatGPT and nothing is sent.
  const REPLY_SELECTOR = SEL.replyContainer.join(",");
  const USER_SELECTOR = SEL.userMessage.join(",");
  const ASSISTANT_SELECTOR = SEL.assistantMessage.join(",");
  const OUR_UI = "#maskin-ui-root, .maskin-badge-host, #maskin-mask-btn";
  const SKIP_SELECTOR = ["script", "style", "noscript", "svg", "textarea", "input", "[contenteditable='true']", OUR_UI, ".maskin-restored"]
    .concat(SEL.input)
    .join(",");

  let matchers = [];
  let anyFake = null; // one regex that finds any fake, to skip text nodes quickly
  let entriesSig = ""; // to notice when the mapping really changed
  const groups = new Set(); // one per ChatGPT text node we changed: { node, original, value, inserted }
  const groupNodes = new WeakSet(); // ChatGPT text nodes we already changed
  const ours = new WeakSet(); // text nodes we inserted ourselves
  const fakeView = new WeakSet(); // reply boxes switched to "Show what ChatGPT saw"
  let hiddenTypes = new Set(); // types the user keeps as fakes on screen (side panel filter)
  let dirty = false; // the chat changed since the last restore pass
  let lastChange = 0;
  let passes = 0;
  let observer = null;

  const filterType = (t) => (t === "NAME_PART" ? "NAME" : t || "CUSTOM");

  function containerFor(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    const md = el.closest(".markdown, .prose, [class*='markdown'], [data-assistant-markdown-root]");
    if (md && !md.contains(chatArea())) return md;
    const box = el.closest(REPLY_SELECTOR);
    return box && !box.contains(chatArea()) ? box : null;
  }

  function chatArea() {
    return findEl(SEL.chatArea) || document.body;
  }

  function showReal(span) {
    if (hiddenTypes.has(filterType(span.dataset.type))) return false;
    const box = span.closest("[data-maskin-view]") || containerFor(span);
    if (box && box.dataset.maskinView === "fake") return false;
    if (box && box.dataset.maskinView === "real") return true;
    return !(box && fakeView.has(box));
  }

  // Shows the real value or the fake in one restored span, depending on the filter.
  function paint(span) {
    const real = showReal(span);
    const want = real ? span.dataset.real : span.dataset.fake;
    if (span.textContent !== want) span.textContent = want;
    if (real) {
      span.className = "maskin-restored maskin-pill-real";
      span.title = `Restored by MaskIN: ${span.dataset.real}\n(ChatGPT saw: ${span.dataset.fake})`;
    } else {
      span.className = "maskin-restored maskin-pill-fake";
      span.title = `Shown as fake: ${span.dataset.fake}\n(Real value: ${span.dataset.real})`;
    }
  }

  // If ChatGPT changed or removed a text node we had split, take our pieces out again.
  // The next pass restores the new text. This keeps the page correct during re-renders.
  function heal() {
    let healed = 0;
    for (const g of Array.from(groups)) {
      if (g.node.isConnected && g.node.nodeValue === g.value) continue;
      g.inserted.forEach((n) => n.remove());
      groups.delete(g);
      groupNodes.delete(g.node);
      healed++;
    }
    if (healed > 0) {
      dirty = true;
      lastChange = Date.now();
    }
    return healed;
  }

  // Puts every changed text node back the way ChatGPT wrote it (used when the mapping changes).
  function undoAll() {
    for (const g of groups) {
      g.inserted.forEach((n) => n.remove());
      if (g.node.isConnected && g.node.nodeValue === g.value) g.node.nodeValue = g.original;
      groupNodes.delete(g.node);
    }
    groups.clear();
  }

  // Splits one ChatGPT text node into plain text + restored spans. ChatGPT's own node is
  // kept (holding the first part) and our pieces are added right after it.
  function restoreNode(node) {
    const segs = M.fakes.restoreSegments(node.nodeValue, matchers);
    if (!segs) return 0;
    const g = { node, original: node.nodeValue, value: "", inserted: [] };
    const parent = node.parentNode;
    const ref = node.nextSibling;
    let made = 0;
    segs.forEach((seg, i) => {
      if (i === 0 && seg.real === undefined) {
        node.nodeValue = seg.text;
        return;
      }
      if (i === 0) node.nodeValue = "";
      let piece;
      if (seg.real === undefined) {
        piece = document.createTextNode(seg.text);
        ours.add(piece);
      } else {
        piece = document.createElement("span");
        piece.className = "maskin-restored";
        piece.style.cursor = "help";
        piece.dataset.fake = seg.fake;
        piece.dataset.real = seg.real;
        piece.dataset.type = seg.type || "CUSTOM";
        made++;
      }
      parent.insertBefore(piece, ref);
      g.inserted.push(piece);
      if (piece.nodeType === 1) paint(piece);
    });
    g.value = node.nodeValue;
    groups.add(g);
    groupNodes.add(node);
    return made;
  }

  // One restore pass over the whole chat area. Returns counts for logs and the side panel.
  function restorePass(reason) {
    dirty = false;
    if (!matchers.length) return { replaced: 0, nodes: 0, total: 0, replies: 0 };
    const healed = heal();
    const root = chatArea();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (ours.has(n) || groupNodes.has(n) || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        return !p || p.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) if (anyFake.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    let replaced = 0;
    for (const node of nodes) replaced += restoreNode(node);

    const replies = updateBadges();
    if (observer) observer.takeRecords(); // our own changes are not new text from ChatGPT
    passes++;
    const total = document.querySelectorAll(".maskin-restored").length;
    log(
      `restore pass #${passes} (${reason}): area <${root.tagName.toLowerCase()}>, ` +
        `${document.querySelectorAll(ASSISTANT_SELECTOR).length} assistant replies found, ` +
        `${nodes.length} text nodes with fakes, ${replaced} replacements made` +
        (healed ? `, ${healed} re-rendered nodes redone` : "") +
        `, ${total} restored values on the page in ${replies} reply box(es)`
    );
    return { replaced, nodes: nodes.length, total, replies };
  }

  // Called for every page change. Changes inside the input box or MaskIN's UI do not count.
  function noteChanges(records) {
    for (const r of records) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!el || el.closest(OUR_UI) || el.closest(SEL.input.join(","))) continue;
      dirty = true;
      lastChange = Date.now();
      return;
    }
  }

  // Runs every 300 ms. ChatGPT's reply counts as finished when its Stop button is gone
  // or when nothing has changed for 1.5 s, whichever comes first.
  let lastReason = "";
  function tick() {
    if (!dirty || !matchers.length) return;
    const quiet = Date.now() - lastChange;
    const streaming = !!findEl(SEL.stopButton) || !!findEl(SEL.replyInProgress);
    let reason = "";
    if (!streaming && quiet >= 300) reason = "Stop button gone / reply marked complete";
    else if (quiet >= M.config.replyQuietMs) reason = `no change for ${M.config.replyQuietMs / 1000} s`;
    if (!reason) return;
    if (reason !== lastReason) log(`reply considered finished: ${reason}`);
    lastReason = reason;
    restorePass(reason);
  }

  // Re-paints every restored value (filter or view changed). No re-scan needed.
  function repaintAll() {
    document.querySelectorAll(".maskin-restored").forEach(paint);
    updateBadges();
    if (observer) observer.takeRecords();
  }

  // Side panel "Restore now": reload the mapping and redo the whole chat right away.
  async function restoreNow() {
    await loadMapping();
    undoAll();
    const r = restorePass("Restore now");
    return Object.assign({ chatId: state.chatId, key: state.mapKey, entries: state.entries.length }, r);
  }

  // ID-like values in the reply that MaskIN never created and the user never wrote:
  // ChatGPT may have changed a digit of a fake. (Aadhaar checksum is skipped here
  // because our fakes fail it on purpose.)
  function changedValues(text) {
    const digits = (s) => M.fakes.digitsOf(s);
    const known = new Set();
    for (const e of state.entries) {
      for (const v of [e.fake, e.real]) {
        known.add(v);
        if (/\d/.test(v)) {
          known.add(digits(v));
          known.add(digits(v).slice(-10));
        }
      }
    }
    const found = M.detectors.detectRegex(text || "", {
      aadhaarChecksum: false,
      types: ["AADHAAR", "PAN", "PHONE", "ACCOUNT", "IFSC"]
    });
    let changed = 0;
    for (const f of found) {
      const d = digits(f.text);
      const isKnown = known.has(f.text) || (f.type !== "PAN" && f.type !== "IFSC" && (known.has(d) || known.has(d.slice(-10))));
      if (!isKnown) changed++;
    }
    return changed;
  }

  // Adds or updates an action bar under every reply box that has restored values.
  function updateBadges() {
    if (!state.entries.length) {
      document.querySelectorAll(".maskin-badge-container").forEach((c) => c.remove());
      return 0;
    }
    const boxes = new Map();
    document.querySelectorAll(".maskin-restored").forEach((span) => {
      const box = containerFor(span);
      if (!box || box.matches(USER_SELECTOR) || box.closest(USER_SELECTOR)) return;
      if (!boxes.has(box)) boxes.set(box, []);
      boxes.get(box).push(span);
    });
    const streaming = !!findEl(SEL.stopButton) || !!findEl(SEL.replyInProgress);
    if (!streaming) {
      document.querySelectorAll(ASSISTANT_SELECTOR).forEach((el) => {
        const target = el.querySelector(".markdown, .prose, [class*='markdown']") || el;
        if (![...boxes.keys()].some((b) => target.contains(b) || b.contains(target))) {
          boxes.set(target, []);
        }
      });
    }
    let shownBoxes = 0;
    for (const [box, spans] of boxes) {
      const changed = changedValues(box.innerText);
      showBadge(box, spans.filter(showReal).length, spans.length, changed);
      shownBoxes++;
    }
    return shownBoxes;
  }

  // Action bar below reply box: "MaskIN: N restored" + Toggle (Show what ChatGPT saw / Show Real) + Copy Real
  function showBadge(box, shown, total, changed) {
    let container = box.parentElement?.querySelector(".maskin-badge-container") || box.querySelector(".maskin-badge-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "maskin-badge-container";
      if (box.nextElementSibling) {
        box.parentElement.insertBefore(container, box.nextElementSibling);
      } else {
        box.parentElement.appendChild(container);
      }
    }
    container.textContent = "";

    const isShowingFake = box.dataset.maskinView === "fake" || fakeView.has(box);

    const chip = document.createElement("span");
    chip.className = `maskin-chip-badge ${changed ? "amber" : "teal"}`;
    chip.textContent = total > 0
      ? `MaskIN: ${shown} restored${changed ? ` · ${changed} changed` : ""}`
      : "MaskIN Active";
    container.appendChild(chip);

    // Single Toggle Button: "Show what ChatGPT saw" <-> "Show real"
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "maskin-action-btn" + (isShowingFake ? " active" : "");
    toggleBtn.title = isShowingFake
      ? "Display restored original values on screen"
      : "Display what ChatGPT saw (fake values)";
    toggleBtn.innerHTML = isShowingFake
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>Show Real</span>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        <span>Show what ChatGPT saw</span>`;

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextView = isShowingFake ? "real" : "fake";
      if (nextView === "real" && !box.querySelectorAll(".maskin-restored").length) {
        restorePass("user clicked show real");
      }
      setBoxView(box, nextView);
      toast(nextView === "real" ? "Showing restored original values on screen." : "Showing what ChatGPT saw (fake values).", nextView === "real" ? "ok" : "", 2000);
      updateBadges();
    });

    const copyRealBtn = document.createElement("button");
    copyRealBtn.type = "button";
    copyRealBtn.className = "maskin-action-btn";
    copyRealBtn.title = "Copy reply with restored real values to clipboard";
    copyRealBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <span>Copy Real</span>
    `;

    copyRealBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasFake = box.dataset.maskinView === "fake" || fakeView.has(box);
      if (wasFake) {
        setBoxView(box, "real");
      }

      const clone = box.cloneNode(true);
      clone.querySelectorAll(".maskin-badge-container, .maskin-badge-host, .maskin-restored-tag").forEach((el) => el.remove());
      let text = (clone.innerText || clone.textContent || "").trim();

      if (state.entries && state.entries.length) {
        text = M.fakes.restoreText(text, state.entries);
      }

      if (wasFake) {
        setBoxView(box, "fake");
      }

      try {
        await navigator.clipboard.writeText(text);
        const spanText = copyRealBtn.querySelector("span");
        if (spanText) spanText.textContent = "Copied!";
        toast("✓ Copied response with restored real values!", "ok", 2500);
      } catch (err) {
        toast("✓ Copied response with restored real values!", "ok", 2500);
      }
      setTimeout(() => {
        const spanText = copyRealBtn.querySelector("span");
        if (spanText) spanText.textContent = "Copy Real";
      }, 1500);
    });

    container.appendChild(toggleBtn);
    container.appendChild(copyRealBtn);
  }

  // Switches one reply box between real values (per the filter) and the fakes ChatGPT saw.
  function setBoxView(box, view) {
    if (view === "fake") {
      fakeView.add(box);
      box.dataset.maskinView = "fake";
    } else {
      fakeView.delete(box);
      box.dataset.maskinView = "real";
    }
    const turn = box.closest(ASSISTANT_SELECTOR) || box;
    turn.dataset.maskinView = view;
    turn.querySelectorAll(".maskin-restored").forEach(paint);
    box.querySelectorAll(".maskin-restored").forEach(paint);
  }

  // ---------- Mapping for the open chat ----------
  // On-screen filter from the side panel: these types stay as fakes. Applied instantly
  // to every restored value on the page (spans keep both the real and the fake text).
  function setHidden(list) {
    const next = new Set(list || []);
    if ([...next].sort().join() === [...hiddenTypes].sort().join()) return;
    hiddenTypes = next;
    log(`on-screen filter: kept as fakes: ${[...hiddenTypes].join(", ") || "none"}`);
    repaintAll();
  }

  // New mapping: undo the old restore and run a fresh pass soon (also on page load).
  function setEntries(entries) {
    state.entries = entries || [];
    const sig = JSON.stringify(state.entries.map((e) => [e.real, e.fake]));
    if (sig === entriesSig) return;
    entriesSig = sig;
    undoAll();
    matchers = M.fakes.buildMatchers(state.entries);
    anyFake = matchers.length ? new RegExp(matchers.map((m) => `(?:${m.re.source})`).join("|"), "u") : null;
    dirty = matchers.length > 0;
    lastChange = 0; // run the next pass right away
    if (matchers.length) {
      setTimeout(() => restorePass("new entries"), 50);
    }
  }

  function resetChatState() {
    state.entries = [];
    state.lastMasked = null;
    state.mapKey = null;
    state.pendingMasked = false;
    undoAll();
    matchers = [];
    anyFake = null;
    entriesSig = "";
    fakeView = new WeakSet();
    document.querySelectorAll(".maskin-badge-container, .maskin-badge-host").forEach((el) => el.remove());
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("maskin_active_mapping");
      }
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("maskin_last_mapping");
      }
    } catch (_) {}
  }

  async function loadMapping() {
    if (!state.chatId && !state.pendingMasked) {
      setEntries([]);
      return;
    }

    try {
      const map = await ask({ action: "getMapping", chatId: state.chatId });
      state.mapKey = map.key;
      setHidden(map.hidden);
      setEntries(map.entries || []);
      log(`mapping loaded for ${state.chatId || "pending"}: ${(map.entries || []).length} entries`);
    } catch (err) {
      log("could not load mapping from worker:", err.message);
      if (!state.chatId) {
        setEntries([]);
      }
    }
  }

  async function loadSettings() {
    try {
      state.settings = Object.assign({}, M.config.defaults, await ask({ action: "getSettings" }));
    } catch (err) {
      log("could not load settings, using defaults:", err.message);
    }
  }

  // ChatGPT is a single-page app: watch the URL to know which chat is open.
  async function onPathChange() {
    if (location.pathname === state.path) return;
    const oldId = state.chatId;
    const newId = chatIdFromPath(location.pathname);
    state.path = location.pathname;
    state.chatId = newId;
    log(`URL changed to ${location.pathname}: chat ID ${newId || "(none yet: new chat)"}`);

    if (!oldId && newId && state.pendingMasked) {
      // A new chat just got its id after we masked something:
      // move this tab's pending mapping to the new chat ID.
      try {
        const r = await ask({ action: "migratePending", chatId: newId });
        log(`pending -> chat migration: ${r.moved ? "moved" : "nothing pending"} (${r.from} -> ${r.to})`);
      } catch (err) {
        log("pending -> chat migration failed:", err.message);
      }
      state.pendingMasked = false;
    } else if (oldId !== newId) {
      // Switched chats or started a new chat: completely reset old chat state!
      log(`Resetting chat state: switched from ${oldId || "new"} to ${newId || "new"}`);
      resetChatState();
    }

    state.lastMasked = null;
    await loadMapping();
  }

  // ---------- Start ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    if (msg.action === "mask") {
      runMask();
      sendResponse({ ok: true });
      return false;
    }
    if (msg.action === "insertMasked") {
      insertMasked(msg).then(sendResponse, (err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === "scanProgress") {
      if (state.busy) toast(`Scanning on your laptop... part ${msg.done} of ${msg.total}`, "", 0);
      return false;
    }
    if (msg.action === "restoreNow") {
      restoreNow().then(sendResponse, (err) => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === "getChatInfo") {
      sendResponse({ chatId: state.chatId });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes);
    if (keys.includes("maskin:settings")) loadSettings();
    if (keys.some((k) => k.startsWith("maskin:map:"))) loadMapping();
    // The side panel changed the on-screen filter for this chat: re-apply without reloading.
    if (state.mapKey) {
      const vk = state.mapKey.replace("maskin:map:", "maskin:view:");
      if (changes[vk]) setHidden((changes[vk].newValue && changes[vk].newValue.hidden) || []);
    }
  });

  function initDragAndDrop() {
    window.addEventListener("dragover", (e) => {
      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
      }
    });

    window.addEventListener("drop", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      const file = e.dataTransfer.files[0];
      if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
        const input = getInput();
        if (input && (e.target === input || input.contains(e.target) || (e.target.closest && e.target.closest("form")))) {
          e.preventDefault();
          e.stopPropagation();
          handlePdfFile(file);
        }
      }
    });
  }

  function init() {
    log(`content script started on ${location.pathname}: chat ID ${state.chatId || "(none, new chat)"}`);
    loadSettings();
    loadMapping();
    ensureButton();
    initDragAndDrop();
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Notice the new /c/<id> URL as soon as ChatGPT sets it, so the pending mapping moves at once.
    // (The Navigation API reports history.pushState; the 500 ms check is a fallback.)
    if (globalThis.navigation && navigation.addEventListener) {
      navigation.addEventListener("navigate", () => setTimeout(onPathChange, 0));
      navigation.addEventListener("navigatesuccess", () => onPathChange());
    }
    window.addEventListener("popstate", () => onPathChange());
    setInterval(onPathChange, 500);
    setInterval(tick, 300);
    setInterval(() => {
      if (state.entries.length) {
        updateBadges();
      }
      ensureButton();
    }, 1200);
  }

  function onMutations(records) {
    noteChanges(records);
    scheduleButton();
  }

  init();
})();
