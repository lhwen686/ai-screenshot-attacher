import type { ClipboardImagePayload, ClipboardWriteResult } from './types';
import { ensureOffscreenDocument } from './offscreenClient';

export async function writeClipboardImage(image: ClipboardImagePayload): Promise<ClipboardWriteResult> {
  try {
    await ensureOffscreenDocument();
    const response = (await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
      image
    })) as ClipboardWriteResult | undefined;

    return (
      response ?? {
        ok: false,
        error: 'CLIPBOARD_WRITE_FAILED',
        message: '写回剪贴板失败，请重新截图后手动粘贴。'
      }
    );
  } catch {
    return {
      ok: false,
      error: 'CLIPBOARD_WRITE_FAILED',
      message: '写回剪贴板失败，请重新截图后手动粘贴。'
    };
  }
}
