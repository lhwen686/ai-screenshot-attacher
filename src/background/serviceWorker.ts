import { OFFSCREEN_DOCUMENT_PATH, USER_MESSAGES, isSupportedTargetUrl } from '../shared/constants';
import type { OperationResult, UiMessage } from '../shared/messages';
import { attachToTarget, getLastOperation, handleCommand } from './commandHandler';
import { getSettings } from '../shared/settings';
import { logger } from '../shared/logger';
import {
  addOffscreenDocumentResetListener,
  ensureOffscreenDocument,
  getOffscreenDocumentResetGeneration,
  resetOffscreenDocument
} from '../clipboard/offscreenClient';
import { withTimeout } from '../shared/withTimeout';
import {
  getAutoMonitorStatus,
  handleAutoClipboardImage,
  refreshAutoMonitor,
  requestAutoMonitorFreshBaseline,
  requestAutoMonitorResumeFromStoredState,
  resumeAutoMonitorRefresh,
  scheduleAutoMonitorRefresh,
  suspendAutoMonitorRefresh
} from './autoMonitor';

interface PendingRecoveryFingerprint {
  expiresAt: number;
  registered: boolean;
  revision: number;
}

let offscreenRecoveryInFlight: Promise<void> | undefined;
let offscreenRecoveryRetryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let offscreenRecoveryRefreshRequested = false;
let offscreenRecoveryNeedsReset = false;
let offscreenRecoveryResetExpiresAt = 0;
let offscreenRecoveryRevision = 0;
let offscreenRecoveryResetRevision = 0;
let knownOffscreenResetGeneration = getOffscreenDocumentResetGeneration();
let offscreenRecoveryOwnReset = false;
const pendingRecoveryFingerprints = new Map<string, PendingRecoveryFingerprint>();
const OFFSCREEN_RECOVERY_TIMEOUT_MS = 5000;
const OFFSCREEN_RECOVERY_RETRY_DELAY_MS = 15000;
const OFFSCREEN_RECOVERY_SUPPRESSION_TTL_MS = 120000;

addOffscreenDocumentResetListener(handleOffscreenDocumentReset);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    requestAutoMonitorResumeFromStoredState();
  } else {
    requestAutoMonitorFreshBaseline();
  }
  void getSettings()
    .then(() => refreshAutoMonitorWithRecoveryGate())
    .catch((error) => {
      logger.error('installed initialization failed', { error });
    });
});

chrome.runtime.onStartup.addListener(() => {
  requestAutoMonitorFreshBaseline();
  scheduleRecoveryAwareAutoMonitorRefresh();
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command).catch((error) => {
    logger.error('command handling failed', { command, error });
  });
});

chrome.runtime.onMessage.addListener((message: UiMessage, sender, sendResponse) => {
  if (message?.type === 'ATTACH_TO_TARGET') {
    respondWithPromise(
      attachToTarget(message.targetId),
      sendResponse,
      () => createServiceUnavailableResult(message.targetId),
      'attach message handling failed'
    );
    return true;
  }

  if (message?.type === 'GET_LAST_OPERATION') {
    respondWithPromise(getLastOperation(), sendResponse, () => undefined, 'last operation lookup failed');
    return true;
  }

  if (message?.type === 'GET_AUTO_MONITOR_STATUS') {
    respondWithPromise(
      refreshAutoMonitorWithRecoveryGate(),
      sendResponse,
      () => getAutoMonitorStatus(),
      'auto monitor refresh message failed'
    );
    return true;
  }

  if (message?.type === 'AUTO_CLIPBOARD_IMAGE_DETECTED') {
    if (hasPendingOrRunningRecovery()) {
      startOffscreenRecovery();
      sendResponse({ ok: false, message: USER_MESSAGES.serviceUnavailable });
      return false;
    }
    respondWithPromise(
      handleAutoClipboardImage(message.image, message.fingerprint, message.deliveryId).then(() => ({ ok: true })),
      sendResponse,
      () => ({ ok: false, message: USER_MESSAGES.serviceUnavailable }),
      'auto clipboard image handling failed'
    );
    return true;
  }

  if (message?.type === 'AUTO_MONITOR_STATUS_CHANGED') {
    sendResponse(getAutoMonitorStatus());
    return false;
  }

  if (message?.type === 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT') {
    if (sender.url !== chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)) {
      logger.debug('ignored offscreen recovery request from unexpected sender', { url: sender.url });
      return false;
    }
    scheduleOffscreenRecovery(message.fingerprint);
    return false;
  }

  const unknownMessage = message as unknown as { type?: unknown };
  logger.debug('ignored runtime message', {
    type: typeof unknownMessage?.type === 'string' ? unknownMessage.type : undefined
  });
  return false;
});

function scheduleOffscreenRecovery(fingerprint?: string): void {
  pruneExpiredRecoveryState();
  const revision = ++offscreenRecoveryRevision;
  const expiresAt = Date.now() + OFFSCREEN_RECOVERY_SUPPRESSION_TTL_MS;
  suspendAutoMonitorRefresh();
  for (const [pendingFingerprint, state] of pendingRecoveryFingerprints) {
    pendingRecoveryFingerprints.set(pendingFingerprint, {
      ...state,
      registered: false,
      revision
    });
  }
  if (fingerprint) {
    pendingRecoveryFingerprints.set(fingerprint, { expiresAt, registered: false, revision });
  }
  offscreenRecoveryNeedsReset = true;
  offscreenRecoveryResetRevision = revision;
  offscreenRecoveryResetExpiresAt = Math.max(offscreenRecoveryResetExpiresAt, expiresAt);
  startOffscreenRecovery();
}

function startOffscreenRecovery(): void {
  pruneExpiredRecoveryState();
  if (offscreenRecoveryInFlight) {
    offscreenRecoveryRefreshRequested = true;
    return;
  }
  if (!hasPendingRecoveryState()) {
    resumeAutoMonitorRefresh();
    scheduleAutoMonitorRefresh();
    return;
  }
  if (offscreenRecoveryRetryTimer !== undefined) {
    globalThis.clearTimeout(offscreenRecoveryRetryTimer);
    offscreenRecoveryRetryTimer = undefined;
  }

  let refreshedSafely = false;
  const recovery = (async () => {
    try {
      if (offscreenRecoveryNeedsReset) {
        const resetRevision = offscreenRecoveryResetRevision;
        let reset: Promise<void>;
        offscreenRecoveryOwnReset = true;
        try {
          reset = resetOffscreenDocument();
          knownOffscreenResetGeneration = getOffscreenDocumentResetGeneration();
        } finally {
          offscreenRecoveryOwnReset = false;
        }
        await reset;
        if (resetRevision === offscreenRecoveryResetRevision) {
          offscreenRecoveryNeedsReset = false;
          offscreenRecoveryResetExpiresAt = 0;
        }
      }
      pruneExpiredRecoveryState();
      if (synchronizeExternalOffscreenReset()) {
        return;
      }
      if (offscreenRecoveryNeedsReset) {
        return;
      }

      const fingerprints = Array.from(pendingRecoveryFingerprints.entries()).filter(([, state]) => !state.registered);
      if (fingerprints.length > 0) {
        await withTimeout(
          ensureOffscreenDocument(),
          OFFSCREEN_RECOVERY_TIMEOUT_MS,
          'OFFSCREEN_RECOVERY_DOCUMENT_TIMEOUT'
        );
      }
      if (synchronizeExternalOffscreenReset()) {
        return;
      }
      if (offscreenRecoveryNeedsReset) {
        return;
      }

      for (const [pendingFingerprint, snapshot] of fingerprints) {
        pruneExpiredRecoveryState();
        if (offscreenRecoveryNeedsReset) {
          return;
        }
        const currentState = pendingRecoveryFingerprints.get(pendingFingerprint);
        if (!currentState || currentState.revision !== snapshot.revision || currentState.registered) {
          continue;
        }
        try {
          const response = (await withTimeout(
            chrome.runtime.sendMessage({
              type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
              fingerprint: pendingFingerprint
            }),
            OFFSCREEN_RECOVERY_TIMEOUT_MS,
            'OFFSCREEN_RECOVERY_REGISTRATION_TIMEOUT'
          )) as { ok?: boolean } | undefined;
          if (!response?.ok) {
            throw new Error('OFFSCREEN_RECOVERY_REGISTRATION_REJECTED');
          }
        } catch (error) {
          logger.warn('offscreen clipboard suppression registration failed', {
            fingerprint: pendingFingerprint,
            error
          });
          continue;
        }
        if (synchronizeExternalOffscreenReset()) {
          return;
        }
        if (pendingRecoveryFingerprints.get(pendingFingerprint)?.revision === snapshot.revision) {
          pendingRecoveryFingerprints.set(pendingFingerprint, {
            ...snapshot,
            registered: true
          });
        }
      }

      pruneExpiredRecoveryState();
      if (hasPendingRecoveryState()) {
        return;
      }

      resumeAutoMonitorRefresh();
      await refreshAutoMonitor();
      if (synchronizeExternalOffscreenReset()) {
        return;
      }
      refreshedSafely = !hasPendingRecoveryState();
    } catch (error) {
      logger.error('offscreen clipboard recovery failed', { error });
    }
  })();
  const tracked = recovery.finally(() => {
    if (offscreenRecoveryInFlight !== tracked) {
      return;
    }
    offscreenRecoveryInFlight = undefined;
    pruneExpiredRecoveryState();
    const refreshRequested = offscreenRecoveryRefreshRequested;
    offscreenRecoveryRefreshRequested = false;
    if (hasPendingRecoveryState()) {
      suspendAutoMonitorRefresh();
      if (refreshRequested) {
        startOffscreenRecovery();
      } else {
        scheduleOffscreenRecoveryRetry();
      }
      return;
    }

    resumeAutoMonitorRefresh();
    if (!refreshedSafely || refreshRequested) {
      scheduleAutoMonitorRefresh();
    }
  });
  offscreenRecoveryInFlight = tracked;
}

function scheduleOffscreenRecoveryRetry(): void {
  if (offscreenRecoveryRetryTimer !== undefined || offscreenRecoveryInFlight) {
    return;
  }
  offscreenRecoveryRetryTimer = globalThis.setTimeout(() => {
    offscreenRecoveryRetryTimer = undefined;
    startOffscreenRecovery();
  }, OFFSCREEN_RECOVERY_RETRY_DELAY_MS);
}

function pruneExpiredRecoveryState(): void {
  const now = Date.now();
  for (const [fingerprint, state] of pendingRecoveryFingerprints) {
    if (state.expiresAt <= now) {
      pendingRecoveryFingerprints.delete(fingerprint);
    }
  }
  if (offscreenRecoveryNeedsReset && offscreenRecoveryResetExpiresAt <= now) {
    offscreenRecoveryNeedsReset = false;
    offscreenRecoveryResetExpiresAt = 0;
  }
}

function hasPendingRecoveryState(): boolean {
  synchronizeExternalOffscreenReset();
  pruneExpiredRecoveryState();
  return (
    offscreenRecoveryNeedsReset || Array.from(pendingRecoveryFingerprints.values()).some((state) => !state.registered)
  );
}

function hasPendingOrRunningRecovery(): boolean {
  return Boolean(offscreenRecoveryInFlight) || hasPendingRecoveryState();
}

async function refreshAutoMonitorWithRecoveryGate(): Promise<ReturnType<typeof getAutoMonitorStatus>> {
  if (!hasPendingOrRunningRecovery()) {
    const status = await refreshAutoMonitor();
    if (synchronizeExternalOffscreenReset()) {
      startOffscreenRecovery();
      await offscreenRecoveryInFlight;
      return getAutoMonitorStatus();
    }
    return status;
  }

  startOffscreenRecovery();
  const recovery = offscreenRecoveryInFlight;
  await (recovery ?? Promise.resolve()).catch(() => undefined);
  return getAutoMonitorStatus();
}

function synchronizeExternalOffscreenReset(): boolean {
  const resetGeneration = getOffscreenDocumentResetGeneration();
  if (resetGeneration === knownOffscreenResetGeneration) {
    return false;
  }
  knownOffscreenResetGeneration = resetGeneration;
  return invalidateRetainedSuppressionsAfterReset();
}

function handleOffscreenDocumentReset(resetGeneration: number): void {
  knownOffscreenResetGeneration = resetGeneration;
  if (offscreenRecoveryOwnReset || !invalidateRetainedSuppressionsAfterReset()) {
    return;
  }
  if (!offscreenRecoveryInFlight) {
    startOffscreenRecovery();
  }
}

function invalidateRetainedSuppressionsAfterReset(): boolean {
  pruneExpiredRecoveryState();
  if (pendingRecoveryFingerprints.size === 0) {
    return false;
  }

  const revision = ++offscreenRecoveryRevision;
  for (const [fingerprint, state] of pendingRecoveryFingerprints) {
    pendingRecoveryFingerprints.set(fingerprint, {
      ...state,
      registered: false,
      revision
    });
  }
  suspendAutoMonitorRefresh();
  return true;
}

function scheduleRecoveryAwareAutoMonitorRefresh(): void {
  if (hasPendingOrRunningRecovery()) {
    startOffscreenRecovery();
    return;
  }
  scheduleAutoMonitorRefresh();
}

chrome.tabs.onCreated.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());
chrome.tabs.onRemoved.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());
chrome.tabs.onActivated.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Any navigation can open or leave a supported page, but load-status churn only matters on a supported page.
  if (changeInfo.url || (changeInfo.status && isSupportedTargetUrl(tab?.pendingUrl ?? tab?.url))) {
    scheduleRecoveryAwareAutoMonitorRefresh();
  }
});

chrome.windows.onCreated.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());
chrome.windows.onRemoved.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());
chrome.windows.onFocusChanged.addListener(() => scheduleRecoveryAwareAutoMonitorRefresh());

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'sync') {
    scheduleRecoveryAwareAutoMonitorRefresh();
  }
});

scheduleRecoveryAwareAutoMonitorRefresh();

function respondWithPromise<T>(
  promise: Promise<T>,
  sendResponse: (response?: unknown) => void,
  createFallback: () => unknown,
  logMessage: string
): void {
  void promise.then(
    (response) => sendResponse(response),
    (error) => {
      logger.error(logMessage, { error });
      sendResponse(createFallback());
    }
  );
}

function createServiceUnavailableResult(targetId?: OperationResult['targetId']): OperationResult {
  return {
    ok: false,
    targetId,
    message: USER_MESSAGES.serviceUnavailable,
    error: 'UNKNOWN_ERROR',
    trigger: 'manual',
    at: new Date().toISOString()
  };
}
