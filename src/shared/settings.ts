import { type TargetId, TARGET_IDS } from './constants';
import { createSerialQueue } from './serialQueue';

const SETTINGS_KEY = 'settings';
const runSettingsSave = createSerialQueue();

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
    defaultTargetId: normalizeTargetId(settings?.defaultTargetId),
    autoAttachEnabled: normalizeBoolean(settings?.autoAttachEnabled, DEFAULT_SETTINGS.autoAttachEnabled),
    showPageToast: normalizeBoolean(settings?.showPageToast, DEFAULT_SETTINGS.showPageToast),
    writeBackOnFailure: normalizeBoolean(settings?.writeBackOnFailure, DEFAULT_SETTINGS.writeBackOnFailure),
    openInNewTab: normalizeBoolean(settings?.openInNewTab, DEFAULT_SETTINGS.openInNewTab),
    debugLogs: normalizeBoolean(settings?.debugLogs, DEFAULT_SETTINGS.debugLogs)
  };
}

export function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return runSettingsSave(() => saveSettingsUnlocked(partial));
}

async function saveSettingsUnlocked(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    defaultTargetId: normalizeTargetId(partial.defaultTargetId ?? current.defaultTargetId),
    autoAttachEnabled: normalizeBoolean(partial.autoAttachEnabled, current.autoAttachEnabled),
    showPageToast: normalizeBoolean(partial.showPageToast, current.showPageToast),
    writeBackOnFailure: normalizeBoolean(partial.writeBackOnFailure, current.writeBackOnFailure),
    openInNewTab: normalizeBoolean(partial.openInNewTab, current.openInNewTab),
    debugLogs: normalizeBoolean(partial.debugLogs, current.debugLogs)
  };

  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
