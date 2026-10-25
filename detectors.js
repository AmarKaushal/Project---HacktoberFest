// detectors.js — finds Indian IDs and numbers with regex rules.
// Covers Aadhaar (with Verhoeff checksum), PAN, IFSC, phone, email, UPI ID,
// bank account number, PIN code and date of birth. Devanagari digits (०-९) are
// converted to 0-9 before matching. Also merges regex results with Gemma results.
// Used by the content script, the background worker and the Node tests.

(function () {
  const MaskIN = (globalThis.MaskIN = globalThis.MaskIN || {});

  // ---------- Verhoeff checksum (Aadhaar's last digit) ----------
  const VD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  const VP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 7, 6, 0, 8], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  // True if the digits (spaces and hyphens ignored) pass the Verhoeff check.
  function verhoeffValid(number) {
    const digits = String(number).replace(/\D/g, "").split("").reverse();
    let c = 0;
    for (let i = 0; i < digits.length; i++) c = VD[c][VP[i % 8][Number(digits[i])]];
    return c === 0;
  }

  // The check digit that would make these digits valid.
  function verhoeffDigit(number) {
    const digits = String(number).replace(/\D/g, "").split("").reverse();
    let c = 0;
    for (let i = 0; i < digits.length; i++) c = VD[c][VP[(i + 1) % 8][Number(digits[i])]];
    return VINV[c];
  }

  // ---------- Devanagari digits ----------
  // Turns ० १ २ ३ ४ ५ ६ ७ ८ ९ into 0-9. Each Devanagari digit is one character,
  // so the working copy has the same length. indexMap[i] is the position of
  // character i in the original text (here it is always i, but code uses the map
  // so that matches always point back to the original text).
  function normaliseDigits(text) {
    let out = "";
    const indexMap = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      out += code >= 0x0966 && code <= 0x096f ? String(code - 0x0966) : text[i];
      indexMap.push(i);
    }
    indexMap.push(text.length);
    return { text: out, indexMap };
  }

  // ---------- Context word lists ----------
  const ACCOUNT_WORDS = /(?:\ba\/c\b|\bacc\b|\bacct\b|\baccount\b|खाता)/i;
  const PIN_WORDS = /(?:\bpin\s*code\b|\bpincode\b|\bpin\b|\bpostal\s*code\b|पिन)/i;
  const DOB_WORDS = /(?:\bdob\b|\bd\.o\.b\b|\bdate\s+of\s+birth\b|\bbirth\s*date\b|\bborn\b|जन्म\s*तिथि|जन्मतिथि|जन्मतारीख|जन्म\s*तारीख|जन्म\s*दिनांक)/i;
  const CURRENCY_BEFORE = /(?:₹|\brs\.?|\binr|rupees|रु\.?)\s*$/i;

  // Cities and states that are often written just before a PIN code.
  const CITY_HINTS = [
    "Pune", "Mumbai", "Delhi", "New Delhi", "Bengaluru", "Bangalore", "Chennai", "Kolkata",
    "Hyderabad", "Ahmedabad", "Nagpur", "Nashik", "Thane", "Jaipur", "Lucknow", "Kanpur",
    "Indore", "Bhopal", "Patna", "Surat", "Vadodara", "Aurangabad", "Kolhapur", "Solapur",
    "Noida", "Gurgaon", "Gurugram", "Chandigarh", "Kochi", "Goa", "Varanasi", "Agra", "Satara",
    "Sangli", "Nanded", "Amravati", "Navi Mumbai", "Maharashtra", "Karnataka", "Gujarat",
    "Rajasthan", "Uttar Pradesh", "Madhya Pradesh", "Bihar", "Tamil Nadu", "Kerala", "Telangana",
    "पुणे", "मुंबई", "दिल्ली", "नागपूर", "नागपुर", "नाशिक", "ठाणे", "जयपुर", "लखनऊ", "पटना",
    "भोपाल", "इंदौर", "कोल्हापूर", "सोलापूर", "औरंगाबाद", "सातारा", "सांगली", "वाराणसी",
    "कानपुर", "आगरा", "महाराष्ट्र", "उत्तर प्रदेश", "बिहार", "राजस्थान"
  ];
  const CITY_BEFORE = new RegExp(
    "(?:" + CITY_HINTS.map((c) => c.replace(/\s+/g, "\\s+")).join("|") + ")\\s*[,\\-–]?\\s*$",
    "i"
  );

  const FORM_LABELS = new Set([
    "age", "sex", "gender", "dob", "date", "policy", "bed", "ward", "room", "doctor",
    "dr", "diagnosis", "consultant", "id", "no", "number", "status", "phone", "mobile",
    "address", "email", "designation", "department", "salary", "amount"
  ]);

  // ---------- The rules ----------
  // Each rule: a regex run on the normalised text, plus an optional check(match, text)
  // that decides whether this match really counts.
  const RULES = [
    {
      type: "AADHAAR",
      // 12 digits as 4-4-4 with the same optional space/hyphen, first digit 2-9.
      // Not part of a longer number (like a 16-digit card number).
      re: /(?<![0-9A-Za-z]|\d[ -])[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?![0-9A-Za-z]|[ -]\d)/g,
      check: (m, text, opts) => opts.aadhaarChecksum === false || verhoeffValid(m[0]),
      reason: (m, text, opts) =>
        opts.aadhaarChecksum === false ? "Looks like an Aadhaar number" : "Aadhaar number, checksum valid"
    },
    {
      type: "PAN",
      re: /(?<![A-Za-z0-9])[A-Z]{5}[0-9]{4}[A-Z](?![A-Za-z0-9])/g,
      reason: () => "PAN card number format"
    },
    {
      type: "IFSC",
      re: /(?<![A-Za-z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Za-z0-9])/g,
      reason: () => "IFSC code of a bank branch"
    },
    {
      type: "EMAIL",
      re: /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g,
      reason: () => "Email address"
    },
    {
      type: "UPI",
      // handle@psp where the part after @ has no dot (okaxis, ybl, paytm ...).
      re: /(?<![\w.+-])[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]+(?![\w-]|\.[A-Za-z0-9])/g,
      reason: () => "UPI ID"
    },
    {
      type: "PHONE",
      // Optional +91 / 91 / 0, then 10 digits starting 6-9, one optional space or hyphen after 5 digits.
      re: /(?<![\w+]|\d[ -])(?:(?:\+91|91|0)[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\w|[ -]\d)/g,
      reason: () => "Indian mobile number"
    },
    {
      type: "ACCOUNT",
      // 9-18 digits, only if a word like A/c, Account or खाता is just before it.
      re: /(?<!\d)\d{9,18}(?!\d)/g,
      check: (m, text) => ACCOUNT_WORDS.test(text.slice(Math.max(0, m.index - 25), m.index)),
      reason: () => "Bank account number (written after 'A/c' or 'Account')"
    },
    {
      type: "PIN",
      // 6 digits starting 1-9 (a space after 3 digits is allowed), only in an address-like place.
      re: /(?<!\d|\d[,.])[1-9]\d{2} ?\d{3}(?!\d|[,.]\d)/g,
      check: (m, text) => {
        const before = text.slice(Math.max(0, m.index - 30), m.index);
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
        if (CURRENCY_BEFORE.test(before)) return false;
        if (PIN_WORDS.test(before.slice(-15))) return true;
        if (CITY_BEFORE.test(before)) return true;
        // ", 411001" at the end of an address line
        const endOfLine = /^\s*[.,]?\s*(?:\n|$)/.test(after) || after === "";
        return endOfLine && /,\s*$/.test(before);
      },
      reason: () => "PIN code in an address"
    },
    {
      type: "DOB",
      re: /(?<!\d)(?:0?[1-9]|[12]\d|3[01])([\/.-])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}(?!\d)/g,
      check: (m, text) => DOB_WORDS.test(text.slice(Math.max(0, m.index - 30), m.index)),
      reason: () => "Date of birth"
    },
    {
      type: "NAME",
      // Names written after labels like "Name:", "Employee Name:", "नाम:", etc.
      // or preceded by titles like Mr., Mrs., Dr., Shri, Smt., etc.
      re: /(?:(?:(?<![\p{L}\p{N}])(?:name|employee\s+name|applicant\s+name|customer\s+name|patient\s+name|student\s+name|client\s+name|tenant\s+name|landlord\s+name|policy\s+holder|policyholder|insured\s+name|proposer|नाव|नाम)\s*[:：\-–]\s*)|(?:(?<![\p{L}\p{N}])(?:Mr|Mrs|Ms|Dr|Prof|Shri|Smt|Kum)\.?\s+)|(?:(?<![\p{L}\p{N}])(?:श्री|श्रीमती|सौ\.|कु\.|डॉ\.?)\s+))([A-Za-z\u0900-\u097f]+(?:[^\S\r\n]+[A-Za-z\u0900-\u097f]+){0,4})/giu,
      extract: (m) => {
        const rawWords = m[1].trim().split(/[^\S\r\n]+/);
        const clean = [];
        for (const w of rawWords) {
          if (/^[a-z]/.test(w) || FORM_LABELS.has(w.toLowerCase())) break;
          clean.push(w);
        }
        if (!clean.length) return null;
        const firstWord = clean[0];
        const lastWord = clean[clean.length - 1];
        const startOffset = m[0].indexOf(firstWord);
        const endOffset = m[0].indexOf(lastWord, startOffset) + lastWord.length;
        return { startOffset, endOffset };
      },
      reason: () => "Name of a person"
    },
    {
      type: "ADDRESS",
      // Address written after labels like "Address:", "Postal Address:", "पता:", etc.
      re: /(?:(?<![\p{L}\p{N}])(?:address|postal\s+address|residential\s+address|residence|पता|पत्ता)\s*[:：\-–]\s*)([^\n\r]{8,120})/giu,
      extract: (m) => {
        const val = m[1].trim();
        const startOffset = m[0].indexOf(val);
        const endOffset = startOffset + val.length;
        return { startOffset, endOffset };
      },
      reason: () => "Postal address"
    }
  ];

  // When two matches cover exactly the same text, the type earlier in this list wins.
  const TYPE_PRIORITY = [
    "ACCOUNT", "AADHAAR", "PAN", "IFSC", "UPI", "EMAIL", "PHONE", "DOB", "PIN",
    "NAME", "ADDRESS", "CUSTOM"
  ];

  // Runs every regex rule. Returns [{ text, start, end, type, source: "regex", reason }].
  // opts.aadhaarChecksum = false skips the Verhoeff check (used on ChatGPT replies,
  // because our fake Aadhaar numbers fail the checksum on purpose).
  // opts.types = ["PAN", ...] limits which rules run.
  function detectRegex(original, opts) {
    opts = opts || {};
    const { text, indexMap } = normaliseDigits(original || "");
    const found = [];
    for (const rule of RULES) {
      if (opts.types && !opts.types.includes(rule.type)) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        if (rule.check && !rule.check(m, text, opts)) continue;
        let startOffset = 0;
        let endOffset = m[0].length;
        if (rule.extract) {
          const ext = rule.extract(m, text, opts);
          if (!ext) continue;
          startOffset = ext.startOffset;
          endOffset = ext.endOffset;
        }
        const start = indexMap[m.index + startOffset];
        const end = indexMap[m.index + endOffset];
        const itemText = original.slice(start, end).trim();
        if (!itemText) continue;
        found.push({
          text: itemText,
          start,
          end,
          type: rule.type,
          source: "regex",
          reason: rule.reason(m, text, opts)
        });
      }
    }
    return resolveOverlaps(found);
  }

  // Removes overlapping matches: the longer span wins; on equal span regex beats
  // Gemma, then TYPE_PRIORITY decides. Result is sorted by position.
  function resolveOverlaps(items) {
    const rank = (t) => {
      const i = TYPE_PRIORITY.indexOf(t);
      return i === -1 ? 99 : i;
    };
    const sorted = items.slice().sort((a, b) => {
      const len = b.end - b.start - (a.end - a.start);
      if (len !== 0) return len;
      const src = (a.source === "regex" ? 0 : 1) - (b.source === "regex" ? 0 : 1);
      if (src !== 0) return src;
      return rank(a.type) - rank(b.type);
    });
    const kept = [];
    for (const item of sorted) {
      const overlaps = kept.some((k) => item.start < k.end && k.start < item.end);
      if (!overlaps) kept.push(item);
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  // Combines regex items and Gemma items into one clean list.
  function mergeItems(regexItems, aiItems) {
    return resolveOverlaps((regexItems || []).concat(aiItems || []));
  }

  // Letters, combining marks (Devanagari vowel signs) and digits count as "part of a word".
  const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

  // All places where `needle` appears in `text` as a whole word/number
  // (not glued to other letters or digits). Returns [{ start, end }].
  function findAll(text, needle) {
    const out = [];
    if (!needle) return out;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const isExactCase = /^[A-Z0-9]+$/.test(needle) && needle.length <= 10;
    const flags = isExactCase ? "gu" : "giu";
    let re;
    try {
      re = new RegExp(escaped, flags);
    } catch (_) {
      let from = 0;
      while (true) {
        const i = text.indexOf(needle, from);
        if (i === -1) break;
        const before = i > 0 ? text[i - 1] : "";
        const after = text[i + needle.length] || "";
        const startsWord = WORD_CHAR.test(needle[0]);
        const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
        const okBefore = !startsWord || !before || !WORD_CHAR.test(before);
        const okAfter = !endsWord || !after || !WORD_CHAR.test(after);
        if (okBefore && okAfter) out.push({ start: i, end: i + needle.length });
        from = i + 1;
      }
      return out;
    }

    let m;
    while ((m = re.exec(text)) !== null) {
      const i = m.index;
      const matched = m[0];
      if (!matched.length) {
        re.lastIndex++;
        continue;
      }
      const before = i > 0 ? text[i - 1] : "";
      const after = text[i + matched.length] || "";
      const startsWord = WORD_CHAR.test(matched[0]);
      const endsWord = WORD_CHAR.test(matched[matched.length - 1]);
      const okBefore = !startsWord || !before || !WORD_CHAR.test(before);
      const okAfter = !endsWord || !after || !WORD_CHAR.test(after);
      if (okBefore && okAfter) out.push({ start: i, end: i + matched.length });
    }
    return out;
  }

  MaskIN.detectors = {
    verhoeffValid,
    verhoeffDigit,
    normaliseDigits,
    detectRegex,
    resolveOverlaps,
    mergeItems,
    findAll,
    TYPE_PRIORITY
  };

  if (typeof module !== "undefined") module.exports = MaskIN.detectors;
})();
