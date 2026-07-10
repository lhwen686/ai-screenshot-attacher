import { describe, expect, it, vi } from 'vitest';
import { AI_TARGETS, TARGET_IDS } from '../../src/shared/constants';
import { DEFAULT_SETTINGS, getSettings, normalizeTargetId, saveSettings } from '../../src/shared/settings';

describe('settings', () => {
  it('normalizes unknown target ids to the default target', () => {
    expect(normalizeTargetId('claude')).toBe('claude');
    expect(normalizeTargetId('unknown')).toBe(DEFAULT_SETTINGS.defaultTargetId);
    expect(normalizeTargetId(undefined)).toBe(DEFAULT_SETTINGS.defaultTargetId);
  });

  it('returns defaults when storage is empty', async () => {
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('does not enable automatic mode from malformed synchronized values', async () => {
    await chrome.storage.sync.set({
      settings: {
        autoAttachEnabled: 'true',
        showPageToast: 0,
        writeBackOnFailure: true,
        openInNewTab: null,
        debugLogs: 1
      }
    });

    await expect(getSettings()).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      writeBackOnFailure: true
    });
  });

  it('saves partial settings while preserving defaults and normalizing target id', async () => {
    const next = await saveSettings({
      autoAttachEnabled: true,
      defaultTargetId: 'not-supported' as typeof DEFAULT_SETTINGS.defaultTargetId
    });

    expect(next).toEqual({
      ...DEFAULT_SETTINGS,
      autoAttachEnabled: true,
      defaultTargetId: DEFAULT_SETTINGS.defaultTargetId
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ settings: next });
  });

  it('allows each supported target to be saved as the default model', async () => {
    for (const targetId of TARGET_IDS) {
      const next = await saveSettings({ defaultTargetId: targetId });

      expect(next.defaultTargetId).toBe(targetId);
      expect(chrome.storage.sync.set).toHaveBeenLastCalledWith({ settings: next });
    }
  });

  it('serializes concurrent partial saves so a later setting cannot overwrite an earlier one', async () => {
    let stored: Record<string, unknown> = {};
    let finishFirstSave!: () => void;
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({ settings: stored }));
    vi.mocked(chrome.storage.sync.set)
      .mockImplementationOnce(
        (values) =>
          new Promise<void>((resolve) => {
            finishFirstSave = () => {
              stored = values.settings as Record<string, unknown>;
              resolve();
            };
          })
      )
      .mockImplementation(async (values) => {
        stored = values.settings as Record<string, unknown>;
      });

    const first = saveSettings({ autoAttachEnabled: true });
    await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalledOnce());
    const second = saveSettings({ showPageToast: false });
    await Promise.resolve();
    expect(chrome.storage.sync.set).toHaveBeenCalledOnce();

    finishFirstSave();
    await expect(first).resolves.toMatchObject({ autoAttachEnabled: true });
    await expect(second).resolves.toMatchObject({ autoAttachEnabled: true, showPageToast: false });
  });

  it('keeps target definitions aligned with target ids', () => {
    expect(Object.keys(AI_TARGETS).sort()).toEqual([...TARGET_IDS].sort());
  });
});
