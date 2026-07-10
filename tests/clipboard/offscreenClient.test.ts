import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('offscreen client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(chrome.offscreen.closeDocument).mockResolvedValue(undefined);
    vi.mocked(chrome.offscreen.createDocument).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'clients');
  });

  it('detects an existing offscreen document before Chrome 116', async () => {
    const offscreenUrl = chrome.runtime.getURL('src/offscreen/offscreen.html');
    const matchAll = vi.fn().mockResolvedValue([{ url: offscreenUrl }]);
    Object.defineProperty(globalThis, 'clients', {
      configurable: true,
      value: { matchAll }
    });

    const { ensureOffscreenDocument, hasOffscreenDocument } = await import('../../src/clipboard/offscreenClient');

    await expect(hasOffscreenDocument()).resolves.toBe(true);
    await ensureOffscreenDocument();

    expect(matchAll).toHaveBeenCalledTimes(2);
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('settles a clipboard read when the offscreen response never arrives', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.runtime.sendMessage).mockReturnValue(new Promise(() => undefined));
    const { readClipboardImage } = await import('../../src/clipboard/readClipboardImage');

    const pending = readClipboardImage();
    await vi.advanceTimersByTimeAsync(20000);

    await expect(pending).resolves.toMatchObject({ ok: false, error: 'CLIPBOARD_READ_FAILED' });
  });

  it('settles a clipboard read when offscreen document creation never completes', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.offscreen.createDocument).mockReturnValue(new Promise(() => undefined));
    const { readClipboardImage } = await import('../../src/clipboard/readClipboardImage');

    const pending = readClipboardImage();
    await vi.advanceTimersByTimeAsync(10000);

    await expect(pending).resolves.toMatchObject({ ok: false, error: 'CLIPBOARD_READ_FAILED' });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a timed-out creation quarantined before reset and recovery creation', async () => {
    vi.useFakeTimers();
    let finishFirstCreate!: () => void;
    vi.mocked(chrome.offscreen.createDocument)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirstCreate = resolve;
        })
      )
      .mockResolvedValueOnce(undefined);
    const getContexts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ contextType: 'OFFSCREEN_DOCUMENT' }])
      .mockResolvedValueOnce([]);
    Object.defineProperty(chrome.runtime, 'getContexts', {
      configurable: true,
      value: getContexts
    });
    const { ensureOffscreenDocument, resetOffscreenDocument } = await import('../../src/clipboard/offscreenClient');

    const stalled = expect(ensureOffscreenDocument()).rejects.toThrow('OFFSCREEN_CREATE_TIMEOUT');
    await vi.waitFor(() => expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10000);
    await stalled;

    const reset = resetOffscreenDocument();
    const recoveryEnsure = ensureOffscreenDocument();
    await Promise.resolve();
    await Promise.resolve();

    expect(getContexts).toHaveBeenCalledOnce();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();

    finishFirstCreate();
    await expect(Promise.all([reset, recoveryEnsure])).resolves.toEqual([undefined, undefined]);

    expect(getContexts).toHaveBeenCalledTimes(3);
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledOnce();
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(2);
    const [firstCreateOrder, secondCreateOrder] = vi.mocked(chrome.offscreen.createDocument).mock.invocationCallOrder;
    const [closeOrder] = vi.mocked(chrome.offscreen.closeDocument).mock.invocationCallOrder;
    expect(firstCreateOrder).toBeLessThan(closeOrder);
    expect(closeOrder).toBeLessThan(secondCreateOrder);
  });

  it('settles a clipboard write when the offscreen response never arrives', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.runtime.sendMessage).mockReturnValue(new Promise(() => undefined));
    const { writeClipboardImage } = await import('../../src/clipboard/writeClipboardImage');

    const pending = writeClipboardImage({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png',
      size: 5
    });
    await vi.advanceTimersByTimeAsync(20000);

    await expect(pending).resolves.toMatchObject({ ok: false, error: 'CLIPBOARD_WRITE_FAILED' });
  });

  it('serializes a document reset before creating the next offscreen document', async () => {
    let finishClose!: () => void;
    vi.mocked(chrome.offscreen.closeDocument).mockReturnValue(
      new Promise((resolve) => {
        finishClose = resolve;
      })
    );
    const getContexts = vi
      .fn()
      .mockResolvedValueOnce([{ contextType: 'OFFSCREEN_DOCUMENT' }])
      .mockResolvedValueOnce([]);
    Object.defineProperty(chrome.runtime, 'getContexts', {
      configurable: true,
      value: getContexts
    });
    const {
      addOffscreenDocumentResetListener,
      ensureOffscreenDocument,
      getOffscreenDocumentResetGeneration,
      resetOffscreenDocument
    } = await import('../../src/clipboard/offscreenClient');

    const onReset = vi.fn();
    addOffscreenDocumentResetListener(onReset);
    expect(getOffscreenDocumentResetGeneration()).toBe(0);
    const reset = resetOffscreenDocument();
    expect(getOffscreenDocumentResetGeneration()).toBe(1);
    expect(onReset).toHaveBeenCalledWith(1);
    await vi.waitFor(() => expect(chrome.offscreen.closeDocument).toHaveBeenCalledOnce());
    const ensure = ensureOffscreenDocument();
    await Promise.resolve();

    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
    finishClose();
    await expect(Promise.all([reset, ensure])).resolves.toEqual([undefined, undefined]);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();
  });

  it('does not reuse a pre-reset creating promise for recovery after the reset', async () => {
    let resolveOldLookup!: (contexts: Array<{ contextType: string }>) => void;
    const oldLookup = new Promise<Array<{ contextType: string }>>((resolve) => {
      resolveOldLookup = resolve;
    });
    let finishClose!: () => void;
    vi.mocked(chrome.offscreen.closeDocument).mockReturnValue(
      new Promise((resolve) => {
        finishClose = resolve;
      })
    );
    const getContexts = vi
      .fn()
      .mockReturnValueOnce(oldLookup)
      .mockResolvedValueOnce([{ contextType: 'OFFSCREEN_DOCUMENT' }])
      .mockResolvedValueOnce([]);
    Object.defineProperty(chrome.runtime, 'getContexts', {
      configurable: true,
      value: getContexts
    });
    const { ensureOffscreenDocument, resetOffscreenDocument } = await import('../../src/clipboard/offscreenClient');

    const oldEnsure = ensureOffscreenDocument();
    await vi.waitFor(() => expect(getContexts).toHaveBeenCalledOnce());
    const reset = resetOffscreenDocument();
    const recoveryEnsure = ensureOffscreenDocument();

    resolveOldLookup([]);
    await vi.waitFor(() => expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(chrome.offscreen.closeDocument).toHaveBeenCalledOnce());
    expect(getContexts).toHaveBeenCalledTimes(2);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();

    finishClose();
    await expect(Promise.all([oldEnsure, reset, recoveryEnsure])).resolves.toEqual([undefined, undefined, undefined]);
    expect(getContexts).toHaveBeenCalledTimes(3);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(2);
  });

  it('keeps a timed-out close quarantined until the underlying mutation settles', async () => {
    vi.useFakeTimers();
    let finishClose!: () => void;
    vi.mocked(chrome.offscreen.closeDocument).mockReturnValue(
      new Promise((resolve) => {
        finishClose = resolve;
      })
    );
    const getContexts = vi
      .fn()
      .mockResolvedValueOnce([{ contextType: 'OFFSCREEN_DOCUMENT' }])
      .mockResolvedValueOnce([]);
    Object.defineProperty(chrome.runtime, 'getContexts', {
      configurable: true,
      value: getContexts
    });
    const { ensureOffscreenDocument, resetOffscreenDocument } = await import('../../src/clipboard/offscreenClient');

    const reset = expect(resetOffscreenDocument()).rejects.toThrow('OFFSCREEN_CLOSE_TIMEOUT');
    await vi.waitFor(() => expect(chrome.offscreen.closeDocument).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10000);
    await reset;

    const ensure = ensureOffscreenDocument();
    await Promise.resolve();
    expect(getContexts).toHaveBeenCalledOnce();
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();

    finishClose();
    await expect(ensure).resolves.toBeUndefined();
    expect(getContexts).toHaveBeenCalledTimes(2);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();
  });
});
