import { describe, expect, it } from 'vitest';
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

  it('keeps target definitions aligned with target ids', () => {
    expect(Object.keys(AI_TARGETS).sort()).toEqual([...TARGET_IDS].sort());
  });
});
