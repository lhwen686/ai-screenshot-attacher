import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('popup UI', () => {
  it('renders default state and sends attach messages', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
      if (message.type === 'GET_AUTO_MONITOR_STATUS') {
        return { active: false, enabled: false, message: '打开设置可启用自动粘贴', targetCount: 0 };
      }

      if (message.type === 'ATTACH_TO_TARGET') {
        return {
          at: new Date(0).toISOString(),
          message: '截图已附加，请自行输入问题并发送。',
          ok: true,
          targetId: message.targetId,
          targetName: 'Claude',
          trigger: 'manual'
        };
      }

      return undefined;
    });

    await import('../../src/popup/Popup');

    expect(await screen.findByRole('heading', { name: '附加剪贴板截图' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '附加到 Claude' }));

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: 'claude' });
    });
    expect(await screen.findByText('截图已附加，请自行输入问题并发送。')).toBeInTheDocument();
  });

  it('sends the same default target that is displayed on the primary action', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    await chrome.storage.sync.set({ settings: { defaultTargetId: 'doubao' } });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
      if (message.type === 'GET_AUTO_MONITOR_STATUS') {
        return { active: false, enabled: false, message: '打开设置可启用自动粘贴', targetCount: 0 };
      }

      if (message.type === 'ATTACH_TO_TARGET') {
        return {
          at: new Date(0).toISOString(),
          message: '截图已附加，请自行输入问题并发送。',
          ok: true,
          targetName: '豆包',
          trigger: 'manual'
        };
      }

      return undefined;
    });

    await import('../../src/popup/Popup');

    expect(await screen.findByText('默认模型')).toBeInTheDocument();
    expect(await screen.findByText('豆包')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '附加到默认模型（豆包）' }));

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: 'doubao' });
    });
  });

  it('keeps a pending synchronized refresh aligned with the displayed target', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    const pendingRefresh = deferred<Record<string, unknown>>();
    vi.mocked(chrome.storage.sync.get)
      .mockResolvedValueOnce({ settings: { defaultTargetId: 'chatgpt' } })
      .mockReturnValueOnce(pendingRefresh.promise);

    await import('../../src/popup/Popup');

    const primaryButton = await screen.findByRole('button', { name: '附加到默认模型（ChatGPT）' });
    await act(async () => {
      emitSyncStorageChange();
    });
    await waitFor(() => expect(chrome.storage.sync.get).toHaveBeenCalledTimes(2));
    await userEvent.click(primaryButton);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: 'chatgpt' });
    await act(async () => {
      pendingRefresh.resolve({ settings: { defaultTargetId: 'doubao' } });
    });
  });

  it('ignores an older synchronized refresh that resolves after a newer one', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    const olderRefresh = deferred<Record<string, unknown>>();
    const newerRefresh = deferred<Record<string, unknown>>();
    vi.mocked(chrome.storage.sync.get)
      .mockResolvedValueOnce({ settings: { defaultTargetId: 'chatgpt' } })
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise);

    await import('../../src/popup/Popup');

    expect(await screen.findByRole('button', { name: '附加到默认模型（ChatGPT）' })).toBeEnabled();
    await act(async () => {
      emitSyncStorageChange();
      emitSyncStorageChange();
    });
    await waitFor(() => expect(chrome.storage.sync.get).toHaveBeenCalledTimes(3));
    await act(async () => {
      newerRefresh.resolve({ settings: { defaultTargetId: 'claude' } });
    });
    const primaryButton = await screen.findByRole('button', { name: '附加到默认模型（Claude）' });
    await act(async () => {
      olderRefresh.resolve({ settings: { defaultTargetId: 'doubao' } });
    });

    expect(screen.queryByRole('button', { name: '附加到默认模型（豆包）' })).not.toBeInTheDocument();
    await userEvent.click(primaryButton);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: 'claude' });
  });

  it('keeps the displayed target actionable when a synchronized refresh fails', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.storage.sync.get)
      .mockResolvedValueOnce({ settings: { defaultTargetId: 'chatgpt' } })
      .mockRejectedValueOnce(new Error('settings refresh unavailable'));

    await import('../../src/popup/Popup');

    const primaryButton = await screen.findByRole('button', { name: '附加到默认模型（ChatGPT）' });
    await act(async () => {
      emitSyncStorageChange();
    });
    await waitFor(() => expect(chrome.storage.sync.get).toHaveBeenCalledTimes(2));
    expect(primaryButton).toBeEnabled();
    await userEvent.click(primaryButton);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: 'chatgpt' });
  });

  it('disables the default action until its displayed target has loaded', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.storage.sync.get).mockReturnValue(new Promise(() => undefined));

    await import('../../src/popup/Popup');

    expect(await screen.findByRole('button', { name: '正在加载默认模型...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '附加到 Claude' })).toBeEnabled();
  });

  it('shows a disabled error state when the default target cannot be loaded', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.storage.sync.get).mockRejectedValue(new Error('settings unavailable'));

    await import('../../src/popup/Popup');

    expect(await screen.findByText('加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '默认模型加载失败' })).toBeDisabled();
  });

  it('opens public help links from the popup footer', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/popup/Popup');

    await userEvent.click(await screen.findByRole('button', { name: '反馈' }));

    await waitFor(() => {
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/lhwen686/ai-screenshot-attacher/issues/new/choose'
      });
    });
  });

  it('shows a stable error and re-enables controls when the service worker is unavailable', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('service worker unavailable'));

    await import('../../src/popup/Popup');
    const claudeButton = await screen.findByRole('button', { name: '附加到 Claude' });
    await userEvent.click(claudeButton);

    expect(await screen.findByText('插件后台暂不可用，请稍后重试。')).toBeInTheDocument();
    expect(claudeButton).toBeEnabled();
  });
});

function emitSyncStorageChange(): void {
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
  if (!listener) {
    throw new Error('Expected popup to register a storage change listener');
  }
  listener({}, 'sync');
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
