// A stand-in for the extension APIs, so the real popup and settings page render with demo data in a normal tab.
import { formatMessage } from '/src/shared/i18n.ts';

const TARGET_KEYS = {
  chatgpt: 'targetChatgpt',
  claude: 'targetClaude',
  gemini: 'targetGemini',
  doubao: 'targetDoubao',
  grok: 'targetGrok'
};

export async function installChromeStub(params) {
  const locale = params.get('locale') === 'zh_CN' ? 'zh_CN' : 'en';
  const messages = await (await fetch(`/_locales/${locale}/messages.json`)).json();
  const getMessage = (key, substitutions) => (messages[key] ? formatMessage(messages[key], substitutions) : '');

  const autoOn = params.get('auto') === 'on';
  const resultTarget = params.get('resultTarget') ?? 'chatgpt';
  const settings = {
    defaultTargetId: params.get('default') ?? 'chatgpt',
    autoAttachEnabled: autoOn,
    showPageToast: true,
    writeBackOnFailure: true,
    openInNewTab: true,
    debugLogs: false
  };
  const lastResult =
    params.get('result') === 'none'
      ? undefined
      : {
          ok: true,
          targetId: resultTarget,
          targetName: getMessage(TARGET_KEYS[resultTarget]),
          message: getMessage('attachSuccess'),
          trigger: params.get('trigger') === 'auto' ? 'auto' : 'manual',
          at: new Date().toISOString()
        };
  const autoStatus = autoOn
    ? { enabled: true, active: true, targetCount: 1, message: getMessage('autoMonitorRunning') }
    : { enabled: false, active: false, targetCount: 0, message: getMessage('autoMonitorDisabled') };
  const listeners = { addListener() {}, removeListener() {} };

  window.chrome = {
    i18n: { getMessage, getUILanguage: () => (locale === 'zh_CN' ? 'zh-CN' : 'en') },
    storage: {
      sync: {
        get: async () => ({ settings: { ...settings } }),
        set: async (values) => Object.assign(settings, values.settings ?? {})
      },
      local: { get: async () => ({}), set: async () => undefined },
      onChanged: listeners
    },
    runtime: {
      sendMessage: async (message) => {
        if (message?.type === 'GET_LAST_OPERATION') {
          return lastResult;
        }
        return message?.type === 'GET_AUTO_MONITOR_STATUS' ? autoStatus : undefined;
      },
      onMessage: listeners,
      openOptionsPage() {}
    },
    tabs: { create: async () => undefined }
  };
}
