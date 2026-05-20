import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardImagePayload } from '../../src/clipboard/types';
import { attachToTarget, handleCommand } from '../../src/background/commandHandler';

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

describe('command handler', () => {
  beforeEach(() => {
    mocks.executeAttachRuntime.mockReset();
    mocks.getOrCreateTargetTab.mockReset();
    mocks.readClipboardImage.mockReset();
    mocks.showToastOnActivePage.mockReset();
    mocks.showToastOnPage.mockReset();
    mocks.writeClipboardImage.mockReset();
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
});
