import { readClipboardImage } from '../clipboard/readClipboardImage';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import type { ClipboardImagePayload } from '../clipboard/types';
import { AI_TARGETS, LAST_OPERATION_KEY, USER_MESSAGES, type TargetId } from '../shared/constants';
import { getErrorMessage, type AttachErrorType } from '../shared/errors';
import { logger } from '../shared/logger';
import type { AttachQueueStatus, OperationResult } from '../shared/messages';
import { getSettings, type AppSettings } from '../shared/settings';
import { executeAttachRuntime, executeClipboardPasteRuntime, getBestOpenTargetTabForAuto, getOrCreateTargetTab, showToastOnActivePage, showToastOnPage } from './tabManager';
import type { AttachResult } from '../adapters/types';

interface ManualAttachJob {
  kind: 'manual';
  targetId?: TargetId;
  resolve(result: OperationResult): void;
}

interface AutoAttachJob {
  kind: 'auto';
  image: ClipboardImagePayload;
  fingerprint: string;
}

type AttachJob = ManualAttachJob | AutoAttachJob;

const manualQueue: ManualAttachJob[] = [];
let pendingAutoJob: AutoAttachJob | undefined;
let processing = false;
let currentJob: AttachJob | undefined;
let lastQueuedAutoFingerprint: string | undefined;

let queueStatus: AttachQueueStatus = {
  busy: false,
  pendingManualCount: 0,
  hasPendingAuto: false,
  message: '空闲',
  at: new Date().toISOString()
};

export function enqueueManualAttachment(targetId?: TargetId): Promise<OperationResult> {
  return new Promise((resolve) => {
    manualQueue.push({ kind: 'manual', targetId, resolve });
    emitQueueStatus('等待手动附加任务。');
    void processQueue();
  });
}

export function enqueueAutoAttachment(image: ClipboardImagePayload, fingerprint: string): void {
  if (fingerprint === lastQueuedAutoFingerprint && (pendingAutoJob || currentJob?.kind === 'auto')) {
    return;
  }

  lastQueuedAutoFingerprint = fingerprint;
  pendingAutoJob = { kind: 'auto', image, fingerprint };
  emitQueueStatus(processing ? '自动截图已排队。' : '等待自动附加任务。');
  void processQueue();
}

export function getAttachQueueStatus(): AttachQueueStatus {
  return queueStatus;
}

export async function getLastOperation(): Promise<OperationResult | undefined> {
  const stored = await chrome.storage.local.get(LAST_OPERATION_KEY);
  return stored[LAST_OPERATION_KEY] as OperationResult | undefined;
}

export async function recordOperationResult(result: OperationResult): Promise<void> {
  await chrome.storage.local.set({ [LAST_OPERATION_KEY]: result });
  await setActionFeedback(result);
}

async function processQueue(): Promise<void> {
  if (processing) {
    return;
  }

  processing = true;
  try {
    while (manualQueue.length > 0 || pendingAutoJob) {
      currentJob = manualQueue.shift() ?? takePendingAutoJob();
      emitQueueStatus(currentJob?.kind === 'manual' ? '正在手动附加截图。' : '正在自动附加截图。');

      try {
        if (currentJob?.kind === 'manual') {
          const result = await runManualJob(currentJob);
          currentJob.resolve(result);
        } else if (currentJob?.kind === 'auto') {
          await runAutoJob(currentJob);
        }
      } catch (error) {
        logger.error('attach queue job failed', { error, kind: currentJob?.kind });
        if (currentJob?.kind === 'manual') {
          const result = operationFailure(currentJob.targetId ?? 'chatgpt', 'UNKNOWN_ERROR', '操作失败，请稍后重试。', 'manual');
          await recordOperationResult(result);
          currentJob.resolve(result);
        }
      } finally {
        currentJob = undefined;
        emitQueueStatus(pendingAutoJob ? '等待自动附加任务。' : '空闲');
      }
    }
  } finally {
    processing = false;
    if (!pendingAutoJob && manualQueue.length === 0) {
      lastQueuedAutoFingerprint = undefined;
    }
    emitQueueStatus('空闲');
  }
}

function takePendingAutoJob(): AutoAttachJob | undefined {
  const job = pendingAutoJob;
  pendingAutoJob = undefined;
  return job;
}

async function runManualJob(job: ManualAttachJob): Promise<OperationResult> {
  const settings = await getConfiguredSettings();
  const finalTargetId = job.targetId ?? settings.defaultTargetId;

  logger.info('manual attach requested', { targetId: finalTargetId });

  const targetTabPromise = getOrCreateTargetTab(finalTargetId, settings).catch((error: unknown) => error);
  const clipboardResult = await readClipboardImage({ usePasteFallback: true });
  if (!clipboardResult.ok) {
    const result = operationFailure(finalTargetId, clipboardResult.error, clipboardResult.message, 'manual');
    await recordOperationResult(result);
    await showToastOnActivePage(result.message, 'error');
    return result;
  }

  return attachImageToTarget({
    image: clipboardResult.image,
    settings,
    targetId: finalTargetId,
    targetTabPromise,
    trigger: 'manual'
  });
}

async function runAutoJob(job: AutoAttachJob): Promise<void> {
  const settings = await getConfiguredSettings();
  if (!settings.autoAttachEnabled) {
    return;
  }

  logger.info('auto attach requested', { fingerprint: job.fingerprint });
  const selection = await getBestOpenTargetTabForAuto();
  if (!selection?.tab.id) {
    return;
  }

  await attachImageToTarget({
    image: job.image,
    settings,
    tabId: selection.tab.id,
    targetId: selection.targetId,
    trigger: 'auto'
  });
}

async function attachImageToTarget(options: {
  image: ClipboardImagePayload;
  settings: AppSettings;
  targetId: TargetId;
  trigger: 'manual' | 'auto';
  targetTabPromise?: Promise<chrome.tabs.Tab | unknown>;
  tabId?: number;
}): Promise<OperationResult> {
  const target = AI_TARGETS[options.targetId];
  let tabId = options.tabId;

  try {
    if (!tabId) {
      const tab = await getTargetTabFromOptions(options);
      tabId = tab.id;
    }

    if (!tabId) {
      throw new Error('TARGET_TAB_FAILED');
    }

    let clipboardFallback: { message: string; wrote: boolean } | undefined;
    let pasteCommandTried = false;

    if (options.trigger === 'manual') {
      clipboardFallback = await preserveClipboardFallback(options.image, options.settings);
      const pasteCommandResult = await tryPasteCommandFallback(tabId, options);
      pasteCommandTried = true;

      if (pasteCommandResult.ok && pasteCommandResult.confidence !== 'unconfirmed') {
        const result = operationSuccess(options.targetId, target.name, pasteCommandResult.method, options.trigger);
        await recordOperationResult(result);
        return result;
      }

      if (pasteCommandResult.error === 'ATTACHMENT_UNCONFIRMED') {
        const result = operationAttachFailure(options.targetId, target.name, pasteCommandResult.error, clipboardFallback.message, options.trigger);
        await recordOperationResult(result);
        return result;
      }
    }

    const attachResult = await executeAttachRuntime(tabId, {
      targetId: options.targetId,
      image: options.image,
      settings: {
        showPageToast: options.settings.showPageToast,
        writeBackOnFailure: options.settings.writeBackOnFailure,
        debugLogs: options.settings.debugLogs
      }
    });

    if (attachResult.ok && attachResult.confidence !== 'unconfirmed') {
      const result = operationSuccess(options.targetId, target.name, attachResult.method, options.trigger);
      await recordOperationResult(result);
      return result;
    }

    clipboardFallback ??= await preserveClipboardFallback(options.image, options.settings);
    if (!pasteCommandTried && (clipboardFallback.wrote || !options.settings.writeBackOnFailure) && shouldTryPasteCommandFallback(attachResult)) {
      const pasteCommandResult = await tryPasteCommandFallback(tabId, options);

      if (pasteCommandResult.ok && pasteCommandResult.confidence !== 'unconfirmed') {
        const result = operationSuccess(options.targetId, target.name, pasteCommandResult.method, options.trigger);
        await recordOperationResult(result);
        return result;
      }
    }

    if (options.settings.showPageToast) {
      await showToastOnPage(tabId, clipboardFallback.message, 'error');
    }

    const result = operationAttachFailure(options.targetId, target.name, attachResult.error ?? 'AUTO_ATTACH_FAILED', clipboardFallback.message, options.trigger);
    await recordOperationResult(result);
    return result;
  } catch (error) {
    logger.error('attach workflow failed', {
      targetId: options.targetId,
      error
    });

    const message = error instanceof Error && error.message === USER_MESSAGES.targetLoadFailed
      ? USER_MESSAGES.targetLoadFailed
      : getErrorMessage('TARGET_TAB_FAILED');

    if (tabId && options.settings.showPageToast) {
      await showToastOnPage(tabId, message, 'error');
    }

    const result = operationFailure(options.targetId, 'TARGET_TAB_FAILED', message, options.trigger);
    await recordOperationResult(result);
    return result;
  }
}

async function getTargetTabFromOptions(options: {
  settings: AppSettings;
  targetId: TargetId;
  targetTabPromise?: Promise<chrome.tabs.Tab | unknown>;
}): Promise<chrome.tabs.Tab> {
  const tabOrError = options.targetTabPromise ? await options.targetTabPromise : await getOrCreateTargetTab(options.targetId, options.settings);
  if (tabOrError instanceof Error) {
    throw tabOrError;
  }

  return tabOrError as chrome.tabs.Tab;
}

async function tryPasteCommandFallback(
  tabId: number,
  options: {
    image: ClipboardImagePayload;
    settings: AppSettings;
    targetId: TargetId;
  }
): Promise<AttachResult> {
  return executeClipboardPasteRuntime(tabId, {
    targetId: options.targetId,
    image: options.image,
    settings: {
      showPageToast: options.settings.showPageToast,
      writeBackOnFailure: options.settings.writeBackOnFailure,
      debugLogs: options.settings.debugLogs
    }
  });
}

async function preserveClipboardFallback(image: ClipboardImagePayload, settings: AppSettings): Promise<{ message: string; wrote: boolean }> {
  const fallbackMessage = settings.writeBackOnFailure ? USER_MESSAGES.attachFallback : USER_MESSAGES.attachFallbackNoWrite;
  if (!settings.writeBackOnFailure) {
    return { message: fallbackMessage, wrote: false };
  }

  const writeResult = await writeClipboardImage(image);
  return writeResult.ok
    ? { message: fallbackMessage, wrote: true }
    : { message: `${fallbackMessage}（写回剪贴板失败，但原剪贴板通常仍保留截图。）`, wrote: false };
}

function shouldTryPasteCommandFallback(result: AttachResult): boolean {
  return result.confidence !== 'confirmed' && result.error !== 'ATTACHMENT_UNCONFIRMED';
}

function operationSuccess(
  targetId: TargetId,
  targetName: string,
  method: OperationResult['method'],
  trigger: 'manual' | 'auto'
): OperationResult {
  return {
    ok: true,
    targetId,
    targetName,
    method,
    message: USER_MESSAGES.attachSuccess,
    trigger,
    at: new Date().toISOString()
  };
}

function operationAttachFailure(
  targetId: TargetId,
  targetName: string,
  error: string,
  message: string,
  trigger: 'manual' | 'auto'
): OperationResult {
  return {
    ok: false,
    targetId,
    targetName,
    method: 'clipboard-fallback',
    error,
    message,
    trigger,
    at: new Date().toISOString()
  };
}

async function getConfiguredSettings(): Promise<AppSettings> {
  const settings = await getSettings();
  logger.configure({ debug: settings.debugLogs });
  return settings;
}

async function setActionFeedback(result: OperationResult): Promise<void> {
  await chrome.action.setBadgeText({ text: result.ok ? 'OK' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: result.ok ? '#059669' : '#dc2626' });
  await chrome.action.setTitle({ title: `AI Screenshot Attacher\n${result.message}` });
}

function operationFailure(
  targetId: TargetId,
  error: AttachErrorType | string,
  message: string,
  trigger: 'manual' | 'auto'
): OperationResult {
  return {
    ok: false,
    targetId,
    targetName: AI_TARGETS[targetId].name,
    error,
    message,
    trigger,
    at: new Date().toISOString()
  };
}

function emitQueueStatus(message: string): void {
  queueStatus = {
    busy: processing || manualQueue.length > 0 || Boolean(pendingAutoJob),
    pendingManualCount: manualQueue.length,
    hasPendingAuto: Boolean(pendingAutoJob),
    currentTrigger: currentJob?.kind,
    message,
    at: new Date().toISOString()
  };

  void chrome.runtime.sendMessage({ type: 'ATTACH_QUEUE_STATUS_CHANGED', status: queueStatus }).catch(() => undefined);
}
