import { AUTO_DEDUPE_STATE_KEY, AUTO_MONITOR_INTERVAL_MS, USER_MESSAGES } from '../shared/constants';
import type { ClipboardImagePayload, OffscreenMonitorResult } from '../clipboard/types';
import type { AutoMonitorStatus } from '../shared/messages';
import { getSettings } from '../shared/settings';
import { ensureOffscreenDocument, hasOffscreenDocument } from '../clipboard/offscreenClient';
import { logger } from '../shared/logger';
import { countOpenTargetTabs } from './tabManager';
import { enqueueAutoAttachment } from './attachQueue';

let refreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let refreshInFlight: Promise<AutoMonitorStatus> | undefined;
let currentStatus: AutoMonitorStatus = {
  enabled: false,
  active: false,
  targetCount: 0,
  message: USER_MESSAGES.autoMonitorDisabled
};
let lastHandledFingerprint: string | undefined;
let lastHandledAt = 0;
let monitorPausedUntil = 0;

export function scheduleAutoMonitorRefresh(): void {
  if (refreshTimer !== undefined) {
    globalThis.clearTimeout(refreshTimer);
  }

  refreshTimer = globalThis.setTimeout(() => {
    refreshTimer = undefined;
    void refreshAutoMonitor();
  }, 500);
}

export async function refreshAutoMonitor(): Promise<AutoMonitorStatus> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshAutoMonitorInner().finally(() => {
    refreshInFlight = undefined;
  });

  return refreshInFlight;
}

export function getAutoMonitorStatus(): AutoMonitorStatus {
  return currentStatus;
}

export async function handleAutoClipboardImage(image: ClipboardImagePayload, fingerprint: string): Promise<void> {
  const settings = await getSettings();
  logger.configure({ debug: settings.debugLogs });

  if (settings.autoAttachEnabled && !currentStatus.active) {
    await refreshAutoMonitor();
  }

  if (!settings.autoAttachEnabled || !currentStatus.active) {
    return;
  }

  if (await isDuplicateAutoImage(fingerprint)) {
    return;
  }

  lastHandledFingerprint = fingerprint;
  lastHandledAt = Date.now();
  await persistAutoDedupeState(fingerprint, lastHandledAt);

  enqueueAutoAttachment(image, fingerprint);
}

export function handleOffscreenAutoMonitorError(message: string): void {
  monitorPausedUntil = Date.now() + 30000;
  setStatus({
    ...currentStatus,
    active: false,
    message: `自动粘贴模式已暂停：${message}`
  });
  globalThis.setTimeout(() => scheduleAutoMonitorRefresh(), 30000);
}

async function refreshAutoMonitorInner(): Promise<AutoMonitorStatus> {
  const settings = await getSettings();
  logger.configure({ debug: settings.debugLogs });

  const targetCount = settings.autoAttachEnabled ? await countOpenTargetTabs() : 0;
  if (settings.autoAttachEnabled && targetCount > 0 && Date.now() < monitorPausedUntil) {
    return setStatus({
      enabled: true,
      active: false,
      targetCount,
      message: currentStatus.message
    });
  }

  if (!settings.autoAttachEnabled || targetCount === 0) {
    await stopOffscreenMonitorIfPresent();
    return setStatus({
      enabled: settings.autoAttachEnabled,
      active: false,
      targetCount,
      message: settings.autoAttachEnabled
        ? '自动粘贴模式已开启，等待打开 ChatGPT / Claude / Gemini。'
        : USER_MESSAGES.autoMonitorDisabled
    });
  }

  const monitorResult = await startOffscreenMonitor();
  if (monitorResult.ok) {
    monitorPausedUntil = 0;
  }
  return setStatus({
    enabled: true,
    active: monitorResult.ok && monitorResult.active,
    targetCount,
    message: monitorResult.ok
      ? '自动粘贴模式运行中。'
      : `自动粘贴模式启动失败：${monitorResult.message}`
  });
}

async function startOffscreenMonitor(): Promise<OffscreenMonitorResult> {
  try {
    await ensureOffscreenDocument();
    const response = (await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: AUTO_MONITOR_INTERVAL_MS
    })) as OffscreenMonitorResult | undefined;

    return response ?? { ok: false, active: false, message: 'offscreen monitor did not respond' };
  } catch (error) {
    logger.warn('auto monitor start failed', { error });
    return { ok: false, active: false, message: 'offscreen monitor start failed' };
  }
}

async function stopOffscreenMonitorIfPresent(): Promise<void> {
  if (!(await hasOffscreenDocument())) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  } catch (error) {
    logger.debug('auto monitor stop failed', { error });
  }

  lastHandledFingerprint = undefined;
  lastHandledAt = 0;
  await chrome.storage.local.remove(AUTO_DEDUPE_STATE_KEY);
}

function setStatus(status: AutoMonitorStatus): AutoMonitorStatus {
  currentStatus = status;
  void chrome.runtime.sendMessage({ type: 'AUTO_MONITOR_STATUS_CHANGED', status }).catch(() => undefined);
  return currentStatus;
}

async function isDuplicateAutoImage(fingerprint: string): Promise<boolean> {
  const now = Date.now();
  if (fingerprint === lastHandledFingerprint && now - lastHandledAt < 10000) {
    return true;
  }

  const stored = await chrome.storage.local.get(AUTO_DEDUPE_STATE_KEY);
  const state = stored[AUTO_DEDUPE_STATE_KEY] as { fingerprint?: string; at?: number } | undefined;
  if (state?.fingerprint === fingerprint && typeof state.at === 'number' && now - state.at < 10000) {
    lastHandledFingerprint = state.fingerprint;
    lastHandledAt = state.at;
    return true;
  }

  return false;
}

async function persistAutoDedupeState(fingerprint: string, at: number): Promise<void> {
  await chrome.storage.local.set({
    [AUTO_DEDUPE_STATE_KEY]: {
      fingerprint,
      at
    }
  });
}
