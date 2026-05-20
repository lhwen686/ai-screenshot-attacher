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
});
