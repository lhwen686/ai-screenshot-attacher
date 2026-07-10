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
