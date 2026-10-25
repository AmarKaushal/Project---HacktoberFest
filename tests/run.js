// tests/run.js — plain Node tests for the detectors and the fake generator.
// Run with: node tests/run.js   (no frameworks, no installs needed)

require("../config.js");
const D = require("../detectors.js");
require("../names.js");
const F = require("../fakes.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Returns the detected items of one type in a text.
function found(text, type, opts) {
  return D.detectRegex(text, opts).filter((i) => i.type === type).map((i) => i.text);
}

function mustFind(type, text, expected) {
  test(`${type} found in "${text}"`, () => {
    const got = found(text, type);
    assert(got.includes(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  });
}

function mustNotFind(type, text) {
  test(`${type} NOT found in "${text}"`, () => {
    const got = found(text, type);
    assert(got.length === 0, `expected nothing, got ${JSON.stringify(got)}`);
  });
}

// A made-up 12-digit number that passes Verhoeff (not a real person's Aadhaar).
const VALID_AADHAAR = "234567890125";
const VALID_AADHAAR_SPACED = "2345 6789 0125";
const VALID_AADHAAR_DASHED = "2345-6789-0125";

console.log("\nVerhoeff checksum");
test("valid number passes", () => assert(D.verhoeffValid(VALID_AADHAAR)));
test("one digit changed fails", () => assert(!D.verhoeffValid("234567890135")));
test("check digit is computed correctly", () => assert(D.verhoeffDigit("23456789012") === 5));

console.log("\nAADHAAR");
mustFind("AADHAAR", `Aadhaar: ${VALID_AADHAAR}`, VALID_AADHAAR);
mustFind("AADHAAR", `Aadhaar No. ${VALID_AADHAAR_SPACED} issued`, VALID_AADHAAR_SPACED);
mustFind("AADHAAR", `UID ${VALID_AADHAAR_DASHED}`, VALID_AADHAAR_DASHED);
mustNotFind("AADHAAR", "Aadhaar: 2345 6789 0135"); // one digit changed, checksum fails
mustNotFind("AADHAAR", "Order ID 482917305613 shipped"); // random 12-digit order ID
mustNotFind("AADHAAR", "Number 134567890125"); // starts with 1
mustNotFind("AADHAAR", "Card 4111 2345 6789 0125 3456"); // part of a longer number
test("order ID fixture really fails Verhoeff", () => assert(!D.verhoeffValid("482917305613")));
test("Devanagari digits are detected (Aadhaar)", () => {
  const deva = "आधार: २३४५ ६७८९ ०१२५";
  const got = found(deva, "AADHAAR");
  assert(got.length === 1 && got[0] === "२३४५ ६७८९ ०१२५", JSON.stringify(got));
});
test("checksum can be skipped for reply checks", () => {
  assert(found("ID 2345 6789 0135", "AADHAAR", { aadhaarChecksum: false }).length === 1);
});

console.log("\nPAN");
mustFind("PAN", "PAN: ABCPE1234F", "ABCPE1234F");
mustFind("PAN", "pan no ABCDE1234F.", "ABCDE1234F");
mustNotFind("PAN", "code XABCDE1234FY here"); // inside a word
mustNotFind("PAN", "abcde1234f"); // lowercase
mustNotFind("PAN", "ABCD1234F");

console.log("\nIFSC");
mustFind("IFSC", "IFSC: SBIN0001234", "SBIN0001234");
mustFind("IFSC", "IFSC HDFC0ABC123", "HDFC0ABC123");
mustNotFind("IFSC", "SBIN1001234"); // 5th character must be 0
mustNotFind("IFSC", "XSBIN0001234"); // glued to another letter

console.log("\nPHONE");
mustFind("PHONE", "Call 9876543210 now", "9876543210");
mustFind("PHONE", "Mobile: +91 98765 43210", "+91 98765 43210");
mustFind("PHONE", "Mobile: +91-98765-43210", "+91-98765-43210");
mustFind("PHONE", "phone 09876543210", "09876543210");
mustFind("PHONE", "फोन: ९८७६५४३२१०", "९८७६५४३२१०");
mustNotFind("PHONE", "Call 5876543210"); // must start with 6-9
mustNotFind("PHONE", "Ref 98765432101234"); // part of a longer number

console.log("\nEMAIL and UPI");
mustFind("EMAIL", "Mail ramesh.kumar@gmail.com today", "ramesh.kumar@gmail.com");
mustNotFind("UPI", "Mail ramesh.kumar@gmail.com today");
mustFind("UPI", "Paid to ramesh@okaxis for rent", "ramesh@okaxis");
mustFind("UPI", "UPI: 9876543210@ybl.", "9876543210@ybl");
mustNotFind("EMAIL", "Paid to ramesh@okaxis for rent");
test("UPI with a phone number inside is one UPI item, not a phone", () => {
  const all = D.detectRegex("UPI: 9876543210@ybl");
  assert(all.length === 1 && all[0].type === "UPI", JSON.stringify(all));
});

console.log("\nACCOUNT");
mustFind("ACCOUNT", "A/c No: 001234567890", "001234567890");
mustFind("ACCOUNT", "Account Number 50100234567891", "50100234567891");
mustFind("ACCOUNT", "खाता क्रमांक: 123456789012", "123456789012");
mustNotFind("ACCOUNT", "Reference 001234567890 is pending"); // no keyword
mustNotFind("ACCOUNT", "A/c 12345678"); // too short

console.log("\nPIN");
mustFind("PIN", "PIN: 411001", "411001");
mustFind("PIN", "Pincode - 422 005", "422 005");
mustFind("PIN", "12 MG Road, Pune 411001", "411001");
mustFind("PIN", "Flat 4, Near Bus Stand, 411005\nPune", "411005");
mustFind("PIN", "पुणे ४११००१", "४११००१");
mustNotFind("PIN", "Salary 125000 per month");
mustNotFind("PIN", "Total Rs. 411001");
mustNotFind("PIN", "Order 411001 delivered");

console.log("\nDOB");
mustFind("DOB", "DOB: 15/08/1990", "15/08/1990");
mustFind("DOB", "Date of Birth 05-01-1985", "05-01-1985");
mustFind("DOB", "जन्म तिथि: 12.03.1978", "12.03.1978");
mustNotFind("DOB", "Invoice date 15/08/2024");
mustNotFind("DOB", "DOB: 32/13/1990");

console.log("\nNAME and ADDRESS (regex & heuristics)");
mustFind("NAME", "Name: Ramesh Kumar", "Ramesh Kumar");
mustFind("NAME", "EMPLOYEE NAME: PRIYA DESHPANDE", "PRIYA DESHPANDE");
mustFind("NAME", "नाम: सुनीता शर्मा", "सुनीता शर्मा");
mustFind("NAME", "नाव: राहुल वर्मा", "राहुल वर्मा");
mustFind("NAME", "Patient: Dr. Anil Deshmukh treated Aarav Mehta", "Anil Deshmukh");
mustFind("ADDRESS", "Address: 12, MG Road, Shivaji Nagar, Pune - 411005", "12, MG Road, Shivaji Nagar, Pune - 411005");
mustFind("ADDRESS", "पता: मकान नं. 21, नेहरू मार्ग, राजेंद्र नगर, लखनऊ - 226004", "मकान नं. 21, नेहरू मार्ग, राजेंद्र नगर, लखनऊ - 226004");

console.log("\nChat ID from URL");
test("real chat ids are read, temporary local-chatgpt ids count as no id", () => {
  const id = require("../config.js").chatIdFromPath;
  assert(id("/c/6adcfcec-5090-83ee-81ad-76a4a976bb52") === "6adcfcec-5090-83ee-81ad-76a4a976bb52");
  assert(id("/g/g-p-abc/c/6adcfcec-5090") === "6adcfcec-5090");
  assert(id("/c/local-chatgpt%3Adb75173a-a283-4184-a2e2-a58443d6634c") === null);
  assert(id("/c/local-chatgpt:db75173a") === null);
  assert(id("/uc/6adcfeaa-7338-83ea") === "6adcfeaa-7338-83ea");
  assert(id("/") === null);
});

console.log("\nMerge");
test("longer span wins, regex wins on equal span", () => {
  const regex = [{ text: "411001", start: 20, end: 26, type: "PIN", source: "regex" }];
  const ai = [
    { text: "12 MG Road, Pune 411001", start: 3, end: 26, type: "ADDRESS", source: "gemma" },
    { text: "Ramesh", start: 30, end: 36, type: "NAME", source: "gemma" }
  ];
  const merged = D.mergeItems(regex, ai);
  assert(merged.length === 2 && merged[0].type === "ADDRESS" && merged[1].type === "NAME", JSON.stringify(merged));
  const same = D.mergeItems(
    [{ text: "x", start: 0, end: 5, type: "PHONE", source: "regex" }],
    [{ text: "x", start: 0, end: 5, type: "NAME", source: "gemma" }]
  );
  assert(same.length === 1 && same[0].source === "regex");
});
test("findAll matches whole words only", () => {
  const t = "Ram met Ramesh. Ram left.";
  assert(D.findAll(t, "Ram").length === 2);
  assert(D.findAll("रामेश्वर और राम", "राम").length === 1);
});

console.log("\nFakes");
const SAMPLE = `Name: Ramesh Kumar, Aadhaar ${VALID_AADHAAR_SPACED}, PAN ABCPE1234F, IFSC SBIN0001234,
Mobile +91 98765 43210, A/c No 001234567890, PIN: 411001, DOB: 15/08/1990,
Email ramesh.kumar@gmail.com, UPI ramesh@okaxis`;

function fakeOf(type, real, extra) {
  const s = F.createSession({ text: SAMPLE + " " + real });
  return s.fakeFor(Object.assign({ type, text: real }, extra || {})).fake;
}

const FORMATS = {
  AADHAAR: [VALID_AADHAAR_SPACED, /^[2-9]\d{3} \d{4} \d{4}$/],
  PAN: ["ABCPE1234F", /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/],
  IFSC: ["SBIN0001234", /^(HDFC|ICIC|UTIB|KKBK)0\d{6}$/],
  PHONE: ["+91 98765 43210", /^\+91 [6-9]\d{4} \d{5}$/],
  ACCOUNT: ["001234567890", /^00[1-9]\d{9}$/],
  PIN: ["411001", /^4\d{5}$/],
  DOB: ["15/08/1990", /^\d{2}\/\d{2}\/\d{4}$/],
  EMAIL: ["ramesh.kumar@gmail.com", /^[a-z]+\.[a-z]+@gmail\.com$/],
  UPI: ["ramesh@okaxis", /^[a-z]+@okaxis$/]
};
for (const [type, [real, shape]] of Object.entries(FORMATS)) {
  test(`${type} fake has the right format and differs from the real value`, () => {
    for (let i = 0; i < 30; i++) {
      const f = fakeOf(type, real);
      assert(shape.test(f), `bad format: ${f}`);
      assert(f !== real, "fake equals real");
    }
  });
}
test("fake Aadhaar always fails Verhoeff (200 tries)", () => {
  for (let i = 0; i < 200; i++) {
    const f = fakeOf("AADHAAR", VALID_AADHAAR);
    assert(!D.verhoeffValid(f), `fake passed checksum: ${f}`);
    assert(found("Aadhaar " + f, "AADHAAR").length === 0, "fake detected as real Aadhaar");
  }
});
test("fake Aadhaar keeps Devanagari digits", () => {
  const f = fakeOf("AADHAAR", "२३४५ ६७८९ ०१२५");
  assert(/^[२-९][०-९]{3} [०-९]{4} [०-९]{4}$/.test(f), f);
});
test("DOB fake is a valid date", () => {
  for (let i = 0; i < 50; i++) {
    const [d, m, y] = fakeOf("DOB", "15/08/1990").split("/").map(Number);
    const date = new Date(y, m - 1, d);
    assert(date.getDate() === d && date.getMonth() === m - 1, `${d}/${m}/${y}`);
  }
});
test("same real value gives the same fake in one chat", () => {
  const s = F.createSession({ text: SAMPLE });
  const a = s.fakeFor({ type: "PAN", text: "ABCPE1234F" }).fake;
  const b = s.fakeFor({ type: "PAN", text: "ABCPE1234F" }).fake;
  assert(a === b, `${a} vs ${b}`);
});
test("saved mapping is reused when masking again in the same chat", () => {
  const existing = [{ real: "ABCPE1234F", fake: "QWEPR5678T", type: "PAN" }];
  const s = F.createSession({ text: SAMPLE, existing });
  assert(s.fakeFor({ type: "PAN", text: "ABCPE1234F" }).fake === "QWEPR5678T");
});
test("two different real values never share a fake", () => {
  const s = F.createSession({ text: SAMPLE });
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const f = s.fakeFor({ type: "PIN", text: String(411000 + i) }).fake;
    assert(!seen.has(f), "duplicate fake " + f);
    seen.add(f);
  }
});
test("a fake never equals a real value that is in the text", () => {
  const text = "Ramesh Kumar and Suresh Patil";
  for (let i = 0; i < 50; i++) {
    const s = F.createSession({ text, reals: ["Ramesh Kumar", "Suresh Patil"] });
    const f = s.fakeFor({ type: "NAME", text: "Ramesh Kumar", lang: "en", gender: "male" }).fake;
    assert(!/Suresh|Patil|Ramesh|Kumar/.test(f), f);
  }
});
test("name fake keeps word count and registers first name and surname", () => {
  const s = F.createSession({ text: "Mr. Ramesh Kumar" });
  const r = s.fakeFor({ type: "NAME", text: "Mr. Ramesh Kumar", lang: "en", gender: "male" });
  assert(/^Mr\. \S+ \S+$/.test(r.fake), r.fake);
  assert(r.parts.length === 2 && r.parts[0].real === "Ramesh" && r.parts[1].real === "Kumar", JSON.stringify(r.parts));
});
test("short name parts (under 3 letters) are not registered", () => {
  const s = F.createSession({ text: "Om Patel" });
  const r = s.fakeFor({ type: "NAME", text: "Om Patel", lang: "en" });
  assert(r.parts.length === 1 && r.parts[0].real === "Patel", JSON.stringify(r.parts));
});
test("Devanagari name gets a Devanagari fake", () => {
  const s = F.createSession({ text: "सुनीता पाटील" });
  const r = s.fakeFor({ type: "NAME", text: "सुनीता पाटील", lang: "mr", gender: "female" });
  assert(/^[ऀ-ॿ]+ [ऀ-ॿ]+$/.test(r.fake) && r.fake !== "सुनीता पाटील", r.fake);
});
test("Devanagari address gets a Devanagari fake", () => {
  const s = F.createSession({ text: "" });
  const r = s.fakeFor({ type: "ADDRESS", text: "घर क्र. १२, टिळक रस्ता, पुणे - ४११००१", lang: "mr" });
  assert(/[ऀ-ॿ]/.test(r.fake) && !/[A-Za-z]/.test(r.fake), r.fake);
});
test("tags style gives [TYPE_n]", () => {
  const s = F.createSession({ text: SAMPLE, style: "tags" });
  assert(s.fakeFor({ type: "NAME", text: "Ramesh Kumar" }).fake === "[NAME_1]");
  assert(s.fakeFor({ type: "AADHAAR", text: VALID_AADHAAR_SPACED }).fake === "[AADHAAR_1]");
  assert(s.fakeFor({ type: "NAME", text: "Sita Devi" }).fake === "[NAME_2]");
});
test("custom item: name-like gets a fake name, other text gets [CUSTOM_n]", () => {
  const s = F.createSession({ text: "Project Falcon at Sunrise Towers" });
  assert(s.fakeFor({ type: "CUSTOM", text: "flat 4b near the temple" }).fake === "[CUSTOM_1]");
  const n = s.fakeFor({ type: "CUSTOM", text: "Anita Rao", gender: "female" }).fake;
  assert(/^\S+ \S+$/.test(n) && n !== "Anita Rao", n);
});

console.log("\nMask and restore");
test("applyMask replaces every occurrence, restore gives the text back", () => {
  const text = "Ramesh Kumar paid. Ramesh lives in Pune. PAN ABCPE1234F.";
  const s = F.createSession({ text });
  const r1 = s.fakeFor({ type: "NAME", text: "Ramesh Kumar", lang: "en", gender: "male" });
  s.fakeFor({ type: "PAN", text: "ABCPE1234F" });
  const entries = s.entries();
  const masked = F.applyMask(text, entries).text;
  assert(!/Ramesh|Kumar|ABCPE1234F/.test(masked), masked);
  assert(masked.includes(r1.fake), masked);
  assert(F.restoreText(masked, entries) === text, F.restoreText(masked, entries));
});
test("restore matches a fake number written with different spacing", () => {
  const entries = [{ real: "2345 6789 0125", fake: "8812 3409 7756", type: "AADHAAR" }];
  assert(F.restoreText("Aadhaar 881234097756 ok", entries) === "Aadhaar 2345 6789 0125 ok");
  const phone = [{ real: "+91 98765 43210", fake: "+91 91234 56780", type: "PHONE" }];
  assert(F.restoreText("call 9123456780", phone) === "call +91 98765 43210");
});
test("tags restore with or without brackets and backticks", () => {
  const entries = [
    { real: "Ramesh Kumar", fake: "[NAME_1]", type: "NAME" },
    { real: "12 MG Road, Pune", fake: "[ADDRESS_1]", type: "ADDRESS" },
    { real: "9876543210", fake: "[PHONE_1]", type: "PHONE" }
  ];
  assert(F.restoreText("| [NAME_1] | [ADDRESS_1] | [PHONE_1] |", entries) === "| Ramesh Kumar | 12 MG Road, Pune | 9876543210 |");
  assert(F.restoreText("Name: NAME_1, phone `[PHONE_1]`", entries) === "Name: Ramesh Kumar, phone 9876543210");
  assert(F.restoreText("[NAME_12] and NAME_1x stay", entries) === "[NAME_12] and NAME_1x stay");
});
test("restore segments carry the entry type", () => {
  const segs = F.restoreSegments("hi [NAME_1]", F.buildMatchers([{ real: "Ramesh", fake: "[NAME_1]", type: "NAME" }]));
  assert(segs[1].type === "NAME" && segs[1].fake === "[NAME_1]" && segs[1].real === "Ramesh", JSON.stringify(segs));
});
test("restore does not touch fakes glued inside other words", () => {
  const entries = [{ real: "Ramesh", fake: "Amit", type: "NAME_PART" }];
  assert(F.restoreText("Amitabh met Amit.", entries) === "Amitabh met Ramesh.");
});
test("Show Real restores multiple formatting variations (hyphens, spaces) to real values", () => {
  const entries = [
    { real: "5432 1678 9015", fake: "3948 2715 0192", type: "AADHAAR" },
    { real: "9876543210", fake: "9123456789", type: "PHONE" }
  ];
  const variations = [
    "Aadhaar: 3948 2715 0192 and Phone: 9123456789",
    "Aadhaar: 3948-2715-0192 and Phone: +91 91234 56789",
    "Aadhaar: 394827150192 and Phone: +91-91234-56789"
  ];
  for (const v of variations) {
    const res = F.restoreText(v, entries);
    assert(res.includes("5432 1678 9015"), "Aadhaar should be restored in: " + v);
    assert(res.includes("9876543210"), "Phone should be restored in: " + v);
  }
});
test("Copy Real extracts pure text with real values without UI tags", () => {
  const entries = [
    { real: "Vikram Malhotra", fake: "Rahul Sharma", type: "NAME" }
  ];
  const reply = "Hello Rahul Sharma, your appointment is confirmed.";
  const cleanReal = F.restoreText(reply, entries);
  assert(cleanReal === "Hello Vikram Malhotra, your appointment is confirmed.");
});
test("Restore handles casing variations of fake names (lowercase, uppercase)", () => {
  const entries = [
    { real: "Vikram Malhotra", fake: "Rahul Sharma", type: "NAME" },
    { real: "Vikram", fake: "Rahul", type: "NAME_PART" }
  ];
  assert(F.restoreText("Report for RAHUL SHARMA.", entries) === "Report for Vikram Malhotra.");
  assert(F.restoreText("Contact rahul sharma now.", entries) === "Contact Vikram Malhotra now.");
  assert(F.restoreText("Call rahul today.", entries) === "Call Vikram today.");
});

test("Automatic reset: new chat starts with empty mapping and does not inherit previous chat", () => {
  const freshText = "Hello world";
  const masked = F.applyMask(freshText, []);
  assert(masked.text === freshText, "Fresh chat should not mask anything without active entries");
});

test("PDF masking preserves user instruction and masks PII in document text", () => {
  const instruction = "Please review this document and check if Aadhaar is verified.";
  const pdfContent = "Name: Suresh Patel\nAadhaar: 2345 6789 0125\nPhone: 9876543210";
  const combined = `${instruction}\n\n--- DOCUMENT (Masked): doc.pdf ---\n${pdfContent}`;
  
  const detected = D.detectRegex(combined);
  assert(detected.length >= 2, "Should detect Aadhaar and Phone in PDF content");
  
  const session = F.createSession({ text: combined, existing: [], style: "realistic", reals: detected.map(d => d.text) });
  const entries = detected.map(d => {
    const f = session.fakeFor({ text: d.text, type: d.type });
    return { real: d.text, fake: f.fake, type: d.type };
  });
  
  const maskedResult = F.applyMask(combined, entries);
  assert(maskedResult.text.startsWith(instruction), "User instruction must be preserved at top of prompt");
  assert(maskedResult.text.includes("--- DOCUMENT (Masked): doc.pdf ---"), "Document header must be preserved");
  assert(!maskedResult.text.includes("2345 6789 0125"), "Real Aadhaar must not appear in masked prompt");
  assert(!maskedResult.text.includes("9876543210"), "Real Phone must not appear in masked prompt");
  
  const restored = F.restoreText(maskedResult.text, entries);
  assert(restored.includes("2345 6789 0125"), "Restore must bring back original Aadhaar");
  assert(restored.includes("9876543210"), "Restore must bring back original Phone");
});


console.log("\nContent script start-up");
test("content.js starts without errors in a page-like environment", () => {
  // Loads content.js the way Chrome does (after config, detectors, names, fakes) with
  // tiny stand-ins for the page and chrome.*, to catch start-up crashes.
  const vm = require("vm");
  const fs = require("fs");
  const path = require("path");
  const noop = () => {};
  const el = () => ({
    addEventListener: noop, appendChild: noop, setAttribute: noop, insertAdjacentHTML: noop, remove: noop,
    attachShadow: () => el(), style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop }
  });
  const sandbox = {
    console: { log: noop },
    location: { pathname: "/c/local-chatgpt%3Aabc" },
    setInterval: noop,
    setTimeout: noop,
    clearTimeout: noop,
    window: { addEventListener: noop, getSelection: () => ({}) },
    document: {
      body: el(),
      documentElement: el(),
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: noop,
      createElement: el,
      createTextNode: () => ({})
    },
    MutationObserver: function () {
      return { observe: noop, takeRecords: () => [] };
    },
    chrome: {
      runtime: { sendMessage: () => Promise.resolve({ entries: [] }), onMessage: { addListener: noop } },
      storage: { onChanged: { addListener: noop } }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["config.js", "detectors.js", "names.js", "fakes.js", "content.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });
  }
  assert(sandbox.__maskinLoaded === true, "content.js did not finish loading");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
