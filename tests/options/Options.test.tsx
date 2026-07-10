import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('options UI', () => {
  it('renders settings and persists toggle changes', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/options/Options');

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: '启用自动粘贴模式' }));

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        settings: expect.objectContaining({ autoAttachEnabled: true })
      });
    });
  });

  it('persists default model changes from the four target choices', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/options/Options');

    expect(await screen.findByText('默认模型')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Gemini' }));

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        settings: expect.objectContaining({ defaultTargetId: 'gemini' })
      });
    });

    await userEvent.click(screen.getByRole('radio', { name: '豆包' }));

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        settings: expect.objectContaining({ defaultTargetId: 'doubao' })
      });
    });
  });

  it('opens privacy, shortcut, and feedback links', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/options/Options');

    await userEvent.click(await screen.findByRole('button', { name: '隐私政策' }));
    await userEvent.click(screen.getByRole('button', { name: '修改快捷键' }));
    await userEvent.click(screen.getByRole('button', { name: '反馈问题' }));

    await waitFor(() => {
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://lhwen686.github.io/ai-screenshot-attacher/privacy/'
      });
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/lhwen686/ai-screenshot-attacher/issues/new/choose'
      });
    });
  });

  it('shows a retry action when settings fail to load', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.mocked(chrome.storage.sync.get).mockRejectedValueOnce(new Error('settings unavailable')).mockResolvedValue({});

    await import('../../src/options/Options');

    expect(await screen.findByText('设置加载失败，请重试。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
  });

  it('shows a stable error when a setting cannot be saved', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/options/Options');
    const toggle = await screen.findByRole('checkbox', { name: '启用自动粘贴模式' });
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(new Error('storage unavailable'));
    await userEvent.click(toggle);

    expect(await screen.findByText('设置保存失败，请重试。')).toBeInTheDocument();
  });

  it('clears an older save error after the next queued setting is saved', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';

    await import('../../src/options/Options');
    const autoToggle = await screen.findByRole('checkbox', { name: '启用自动粘贴模式' });
    const toastToggle = screen.getByRole('checkbox', { name: '操作成功或失败后显示页面 Toast' });
    vi.mocked(chrome.storage.sync.set)
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(undefined);

    await userEvent.click(autoToggle);
    expect(await screen.findByText('设置保存失败，请重试。')).toBeInTheDocument();
    await userEvent.click(toastToggle);

    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
    expect(screen.queryByText('设置保存失败，请重试。')).not.toBeInTheDocument();
  });
});
