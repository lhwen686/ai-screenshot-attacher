# 宣传视频发布资料 / Video Upload Kit

四个宣传视频和配套封面都在 `store-assets/video/out/`，由 [Remotion 项目](../store-assets/video/README.md)生成。弹窗和设置页是扩展的真实界面，聊天窗口是不带任何 AI 公司标志的示意画面，和商店截图一致。视频没有配音和音乐，只有一条静音音轨。

The four promo videos and their covers are in `store-assets/video/out/`, rendered by the [Remotion project](../store-assets/video/README.md). Each section below has text to paste into the upload page.

## 0. 文件 / Files

| 发到哪里                      | 视频                        | 封面                                                                                                   |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| B站（横屏）                   | `promo-zh-CN-1920x1080.mp4` | `covers/cover-bilibili-zh-CN-1920x1080.jpg`（16:9）、`covers/cover-bilibili-zh-CN-1200x900.jpg`（4:3） |
| B站（竖屏）                   | `short-zh-CN-1080x1920.mp4` | `covers/cover-vertical-zh-CN-1080x1920.jpg`                                                            |
| YouTube                       | `promo-en-1920x1080.mp4`    | `covers/thumbnail-youtube-en-1280x720.jpg`                                                             |
| YouTube Shorts                | `short-en-1080x1920.mp4`    | 在 YouTube 手机 App 里编辑 Short 时选封面帧                                                            |
| YouTube（中文版，可选）       | `promo-zh-CN-1920x1080.mp4` | `covers/thumbnail-youtube-zh-CN-1280x720.jpg`                                                          |
| Chrome 网上应用店的宣传视频栏 | 上面英文版的 YouTube 链接   | —                                                                                                      |

横屏版约 55 秒，竖屏版约 40 秒，都是 30 fps、H.264。B站手机端会把封面裁成 4:3，两张 B站封面的主体都在中间，裁剪后不会被切掉；竖屏封面的主体在 3:4 范围内。

## 1. 背景音乐 / Music

视频里没有音乐，上传前或上传时自己加一段有授权的音乐：

- YouTube：上传后在 YouTube 工作室的“编辑器 → 音频”里，从免费音频库选一首。
- B站：在剪辑软件（例如必剪）里加上可商用的音乐后再上传，也可以直接发无声版。

## 2. B站投稿

- 类型：自制
- 分区：科技 → 软件应用（以投稿页实际列出的分区为准）
- 横屏标题：

```text
截图一键发给 AI：浏览器插件「AI 截图附加器」，支持 ChatGPT、Claude、Gemini、豆包、Grok
```

- 竖屏标题：

```text
截图发给 AI，只要一个快捷键｜AI 截图附加器
```

- 标签：浏览器插件、Chrome扩展、效率工具、AI工具、ChatGPT、Claude、Gemini、豆包、Grok、截图
- 简介（两个版本通用）：

```text
复制一张截图，按 Alt+Shift+A，它就出现在 AI 对话的输入框里。AI 截图附加器是一个免费的 Chrome / Edge 浏览器扩展，支持 ChatGPT、Claude、Gemini、豆包和 Grok。

它只做一件事：把你复制的截图放进你选的 AI 页面。绝不替你发送消息，不读取聊天记录，不保存截图历史，也不向开发者上传任何内容。

· 快捷键：Alt+Shift+A 附加到默认 AI，Alt+Shift+1/2/3 分别对应 ChatGPT、Claude、Gemini
· 工具栏弹窗：五个站点各一键直达，结果栏告诉你附加是否已确认
· 可选的自动模式（默认关闭）：AI 页面开着时，复制的新截图约 1 秒内自动附加

了解与安装：https://lhw686.me/ai-screenshot-attacher/
Chrome 网上应用店：（上架后补上链接）
源代码：https://github.com/lhwen686/ai-screenshot-attacher

视频中的聊天窗口是示意画面。ChatGPT、Claude、Gemini、豆包和 Grok 是其各自所有者的商标，本插件与它们没有关联。
```

## 3. YouTube

- Category: Science & Technology
- Audience: No, it's not made for kids
- Title (landscape):

```text
AI Screenshot Attacher: put screenshots into ChatGPT, Claude, Gemini, and more with one shortcut
```

- Title (Shorts):

```text
Screenshot to AI chat with one shortcut (Chrome extension)
```

- Tags: chrome extension, screenshot, clipboard, ChatGPT, Claude, Gemini, Grok, Doubao, AI tools, productivity
- Description (both videos; for the Short, keep the `#Shorts` line):

```text
Copy a screenshot, press Alt+Shift+A, and it lands in your AI chat's input box. AI Screenshot Attacher is a free Chrome and Edge extension for ChatGPT, Claude, Gemini, Doubao, and Grok.

It does one job: put the screenshot you copied into the AI page you chose. It never sends a message for you, does not read your chat history, keeps no screenshot history, and uploads nothing to the developer.

• Shortcuts: Alt+Shift+A for your default AI, and Alt+Shift+1/2/3 for ChatGPT, Claude, and Gemini
• Toolbar popup: one click for each of the five sites, with a clear result
• Optional automatic mode (off by default): while an AI page is open, each new screenshot attaches within about a second

Learn more and install: https://lhw686.me/ai-screenshot-attacher/
Chrome Web Store: (add the link once the listing is live)
Source code: https://github.com/lhwen686/ai-screenshot-attacher

The chat window in this video is a mock-up. ChatGPT, Claude, Gemini, Doubao, and Grok are trademarks of their respective owners. This extension is not affiliated with them.

#Shorts #ChromeExtension #ChatGPT
```

If you also upload the Chinese video to YouTube, use the Bilibili description above for it.

## 4. Chrome 网上应用店的宣传视频栏

商店信息页的“宣传视频”只接受 YouTube 链接，B站链接填不进去。

- 全球通用的宣传视频：英文横屏版的 YouTube 链接。
- 以当地语言显示的宣传视频（中文）：把中文横屏版也传到 YouTube 后再填它的链接；没传就留空，中文用户会看到英文版。

商店审核通过后，把两个平台简介里的“Chrome 网上应用店”一行换成真实的商店链接。
