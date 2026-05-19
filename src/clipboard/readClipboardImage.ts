import type { ClipboardReadResult } from './types';
import { ensureOffscreenDocument } from './offscreenClient';
import { MAX_CLIPBOARD_IMAGE_BYTES } from '../shared/constants';

export interface ReadClipboardImageOptions {
  usePasteFallback?: boolean;
  maxBytes?: number;
}

export async function readClipboardImage(options: ReadClipboardImageOptions = {}): Promise<ClipboardReadResult> {
  try {
    await ensureOffscreenDocument();
    const response = (await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE',
      usePasteFallback: options.usePasteFallback ?? true,
      maxBytes: options.maxBytes ?? MAX_CLIPBOARD_IMAGE_BYTES
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
