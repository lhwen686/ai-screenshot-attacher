import {
  AUTO_DEDUPE_STATE_KEY,
  AUTO_MONITOR_BASELINE_MAX_AGE_MS,
  AUTO_MONITOR_BASELINE_KEY,
  AUTO_MONITOR_INTERVAL_MS,
  AI_TARGETS,
  USER_MESSAGES
} from '../shared/constants';
import type { ClipboardImagePayload, OffscreenMonitorResult } from '../clipboard/types';
import type { AutoMonitorStatus } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';
import { ensureOffscreenDocument, hasOffscreenDocument, resetOffscreenDocument } from '../clipboard/offscreenClient';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import { runWithClipboardOperationLock } from '../clipboard/clipboardOperationLock';
import { logger } from '../shared/logger';
import { withTimeout } from '../shared/withTimeout';
import { countOpenTargetTabs, executeAttachRuntime, getBestOpenTargetTabForAuto, showToastOnPage } from './tabManager';
import { recordOperationResult } from './commandHandler';

const AUTO_BEST_EFFORT_TIMEOUT_MS = 5000;
const AUTO_LIFECYCLE_TIMEOUT_MS = 5000;

interface AutoAttachWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface AutoDedupeState {
  deliveryId: string;
  fingerprint: string;
  at: number;
}

interface StoredMonitorBaseline {
  found: boolean;
  fingerprint?: string;
}

type MonitorStartMode = 'auto' | 'force-resume' | 'fresh-baseline';

type AutoOperationResult = Parameters<typeof recordOperationResult>[0];

let refreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let refreshInFlight: Promise<AutoMonitorStatus> | undefined;
let refreshRequested = false;
let monitorStartSuspended = false;
let monitorLifecycleGeneration = 0;
let currentStatus: AutoMonitorStatus = {
  enabled: false,
  active: false,
  targetCount: 0,
  message: USER_MESSAGES.autoMonitorDisabled
};
let lastHandledDeliveryId: string | undefined;
let latestAutoDedupeState: AutoDedupeState | undefined;
let autoDedupePersistenceRevision = 0;
let latestAutoOperationResult: AutoOperationResult | undefined;
let autoOperationPersistenceRevision = 0;
let autoAttachInFlight = false;
let activeAutoDeliveryId: string | undefined;
let activeAutoWaiters: AutoAttachWaiter[] = [];
let pendingAutoImage:
  | {
      image: ClipboardImagePayload;
      fingerprint: string;
      deliveryId: string;
      lifecycleGeneration: number;
      waiters: AutoAttachWaiter[];
    }
  | undefined;
let monitorStartMode: MonitorStartMode = 'auto';

export function scheduleAutoMonitorRefresh(): void {
  if (monitorStartSuspended) {
    return;
  }
  if (refreshTimer !== undefined) {
    globalThis.clearTimeout(refreshTimer);
  }

  refreshTimer = globalThis.setTimeout(() => {
    refreshTimer = undefined;
    void refreshAutoMonitor().catch((error) => {
      logger.warn('scheduled auto monitor refresh failed', { error });
    });
  }, 500);
}

export function suspendAutoMonitorRefresh(): void {
  monitorLifecycleGeneration += 1;
  monitorStartSuspended = true;
  if (refreshTimer !== undefined) {
    globalThis.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  if (currentStatus.active) {
    setStatus({
      ...currentStatus,
      active: false,
      message: '自动粘贴模式正在恢复，请稍后。'
    });
  }
}

export function resumeAutoMonitorRefresh(): void {
  monitorStartSuspended = false;
}

export function requestAutoMonitorResumeFromStoredState(): void {
  monitorStartMode = 'force-resume';
}

export function requestAutoMonitorFreshBaseline(): void {
  monitorStartMode = 'fresh-baseline';
}

export async function refreshAutoMonitor(): Promise<AutoMonitorStatus> {
  refreshRequested = true;
  if (!refreshInFlight) {
    refreshInFlight = runRefreshLoop().finally(() => {
      refreshInFlight = undefined;
      if (refreshRequested) {
        void refreshAutoMonitor().catch((error) => {
          logger.warn('trailing auto monitor refresh failed', { error });
        });
      }
    });
  }

  return refreshInFlight;
}

async function runRefreshLoop(): Promise<AutoMonitorStatus> {
  let status: AutoMonitorStatus;
  do {
    refreshRequested = false;
    status = await refreshAutoMonitorInner();
  } while (refreshRequested);

  return status;
}

export function getAutoMonitorStatus(): AutoMonitorStatus {
  return currentStatus;
}

export async function handleAutoClipboardImage(
  image: ClipboardImagePayload,
  fingerprint: string,
  deliveryId = fingerprint
): Promise<void> {
  const lifecycleGeneration = monitorLifecycleGeneration;
  if (autoAttachInFlight) {
    if (deliveryId === activeAutoDeliveryId) {
      return waitForActiveAutoOperation();
    }
    return queueLatestAutoImage(image, fingerprint, deliveryId, lifecycleGeneration);
  }

  activateAutoAttach(deliveryId);
  try {
    await runActiveAutoOperation(image, fingerprint, deliveryId, lifecycleGeneration);
  } finally {
    finishAutoAttach();
  }
}

async function getActiveAutoAttachSettings(
  deliveryId: string,
  lifecycleGeneration: number
): Promise<AppSettings | undefined> {
  assertAutoLifecycle(lifecycleGeneration);
  const settings = await withTimeout(getSettings(), AUTO_LIFECYCLE_TIMEOUT_MS, 'AUTO_SETTINGS_LOOKUP_TIMEOUT');
  assertAutoLifecycle(lifecycleGeneration);
  logger.configure({ debug: settings.debugLogs });

  if (settings.autoAttachEnabled && !currentStatus.active) {
    await refreshAutoMonitor();
    assertAutoLifecycle(lifecycleGeneration);
  }

  if (!settings.autoAttachEnabled || !currentStatus.active) {
    return undefined;
  }

  const duplicate = await isDuplicateAutoImage(deliveryId);
  assertAutoLifecycle(lifecycleGeneration);
  if (duplicate) {
    return undefined;
  }

  return settings;
}

async function runActiveAutoOperation(
  image: ClipboardImagePayload,
  fingerprint: string,
  deliveryId: string,
  lifecycleGeneration: number
): Promise<void> {
  try {
    const settings = await getActiveAutoAttachSettings(deliveryId, lifecycleGeneration);
    if (settings) {
      await attachAutoClipboardImage(image, fingerprint, deliveryId, settings, lifecycleGeneration);
    }
    activeAutoWaiters.forEach(({ resolve }) => resolve());
  } catch (error) {
    activeAutoWaiters.forEach(({ reject }) => reject(error));
    throw error;
  } finally {
    activeAutoDeliveryId = undefined;
    activeAutoWaiters = [];
  }
}

function activateAutoAttach(deliveryId: string): void {
  autoAttachInFlight = true;
  activeAutoDeliveryId = deliveryId;
  activeAutoWaiters = [];
}

function waitForActiveAutoOperation(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    activeAutoWaiters.push({ resolve, reject });
  });
}

async function attachAutoClipboardImage(
  image: ClipboardImagePayload,
  fingerprint: string,
  deliveryId: string,
  settings: AppSettings,
  lifecycleGeneration: number
): Promise<void> {
  const selection = await withTimeout(
    getBestOpenTargetTabForAuto(),
    AUTO_LIFECYCLE_TIMEOUT_MS,
    'AUTO_TARGET_SELECTION_TIMEOUT'
  );
  assertAutoLifecycle(lifecycleGeneration);
  if (!selection?.tab.id) {
    await refreshAutoMonitor();
    throw new Error('AUTO_TARGET_UNAVAILABLE');
  }

  const target = AI_TARGETS[selection.targetId];
  const attachResult = await executeAttachRuntime(selection.tab.id, {
    targetId: selection.targetId,
    image,
    settings: {
      allowClipboardPaste: false,
      showPageToast: settings.showPageToast,
      writeBackOnFailure: settings.writeBackOnFailure,
      debugLogs: settings.debugLogs
    }
  });

  if (attachResult.ok) {
    await markAutoImageHandled(deliveryId, fingerprint);
    await recordAutoOperationResult({
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

  if (attachResult.error === 'PREVIOUS_OPERATION_UNCONFIRMED') {
    throw new Error(attachResult.error);
  }

  const mutationMayHaveOccurred = attachResult.outcome === 'unknown';
  const fallbackMessage = mutationMayHaveOccurred
    ? USER_MESSAGES.attachUnconfirmed
    : settings.writeBackOnFailure
      ? USER_MESSAGES.attachFallback
      : USER_MESSAGES.attachFallbackNoWrite;
  let finalMessage: string = fallbackMessage;

  if (settings.writeBackOnFailure && !mutationMayHaveOccurred) {
    const writeResult = await runWithClipboardOperationLock(() => writeClipboardImage(image));
    if (!writeResult.ok) {
      finalMessage = `${fallbackMessage}（写回剪贴板失败，但原剪贴板通常仍保留截图。）`;
    }
  }

  if (settings.showPageToast) {
    try {
      await withTimeout(
        showToastOnPage(selection.tab.id, finalMessage, 'error'),
        AUTO_BEST_EFFORT_TIMEOUT_MS,
        'AUTO_PAGE_TOAST_TIMEOUT'
      );
    } catch (error) {
      logger.warn('auto page toast failed', { error });
    }
  }

  const failureCode = attachResult.error ?? 'AUTO_ATTACH_FAILED';
  await recordAutoOperationResult({
    ok: false,
    targetId: selection.targetId,
    targetName: target.name,
    method: mutationMayHaveOccurred ? attachResult.method : 'clipboard-fallback',
    error: failureCode,
    message: finalMessage,
    trigger: 'auto',
    at: new Date().toISOString()
  });

  if (mutationMayHaveOccurred) {
    await markAutoImageHandled(deliveryId, fingerprint);
    return;
  }

  throw new Error(failureCode);
}

async function markAutoImageHandled(deliveryId: string, fingerprint: string): Promise<void> {
  const state = { deliveryId, fingerprint, at: Date.now() };
  lastHandledDeliveryId = state.deliveryId;
  latestAutoDedupeState = state;
  const revision = ++autoDedupePersistenceRevision;
  try {
    await withTimeout(
      persistAutoDedupeState(state, revision),
      AUTO_BEST_EFFORT_TIMEOUT_MS,
      'AUTO_DEDUPE_PERSIST_TIMEOUT'
    );
  } catch (error) {
    logger.warn('auto dedupe persistence failed', { error });
  }
}

async function recordAutoOperationResult(result: AutoOperationResult): Promise<void> {
  latestAutoOperationResult = result;
  const revision = ++autoOperationPersistenceRevision;
  try {
    await withTimeout(
      persistAutoOperationResult(result, revision),
      AUTO_BEST_EFFORT_TIMEOUT_MS,
      'AUTO_OPERATION_RECORD_TIMEOUT'
    );
  } catch (error) {
    logger.warn('auto operation result persistence failed', { error });
  }
}

function queueLatestAutoImage(
  image: ClipboardImagePayload,
  fingerprint: string,
  deliveryId: string,
  lifecycleGeneration: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const waiters = pendingAutoImage?.waiters ?? [];
    waiters.push({ resolve, reject });
    pendingAutoImage = { image, fingerprint, deliveryId, lifecycleGeneration, waiters };
  });
}

function finishAutoAttach(): void {
  autoAttachInFlight = false;
  const pending = pendingAutoImage;
  pendingAutoImage = undefined;
  if (!pending) {
    return;
  }

  activateAutoAttach(pending.deliveryId);
  void processPendingAutoImage(pending);
}

async function processPendingAutoImage(pending: NonNullable<typeof pendingAutoImage>): Promise<void> {
  try {
    await runActiveAutoOperation(pending.image, pending.fingerprint, pending.deliveryId, pending.lifecycleGeneration);
    pending.waiters.forEach(({ resolve }) => resolve());
  } catch (error) {
    pending.waiters.forEach(({ reject }) => reject(error));
  } finally {
    finishAutoAttach();
  }
}

function assertAutoLifecycle(lifecycleGeneration: number): void {
  if (monitorStartSuspended || lifecycleGeneration !== monitorLifecycleGeneration) {
    throw new Error('AUTO_MONITOR_RECOVERY_PENDING');
  }
}

async function refreshAutoMonitorInner(): Promise<AutoMonitorStatus> {
  if (monitorStartSuspended) {
    return setStatus({
      ...currentStatus,
      active: false,
      message: '自动粘贴模式正在恢复，请稍后。'
    });
  }

  let settings: AppSettings;
  try {
    settings = await withTimeout(getSettings(), AUTO_LIFECYCLE_TIMEOUT_MS, 'AUTO_SETTINGS_LOOKUP_TIMEOUT');
  } catch (error) {
    logger.warn('auto monitor settings lookup failed', { error });
    await stopOffscreenMonitorIfPresent();
    return setStatus({
      enabled: false,
      active: false,
      targetCount: 0,
      message: USER_MESSAGES.serviceUnavailable
    });
  }
  logger.configure({ debug: settings.debugLogs });

  let targetCount = 0;
  if (settings.autoAttachEnabled) {
    try {
      targetCount = await withTimeout(countOpenTargetTabs(), AUTO_LIFECYCLE_TIMEOUT_MS, 'AUTO_TARGET_COUNT_TIMEOUT');
    } catch (error) {
      logger.warn('auto monitor target lookup failed', { error });
      await stopOffscreenMonitorIfPresent();
      return setStatus({
        enabled: true,
        active: false,
        targetCount: 0,
        message: '自动粘贴模式暂不可用，请稍后重试。'
      });
    }
  }
  if (!settings.autoAttachEnabled || targetCount === 0) {
    monitorStartMode = 'auto';
    await stopOffscreenMonitorIfPresent();
    return setStatus({
      enabled: settings.autoAttachEnabled,
      active: false,
      targetCount,
      message: settings.autoAttachEnabled
        ? '自动粘贴模式已开启，等待打开 ChatGPT / Claude / Gemini / 豆包。'
        : USER_MESSAGES.autoMonitorDisabled
    });
  }

  if (monitorStartSuspended) {
    return setStatus({
      enabled: true,
      active: false,
      targetCount,
      message: '自动粘贴模式正在恢复，请稍后。'
    });
  }

  const lifecycleGeneration = monitorLifecycleGeneration;
  const monitorResult = await startOffscreenMonitor(lifecycleGeneration);
  if (monitorStartSuspended || lifecycleGeneration !== monitorLifecycleGeneration) {
    await stopOffscreenMonitorIfPresent();
    return setStatus({
      enabled: true,
      active: false,
      targetCount,
      message: '自动粘贴模式正在恢复，请稍后。'
    });
  }
  return setStatus({
    enabled: true,
    active: monitorResult.ok && monitorResult.active,
    targetCount,
    message: monitorResult.ok ? '自动粘贴模式运行中。' : `自动粘贴模式启动失败：${monitorResult.message}`
  });
}

async function startOffscreenMonitor(lifecycleGeneration: number): Promise<OffscreenMonitorResult> {
  try {
    if (monitorStartSuspended || lifecycleGeneration !== monitorLifecycleGeneration) {
      return { ok: false, active: false, message: 'auto monitor start was superseded' };
    }
    await withTimeout(ensureOffscreenDocument(), AUTO_LIFECYCLE_TIMEOUT_MS, 'AUTO_OFFSCREEN_CREATE_TIMEOUT');
    if (monitorStartSuspended || lifecycleGeneration !== monitorLifecycleGeneration) {
      return { ok: false, active: false, message: 'auto monitor start was superseded' };
    }
    const requestedStartMode = monitorStartMode;
    let storedBaseline: StoredMonitorBaseline = { found: false };
    if (requestedStartMode !== 'fresh-baseline') {
      try {
        storedBaseline = await getStoredAutoMonitorBaseline(requestedStartMode === 'force-resume');
      } catch (error) {
        logger.warn('auto monitor baseline lookup failed', { error });
      }
    }
    const startMessage = {
      type: 'OFFSCREEN_START_AUTO_MONITOR' as const,
      intervalMs: AUTO_MONITOR_INTERVAL_MS,
      ...(storedBaseline.found
        ? {
            resumeBaseline: {
              ...(storedBaseline.fingerprint ? { fingerprint: storedBaseline.fingerprint } : {})
            }
          }
        : {})
    };
    const response = (await withTimeout(
      chrome.runtime.sendMessage(startMessage),
      AUTO_LIFECYCLE_TIMEOUT_MS,
      'AUTO_MONITOR_START_TIMEOUT'
    )) as OffscreenMonitorResult | undefined;

    if (response?.ok) {
      monitorStartMode = 'auto';
    }

    return response ?? { ok: false, active: false, message: 'offscreen monitor did not respond' };
  } catch (error) {
    logger.warn('auto monitor start failed', { error });
    return { ok: false, active: false, message: 'offscreen monitor start failed' };
  }
}

async function getStoredAutoMonitorBaseline(allowLegacy: boolean): Promise<StoredMonitorBaseline> {
  const stored = await withTimeout(
    chrome.storage.local.get([AUTO_MONITOR_BASELINE_KEY, AUTO_DEDUPE_STATE_KEY]),
    AUTO_BEST_EFFORT_TIMEOUT_MS,
    'AUTO_MONITOR_BASELINE_LOOKUP_TIMEOUT'
  );
  const baseline = stored[AUTO_MONITOR_BASELINE_KEY];
  if (isFreshStoredMonitorBaseline(baseline)) {
    return baseline.fingerprint === null ? { found: true } : { found: true, fingerprint: baseline.fingerprint };
  }
  if (allowLegacy) {
    if (typeof baseline === 'string' && baseline) {
      return { found: true, fingerprint: baseline };
    }
    if (baseline === null) {
      return { found: true };
    }
  }

  const dedupeState = stored[AUTO_DEDUPE_STATE_KEY] as { fingerprint?: unknown } | undefined;
  return allowLegacy && typeof dedupeState?.fingerprint === 'string' && dedupeState.fingerprint
    ? { found: true, fingerprint: dedupeState.fingerprint }
    : { found: false };
}

function isFreshStoredMonitorBaseline(value: unknown): value is { fingerprint: string | null; observedAt: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const baseline = value as { fingerprint?: unknown; observedAt?: unknown };
  const validFingerprint =
    baseline.fingerprint === null || (typeof baseline.fingerprint === 'string' && Boolean(baseline.fingerprint));
  if (!validFingerprint || typeof baseline.observedAt !== 'number' || !Number.isFinite(baseline.observedAt)) {
    return false;
  }
  const age = Date.now() - baseline.observedAt;
  return age >= 0 && age <= AUTO_MONITOR_BASELINE_MAX_AGE_MS;
}

async function stopOffscreenMonitorIfPresent(): Promise<void> {
  let shouldSendStop = true;
  try {
    shouldSendStop = await withTimeout(
      hasOffscreenDocument(),
      AUTO_LIFECYCLE_TIMEOUT_MS,
      'AUTO_MONITOR_PRESENCE_TIMEOUT'
    );
  } catch (error) {
    logger.warn('auto monitor presence check failed', { error });
  }

  let shouldResetOffscreen = false;
  if (shouldSendStop) {
    try {
      await withTimeout(
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_AUTO_MONITOR' }),
        AUTO_LIFECYCLE_TIMEOUT_MS,
        'AUTO_MONITOR_STOP_TIMEOUT'
      );
    } catch (error) {
      logger.warn('auto monitor stop failed', { error });
      shouldResetOffscreen = true;
    }
  }

  if (shouldResetOffscreen) {
    try {
      await withTimeout(resetOffscreenDocument(), AUTO_LIFECYCLE_TIMEOUT_MS, 'AUTO_MONITOR_RESET_TIMEOUT');
    } catch (error) {
      logger.warn('auto monitor reset failed', { error });
    }
  }

  lastHandledDeliveryId = undefined;
  latestAutoDedupeState = undefined;
  const revision = ++autoDedupePersistenceRevision;
  try {
    await withTimeout(
      persistAutoDedupeState(undefined, revision),
      AUTO_LIFECYCLE_TIMEOUT_MS,
      'AUTO_DEDUPE_CLEANUP_TIMEOUT'
    );
  } catch (error) {
    logger.warn('auto dedupe cleanup failed', { error });
  }
}

function setStatus(status: AutoMonitorStatus): AutoMonitorStatus {
  currentStatus = status;
  void chrome.runtime.sendMessage({ type: 'AUTO_MONITOR_STATUS_CHANGED', status }).catch(() => undefined);
  return currentStatus;
}

async function isDuplicateAutoImage(deliveryId: string): Promise<boolean> {
  if (deliveryId === lastHandledDeliveryId) {
    return true;
  }

  try {
    const stored = await withTimeout(
      chrome.storage.local.get(AUTO_DEDUPE_STATE_KEY),
      AUTO_BEST_EFFORT_TIMEOUT_MS,
      'AUTO_DEDUPE_LOOKUP_TIMEOUT'
    );
    const state = stored[AUTO_DEDUPE_STATE_KEY] as
      | { deliveryId?: string; fingerprint?: string; at?: number }
      | undefined;
    const storedDeliveryId = state?.deliveryId ?? state?.fingerprint;
    if (storedDeliveryId === deliveryId) {
      lastHandledDeliveryId = storedDeliveryId;
      return true;
    }
  } catch (error) {
    logger.warn('auto dedupe lookup failed', { error });
  }

  return false;
}

function persistAutoDedupeState(state: AutoDedupeState | undefined, revision: number): Promise<void> {
  const persistence = state
    ? chrome.storage.local.set({ [AUTO_DEDUPE_STATE_KEY]: state })
    : chrome.storage.local.remove([AUTO_DEDUPE_STATE_KEY, AUTO_MONITOR_BASELINE_KEY]);
  const reconcileLatestState = () => {
    if (revision === autoDedupePersistenceRevision) {
      return;
    }

    void persistAutoDedupeState(latestAutoDedupeState, autoDedupePersistenceRevision).catch((error) => {
      logger.warn('late auto dedupe reconciliation failed', { error });
    });
  };
  void persistence.then(reconcileLatestState, reconcileLatestState);
  return persistence;
}

function persistAutoOperationResult(result: AutoOperationResult, revision: number): Promise<void> {
  const persistence = recordOperationResult(result);
  const reconcileLatestResult = () => {
    if (revision === autoOperationPersistenceRevision || !latestAutoOperationResult) {
      return;
    }

    void persistAutoOperationResult(latestAutoOperationResult, autoOperationPersistenceRevision).catch((error) => {
      logger.warn('late auto operation reconciliation failed', { error });
    });
  };
  void persistence.then(reconcileLatestResult, reconcileLatestResult);
  return persistence;
}
