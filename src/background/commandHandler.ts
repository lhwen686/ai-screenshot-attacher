import { readClipboardImage } from '../clipboard/readClipboardImage';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import { AI_TARGETS, LAST_OPERATION_KEY, USER_MESSAGES, type TargetId } from '../shared/constants';
import { getErrorMessage, type AttachErrorType } from '../shared/errors';
import { logger } from '../shared/logger';
import type { OperationResult } from '../shared/messages';
import { getSettings } from '../shared/settings';
import { executeAttachRuntime, getOrCreateTargetTab, showToastOnActivePage, showToastOnPage } from './tabManager';

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

export async function attachToTarget(targetId?: TargetId): Promise<OperationResult> {
  const settings = await getSettings();
  logger.configure({ debug: settings.debugLogs });

  const finalTargetId = targetId ?? settings.defaultTargetId;
  const target = AI_TARGETS[finalTargetId];

  logger.info('attach requested', { targetId: finalTargetId });

  const clipboardResult = await readClipboardImage();
  if (!clipboardResult.ok) {
    const result = operationFailure(finalTargetId, clipboardResult.error, clipboardResult.message);
    await recordOperationResult(result);
    await showToastOnActivePage(result.message, 'error');
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

    const fallbackMessage = settings.writeBackOnFailure ? USER_MESSAGES.attachFallback : USER_MESSAGES.attachFallbackNoWrite;
    let finalMessage: string = fallbackMessage;

    if (settings.writeBackOnFailure) {
      const writeResult = await writeClipboardImage(clipboardResult.image);
      if (!writeResult.ok) {
        finalMessage = `${fallbackMessage}（写回剪贴板失败，但原剪贴板通常仍保留截图。）`;
      }
    }

    if (settings.showPageToast) {
      await showToastOnPage(tabId, finalMessage, 'error');
    }

    const result: OperationResult = {
      ok: false,
      targetId: finalTargetId,
      targetName: target.name,
      method: 'clipboard-fallback',
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

    const message = error instanceof Error && error.message === USER_MESSAGES.targetLoadFailed
      ? USER_MESSAGES.targetLoadFailed
      : getErrorMessage('TARGET_TAB_FAILED');

    if (tabId && settings.showPageToast) {
      await showToastOnPage(tabId, message, 'error');
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
  await saveLastOperation(result);
  await setActionFeedback(result);
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
