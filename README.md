# MaskIN

<<<<<<< HEAD
Use ChatGPT on private Indian documents without ChatGPT seeing the real details.

MaskIN is a Chrome extension for chatgpt.com. Before a message leaves your laptop, it swaps names, addresses and ID numbers for realistic fakes. When ChatGPT replies, it puts the real values back, on your screen only. Detection runs locally: simple pattern rules for ID numbers, and Google's open-weight Gemma 4 model (through Ollama on your Mac) for names and addresses.

Built for Hacktoberfest Hack Day 2026 (NST Pune), Problem Statement #3: PII redaction for Indian documents and languages. Main Track: Best Open-Source AI Project.

## The problem

People paste documents with names, Aadhaar numbers, PAN numbers and bank account numbers into cloud chatbots every day. PS #3 asks for a way to keep using online chat tools with private documents without exposing those details.

MaskIN does not ask people to stop using ChatGPT. It sits between the user and ChatGPT, the way Grammarly sits inside a text box. It understands Indian documents: Aadhaar, PAN, IFSC, UPI IDs, Indian phone numbers, PIN codes and bank account numbers, and names and addresses written in English, Hindi and Marathi (Devanagari script).

## How it works (8 steps)

1. Type, paste or drop a document (text PDF, scanned PDF, JPG or PNG) while using ChatGPT as usual.
2. Click **Mask** (next to ChatGPT's Send button) or press **Option+Shift+M**.
3. Detection runs on your laptop: regex finds Indian IDs and numbers, Gemma finds names and addresses.
4. A **Review** popup lists everything found. You can untick items or add ones it missed.
5. Each item is swapped for a fake. The mapping (fake to real) is saved in the browser on this laptop, for this chat only.
6. You press Send. ChatGPT only receives the fakes.
7. When the reply is finished, the fakes are swapped back to the real values, on screen only.
8. A badge under the reply shows "MaskIN: N restored", with **Copy real** and **Show what ChatGPT saw** buttons. If ChatGPT changed an ID-like value, the badge turns amber and asks you to check.

Also included:
- **Send guard:** if you press Send without masking and the message contains IDs or numbers, MaskIN stops the send and asks: Mask now, Send anyway, or Cancel. This check is regex only, so it takes milliseconds.
- **Document input:** drop a PDF or photo into the side panel. Text PDFs are read with pdf.js; scanned PDFs and photos are read with Tesseract.js OCR (English, Hindi, Marathi). Everything happens on the laptop.
- **Regex-only mode:** if Ollama is not running, MaskIN still hides IDs and numbers and says clearly that names and addresses were not checked.
- **Show real values on screen:** in the side panel, tick which types (Name, Address, Phone, Aadhaar, PAN, ...) are shown as real values in this chat. Unticked types stay as the fake or tag. The choice is saved per chat and applies instantly. It is a display overlay only: ChatGPT's message box, what was sent and ChatGPT's own copy button are never changed, and **Copy real** copies only the ticked types as real.

## What we hide and what we keep

| Hidden | How it is found | Replaced with |
|---|---|---|
| Person names | Gemma (local) | A realistic fake name of the same language, script and gender |
| Postal addresses | Gemma (local) | A fake address from local lists, same script |
| Aadhaar | Regex + Verhoeff checksum | 12 random digits, same spacing (see note below) |
| PAN, IFSC | Regex | Same format, random (IFSC uses real-looking bank prefixes) |
| Phone numbers | Regex | 10 digits starting 6-9, same prefix style |
| Email, UPI ID | Regex | Fake name handle, same domain / payment app |
| Bank account, PIN code, date of birth | Regex, only near words like "A/c", "PIN", "DOB" | Same length and format |
| Anything you add yourself | You | A fake name if it looks like a name, else a tag like `[CUSTOM_1]` |

We do **not** hide salary, loan amounts, prices, bill amounts or medical details. On their own these numbers do not point to anyone, and ChatGPT needs them to do the calculation you asked for. Once the name and IDs are swapped, those numbers belong to nobody.

The same real value always gets the same fake within one chat, so follow-up questions keep working. A fake never equals a real value in the text. In the side panel you can switch "Fake style" to **Tags** to get `[NAME_1]`, `[AADHAAR_1]` and so on instead of realistic fakes.

**Note on fake Aadhaar numbers:** every fake Aadhaar is made to **fail** the Verhoeff checksum on purpose. A fake can therefore never be a real person's Aadhaar number, and MaskIN can tell its own fakes apart from real-looking numbers. (When checking ChatGPT's reply for changed values, the checksum is skipped for this reason.)

## Privacy: what stays and what leaves

| Data | Where it lives | Leaves the laptop? |
|---|---|---|
| The original text you type or paste | ChatGPT's input box, until you click Mask | No, it is replaced before sending |
| Text checked by Gemma | Ollama on `localhost:11434` | No. Localhost is the computer talking to itself |
| PDFs, scans, photos | Read in the side panel by pdf.js and Tesseract.js | No. Never uploaded. OCR language files are bundled in the extension |
| Mapping (fake to real) | `chrome.storage.local`, one key per chat | No. We never use `chrome.storage.sync` |
| Masked text | Sent by you to ChatGPT | Yes. This is the only thing that leaves, and it has fakes only |
| Restored replies | Only in the page on your screen | No. ChatGPT still holds the fake version |
| Analytics, logs, tracking | None | MaskIN makes no network calls except to `localhost:11434` |

The extension only runs on `https://chatgpt.com/*` and only talks to `http://localhost:11434`. You can check this in `manifest.json`.

## Setup on a Mac

1. Install Ollama from [ollama.com](https://ollama.com) (the macOS app) and open it once.
2. Download the model in Terminal:
   ```bash
   ollama pull gemma4:e4b
   ```
   On an 8 GB Mac use `gemma4:e2b` instead, and pick it in MaskIN's side panel settings.
3. Allow the extension to talk to Ollama (without this, Ollama blocks the extension):
   ```bash
   launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
   ```
   Then quit Ollama from the menu bar and open it again.
4. Optional test:
   ```bash
   ollama run gemma4:e4b "List the person names in: Ramesh Kumar paid Sunita Patil"
   ```
5. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose this folder.
6. Pin the MaskIN icon, open chatgpt.com, click the icon to open the side panel and check that the status card is green ("Local AI: connected").
7. After any code change: click the reload icon on `chrome://extensions`, then refresh the ChatGPT tab.

`launchctl setenv` lasts until the Mac restarts. After a restart, run step 3 again before opening Ollama.

## If restore does not happen

1. Open the side panel and click **Restore now** under "This chat". It reloads the mapping and restores the whole chat, and shows which storage key it used and how many entries it found.
2. Open Chrome's console on the ChatGPT tab (View > Developer > JavaScript Console) and type `[MaskIN]` in the filter box. MaskIN logs the chat ID, the mapping key used for save and load, the pending-to-chat move, each message it finds, when a reply is considered finished, and how many values it replaced. Real values are never logged.

## The 8 use cases

Fake sample documents are in [`samples/`](samples/). [`samples/USE_CASES.md`](samples/USE_CASES.md) has the exact question to ask ChatGPT for each one.

| # | Document | Ask ChatGPT | MaskIN hides |
|---|---|---|---|
| 1 | 10 KYC letters (text PDF) | Make a table of all names, addresses and phone numbers | Names, addresses, phones, Aadhaar |
| 2 | Salary slip | Calculate my tax under the new regime | Name, PAN, account number, employer address. Salary stays visible |
| 3 | Rent agreement | Summarise it and list anything unfair to the tenant | Landlord and tenant names, addresses, Aadhaar, PAN |
| 4 | Bank statement | Explain these charges and total my UPI spends | Name, account number, IFSC, UPI IDs. Amounts stay visible |
| 5 | Failed transaction details | Write a complaint email to my bank | Name, account number, UPI ID, phone, email |
| 6 | Photo of a filled form | Turn this into a clean typed summary | Read by OCR, then names, IDs, address hidden |
| 7 | Scanned Marathi letter | Translate and explain it in English | Devanagari names, address, Aadhaar, phone |
| 8 | Hospital bill | Check if the claim amount is correct | Patient name, address, phone, policy holder. Bill amounts stay visible |

## Tech stack

- Chrome extension, Manifest V3, plain JavaScript, HTML and CSS. No framework and no build step.
- Content script on chatgpt.com for the Mask button, Send guard, Review popup, restore and badge. Popups use Shadow DOM so ChatGPT's styles and ours never mix.
- Background service worker (ES module) for the detection pipeline, fakes and mapping.
- Chrome side panel for status, settings, documents and saved data.
- Ollama + Gemma 4 for names and addresses (`POST /api/chat`, JSON output, temperature 0).
- Regex + Verhoeff checksum for Indian IDs. Devanagari digits (०-९) are handled.
- pdf.js for PDFs and Tesseract.js for OCR, both bundled in `lib/`.
- Node.js tests: `node tests/run.js`.

### Files

| File | What it does |
|---|---|
| `manifest.json` | Extension name, permissions and files |
| `config.js` | All ChatGPT page selectors and default settings. When chatgpt.com changes, only this file should need an update |
| `detectors.js` | Regex rules, Verhoeff checksum, Devanagari digits, merging results |
| `names.js` | Local lists of Indian names, surnames, streets, areas and cities (English and Devanagari) |
| `fakes.js` | Builds fakes, masks text, finds fakes in replies |
| `content.js` / `content.css` | Everything on the ChatGPT page |
| `background.js` | Pipeline: regex + Gemma, merge, fakes, mapping, status, keyboard shortcut |
| `ollama.js` | The only file that talks to `localhost:11434` |
| `storage.js` | Reads, writes, migrates and clears data in `chrome.storage.local` |
| `sidepanel.html/js/css` | The side panel |
| `lib/` | pdf.js, Tesseract.js, OCR engine and English/Hindi/Marathi language data |
| `tests/run.js` | Tests for detectors and fakes |
| `samples/` | Fake documents for the 8 use cases |

Run the tests:
```bash
node tests/run.js
```

## Models, tools and licenses

| Part | License |
|---|---|
| Gemma 4 (E4B / E2B), Google's open-weight model | License: <confirm from Google's official Gemma 4 model card> |
| Ollama | MIT |
| pdf.js (pdfjs-dist) | Apache 2.0 |
| Tesseract.js and tesseract.js-core | Apache 2.0 |
| Tesseract language data (eng, hin, mar) | Apache 2.0 |
| MaskIN code (this repository) | MIT, see [LICENSE](LICENSE) |

**Tools used to build it:** Claude Code and Antigravity were used as AI coding assistants to write the code. They are not part of the product. Every part was tested by the team, and each member can explain the files they own.

## Known limits

- Works on chatgpt.com in desktop Google Chrome only, in this version.
- A small local model can miss names or addresses. That is why you review everything before anything is sent, and can add missed items.
- Gemma takes a few seconds per 1,500 characters (the first scan after starting Ollama is slower while the model loads). The Send guard does not use Gemma, so it stays instant.
- OCR takes a few seconds per page and depends on scan quality. Limits: 20 pages for text PDFs, 10 pages for scans.
- The text layer of many PDFs loses Devanagari vowel signs, so PDF pages with Hindi or Marathi text are read with OCR instead.
- Restore works on text shown in the chat. Files that ChatGPT creates for download (like an Excel file) still contain fakes. ChatGPT's own copy button copies the fake version; use MaskIN's **Copy real**.
- If ChatGPT rewrites a fake in a different form (for example, changes the spelling of a name), it cannot be restored. ID-like values that look changed turn the badge amber.
- The mapping in `chrome.storage.local` is not encrypted yet. Someone with access to the unlocked laptop could read it. Use the **Clear** buttons in the side panel to delete it at any time.
- Gemma needs Ollama running. Without it, MaskIN falls back to regex-only mode and says so.

## Team

- Shri (shrichoudhary7) — idea, prompting and build lead
- `<Member name>` — `<role>`
- `<Member name>` — `<role>`
- `<Member name>` — `<role>`
=======
MaskIN is a privacy-first browser extension for ChatGPT that masks sensitive Indian personal data before it leaves the user's laptop and restores it only on the user's screen.

## Why this exists

People paste documents with names, Aadhaar numbers, PAN, addresses, bank details, and phone numbers into chatbots every day. ChatGPT is useful, but once that data leaves the laptop, the user has no control over where it goes.

MaskIN sits between the user and ChatGPT, the same way Grammarly sits inside a text box. It protects sensitive data without forcing users to stop using AI.

## One-line summary

MaskIN swaps private details with realistic fakes before they reach ChatGPT, uses Gemma locally on the Mac, and restores the real values in the reply only on the user's screen.

## How it works

1. Paste, type, or drop a document (PDF, scanned PDF, or image) while using ChatGPT normally.
2. Click the Mask button next to Send or use the shortcut Option + Shift + M.
3. Detect sensitive values on the laptop using regex for exact formats and Gemma for names and addresses.
4. Review the detected items in a popup and remove, confirm, or add anything missed.
5. Replace each sensitive item with a realistic fake value while keeping the same structure and language.
6. Send the masked text to ChatGPT.
7. When ChatGPT replies, MaskIN restores the original values only in the browser on the user's screen.
8. A badge indicates how many values were restored and warns if a fake value appears to have been changed.

## Core principles

- Regex handles exact formats like Aadhaar, PAN, phone numbers, emails, IFSC, and bank accounts.
- Gemma handles fuzzy items such as names, addresses, and contextual entities.
- Everything sensitive stays on the laptop.
- Only fake values leave the device to ChatGPT.
- Real values come back only in the user's own view.

## Example

- Name: "Ramesh Kumar" becomes "Suresh Patil" in ChatGPT, while the user still sees "Ramesh Kumar" in the reply.
- Aadhaar: "2345 6789 0123" becomes "8812 3409 7756" for ChatGPT, while the user sees the original value.
- PAN: "ABCDE1234F" becomes "KLMPQ6621R" for ChatGPT, while the user still sees the original.
- Phone: "+91 98765 43210" becomes "+91 91234 56780" for ChatGPT, while the user sees the real number.

## Features

- Mask button next to ChatGPT's Send button and shortcut: Option + Shift + M
- Review popup listing all detected sensitive values with reasons and previews
- User can uncheck items or add missed ones before sending
- Realistic fake values matched to language and gender, or optional tags such as [NAME_1]
- Send guard that blocks accidental sending without masking
- Restore with proof, including "Show what ChatGPT saw" and "Copy real" actions
- Warning if ChatGPT changes a fake ID or value
- Document input support for text PDFs, scanned PDFs, and images
- Hindi and Marathi support for Devanagari names, addresses, and digits
- Regex-only mode when local AI is unavailable, still protecting ID and number fields
- Clear data controls for one chat or the entire extension state

## What gets detected

### Fixed-format identifiers

Aadhaar, PAN, IFSC, phone, email, UPI, PIN, account number, and DOB.

These are handled by regex and validation logic. AI is not trusted for numeric or exact-string identification.

### Names and addresses

Names and addresses are identified with Gemma 4 locally on the laptop. This covers English and Devanagari inputs.

### Real Aadhaar validation

A 12-digit number is checked using the Verhoeff checksum to reduce false positives from non-real IDs.

## Tech stack

- Browser: Google Chrome (desktop, macOS)
- Extension format: Chrome Extension, Manifest V3
- Language: Vanilla JavaScript, HTML, and CSS
- Page integration: Content script on https://chatgpt.com/*
- UI isolation: Shadow DOM
- Background logic: Background service worker (ES module)
- Side panel: Chrome sidePanel API
- Local AI engine: Ollama (MIT)
- Local AI model: Gemma 4 E4B (default), E2B (for 8 GB Macs)
- Pattern detection: Regex + Verhoeff checksum
- Fake data: Local lists of Indian names, surnames, streets, and cities in English and Devanagari
- Storage: chrome.storage.local (never sync)
- Watcher: MutationObserver
- PDF reading: pdf.js (Apache 2.0)
- OCR: Tesseract.js with English, Hindi, and Marathi support (Apache 2.0)

## Data and privacy

### What stays on the laptop

- Original text typed or pasted into the input box before masking
- Text sent to Gemma for local detection
- PDFs and images read locally for OCR
- Mapping between fake and real values stored in browser local storage
- Restored reply text shown only on the screen

### What leaves the laptop

- Only the masked text that the user sends to ChatGPT

### Privacy guarantees

- No remote upload of PDFs, scans, or photos
- No analytics or tracking network calls beyond localhost
- No use of chrome.storage.sync for sensitive mappings
- Mapping is stored per chat ID, so follow-up questions in the same chat still restore correctly
- Clear data buttons allow deleting one chat or all saved data at any time

> Honest limitation: chrome.storage.local is not encrypted yet. The clear-data actions remove stored information whenever needed.

## Setup on a Mac

1. Install Ollama from ollama.com and open it once.
2. Pull the model:
   - `ollama pull gemma4:e4b` for 16 GB RAM or more
   - `ollama pull gemma4:e2b` for 8 GB Macs
3. Allow the extension to talk to Ollama:
   - `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"`
   - Then quit Ollama and reopen it.
4. Test the local model:
   - `ollama run gemma4:e4b "List the person names in: Ramesh Kumar paid Sunita Patil"`
5. In Chrome, open `chrome://extensions`, enable Developer mode, then click Load unpacked and select the MaskIN folder.
6. Pin the MaskIN icon, open ChatGPT, open the side panel, and verify the status card is green.
7. After any code change, reload the extension from `chrome://extensions` and refresh the ChatGPT tab.

## FAQ

### Why not use Gemma directly instead of ChatGPT?

A small local model is much weaker than ChatGPT for long documents and analysis. MaskIN uses Gemma for the privacy-sensitive but simple tasks, while ChatGPT handles the heavier reasoning on safe data.

### Does anything leave the laptop?

Only the masked text that the user intentionally sends to ChatGPT.

### Why use fakes instead of [REDACTED]?

ChatGPT performs better on natural text. MaskIN preserves meaning and readability while still protecting privacy.

### What if Gemma misses a name?

The review popup appears before sending, and the user can add or remove detected values with one click.

### What if ChatGPT changes a fake value?

The reply is checked with the same detectors. If an ID-like value is not one created by MaskIN, the badge turns amber and prompts the user to inspect it.

### Can the extension read my other websites?

No. It only runs on chatgpt.com and talks only to localhost:11434.

## Who does what

- Aadhaar, PAN, IFSC, phone, email, UPI, PIN, account number, DOB
  - Done by: Regex and validation
  - Why: Fixed formats require exact and instant detection

- Check that a 12-digit number is a real Aadhaar
  - Done by: Verhoeff checksum
  - Why: Prevents false positives from ordinary IDs

- Names and addresses
  - Done by: Gemma 4 (local)
  - Why: These do not follow fixed patterns and may be in English or Devanagari

- Language and gender of a name
  - Done by: Gemma 4 (local)
  - Why: A Marathi name should get a Marathi fake

- Reading scans and photos
  - Done by: Tesseract.js OCR (local)
  - Why: Converts images into text so the same detection pipeline can run

- Picking the fake name or address
  - Done by: Code using local lists
  - Why: Fast, consistent, and never repeats true values

- Fake IDs in the correct format
  - Done by: Code (fakes.js)
  - Why: Ensures exact format without AI guessing

- Saving the mapping
  - Done by: Code with chrome.storage.local
  - Why: A model cannot be trusted to safely store private data

- Restoring real values after reply generation
  - Done by: Code with exact find-and-replace logic
  - Why: It must be exact, not probabilistic

- The actual task, summary, or report generation
  - Done by: ChatGPT
  - Why: The large model does the reasoning, but only on fake data

## License information

- MaskIN code: MIT License
- Ollama: MIT
- pdf.js and Tesseract.js: Apache 2.0
- Gemma 4: Open-weight model used under Google's license terms

## Final note

MaskIN is designed to make private AI usage practical: users can keep using ChatGPT while keeping their sensitive data on their own machine, with no permanent exposure to the cloud beyond the masked text they intentionally send.
>>>>>>> 0542b2a1091b3782414266390edf990efa026a4f
