/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotAttachmentState, waitForAttachmentOutcome } from '../src/content/domUtils';

function makeVisibleElements(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 20,
    height: 20,
    left: 0,
    right: 20,
    top: 0,
    width: 20,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect);
}

describe('attachment outcome observer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    makeVisibleElements();
  });

  it('confirms success when a scoped attachment preview appears', async () => {
    const root = document.createElement('form');
    document.body.appendChild(root);
    const file = new File(['x'], 'screenshot.png', { type: 'image/png' });
    const before = snapshotAttachmentState(['.attachment-preview'], root, file);

    window.setTimeout(() => {
      const preview = document.createElement('div');
      preview.className = 'attachment-preview';
      root.appendChild(preview);
    }, 10);

    const result = await waitForAttachmentOutcome('paste-event', ['.attachment-preview'], before, root, file, {
      timeoutMs: 300
    });

    expect(result).toMatchObject({
      ok: true,
      confidence: 'confirmed',
      method: 'paste-event'
    });
    expect(result.evidence?.[0]?.kind).toBe('attachment-preview');
  });

  it('does not treat progress text alone as a confirmed attachment', async () => {
    const root = document.createElement('form');
    document.body.appendChild(root);
    const file = new File(['x'], 'screenshot.png', { type: 'image/png' });
    const before = snapshotAttachmentState(['.attachment-preview'], root, file);

    window.setTimeout(() => {
      root.append('uploading');
    }, 10);

    const result = await waitForAttachmentOutcome('paste-event', ['.attachment-preview'], before, root, file, {
      timeoutMs: 120,
      progressTextPatterns: [/uploading/i]
    });

    expect(result).toMatchObject({
      ok: false,
      confidence: 'unconfirmed',
      error: 'ATTACHMENT_UNCONFIRMED'
    });
  });

  it('returns a confirmed failure when a known negative upload state appears', async () => {
    const root = document.createElement('form');
    document.body.appendChild(root);
    const file = new File(['x'], 'screenshot.png', { type: 'image/png' });
    const before = snapshotAttachmentState(['.attachment-preview'], root, file);

    window.setTimeout(() => {
      root.append('文件中没有内容');
    }, 10);

    const result = await waitForAttachmentOutcome('paste-event', ['.attachment-preview'], before, root, file, {
      timeoutMs: 300
    });

    expect(result).toMatchObject({
      ok: false,
      confidence: 'confirmed',
      error: 'AUTO_ATTACH_FAILED'
    });
    expect(result.evidence?.[0]?.kind).toBe('failure-text');
  });
});
