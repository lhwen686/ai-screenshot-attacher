import { USER_MESSAGES } from '../shared/constants';
import type { ClipboardReadResult, ClipboardReadSource } from './types';

export function validateClipboardImageSize(size: number, maxBytes: number, source?: ClipboardReadSource): ClipboardReadResult | undefined {
  if (size <= maxBytes) {
    return undefined;
  }

  return {
    ok: false,
    error: 'IMAGE_TOO_LARGE',
    message: USER_MESSAGES.imageTooLarge,
    source
  };
}
