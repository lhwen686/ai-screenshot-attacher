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
| Grok    | Assign manually or use default model                | Button attaches to Grok    | New screenshot attaches to focused/open Grok    | Screenshot preserved; input focused when composer is reachable |

## Required Scenarios

- Clipboard contains a fresh `Win+Shift+S` screenshot.
- Clipboard contains text only; extension shows the no-image message.
- Target page is already open in a normal tab.
- Target page is not open and `openInNewTab` is enabled.
- Settings can choose ChatGPT, Claude, Gemini, Doubao, or Grok as the default model for `Alt+Shift+A` and the popup primary button.
- Automatic mode is disabled by default.
- Automatic mode stops when no supported target page is open.
- Extension never sends the AI message automatically.
- Debug logs do not include image binary data, base64 data, or chat content.
- Popup feedback/privacy links open the public GitHub issue and privacy-policy pages.
- Options page explains first use, privacy boundaries, shortcut management, and feedback.
- With the browser language set to English, then to Chinese (Simplified): the extension name, popup, settings page, page notices, and the shortcut descriptions at `chrome://extensions/shortcuts` all follow it. Other languages fall back to English.

## Regression Scenarios For The Attachment Pipeline Optimization

- With automatic mode on and a supported page open, a new screenshot attaches within about 1 second.
- Reload the extension from `chrome://extensions` with a screenshot already on the clipboard: the old image is not attached; the next new screenshot is.
- Trigger a failed automatic attachment (for example, hide or remove the composer) with "write back on failure" enabled: the write-back does not cause a second automatic attachment.
- Run a manual Gemini or Doubao attachment while automatic mode is on: the screenshot appears once, not twice.
- On Gemini, when the upload menu offers no usable upload item, the menu is closed afterward and no OS file picker opens.
- Press the same shortcut twice quickly: only one attachment appears.
- After that operation completes, repeat deliberately with the same image: a second attachment is allowed.
- Disable automatic mode while target selection is pending: the pending selection must not start an attachment. Browser operations already dispatched cannot be revoked.
- Close the target tab while it is still loading after a shortcut: the popup reports a failure promptly instead of waiting about 15 seconds.
- With automatic mode on and a supported page focused, take a screenshot and press the shortcut within a second or two: exactly one attachment appears. Repeat, pressing the shortcut a few seconds after the automatic attachment: still one attachment.
- Signed in to ChatGPT and Gemini, attach once to each: the result is the success message, not "could not confirm the result". Both sites served new composer markup to signed-out visitors on 2026-10-27 (see the audit).

## Grok Acceptance

Use a synthetic PNG without private content in a signed-in blank chat at `https://grok.com/`. Do not send the message.

- Load the 0.2.0 candidate manually and confirm the popup and options list Grok.
- Copy the synthetic image to the native system clipboard; attach using the Grok popup button and the default-target shortcut.
- Check that exactly one attachment appears, any existing draft stays unchanged, and no message is sent.
- Enable automatic mode for the test, copy a different synthetic image, and check that it attaches once to the focused Grok page. Restore the setting afterward.
- Verify a repeated trigger while the first attachment is pending does not duplicate it.
- Check signed-out / unavailable-composer failures and inspect the composer before using manual paste after an unconfirmed result.
- Grok inside X is outside this adapter's scope.

Current evidence and unrun cases are recorded in [the audit](audit-2026-10-27.md). Synthetic DOM tests do not establish live upload acceptance.
