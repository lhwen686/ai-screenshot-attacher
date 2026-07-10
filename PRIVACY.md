# Privacy Policy

AI Screenshot Attacher is a browser extension for attaching the current clipboard screenshot to a supported AI chat page selected by the user.

## Single Purpose

The extension has one purpose: after a user action, or after the user explicitly enables automatic mode, attach a clipboard image to ChatGPT, Claude, Gemini, or Doubao. The extension never sends the AI message automatically.

## Data Handling

- Clipboard images are read in the extension's MV3 offscreen document, then passed to the selected supported AI page for attachment.
- If attachment succeeds, the selected AI website receives the image because the user chose to attach the image to that website.
- The extension does not upload screenshots to an extension-author server.
- The extension does not store screenshot history.
- The extension does not read or store chat history.
- The extension does not collect analytics, telemetry, account identifiers, or browsing history.
- Debug logs do not include image binary data, base64 data, or chat content.
- The extension stores settings in `chrome.storage.sync`.
- The extension stores the latest operation result in `chrome.storage.local` so the popup can show recent status.
- Automatic mode may store a recent delivery identifier, image fingerprint, and timestamp in `chrome.storage.local` to avoid duplicate attachments. None of these values is the screenshot image, and the state is removed when the automatic monitor stops.

## Permissions

- `clipboardRead`: reads the current clipboard image after a manual trigger, or while automatic mode is enabled.
- `clipboardWrite`: for a user-triggered Gemini or Doubao action, may place the already captured image on the clipboard immediately before a browser paste so a later clipboard change cannot substitute different content. It also restores the captured image after a failed attachment when the user has kept the write-back fallback enabled. Automatic mode does not use this real-paste path.
- `tabs`: finds, opens, focuses, and monitors supported AI tabs; it is also used to open user-requested help/privacy/support links.
- `activeTab`: supports temporary user-invoked page feedback, such as showing a toast on the current HTTP(S) tab after a failed clipboard read.
- `scripting`: injects the attachment runtime into supported AI pages and shows page feedback.
- `storage`: saves user settings, latest operation status, and automatic-mode duplicate-suppression state.
- `offscreen`: reads and writes clipboard images from an MV3 offscreen document because service workers do not have DOM clipboard access.

Host permissions are limited to ChatGPT, Claude, Gemini, and Doubao:

- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://doubao.com/*`
- `https://www.doubao.com/*`

## Automatic Mode

Automatic mode is disabled by default. When enabled, it checks for new clipboard images only while a supported AI page is already open in the same browser profile. It does not open AI pages by itself. On startup, it fingerprints the current clipboard image if one exists and does not attach that old image immediately.

## Contact

Report privacy or security concerns through GitHub issues or a private vulnerability report if the hosting platform supports it:

https://github.com/lhwen686/ai-screenshot-attacher
