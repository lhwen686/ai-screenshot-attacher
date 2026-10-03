# Manual Test Matrix

Run `npm run verify` and `npm run package` before manual browser testing.

Load `dist/` manually from `chrome://extensions` or `edge://extensions`. Do not start Chrome with command-line extension flags.

For public promotion or store submission, also review `PRIVACY.md`, `docs/chrome-web-store-listing.md`, and the generated assets in `store-assets/chrome-web-store/`.

## Core Matrix

| Target  | Manual Shortcut                                     | Popup Button               | Automatic Mode                                  | Failure Fallback                                               |
| ------- | --------------------------------------------------- | -------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| ChatGPT | `Alt+Shift+1` attaches screenshot and does not send | Button attaches to ChatGPT | New screenshot attaches to focused/open ChatGPT | Screenshot preserved; input focused when composer is reachable |
| Claude  | `Alt+Shift+2` attaches screenshot and does not send | Button attaches to Claude  | New screenshot attaches to focused/open Claude  | Screenshot preserved; input focused when composer is reachable |
| Gemini  | `Alt+Shift+3` attaches screenshot and does not send | Button attaches to Gemini  | New screenshot attaches to focused/open Gemini  | Screenshot preserved; input focused when composer is reachable |
| Doubao  | Assign manually or use default model                | Button attaches to Doubao  | New screenshot attaches to focused/open Doubao  | Screenshot preserved; input focused when composer is reachable |

## Required Scenarios

- Clipboard contains a fresh `Win+Shift+S` screenshot.
- Clipboard contains text only; extension shows the no-image message.
- Target page is already open in a normal tab.
- Target page is not open and `openInNewTab` is enabled.
- Settings can choose ChatGPT, Claude, Gemini, or Doubao as the default model for `Alt+Shift+A` and the popup primary button.
- Automatic mode is disabled by default.
- Automatic mode stops when no supported target page is open.
- Extension never sends the AI message automatically.
- Debug logs do not include image binary data, base64 data, or chat content.
- Popup feedback/privacy links open the public GitHub issue and privacy-policy pages.
- Options page explains first use, privacy boundaries, shortcut management, and feedback.

## Regression Scenarios For The Attachment Pipeline Optimization

- With automatic mode on and a supported page open, a new screenshot attaches within about 1 second.
- Reload the extension from `chrome://extensions` with a screenshot already on the clipboard: the old image is not attached; the next new screenshot is.
- Trigger a failed automatic attachment (for example, hide or remove the composer) with "write back on failure" enabled: the write-back does not cause a second automatic attachment.
- Run a manual Gemini or Doubao attachment while automatic mode is on: the screenshot appears once, not twice.
- On Gemini, when the upload menu offers no usable upload item, the menu is closed afterward and no OS file picker opens.
- Press the same shortcut twice quickly: only one attachment appears.
- Close the target tab while it is still loading after a shortcut: the popup reports a failure promptly instead of waiting about 15 seconds.
