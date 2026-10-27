# Chrome Web Store 上架资料 / Listing Kit

本文按 Chrome Web Store 开发者后台（Developer Dashboard）的页签顺序整理，每个字段都给出可直接粘贴的内容。扩展从 0.2.0 起带有 `_locales`（默认 `en`，另有 `zh_CN`），后台会为英文和简体中文各提供一套商店信息，两套都要填。

This kit follows the Developer Dashboard tabs. Paste each block into the matching field. Fill in both the English and the Simplified Chinese listing.

## 0. 提交前 / Before submitting

- [ ] 注册开发者账号：一次性 5 美元注册费，并开启两步验证（只能由你本人在 https://chrome.google.com/webstore/devconsole 完成）。
- [x] 把 0.2.0 分支合并进 `main`（2026-10-27）：公开网站和隐私政策从 `main:/docs` 发布，现在列出五个目标。
- [x] 完成 [审计文档](audit-2026-10-27.md) 里的已登录检查（2026-10-27）：Grok 验收清单全部项目，以及 Gemini、ChatGPT 各一次附加。
- [ ] 运行 `npm run verify`、`npm run package`、`node scripts/validate-store-assets.mjs`、`node scripts/validate-public-site.mjs`，全部通过。
- [ ] 上传 `release/ai-screenshot-attacher-v0.2.0.zip`。

## 1. 软件包 / Package

| 字段        | 内容                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| 上传文件    | `release/ai-screenshot-attacher-v0.2.0.zip`（由 `npm run package` 生成）         |
| 版本        | 0.2.0（取自 `manifest.json`，与 `package.json` 一致）                            |
| 最低 Chrome | 109                                                                              |
| 名称与摘要  | 取自 `_locales/*/messages.json` 的 `extName`、`extDescription`，后台不能单独修改 |

## 2. 商店信息 / Store listing

### 共用字段 / Shared fields

| 字段                      | 内容                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| 类别 / Category           | Productivity → Tools（也可选 Workflow & Planning）                            |
| 商店图标 / Store icon     | `store-assets/chrome-web-store/icon-128.png`（128×128）                       |
| 主页 / Homepage URL       | `https://lhw686.me/ai-screenshot-attacher/`                                   |
| 支持 / Support URL        | `https://lhw686.me/ai-screenshot-attacher/support/`                           |
| 成人内容 / Mature content | 否 / No                                                                       |
| 宣传视频 / Promo video    | 可选：宣传片传到 YouTube 后填链接，见 [宣传视频发布资料](video-upload-kit.md) |

截图和宣传图在两种语言下分别上传，文件都在 `store-assets/chrome-web-store/<语言>/`：

| 位置                            | 尺寸     | 文件（按上传顺序）                                                                                                                                                                         |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 截图 / Screenshots（最多 5 张） | 1280×800 | `screenshot-1-overview-1280x800.png`、`screenshot-2-popup-1280x800.png`、`screenshot-3-auto-mode-1280x800.png`、`screenshot-4-shortcuts-1280x800.png`、`screenshot-5-privacy-1280x800.png` |
| 小宣传图 / Small promo tile     | 440×280  | `small-promo-440x280.png`                                                                                                                                                                  |
| 横幅宣传图 / Marquee            | 1400×560 | `marquee-promo-1400x560.png`                                                                                                                                                               |

全部图片为不带透明通道的 24 位 PNG，符合商店要求；截图里的弹窗和设置页是扩展的真实界面。重新生成方法见 `store-assets/source/README.md`。

### English listing

- Title (from the manifest): AI Screenshot Attacher
- Summary (from the manifest): Attach clipboard screenshots to ChatGPT, Claude, Gemini, Doubao, or Grok in one step. Never sends messages for you.
- Description:

```text
Copy a screenshot, press a shortcut, and it lands in your AI chat's input box, ready for your question. AI Screenshot Attacher works with ChatGPT, Claude, Gemini, Doubao, and Grok, and it never sends a message for you.

HOW IT WORKS
1. Take a screenshot with your system tool (for example Win+Shift+S on Windows) so it is on the clipboard.
2. Press Alt+Shift+A, or click the toolbar button and pick a site.
3. The screenshot is attached to the AI page's input box. Write your question, check it, and send it yourself.

FEATURES
• Five AI sites: ChatGPT, Claude, Gemini, Doubao, and Grok.
• Keyboard shortcuts: Alt+Shift+A for your default AI, and Alt+Shift+1/2/3 for ChatGPT, Claude, and Gemini. Change them at chrome://extensions/shortcuts.
• Opens the AI page for you, or reuses one that is already open, including Chrome app windows.
• Optional automatic mode: while an AI page is open, each new screenshot you copy is attached on its own. It is off by default.
• Clear results: the popup and a short page notice tell you whether the attachment was confirmed, and what to check if it was not.
• If a site rejects the attachment, the screenshot stays on the clipboard for a manual paste.
• English and Simplified Chinese interface.

PRIVACY
• Never sends messages.
• Does not read your chat history.
• Does not keep a screenshot history.
• Uploads nothing to the developer. Screenshots go only to the AI page you chose.
• Site access is limited to the five supported AI sites.
• No analytics or tracking.
Privacy policy: https://lhw686.me/ai-screenshot-attacher/privacy/

NOTES
• Sign in to the AI site as usual. The extension does not bypass logins or upload limits.
• AI sites change often. If attaching stops working on a site, please report it: https://github.com/lhwen686/ai-screenshot-attacher/issues

ChatGPT, Claude, Gemini, Doubao, and Grok are trademarks of their respective owners. This extension is not affiliated with or endorsed by them.
```

### 简体中文商店信息

- 标题（取自清单）：AI 截图附加器
- 摘要（取自清单）：一键把剪贴板截图附加到 ChatGPT、Claude、Gemini、豆包或 Grok 的输入框，不会替你发送消息。
- 说明：

```text
复制一张截图，按下快捷键，它就出现在 AI 对话的输入框里，等你提问。AI 截图附加器支持 ChatGPT、Claude、Gemini、豆包和 Grok，并且绝不会替你发送消息。

使用方法
1. 用系统截图工具截图（例如 Windows 的 Win+Shift+S），让截图进入剪贴板。
2. 按 Alt+Shift+A，或点击工具栏按钮并选择目标站点。
3. 截图会附加到 AI 页面的输入框。写好问题、检查无误后，由你自己发送。

功能
• 支持五个 AI 站点：ChatGPT、Claude、Gemini、豆包和 Grok。
• 快捷键：Alt+Shift+A 附加到默认 AI，Alt+Shift+1/2/3 分别对应 ChatGPT、Claude、Gemini；可在 chrome://extensions/shortcuts 修改。
• 自动打开 AI 页面，或复用已经打开的页面（包括 Chrome 应用窗口）。
• 可选的自动模式：AI 页面开着时，你复制的每张新截图都会自动附加。默认关闭。
• 结果清楚：弹窗和页面提示会告诉你附加是否已确认，没确认时该检查什么。
• 如果网站拒绝附加，截图会留在剪贴板里，方便手动粘贴。
• 界面支持简体中文和英文。

隐私
• 绝不自动发送消息。
• 不读取聊天记录。
• 不保存截图历史。
• 不向开发者上传任何内容；截图只会进入你选择的 AI 页面。
• 站点权限仅限五个受支持的 AI 站点。
• 没有统计或追踪。
隐私政策：https://lhw686.me/ai-screenshot-attacher/privacy/

说明
• 请照常登录 AI 网站；插件不会绕过登录或上传限制。
• AI 网站改版频繁。如果某个站点无法附加，欢迎反馈：https://github.com/lhwen686/ai-screenshot-attacher/issues

ChatGPT、Claude、Gemini、豆包和 Grok 是其各自所有者的商标。本插件与它们没有关联，也未获得其认可。
```

## 3. 隐私权规范 / Privacy practices

这一页给审核人员看，用英文填写。

### Single purpose

```text
AI Screenshot Attacher has one purpose: attach the screenshot on the clipboard to the input box of a supported AI chat page (ChatGPT, Claude, Gemini, Doubao, or Grok). It runs when the user presses a shortcut or clicks the toolbar popup, or, if the user turns on automatic mode, when a new screenshot is copied while a supported AI page is open. It never sends the message.
```

### Permission justification

| Permission       | Justification (paste as is)                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`      | After the user presses the shortcut or clicks the popup, shows a short notice on the current tab when the clipboard holds no image. No other page access.                                                                                       |
| `tabs`           | Finds an open ChatGPT, Claude, Gemini, Doubao, or Grok tab (including installed app windows), focuses it or opens a new one, and starts or stops automatic mode depending on whether such a tab is open. Also opens the help and privacy links. |
| `scripting`      | Injects the extension's own packaged attach script into the supported AI page to place the screenshot in its input box, and shows a short status notice on that page.                                                                           |
| `storage`        | Saves the user's settings, the latest result shown in the popup, and a short-lived duplicate check for automatic mode. No screenshots are stored.                                                                                               |
| `clipboardRead`  | Reads the screenshot the user copied when they press a shortcut or click the popup, or while the user-enabled automatic mode is on and a supported AI page is open.                                                                             |
| `clipboardWrite` | For a manual Gemini or Doubao attach, places the captured screenshot on the clipboard right before a browser paste. After a failed attach, puts the screenshot back on the clipboard for a manual paste, if the user keeps that setting on.     |
| `offscreen`      | Manifest V3 service workers cannot use the clipboard, so clipboard reads and writes run in an offscreen document with the CLIPBOARD reason.                                                                                                     |
| Host permissions | Limited to chatgpt.com, claude.ai, gemini.google.com, doubao.com, www.doubao.com, and grok.com, the pages where the screenshot is attached. No other sites.                                                                                     |

更详细的代码对照见 `marketing/store-listing/permission-justifications.md`。

### Remote code

选择 **No, I am not using remote code**。扩展的全部脚本都打包在 ZIP 内，不加载外部脚本，也不执行远程下载的代码。

### Data usage

建议勾选 **Website content**，说明：截图是用户主动选择附加的图片，扩展把它放进用户选定的 AI 页面，由该网站接收。其余类别都不勾选：扩展不收集个人身份信息、健康、财务、身份验证、个人通信、位置、浏览记录或用户活动数据，也不向开发者上传任何内容。偏保守地如实申报，比漏报更不容易被拒。

然后勾选三项声明：

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

```text
https://lhw686.me/ai-screenshot-attacher/privacy/
```

## 4. 分发 / Distribution

| 字段                  | 建议                                         |
| --------------------- | -------------------------------------------- |
| 付费 / Payments       | 免费 / Free                                  |
| 公开范围 / Visibility | 公开 / Public（想先小范围试用可选 Unlisted） |
| 地区 / Regions        | 所有地区 / All regions                       |

## 5. 审核测试说明 / Test instructions

如果后台提供审核测试说明字段，粘贴以下内容：

```text
No account is needed to test on ChatGPT, whose signed-out page also accepts image attachments. Claude, Gemini, Doubao, and Grok need the reviewer to sign in to those sites.
1. Copy any image to the clipboard, for example a screenshot taken with Win+Shift+S (Windows) or Cmd+Ctrl+Shift+4 (macOS).
2. Open https://chatgpt.com/ and press Alt+Shift+1, or click the extension's toolbar button and choose "Attach to ChatGPT".
3. The image appears in ChatGPT's input box. The extension does not send the message.
4. Copy text only and try again: the extension reports that the clipboard has no image.
5. Optional: in the extension's settings, turn on automatic paste mode, keep chatgpt.com open, and copy a new image. It is attached within about a second.
The interface follows the browser language (English or Simplified Chinese).
```

## 6. Microsoft Edge Add-ons

Edge 后台使用同一个 ZIP 和同一套文案、截图，见 `docs/edge-submission-final.md`。
