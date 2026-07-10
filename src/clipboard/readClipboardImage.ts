import type { ClipboardReadResult } from './types';
import { ensureOffscreenDocument } from './offscreenClient';
import { withTimeout } from '../shared/withTimeout';

const OFFSCREEN_CREATE_TIMEOUT_MS = 10000;
const OFFSCREEN_RESPONSE_TIMEOUT_MS = 20000;

export async function readClipboardImage(): Promise<ClipboardReadResult> {
  try {
    await withTimeout(ensureOffscreenDocument(), OFFSCREEN_CREATE_TIMEOUT_MS, 'OFFSCREEN_CREATE_TIMEOUT');
    const response = (await withTimeout(
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE' }),
      OFFSCREEN_RESPONSE_TIMEOUT_MS,
      'OFFSCREEN_READ_TIMEOUT'
    )) as ClipboardReadResult | undefined;

    return (
      response ?? {
        ok: false,
        error: 'CLIPBOARD_READ_FAILED',
        message: '读取剪贴板失败，请重新截图后再试。'
      }
    );
  } catch {
    return {
      ok: false,
      error: 'CLIPBOARD_READ_FAILED',
      message: '读取剪贴板失败，请重新截图后再试。'
    };
  }
}
