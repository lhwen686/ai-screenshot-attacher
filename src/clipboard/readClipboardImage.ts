import type { ClipboardReadResult } from './types';
import { ensureOffscreenDocument } from './offscreenClient';

export async function readClipboardImage(): Promise<ClipboardReadResult> {
  try {
    await ensureOffscreenDocument();
    const response = (await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE'
    })) as ClipboardReadResult | undefined;

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
