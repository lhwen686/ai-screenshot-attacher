import type { ClipboardErrorType } from '../shared/errors';

export const SUPPORTED_CLIPBOARD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type SupportedClipboardImageType = (typeof SUPPORTED_CLIPBOARD_IMAGE_TYPES)[number];
export type ClipboardReadSource = 'async-clipboard' | 'paste-command';

export interface ClipboardImagePayload {
  dataUrl: string;
  mimeType: SupportedClipboardImageType;
  fileName: string;
  size: number;
  lastModified: number;
}

export type ClipboardReadResult =
  | {
      ok: true;
      image: ClipboardImagePayload;
      source: ClipboardReadSource;
    }
  | {
      ok: false;
      error: ClipboardErrorType;
      message: string;
      source?: ClipboardReadSource;
    };

export type ClipboardWriteResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: ClipboardErrorType;
      message: string;
    };

export type OffscreenClipboardMessage =
  | {
      type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE';
      usePasteFallback?: boolean;
      maxBytes?: number;
    }
  | {
      type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE';
      image: ClipboardImagePayload;
    }
  | {
      type: 'OFFSCREEN_START_AUTO_MONITOR';
      intervalMs?: number;
    }
  | {
      type: 'OFFSCREEN_STOP_AUTO_MONITOR';
    };

export type OffscreenMonitorResult =
  | {
      ok: true;
      active: boolean;
    }
  | {
      ok: false;
      active: boolean;
      message: string;
    };
