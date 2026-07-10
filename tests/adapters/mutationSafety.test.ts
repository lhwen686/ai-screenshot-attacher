import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tryAttachViaDrop: vi.fn(),
  tryAttachViaFileInput: vi.fn(),
  tryAttachViaPaste: vi.fn()
}));

vi.mock('../../src/content/domUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/content/domUtils')>()),
  tryAttachViaDrop: mocks.tryAttachViaDrop,
  tryAttachViaFileInput: mocks.tryAttachViaFileInput,
  tryAttachViaPaste: mocks.tryAttachViaPaste
}));

import { chatgptAdapter } from '../../src/adapters/chatgpt';

describe('adapter mutation safety', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('does not try another ChatGPT mutation after an unconfirmed paste was dispatched', async () => {
    document.body.innerHTML =
      '<main><section data-testid="composer"><div id="prompt-textarea" contenteditable="true"></div></section></main>';
    document.querySelector<HTMLElement>('#prompt-textarea')!.getBoundingClientRect = () =>
      ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }) as DOMRect;
    mocks.tryAttachViaPaste.mockResolvedValue({
      ok: false,
      method: 'paste-event',
      error: 'PASTE_EVENT_NO_PREVIEW',
      outcome: 'unknown'
    });
    mocks.tryAttachViaFileInput.mockResolvedValue({ ok: false, method: 'file-input', outcome: 'rejected' });
    mocks.tryAttachViaDrop.mockResolvedValue({ ok: false, method: 'drop-event', outcome: 'rejected' });

    const result = await chatgptAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));

    expect(result).toMatchObject({ ok: false, outcome: 'unknown' });
    expect(mocks.tryAttachViaFileInput).not.toHaveBeenCalled();
    expect(mocks.tryAttachViaDrop).not.toHaveBeenCalled();
  });
});
