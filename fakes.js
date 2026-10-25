// fakes.js — makes a fake value for every private item, keeps fakes consistent
// inside one chat, masks a text with the chosen fakes, and finds fakes in a
// ChatGPT reply so they can be swapped back. Needs detectors.js and names.js.
// Used by the content script, the background worker and the Node tests.

(function () {
  const MaskIN = (globalThis.MaskIN = globalThis.MaskIN || {});
  const det = () => MaskIN.detectors;
  const lists = () => MaskIN.names;

  // ---------- Small random helpers ----------
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const randDigits = (n) => Array.from({ length: n }, () => rand(10)).join("");
  const randLetters = (n) => Array.from({ length: n }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[rand(26)]).join("");

  const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);
  const hasDevanagariDigits = (s) => /[०-९]/.test(s);
  const toDevanagariDigits = (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0966 + Number(d)));
  const digitsOf = (s) => det().normaliseDigits(s).text.replace(/\D/g, "");
  const letterCount = (s) => (s.match(/[\p{L}\p{M}]/gu) || []).length;

  // Puts new digits into the shape of the original value:
  // fillDigits("2345 6789 0123", "881234097756") -> "8812 3409 7756".
  // A Devanagari digit in the original stays a Devanagari digit.
  function fillDigits(pattern, digits) {
    let k = 0;
    return pattern.replace(/[0-9०-९]/g, (ch) => {
      const d = digits[k++] || "0";
      return /[0-9]/.test(ch) ? d : toDevanagariDigits(d);
    });
  }

  // Picks the name list language: "en" for Latin script, "mr" or "hi" for Devanagari.
  function langFor(text, lang) {
    if (!isDevanagari(text)) return "en";
    if (lang === "mr" || lang === "hi") return lang;
    return /[ळ]|रस्ता|पेठ|क्र\./.test(text) ? "mr" : "hi";
  }

  // Guesses gender from our own lists when Gemma did not give one.
  function genderFor(firstWord, gender) {
    if (gender === "male" || gender === "female") return gender;
    const n = lists();
    for (const lang of ["en", "hi", "mr"]) {
      if (n[lang].female.includes(firstWord)) return "female";
      if (n[lang].male.includes(firstWord)) return "male";
    }
    return /a$|i$|ा$|ी$/.test(firstWord) ? "female" : "male";
  }

  // Does this custom text look like a person's name? (1-3 capitalised words, or Devanagari words)
  function looksLikeName(text) {
    const t = text.trim();
    if (/\d/.test(t)) return false;
    if (/^\p{Lu}[\p{L}.'-]*(\s+\p{Lu}[\p{L}.'-]*){0,2}$/u.test(t)) return true;
    return /^[ऀ-ॿ]+(\s+[ऀ-ॿ]+){0,2}$/.test(t);
  }

  // ---------- Fakes for fixed-format values ----------
  const MAKERS = {
    // Random 12 digits that FAIL the Verhoeff check on purpose, so a fake can never be a real Aadhaar.
    AADHAAR(real) {
      const first11 = String(2 + rand(8)) + randDigits(10);
      const good = det().verhoeffDigit(first11);
      const bad = (good + 1 + rand(9)) % 10;
      return fillDigits(real, first11 + bad);
    },
    PAN(real) {
      // The 4th letter says what kind of holder it is (P = person), so we keep it.
      const fourth = /^[A-Z]{3}([A-Z])/.exec(real);
      return randLetters(3) + (fourth ? fourth[1] : "P") + randLetters(1) + randDigits(4) + randLetters(1);
    },
    IFSC(real) {
      const prefixes = ["HDFC", "ICIC", "SBIN", "UTIB", "KKBK"].filter((p) => !real.startsWith(p));
      return pick(prefixes) + "0" + randDigits(6);
    },
    PHONE(real) {
      // Keep the +91 / 0 prefix as written, change the 10-digit number.
      const d = digitsOf(real);
      const prefix = d.slice(0, d.length - 10);
      return fillDigits(real, prefix + String(6 + rand(4)) + randDigits(9));
    },
    ACCOUNT(real) {
      // Same length, and the same number of leading zeros.
      const d = digitsOf(real);
      const zeros = /^0*/.exec(d)[0];
      const restLen = d.length - zeros.length;
      const rest = restLen > 0 ? String(1 + rand(9)) + randDigits(restLen - 1) : "";
      return fillDigits(real, zeros + rest);
    },
    PIN(real) {
      // Same first digit (same region of India), the rest random.
      const d = digitsOf(real);
      return fillDigits(real, d[0] + randDigits(5));
    },
    DOB(real) {
      // A valid date in the same format (separator and zero padding kept).
      const m = /^(\d{1,2})([\/.-])(\d{1,2})[\/.-](\d{4})$/.exec(det().normaliseDigits(real).text);
      const pad = (v, w) => String(v).padStart(w, "0");
      const day = 1 + rand(28);
      const month = 1 + rand(12);
      const year = 1960 + rand(45);
      const out = m
        ? pad(day, m[1].length) + m[2] + pad(month, m[3].length) + m[2] + year
        : pad(day, 2) + "/" + pad(month, 2) + "/" + year;
      return hasDevanagariDigits(real) ? toDevanagariDigits(out) : out;
    },
    EMAIL(real) {
      const at = real.lastIndexOf("@");
      return fakeHandle(real.slice(0, at)) + real.slice(at);
    },
    UPI(real) {
      const at = real.lastIndexOf("@");
      return fakeHandle(real.slice(0, at)) + real.slice(at);
    },
    ADDRESS(real, item) {
      const lang = langFor(real, item.lang);
      const L = lists()[lang];
      const city = pick(lists().cities);
      let pin = city.pin + randDigits(3);
      let house = String(1 + rand(98));
      if (hasDevanagariDigits(real)) {
        pin = toDevanagariDigits(pin);
        house = toDevanagariDigits(house);
      }
      const lines = [`${pick(L.buildings)} ${house}, ${pick(L.streets)}`, pick(L.areas), `${city[lang]} - ${pin}`];
      return lines.join(real.includes("\n") ? ",\n" : ", ");
    }
  };

  // Fake local part for an email or UPI ID, made from our name lists.
  function fakeHandle(local) {
    if (/^\d+$/.test(local)) return String(6 + rand(4)) + randDigits(Math.max(local.length - 1, 1));
    const n = lists().en;
    let out = pick(n.male.concat(n.female)).toLowerCase();
    if (/[._]/.test(local)) out += local.match(/[._]/)[0] + pick(n.surnames).toLowerCase();
    if (/\d/.test(local)) out += randDigits(2);
    return out;
  }

  // ---------- A fake session: one per scan, seeded with the chat's saved mapping ----------
  // createSession({ text, existing: [{real, fake, type}], style: "realistic"|"tags", reals: [...] })
  function createSession(opts) {
    opts = opts || {};
    const text = opts.text || "";
    const style = opts.style === "tags" ? "tags" : "realistic";
    const map = new Map(); // real -> fake
    const fakes = new Set();
    const reals = new Set(opts.reals || []);
    const counters = {};
    const newEntries = [];

    for (const e of opts.existing || []) {
      map.set(e.real, e.fake);
      fakes.add(e.fake);
      reals.add(e.real);
      const tag = /^\[([A-Z]+)_(\d+)\]$/.exec(e.fake);
      if (tag) counters[tag[1]] = Math.max(counters[tag[1]] || 0, Number(tag[2]));
    }

    // A fake is usable only if it is new, is not any real value, and does not appear in the text.
    function isFree(candidate, real) {
      if (!candidate || candidate === real) return false;
      if (fakes.has(candidate) || reals.has(candidate)) return false;
      return det().findAll(text, candidate).length === 0;
    }

    function tagFor(type) {
      let fake;
      do {
        counters[type] = (counters[type] || 0) + 1;
        fake = `[${type}_${counters[type]}]`;
      } while (!isFree(fake));
      return fake;
    }

    function remember(real, fake, type) {
      map.set(real, fake);
      fakes.add(fake);
      reals.add(real);
      newEntries.push({ real, fake, type });
    }

    // Tries a maker up to 50 times until it gives a free fake, else falls back to a tag.
    function tryMake(type, make, real) {
      for (let i = 0; i < 50; i++) {
        const c = make();
        if (isFree(c, real)) return c;
      }
      return tagFor(type);
    }

    // Fake name with the same number of words, same script, same gender. Titles stay.
    // Each word is faked once per chat, so "Ramesh Kumar" and "Sita Kumar" share a fake surname.
    function makeName(real, item) {
      const words = real.split(/\s+/).filter(Boolean);
      const gaps = real.match(/\s+/g) || [];
      const titles = lists().titles;
      const nameIdx = words.map((w, i) => (titles.includes(w) ? -1 : i)).filter((i) => i >= 0);
      const lang = langFor(real, item.lang);
      const L = lists()[lang];
      const gender = genderFor(words[nameIdx[0]] || "", item.gender);
      const parts = [];
      const used = new Set();

      const out = words.map((word, i) => {
        if (!nameIdx.includes(i)) return word; // a title like Mr. or श्री
        if (map.has(word)) {
          used.add(map.get(word));
          if (letterCount(word) >= 3) parts.push({ real: word, fake: map.get(word), type: "NAME_PART" });
          return map.get(word);
        }
        // Initials like "R." become another initial.
        if (letterCount(word) <= 2 && /^\p{L}\.?$/u.test(word) && !isDevanagari(word)) {
          return randLetters(1) + (word.endsWith(".") ? "." : "");
        }
        const isSurname = nameIdx.length > 1 && i === nameIdx[nameIdx.length - 1];
        const isMiddle = !isSurname && i !== nameIdx[0];
        const pool = isSurname ? L.surnames : isMiddle ? L.male : L[gender];
        const upper = word === word.toUpperCase() && word !== word.toLowerCase();
        let fakeWord = null;
        for (let t = 0; t < 60 && !fakeWord; t++) {
          let c = pick(pool);
          if (upper) c = c.toUpperCase();
          if (!used.has(c) && isFree(c, word) && !words.includes(c)) fakeWord = c;
        }
        if (!fakeWord) fakeWord = pick(pool) + randLetters(1).toLowerCase();
        used.add(fakeWord);
        if (letterCount(word) >= 3) {
          remember(word, fakeWord, "NAME_PART");
          parts.push({ real: word, fake: fakeWord, type: "NAME_PART" });
        } else {
          map.set(word, fakeWord);
        }
        return fakeWord;
      });

      let fake = "";
      out.forEach((w, i) => (fake += w + (gaps[i] || "")));
      return { fake, parts };
    }

    // Main entry: item = { text, type, gender?, lang? } -> { fake, parts }
    // parts are the extra first-name / surname entries for names.
    function fakeFor(item) {
      const real = item.text;
      const type = item.type;
      const nameLike = type === "NAME" || (type === "CUSTOM" && looksLikeName(real));

      if (map.has(real)) {
        const parts = [];
        if (nameLike) {
          for (const w of real.split(/\s+/)) {
            if (w !== real && map.has(w) && letterCount(w) >= 3) parts.push({ real: w, fake: map.get(w), type: "NAME_PART" });
          }
        }
        return { fake: map.get(real), parts };
      }

      let fake;
      let parts = [];
      if (style === "tags") {
        fake = tagFor(type);
      } else if (nameLike && words(real) <= 5) {
        const r = makeName(real, item);
        fake = r.fake;
        parts = r.parts;
        if (!isFree(fake, real) && fakes.has(fake)) fake = tagFor(type);
      } else if (MAKERS[type]) {
        fake = tryMake(type, () => MAKERS[type](real, item), real);
      } else {
        fake = tagFor(type === "NAME" ? "NAME" : "CUSTOM");
      }
      remember(real, fake, type);
      return { fake, parts };
    }

    return {
      fakeFor,
      entries: () => newEntries.slice(),
      has: (real) => map.has(real)
    };
  }

  const words = (s) => s.split(/\s+/).filter(Boolean).length;

  // ---------- Masking a text ----------
  // Replaces every whole-word occurrence of each entry's real value with its fake.
  // Longer values win when they overlap. Works from the end of the text backwards
  // so earlier positions stay valid. Returns { text, count } (count = replacements).
  function applyMask(text, entries) {
    const spans = [];
    for (const e of entries) {
      if (!e.real || e.real === e.fake) continue;
      for (const s of det().findAll(text, e.real)) spans.push({ start: s.start, end: s.end, fake: e.fake });
    }
    spans.sort((a, b) => b.end - b.start - (a.end - a.start));
    const kept = [];
    for (const s of spans) if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
    kept.sort((a, b) => b.start - a.start);
    let out = text;
    for (const s of kept) out = out.slice(0, s.start) + s.fake + out.slice(s.end);
    return { text: out, count: kept.length };
  }

  // ---------- Finding fakes in a reply ----------
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const digitClass = (d) => `[${d}${toDevanagariDigits(d)}]`;
  const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}+])";
  const NOT_WORD_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
  // Tags like NAME_1 must not touch letters, digits or "_" (so NAME_1 never matches inside NAME_12).
  const NOT_TAG_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}_])";
  const NOT_TAG_AFTER = "(?![\\p{L}\\p{M}\\p{N}_])";

  // Builds one regex per mapping entry. Number fakes also match when ChatGPT
  // writes them with different spacing ("8812 3409 7756" vs "881234097756").
  // Tags like [NAME_1] also match as NAME_1, [NAME_1 or `[NAME_1]` (backticks are
  // replaced too), because ChatGPT often shows tags inside inline code.
  function buildMatchers(entries) {
    const out = [];
    for (const e of entries) {
      if (!e.fake) continue;
      const tag = /^\[([A-Z][A-Z_]*_\d+)\]$/.exec(e.fake);
      if (tag) {
        const body = "`?\\[?" + tag[1] + "\\]?`?";
        out.push({ entry: e, re: new RegExp(NOT_TAG_BEFORE + body + NOT_TAG_AFTER, "gu") });
        continue;
      }
      let body;
      if (e.type === "AADHAAR" || e.type === "ACCOUNT") {
        body = digitsOf(e.fake).split("").map(digitClass).join("[ -]?");
      } else if (e.type === "PHONE") {
        const d = digitsOf(e.fake).slice(-10);
        body = "(?:(?:\\+91|91|0)[ -]?)?" + d.slice(0, 5).split("").map(digitClass).join("") + "[ -]?" + d.slice(5).split("").map(digitClass).join("");
      } else {
        body = escapeRe(e.fake).replace(/\s+/g, "\\s+");
        const upper = e.fake.toUpperCase();
        if (upper !== e.fake) body = `(?:${body}|${escapeRe(upper).replace(/\s+/g, "\\s+")})`;
      }
      const isCaseInsensitive = e.type === "NAME" || e.type === "NAME_PART" || e.type === "ADDRESS" || e.type === "CUSTOM";
      const flags = isCaseInsensitive ? "gui" : "gu";
      out.push({ entry: e, re: new RegExp(NOT_WORD_BEFORE + body + NOT_WORD_AFTER, flags) });
    }
    // Longest fake first, so "Suresh Patil" is restored before "Suresh".
    return out.sort((a, b) => b.entry.fake.length - a.entry.fake.length);
  }

  // Splits a string into plain parts and restored parts.
  // Returns null if no fake is found, else [{ text, real?, fake?, type? }].
  function restoreSegments(str, matchers) {
    const hits = [];
    for (const m of matchers) {
      m.re.lastIndex = 0;
      let r;
      while ((r = m.re.exec(str)) !== null) {
        const start = r.index;
        const end = start + r[0].length;
        if (end === start) {
          m.re.lastIndex++;
          continue;
        }
        if (!hits.some((h) => start < h.end && h.start < end)) hits.push({ start, end, entry: m.entry, seen: r[0] });
      }
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.start - b.start);
    const segs = [];
    let pos = 0;
    for (const h of hits) {
      if (h.start > pos) segs.push({ text: str.slice(pos, h.start) });
      segs.push({ text: h.entry.real, real: h.entry.real, fake: h.seen, type: h.entry.type });
      pos = h.end;
    }
    if (pos < str.length) segs.push({ text: str.slice(pos) });
    return segs;
  }

  // Plain string version of restore (used by tests and the side panel).
  function restoreText(str, entries) {
    const segs = restoreSegments(str, buildMatchers(entries));
    return segs ? segs.map((s) => s.text).join("") : str;
  }

  MaskIN.fakes = {
    createSession,
    applyMask,
    buildMatchers,
    restoreSegments,
    restoreText,
    looksLikeName,
    digitsOf
  };

  if (typeof module !== "undefined") module.exports = MaskIN.fakes;
})();
