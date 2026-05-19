import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { AI_TARGETS, type TargetId } from '../shared/constants';
import type { AttachQueueStatus, AutoMonitorStatus, OperationResult, UiMessage } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';

const quickTargets: TargetId[] = ['chatgpt', 'claude', 'gemini'];

function Popup() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [lastResult, setLastResult] = useState<OperationResult | undefined>();
  const [autoStatus, setAutoStatus] = useState<AutoMonitorStatus | null>(null);
  const [queueStatus, setQueueStatus] = useState<AttachQueueStatus | null>(null);
  const [runningTarget, setRunningTarget] = useState<TargetId | 'default' | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
    chrome.runtime.sendMessage({ type: 'GET_LAST_OPERATION' }).then((result?: OperationResult) => {
      setLastResult(result);
    });
    chrome.runtime.sendMessage({ type: 'GET_AUTO_MONITOR_STATUS' }).then((status?: AutoMonitorStatus) => {
      if (status) {
        setAutoStatus(status);
      }
    });
    chrome.runtime.sendMessage({ type: 'GET_ATTACH_QUEUE_STATUS' }).then((status?: AttachQueueStatus) => {
      if (status) {
        setQueueStatus(status);
      }
    });

    const onMessage = (message: UiMessage) => {
      if (message.type === 'AUTO_MONITOR_STATUS_CHANGED') {
        setAutoStatus(message.status);
      }
      if (message.type === 'ATTACH_QUEUE_STATUS_CHANGED') {
        setQueueStatus(message.status);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    const onStorageChanged = (_changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'sync') {
        void getSettings().then(setSettings);
        chrome.runtime.sendMessage({ type: 'GET_AUTO_MONITOR_STATUS' }).then((status?: AutoMonitorStatus) => {
          if (status) {
            setAutoStatus(status);
          }
        });
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  const defaultTarget = useMemo(
    () => AI_TARGETS[settings?.defaultTargetId ?? 'chatgpt'],
    [settings?.defaultTargetId]
  );

  async function attach(targetId?: TargetId) {
    const marker = targetId ?? 'default';
    setRunningTarget(marker);
    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'ATTACH_TO_TARGET',
        targetId
      })) as OperationResult;
      setLastResult(result);
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
        </div>
        <span className="status-dot" aria-hidden="true" />
      </header>

      <section className="default-target">
        <span>默认目标</span>
        <strong>{defaultTarget.name}</strong>
      </section>

      <section className={`auto-status ${autoStatus?.active ? 'is-active' : settings?.autoAttachEnabled ? 'is-waiting' : ''}`}>
        <span>自动模式</span>
        <strong>{getAutoStatusLabel(settings, autoStatus)}</strong>
        <small>{autoStatus?.message ?? '打开设置可启用自动粘贴'}</small>
      </section>

      <section className={`queue-status ${queueStatus?.busy ? 'is-busy' : ''}`}>
        <span>任务状态</span>
        <strong>{queueStatus?.busy ? getQueueStatusLabel(queueStatus) : '空闲'}</strong>
        <small>{queueStatus?.message ?? '暂无任务'}</small>
      </section>

      <button
        className="primary-button"
        disabled={runningTarget !== null}
        onClick={() => void attach()}
        type="button"
      >
        {runningTarget === 'default' ? '正在附加...' : '附加剪贴板截图到默认 AI'}
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
        {lastResult?.targetName ? <small>{lastResult.targetName} · {lastResult.trigger === 'auto' ? '自动' : '手动'}</small> : null}
      </section>

      <button className="link-button" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
        打开设置
      </button>
    </main>
  );
}

function getAutoStatusLabel(settings: AppSettings | null, status: AutoMonitorStatus | null): string {
  if (!settings?.autoAttachEnabled) {
    return '关闭';
  }

  if (status?.active) {
    return '运行中';
  }

  if (status?.message.includes('启动失败')) {
    return '启动失败';
  }

  if (status?.message.includes('已暂停')) {
    return '已暂停';
  }

  return '等待 AI 页面';
}

function getQueueStatusLabel(status: AttachQueueStatus): string {
  if (status.currentTrigger === 'manual') {
    return '手动处理中';
  }

  if (status.currentTrigger === 'auto') {
    return '自动处理中';
  }

  if (status.pendingManualCount > 0) {
    return '等待手动任务';
  }

  if (status.hasPendingAuto) {
    return '等待自动任务';
  }

  return '处理中';
}

createRoot(document.getElementById('root')!).render(<Popup />);
