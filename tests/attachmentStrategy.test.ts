import { describe, expect, it } from 'vitest';
import { shouldStopAttachmentStrategy } from '../src/content/domUtils';

describe('attachment strategy chaining', () => {
  it('continues after an unconfirmed strategy with no attachment evidence', () => {
    expect(
      shouldStopAttachmentStrategy({
        ok: false,
        method: 'file-input',
        error: 'FILE_INPUT_NO_CONFIRMED_ATTACHMENT',
        confidence: 'unconfirmed'
      })
    ).toBe(false);
  });

  it('stops after progress evidence to avoid duplicate attachment attempts', () => {
    expect(
      shouldStopAttachmentStrategy({
        ok: false,
        method: 'paste-event',
        error: 'ATTACHMENT_UNCONFIRMED',
        confidence: 'unconfirmed',
        evidence: [{ kind: 'progress-text', message: 'uploading' }]
      })
    ).toBe(true);
  });

  it('stops after confirmed success or confirmed failure', () => {
    expect(shouldStopAttachmentStrategy({ ok: true, method: 'paste-event', confidence: 'confirmed' })).toBe(true);
    expect(
      shouldStopAttachmentStrategy({
        ok: false,
        method: 'paste-event',
        error: 'AUTO_ATTACH_FAILED',
        confidence: 'confirmed'
      })
    ).toBe(true);
  });
});
