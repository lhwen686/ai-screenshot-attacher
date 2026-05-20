import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardImagePayload, ClipboardReadResult } from '../src/clipboard/types';

const mocks = vi.hoisted(() => ({
  executeAttachRuntime: vi.fn(),
  executeClipboardPasteRuntime: vi.fn(),
  writeClipboardImage: vi.fn(),
  state: {
    resolveManualRead: undefined as ((result: ClipboardReadResult) => void) | undefined
  }
}));

function image(fileName: string): ClipboardImagePayload {
  return {
    dataUrl: 'data:image/png;base64,eA==',
    fileName,
    lastModified: 1,
    mimeType: 'image/png',
    size: 1
  };
}

vi.mock('../src/clipboard/readClipboardImage', () => ({
  readClipboardImage: vi.fn(() => new Promise<ClipboardReadResult>((resolve) => {
    mocks.state.resolveManualRead = resolve;
  }))
}));

vi.mock('../src/clipboard/writeClipboardImage', () => ({
  writeClipboardImage: mocks.writeClipboardImage
}));

vi.mock('../src/shared/settings', () => ({
  getSettings: vi.fn(async () => ({
    autoAttachEnabled: true,
    debugLogs: false,
    defaultTargetId: 'chatgpt',
    openInNewTab: true,
    showPageToast: false,
    writeBackOnFailure: true
  }))
}));

vi.mock('../src/background/tabManager', () => ({
  executeAttachRuntime: mocks.executeAttachRuntime,
  executeClipboardPasteRuntime: mocks.executeClipboardPasteRuntime,
  getBestOpenTargetTabForAuto: vi.fn(async () => ({ targetId: 'chatgpt', tab: { id: 2 } })),
  getOrCreateTargetTab: vi.fn(async () => ({ id: 1 })),
  showToastOnActivePage: vi.fn(async () => undefined),
  showToastOnPage: vi.fn(async () => undefined)
}));

describe('attach queue', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.executeAttachRuntime.mockReset();
    mocks.executeClipboardPasteRuntime.mockReset();
    mocks.writeClipboardImage.mockReset();
    mocks.executeAttachRuntime.mockResolvedValue({ ok: true, method: 'paste-event', confidence: 'confirmed' });
    mocks.executeClipboardPasteRuntime.mockResolvedValue({ ok: false, method: 'paste-command', error: 'PASTE_COMMAND_FAILED' });
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });
    mocks.state.resolveManualRead = undefined;
    globalThis.chrome = {
      action: {
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setBadgeText: vi.fn(async () => undefined),
        setTitle: vi.fn(async () => undefined)
      },
      runtime: {
        sendMessage: vi.fn(async () => undefined)
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined)
        }
      }
    } as unknown as typeof chrome;
  });

  it('serializes manual and auto work and keeps only the latest pending auto image', async () => {
    const { enqueueAutoAttachment, enqueueManualAttachment } = await import('../src/background/attachQueue');
    const manualPromise = enqueueManualAttachment('chatgpt');

    await vi.waitFor(() => {
      expect(mocks.state.resolveManualRead).toBeTypeOf('function');
    });

    enqueueAutoAttachment(image('old.png'), 'old-fingerprint');
    enqueueAutoAttachment(image('new.png'), 'new-fingerprint');

    mocks.state.resolveManualRead?.({
      ok: true,
      image: image('manual.png'),
      source: 'async-clipboard'
    });

    await manualPromise;

    await vi.waitFor(() => {
      expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
    });

    const autoPayload = mocks.executeAttachRuntime.mock.calls[1][1];
    expect(autoPayload.image.fileName).toBe('new.png');
  });

  it('tries a real clipboard paste command after inconclusive automatic attach failure', async () => {
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      method: 'paste-event',
      error: 'PASTE_EVENT_NO_CONFIRMED_ATTACHMENT',
      confidence: 'unconfirmed'
    });
    mocks.executeClipboardPasteRuntime.mockResolvedValue({
      ok: true,
      method: 'paste-command',
      confidence: 'confirmed'
    });

    const { enqueueManualAttachment } = await import('../src/background/attachQueue');
    const manualPromise = enqueueManualAttachment('chatgpt');

    await vi.waitFor(() => {
      expect(mocks.state.resolveManualRead).toBeTypeOf('function');
    });

    mocks.state.resolveManualRead?.({
      ok: true,
      image: image('manual.png'),
      source: 'async-clipboard'
    });

    const result = await manualPromise;
    expect(mocks.writeClipboardImage).toHaveBeenCalledOnce();
    expect(mocks.executeClipboardPasteRuntime).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      method: 'paste-command',
      targetId: 'chatgpt'
    });
  });
});
