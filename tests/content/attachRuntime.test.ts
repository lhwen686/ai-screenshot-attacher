import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTargetAdapter } from '../../src/adapters/types';
import type { AttachRuntimePayload } from '../../src/shared/messages';

const mocks = vi.hoisted(() => ({
  getAdapterById: vi.fn(),
  detectAdapter: vi.fn(),
  dataUrlToFile: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('../../src/adapters/registry', () => ({
  getAdapterById: mocks.getAdapterById,
  detectAdapter: mocks.detectAdapter
}));

vi.mock('../../src/content/domUtils', () => ({
  dataUrlToFile: mocks.dataUrlToFile
}));

vi.mock('../../src/content/toast', () => ({
  showToast: mocks.showToast
}));

const payload: AttachRuntimePayload = {
  targetId: 'chatgpt',
  image: {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    fileName: 'screenshot.png',
    lastModified: 123,
    mimeType: 'image/png',
    size: 5
  },
  settings: {
    allowClipboardPaste: false,
    showPageToast: false,
    writeBackOnFailure: true,
    debugLogs: false
  }
};

describe('attach runtime safety', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.dataUrlToFile.mockReturnValue(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    Reflect.deleteProperty(window, '__AI_SCREENSHOT_ATTACHER__');
  });

  it('does not mutate when the selected adapter does not match the current host', async () => {
    const adapter = createAdapter({ detect: vi.fn(() => false) });
    mocks.getAdapterById.mockReturnValue(adapter);
    await import('../../src/content/attachRuntime');

    await expect(window.__AI_SCREENSHOT_ATTACHER__!.run(payload)).resolves.toMatchObject({
      ok: false,
      error: 'ADAPTER_NOT_FOUND'
    });
    expect(adapter.waitUntilReady).not.toHaveBeenCalled();
    expect(adapter.attachImage).not.toHaveBeenCalled();
  });

  it('does not refocus or move the draft after an unconfirmed mutation', async () => {
    const adapter = createAdapter({
      attachImage: vi.fn().mockResolvedValue({
        ok: false,
        method: 'paste-event',
        outcome: 'unknown',
        error: 'PASTE_EVENT_NO_PREVIEW'
      })
    });
    mocks.getAdapterById.mockReturnValue(adapter);
    await import('../../src/content/attachRuntime');

    await expect(window.__AI_SCREENSHOT_ATTACHER__!.run(payload)).resolves.toMatchObject({ outcome: 'unknown' });
    expect(adapter.focusInput).not.toHaveBeenCalled();
  });
});

function createAdapter(overrides: Partial<AiTargetAdapter> = {}): AiTargetAdapter {
  return {
    id: 'chatgpt',
    name: 'ChatGPT',
    urlPatterns: ['https://chatgpt.com/*'],
    defaultUrl: 'https://chatgpt.com/',
    detect: vi.fn(() => true),
    waitUntilReady: vi.fn().mockResolvedValue(true),
    attachImage: vi.fn().mockResolvedValue({ ok: true, method: 'paste-event', outcome: 'confirmed' }),
    focusInput: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}
