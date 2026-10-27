// Composes the Chrome Web Store images around captures of the real popup and settings page.
// Open render.html?asset=overview&locale=en to preview one image, or render.html?save=1 to write every image.
import { toCanvas } from 'html-to-image';
import { allowRenderingWithoutPaint } from './no-paint.js';
import { captureUi } from './ui-capture.js';

allowRenderingWithoutPaint();

const LOCALES = ['en', 'zh_CN'];
const params = new URLSearchParams(location.search);
const statusLine = document.getElementById('status');
const host = document.getElementById('host');

const COPY = {
  en: {
    overview: {
      eyebrow: 'ChatGPT · Claude · Gemini · Doubao · Grok',
      title: 'Screenshots into AI chats, in one step',
      lead: 'Copy a screenshot and press Alt+Shift+A. It lands in the AI input box, and you still write and send the message yourself.',
      points: ['Five AI sites, one shortcut', 'Optional automatic mode', 'Never sends messages for you']
    },
    chat: {
      address: 'Your AI chat',
      placeholder: 'Ask anything',
      attached: 'Attached',
      notSent: 'Not sent until you click Send'
    },
    popup: {
      eyebrow: 'One popup',
      title: 'Pick a target, attach, done',
      lead: 'Everything lives in the toolbar popup, so you never leave the page you are on.',
      callouts: [
        ['Your default AI', 'One button attaches to the AI you chose in Settings.'],
        ['Automatic mode at a glance', 'Shows whether new screenshots attach on their own.'],
        ['All five AI sites', 'ChatGPT, Claude, Gemini, Doubao, and Grok, one click each.'],
        ['Clear results', 'Confirms the attachment, or tells you exactly what to check.']
      ]
    },
    auto: {
      eyebrow: 'Optional',
      title: 'Automatic mode',
      lead: 'Turn it on once. While an AI page is open, each new screenshot you copy attaches by itself.',
      steps: [
        ['Turn it on in Settings', 'Nothing runs until you enable it.'],
        [
          'Keep an AI page open',
          'It watches the clipboard only while ChatGPT, Claude, Gemini, Doubao, or Grok is open.'
        ],
        ['Copy a screenshot', 'It appears in the focused AI input box within about a second.']
      ],
      badge: 'Off by default'
    },
    shortcuts: {
      eyebrow: 'Keyboard first',
      title: 'Attach without touching the mouse',
      lead: 'Default shortcuts work right away, and you can change them at any time.',
      cardTitle: 'Keyboard shortcuts',
      notSet: 'Not set',
      note: 'Doubao and Grok: use the popup, make one of them your default AI, or give it your own shortcut at chrome://extensions/shortcuts.'
    },
    privacy: {
      eyebrow: 'Privacy',
      title: 'Clear boundaries, by design',
      lead: 'One job: put the screenshot you copied into the AI page you chose.',
      cards: [
        ['Never sends messages', 'You review and send every message yourself.'],
        ['No chat history access', 'It never reads your conversations.'],
        ['No screenshot history', 'Screenshots are not stored by the extension.'],
        ['No developer servers', 'Nothing is uploaded to the extension author.'],
        ['Five AI sites only', 'Site access is limited to the supported AI pages.'],
        ['Automatic mode is opt-in', 'Off by default, and it only runs while an AI page is open.']
      ]
    },
    promo: { tagline: 'Screenshots into AI chats, in one step' }
  },
  zh_CN: {
    overview: {
      eyebrow: 'ChatGPT · Claude · Gemini · 豆包 · Grok',
      title: '截图，一键放进<br />AI 对话框',
      lead: '复制截图后按 Alt+Shift+A，图片就进入 AI 输入框。<br />要问什么、何时发送，仍由你决定。',
      points: ['五个 AI 站点，一个快捷键', '可选的自动模式', '绝不替你发送消息']
    },
    chat: { address: '你的 AI 对话', placeholder: '有问题，尽管问', attached: '已附加', notSent: '点击发送前不会发出' },
    popup: {
      eyebrow: '一个弹窗',
      title: '选目标、附加，一步到位',
      lead: '所有操作都在工具栏弹窗里完成，不用离开当前页面。',
      callouts: [
        ['默认 AI', '一个按钮，附加到你在设置里选的 AI。'],
        ['自动模式状态', '一眼看出新截图会不会自动附加。'],
        ['五个 AI 站点', 'ChatGPT、Claude、Gemini、豆包、Grok，各一键直达。'],
        ['结果清楚', '附加成功会确认；没确认时，告诉你该检查什么。']
      ]
    },
    auto: {
      eyebrow: '可选功能',
      title: '自动模式',
      lead: '开启一次就好。AI 页面开着时，你复制的每张新截图都会自动附加。',
      steps: [
        ['在设置里开启', '不开启就不会运行。'],
        ['打开一个 AI 页面', '只在 ChatGPT、Claude、Gemini、豆包或 Grok 打开时检测剪贴板。'],
        ['复制一张截图', '大约一秒内出现在当前的 AI 输入框里。']
      ],
      badge: '默认关闭'
    },
    shortcuts: {
      eyebrow: '键盘直达',
      title: '不碰鼠标也能附加',
      lead: '默认快捷键装好即用，也可以随时修改。',
      cardTitle: '键盘快捷键',
      notSet: '未设置',
      note: '豆包和 Grok：用弹窗按钮、把它设为默认 AI，或在 chrome://extensions/shortcuts 里自己分配快捷键。'
    },
    privacy: {
      eyebrow: '隐私',
      title: '隐私边界，一目了然',
      lead: '只做一件事：把你复制的截图放进你选的 AI 页面。',
      cards: [
        ['绝不自动发送', '每条消息都由你检查后自己发送。'],
        ['不读取聊天记录', '不会读取你的任何对话。'],
        ['不保存截图历史', '插件不会存储任何截图。'],
        ['不上传到开发者服务器', '不会把任何内容传给插件作者。'],
        ['只访问五个 AI 站点', '站点权限仅限受支持的 AI 页面。'],
        ['自动模式需手动开启', '默认关闭，且只在 AI 页面打开时运行。']
      ]
    },
    promo: { tagline: '截图，一键放进 AI 对话框' }
  }
};

const ICONS = {
  tick: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
  puzzle:
    '<svg class="puzzle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10 4a2 2 0 114 0v2h4v4h-2a2 2 0 100 4h2v4h-4v-2a2 2 0 10-4 0v2H6v-4H4a2 2 0 110-4h2V6h4z"/></svg>',
  clip: '<svg class="clip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"/></svg>',
  send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  arrow:
    '<svg class="arrow" viewBox="0 0 34 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h28M23 3l7 7-7 7"/></svg>',
  info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6.2v.2"/></svg>',
  toggleOn:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="3" fill="currentColor"/></svg>',
  page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9h18"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M3.5 15.5l4.8-4.2 3.6 3.2 2.7-2.4 6 5.4"/><circle cx="15.5" cy="9.5" r="1.6"/></svg>',
  noSend:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3l-6.5 18-3.5-7-7-3.5L21 3z"/><path d="M4 4l16 16"/></svg>',
  noChat:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15.5a2 2 0 01-2 2H8l-4 3.5V6.5a2 2 0 012-2h12a2 2 0 012 2z"/><path d="M4 4l16 16"/></svg>',
  noHistory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 102.5-6"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 2"/></svg>',
  noCloud:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 00.6-7.95A6 6 0 006.2 8.5 4.5 4.5 0 007 18z"/><path d="M4 4l16 16"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M8.8 12l2.2 2.2 4.4-4.6"/></svg>',
  toggleOff:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="7.5" cy="12" r="3"/></svg>'
};

// A small made-up dashboard that stands in for the user's screenshot.
const THUMBNAIL = `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
  <rect width="160" height="110" fill="#ffffff"/>
  <rect width="160" height="16" fill="#eef2f8"/>
  <circle cx="9" cy="8" r="3" fill="#f87171"/><circle cx="18" cy="8" r="3" fill="#fbbf24"/><circle cx="27" cy="8" r="3" fill="#34d399"/>
  <rect y="16" width="34" height="94" fill="#f4f7fb"/>
  <rect x="7" y="26" width="20" height="4" rx="2" fill="#d4dce8"/><rect x="7" y="36" width="16" height="4" rx="2" fill="#e1e7f0"/>
  <rect x="7" y="46" width="18" height="4" rx="2" fill="#e1e7f0"/><rect x="7" y="56" width="14" height="4" rx="2" fill="#e1e7f0"/>
  <rect x="44" y="25" width="46" height="6" rx="3" fill="#cbd5e1"/>
  <rect x="44" y="38" width="32" height="14" rx="4" fill="#e0ecff"/><rect x="80" y="38" width="32" height="14" rx="4" fill="#dcfce7"/><rect x="116" y="38" width="32" height="14" rx="4" fill="#fef3c7"/>
  <path d="M44 96 L44 84 L60 72 L76 77 L92 60 L108 65 L124 49 L148 54 L148 96 Z" fill="#2563eb" fill-opacity=".13"/>
  <polyline points="44,84 60,72 76,77 92,60 108,65 124,49 148,54" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_URL = '/icons/icon-128.png';
const messagesCache = new Map();

async function loadMessages(locale) {
  if (!messagesCache.has(locale)) {
    messagesCache.set(
      locale,
      fetch(`/_locales/${locale}/messages.json`).then((response) => response.json())
    );
  }
  const messages = await messagesCache.get(locale);
  return (key) => messages[key]?.message ?? key;
}

const brand = (name) => `<div class="brand"><img src="${ICON_URL}" alt="" /><span>${name}</span></div>`;
const at = (left, top, width) =>
  `position:absolute;left:${left}px;top:${top}px;${width === undefined ? '' : `width:${width}px;`}`;

function keys(letter) {
  return `<span class="key">Alt</span><span class="plus">+</span><span class="key">Shift</span><span class="plus">+</span><span class="key accent">${letter}</span>`;
}

function chatWindow({ left, top, width, height, copy, toast }) {
  const composerHeight = 128;
  return `
    <div class="window" style="${at(left, top, width)}height:${height}px">
      <div class="window-bar">
        <div class="window-dots"><i></i><i></i><i></i></div>
        <div class="address">${ICONS.lock}<span>${copy.chat.address}</span></div>
        <div class="toolbar-icons">${ICONS.puzzle}<span class="extension"><img src="${ICON_URL}" alt="" /></span></div>
      </div>
      <div class="chat-page">
        <div class="chat-sidebar"><i></i><i></i><i style="width:80%"></i><i style="width:60%"></i><i style="width:72%"></i></div>
        <div class="chat-main">
          <div class="bubble user" style="right:28px;top:28px;width:52%"><i></i><i style="width:64%"></i></div>
          <div class="bubble assistant" style="left:28px;top:118px;width:66%"><i></i><i></i><i style="width:78%"></i><i style="width:46%"></i></div>
          <div class="composer" style="left:24px;right:24px;bottom:24px;height:${composerHeight}px">
            <div class="attachment">
              <div class="thumb">${THUMBNAIL}</div>
              <div><strong>screenshot.png</strong><small>${ICONS.check}${copy.chat.attached}</small></div>
            </div>
            <div class="composer-row">
              <span class="placeholder">${ICONS.clip}${copy.chat.placeholder}</span>
              <span class="send">${ICONS.send}</span>
            </div>
          </div>
          ${
            toast
              ? `<div class="page-toast" style="position:absolute;right:20px;top:20px;max-width:300px;padding:12px 14px;border-radius:8px;border:1px solid rgba(15,23,42,.12);background:#ecfdf5;color:#0f172a;font-size:14px;line-height:1.45;box-shadow:0 16px 38px rgba(15,23,42,.18)">${toast}</div>`
              : ''
          }
        </div>
      </div>
    </div>`;
}

function notSentTag(copy, right, top) {
  return `<div class="not-sent" style="right:${right}px;top:${top}px">${copy.chat.notSent}</div>`;
}

function keyCard(left, top, scale = 1) {
  return `<div style="${at(left, top)}display:flex;align-items:center;gap:10px;padding:18px 22px;border-radius:20px;background:#ffffff;box-shadow:var(--card-shadow);transform:scale(${scale});transform-origin:left top">${keys('A')}</div>`;
}

async function buildOverview({ copy, name, msg }) {
  const text = copy.overview;
  return `
    <div style="${at(72, 64)}">${brand(name)}</div>
    <div style="${at(72, 176, 430)}display:grid;gap:22px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title">${text.title}</h1>
      <p class="lead">${text.lead}</p>
      <ul class="points" style="margin-top:10px">${text.points.map((point) => `<li><span class="tick">${ICONS.tick}</span>${point}</li>`).join('')}</ul>
    </div>
    ${chatWindow({ left: 572, top: 84, width: 652, height: 632, copy, toast: msg('attachSuccess') })}
    ${keyCard(526, 318)}
    ${notSentTag(copy, 1280 - 1224 + 30, 84 + 632 - 24 - 128 - 50)}`;
}

async function buildPopup({ copy, name, locale }) {
  const text = copy.popup;
  const shot = await captureUi('popup', locale, 'auto=on&default=chatgpt&resultTarget=chatgpt');
  const scale = Math.min(1.12, 700 / shot.height);
  const width = shot.width * scale;
  const left = 170;
  const top = Math.round((800 - shot.height * scale) / 2);
  const regions = [shot.regions.defaultTarget, shot.regions.autoStatus, shot.regions.quick, shot.regions.result];
  const markers = regions
    .map((region, index) =>
      region
        ? `<span class="marker" style="left:${left - 15}px;top:${Math.round(top + (region.y + Math.min(region.height, 44) / 2) * scale - 15)}px">${index + 1}</span>`
        : ''
    )
    .join('');
  return `
    <div style="${at(660, 64)}">${brand(name)}</div>
    <div class="ui-shot" style="${at(left, top, width)}"><img src="${shot.src}" alt="" /></div>
    ${markers}
    <div style="${at(660, 150, 548)}display:grid;gap:18px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title" style="font-size:44px">${text.title}</h1>
      <p class="lead" style="font-size:18px">${text.lead}</p>
      <ol class="callouts" style="margin-top:18px">${text.callouts
        .map(
          ([title, body], index) =>
            `<li><span class="marker">${index + 1}</span><div><strong>${title}</strong><span>${body}</span></div></li>`
        )
        .join('')}</ol>
    </div>`;
}

async function buildAutoMode({ copy, name, locale }) {
  const text = copy.auto;
  const shot = await captureUi('options', locale, 'auto=on&default=chatgpt');
  const frame = { left: 600, top: 72, width: 620, height: 656 };
  const scale = frame.width / shot.width;
  const toggle = shot.regions.autoToggle;
  const highlight = toggle
    ? `<div class="highlight" style="left:${Math.round(frame.left + toggle.x * scale - 6)}px;top:${Math.round(frame.top + 46 + toggle.y * scale - 2)}px;width:${Math.round(toggle.width * scale + 12)}px;height:${Math.round(toggle.height * scale + 2)}px;box-shadow:0 0 0 4px rgba(37,99,235,.14)"></div>`
    : '';
  const stepIcons = [ICONS.toggleOn, ICONS.page, ICONS.image];
  return `
    <div style="${at(72, 64)}">${brand(name)}</div>
    <div style="${at(72, 160, 450)}display:grid;gap:18px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title">${text.title}</h1>
      <p class="lead" style="font-size:18px">${text.lead}</p>
      <ol class="steps" style="margin-top:14px">${text.steps
        .map(
          ([title, body], index) =>
            `<li><span class="step-icon">${stepIcons[index]}</span><div><strong>${title}</strong><span>${body}</span></div></li>`
        )
        .join('')}</ol>
      <span class="pill" style="margin-top:6px">${ICONS.toggleOff.replace('<svg', '<svg width="18" height="18"')}${text.badge}</span>
    </div>
    <div class="window" style="${at(frame.left, frame.top, frame.width)}height:${frame.height}px">
      <div class="window-bar">
        <div class="window-dots"><i></i><i></i><i></i></div>
        <div class="address">${ICONS.puzzle.replace('class="puzzle"', 'style="width:13px;height:13px"')}<span>${name}</span></div>
      </div>
      <img src="${shot.src}" alt="" style="display:block;width:${frame.width}px" />
    </div>
    ${highlight}`;
}

async function buildShortcuts({ copy, name, msg }) {
  const text = copy.shortcuts;
  const rows = [
    ['A', msg('popupDefaultTarget')],
    ['1', 'ChatGPT'],
    ['2', 'Claude'],
    ['3', 'Gemini']
  ];
  const commands = [
    ['commandAttachDefault', 'Alt+Shift+A'],
    ['commandAttachChatgpt', 'Alt+Shift+1'],
    ['commandAttachClaude', 'Alt+Shift+2'],
    ['commandAttachGemini', 'Alt+Shift+3'],
    ['commandAttachDoubao', ''],
    ['commandAttachGrok', '']
  ];
  return `
    <div style="${at(72, 64)}">${brand(name)}</div>
    <div style="${at(72, 150, 560)}display:grid;gap:18px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title" style="font-size:46px">${text.title}</h1>
      <p class="lead" style="font-size:18px">${text.lead}</p>
      <div class="shortcut-rows" style="margin-top:18px">${rows
        .map(
          ([letter, label]) =>
            `<div class="shortcut-row">${keys(letter)}${ICONS.arrow}<span class="target-pill">${label}</span></div>`
        )
        .join('')}</div>
    </div>
    <div class="shortcut-card" style="${at(728, 132, 480)}">
      <header><img src="${ICON_URL}" alt="" />${name}</header>
      <ul>${commands
        .map(
          ([key, shortcut]) =>
            `<li><span>${msg(key)}</span><code class="${shortcut ? '' : 'empty'}">${shortcut || text.notSet}</code></li>`
        )
        .join('')}</ul>
    </div>
    <div class="note" style="${at(728, 556, 480)}">${ICONS.info}<span>${text.note}</span></div>`;
}

async function buildPrivacy({ copy, name }) {
  const text = copy.privacy;
  const icons = [ICONS.noSend, ICONS.noChat, ICONS.noHistory, ICONS.noCloud, ICONS.shield, ICONS.toggleOff];
  return `
    <div style="${at(72, 64)}">${brand(name)}</div>
    <div style="${at(72, 150, 820)}display:grid;gap:16px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title">${text.title}</h1>
      <p class="lead">${text.lead}</p>
    </div>
    <div class="privacy-grid" style="${at(72, 340, 1136)}">${text.cards
      .map(
        ([title, body], index) =>
          `<div class="privacy-card"><span class="badge">${icons[index]}</span><strong>${title}</strong><span>${body}</span></div>`
      )
      .join('')}</div>`;
}

async function buildSmallPromo({ copy, name, msg }) {
  const targets = ['ChatGPT', 'Claude', 'Gemini', msg('targetDoubao'), 'Grok'];
  return `
    <div style="position:absolute;inset:0;background:radial-gradient(260px 200px at 100% 0%, rgba(37,99,235,.22), transparent 70%),radial-gradient(240px 180px at 0% 100%, rgba(13,148,136,.16), transparent 70%),linear-gradient(160deg,#f9fbff,#eaf1fc)"></div>
    <img src="${ICON_URL}" alt="" style="${at(30, 30)}width:64px;height:64px;border-radius:16px;box-shadow:0 10px 22px -10px rgba(37,99,235,.8)" />
    <div style="${at(110, 36, 300)}font-size:23px;font-weight:750;line-height:1.15;color:var(--ink)">${name}</div>
    <div style="${at(30, 116, 380)}font-size:21px;font-weight:650;line-height:1.35;color:var(--blue-deep)">${copy.promo.tagline}</div>
    <div class="chips" style="${at(30, 206, 390)}">${targets.map((target) => `<span>${target}</span>`).join('')}</div>`;
}

async function buildMarquee({ copy, name, msg }) {
  const text = copy.overview;
  return `
    <div style="${at(80, 60)}">${brand(name)}</div>
    <div style="${at(80, 150, 520)}display:grid;gap:20px">
      <p class="eyebrow">${text.eyebrow}</p>
      <h1 class="title" style="font-size:52px">${text.title}</h1>
      <p class="lead">${text.lead}</p>
    </div>
    ${chatWindow({ left: 760, top: 56, width: 580, height: 448, copy, toast: msg('attachSuccess') })}
    ${keyCard(668, 236, 0.92)}
    ${notSentTag(copy, 1400 - 1340 + 30, 56 + 448 - 24 - 128 - 50)}`;
}

const ASSETS = [
  { id: 'overview', file: 'screenshot-1-overview-1280x800.png', width: 1280, height: 800, build: buildOverview },
  { id: 'popup', file: 'screenshot-2-popup-1280x800.png', width: 1280, height: 800, build: buildPopup },
  { id: 'auto', file: 'screenshot-3-auto-mode-1280x800.png', width: 1280, height: 800, build: buildAutoMode },
  { id: 'shortcuts', file: 'screenshot-4-shortcuts-1280x800.png', width: 1280, height: 800, build: buildShortcuts },
  {
    id: 'privacy',
    file: 'screenshot-5-privacy-1280x800.png',
    width: 1280,
    height: 800,
    build: buildPrivacy,
    dark: true
  },
  { id: 'small-promo', file: 'small-promo-440x280.png', width: 440, height: 280, build: buildSmallPromo },
  { id: 'marquee', file: 'marquee-promo-1400x560.png', width: 1400, height: 560, build: buildMarquee }
];

async function renderAsset(asset, locale) {
  const msg = await loadMessages(locale);
  const stage = document.createElement('div');
  stage.className = `stage${asset.dark ? ' dark' : ''}`;
  stage.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
  stage.style.width = `${asset.width}px`;
  stage.style.height = `${asset.height}px`;
  stage.innerHTML = await asset.build({ copy: COPY[locale], name: msg('extName'), msg, locale });
  host.replaceChildren(stage);
  // Wait on load events rather than decode(): decode() never settles while the browser pane is not painting.
  await Promise.all(
    [...stage.querySelectorAll('img')].map((image) =>
      image.complete
        ? undefined
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })
    )
  );
  await document.fonts.ready;
  return stage;
}

async function saveAsset(asset, locale) {
  const stage = await renderAsset(asset, locale);
  const canvas = await toCanvas(stage, {
    width: asset.width,
    height: asset.height,
    canvasWidth: asset.width,
    canvasHeight: asset.height,
    pixelRatio: 1,
    skipFonts: true
  });
  const pixels = canvas.getContext('2d').getImageData(0, 0, asset.width, asset.height).data;
  const query = new URLSearchParams({ file: `${locale}/${asset.file}`, width: asset.width, height: asset.height });
  const response = await fetch(`/__save?${query}`, { method: 'POST', body: pixels });
  if (!response.ok) {
    throw new Error(`${locale}/${asset.file}: ${await response.text()}`);
  }
  return `${locale}/${asset.file}`;
}

async function main() {
  if (params.has('save')) {
    const saved = [];
    const locales = params.has('locale') ? [params.get('locale')] : LOCALES;
    const assets = params.has('asset') ? ASSETS.filter((asset) => asset.id === params.get('asset')) : ASSETS;
    for (const locale of locales) {
      for (const asset of assets) {
        statusLine.textContent = `Rendering ${locale}/${asset.file}`;
        saved.push(await saveAsset(asset, locale));
      }
    }
    statusLine.textContent = `Saved ${saved.length} images`;
    window.renderResult = { ok: true, saved };
    return;
  }

  const asset = ASSETS.find((candidate) => candidate.id === params.get('asset')) ?? ASSETS[0];
  const locale = params.get('locale') === 'zh_CN' ? 'zh_CN' : 'en';
  await renderAsset(asset, locale);
  statusLine.textContent = `Preview: ${locale}/${asset.file}`;
  window.renderResult = { ok: true, preview: `${locale}/${asset.file}` };
}

main().catch((error) => {
  statusLine.textContent = `Error: ${error.message}`;
  window.renderResult = { ok: false, error: String(error?.stack ?? error) };
});
