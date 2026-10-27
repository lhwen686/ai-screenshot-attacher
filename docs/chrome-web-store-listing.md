# Chrome Web Store Listing

This is 0.2.0 candidate copy. Complete live Grok acceptance before submitting it to a store. See [the audit](audit-2026-10-27.md).

Use this file as the source text for the Chrome Web Store dashboard.

## Basic Listing

- Name: AI Screenshot Attacher
- Short name: AI Attacher
- Category: Productivity
- Language: English, with Chinese in-extension UI and bilingual README.
- Minimum browser version: Chrome 109.
- Short description: Attach clipboard screenshots to ChatGPT, Claude, Gemini, Doubao, or Grok. Never sends messages automatically.

## Public Website URLs

- Home: `https://lhw686.me/ai-screenshot-attacher/`
- Privacy: `https://lhw686.me/ai-screenshot-attacher/privacy/`
- Support: `https://lhw686.me/ai-screenshot-attacher/support/`
- FAQ: `https://lhw686.me/ai-screenshot-attacher/faq/`

These pages are static files under `docs/`, published by GitHub Pages from `main:/docs`. They include English and Simplified Chinese content and no analytics scripts. The `lhwen686.github.io` addresses redirect to these pages over plain HTTP, so use the HTTPS addresses above.

## Detailed Description

AI Screenshot Attacher helps you move a screenshot from the system clipboard into an AI chat page with less manual work.

Capture a screenshot, choose ChatGPT, Claude, Gemini, Doubao, or Grok, and the extension attaches the image to the target input area. You still review the attachment, write your prompt, and send the message yourself.

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
- Grok (`grok.com`; signed-in upload required)

Known limits:

- AI websites change their frontends frequently, so attachment behavior may need adapter updates.
- Some websites may reject synthetic paste or drop events. When this happens, the extension keeps the screenshot available for manual paste and focuses the input where possible.
- The extension does not bypass login, account checks, cookies, or target-site upload limits.

## Assets

- Icon: `store-assets/chrome-web-store/icon-128.png`
- Small promotional tile: `store-assets/chrome-web-store/small-promo-440x280.png`
- Marquee promotional image: `store-assets/chrome-web-store/marquee-promo-1400x560.png`
- Screenshots:
  - `store-assets/chrome-web-store/screenshot-workflow-1280x800.png`
  - `store-assets/chrome-web-store/screenshot-settings-1280x800.png`
  - `store-assets/chrome-web-store/screenshot-privacy-1280x800.png`
  - `store-assets/chrome-web-store/screenshot-shortcuts-1280x800.png`
  - `store-assets/chrome-web-store/screenshot-fallback-1280x800.png`

The source visual files were generated with the image generation workflow requested for promotion assets and kept as:

- `store-assets/chrome-web-store/source-gpt-image-2-workflow.png`
- `store-assets/chrome-web-store/source-gpt-image-2-icon.png`

Validate store asset dimensions with:

```bash
node scripts/validate-store-assets.mjs
```

## Permission Justification

- Detailed audit: `marketing/store-listing/permission-justifications.md`
- `clipboardRead`: reads the clipboard screenshot after user action or while automatic mode is enabled.
- `clipboardWrite`: prepares the captured image immediately before a user-triggered Gemini/Doubao browser paste, and restores it after a failed attachment when fallback is enabled. Automatic mode does not use real clipboard paste.
- `tabs`: opens, finds, focuses, and monitors supported AI pages; also opens user-requested help/privacy/support links.
- `activeTab`: supports user-invoked page feedback on the current HTTP(S) tab.
- `scripting`: injects the target-site attachment runtime and shows page feedback.
- `storage`: saves settings, latest operation result, and automatic-mode duplicate-suppression state.
- `offscreen`: performs MV3 clipboard access from an offscreen document.

Host permissions are limited to supported AI sites and should not be broadened for store submission.

## Reviewer Test Notes

1. Load the extension and open the popup.
2. Copy a screenshot to the system clipboard.
3. Use the popup button for ChatGPT, Claude, Gemini, Doubao, or Grok, or use the default shortcuts for ChatGPT/Claude/Gemini.
4. Confirm the image appears in the AI site's input attachment area.
5. Confirm the extension does not send the AI message.
6. Test with text-only clipboard content and confirm the no-image message appears.
7. Enable automatic mode, keep a supported AI page open, copy a fresh screenshot, and confirm the extension only attaches to an already open supported page.

Do not test by launching Chrome with extension command-line flags. Load the unpacked `dist/` folder manually through the browser extensions page.
