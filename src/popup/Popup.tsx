import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { AI_TARGETS, PRIVACY_URL, SUPPORT_URL, USER_MESSAGES, type TargetId } from '../shared/constants';
import type { AutoMonitorStatus, OperationResult, UiMessage } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';

const quickTargets: TargetId[] = ['chatgpt', 'claude', 'gemini', 'doubao'];

function Popup() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [lastResult, setLastResult] = useState<OperationResult | undefined>();
  const [autoStatus, setAutoStatus] = useState<AutoMonitorStatus | null>(null);
  const [runningTarget, setRunningTarget] = useState<TargetId | 'default' | null>(null);

  useEffect(() => {
    let active = true;
    let settingsRequestId = 0;

    const refreshSettings = () => {
      const requestId = ++settingsRequestId;
      void getSettings().then(
        (loadedSettings) => {
          if (active && requestId === settingsRequestId) {
            setSettings(loadedSettings);
            setSettingsLoadFailed(false);
          }
        },
        () => {
          if (active && requestId === settingsRequestId) {
            setSettingsLoadFailed(true);
          }
        }
      );
    };

    refreshSettings();
    void chrome.runtime
      .sendMessage({ type: 'GET_LAST_OPERATION' })
      .then((result?: OperationResult) => {
        setLastResult(result);
      })
      .catch(ignorePopupLoadFailure);
    void chrome.runtime
      .sendMessage({ type: 'GET_AUTO_MONITOR_STATUS' })
      .then((status?: AutoMonitorStatus) => {
        if (status) {
          setAutoStatus(status);
        }
      })
      .catch(ignorePopupLoadFailure);

    const onMessage = (message: UiMessage) => {
      if (message.type === 'AUTO_MONITOR_STATUS_CHANGED') {
        setAutoStatus(message.status);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    const onStorageChanged = (_changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'sync') {
        refreshSettings();
        void chrome.runtime
          .sendMessage({ type: 'GET_AUTO_MONITOR_STATUS' })
          .then((status?: AutoMonitorStatus) => {
            if (status) {
              setAutoStatus(status);
            }
          })
          .catch(ignorePopupLoadFailure);
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  const defaultTarget = useMemo(() => AI_TARGETS[settings?.defaultTargetId ?? 'chatgpt'], [settings?.defaultTargetId]);

  async function attach(targetId: TargetId, marker: TargetId | 'default' = targetId) {
    setRunningTarget(marker);
    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'ATTACH_TO_TARGET',
        targetId
      })) as OperationResult;
      setLastResult(result);
    } catch {
      setLastResult({
        ok: false,
        targetId,
        targetName: AI_TARGETS[targetId].name,
        message: USER_MESSAGES.serviceUnavailable,
        trigger: 'manual',
        at: new Date().toISOString()
      });
    } finally {
      setRunningTarget(null);
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">AI Screenshot Attacher</p>
          <h1>附加剪贴板截图</h1>
          <p className="header-copy">截图会进入目标 AI 输入区；发送消息仍由你手动决定。</p>
        </div>
        <span className="status-dot" aria-hidden="true" />
      </header>

      <section className="default-target">
        <span>默认模型</span>
        <strong>{settings ? defaultTarget.name : settingsLoadFailed ? '加载失败' : '加载中...'}</strong>
      </section>

      <section
        className={`auto-status ${autoStatus?.active ? 'is-active' : settings?.autoAttachEnabled ? 'is-waiting' : ''}`}
      >
        <span>自动模式</span>
        <strong>{getAutoStatusLabel(settings, autoStatus)}</strong>
        <small>{autoStatus?.message ?? '打开设置可启用自动粘贴'}</small>
      </section>

      <button
        className="primary-button"
        disabled={runningTarget !== null || settings === null}
        onClick={() => {
          if (settings) {
            void attach(settings.defaultTargetId, 'default');
          }
        }}
        type="button"
      >
        {runningTarget === 'default'
          ? '正在附加...'
          : settings
            ? `附加到默认模型（${defaultTarget.name}）`
            : settingsLoadFailed
              ? '默认模型加载失败'
              : '正在加载默认模型...'}
      </button>

      <div className="quick-grid" aria-label="快速目标">
        {quickTargets.map((targetId) => (
          <button
            className="quick-button"
            disabled={runningTarget !== null}
            key={targetId}
            onClick={() => void attach(targetId)}
            type="button"
          >
            {runningTarget === targetId ? '处理中' : `附加到 ${AI_TARGETS[targetId].name}`}
          </button>
        ))}
      </div>

      <section className={`result-panel ${lastResult?.ok ? 'is-success' : lastResult ? 'is-error' : ''}`}>
        <span>最近一次结果</span>
        <p>{lastResult?.message ?? '暂无操作记录'}</p>
        {lastResult?.targetName ? (
          <small>
            {lastResult.targetName} · {lastResult.trigger === 'auto' ? '自动' : '手动'}
          </small>
        ) : null}
      </section>

      <div className="footer-links" aria-label="帮助链接">
        <button className="link-button" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          设置
        </button>
        <button className="link-button" type="button" onClick={() => void openExternal(SUPPORT_URL)}>
          反馈
        </button>
        <button className="link-button" type="button" onClick={() => void openExternal(PRIVACY_URL)}>
          隐私
        </button>
      </div>
    </main>
  );
}

function ignorePopupLoadFailure(): void {
  // The popup remains usable with its local defaults and will show a direct error if an attach request also fails.
}

async function openExternal(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

function getAutoStatusLabel(settings: AppSettings | null, status: AutoMonitorStatus | null): string {
  if (!settings?.autoAttachEnabled) {
    return '关闭';
  }

  if (status?.active) {
    return '运行中';
  }

  return '等待 AI 页面';
}

createRoot(document.getElementById('root')!).render(<Popup />);
