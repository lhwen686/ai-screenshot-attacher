import { t } from './i18n';

export const EXTENSION_NAME = 'AI Screenshot Attacher';
export const PROJECT_URL = 'https://github.com/lhwen686/ai-screenshot-attacher';
export const SUPPORT_URL = `${PROJECT_URL}/issues/new/choose`;
export const PRIVACY_URL = `${PROJECT_URL}/blob/main/PRIVACY.md`;
export const SHORTCUTS_HELP_URL = 'chrome://extensions/shortcuts';

export type TargetId = 'chatgpt' | 'claude' | 'gemini' | 'doubao' | 'grok';

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
    name: 'Doubao',
    defaultUrl: 'https://www.doubao.com/chat/',
    urlPatterns: ['https://doubao.com/*', 'https://www.doubao.com/*'],
    hostnames: ['doubao.com', 'www.doubao.com']
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    defaultUrl: 'https://grok.com/',
    urlPatterns: ['https://grok.com/*'],
    hostnames: ['grok.com']
  }
};

export const TARGET_IDS = Object.keys(AI_TARGETS) as TargetId[];

export function isTargetUrl(rawUrl: string | undefined, hostnames: string[]): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && hostnames.includes(url.hostname);
  } catch {
    return false;
  }
}

export function isSupportedTargetUrl(rawUrl: string | undefined): boolean {
  return TARGET_IDS.some((targetId) => isTargetUrl(rawUrl, AI_TARGETS[targetId].hostnames));
}

export const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
export const ATTACH_RUNTIME_FILE = 'src/content/attachRuntime.js';
export const AUTO_MONITOR_INTERVAL_MS = 1000;
export const AUTO_MONITOR_BASELINE_HEARTBEAT_MS = 10000;
export const AUTO_MONITOR_BASELINE_MAX_AGE_MS = 300000;

// Getters resolve each message in the browser's language when it is shown.
export const USER_MESSAGES = {
  get noClipboardImage() {
    return t('noClipboardImage');
  },
  get attachSuccess() {
    return t('attachSuccess');
  },
  get attachUnconfirmed() {
    return t('attachUnconfirmed');
  },
  get attachFallback() {
    return t('attachFallback');
  },
  get attachFallbackNoWrite() {
    return t('attachFallbackNoWrite');
  },
  get targetLoadFailed() {
    return t('targetLoadFailed');
  },
  get serviceUnavailable() {
    return t('serviceUnavailable');
  },
  get autoMonitorEnabled() {
    return t('autoMonitorEnabled');
  },
  get autoMonitorDisabled() {
    return t('autoMonitorDisabled');
  }
};

export const LAST_OPERATION_KEY = 'lastOperationResult';
export const AUTO_DEDUPE_STATE_KEY = 'autoDedupeState';
export const AUTO_MONITOR_BASELINE_KEY = 'autoMonitorBaselineFingerprint';
