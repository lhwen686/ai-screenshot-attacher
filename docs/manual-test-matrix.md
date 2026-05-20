# Manual Test Matrix

Run `npm run verify` and `npm run package` before manual browser testing.

Load `dist/` manually from `chrome://extensions` or `edge://extensions`. Do not start Chrome with command-line extension flags.

## Core Matrix

| Target  | Manual Shortcut                                     | Popup Button               | Automatic Mode                                  | Failure Fallback                                    |
| ------- | --------------------------------------------------- | -------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| ChatGPT | `Alt+Shift+1` attaches screenshot and does not send | Button attaches to ChatGPT | New screenshot attaches to focused/open ChatGPT | Input focused and screenshot can be pasted manually |
| Claude  | `Alt+Shift+2` attaches screenshot and does not send | Button attaches to Claude  | New screenshot attaches to focused/open Claude  | Input focused and screenshot can be pasted manually |
| Gemini  | `Alt+Shift+3` attaches screenshot and does not send | Button attaches to Gemini  | New screenshot attaches to focused/open Gemini  | Input focused and screenshot can be pasted manually |
| Doubao  | Assign manually or use default model                | Button attaches to Doubao  | New screenshot attaches to focused/open Doubao  | Input focused and screenshot can be pasted manually |

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
