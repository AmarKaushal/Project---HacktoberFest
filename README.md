# MaskIN

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
