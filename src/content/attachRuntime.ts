import type { AttachResult } from '../adapters/types';
import { detectAdapter, getAdapterById } from '../adapters/registry';
import { dataUrlToFile } from './domUtils';
import { showToast } from './toast';
import { USER_MESSAGES } from '../shared/constants';
import type { AttachRuntimeGlobal, AttachRuntimePayload } from '../shared/messages';
import { logger } from '../shared/logger';

declare global {
  interface Window {
    __AI_SCREENSHOT_ATTACHER__?: AttachRuntimeGlobal;
  }
}

async function run(payload: AttachRuntimePayload): Promise<AttachResult> {
  logger.configure({ debug: payload.settings.debugLogs });

  const adapter = await getReadyAdapter(payload);
  if (!adapter.ok) {
    return adapter.result;
  }

  const file = dataUrlToFile(payload.image);
  const result = await adapter.value.attachImage(file);

  if (result.ok) {
    showSuccessToastIfEnabled(payload);
    return result;
  }

  await adapter.value.focusInput?.();
  return result;
}

async function pasteFromClipboard(payload: AttachRuntimePayload): Promise<AttachResult> {
  logger.configure({ debug: payload.settings.debugLogs });

  const adapter = await getReadyAdapter(payload);
  if (!adapter.ok) {
    return adapter.result;
  }

  if (!adapter.value.pasteClipboardImage) {
    await adapter.value.focusInput?.();
    return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_UNSUPPORTED' };
  }

  const result = await adapter.value.pasteClipboardImage();
  if (result.ok) {
    showSuccessToastIfEnabled(payload);
    return result;
  }

  await adapter.value.focusInput?.();
  return result;
}

async function getReadyAdapter(payload: AttachRuntimePayload) {
  const adapter = getAdapterById(payload.targetId) ?? detectAdapter();
  if (!adapter || !adapter.detect()) {
    return {
      ok: false as const,
      result: { ok: false, method: 'clipboard-fallback', error: 'ADAPTER_NOT_FOUND' } satisfies AttachResult
    };
  }

  logger.debug('adapter selected', { targetId: payload.targetId, adapter: adapter.id });

  const ready = await adapter.waitUntilReady(15000);
  if (!ready) {
    await adapter.focusInput?.();
    return {
      ok: false as const,
      result: { ok: false, method: 'clipboard-fallback', error: 'TARGET_NOT_READY' } satisfies AttachResult
    };
  }

  return { ok: true as const, value: adapter };
}

function showSuccessToastIfEnabled(payload: AttachRuntimePayload): void {
  if (payload.settings.showPageToast) {
    showToast(USER_MESSAGES.attachSuccess, 'success');
  }
}

window.__AI_SCREENSHOT_ATTACHER__ = { run, pasteFromClipboard };
