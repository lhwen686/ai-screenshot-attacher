import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { PRIVACY_URL, SUPPORT_URL, TARGET_IDS, USER_MESSAGES, type TargetId } from '../shared/constants';
import { getTargetDisplayName, t } from '../shared/i18n';
import type { AutoMonitorStatus, OperationResult, UiMessage } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';

const quickTargets = TARGET_IDS;

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

  const defaultTargetName = useMemo(
    () => getTargetDisplayName(settings?.defaultTargetId ?? 'chatgpt'),
    [settings?.defaultTargetId]
  );

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
        targetName: getTargetDisplayName(targetId),
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
          <p className="eyebrow">{t('extName')}</p>
          <h1>{t('popupTitle')}</h1>
          <p className="header-copy">{t('popupIntro')}</p>
        </div>
        <span className="status-dot" aria-hidden="true" />
      </header>

      <section className="default-target">
        <span>{t('popupDefaultTarget')}</span>
        <strong>{settings ? defaultTargetName : settingsLoadFailed ? t('popupLoadFailed') : t('popupLoading')}</strong>
      </section>

      <section
        className={`auto-status ${autoStatus?.active ? 'is-active' : settings?.autoAttachEnabled ? 'is-waiting' : ''}`}
      >
        <span>{t('popupAutoMode')}</span>
        <strong>{getAutoStatusLabel(settings, autoStatus)}</strong>
        <small>{autoStatus?.message ?? t('popupAutoHint')}</small>
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
          ? t('popupAttaching')
          : settings
            ? t('popupAttachDefault', defaultTargetName)
            : settingsLoadFailed
              ? t('popupDefaultLoadFailed')
              : t('popupDefaultLoading')}
      </button>

      <div className="quick-grid" aria-label={t('popupQuickTargets')}>
        {quickTargets.map((targetId) => (
          <button
            className="quick-button"
            disabled={runningTarget !== null}
            key={targetId}
            onClick={() => void attach(targetId)}
            type="button"
          >
            {runningTarget === targetId ? t('popupWorking') : t('popupAttachTo', getTargetDisplayName(targetId))}
          </button>
        ))}
      </div>

      <section className={`result-panel ${lastResult?.ok ? 'is-success' : lastResult ? 'is-error' : ''}`}>
        <span>{t('popupLastResult')}</span>
        <p>{lastResult?.message ?? t('popupNoHistory')}</p>
        {lastResult?.targetName ? (
          <small>
            {lastResult.targetName} · {lastResult.trigger === 'auto' ? t('triggerAuto') : t('triggerManual')}
          </small>
        ) : null}
      </section>

      <div className="footer-links" aria-label={t('popupHelpLinks')}>
        <button className="link-button" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          {t('linkSettings')}
        </button>
        <button className="link-button" type="button" onClick={() => void openExternal(SUPPORT_URL)}>
          {t('linkFeedback')}
        </button>
        <button className="link-button" type="button" onClick={() => void openExternal(PRIVACY_URL)}>
          {t('linkPrivacy')}
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
    return t('autoLabelOff');
  }

  if (status?.active) {
    return t('autoLabelRunning');
  }

  return t('autoLabelWaiting');
}

document.documentElement.lang = t('localeTag');
document.title = t('extName');
createRoot(document.getElementById('root')!).render(<Popup />);
