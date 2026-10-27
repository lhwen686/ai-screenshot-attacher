import en from '../../../public/_locales/en/messages.json';
import zh from '../../../public/_locales/zh_CN/messages.json';

export type Locale = 'en' | 'zh_CN';
export type Layout = 'landscape' | 'portrait';

export type SceneProps = { locale: Locale; layout: Layout };

// Interface text comes from the extension's own messages, so the video says what users will see.
const MESSAGES: Record<Locale, Record<string, { message: string }>> = { en, zh_CN: zh };

export function msg(locale: Locale, key: keyof typeof en): string {
  return MESSAGES[locale][key].message;
}

export function targetNames(locale: Locale): string[] {
  return ['ChatGPT', 'Claude', 'Gemini', msg(locale, 'targetDoubao'), 'Grok'];
}

export const URL_TEXT = 'lhw686.me/ai-screenshot-attacher';

export const COPY = {
  en: {
    hook: {
      title: 'Every screenshot for your AI, the same routine:',
      steps: ['Switch to the AI tab', 'Click the input box', 'Paste the screenshot'],
      answer: 'Now it takes one shortcut.'
    },
    shortHook: 'Screenshot to AI chat,\nwith one shortcut',
    tagline: 'Screenshots into AI chats, in one step',
    demo: {
      eyebrow: 'How it works',
      steps: [
        { title: 'Take a screenshot', detail: 'Use your system tool, e.g. Win+Shift+S' },
        { title: 'Press Alt+Shift+A', detail: 'It opens your AI page and attaches it' },
        { title: 'You send it yourself', detail: 'Nothing is sent until you click Send' }
      ],
      copied: 'Copied to clipboard',
      address: 'Your AI chat',
      placeholder: 'Ask anything',
      question: 'What does this trend tell us?',
      file: 'screenshot.png',
      attached: 'Attached',
      notSent: 'Not sent until you click Send'
    },
    popup: {
      eyebrow: 'Toolbar popup',
      title: 'Five AI sites,\none click each',
      lead: 'Click the toolbar button and pick a site. The result shows whether the attachment was confirmed.'
    },
    shortcuts: {
      eyebrow: 'Keyboard shortcuts',
      title: 'Straight to the AI you want',
      note: 'Doubao and Grok: make one your default AI, or assign your own shortcut.'
    },
    auto: {
      eyebrow: 'Optional',
      title: 'Automatic mode',
      lead: 'Keep an AI page open, and each new screenshot you copy attaches by itself in about a second.',
      badge: 'Off by default',
      newShot: 'New screenshot',
      autoTag: 'Attached automatically'
    },
    privacy: {
      eyebrow: 'Privacy',
      title: 'One job, clear boundaries',
      cards: [
        ['Never sends messages', 'You review and send every message yourself.'],
        ['No chat history access', 'It never reads your conversations.'],
        ['No screenshot history', 'Screenshots are not stored by the extension.'],
        ['No developer servers', 'Nothing is uploaded to the extension author.'],
        ['Five AI sites only', 'Site access is limited to the supported AI pages.'],
        ['Automatic mode is opt-in', 'Off by default, and it only runs while an AI page is open.']
      ]
    },
    outro: {
      note: 'Free · Chrome and Edge',
      disclaimer:
        'ChatGPT, Claude, Gemini, Doubao, and Grok are trademarks of their respective owners. This extension is not affiliated with them.'
    },
    cover: { title: 'Screenshot to AI,\none shortcut', badge: 'Never sends for you' }
  },
  zh_CN: {
    hook: {
      title: '每次把截图发给 AI，都要来一遍：',
      steps: ['切到 AI 页面', '点进输入框', '粘贴截图'],
      answer: '现在，一个快捷键搞定。'
    },
    shortHook: '截图发给 AI，\n只要一个快捷键',
    tagline: '截图，一键放进 AI 对话框',
    demo: {
      eyebrow: '怎么用',
      steps: [
        { title: '截图', detail: '用系统截图，例如 Win+Shift+S' },
        { title: '按 Alt+Shift+A', detail: '自动切到 AI 页面并附加截图' },
        { title: '提问，由你发送', detail: '点击发送前，什么都不会发出' }
      ],
      copied: '已复制到剪贴板',
      address: '你的 AI 对话',
      placeholder: '有问题，尽管问',
      question: '这张图的趋势说明了什么？',
      file: 'screenshot.png',
      attached: '已附加',
      notSent: '点击发送前不会发出'
    },
    popup: {
      eyebrow: '工具栏弹窗',
      title: '五个 AI 站点，\n各一键直达',
      lead: '点工具栏按钮，选一个站点。附加有没有确认，结果栏写得清清楚楚。'
    },
    shortcuts: {
      eyebrow: '快捷键',
      title: '不碰鼠标，直达想用的 AI',
      note: '豆包和 Grok：可设为默认 AI，或自己分配快捷键。'
    },
    auto: {
      eyebrow: '可选功能',
      title: '自动模式',
      lead: '只要 AI 页面开着，你复制的每张新截图约 1 秒内自动附加。',
      badge: '默认关闭',
      newShot: '新截图',
      autoTag: '已自动附加'
    },
    privacy: {
      eyebrow: '隐私',
      title: '只做一件事，边界清楚',
      cards: [
        ['绝不自动发送', '每条消息都由你检查后自己发送。'],
        ['不读取聊天记录', '不会读取你的任何对话。'],
        ['不保存截图历史', '插件不会存储任何截图。'],
        ['不上传到开发者服务器', '不会把任何内容传给插件作者。'],
        ['只访问五个 AI 站点', '站点权限仅限受支持的 AI 页面。'],
        ['自动模式需手动开启', '默认关闭，且只在 AI 页面打开时运行。']
      ]
    },
    outro: {
      note: '免费 · 支持 Chrome 和 Edge',
      disclaimer: 'ChatGPT、Claude、Gemini、豆包和 Grok 是其各自所有者的商标，本插件与它们没有关联。'
    },
    cover: { title: '截图发给 AI，\n一个快捷键', badge: '绝不替你发送' }
  }
} satisfies Record<Locale, unknown>;
