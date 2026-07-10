import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardImagePayload } from '../../src/clipboard/types';
import { USER_MESSAGES } from '../../src/shared/constants';
import type { AutoMonitorStatus, OperationResult, UiMessage } from '../../src/shared/messages';

const mocks = vi.hoisted(() => ({
  addOffscreenDocumentResetListener: vi.fn(),
  attachToTarget: vi.fn(),
  getAutoMonitorStatus: vi.fn(),
  getLastOperation: vi.fn(),
  getOffscreenDocumentResetGeneration: vi.fn(),
  getSettings: vi.fn(),
  handleAutoClipboardImage: vi.fn(),
  handleCommand: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  refreshAutoMonitor: vi.fn(),
  requestAutoMonitorFreshBaseline: vi.fn(),
  requestAutoMonitorResumeFromStoredState: vi.fn(),
  resumeAutoMonitorRefresh: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  resetOffscreenDocument: vi.fn(),
  scheduleAutoMonitorRefresh: vi.fn(),
  suspendAutoMonitorRefresh: vi.fn()
}));

vi.mock('../../src/background/commandHandler', () => ({
  attachToTarget: mocks.attachToTarget,
  getLastOperation: mocks.getLastOperation,
  handleCommand: mocks.handleCommand
}));

vi.mock('../../src/shared/settings', () => ({
  getSettings: mocks.getSettings
}));

vi.mock('../../src/shared/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    warn: mocks.loggerWarn
  }
}));

vi.mock('../../src/background/autoMonitor', () => ({
  getAutoMonitorStatus: mocks.getAutoMonitorStatus,
  handleAutoClipboardImage: mocks.handleAutoClipboardImage,
  refreshAutoMonitor: mocks.refreshAutoMonitor,
  requestAutoMonitorFreshBaseline: mocks.requestAutoMonitorFreshBaseline,
  requestAutoMonitorResumeFromStoredState: mocks.requestAutoMonitorResumeFromStoredState,
  resumeAutoMonitorRefresh: mocks.resumeAutoMonitorRefresh,
  scheduleAutoMonitorRefresh: mocks.scheduleAutoMonitorRefresh,
  suspendAutoMonitorRefresh: mocks.suspendAutoMonitorRefresh
}));

vi.mock('../../src/clipboard/offscreenClient', () => ({
  addOffscreenDocumentResetListener: mocks.addOffscreenDocumentResetListener,
  ensureOffscreenDocument: mocks.ensureOffscreenDocument,
  getOffscreenDocumentResetGeneration: mocks.getOffscreenDocumentResetGeneration,
  resetOffscreenDocument: mocks.resetOffscreenDocument
}));

type RuntimeMessageListener = (
  message: UiMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | undefined;

const image: ClipboardImagePayload = {
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  fileName: 'screenshot.png',
  lastModified: 123,
  mimeType: 'image/png',
  size: 5
};

const operationResult: OperationResult = {
  ok: true,
  targetId: 'claude',
  targetName: 'Claude',
  method: 'paste-event',
  message: 'attached',
  trigger: 'manual',
  at: '2026-07-10T00:00:00.000Z'
};

const monitorStatus: AutoMonitorStatus = {
  enabled: true,
  active: true,
  targetCount: 2,
  message: 'running'
};

describe('service worker integration routing', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());

    Object.defineProperty(chrome, 'commands', {
      configurable: true,
      value: {
        onCommand: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      }
    });

    mocks.attachToTarget.mockResolvedValue(operationResult);
    mocks.addOffscreenDocumentResetListener.mockReturnValue(vi.fn());
    mocks.getAutoMonitorStatus.mockReturnValue(monitorStatus);
    mocks.getOffscreenDocumentResetGeneration.mockReturnValue(0);
    mocks.getLastOperation.mockResolvedValue(operationResult);
    mocks.getSettings.mockResolvedValue({});
    mocks.handleAutoClipboardImage.mockResolvedValue(undefined);
    mocks.handleCommand.mockResolvedValue(operationResult);
    mocks.refreshAutoMonitor.mockResolvedValue(monitorStatus);
    mocks.ensureOffscreenDocument.mockResolvedValue(undefined);
    mocks.resetOffscreenDocument.mockResolvedValue(undefined);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers every runtime, command, tab, window, and storage listener', async () => {
    await loadServiceWorker();

    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledOnce();
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledOnce();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(chrome.commands.onCommand.addListener).toHaveBeenCalledOnce();
    expect(chrome.tabs.onCreated.addListener).toHaveBeenCalledOnce();
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalledOnce();
    expect(chrome.tabs.onActivated.addListener).toHaveBeenCalledOnce();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledOnce();
    expect(chrome.windows.onCreated.addListener).toHaveBeenCalledOnce();
    expect(chrome.windows.onRemoved.addListener).toHaveBeenCalledOnce();
    expect(chrome.windows.onFocusChanged.addListener).toHaveBeenCalledOnce();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledOnce();
  });

  it('routes ATTACH_TO_TARGET and keeps the response channel open until completion', async () => {
    let resolveAttach!: (result: OperationResult) => void;
    mocks.attachToTarget.mockReturnValue(
      new Promise<OperationResult>((resolve) => {
        resolveAttach = resolve;
      })
    );
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    const keepChannelOpen = listener(
      { type: 'ATTACH_TO_TARGET', targetId: 'claude' },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(keepChannelOpen).toBe(true);
    expect(mocks.attachToTarget).toHaveBeenCalledWith('claude');
    expect(sendResponse).not.toHaveBeenCalled();

    resolveAttach(operationResult);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(operationResult));
  });

  it('routes GET_LAST_OPERATION through sendResponse', async () => {
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    expect(listener({ type: 'GET_LAST_OPERATION' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(operationResult));
    expect(mocks.getLastOperation).toHaveBeenCalledOnce();
  });

  it('refreshes and responds to GET_AUTO_MONITOR_STATUS', async () => {
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    expect(listener({ type: 'GET_AUTO_MONITOR_STATUS' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(monitorStatus));
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce();
  });

  it('acknowledges AUTO_CLIPBOARD_IMAGE_DETECTED after processing finishes', async () => {
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    expect(
      listener(
        {
          type: 'AUTO_CLIPBOARD_IMAGE_DETECTED',
          image,
          fingerprint: 'fingerprint-one',
          deliveryId: 'delivery-one'
        },
        {} as chrome.runtime.MessageSender,
        sendResponse
      )
    ).toBe(true);

    expect(mocks.handleAutoClipboardImage).toHaveBeenCalledWith(image, 'fingerprint-one', 'delivery-one');
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it('does not let a status query bypass an in-flight suppression registration', async () => {
    let resolveRegistration!: (response: { ok: true }) => void;
    vi.mocked(chrome.runtime.sendMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveRegistration = resolve;
      })
    );
    const listener = await loadRuntimeMessageListener();
    const offscreenSender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;
    listener(
      { type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-status-gate' },
      offscreenSender,
      vi.fn()
    );
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce());

    const sendResponse = vi.fn();
    expect(listener({ type: 'GET_AUTO_MONITOR_STATUS' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);
    expect(mocks.refreshAutoMonitor).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();

    resolveRegistration({ ok: true });
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(monitorStatus));
  });

  it('rejects automatic image delivery while suppression recovery is pending', async () => {
    let resolveRegistration!: (response: { ok: true }) => void;
    vi.mocked(chrome.runtime.sendMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveRegistration = resolve;
      })
    );
    const listener = await loadRuntimeMessageListener();
    const offscreenSender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;
    listener(
      { type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-delivery-gate' },
      offscreenSender,
      vi.fn()
    );
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce());

    const sendResponse = vi.fn();
    expect(
      listener(
        {
          type: 'AUTO_CLIPBOARD_IMAGE_DETECTED',
          image,
          fingerprint: 'fingerprint-delivery-gate',
          deliveryId: 'delivery-gated'
        },
        offscreenSender,
        sendResponse
      )
    ).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, message: USER_MESSAGES.serviceUnavailable });
    expect(mocks.handleAutoClipboardImage).not.toHaveBeenCalled();

    resolveRegistration({ ok: true });
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());
  });

  it('returns the authoritative cached status for AUTO_MONITOR_STATUS_CHANGED synchronously', async () => {
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();
    const incomingStatus: AutoMonitorStatus = {
      enabled: false,
      active: false,
      targetCount: 0,
      message: 'stale'
    };

    const keepChannelOpen = listener(
      { type: 'AUTO_MONITOR_STATUS_CHANGED', status: incomingStatus },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(keepChannelOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith(monitorStatus);
  });

  it('ignores unknown runtime messages without opening a response channel', async () => {
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();
    const unknownMessage = {
      type: 'UNKNOWN_MESSAGE',
      prompt: 'private chat content',
      payload: 'data:image/png;base64,private-image-data'
    } as unknown as UiMessage;

    expect(listener(unknownMessage, {} as chrome.runtime.MessageSender, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(mocks.loggerDebug).toHaveBeenCalledWith('ignored runtime message', { type: 'UNKNOWN_MESSAGE' });
  });

  it('returns a stable operation failure when ATTACH_TO_TARGET rejects', async () => {
    const error = new Error('attach failed');
    mocks.attachToTarget.mockRejectedValue(error);
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'ATTACH_TO_TARGET', targetId: 'gemini' }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          targetId: 'gemini',
          message: USER_MESSAGES.serviceUnavailable,
          error: 'UNKNOWN_ERROR',
          trigger: 'manual'
        })
      )
    );
    expect(mocks.loggerError).toHaveBeenCalledWith('attach message handling failed', { error });
  });

  it('responds with undefined when GET_LAST_OPERATION rejects', async () => {
    const error = new Error('storage failed');
    mocks.getLastOperation.mockRejectedValue(error);
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'GET_LAST_OPERATION' }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(undefined));
    expect(mocks.loggerError).toHaveBeenCalledWith('last operation lookup failed', { error });
  });

  it('returns the cached status when GET_AUTO_MONITOR_STATUS refresh rejects', async () => {
    const error = new Error('refresh failed');
    mocks.refreshAutoMonitor.mockRejectedValue(error);
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'GET_AUTO_MONITOR_STATUS' }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(monitorStatus));
    expect(mocks.loggerError).toHaveBeenCalledWith('auto monitor refresh message failed', { error });
  });

  it('returns an explicit negative acknowledgement when automatic image handling rejects', async () => {
    const error = new Error('auto attach failed');
    mocks.handleAutoClipboardImage.mockRejectedValue(error);
    const listener = await loadRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener(
      {
        type: 'AUTO_CLIPBOARD_IMAGE_DETECTED',
        image,
        fingerprint: 'fingerprint-two',
        deliveryId: 'delivery-two'
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, message: USER_MESSAGES.serviceUnavailable })
    );
    expect(mocks.loggerError).toHaveBeenCalledWith('auto clipboard image handling failed', { error });
  });

  it('ignores offscreen recovery requests from any non-offscreen sender', async () => {
    const listener = await loadRuntimeMessageListener();

    expect(
      listener(
        { type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT' },
        { url: 'https://chatgpt.com/' } as chrome.runtime.MessageSender,
        vi.fn()
      )
    ).toBe(false);
    expect(mocks.resetOffscreenDocument).not.toHaveBeenCalled();
  });

  it('coalesces offscreen recovery requests and restarts automatic monitoring', async () => {
    let finishReset!: () => void;
    mocks.resetOffscreenDocument.mockReturnValue(
      new Promise((resolve) => {
        finishReset = resolve;
      })
    );
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    expect(
      listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-one' }, sender, vi.fn())
    ).toBe(false);
    expect(
      listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-two' }, sender, vi.fn())
    ).toBe(false);
    await vi.waitFor(() => expect(mocks.resetOffscreenDocument).toHaveBeenCalledOnce());
    expect(mocks.refreshAutoMonitor).not.toHaveBeenCalled();

    finishReset();
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
        fingerprint: 'fingerprint-one'
      })
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-two'
    });
    expect(mocks.resetOffscreenDocument).toHaveBeenCalledTimes(2);
    expect(mocks.scheduleAutoMonitorRefresh).not.toHaveBeenCalled();
  });

  it('registers suppression before refreshing even while monitoring is inactive', async () => {
    vi.useFakeTimers();
    mocks.refreshAutoMonitor.mockResolvedValue({ ...monitorStatus, active: false, targetCount: 0 });
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-inactive' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.resetOffscreenDocument).toHaveBeenCalledOnce();
    expect(mocks.ensureOffscreenDocument).toHaveBeenCalledOnce();
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-inactive'
    });
    expect(vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshAutoMonitor.mock.invocationCallOrder[0]
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce();
  });

  it('retries a failed suppression registration without resetting in a tight loop', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-retry' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'offscreen clipboard suppression registration failed',
      expect.objectContaining({ fingerprint: 'fingerprint-retry' })
    );
    expect(mocks.refreshAutoMonitor).not.toHaveBeenCalled();
    expect(mocks.scheduleAutoMonitorRefresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(14999);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.resetOffscreenDocument).toHaveBeenCalledOnce();
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce();
  });

  it('uses a target lifecycle event to retry pending suppression before monitor refresh', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-lifecycle' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.refreshAutoMonitor).not.toHaveBeenCalled();
    expect(mocks.scheduleAutoMonitorRefresh).not.toHaveBeenCalled();

    const onTabCreated = vi.mocked(chrome.tabs.onCreated.addListener).mock.calls[0][0];
    onTabCreated({} as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(0);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[1]).toBeLessThan(
      mocks.refreshAutoMonitor.mock.invocationCallOrder.at(-1)!
    );
  });

  it('does not let a lifecycle refresh overtake a slow suppression registration', async () => {
    vi.useFakeTimers();
    let resolveRegistration!: (response: { ok: true }) => void;
    vi.mocked(chrome.runtime.sendMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveRegistration = resolve;
      })
    );
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-slow' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce());

    const onTabCreated = vi.mocked(chrome.tabs.onCreated.addListener).mock.calls[0][0];
    onTabCreated({} as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(500);

    expect(mocks.refreshAutoMonitor).not.toHaveBeenCalled();
    expect(mocks.scheduleAutoMonitorRefresh).not.toHaveBeenCalled();

    resolveRegistration({ ok: true });
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());
    expect(vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshAutoMonitor.mock.invocationCallOrder[0]
    );
  });

  it('keeps a newer same-fingerprint recovery when an older registration settles', async () => {
    let resolveOldRegistration!: (response: { ok: true }) => void;
    vi.mocked(chrome.runtime.sendMessage)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldRegistration = resolve;
        })
      )
      .mockResolvedValue({ ok: true });
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-repeat' }, sender, vi.fn());
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce());
    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-repeat' }, sender, vi.fn());

    resolveOldRegistration({ ok: true });
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());

    expect(mocks.resetOffscreenDocument).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-repeat'
    });
  });

  it('re-registers retained fingerprints after a later offscreen reset', async () => {
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-old' }, sender, vi.fn());
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-new' }, sender, vi.fn());
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledTimes(2));

    expect(mocks.resetOffscreenDocument).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-old'
    });
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-old'
    });
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(3, {
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-new'
    });
  });

  it('invalidates retained registration after an external offscreen reset generation', async () => {
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-external' }, sender, vi.fn());
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());
    mocks.getOffscreenDocumentResetGeneration.mockReturnValue(1);

    const onOffscreenReset = mocks.addOffscreenDocumentResetListener.mock.calls[0][0] as (generation: number) => void;
    onOffscreenReset(1);
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledTimes(2));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT',
      fingerprint: 'fingerprint-external'
    });
    expect(vi.mocked(chrome.runtime.sendMessage).mock.invocationCallOrder[1]).toBeLessThan(
      mocks.refreshAutoMonitor.mock.invocationCallOrder[1]
    );
    expect(mocks.resetOffscreenDocument).toHaveBeenCalledOnce();
  });

  it('backs off when every recovery refresh triggers another external reset', async () => {
    vi.useFakeTimers();
    const listener = await loadRuntimeMessageListener();
    const onOffscreenReset = mocks.addOffscreenDocumentResetListener.mock.calls[0][0] as (generation: number) => void;
    let resetGeneration = 0;
    mocks.refreshAutoMonitor.mockImplementation(async () => {
      resetGeneration += 1;
      mocks.getOffscreenDocumentResetGeneration.mockReturnValue(resetGeneration);
      onOffscreenReset(resetGeneration);
      return { ...monitorStatus, active: false };
    });
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-backoff' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(14999);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAutoMonitor).toHaveBeenCalledTimes(2);
  });

  it('expires retained suppression state instead of retrying forever', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
    mocks.ensureOffscreenDocument.mockRejectedValue(new Error('offscreen unavailable'));
    const listener = await loadRuntimeMessageListener();
    const sender = {
      url: chrome.runtime.getURL('src/offscreen/offscreen.html')
    } as chrome.runtime.MessageSender;

    listener({ type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT', fingerprint: 'fingerprint-expiring' }, sender, vi.fn());
    await vi.advanceTimersByTimeAsync(120000);
    const ensureCountAtExpiry = mocks.ensureOffscreenDocument.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);

    expect(ensureCountAtExpiry).toBeGreaterThan(1);
    expect(mocks.ensureOffscreenDocument).toHaveBeenCalledTimes(ensureCountAtExpiry);
    expect(mocks.resumeAutoMonitorRefresh).toHaveBeenCalled();
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalled();
  });

  it('routes commands and catches command handler rejection', async () => {
    await loadServiceWorker();
    const commandListener = vi.mocked(chrome.commands.onCommand.addListener).mock.calls[0][0];

    commandListener('attach-to-claude');
    expect(mocks.handleCommand).toHaveBeenCalledWith('attach-to-claude');

    const error = new Error('command failed');
    mocks.handleCommand.mockRejectedValueOnce(error);
    commandListener('attach-to-gemini');

    await vi.waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith('command handling failed', {
        command: 'attach-to-gemini',
        error
      })
    );
  });

  it('initializes monitoring after installation and catches initialization rejection', async () => {
    await loadServiceWorker();
    const installedListener = vi.mocked(chrome.runtime.onInstalled.addListener).mock.calls[0][0];

    installedListener({ reason: 'install' });
    await vi.waitFor(() => expect(mocks.refreshAutoMonitor).toHaveBeenCalledOnce());

    const error = new Error('settings unavailable');
    mocks.getSettings.mockRejectedValueOnce(error);
    installedListener({ reason: 'update', previousVersion: '0.0.9' });

    await vi.waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith('installed initialization failed', { error })
    );
  });

  it('resumes the clipboard baseline for updates even when an unpacked reload omits previousVersion', async () => {
    await loadServiceWorker();
    const installedListener = vi.mocked(chrome.runtime.onInstalled.addListener).mock.calls[0][0];

    installedListener({ reason: 'install' });
    expect(mocks.requestAutoMonitorResumeFromStoredState).not.toHaveBeenCalled();

    installedListener({ reason: 'update' });
    expect(mocks.requestAutoMonitorResumeFromStoredState).toHaveBeenCalledOnce();
  });

  it('schedules monitoring as soon as the service worker loads', async () => {
    await loadServiceWorker();

    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledOnce();
  });

  it('catches monitor refresh rejection during installation', async () => {
    const error = new Error('monitor unavailable');
    mocks.refreshAutoMonitor.mockRejectedValue(error);
    await loadServiceWorker();
    const installedListener = vi.mocked(chrome.runtime.onInstalled.addListener).mock.calls[0][0];

    installedListener({ reason: 'install' });

    await vi.waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith('installed initialization failed', { error })
    );
  });

  it('schedules refreshes for startup and relevant tab, window, and sync-storage lifecycle events', async () => {
    await loadServiceWorker();
    const startupListener = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0][0];
    const tabCreatedListener = vi.mocked(chrome.tabs.onCreated.addListener).mock.calls[0][0];
    const tabRemovedListener = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls[0][0];
    const tabActivatedListener = vi.mocked(chrome.tabs.onActivated.addListener).mock.calls[0][0];
    const tabUpdatedListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0][0];
    const windowCreatedListener = vi.mocked(chrome.windows.onCreated.addListener).mock.calls[0][0];
    const windowRemovedListener = vi.mocked(chrome.windows.onRemoved.addListener).mock.calls[0][0];
    const windowFocusListener = vi.mocked(chrome.windows.onFocusChanged.addListener).mock.calls[0][0];
    const storageListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

    mocks.scheduleAutoMonitorRefresh.mockClear();
    startupListener();
    expect(mocks.requestAutoMonitorFreshBaseline).toHaveBeenCalledOnce();
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(1);

    tabCreatedListener({} as chrome.tabs.Tab);
    tabRemovedListener(1, { windowId: 2, isWindowClosing: false });
    tabActivatedListener({ tabId: 1, windowId: 2 });
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(4);

    tabUpdatedListener(1, {}, {} as chrome.tabs.Tab);
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(4);
    tabUpdatedListener(1, { status: 'complete' }, {} as chrome.tabs.Tab);
    tabUpdatedListener(1, { url: 'https://chatgpt.com/' }, {} as chrome.tabs.Tab);
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(6);

    windowCreatedListener({} as chrome.windows.Window);
    windowRemovedListener(2);
    windowFocusListener(2);
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(9);

    storageListener({}, 'local');
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(9);
    storageListener({}, 'sync');
    expect(mocks.scheduleAutoMonitorRefresh).toHaveBeenCalledTimes(10);
  });
});

async function loadServiceWorker(): Promise<void> {
  await import('../../src/background/serviceWorker');
}

async function loadRuntimeMessageListener(): Promise<RuntimeMessageListener> {
  await loadServiceWorker();
  mocks.scheduleAutoMonitorRefresh.mockClear();
  return vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as RuntimeMessageListener;
}
