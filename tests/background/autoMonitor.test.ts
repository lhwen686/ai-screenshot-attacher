import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardImagePayload } from '../../src/clipboard/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const mocks = vi.hoisted(() => ({
  countOpenTargetTabs: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  executeAttachRuntime: vi.fn(),
  getBestOpenTargetTabForAuto: vi.fn(),
  getSettings: vi.fn(),
  hasOffscreenDocument: vi.fn(),
  recordOperationResult: vi.fn(),
  resetOffscreenDocument: vi.fn(),
  showToastOnPage: vi.fn(),
  writeClipboardImage: vi.fn()
}));

vi.mock('../../src/shared/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/shared/settings')>()),
  getSettings: mocks.getSettings
}));

vi.mock('../../src/clipboard/offscreenClient', () => ({
  ensureOffscreenDocument: mocks.ensureOffscreenDocument,
  hasOffscreenDocument: mocks.hasOffscreenDocument,
  resetOffscreenDocument: mocks.resetOffscreenDocument
}));

vi.mock('../../src/clipboard/writeClipboardImage', () => ({
  writeClipboardImage: mocks.writeClipboardImage
}));

vi.mock('../../src/background/tabManager', () => ({
  countOpenTargetTabs: mocks.countOpenTargetTabs,
  executeAttachRuntime: mocks.executeAttachRuntime,
  getBestOpenTargetTabForAuto: mocks.getBestOpenTargetTabForAuto,
  showToastOnPage: mocks.showToastOnPage
}));

vi.mock('../../src/background/commandHandler', () => ({
  recordOperationResult: mocks.recordOperationResult
}));

describe('automatic monitor refresh', () => {
  const image: ClipboardImagePayload = {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    fileName: 'screenshot.png',
    lastModified: 123,
    mimeType: 'image/png',
    size: 5
  };

  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true
    });
    mocks.ensureOffscreenDocument.mockResolvedValue(undefined);
    mocks.hasOffscreenDocument.mockResolvedValue(true);
    mocks.executeAttachRuntime.mockResolvedValue({ ok: true, method: 'paste-event' });
    mocks.getBestOpenTargetTabForAuto.mockResolvedValue({ targetId: 'chatgpt', tab: { id: 42 } });
    mocks.recordOperationResult.mockResolvedValue(undefined);
    mocks.resetOffscreenDocument.mockResolvedValue(undefined);
    mocks.showToastOnPage.mockResolvedValue(undefined);
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });

    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
      if ((message as { type?: string }).type === 'OFFSCREEN_START_AUTO_MONITOR') {
        return { ok: true, active: true };
      }
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contains failures from a scheduled lifecycle refresh', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.getSettings.mockRejectedValue(new Error('storage unavailable'));

    const { scheduleAutoMonitorRefresh } = await import('../../src/background/autoMonitor');
    scheduleAutoMonitorRefresh();
    await vi.runAllTimersAsync();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auto monitor settings lookup failed'),
      expect.objectContaining({ message: 'auto monitor settings lookup failed' })
    );
  });

  it('passes a fresh persisted clipboard baseline without relying on an install event', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await chrome.storage.local.set({
      autoMonitorBaselineFingerprint: { fingerprint: 'persisted-baseline', observedAt: 1000 }
    });
    const { refreshAutoMonitor } = await import('../../src/background/autoMonitor');

    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000,
      resumeBaseline: { fingerprint: 'persisted-baseline' }
    });
  });

  it('passes a legacy clipboard baseline when an extension update explicitly requests migration', async () => {
    await chrome.storage.local.set({ autoMonitorBaselineFingerprint: 'persisted-baseline' });
    const { refreshAutoMonitor, requestAutoMonitorResumeFromStoredState } =
      await import('../../src/background/autoMonitor');

    requestAutoMonitorResumeFromStoredState();
    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000,
      resumeBaseline: { fingerprint: 'persisted-baseline' }
    });
  });

  it('migrates the last handled fingerprint when the dedicated monitor baseline does not exist yet', async () => {
    await chrome.storage.local.set({
      autoDedupeState: { deliveryId: 'previous-delivery', fingerprint: 'last-handled-fingerprint', at: 123 }
    });
    const { refreshAutoMonitor, requestAutoMonitorResumeFromStoredState } =
      await import('../../src/background/autoMonitor');

    requestAutoMonitorResumeFromStoredState();
    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000,
      resumeBaseline: { fingerprint: 'last-handled-fingerprint' }
    });
  });

  it('resumes from a persisted empty baseline so the first new image is not swallowed', async () => {
    await chrome.storage.local.set({ autoMonitorBaselineFingerprint: null });
    const { refreshAutoMonitor, requestAutoMonitorResumeFromStoredState } =
      await import('../../src/background/autoMonitor');

    requestAutoMonitorResumeFromStoredState();
    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000,
      resumeBaseline: {}
    });
  });

  it('keeps a stale monitor lease in safe baseline mode', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(600000);
    await chrome.storage.local.set({
      autoMonitorBaselineFingerprint: { fingerprint: 'stale-baseline', observedAt: 1 }
    });
    const { refreshAutoMonitor } = await import('../../src/background/autoMonitor');

    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000
    });
  });

  it('forces a safe baseline on browser startup even when the persisted lease is fresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await chrome.storage.local.set({
      autoMonitorBaselineFingerprint: { fingerprint: 'fresh-baseline', observedAt: 1000 }
    });
    const { refreshAutoMonitor, requestAutoMonitorFreshBaseline } = await import('../../src/background/autoMonitor');

    requestAutoMonitorFreshBaseline();
    await refreshAutoMonitor();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_START_AUTO_MONITOR',
      intervalMs: 1000
    });
  });

  it('drops a reload resume request when no supported target is open', async () => {
    await chrome.storage.local.set({ autoMonitorBaselineFingerprint: 'stale-baseline' });
    mocks.countOpenTargetTabs.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const { refreshAutoMonitor, requestAutoMonitorResumeFromStoredState } =
      await import('../../src/background/autoMonitor');

    requestAutoMonitorResumeFromStoredState();
    await refreshAutoMonitor();
    await refreshAutoMonitor();

    const startMessages = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.map(([message]) => message)
      .filter((message) => (message as { type?: string }).type === 'OFFSCREEN_START_AUTO_MONITOR');
    expect(startMessages).toEqual([{ type: 'OFFSCREEN_START_AUTO_MONITOR', intervalMs: 1000 }]);
  });

  it('runs a trailing refresh when state changes during an in-flight refresh', async () => {
    let resolveFirstCount!: (count: number) => void;
    const firstCount = new Promise<number>((resolve) => {
      resolveFirstCount = resolve;
    });
    mocks.countOpenTargetTabs.mockReturnValueOnce(firstCount).mockResolvedValueOnce(0);

    const { refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    const firstRefresh = refreshAutoMonitor();

    await vi.waitFor(() => expect(mocks.countOpenTargetTabs).toHaveBeenCalledOnce());
    const trailingRefresh = refreshAutoMonitor();
    resolveFirstCount(1);

    const [firstStatus, trailingStatus] = await Promise.all([firstRefresh, trailingRefresh]);

    expect(mocks.countOpenTargetTabs).toHaveBeenCalledTimes(2);
    expect(firstStatus).toMatchObject({ active: false, targetCount: 0 });
    expect(trailingStatus).toEqual(firstStatus);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('does not start monitoring while recovery has suspended refreshes', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    const { refreshAutoMonitor, resumeAutoMonitorRefresh, suspendAutoMonitorRefresh } =
      await import('../../src/background/autoMonitor');

    suspendAutoMonitorRefresh();
    await expect(refreshAutoMonitor()).resolves.toMatchObject({ active: false });

    expect(mocks.countOpenTargetTabs).not.toHaveBeenCalled();
    expect(mocks.ensureOffscreenDocument).not.toHaveBeenCalled();

    resumeAutoMonitorRefresh();
    await expect(refreshAutoMonitor()).resolves.toMatchObject({ active: true });
    expect(mocks.ensureOffscreenDocument).toHaveBeenCalledOnce();
  });

  it('stops a monitor start that becomes suspended while its response is pending', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    let resolveStart!: (result: { ok: true; active: true }) => void;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((message) => {
      if ((message as { type?: string }).type === 'OFFSCREEN_START_AUTO_MONITOR') {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    const { refreshAutoMonitor, suspendAutoMonitorRefresh } = await import('../../src/background/autoMonitor');

    const refresh = refreshAutoMonitor();
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'OFFSCREEN_START_AUTO_MONITOR' })
      )
    );
    suspendAutoMonitorRefresh();
    resolveStart({ ok: true, active: true });

    await expect(refresh).resolves.toMatchObject({ active: false });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
  });

  it('never sends START when recovery supersedes a pending offscreen ensure', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    let resolveEnsure!: () => void;
    mocks.ensureOffscreenDocument.mockReturnValue(
      new Promise((resolve) => {
        resolveEnsure = resolve;
      })
    );
    const { refreshAutoMonitor, resumeAutoMonitorRefresh, suspendAutoMonitorRefresh } =
      await import('../../src/background/autoMonitor');

    const refresh = refreshAutoMonitor();
    await vi.waitFor(() => expect(mocks.ensureOffscreenDocument).toHaveBeenCalledOnce());
    suspendAutoMonitorRefresh();
    resumeAutoMonitorRefresh();
    resolveEnsure();

    await expect(refresh).resolves.toMatchObject({ active: false });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OFFSCREEN_START_AUTO_MONITOR' })
    );
  });

  it('rejects a delivery when recovery starts before target mutation is dispatched', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    let resolveSelection!: (selection: { targetId: 'chatgpt'; tab: { id: number } }) => void;
    mocks.getBestOpenTargetTabForAuto.mockReturnValue(
      new Promise((resolve) => {
        resolveSelection = resolve;
      })
    );
    const { handleAutoClipboardImage, refreshAutoMonitor, resumeAutoMonitorRefresh, suspendAutoMonitorRefresh } =
      await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const delivery = handleAutoClipboardImage(image, 'fingerprint-recovery-race', 'delivery-recovery-race');
    await vi.waitFor(() => expect(mocks.getBestOpenTargetTabForAuto).toHaveBeenCalledOnce());
    suspendAutoMonitorRefresh();
    resumeAutoMonitorRefresh();
    resolveSelection({ targetId: 'chatgpt', tab: { id: 42 } });

    await expect(delivery).rejects.toThrow('AUTO_MONITOR_RECOVERY_PENDING');
    expect(mocks.executeAttachRuntime).not.toHaveBeenCalled();
  });

  it('continues processing after persistent dedupe storage fails', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    vi.mocked(chrome.storage.local.set)
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(undefined);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-two')).resolves.toBeUndefined();

    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
    expect(mocks.executeAttachRuntime).toHaveBeenNthCalledWith(
      1,
      42,
      expect.objectContaining({
        settings: expect.objectContaining({ allowClipboardPaste: false })
      })
    );
  });

  it('rejects delivery when the target selection disappears instead of acknowledging a lost image', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.getBestOpenTargetTabForAuto.mockResolvedValue(undefined);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one', 'delivery-one')).rejects.toThrow(
      'AUTO_TARGET_UNAVAILABLE'
    );
    expect(mocks.executeAttachRuntime).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('releases automatic delivery after settings preflight reaches its deadline', async () => {
    vi.useFakeTimers();
    mocks.countOpenTargetTabs.mockResolvedValue(1);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();
    mocks.getSettings.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true
    });

    const stalled = expect(handleAutoClipboardImage(image, 'fingerprint-one', 'delivery-one')).rejects.toThrow(
      'AUTO_SETTINGS_LOOKUP_TIMEOUT'
    );
    await vi.advanceTimersByTimeAsync(5000);

    await stalled;
    await expect(handleAutoClipboardImage(image, 'fingerprint-two', 'delivery-two')).resolves.toBeUndefined();
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
  });

  it('releases automatic delivery after target selection reaches its deadline', async () => {
    vi.useFakeTimers();
    mocks.countOpenTargetTabs.mockResolvedValue(1);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();
    mocks.getBestOpenTargetTabForAuto
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValue({ targetId: 'chatgpt', tab: { id: 42 } });

    const stalled = expect(handleAutoClipboardImage(image, 'fingerprint-one', 'delivery-one')).rejects.toThrow(
      'AUTO_TARGET_SELECTION_TIMEOUT'
    );
    await vi.advanceTimersByTimeAsync(5000);

    await stalled;
    await expect(handleAutoClipboardImage(image, 'fingerprint-two', 'delivery-two')).resolves.toBeUndefined();
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
  });

  it('releases the automatic queue when dedupe persistence never settles', async () => {
    vi.useFakeTimers();
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    vi.mocked(chrome.storage.local.set)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(undefined);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-two')).resolves.toBeUndefined();

    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('reasserts the latest dedupe state after an older timed-out write settles late', async () => {
    vi.useFakeTimers();
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    let persistedFingerprint: string | undefined;
    let finishFirstWrite!: () => void;
    let writeCount = 0;
    vi.mocked(chrome.storage.local.set).mockImplementation((items) => {
      writeCount += 1;
      const state = Object.values(items)[0] as { fingerprint: string };
      if (writeCount === 1) {
        return new Promise<void>((resolve) => {
          finishFirstWrite = () => {
            persistedFingerprint = state.fingerprint;
            resolve();
          };
        });
      }

      persistedFingerprint = state.fingerprint;
      return Promise.resolve();
    });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-two')).resolves.toBeUndefined();
    expect(persistedFingerprint).toBe('fingerprint-two');

    finishFirstWrite();
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(3));
    expect(persistedFingerprint).toBe('fingerprint-two');
  });

  it('reasserts the latest operation result after an older timed-out record settles late', async () => {
    vi.useFakeTimers();
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    let persistedAt: string | undefined;
    let finishFirstRecord!: () => void;
    let recordCount = 0;
    mocks.recordOperationResult.mockImplementation((result: { at: string }) => {
      recordCount += 1;
      if (recordCount === 1) {
        return new Promise<void>((resolve) => {
          finishFirstRecord = () => {
            persistedAt = result.at;
            resolve();
          };
        });
      }

      persistedAt = result.at;
      return Promise.resolve();
    });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.recordOperationResult).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-two')).resolves.toBeUndefined();
    const latestResult = mocks.recordOperationResult.mock.calls[1]?.[0] as { at: string };
    expect(persistedAt).toBe(latestResult.at);

    finishFirstRecord();
    await vi.waitFor(() => expect(mocks.recordOperationResult).toHaveBeenCalledTimes(3));
    expect(mocks.recordOperationResult).toHaveBeenLastCalledWith(latestResult);
    expect(persistedAt).toBe(latestResult.at);
  });

  it('retries a rejected fingerprint instead of treating it as handled', async () => {
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      showPageToast: false,
      writeBackOnFailure: true
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      outcome: 'rejected',
      error: 'ATTACH_REJECTED'
    });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).rejects.toThrow('ATTACH_REJECTED');
    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).rejects.toThrow('ATTACH_REJECTED');

    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge or deduplicate a request blocked by an earlier uncertain mutation', async () => {
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      showPageToast: false,
      writeBackOnFailure: false
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      outcome: 'unknown',
      error: 'PREVIOUS_OPERATION_UNCONFIRMED'
    });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).rejects.toThrow('PREVIOUS_OPERATION_UNCONFIRMED');
    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).rejects.toThrow('PREVIOUS_OPERATION_UNCONFIRMED');

    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(mocks.writeClipboardImage).not.toHaveBeenCalled();
    expect(mocks.recordOperationResult).not.toHaveBeenCalled();
  });

  it('acknowledges and deduplicates an unconfirmed mutation without retrying it', async () => {
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      showPageToast: false,
      writeBackOnFailure: false
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      method: 'paste-event',
      outcome: 'unknown',
      error: 'PASTE_EVENT_NO_PREVIEW'
    });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).resolves.toBeUndefined();

    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
    expect(mocks.writeClipboardImage).not.toHaveBeenCalled();
  });

  it('deduplicates a late retry by delivery id while allowing a new copy of the same image', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
    mocks.countOpenTargetTabs.mockResolvedValue(1);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await handleAutoClipboardImage(image, 'same-fingerprint', 'delivery-one');
    vi.setSystemTime(new Date('2026-07-10T00:01:01.500Z'));
    await handleAutoClipboardImage(image, 'same-fingerprint', 'delivery-one');
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();

    await handleAutoClipboardImage(image, 'same-fingerprint', 'delivery-two');
    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('falls back to in-memory dedupe when persistent dedupe lookup fails', async () => {
    const lookupError = new Error('storage unavailable');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    vi.mocked(chrome.storage.local.get).mockRejectedValue(lookupError);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).resolves.toBeUndefined();
    await expect(handleAutoClipboardImage(image, 'fingerprint-one')).resolves.toBeUndefined();

    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auto dedupe lookup failed'),
      expect.objectContaining({ message: 'auto dedupe lookup failed' })
    );
  });

  it('converges to disabled when monitor presence, stop, and dedupe cleanup all fail', async () => {
    const presenceError = new Error('offscreen state unavailable');
    const stopError = new Error('offscreen stop unavailable');
    const cleanupError = new Error('storage unavailable');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: false
    });
    mocks.hasOffscreenDocument.mockRejectedValue(presenceError);
    vi.mocked(chrome.storage.local.remove).mockRejectedValue(cleanupError);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
      if ((message as { type?: string }).type === 'OFFSCREEN_STOP_AUTO_MONITOR') {
        throw stopError;
      }
      return undefined;
    });

    const { refreshAutoMonitor } = await import('../../src/background/autoMonitor');

    await expect(refreshAutoMonitor()).resolves.toMatchObject({
      enabled: false,
      active: false,
      targetCount: 0
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OFFSCREEN_STOP_AUTO_MONITOR' });
    expect(chrome.storage.local.remove).toHaveBeenCalledOnce();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['autoDedupeState', 'autoMonitorBaselineFingerprint']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auto monitor presence check failed'),
      expect.objectContaining({ message: 'auto monitor presence check failed' })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auto monitor stop failed'),
      expect.objectContaining({ message: 'auto monitor stop failed' })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('auto dedupe cleanup failed'),
      expect.objectContaining({ message: 'auto dedupe cleanup failed' })
    );
  });

  it('resets a stalled offscreen monitor so disabling automatic mode always settles', async () => {
    vi.useFakeTimers();
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: false
    });
    mocks.hasOffscreenDocument.mockResolvedValue(true);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((message) => {
      if ((message as { type?: string }).type === 'OFFSCREEN_STOP_AUTO_MONITOR') {
        return new Promise(() => undefined);
      }
      return Promise.resolve(undefined);
    });

    const { refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    const refresh = refreshAutoMonitor();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(refresh).resolves.toMatchObject({ enabled: false, active: false });
    expect(mocks.resetOffscreenDocument).toHaveBeenCalledOnce();
  });

  it('keeps a queued request pending until its attachment finishes', async () => {
    let resolveFirstAttach!: (result: { ok: true; method: 'paste-event' }) => void;
    const firstAttach = new Promise<{ ok: true; method: 'paste-event' }>((resolve) => {
      resolveFirstAttach = resolve;
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime
      .mockReturnValueOnce(firstAttach)
      .mockResolvedValueOnce({ ok: true, method: 'paste-event' });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const second = handleAutoClipboardImage({ ...image, fileName: 'second.png' }, 'fingerprint-two');
    let secondSettled = false;
    void second.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      }
    );
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    resolveFirstAttach({ ok: true, method: 'paste-event' });

    await expect(first).resolves.toBeUndefined();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalledTimes(3));
    await expect(second).resolves.toBeUndefined();
    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('rejects the queued request that actually fails without rejecting the preceding request', async () => {
    let resolveFirstAttach!: (result: { ok: true; method: 'paste-event' }) => void;
    const firstAttach = new Promise<{ ok: true; method: 'paste-event' }>((resolve) => {
      resolveFirstAttach = resolve;
    });
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      showPageToast: false,
      writeBackOnFailure: false
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime
      .mockReturnValueOnce(firstAttach)
      .mockResolvedValueOnce({ ok: false, outcome: 'rejected', error: 'ATTACH_REJECTED' });

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const second = handleAutoClipboardImage({ ...image, fileName: 'second.png' }, 'fingerprint-two');
    const secondOutcome = second.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    resolveFirstAttach({ ok: true, method: 'paste-event' });

    await expect(first).resolves.toBeUndefined();
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2));
    await expect(secondOutcome).resolves.toMatchObject({ ok: false, error: expect.any(Error) });
  });

  it('processes only the latest queued image and settles all superseded request promises with it', async () => {
    let resolveFirstAttach!: (result: { ok: true; method: 'paste-event' }) => void;
    let resolveLatestAttach!: (result: { ok: true; method: 'paste-event' }) => void;
    const firstAttach = new Promise<{ ok: true; method: 'paste-event' }>((resolve) => {
      resolveFirstAttach = resolve;
    });
    const latestAttach = new Promise<{ ok: true; method: 'paste-event' }>((resolve) => {
      resolveLatestAttach = resolve;
    });
    const secondImage = { ...image, dataUrl: 'data:image/png;base64,c2Vjb25k', fileName: 'second.png' };
    const latestImage = { ...image, dataUrl: 'data:image/png;base64,bGF0ZXN0', fileName: 'latest.png' };
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockReturnValueOnce(firstAttach).mockReturnValueOnce(latestAttach);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const second = handleAutoClipboardImage(secondImage, 'fingerprint-two');
    const latest = handleAutoClipboardImage(latestImage, 'fingerprint-three');
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    let supersededSettled = false;
    void second.finally(() => {
      supersededSettled = true;
    });

    resolveFirstAttach({ ok: true, method: 'paste-event' });
    await expect(first).resolves.toBeUndefined();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2));

    expect(mocks.executeAttachRuntime).toHaveBeenLastCalledWith(42, expect.objectContaining({ image: latestImage }));
    expect(supersededSettled).toBe(false);
    resolveLatestAttach({ ok: true, method: 'paste-event' });

    await expect(Promise.all([second, latest])).resolves.toEqual([undefined, undefined]);
    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('coalesces an in-flight duplicate with the active attachment result', async () => {
    let resolveAttach!: (result: { ok: true; method: 'paste-event' }) => void;
    const attach = new Promise<{ ok: true; method: 'paste-event' }>((resolve) => {
      resolveAttach = resolve;
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockReturnValueOnce(attach);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const duplicate = handleAutoClipboardImage(image, 'fingerprint-one');
    let duplicateSettled = false;
    void duplicate.finally(() => {
      duplicateSettled = true;
    });
    await Promise.resolve();

    expect(duplicateSettled).toBe(false);
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();

    resolveAttach({ ok: true, method: 'paste-event' });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([undefined, undefined]);
  });

  it('coalesces the same fingerprint before asynchronous settings preflight finishes', async () => {
    mocks.countOpenTargetTabs.mockResolvedValue(1);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    let finishSettings!: () => void;
    mocks.getSettings.mockReset().mockReturnValue(
      new Promise((resolve) => {
        finishSettings = () =>
          resolve({
            ...DEFAULT_SETTINGS,
            autoAttachEnabled: true
          });
      })
    );

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    const duplicate = handleAutoClipboardImage(image, 'fingerprint-one');
    await Promise.resolve();

    expect(mocks.getSettings).toHaveBeenCalledOnce();
    expect(mocks.executeAttachRuntime).not.toHaveBeenCalled();

    finishSettings();
    await expect(Promise.all([first, duplicate])).resolves.toEqual([undefined, undefined]);
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
  });

  it('rejects every in-flight duplicate when the active attachment is rejected', async () => {
    let resolveAttach!: (result: { ok: false; outcome: 'rejected'; error: string }) => void;
    const attach = new Promise<{ ok: false; outcome: 'rejected'; error: string }>((resolve) => {
      resolveAttach = resolve;
    });
    mocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      showPageToast: false,
      writeBackOnFailure: false
    });
    mocks.countOpenTargetTabs.mockResolvedValue(1);
    mocks.executeAttachRuntime.mockReturnValueOnce(attach);

    const { handleAutoClipboardImage, refreshAutoMonitor } = await import('../../src/background/autoMonitor');
    await refreshAutoMonitor();

    const first = handleAutoClipboardImage(image, 'fingerprint-one');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const duplicate = handleAutoClipboardImage(image, 'fingerprint-one');
    const outcomes = Promise.allSettled([first, duplicate]);

    resolveAttach({ ok: false, outcome: 'rejected', error: 'ATTACH_REJECTED' });

    await expect(outcomes).resolves.toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: 'ATTACH_REJECTED' }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: 'ATTACH_REJECTED' }) })
    ]);
    expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce();
  });
});
