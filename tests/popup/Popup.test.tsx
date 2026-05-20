import { screen, waitFor } from '@testing-library/react';
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

  it('shows the configured default model and keeps the primary action target implicit', async () => {
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
    expect(screen.getByText('豆包')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '附加到默认模型' }));

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ATTACH_TO_TARGET', targetId: undefined });
    });
  });
});
