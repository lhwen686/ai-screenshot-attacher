import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClipboardReadResult,
  ClipboardWriteResult,
  OffscreenClipboardMessage,
  OffscreenMonitorResult
} from '../../src/clipboard/types';

type OffscreenMessageListener = (
  message: OffscreenClipboardMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean;

function sendOffscreenMessage<T>(listener: OffscreenMessageListener, message: OffscreenClipboardMessage): Promise<T> {
  return new Promise<T>((resolve) => {
    expect(listener(message, {} as chrome.runtime.MessageSender, (response) => resolve(response as T))).toBe(true);
  });
}

function pngClipboardItem(contents: string) {
  const blob = new Blob([contents], { type: 'image/png' });
  return {
    types: ['image/png'],
    getType: vi.fn().mockResolvedValue(blob)
  };
}

describe('offscreen clipboard fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
        write: vi.fn()
      }
    });
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('broken image')));

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const target = document.body.lastElementChild as HTMLElement | null;
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
          value: {
            files: [new File(['broken'], 'broken.jpg', { type: 'image/jpeg' })],
            items: []
          }
        });
        target?.dispatchEvent(event);
        return true;
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('settles the clipboard request when pasted image conversion fails', async () => {
    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    const response = sendOffscreenMessage<ClipboardReadResult>(listener, { type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE' });

    const result = await Promise.race([
      response,
      new Promise<'timeout'>((resolve) => globalThis.setTimeout(() => resolve('timeout'), 100))
    ]);

    expect(result).not.toBe('timeout');
    expect(result).toMatchObject({ ok: false });
  });

  it('cleans up the paste fallback when image conversion never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => new Promise(() => undefined))
    );

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    const response = sendOffscreenMessage<ClipboardReadResult>(listener, { type: 'OFFSCREEN_READ_CLIPBOARD_IMAGE' });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(response).resolves.toMatchObject({ ok: false });
    expect(document.querySelector('[contenteditable="true"][aria-hidden="true"]')).toBeNull();
  });

  it('requests document recovery and blocks another write when a native write times out', async () => {
    vi.useFakeTimers();
    let resolveLateWrite!: () => void;
    const lateWrite = new Promise<void>((resolve) => {
      resolveLateWrite = resolve;
    });
    const write = vi.fn().mockReturnValueOnce(lateWrite).mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: vi.fn(), write }
    });
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemMock {
        constructor() {}
      }
    );
    const image = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png' as const,
      size: 5
    };

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    const first = sendOffscreenMessage<ClipboardWriteResult>(listener, {
      type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
      image
    });
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10000);
    await expect(first).resolves.toMatchObject({ ok: false, error: 'CLIPBOARD_WRITE_FAILED' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT',
        fingerprint: expect.any(String)
      })
    );
    await expect(
      sendOffscreenMessage<ClipboardWriteResult>(listener, {
        type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
        image
      })
    ).resolves.toMatchObject({ ok: false, error: 'CLIPBOARD_WRITE_FAILED' });
    expect(write).toHaveBeenCalledOnce();

    resolveLateWrite();
    await Promise.resolve();
    await Promise.resolve();
    await expect(
      sendOffscreenMessage<ClipboardWriteResult>(listener, {
        type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
        image
      })
    ).resolves.toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('establishes a baseline after a transient initial read failure without attaching the old image', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('clipboard temporarily busy'))
      .mockResolvedValueOnce([pngClipboardItem('old image')])
      .mockResolvedValueOnce([pngClipboardItem('new image')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false)
    });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockResolvedValueOnce(new Uint8Array([2]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await expect(
      sendOffscreenMessage<OffscreenMonitorResult>(listener, {
        type: 'OFFSCREEN_START_AUTO_MONITOR',
        intervalMs: 10
      })
    ).resolves.toEqual({ ok: true, active: true });
    expect(intervalCallbacks).toHaveLength(1);

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUTO_CLIPBOARD_IMAGE_DETECTED' })
    );

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('persists a normal monitor baseline so a later same-version reload can resume safely', async () => {
    const read = vi.fn().mockResolvedValue([pngClipboardItem('existing baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1]).buffer);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      autoMonitorBaselineFingerprint: { fingerprint: '01', observedAt: expect.any(Number) }
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUTO_CLIPBOARD_IMAGE_DETECTED' })
    );

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('persists a known empty clipboard baseline instead of losing the resume state', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: vi.fn().mockResolvedValue([]), write: vi.fn() }
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false)
    });

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      autoMonitorBaselineFingerprint: { fingerprint: null, observedAt: expect.any(Number) }
    });

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('delivers the first different image after a monitor resume instead of swallowing it as a new baseline', async () => {
    const read = vi.fn().mockResolvedValue([pngClipboardItem('first image after reload')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([2]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await expect(
      sendOffscreenMessage<OffscreenMonitorResult>(listener, {
        type: 'OFFSCREEN_START_AUTO_MONITOR',
        intervalMs: 10,
        resumeBaseline: { fingerprint: '01' }
      } as OffscreenClipboardMessage)
    ).resolves.toEqual({ ok: true, active: true });

    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTO_CLIPBOARD_IMAGE_DETECTED', fingerprint: '02' })
      )
    );

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('refreshes the active baseline lease while the clipboard image stays unchanged', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const read = vi.fn().mockResolvedValue([pngClipboardItem('unchanged baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1]).buffer);
    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      autoMonitorBaselineFingerprint: { fingerprint: '01', observedAt: 1000 }
    });

    now = 12000;
    intervalCallbacks[0]();
    await vi.waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
        autoMonitorBaselineFingerprint: { fingerprint: '01', observedAt: 12000 }
      })
    );

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('does not redeliver the unchanged clipboard image after a monitor resume', async () => {
    const read = vi.fn().mockResolvedValue([pngClipboardItem('unchanged image')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10,
      resumeBaseline: { fingerprint: '01' }
    } as OffscreenClipboardMessage);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());

    const deliveryMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.filter(([message]) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(deliveryMessages).toHaveLength(0);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('delivers the first image after resuming from a known empty clipboard baseline', async () => {
    const read = vi.fn().mockResolvedValue([pngClipboardItem('first image after empty baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([3]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10,
      resumeBaseline: {}
    } as OffscreenClipboardMessage);

    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTO_CLIPBOARD_IMAGE_DETECTED', fingerprint: '03' })
      )
    );

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('does not let a stale initial fingerprint failure clear a restarted monitor baseline', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('stale initial image')])
      .mockResolvedValueOnce([pngClipboardItem('current baseline')])
      .mockResolvedValueOnce([pngClipboardItem('current baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    let rejectStaleDigest!: (error: Error) => void;
    const staleDigest = new Promise<ArrayBuffer>((_resolve, reject) => {
      rejectStaleDigest = reject;
    });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockReturnValueOnce(staleDigest)
      .mockResolvedValue(new Uint8Array([2]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    const staleStart = sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce());

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
    await expect(
      sendOffscreenMessage<OffscreenMonitorResult>(listener, {
        type: 'OFFSCREEN_START_AUTO_MONITOR',
        intervalMs: 10
      })
    ).resolves.toEqual({ ok: true, active: true });

    rejectStaleDigest(new Error('stale fingerprint failed'));
    await expect(staleStart).resolves.toEqual({ ok: true, active: false });
    intervalCallbacks.at(-1)?.();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    const autoMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(autoMessages).toHaveLength(0);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('releases a stalled monitor poll so a later poll can run', async () => {
    vi.useFakeTimers();
    const stalledRead = new Promise<never>(() => undefined);
    const read = vi.fn().mockResolvedValueOnce([]).mockReturnValueOnce(stalledRead).mockResolvedValueOnce([]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false)
    });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(5000);
    intervalCallbacks[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('retries after a stalled service-worker delivery reaches its deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'FileReader',
      class FileReaderMock {
        result: string | ArrayBuffer | null = 'data:image/png;base64,aGVsbG8=';
        error: DOMException | null = null;
        onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
        onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

        readAsDataURL() {
          void Promise.resolve().then(() => this.onload?.({} as ProgressEvent<FileReader>));
        }
      }
    );
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('new image')])
      .mockResolvedValueOnce([pngClipboardItem('new image')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.mocked(chrome.runtime.sendMessage)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60000);
    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2));

    const deliveryIds = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => (message as { deliveryId?: string }).deliveryId);
    expect(deliveryIds[0]).toBeTruthy();
    expect(deliveryIds[1]).toBe(deliveryIds[0]);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('ignores a stale clipboard poll after the monitor is stopped and restarted', async () => {
    let resolveStaleRead!: (items: ReturnType<typeof pngClipboardItem>[]) => void;
    const staleRead = new Promise<ReturnType<typeof pngClipboardItem>[]>((resolve) => {
      resolveStaleRead = resolve;
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockReturnValueOnce(staleRead)
      .mockResolvedValueOnce([pngClipboardItem('new baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;

    await expect(
      sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_START_AUTO_MONITOR', intervalMs: 10 })
    ).resolves.toMatchObject({ ok: true, active: true });
    intervalCallbacks[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    resolveStaleRead([pngClipboardItem('stale')]);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));

    const autoMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(autoMessages).toHaveLength(0);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('ignores a stale clipboard poll when the monitor changes while its fingerprint is pending', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('stale')])
      .mockResolvedValueOnce([pngClipboardItem('new baseline')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });

    let resolveStaleDigest!: (digest: ArrayBuffer) => void;
    const staleDigest = new Promise<ArrayBuffer>((resolve) => {
      resolveStaleDigest = resolve;
    });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockReturnValueOnce(staleDigest)
      .mockResolvedValueOnce(new Uint8Array([3]).buffer);

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(2));
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    resolveStaleDigest(new Uint8Array([2]).buffer);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));

    const autoMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(autoMessages).toHaveLength(0);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('does not report an extension clipboard write or a poll that overlapped it', async () => {
    const writtenContents = 'extension-written-image';
    const imageBlob = new Blob([writtenContents], { type: 'image/png' });
    const image = {
      dataUrl: `data:image/png;base64,${btoa(writtenContents)}`,
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png' as const,
      size: imageBlob.size
    };
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('stale-before-write')])
      .mockResolvedValueOnce([pngClipboardItem(writtenContents)]);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write }
    });
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemMock {
        constructor() {}
      }
    );

    let resolveStaleDigest!: (digest: ArrayBuffer) => void;
    const staleDigest = new Promise<ArrayBuffer>((resolve) => {
      resolveStaleDigest = resolve;
    });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockReturnValueOnce(staleDigest)
      .mockResolvedValue(new Uint8Array([3]).buffer);

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(2));
    await expect(
      sendOffscreenMessage<ClipboardWriteResult>(listener, {
        type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE',
        image
      })
    ).resolves.toEqual({ ok: true });
    resolveStaleDigest(new Uint8Array([2]).buffer);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(4));

    const autoMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(autoMessages).toHaveLength(0);
    expect(write).toHaveBeenCalledOnce();

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('does not report an extension write that the browser re-encoded, but still reports the next new image', async () => {
    const writtenContents = 'extension-written-image';
    const image = {
      dataUrl: `data:image/png;base64,${btoa(writtenContents)}`,
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png' as const,
      size: writtenContents.length
    };
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('re-encoded-extension-write')])
      .mockResolvedValueOnce([pngClipboardItem('new screenshot')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn().mockResolvedValue(undefined) }
    });
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemMock {
        constructor() {}
      }
    );
    vi.spyOn(crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockResolvedValueOnce(new Uint8Array([2]).buffer)
      .mockResolvedValueOnce(new Uint8Array([3]).buffer)
      .mockResolvedValueOnce(new Uint8Array([4]).buffer);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });
    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    await expect(
      sendOffscreenMessage<ClipboardWriteResult>(listener, { type: 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE', image })
    ).resolves.toEqual({ ok: true });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    const deliveries = () =>
      vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.filter(([message]) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(deliveries()).toHaveLength(0);

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(deliveries()).toHaveLength(1), { timeout: 3000 });
    expect(deliveries()[0][0]).toMatchObject({ fingerprint: '04' });

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('suppresses a timed-out extension write fingerprint registered after document recovery', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('late extension write')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockResolvedValueOnce(new Uint8Array([2]).buffer);
    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });
    const sendResponse = vi.fn();
    expect(
      listener(
        { type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT', fingerprint: '02' },
        {} as chrome.runtime.MessageSender,
        sendResponse
      )
    ).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    const autoMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'AUTO_CLIPBOARD_IMAGE_DETECTED');
    expect(autoMessages).toHaveLength(0);

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('retries the same clipboard image when delivery to the service worker fails', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('new image')])
      .mockResolvedValueOnce([pngClipboardItem('new image')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.mocked(chrome.runtime.sendMessage)
      .mockRejectedValueOnce(new Error('service worker unavailable'))
      .mockResolvedValueOnce({ ok: true });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1));
    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2));

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('retries the same clipboard image when the service worker rejects delivery', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([pngClipboardItem('initial')])
      .mockResolvedValueOnce([pngClipboardItem('new image')])
      .mockResolvedValueOnce([pngClipboardItem('new image')]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read, write: vi.fn() }
    });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

    const intervalCallbacks: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallbacks.push(handler as () => void);
      return intervalCallbacks.length;
    }) as typeof window.setInterval);

    await import('../../src/offscreen/offscreen');
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as OffscreenMessageListener;
    await sendOffscreenMessage<OffscreenMonitorResult>(listener, {
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 10
    });

    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1));
    intervalCallbacks[0]();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2));

    await sendOffscreenMessage<OffscreenMonitorResult>(listener, { type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });
});
