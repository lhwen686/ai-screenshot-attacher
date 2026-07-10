export const EXTENSION_NAME = 'AI Screenshot Attacher';
export const PROJECT_URL = 'https://github.com/lhwen686/ai-screenshot-attacher';
export const SUPPORT_URL = `${PROJECT_URL}/issues/new/choose`;
export const PRIVACY_URL = 'https://lhwen686.github.io/ai-screenshot-attacher/privacy/';
export const SHORTCUTS_HELP_URL = 'chrome://extensions/shortcuts';

export type TargetId = 'chatgpt' | 'claude' | 'gemini' | 'doubao';

export interface TargetDefinition {
  id: TargetId;
  name: string;
  defaultUrl: string;
  urlPatterns: string[];
  hostnames: string[];
}

export const AI_TARGETS: Record<TargetId, TargetDefinition> = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    defaultUrl: 'https://chatgpt.com/',
    urlPatterns: ['https://chatgpt.com/*'],
    hostnames: ['chatgpt.com']
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    defaultUrl: 'https://claude.ai/',
    urlPatterns: ['https://claude.ai/*'],
    hostnames: ['claude.ai']
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    defaultUrl: 'https://gemini.google.com/',
    urlPatterns: ['https://gemini.google.com/*'],
    hostnames: ['gemini.google.com']
  },
  doubao: {
    id: 'doubao',
    name: '豆包',
    defaultUrl: 'https://www.doubao.com/chat/',
    urlPatterns: ['https://doubao.com/*', 'https://www.doubao.com/*'],
    hostnames: ['doubao.com', 'www.doubao.com']
  }
};

export const TARGET_IDS = Object.keys(AI_TARGETS) as TargetId[];

export const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
export const ATTACH_RUNTIME_FILE = 'src/content/attachRuntime.js';
export const AUTO_MONITOR_INTERVAL_MS = 1500;
export const AUTO_MONITOR_BASELINE_HEARTBEAT_MS = 10000;
export const AUTO_MONITOR_BASELINE_MAX_AGE_MS = 300000;

export const USER_MESSAGES = {
  noClipboardImage: '未检测到剪贴板图片，请先截图后再试。',
  attachSuccess: '截图已附加，请自行输入问题并发送。',
  attachUnconfirmed: '已执行附加操作，但未能确认结果。请先检查输入区；如果没有图片，再手动 Ctrl+V / Cmd+V。',
  attachFallback: '自动附加失败，已保留截图到剪贴板，请手动 Ctrl+V / Cmd+V。',
  attachFallbackNoWrite: '自动附加失败，请手动 Ctrl+V / Cmd+V。',
  targetLoadFailed: '目标 AI 页面加载失败，请打开页面后重试。',
  serviceUnavailable: '插件后台暂不可用，请稍后重试。',
  autoMonitorEnabled: '自动粘贴模式已开启。',
  autoMonitorDisabled: '自动粘贴模式已关闭。'
} as const;

export const LAST_OPERATION_KEY = 'lastOperationResult';
export const AUTO_DEDUPE_STATE_KEY = 'autoDedupeState';
export const AUTO_MONITOR_BASELINE_KEY = 'autoMonitorBaselineFingerprint';
