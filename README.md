# AI Screenshot Attacher

Manifest V3 Chrome / Edge extension MVP. It attaches the current system clipboard image to ChatGPT, Claude, or Gemini after explicit user action. It never sends the AI message automatically.

## Features

- Read a clipboard screenshot only after a shortcut or popup button is triggered.
- Open or activate the selected AI target tab.
- Optional automatic mode: when enabled, detect new clipboard screenshots only while ChatGPT, Claude, or Gemini is already open.
- Reuse ChatGPT/Gemini/Claude pages opened as Chrome installed desktop app windows when Chrome exposes them to the extension.
- Try site-specific attachment strategies, with paste-only paths for Claude and Gemini to avoid duplicate or invalid attachment chips.
- On failure, optionally write the image back to the clipboard and focus the AI input box for manual `Ctrl+V` / `Cmd+V`.
- Adapter architecture for adding more AI sites later.

## Privacy and Safety

- This extension does not upload images to an extension author server.
- Manual mode reads the clipboard only after explicit user action.
- Automatic mode is off by default. When you enable it, the extension checks the clipboard only while at least one supported AI page is already open in the same Chrome profile.
- It does not automatically send AI messages.
- It does not read chat history.
- It does not save screenshot history.
- The image is passed to the selected AI platform because the user explicitly chose to attach it there.
- Debug logs never include image binary data, base64 data, or chat content.

## Permissions

The MVP uses only these extension permissions:

- `activeTab`
- `tabs`
- `scripting`
- `storage`
- `clipboardRead`
- `clipboardWrite`
- `offscreen`

Host permissions are limited to:

- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

No `<all_urls>` permission is required for this MVP. Clipboard access is handled through an MV3 offscreen document because service workers do not have DOM clipboard access.

## Install Dependencies

```bash
npm install
```

## Build

```bash
npm run build
```

The unpacked extension output is generated in `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.

## Load in Microsoft Edge

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.

## Shortcuts

Default commands:

- `Alt+Shift+A`: attach to default AI target.
- `Alt+Shift+1`: attach to ChatGPT.
- `Alt+Shift+2`: attach to Claude.
- `Alt+Shift+3`: attach to Gemini.

If a shortcut is already used by the browser or OS, change it at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

## Test Checklist

1. Use `Win+Shift+S` and copy a screenshot to the clipboard.
2. Press `Alt+Shift+1`.
3. Confirm ChatGPT opens or activates.
4. Confirm the screenshot appears in the input attachment area.
5. Confirm no message is sent automatically.
6. Repeat with `Alt+Shift+2` for Claude.
7. Repeat with `Alt+Shift+3` for Gemini.
8. Clear the clipboard or copy text only, then trigger the extension.
9. Confirm the popup shows `未检测到剪贴板图片，请先截图后再试。`
10. If automatic attachment fails on a site, confirm the page input is focused and the screenshot remains available for manual paste.

## Troubleshooting

- If nothing appears to happen after a shortcut, open the extension popup. The latest operation result is shown there, and the extension icon badge shows `OK` or `!`.
- If shortcuts do not fire, check `chrome://extensions/shortcuts`. Some systems reserve `Alt+Shift` combinations.
- If the result says no clipboard image, take a fresh screenshot with `Win+Shift+S` and make sure the screenshot is copied, not only saved to disk.
- If the result says clipboard permission failed, reload the extension from `chrome://extensions`, then try the popup button once. Browser clipboard permission prompts are easier to confirm from a visible extension page.
- If the result says automatic attachment failed, the target site's frontend likely rejected synthetic paste/drop. The extension should focus the input and keep the screenshot available for manual `Ctrl+V`.
- Gemini uses paste-only attachment. Synthetic file input can create an invalid `文件中没有内容` chip on Gemini, so the adapter avoids that path entirely.
- If ChatGPT or Gemini is installed as a Chrome desktop app, keep it in the same Chrome profile where this extension is installed. Chrome extensions cannot see app windows opened from a different profile.

## Settings

Open the extension options page to change:

- Default target AI.
- Whether to show a page toast after success.
- Whether to enable automatic paste mode.
- Whether to write the image back to the clipboard on failure.
- Whether to open a target AI page in a new tab if none is already open.
- Whether to enable debug logs.

## Known Limits

- AI sites frequently change their frontends. The adapters avoid fixed class names, but selectors and success heuristics may need updates.
- Some sites may block synthetic paste or drop events. In that case the extension falls back to preserving the screenshot in the clipboard and focusing the input.
- The browser may require clipboard permission to be granted before `navigator.clipboard.read()` works.
- Automatic mode does not open AI pages. It only attaches to already open ChatGPT, Claude, or Gemini pages.
- The extension does not bypass login, account checks, cookies, or site upload limits.

## Automatic Mode

Automatic mode is disabled by default. Enable it from the options page.

When enabled:

- If ChatGPT, Claude, or Gemini is already open, the extension starts a local offscreen clipboard monitor.
- The monitor records the current clipboard image fingerprint on startup and does not attach that old image.
- It checks for new clipboard images about every 1.5 seconds.
- New images are attached to the currently focused AI page first.
- If no supported AI page is open, the monitor stops and no clipboard reads are attempted.
- Clicking the extension button still keeps the original behavior: it opens the default AI target if needed.

## Add a New Adapter

1. Add a new target id in `src/shared/constants.ts`.
2. Create `src/adapters/newTarget.ts`.
3. Implement `AiTargetAdapter` with `detect`, `waitUntilReady`, `attachImage`, and optional `focusInput`.
4. Add selector candidates for file inputs, text inputs, drop targets, and attachment previews.
5. Register the adapter in `src/adapters/registry.ts`.
6. Add popup/options labels if needed.
7. Run `npm run build` and manually test the target site.

## Reference

The MV3 offscreen document approach follows Chrome's official offscreen document guidance: https://developer.chrome.com/docs/extensions/reference/offscreen
