import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardImagePayload } from '../../src/clipboard/types';
import { attachToTarget, handleCommand, recordOperationResult } from '../../src/background/commandHandler';
import { LAST_OPERATION_KEY } from '../../src/shared/constants';
import type { OperationResult } from '../../src/shared/messages';

const mocks = vi.hoisted(() => ({
  executeAttachRuntime: vi.fn(),
  getOrCreateTargetTab: vi.fn(),
  readClipboardImage: vi.fn(),
  showToastOnActivePage: vi.fn(),
  showToastOnPage: vi.fn(),
  writeClipboardImage: vi.fn()
}));

vi.mock('../../src/clipboard/readClipboardImage', () => ({
  readClipboardImage: mocks.readClipboardImage
}));

vi.mock('../../src/clipboard/writeClipboardImage', () => ({
  writeClipboardImage: mocks.writeClipboardImage
}));

vi.mock('../../src/background/tabManager', () => ({
  executeAttachRuntime: mocks.executeAttachRuntime,
  getOrCreateTargetTab: mocks.getOrCreateTargetTab,
  showToastOnActivePage: mocks.showToastOnActivePage,
  showToastOnPage: mocks.showToastOnPage
}));

const image: ClipboardImagePayload = {
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  fileName: 'screenshot.png',
  lastModified: 123,
  mimeType: 'image/png',
  size: 5
};

function createOperationResult(targetId: 'chatgpt' | 'claude', ok: boolean): OperationResult {
  return {
    ok,
    targetId,
    targetName: targetId === 'chatgpt' ? 'ChatGPT' : 'Claude',
    message: `${targetId}-${ok ? 'success' : 'failure'}`,
    trigger: 'manual',
    at: new Date().toISOString()
  };
}

describe('command handler', () => {
  beforeEach(() => {
    mocks.executeAttachRuntime.mockReset();
    mocks.getOrCreateTargetTab.mockReset();
    mocks.readClipboardImage.mockReset();
    mocks.showToastOnActivePage.mockReset();
    mocks.showToastOnPage.mockReset();
    mocks.writeClipboardImage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes explicit commands to their targets', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({ ok: true, method: 'paste-event' });

    const result = await handleCommand('attach-to-claude');

    expect(result.ok).toBe(true);
    expect(result.targetId).toBe('claude');
    expect(mocks.getOrCreateTargetTab).toHaveBeenCalledWith(
      'claude',
      expect.objectContaining({ defaultTargetId: 'chatgpt' })
    );
    expect(mocks.executeAttachRuntime).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        settings: expect.objectContaining({ allowClipboardPaste: true })
      })
    );
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'OK' });
  });

  it('stops before tab work when the clipboard has no image', async () => {
    mocks.readClipboardImage.mockResolvedValue({
      ok: false,
      error: 'NO_IMAGE_IN_CLIPBOARD',
      message: '未检测到剪贴板图片，请先截图后再试。'
    });

    const result = await attachToTarget('chatgpt');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('NO_IMAGE_IN_CLIPBOARD');
    expect(mocks.getOrCreateTargetTab).not.toHaveBeenCalled();
    expect(mocks.showToastOnActivePage).toHaveBeenCalledWith('未检测到剪贴板图片，请先截图后再试。', 'error');
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
  });

  it('writes the image back to clipboard when automatic attach fails', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({ ok: false, error: 'AUTO_ATTACH_FAILED' });
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });

    const result = await attachToTarget('gemini');

    expect(result.ok).toBe(false);
    expect(result.method).toBe('clipboard-fallback');
    expect(mocks.writeClipboardImage).toHaveBeenCalledWith(image);
    expect(mocks.showToastOnPage).toHaveBeenCalledWith(
      42,
      '自动附加失败，已保留截图到剪贴板，请手动 Ctrl+V / Cmd+V。',
      'error'
    );
  });

  it('does not turn a successful attachment into a tab failure when feedback storage fails', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({ ok: true, method: 'paste-event', outcome: 'confirmed' });
    vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('storage unavailable'));

    await expect(attachToTarget('chatgpt')).resolves.toMatchObject({ ok: true, targetId: 'chatgpt' });
  });

  it('asks the user to inspect the composer before pasting after an unconfirmed mutation', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      method: 'paste-event',
      outcome: 'unknown',
      error: 'PASTE_EVENT_NO_PREVIEW'
    });
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });

    const result = await attachToTarget('chatgpt');

    expect(result.message).toContain('请先检查输入区');
    expect(mocks.writeClipboardImage).not.toHaveBeenCalled();
    expect(mocks.showToastOnPage).toHaveBeenCalledWith(42, expect.stringContaining('请先检查输入区'), 'error');
  });

  it('does not write back while a previous page mutation is still unconfirmed', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({
      ok: false,
      method: 'clipboard-fallback',
      outcome: 'rejected',
      error: 'PREVIOUS_OPERATION_UNCONFIRMED'
    });
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });

    const result = await attachToTarget('gemini');

    expect(result.message).toContain('请先检查输入区');
    expect(mocks.writeClipboardImage).not.toHaveBeenCalled();
    expect(mocks.showToastOnPage).toHaveBeenCalledWith(42, expect.stringContaining('请先检查输入区'), 'error');
  });

  it('captures each trigger immediately while serializing target-page mutations', async () => {
    const secondImage = { ...image, dataUrl: 'data:image/png;base64,c2Vjb25k', fileName: 'second.png' };
    mocks.readClipboardImage
      .mockResolvedValueOnce({ ok: true, image })
      .mockResolvedValueOnce({ ok: true, image: secondImage });
    mocks.getOrCreateTargetTab.mockResolvedValueOnce({ id: 41 }).mockResolvedValueOnce({ id: 42 });

    let resolveFirstAttach!: () => void;
    const firstAttach = new Promise<void>((resolve) => {
      resolveFirstAttach = resolve;
    });
    mocks.executeAttachRuntime
      .mockImplementationOnce(async () => {
        await firstAttach;
        return { ok: true, method: 'paste-event', outcome: 'confirmed' };
      })
      .mockResolvedValueOnce({ ok: true, method: 'paste-event', outcome: 'confirmed' });

    const first = attachToTarget('chatgpt');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    const second = attachToTarget('claude');
    await vi.waitFor(() => expect(mocks.readClipboardImage).toHaveBeenCalledTimes(2));

    expect(mocks.getOrCreateTargetTab).toHaveBeenCalledOnce();
    resolveFirstAttach();
    await first;
    await second;

    expect(mocks.getOrCreateTargetTab).toHaveBeenNthCalledWith(2, 'claude', expect.any(Object));
    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
    expect(mocks.executeAttachRuntime).toHaveBeenNthCalledWith(
      2,
      42,
      expect.objectContaining({ image: secondImage, targetId: 'claude' })
    );
  });

  it('consumes an early preparation rejection while another manual mutation is still queued', async () => {
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    let resolveFirstAttach!: () => void;
    const firstAttach = new Promise<void>((resolve) => {
      resolveFirstAttach = resolve;
    });
    mocks.executeAttachRuntime
      .mockImplementationOnce(async () => {
        await firstAttach;
        return { ok: true, method: 'paste-event', outcome: 'confirmed' };
      })
      .mockResolvedValue({ ok: true, method: 'paste-event', outcome: 'confirmed' });

    const first = attachToTarget('chatgpt');
    await vi.waitFor(() => expect(mocks.executeAttachRuntime).toHaveBeenCalledOnce());
    vi.mocked(chrome.storage.sync.get).mockRejectedValueOnce(new Error('settings unavailable'));
    const rejectedPreparation = attachToTarget('claude');
    await Promise.resolve();

    resolveFirstAttach();
    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(rejectedPreparation).rejects.toThrow('settings unavailable');
    await expect(attachToTarget('gemini')).resolves.toMatchObject({ ok: true, targetId: 'gemini' });
  });

  it('releases the manual queue when best-effort result storage never settles', async () => {
    vi.useFakeTimers();
    mocks.readClipboardImage.mockResolvedValue({ ok: true, image });
    mocks.getOrCreateTargetTab.mockResolvedValue({ id: 42 });
    mocks.executeAttachRuntime.mockResolvedValue({ ok: true, method: 'paste-event', outcome: 'confirmed' });
    vi.mocked(chrome.storage.local.set)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValue(undefined);

    const first = attachToTarget('chatgpt');
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledOnce());
    const second = attachToTarget('claude');
    await vi.waitFor(() => expect(mocks.readClipboardImage).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(5000);

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true, targetId: 'claude' });
    expect(mocks.executeAttachRuntime).toHaveBeenCalledTimes(2);
  });

  it('reconciles the latest operation after an older storage write settles late', async () => {
    vi.useFakeTimers();
    let resolveOldWrite!: () => void;
    const oldWrite = new Promise<void>((resolve) => {
      resolveOldWrite = resolve;
    });
    vi.mocked(chrome.storage.local.set).mockReturnValueOnce(oldWrite).mockResolvedValue(undefined);
    const oldResult = createOperationResult('chatgpt', false);
    const latestResult = createOperationResult('claude', true);

    const oldPersistence = recordOperationResult(oldResult);
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledOnce());
    const latestPersistence = recordOperationResult(latestResult);
    await latestPersistence;
    await vi.advanceTimersByTimeAsync(5000);
    await oldPersistence;

    resolveOldWrite();
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(3));

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ [LAST_OPERATION_KEY]: latestResult })
    );
  });

  it('reconciles the latest action feedback after an older badge update settles late', async () => {
    vi.useFakeTimers();
    let resolveOldBadge!: () => void;
    const oldBadge = new Promise<void>((resolve) => {
      resolveOldBadge = resolve;
    });
    vi.mocked(chrome.action.setBadgeText).mockReturnValueOnce(oldBadge).mockResolvedValue(undefined);
    const oldResult = createOperationResult('chatgpt', false);
    const latestResult = createOperationResult('claude', true);

    const oldFeedback = recordOperationResult(oldResult);
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!' }));
    const latestFeedback = recordOperationResult(latestResult);
    await latestFeedback;
    await vi.advanceTimersByTimeAsync(5000);
    await oldFeedback;

    resolveOldBadge();
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(3));

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'OK' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: '#059669' });
    expect(chrome.action.setTitle).toHaveBeenLastCalledWith({
      title: `AI Screenshot Attacher\n${latestResult.message}`
    });
  });
});
