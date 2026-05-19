import { AUTO_DEDUPE_STATE_KEY, AUTO_MONITOR_INTERVAL_MS, AI_TARGETS, USER_MESSAGES } from '../shared/constants';
import type { ClipboardImagePayload, OffscreenMonitorResult } from '../clipboard/types';
import type { AutoMonitorStatus, OperationResult } from '../shared/messages';
import { getSettings } from '../shared/settings';
import { ensureOffscreenDocument, hasOffscreenDocument } from '../clipboard/offscreenClient';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import { logger } from '../shared/logger';
import { countOpenTargetTabs, executeAttachRuntime, getBestOpenTargetTabForAuto, showToastOnPage } from './tabManager';
import { recordOperationResult } from './commandHandler';

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
let autoAttachInFlight = false;
let pendingAutoImage:
  | {
      image: ClipboardImagePayload;
      fingerprint: string;
    }
  | undefined;

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

  if (autoAttachInFlight) {
    pendingAutoImage = { image, fingerprint };
    return;
  }

  autoAttachInFlight = true;
  lastHandledFingerprint = fingerprint;
  lastHandledAt = Date.now();
  await persistAutoDedupeState(fingerprint, lastHandledAt);

  try {
    const selection = await getBestOpenTargetTabForAuto();
    if (!selection?.tab.id) {
      await refreshAutoMonitor();
      return;
    }

    const target = AI_TARGETS[selection.targetId];
    const attachResult = await executeAttachRuntime(selection.tab.id, {
      targetId: selection.targetId,
      image,
      settings: {
        showPageToast: settings.showPageToast,
        writeBackOnFailure: settings.writeBackOnFailure,
        debugLogs: settings.debugLogs
      }
    });

    if (attachResult.ok) {
      await recordOperationResult({
        ok: true,
        targetId: selection.targetId,
        targetName: target.name,
        method: attachResult.method,
        message: USER_MESSAGES.attachSuccess,
        trigger: 'auto',
        at: new Date().toISOString()
      });
      return;
    }

    const fallbackMessage = settings.writeBackOnFailure ? USER_MESSAGES.attachFallback : USER_MESSAGES.attachFallbackNoWrite;
    let finalMessage: string = fallbackMessage;

    if (settings.writeBackOnFailure) {
      const writeResult = await writeClipboardImage(image);
      if (!writeResult.ok) {
        finalMessage = `${fallbackMessage}（写回剪贴板失败，但原剪贴板通常仍保留截图。）`;
      }
    }

    if (settings.showPageToast) {
      await showToastOnPage(selection.tab.id, finalMessage, 'error');
    }

    await recordOperationResult({
      ok: false,
      targetId: selection.targetId,
      targetName: target.name,
      method: 'clipboard-fallback',
      error: attachResult.error ?? 'AUTO_ATTACH_FAILED',
      message: finalMessage,
      trigger: 'auto',
      at: new Date().toISOString()
    });
  } finally {
    autoAttachInFlight = false;
    const pending = pendingAutoImage;
    pendingAutoImage = undefined;
    if (pending && pending.fingerprint !== lastHandledFingerprint) {
      await handleAutoClipboardImage(pending.image, pending.fingerprint);
    }
  }
}

async function refreshAutoMonitorInner(): Promise<AutoMonitorStatus> {
  const settings = await getSettings();
  logger.configure({ debug: settings.debugLogs });

  const targetCount = settings.autoAttachEnabled ? await countOpenTargetTabs() : 0;
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
