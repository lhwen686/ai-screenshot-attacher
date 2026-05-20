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

  const adapter = getAdapterById(payload.targetId) ?? detectAdapter();
  if (!adapter || !adapter.detect()) {
    return { ok: false, method: 'clipboard-fallback', error: 'ADAPTER_NOT_FOUND' };
  }

  logger.debug('adapter selected', { targetId: payload.targetId, adapter: adapter.id });

  const ready = await adapter.waitUntilReady(15000);
  if (!ready) {
    await adapter.focusInput?.();
    return { ok: false, method: 'clipboard-fallback', error: 'TARGET_NOT_READY' };
  }

  const file = dataUrlToFile(payload.image);
  const result = await adapter.attachImage(file);

  if (result.ok) {
    if (payload.settings.showPageToast) {
      showToast(USER_MESSAGES.attachSuccess, 'success');
    }
    return result;
  }

  await adapter.focusInput?.();
  return result;
}

window.__AI_SCREENSHOT_ATTACHER__ = { run };
