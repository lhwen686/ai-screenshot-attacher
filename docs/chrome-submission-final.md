# Chrome Web Store Submission Packet

Status: blocked until the public URL fields below resolve successfully.

## Submission Blockers

- BLOCKER: Public URL values are present in the repository, but a reachability check on 2026-07-10 returned `404 Not Found` for the home, privacy, support, and FAQ URLs. Publish the GitHub Pages site or replace these placeholders with confirmed public URLs before submitting.
- No missing package, screenshot, promo image, listing text, reviewer note, or permission-justification value was found in this packet.

## Package

- Exact package path: `C:\Users\柳皓文\OneDrive\Documents\without paste picture\release\ai-screenshot-attacher-v0.1.0.zip`
- Version: `0.1.0`
- Minimum browser version: Chrome 109.
- Manifest source: `manifest.json`
- Submission action: Do not submit from this packet automatically.

## Listing Text

- Name: AI Screenshot Attacher
- Short name: AI Attacher
- Category: Productivity
- Language: English, with Chinese in-extension UI and bilingual README.
- Short description: Attach clipboard screenshots to ChatGPT, Claude, Gemini, or Doubao after your action. It never sends messages automatically.

Detailed description:

AI Screenshot Attacher helps you move a screenshot from the system clipboard into an AI chat page with less manual work.

Capture a screenshot, choose ChatGPT, Claude, Gemini, or Doubao, and the extension attaches the image to the target input area. You still review the attachment, write your prompt, and send the message yourself.

Privacy boundaries:

- No automatic message sending.
- No chat history reads.
- No screenshot history.
- No extension-author server upload.
- Automatic mode is off by default and only runs while a supported AI page is already open.

Supported targets:

- ChatGPT
- Claude
- Gemini
- Doubao

Known limits:

- AI websites change their frontends frequently, so attachment behavior may need adapter updates.
- Some websites may reject synthetic paste or drop events. When this happens, the extension keeps the screenshot available for manual paste and focuses the input where possible.
- The extension does not bypass login, account checks, cookies, or target-site upload limits.

## Public URL Fields

- Home URL: `https://lhwen686.github.io/ai-screenshot-attacher/`
- Privacy URL placeholder: `https://lhwen686.github.io/ai-screenshot-attacher/privacy/`
- Support URL placeholder: `https://lhwen686.github.io/ai-screenshot-attacher/support/`
- FAQ URL: `https://lhwen686.github.io/ai-screenshot-attacher/faq/`

Source: `docs/chrome-web-store-listing.md` and `docs/public-site-validation.md`.

Reachability status as of 2026-07-10: BLOCKER until these URLs return successful public responses.

## Screenshot File List

- `store-assets/chrome-web-store/screenshot-workflow-1280x800.png`
- `store-assets/chrome-web-store/screenshot-settings-1280x800.png`
- `store-assets/chrome-web-store/screenshot-privacy-1280x800.png`
- `store-assets/chrome-web-store/screenshot-shortcuts-1280x800.png`
- `store-assets/chrome-web-store/screenshot-fallback-1280x800.png`

## Promo Image File List

- `store-assets/chrome-web-store/icon-128.png`
- `store-assets/chrome-web-store/small-promo-440x280.png`
- `store-assets/chrome-web-store/marquee-promo-1400x560.png`

## Reviewer Test Notes

1. Load the extension package through the browser extension dashboard manually.
2. Open the popup.
3. Copy a screenshot to the system clipboard.
4. Use the popup button for ChatGPT, Claude, Gemini, or Doubao, or use the default shortcuts for ChatGPT/Claude/Gemini.
5. Confirm the image appears in the target AI site's input attachment area.
6. Confirm the extension does not send the AI message automatically.
7. Test with text-only clipboard content and confirm the no-image message appears.
8. Enable automatic mode, keep a supported AI page open, copy a fresh screenshot, and confirm the extension only attaches to an already open supported page.
9. Test a failed attachment path and confirm the screenshot remains available for manual paste when fallback write-back is enabled.

Do not test by launching Chrome with extension command-line flags. Load the unpacked `dist/` folder manually through the browser extensions page if manual unpacked testing is needed.

## Permission Justifications

Full audit source: `marketing/store-listing/permission-justifications.md`

- `clipboardRead`: reads the clipboard screenshot after user action or while automatic mode is enabled.
- `clipboardWrite`: prepares the captured image immediately before a user-triggered Gemini/Doubao browser paste, and restores it after a failed attachment when fallback is enabled. Automatic mode does not use real clipboard paste.
- `tabs`: opens, finds, focuses, and monitors supported AI pages; also opens user-requested help/privacy/support links.
- `activeTab`: supports user-invoked page feedback on the current HTTP(S) tab.
- `scripting`: injects the target-site attachment runtime and shows page feedback.
- `storage`: saves settings, latest operation result, and automatic-mode duplicate-suppression state.
- `offscreen`: performs Manifest V3 clipboard access from an offscreen document.

Host permissions are limited to:

- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://doubao.com/*`
- `https://www.doubao.com/*`

They are needed to open, find, focus, and inject attachment logic only on the supported AI sites.
