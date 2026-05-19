import { describe, expect, it } from 'vitest';
import { validateClipboardImageSize } from '../src/clipboard/clipboardLimits';

describe('clipboard image limits', () => {
  it('accepts images at or below the configured byte limit', () => {
    expect(validateClipboardImageSize(10, 10, 'async-clipboard')).toBeUndefined();
  });

  it('rejects images above the configured byte limit with a normalized clipboard error', () => {
    expect(validateClipboardImageSize(11, 10, 'async-clipboard')).toMatchObject({
      ok: false,
      error: 'IMAGE_TOO_LARGE',
      source: 'async-clipboard'
    });
  });
});
