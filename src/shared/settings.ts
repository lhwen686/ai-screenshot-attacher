import { type TargetId, TARGET_IDS } from './constants';

const SETTINGS_KEY = 'settings';

export interface AppSettings {
  defaultTargetId: TargetId;
  autoAttachEnabled: boolean;
  showPageToast: boolean;
  writeBackOnFailure: boolean;
  openInNewTab: boolean;
  debugLogs: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTargetId: 'chatgpt',
  autoAttachEnabled: false,
  showPageToast: true,
  writeBackOnFailure: true,
  openInNewTab: true,
  debugLogs: false
};

export function normalizeTargetId(value: unknown): TargetId {
  return TARGET_IDS.includes(value as TargetId) ? (value as TargetId) : DEFAULT_SETTINGS.defaultTargetId;
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as Partial<AppSettings> | undefined;

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    defaultTargetId: normalizeTargetId(settings?.defaultTargetId)
  };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...partial,
    defaultTargetId: normalizeTargetId(partial.defaultTargetId ?? current.defaultTargetId)
  };

  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}
