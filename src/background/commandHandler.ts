import { readClipboardImage } from '../clipboard/readClipboardImage';
import { runWithClipboardOperationLock } from '../clipboard/clipboardOperationLock';
import type { ClipboardReadResult } from '../clipboard/types';
import { AI_TARGETS, LAST_OPERATION_KEY, USER_MESSAGES, type TargetId } from '../shared/constants';
import { getErrorMessage, type AttachErrorType } from '../shared/errors';
import { logger } from '../shared/logger';
import type { OperationResult } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';
import { createSerialQueue } from '../shared/serialQueue';
import { withTimeout } from '../shared/withTimeout';
import { prepareFailureFeedback } from './failureFeedback';
import { executeAttachRuntime, getOrCreateTargetTab, showToastOnActivePage, showToastOnPage } from './tabManager';

const runManualAttachWorkflow = createSerialQueue();
const MANUAL_SETTINGS_TIMEOUT_MS = 5000;
const MANUAL_FEEDBACK_TIMEOUT_MS = 5000;
let latestOperationResult: OperationResult | undefined;
let operationPersistenceRevision = 0;
let actionFeedbackRevision = 0;

interface PreparedManualAttach {
  settings: AppSettings;
  finalTargetId: TargetId;
  clipboardResult: ClipboardReadResult;
}

type SettledPreparation = { ok: true; value: PreparedManualAttach } | { ok: false; error: unknown };

export async function handleCommand(command: string): Promise<OperationResult> {
  switch (command) {
    case 'attach-to-chatgpt':
      return attachToTarget('chatgpt');
    case 'attach-to-claude':
      return attachToTarget('claude');
    case 'attach-to-gemini':
      return attachToTarget('gemini');
    case 'attach-to-doubao':
      return attachToTarget('doubao');
    case 'attach-to-default-ai':
    default:
      return attachToTarget();
  }
}

export function attachToTarget(targetId?: TargetId): Promise<OperationResult> {
  const preparation: Promise<SettledPreparation> = prepareManualAttach(targetId).then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error })
  );
  return runManualAttachWorkflow(async () => {
    const settled = await preparation;
    if (!settled.ok) {
      throw settled.error;
    }
    return attachToTargetUnlocked(settled.value);
  });
}

async function prepareManualAttach(targetId?: TargetId): Promise<PreparedManualAttach> {
  const [settings, clipboardResult] = await Promise.all([
    withTimeout(getSettings(), MANUAL_SETTINGS_TIMEOUT_MS, 'MANUAL_SETTINGS_TIMEOUT'),
    runWithClipboardOperationLock(() => readClipboardImage())
  ]);
  return {
    settings,
    finalTargetId: targetId ?? settings.defaultTargetId,
    clipboardResult
  };
}

async function attachToTargetUnlocked(prepared: PreparedManualAttach): Promise<OperationResult> {
  const { settings, finalTargetId, clipboardResult } = prepared;
  logger.configure({ debug: settings.debugLogs });

  const target = AI_TARGETS[finalTargetId];

  logger.info('attach requested', { targetId: finalTargetId });

  if (!clipboardResult.ok) {
    const result = operationFailure(finalTargetId, clipboardResult.error, clipboardResult.message);
    await recordOperationResult(result);
    await showManualToast(() => showToastOnActivePage(result.message, 'error'));
    return result;
  }

  let tabId: number | undefined;

  try {
    const tab = await getOrCreateTargetTab(finalTargetId, settings);
    tabId = tab.id;
    if (!tabId) {
      throw new Error('TARGET_TAB_FAILED');
    }

    const attachResult = await executeAttachRuntime(tabId, {
      targetId: finalTargetId,
      image: clipboardResult.image,
      settings: {
        allowClipboardPaste: true,
        showPageToast: settings.showPageToast,
        writeBackOnFailure: settings.writeBackOnFailure,
        debugLogs: settings.debugLogs
      }
    });

    if (attachResult.ok) {
      const result: OperationResult = {
        ok: true,
        targetId: finalTargetId,
        targetName: target.name,
        method: attachResult.method,
        message: USER_MESSAGES.attachSuccess,
        trigger: 'manual',
        at: new Date().toISOString()
      };
      await recordOperationResult(result);
      return result;
    }

    const mutationUnconfirmed =
      attachResult.outcome === 'unknown' || attachResult.error === 'PREVIOUS_OPERATION_UNCONFIRMED';
    const finalMessage = await prepareFailureFeedback(clipboardResult.image, settings, mutationUnconfirmed);

    if (settings.showPageToast && tabId !== undefined) {
      const toastTabId = tabId;
      await showManualToast(() => showToastOnPage(toastTabId, finalMessage, 'error'));
    }

    const result: OperationResult = {
      ok: false,
      targetId: finalTargetId,
      targetName: target.name,
      method: mutationUnconfirmed ? attachResult.method : 'clipboard-fallback',
      error: attachResult.error ?? 'AUTO_ATTACH_FAILED',
      message: finalMessage,
      trigger: 'manual',
      at: new Date().toISOString()
    };
    await recordOperationResult(result);
    return result;
  } catch (error) {
    logger.error('attach workflow failed', {
      targetId: finalTargetId,
      error
    });

    const message =
      error instanceof Error && error.message === USER_MESSAGES.targetLoadFailed
        ? USER_MESSAGES.targetLoadFailed
        : getErrorMessage('TARGET_TAB_FAILED');

    const toastTabId = tabId;
    if (toastTabId && settings.showPageToast) {
      await showManualToast(() => showToastOnPage(toastTabId, message, 'error'));
    }

    const result = operationFailure(finalTargetId, 'TARGET_TAB_FAILED', message);
    await recordOperationResult(result);
    return result;
  }
}

export async function getLastOperation(): Promise<OperationResult | undefined> {
  const stored = await chrome.storage.local.get(LAST_OPERATION_KEY);
  return stored[LAST_OPERATION_KEY] as OperationResult | undefined;
}

async function saveLastOperation(result: OperationResult): Promise<void> {
  await chrome.storage.local.set({ [LAST_OPERATION_KEY]: result });
}

export async function recordOperationResult(result: OperationResult): Promise<void> {
  latestOperationResult = result;
  const persistenceRevision = ++operationPersistenceRevision;
  const feedbackRevision = ++actionFeedbackRevision;
  try {
    await withTimeout(
      persistOperationResult(result, persistenceRevision),
      MANUAL_FEEDBACK_TIMEOUT_MS,
      'OPERATION_RESULT_TIMEOUT'
    );
  } catch (error) {
    logger.warn('failed to persist operation result', { error });
  }

  if (feedbackRevision !== actionFeedbackRevision) {
    return;
  }
  try {
    await withTimeout(
      persistActionFeedback(result, feedbackRevision),
      MANUAL_FEEDBACK_TIMEOUT_MS,
      'ACTION_FEEDBACK_TIMEOUT'
    );
  } catch (error) {
    logger.warn('failed to update action feedback', { error });
  }
}

function persistOperationResult(result: OperationResult, revision: number): Promise<void> {
  const persistence = saveLastOperation(result);
  const reconcile = () => {
    if (revision === operationPersistenceRevision || !latestOperationResult) {
      return;
    }
    void persistOperationResult(latestOperationResult, operationPersistenceRevision).catch((error) => {
      logger.warn('late operation result reconciliation failed', { error });
    });
  };
  void persistence.then(reconcile, reconcile);
  return persistence;
}

function persistActionFeedback(result: OperationResult, revision: number): Promise<void> {
  const persistence = setActionFeedback(result);
  const reconcile = () => {
    if (revision === actionFeedbackRevision || !latestOperationResult) {
      return;
    }
    void persistActionFeedback(latestOperationResult, actionFeedbackRevision).catch((error) => {
      logger.warn('late action feedback reconciliation failed', { error });
    });
  };
  void persistence.then(reconcile, reconcile);
  return persistence;
}

async function setActionFeedback(result: OperationResult): Promise<void> {
  await chrome.action.setBadgeText({ text: result.ok ? 'OK' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: result.ok ? '#059669' : '#dc2626' });
  await chrome.action.setTitle({ title: `AI Screenshot Attacher\n${result.message}` });
}

function operationFailure(targetId: TargetId, error: AttachErrorType | string, message: string): OperationResult {
  return {
    ok: false,
    targetId,
    targetName: AI_TARGETS[targetId].name,
    error,
    message,
    trigger: 'manual',
    at: new Date().toISOString()
  };
}

async function showManualToast(operation: () => Promise<void>): Promise<void> {
  try {
    await withTimeout(operation(), MANUAL_FEEDBACK_TIMEOUT_MS, 'PAGE_TOAST_TIMEOUT');
  } catch (error) {
    logger.warn('page toast timed out', { error });
  }
}
