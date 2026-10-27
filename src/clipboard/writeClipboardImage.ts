import type { ClipboardImagePayload, ClipboardWriteResult } from './types';
import { ensureOffscreenDocument } from './offscreenClient';
import { withTimeout } from '../shared/withTimeout';
import { t } from '../shared/i18n';

const OFFSCREEN_CREATE_TIMEOUT_MS = 10000;
const OFFSCREEN_RESPONSE_TIMEOUT_MS = 20000;

export async function writeClipboardImage(image: ClipboardImagePayload): Promise<ClipboardWriteResult> {
  try {
    await withTimeout(ensureOffscreenDocument(), OFFSCREEN_CREATE_TIMEOUT_MS, 'OFFSCREEN_CREATE_TIMEOUT');
    const response = (await withTimeout(
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
        image
      }),
      OFFSCREEN_RESPONSE_TIMEOUT_MS,
      'OFFSCREEN_WRITE_TIMEOUT'
    )) as ClipboardWriteResult | undefined;

    return (
      response ?? {
        ok: false,
        error: 'CLIPBOARD_WRITE_FAILED',
        message: t('errorClipboardWrite')
      }
    );
  } catch {
    return {
      ok: false,
      error: 'CLIPBOARD_WRITE_FAILED',
      message: t('errorClipboardWrite')
    };
  }
}
