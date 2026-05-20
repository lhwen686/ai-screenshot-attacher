import { ATTACH_RUNTIME_FILE, AI_TARGETS, TARGET_IDS, type TargetId } from '../shared/constants';
import type { AppSettings } from '../shared/settings';
import type { AttachResult } from '../adapters/types';
import type { AttachRuntimePayload } from '../shared/messages';
import { logger } from '../shared/logger';

const TARGET_DOCUMENT_TIMEOUT_MS = 15000;
const SCRIPT_INJECTION_RETRY_INTERVAL_MS = 100;
const TARGET_WINDOW_TYPES = ['normal', 'popup', 'app'] as const;
type ScriptExecutionWorld = 'ISOLATED' | 'MAIN';

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
    return updated;
  }

  const created = await chrome.tabs.create({
    active: true,
    url: target.defaultUrl
  });
  if (!created.id) {
    throw new Error('TARGET_TAB_FAILED');
  }
  return created;
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
    const targetReady = await waitForTargetDocument(tabId, payload.targetId, TARGET_DOCUMENT_TIMEOUT_MS);
    if (!targetReady) {
      return { ok: false, method: 'clipboard-fallback', error: 'TARGET_NOT_READY' };
    }

    if (payload.targetId === 'gemini') {
      const clipboardPasteResult = await executeGeminiClipboardPasteRuntime(tabId);
      if (clipboardPasteResult.ok) {
        return clipboardPasteResult;
      }
    }

    const world = getAttachRuntimeWorld(payload.targetId);
    const injected = await injectAttachRuntimeWithRetry(tabId, payload.targetId, world, TARGET_DOCUMENT_TIMEOUT_MS);
    if (!injected) {
      return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [payload],
      world,
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

async function executeGeminiClipboardPasteRuntime(tabId: number): Promise<AttachResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      args: [TARGET_DOCUMENT_TIMEOUT_MS],
      func: async (inputTimeoutMs: number) => {
        const inputSelectors = [
          '.ql-editor.textarea.new-input-ui',
          '.ql-editor[contenteditable="true"]',
          '[aria-label="为 Gemini 输入提示"]',
          '[aria-label*="Gemini" i][contenteditable="true"]',
          '[aria-label*="prompt" i][contenteditable="true"]',
          'main [contenteditable]:not([contenteditable="false"])',
          '[role="textbox"]'
        ];
        const previewSelectors = [
          'file-preview',
          'image-preview',
          'upload-image',
          'mat-chip',
          'img[src^="blob:"]',
          '[class*="image-preview" i]',
          '[class*="file-preview" i]',
          '[class*="upload" i]',
          '[class*="attachment" i]',
          '[aria-label*="attached" i]',
          '[aria-label*="uploaded" i]',
          '[aria-label*="remove" i]',
          'mat-progress-spinner',
          'mat-spinner'
        ];
        const progressPatterns = [/uploading/i, /processing/i, /attached/i, /上传中/, /正在上传/, /处理中/, /已附加/];

        const isVisible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const queryVisible = (selectors: string[]) => {
          for (const selector of selectors) {
            try {
              const match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible);
              if (match) {
                return match;
              }
            } catch {
              continue;
            }
          }
          return undefined;
        };
        const snapshot = () => {
          const elements = new Set<Element>();
          for (const selector of previewSelectors) {
            try {
              document.querySelectorAll(selector).forEach((element) => {
                if (isVisible(element)) {
                  elements.add(element);
                }
              });
            } catch {
              continue;
            }
          }
          return {
            count: elements.size,
            imageCount: document.querySelectorAll('img, image-preview, file-preview, upload-image').length,
            text: document.body?.innerText ?? ''
          };
        };
        const focusEditable = (target: HTMLElement) => {
          target.focus({ preventScroll: false });
          if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
            target.setSelectionRange(target.value.length, target.value.length);
            return;
          }
          if (!target.isContentEditable) {
            return;
          }
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        };

        const waitForInput = async () => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < inputTimeoutMs) {
            const target = queryVisible(inputSelectors);
            if (target) {
              return target;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 100));
          }
          return undefined;
        };

        const target = await waitForInput();
        if (!target) {
          return { ok: false, method: 'paste-command', error: 'INPUT_NOT_FOUND' };
        }

        const before = snapshot();
        focusEditable(target);
        await new Promise((resolve) => window.setTimeout(resolve, 100));

        let didPaste = false;
        try {
          didPaste = document.execCommand('paste');
        } catch {
          return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_FAILED' };
        }

        if (!didPaste) {
          return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_REJECTED' };
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < 4500) {
          const current = snapshot();
          const textDelta = current.text.slice(Math.min(before.text.length, current.text.length));
          if (current.count > before.count || current.imageCount > before.imageCount) {
            return { ok: true, method: 'paste-command' };
          }
          if (progressPatterns.some((pattern) => pattern.test(current.text) || pattern.test(textDelta))) {
            return { ok: true, method: 'paste-command' };
          }
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_NO_PREVIEW' };
      }
    });

    return (
      (results[0]?.result as AttachResult | undefined) ?? {
        ok: false,
        method: 'paste-command',
        error: 'PASTE_COMMAND_FAILED'
      }
    );
  } catch (error) {
    logger.debug('Gemini clipboard paste runtime failed', { error });
    return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_FAILED' };
  }
}

function getAttachRuntimeWorld(targetId: TargetId): ScriptExecutionWorld {
  return targetId === 'gemini' ? 'MAIN' : 'ISOLATED';
}

async function injectAttachRuntimeWithRetry(
  tabId: number,
  targetId: TargetId,
  world: ScriptExecutionWorld,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    const tab = await getTabSafely(tabId);
    if (!isTargetUrl(tab?.url, AI_TARGETS[targetId].hostnames)) {
      await sleep(SCRIPT_INJECTION_RETRY_INTERVAL_MS);
      continue;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world,
        files: [ATTACH_RUNTIME_FILE]
      });
      return true;
    } catch (error) {
      lastError = error;
      await sleep(SCRIPT_INJECTION_RETRY_INTERVAL_MS);
    }
  }

  logger.warn('attach runtime injection retries exhausted', { tabId, targetId, error: lastError });
  return false;
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

async function waitForTargetDocument(tabId: number, targetId: TargetId, timeoutMs: number): Promise<boolean> {
  const target = AI_TARGETS[targetId];
  const currentTab = await getTabSafely(tabId);
  if (isTargetUrl(currentTab?.url, target.hostnames)) {
    return true;
  }

  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: { url?: string }, tab: chrome.tabs.Tab) => {
      if (updatedTabId === tabId && isTargetUrl(changeInfo.url ?? tab.url, target.hostnames)) {
        globalThis.clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getTabSafely(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
