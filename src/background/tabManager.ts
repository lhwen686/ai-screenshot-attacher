import { ATTACH_RUNTIME_FILE, AI_TARGETS, TARGET_IDS, USER_MESSAGES, type TargetId } from '../shared/constants';
import type { AppSettings } from '../shared/settings';
import type { AttachResult } from '../adapters/types';
import type { AttachRuntimePayload } from '../shared/messages';
import { logger } from '../shared/logger';

const TAB_LOAD_TIMEOUT_MS = 30000;
const TARGET_WINDOW_TYPES = ['normal', 'popup', 'app'] as const;

interface TargetTabCandidate {
  targetId: TargetId;
  tab: chrome.tabs.Tab;
  window: chrome.windows.Window;
  score: number;
}

export interface OpenTargetTabSelection {
  targetId: TargetId;
  tab: chrome.tabs.Tab;
}

export async function getOrCreateTargetTab(targetId: TargetId, settings: AppSettings): Promise<chrome.tabs.Tab> {
  const target = AI_TARGETS[targetId];
  const existingTab = await findExistingTargetTab(targetId);

  if (existingTab?.id !== undefined) {
    await activateTab(existingTab);
    await waitForTabComplete(existingTab.id, TAB_LOAD_TIMEOUT_MS);
    return (await chrome.tabs.get(existingTab.id)) as chrome.tabs.Tab;
  }

  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = activeTabs[0];

  if (!settings.openInNewTab && activeTab?.id !== undefined) {
    const updated = await chrome.tabs.update(activeTab.id, {
      active: true,
      url: target.defaultUrl
    });
    if (!updated?.id) {
      throw new Error('TARGET_TAB_FAILED');
    }
    await waitForTabComplete(updated.id, TAB_LOAD_TIMEOUT_MS);
    return (await chrome.tabs.get(updated.id)) as chrome.tabs.Tab;
  }

  const created = await chrome.tabs.create({
    active: true,
    url: target.defaultUrl
  });
  if (!created.id) {
    throw new Error('TARGET_TAB_FAILED');
  }
  await waitForTabComplete(created.id, TAB_LOAD_TIMEOUT_MS);
  return (await chrome.tabs.get(created.id)) as chrome.tabs.Tab;
}

async function findExistingTargetTab(targetId: TargetId): Promise<chrome.tabs.Tab | undefined> {
  const candidates = await collectTargetCandidates(targetId);

  if (candidates.length === 0) {
    const target = AI_TARGETS[targetId];
    const tabs = await chrome.tabs.query({ url: target.urlPatterns });
    return tabs.find((tab) => tab.id !== undefined);
  }

  candidates.sort((left, right) => right.score - left.score);
  logger.debug('target tab candidates', {
    targetId,
    count: candidates.length,
    selectedWindowType: candidates[0]?.window.type,
    selectedTabId: candidates[0]?.tab.id
  });

  return candidates[0]?.tab;
}

export async function getBestOpenTargetTabForAuto(): Promise<OpenTargetTabSelection | undefined> {
  const candidates = await collectTargetCandidates();
  if (candidates.length > 0) {
    candidates.sort((left, right) => right.score - left.score);
    return {
      targetId: candidates[0].targetId,
      tab: candidates[0].tab
    };
  }

  for (const targetId of TARGET_IDS) {
    const target = AI_TARGETS[targetId];
    const tabs = await chrome.tabs.query({ url: target.urlPatterns });
    const tab = tabs.find((candidate) => candidate.id !== undefined);
    if (tab) {
      return { targetId, tab };
    }
  }

  return undefined;
}

export async function countOpenTargetTabs(): Promise<number> {
  const candidates = await collectTargetCandidates();
  if (candidates.length > 0) {
    return new Set(candidates.map((candidate) => candidate.tab.id)).size;
  }

  const tabs = await chrome.tabs.query({
    url: TARGET_IDS.flatMap((targetId) => AI_TARGETS[targetId].urlPatterns)
  });

  return tabs.filter((tab) => tab.id !== undefined).length;
}

async function collectTargetCandidates(targetId?: TargetId): Promise<TargetTabCandidate[]> {
  const candidates: TargetTabCandidate[] = [];
  const targetIds = targetId ? [targetId] : TARGET_IDS;

  for (const windowType of TARGET_WINDOW_TYPES) {
    const windows = await getWindowsByType(windowType);

    for (const chromeWindow of windows) {
      for (const tab of chromeWindow.tabs ?? []) {
        for (const candidateTargetId of targetIds) {
          const target = AI_TARGETS[candidateTargetId];
          if (tab.id === undefined || !isTargetUrl(tab.url ?? tab.pendingUrl, target.hostnames)) {
            continue;
          }

          candidates.push({
            targetId: candidateTargetId,
            tab,
            window: chromeWindow,
            score: scoreCandidate(tab, chromeWindow)
          });
        }
      }
    }
  }

  return candidates;
}

async function getWindowsByType(windowType: (typeof TARGET_WINDOW_TYPES)[number]): Promise<chrome.windows.Window[]> {
  try {
    return await chrome.windows.getAll({
      populate: true,
      windowTypes: [windowType]
    });
  } catch (error) {
    logger.debug('window type query failed', { windowType, error });
    return [];
  }
}

function isTargetUrl(rawUrl: string | undefined, hostnames: string[]): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && hostnames.includes(url.hostname);
  } catch {
    return false;
  }
}

function scoreCandidate(tab: chrome.tabs.Tab, chromeWindow: chrome.windows.Window): number {
  let score = 0;

  if (chromeWindow.focused && tab.active) {
    score += 1000;
  }

  if (chromeWindow.type === 'app' || chromeWindow.type === 'popup') {
    score += 100;
  }

  if (chromeWindow.focused) {
    score += 50;
  }

  if (tab.active) {
    score += 25;
  }

  if (tab.status === 'complete') {
    score += 2;
  }

  return score;
}

export async function executeAttachRuntime(tabId: number, payload: AttachRuntimePayload): Promise<AttachResult> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [ATTACH_RUNTIME_FILE]
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [payload],
      func: async (runtimePayload: AttachRuntimePayload) => {
        const runtime = window.__AI_SCREENSHOT_ATTACHER__;
        if (!runtime) {
          return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
        }
        return runtime.run(runtimePayload);
      }
    });

    return (
      (results[0]?.result as AttachResult | undefined) ?? {
        ok: false,
        method: 'clipboard-fallback',
        error: 'SCRIPT_INJECTION_FAILED'
      }
    );
  } catch (error) {
    logger.error('script injection failed', { error });
    return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
  }
}

export async function showToastOnPage(tabId: number, message: string, variant: 'success' | 'warning' | 'error' | 'info'): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [message, variant],
      func: (toastMessage: string, toastVariant: 'success' | 'warning' | 'error' | 'info') => {
        const id = 'ai-screenshot-attacher-toast';
        document.getElementById(id)?.remove();
        const toast = document.createElement('div');
        toast.id = id;
        toast.textContent = toastMessage;
        toast.setAttribute('role', 'status');
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '2147483647';
        toast.style.maxWidth = '360px';
        toast.style.padding = '12px 14px';
        toast.style.borderRadius = '8px';
        toast.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        toast.style.fontSize = '14px';
        toast.style.lineHeight = '1.45';
        toast.style.boxShadow = '0 16px 38px rgba(15, 23, 42, 0.18)';
        toast.style.color = '#0f172a';
        toast.style.border = '1px solid rgba(15, 23, 42, 0.12)';
        toast.style.background =
          toastVariant === 'success'
            ? '#ecfdf5'
            : toastVariant === 'warning'
              ? '#fffbeb'
              : toastVariant === 'error'
                ? '#fef2f2'
                : '#f8fafc';
        document.documentElement.appendChild(toast);
        window.setTimeout(() => toast.remove(), toastVariant === 'error' ? 7000 : 4500);
      }
    });
  } catch (error) {
    logger.warn('page toast failed', { error });
  }
}

export async function showToastOnActivePage(message: string, variant: 'success' | 'warning' | 'error' | 'info'): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    return;
  }

  await showToastOnPage(tab.id, message, variant);
}

async function activateTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  if (tab.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
  }
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(USER_MESSAGES.targetLoadFailed));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        globalThis.clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}
