# AI Screenshot Attacher / AI 截图附加器

Manifest V3 Chrome / Edge extension MVP for attaching the current system clipboard screenshot to ChatGPT, Claude, Gemini, or Doubao. It never sends the AI message automatically.

这是一个 Manifest V3 Chrome / Edge 浏览器扩展 MVP，用于把当前系统剪贴板里的截图附加到 ChatGPT、Claude、Gemini 或豆包。插件不会自动发送 AI 消息。

## Features / 功能

- Read a clipboard screenshot only after a shortcut, popup button, or enabled automatic mode trigger.
- 仅在快捷键、弹窗按钮，或用户主动开启自动模式后读取剪贴板截图。
- Open or activate the selected AI target tab when used manually.
- 手动使用时会打开或激活指定 AI 目标页面。
- Optional automatic mode: when enabled, detect new clipboard screenshots only while ChatGPT, Claude, Gemini, or Doubao is already open.
- 可选自动模式：开启后，仅在 ChatGPT、Claude、Gemini 或豆包已打开时检测新的剪贴板截图。
- Reuse supported AI pages opened as Chrome installed desktop app windows when Chrome exposes them to the extension.
- 支持复用 Chrome “安装为应用”的受支持 AI 桌面窗口。
- Use site-specific attachment strategies, with paste-only paths for Claude and Gemini to avoid duplicate or invalid attachment chips.
- 针对不同网站使用不同附加策略；Claude 和 Gemini 使用 paste-only 路径，避免重复附件或无效附件卡片。
- Doubao starts with real clipboard paste, then falls back to synthetic paste, drop, and file input strategies.
- 豆包会优先尝试真实剪贴板粘贴，然后回退到合成 paste、drop 和 file input 策略。
- On failure, optionally write the image back to the clipboard and focus the AI input box for manual `Ctrl+V` / `Cmd+V`.
- 自动附加失败时，可选择把图片写回剪贴板并聚焦 AI 输入框，便于手动 `Ctrl+V` / `Cmd+V`。
- Adapter architecture for adding more AI sites later.
- 使用 adapter 架构，方便后续扩展更多 AI 网站。

## Privacy and Safety / 隐私与安全

- This extension does not upload images to an extension author server.
- 本插件不会把图片上传到插件作者服务器。
- Manual mode reads the clipboard only after explicit user action.
- 手动模式只在用户明确触发后读取剪贴板。
- Automatic mode is off by default. When enabled, it checks the clipboard only while at least one supported AI page is already open in the same Chrome profile.
- 自动模式默认关闭。开启后，仅在同一 Chrome profile 中已有受支持 AI 页面打开时检测剪贴板。
- It does not automatically send AI messages.
- 插件不会自动发送 AI 消息。
- It does not read chat history.
- 插件不会读取聊天记录。
- It does not save screenshot history.
- 插件不会保存截图历史。
- The image is passed to the selected AI platform because the user explicitly chose to attach it there.
- 图片会传给用户选择的 AI 平台，这是用户主动附加图片到该平台的结果。
- Debug logs never include image binary data, base64 data, or chat content.
- 调试日志不会记录图片二进制、base64 数据或聊天内容。

## Permissions / 权限

The MVP uses only these extension permissions:

MVP 只使用以下扩展权限：

- `activeTab`
- `tabs`
- `scripting`
- `storage`
- `clipboardRead`
- `clipboardWrite`
- `offscreen`

Host permissions are limited to:

站点权限仅限：

- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://doubao.com/*`
- `https://www.doubao.com/*`

No `<all_urls>` permission is required. Clipboard access is handled through an MV3 offscreen document because service workers do not have DOM clipboard access.

本插件不需要 `<all_urls>` 权限。剪贴板访问通过 MV3 offscreen document 完成，因为 service worker 没有 DOM 剪贴板访问能力。

## Install Dependencies / 安装依赖

```bash
npm install
```

## Build / 构建

```bash
npm run build
```

The unpacked extension output is generated in `dist/`.

构建后的可加载扩展目录会生成在 `dist/`。

## Load in Chrome / 在 Chrome 中加载

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.

1. 打开 `chrome://extensions`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `dist/` 文件夹。

## Load in Microsoft Edge / 在 Microsoft Edge 中加载

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.

1. 打开 `edge://extensions`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `dist/` 文件夹。

## Shortcuts / 快捷键

Default commands:

默认命令：

- `Alt+Shift+A`: attach to default AI target. / 附加到默认 AI。
- `Alt+Shift+1`: attach to ChatGPT. / 附加到 ChatGPT。
- `Alt+Shift+2`: attach to Claude. / 附加到 Claude。
- `Alt+Shift+3`: attach to Gemini. / 附加到 Gemini。
- Doubao has no default shortcut because Chrome allows only 4 default command shortcuts per extension. Use the popup button, set Doubao as the default target, or free another shortcut in the browser shortcuts page and assign one manually. / 豆包没有默认快捷键，因为 Chrome 每个扩展最多允许 4 个默认命令快捷键。可使用 popup 按钮、把豆包设为默认目标，或在浏览器快捷键页面释放其他快捷键后手动分配。

If a shortcut is already used by the browser or OS, change it at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

如果快捷键被浏览器或系统占用，可以在 `chrome://extensions/shortcuts` 或 `edge://extensions/shortcuts` 修改。

## Test Checklist / 测试清单

1. Use `Win+Shift+S` and copy a screenshot to the clipboard.
2. Press `Alt+Shift+1`.
3. Confirm ChatGPT opens or activates.
4. Confirm the screenshot appears in the input attachment area.
5. Confirm no message is sent automatically.
6. Repeat with `Alt+Shift+2` for Claude.
7. Repeat with `Alt+Shift+3` for Gemini.
8. Repeat with the popup Doubao button or set Doubao as the default target and press `Alt+Shift+A`.
9. Clear the clipboard or copy text only, then trigger the extension.
10. Confirm the popup shows `未检测到剪贴板图片，请先截图后再试。`
11. If automatic attachment fails, confirm the input is focused and the screenshot remains available for manual paste.

1. 使用 `Win+Shift+S` 截图，并确保截图进入剪贴板。
2. 按 `Alt+Shift+1`。
3. 确认 ChatGPT 打开或被激活。
4. 确认截图出现在输入框附件区。
5. 确认插件不会自动发送消息。
6. 使用 `Alt+Shift+2` 测试 Claude。
7. 使用 `Alt+Shift+3` 测试 Gemini。
8. 使用 popup 里的豆包按钮测试，或把豆包设为默认目标后按 `Alt+Shift+A`。
9. 清空剪贴板或只复制文本，再触发插件。
10. 确认 popup 显示 `未检测到剪贴板图片，请先截图后再试。`
11. 如果自动附加失败，确认输入框被聚焦，且截图仍可手动粘贴。

## Automatic Mode / 自动模式

Automatic mode is disabled by default. Enable it from the options page.

自动模式默认关闭，需要在设置页手动开启。

When enabled:

开启后：

- If ChatGPT, Claude, Gemini, or Doubao is already open, the extension starts a local offscreen clipboard monitor.
- 如果 ChatGPT、Claude、Gemini 或豆包已打开，插件会启动本地 offscreen 剪贴板监控。
- The monitor records the current clipboard image fingerprint on startup and does not attach that old image.
- 启动时只记录当前剪贴板图片指纹，不会把旧图片立刻附加上去。
- It checks for new clipboard images about every 1.5 seconds.
- 约每 1.5 秒检测一次新的剪贴板图片。
- New images are attached to the currently focused AI page first.
- 新图片会优先附加到当前聚焦的 AI 页面。
- If no supported AI page is open, the monitor stops and no clipboard reads are attempted.
- 如果没有受支持的 AI 页面打开，监控会停止，不会尝试读取剪贴板。
- Clicking the extension button still keeps the original behavior: it opens the default AI target if needed.
- 点击插件按钮仍保留原行为：必要时自动打开默认 AI 目标页面。

## Troubleshooting / 故障排查

- If nothing appears to happen after a shortcut, open the extension popup. The latest operation result is shown there, and the extension icon badge shows `OK` or `!`.
- 如果快捷键后没有反应，打开插件 popup 查看最近一次结果，扩展图标也会显示 `OK` 或 `!`。
- If shortcuts do not fire, check `chrome://extensions/shortcuts`. Some systems reserve `Alt+Shift` combinations.
- 如果快捷键没有触发，检查 `chrome://extensions/shortcuts`。部分系统会占用 `Alt+Shift` 组合。
- If the result says no clipboard image, take a fresh screenshot with `Win+Shift+S` and make sure it is copied, not only saved to disk.
- 如果提示没有剪贴板图片，请重新用 `Win+Shift+S` 截图，并确认截图是复制到剪贴板，而不是只保存到磁盘。
- If clipboard permission fails, reload the extension from `chrome://extensions`, then try the popup button once.
- 如果剪贴板权限失败，从 `chrome://extensions` 重新加载扩展，然后先用 popup 按钮测试一次。
- If automatic attachment fails, the target site's frontend may have rejected synthetic paste/drop. The extension should focus the input and keep the screenshot available for manual `Ctrl+V`.
- 如果自动附加失败，可能是目标网站前端拒绝了合成 paste/drop。插件会尝试聚焦输入框，并保留截图供手动 `Ctrl+V`。
- Gemini uses paste-only attachment. Synthetic file input can create an invalid `文件中没有内容` chip on Gemini, so the adapter avoids that path entirely.
- Gemini 使用 paste-only 附加。合成 file input 可能在 Gemini 中生成 `文件中没有内容` 的无效卡片，因此 adapter 会完全避开该路径。
- If a supported AI site is installed as a Chrome desktop app, keep it in the same Chrome profile where this extension is installed.
- 如果受支持 AI 站点是 Chrome 桌面应用，请确保它和插件安装在同一个 Chrome profile 中。

## Settings / 设置项

Open the extension options page to change:

打开扩展设置页可以修改：

- Default target AI. / 默认目标 AI。
- Whether to show a page toast after success. / 成功后是否显示页面 Toast。
- Whether to enable automatic paste mode. / 是否启用自动粘贴模式。
- Whether to write the image back to the clipboard on failure. / 失败时是否写回剪贴板。
- Whether to open a target AI page in a new tab if none is already open. / 没有目标页面时是否新建标签页打开。
- Whether to enable debug logs. / 是否启用调试日志。

## Known Limits / 已知限制

- AI sites frequently change their frontends. The adapters avoid fixed class names, but selectors and success heuristics may need updates.
- AI 网站前端变化频繁。adapter 已避免依赖固定 className，但 selector 和成功检测逻辑仍可能需要更新。
- Some sites may block synthetic paste or drop events. In that case the extension falls back to preserving the screenshot in the clipboard and focusing the input.
- 一些网站可能阻止合成 paste 或 drop 事件。此时插件会退回到保留剪贴板截图并聚焦输入框。
- The browser may require clipboard permission before `navigator.clipboard.read()` works.
- 浏览器可能要求授予剪贴板权限后，`navigator.clipboard.read()` 才能工作。
- Automatic mode does not open AI pages. It only attaches to already open ChatGPT, Claude, Gemini, or Doubao pages.
- 自动模式不会打开 AI 页面，只会附加到已经打开的 ChatGPT、Claude、Gemini 或豆包。
- The extension does not bypass login, account checks, cookies, or site upload limits.
- 插件不会绕过登录、账号检查、Cookie 或网站上传限制。

## Add a New Adapter / 新增 Adapter

1. Add a new target id in `src/shared/constants.ts`.
2. Create `src/adapters/newTarget.ts`.
3. Implement `AiTargetAdapter` with `detect`, `waitUntilReady`, `attachImage`, and optional `focusInput`.
4. Add selector candidates for file inputs, text inputs, drop targets, and attachment previews.
5. Register the adapter in `src/adapters/registry.ts`.
6. Add popup/options labels if needed.
7. Run `npm run build` and manually test the target site.

1. 在 `src/shared/constants.ts` 中新增目标 id。
2. 创建 `src/adapters/newTarget.ts`。
3. 实现 `AiTargetAdapter`，包括 `detect`、`waitUntilReady`、`attachImage`，以及可选的 `focusInput`。
4. 添加文件输入框、文本输入框、拖放区域、附件预览的候选 selector。
5. 在 `src/adapters/registry.ts` 中注册 adapter。
6. 如有需要，补充 popup/options 显示标签。
7. 运行 `npm run build`，并手动测试目标站点。

## Reference / 参考

The MV3 offscreen document approach follows Chrome's official offscreen document guidance:

MV3 offscreen document 方案参考 Chrome 官方文档：

https://developer.chrome.com/docs/extensions/reference/offscreen
