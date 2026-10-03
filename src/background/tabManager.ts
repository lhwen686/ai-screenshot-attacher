import { ATTACH_RUNTIME_FILE, AI_TARGETS, TARGET_IDS, isTargetUrl, type TargetId } from '../shared/constants';
import type { AppSettings } from '../shared/settings';
import type { AttachResult } from '../adapters/types';
import type { AttachRuntimePayload } from '../shared/messages';
import { logger } from '../shared/logger';
import { createSerialQueue } from '../shared/serialQueue';
import { withTimeout } from '../shared/withTimeout';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import { showToast, type ToastVariant } from '../content/toast';
import {
  runWithClipboardOperationLock,
  type DeferClipboardOperationRelease
} from '../clipboard/clipboardOperationLock';

const TARGET_DOCUMENT_TIMEOUT_MS = 15000;
const TAB_READ_TIMEOUT_MS = 5000;
const TAB_FOCUS_TIMEOUT_MS = 5000;
const TAB_NAVIGATION_TIMEOUT_MS = 15000;
const SCRIPT_EXECUTION_TIMEOUT_MS = 30000;
const SCRIPT_INJECTION_RETRY_INTERVAL_MS = 100;
const ACTIVE_TAB_RESERVATION_TTL_MS = 120000;
const TARGET_WINDOW_TYPES = ['normal', 'popup', 'app'] as const;
const targetTabAcquisitions = new Map<TargetId, Promise<chrome.tabs.Tab>>();
const activeTargetTabReservations = new Map<number, { targetId: TargetId; expiresAt: number }>();
const busyTabTargets = new Map<number, { targetId: TargetId; count: number }>();
const uncertainTabNavigations = new Map<number, Promise<void>>();
const uncertainTabMutations = new Map<number, Promise<void>>();
const attachRuntimeQueues = new Map<number, Promise<void>>();
const pendingAttachOperations = new Map<number, Map<string, Promise<AttachResult>>>();
const runWithActiveTabReuseAcquisition = createSerialQueue();
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

export function getOrCreateTargetTab(targetId: TargetId, settings: AppSettings): Promise<chrome.tabs.Tab> {
  const existingAcquisition = targetTabAcquisitions.get(targetId);
  if (existingAcquisition) {
    return existingAcquisition;
  }

  const acquisition = settings.openInNewTab
    ? getOrCreateTargetTabUnlocked(targetId, settings)
    : runWithActiveTabReuseAcquisition(() => getOrCreateTargetTabUnlocked(targetId, settings));
  targetTabAcquisitions.set(targetId, acquisition);
  const clearAcquisition = () => {
    if (targetTabAcquisitions.get(targetId) === acquisition) {
      targetTabAcquisitions.delete(targetId);
    }
  };
  void acquisition.then(clearAcquisition, clearAcquisition);
  return acquisition;
}

async function getOrCreateTargetTabUnlocked(targetId: TargetId, settings: AppSettings): Promise<chrome.tabs.Tab> {
  const target = AI_TARGETS[targetId];
  const existingTab = await findExistingTargetTab(targetId);

  if (existingTab?.id !== undefined) {
    await activateTab(existingTab);
    const latestTab = await getTabSafely(existingTab.id);
    if (!latestTab) {
      throw new Error('TARGET_TAB_FAILED');
    }
    reserveTargetTabForAttachment(latestTab, targetId, settings);
    return latestTab;
  }

  const activeTabs = await withTimeout(
    chrome.tabs.query({ active: true, currentWindow: true }),
    TAB_READ_TIMEOUT_MS,
    'TAB_QUERY_TIMEOUT'
  );
  const activeTab = activeTabs[0];

  if (!settings.openInNewTab && activeTab?.id !== undefined && !isTabUnavailableForReuse(activeTab.id, targetId)) {
    reserveTargetTabForAttachment(activeTab, targetId, settings);
    try {
      const navigation = chrome.tabs.update(activeTab.id, {
        active: true,
        url: target.defaultUrl
      });
      const updated = await waitForTabNavigation(activeTab.id, navigation);
      if (!updated?.id) {
        throw new Error('TARGET_TAB_FAILED');
      }
      return updated;
    } catch (error) {
      releaseTargetTabReservation(activeTab.id, targetId);
      throw error;
    }
  }

  const created = await withTimeout(
    chrome.tabs.create({
      active: true,
      url: target.defaultUrl
    }),
    TAB_NAVIGATION_TIMEOUT_MS,
    'TARGET_TAB_MUTATION_TIMEOUT'
  );
  if (!created.id) {
    throw new Error('TARGET_TAB_FAILED');
  }
  reserveTargetTabForAttachment(created, targetId, settings);
  return created;
}

function reserveTargetTabForAttachment(tab: chrome.tabs.Tab, targetId: TargetId, settings: AppSettings): void {
  if (settings.openInNewTab || tab.id === undefined) {
    return;
  }

  activeTargetTabReservations.set(tab.id, {
    targetId,
    expiresAt: Date.now() + ACTIVE_TAB_RESERVATION_TTL_MS
  });
}

function isTabUnavailableForReuse(tabId: number, targetId: TargetId): boolean {
  if (uncertainTabNavigations.has(tabId) || uncertainTabMutations.has(tabId)) {
    return true;
  }

  const busyTarget = busyTabTargets.get(tabId);
  if (busyTarget && busyTarget.targetId !== targetId) {
    return true;
  }

  const reservation = activeTargetTabReservations.get(tabId);
  if (!reservation) {
    return false;
  }
  if (reservation.expiresAt <= Date.now()) {
    activeTargetTabReservations.delete(tabId);
    return false;
  }
  return reservation.targetId !== targetId;
}

function releaseTargetTabReservation(tabId: number, targetId: TargetId): void {
  if (activeTargetTabReservations.get(tabId)?.targetId === targetId) {
    activeTargetTabReservations.delete(tabId);
  }
}

async function findExistingTargetTab(targetId: TargetId): Promise<chrome.tabs.Tab | undefined> {
  const candidates = await collectTargetCandidates(targetId);

  if (candidates.length === 0) {
    const target = AI_TARGETS[targetId];
    const tabs = await withTimeout(
      chrome.tabs.query({ url: target.urlPatterns }),
      TAB_READ_TIMEOUT_MS,
      'TAB_QUERY_TIMEOUT'
    );
    return tabs.find(
      (tab) =>
        tab.id !== undefined &&
        !uncertainTabNavigations.has(tab.id) &&
        isTargetUrl(tab.pendingUrl ?? tab.url, target.hostnames)
    );
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
    const tabs = await withTimeout(
      chrome.tabs.query({ url: target.urlPatterns }),
      TAB_READ_TIMEOUT_MS,
      'TAB_QUERY_TIMEOUT'
    );
    const tab = tabs.find(
      (candidate) =>
        candidate.id !== undefined &&
        !uncertainTabNavigations.has(candidate.id) &&
        !uncertainTabMutations.has(candidate.id) &&
        isTargetUrl(candidate.pendingUrl ?? candidate.url, target.hostnames)
    );
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

  const tabs = await withTimeout(
    chrome.tabs.query({
      url: TARGET_IDS.flatMap((targetId) => AI_TARGETS[targetId].urlPatterns)
    }),
    TAB_READ_TIMEOUT_MS,
    'TAB_QUERY_TIMEOUT'
  );

  return tabs.filter(
    (tab) =>
      tab.id !== undefined &&
      !uncertainTabNavigations.has(tab.id) &&
      TARGET_IDS.some((targetId) => isTargetUrl(tab.pendingUrl ?? tab.url, AI_TARGETS[targetId].hostnames))
  ).length;
}

async function collectTargetCandidates(targetId?: TargetId): Promise<TargetTabCandidate[]> {
  const candidates: TargetTabCandidate[] = [];
  const targetIds = targetId ? [targetId] : TARGET_IDS;
  const windowGroups = await Promise.all(TARGET_WINDOW_TYPES.map((windowType) => getWindowsByType(windowType)));

  for (const windows of windowGroups) {
    for (const chromeWindow of windows) {
      for (const tab of chromeWindow.tabs ?? []) {
        for (const candidateTargetId of targetIds) {
          const target = AI_TARGETS[candidateTargetId];
          if (
            tab.id === undefined ||
            uncertainTabNavigations.has(tab.id) ||
            (targetId === undefined && uncertainTabMutations.has(tab.id)) ||
            !isTargetUrl(tab.pendingUrl ?? tab.url, target.hostnames)
          ) {
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
    return await withTimeout(
      chrome.windows.getAll({
        populate: true,
        windowTypes: [windowType]
      }),
      TAB_READ_TIMEOUT_MS,
      'WINDOW_QUERY_TIMEOUT'
    );
  } catch (error) {
    logger.debug('window type query failed', { windowType, error });
    throw error;
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

export function executeAttachRuntime(tabId: number, payload: AttachRuntimePayload): Promise<AttachResult> {
  const uncertainResult = getUncertainTabMutationResult(tabId);
  if (uncertainResult) {
    return Promise.resolve(uncertainResult);
  }

  const operationKey = getAttachOperationKey(payload);
  const pendingForTab = pendingAttachOperations.get(tabId) ?? new Map<string, Promise<AttachResult>>();
  const existingOperation = pendingForTab.get(operationKey);
  if (existingOperation) {
    return existingOperation;
  }

  if (!acquireBusyTabTarget(tabId, payload.targetId)) {
    return Promise.resolve({
      ok: false,
      method: 'clipboard-fallback',
      outcome: 'unknown',
      error: 'PREVIOUS_OPERATION_UNCONFIRMED'
    });
  }

  const previous = attachRuntimeQueues.get(tabId) ?? Promise.resolve();
  const operation = previous.then(() => executeAttachRuntimeUnlocked(tabId, payload));
  const tail = operation.then(
    () => undefined,
    () => undefined
  );
  attachRuntimeQueues.set(tabId, tail);
  const trackedOperation = operation.finally(() => {
    releaseBusyTabTarget(tabId, payload.targetId);
    releaseTargetTabReservation(tabId, payload.targetId);
    pendingForTab.delete(operationKey);
    if (pendingForTab.size === 0) {
      pendingAttachOperations.delete(tabId);
    }

    if (attachRuntimeQueues.get(tabId) === tail) {
      attachRuntimeQueues.delete(tabId);
    }
  });
  pendingForTab.set(operationKey, trackedOperation);
  pendingAttachOperations.set(tabId, pendingForTab);

  return trackedOperation;
}

async function executeAttachRuntimeUnlocked(tabId: number, payload: AttachRuntimePayload): Promise<AttachResult> {
  const uncertainResult = getUncertainTabMutationResult(tabId);
  if (uncertainResult) {
    return uncertainResult;
  }

  try {
    const targetReady = await waitForTargetDocument(tabId, payload.targetId, TARGET_DOCUMENT_TIMEOUT_MS);
    if (!targetReady) {
      return { ok: false, method: 'clipboard-fallback', error: 'TARGET_NOT_READY' };
    }

    const runReadyTargetOperation = async (
      deferReleaseUntil?: DeferClipboardOperationRelease
    ): Promise<AttachResult> => {
      let runtimePayload = payload;
      if (payload.settings.allowClipboardPaste && (payload.targetId === 'gemini' || payload.targetId === 'doubao')) {
        const writeResult = await writeClipboardImage(payload.image);
        if (!writeResult.ok) {
          runtimePayload = {
            ...payload,
            settings: {
              ...payload.settings,
              allowClipboardPaste: false
            }
          };
        }
      }

      if (runtimePayload.targetId === 'gemini' && runtimePayload.settings.allowClipboardPaste) {
        if (!(await isTabAtTarget(tabId, runtimePayload.targetId))) {
          return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'TARGET_NOT_READY' };
        }
        const clipboardPasteResult = await executeGeminiClipboardPasteRuntime(tabId, deferReleaseUntil);
        if (
          clipboardPasteResult.ok ||
          clipboardPasteResult.outcome === 'unknown' ||
          clipboardPasteResult.error === 'TARGET_NOT_READY'
        ) {
          return clipboardPasteResult;
        }
      }

      const world = getAttachRuntimeWorld(runtimePayload.targetId);
      const injected = await injectAttachRuntimeWithRetry(
        tabId,
        runtimePayload.targetId,
        world,
        TARGET_DOCUMENT_TIMEOUT_MS
      );
      if (!injected) {
        return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
      }

      const execution = chrome.scripting.executeScript({
        target: { tabId },
        args: [runtimePayload],
        world,
        func: async (runtimePayload: AttachRuntimePayload) => {
          const runtime = window.__AI_SCREENSHOT_ATTACHER__;
          if (!runtime) {
            return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
          }
          return runtime.run(runtimePayload);
        }
      });
      let results: Awaited<typeof execution>;
      try {
        results = await withTimeout(execution, SCRIPT_EXECUTION_TIMEOUT_MS, 'ATTACH_RUNTIME_TIMEOUT');
      } catch (error) {
        if (isTimeoutError(error, 'ATTACH_RUNTIME_TIMEOUT')) {
          const settlement = trackUncertainTabMutation(tabId, execution);
          deferReleaseUntil?.(settlement);
          return {
            ok: false,
            method: 'clipboard-fallback',
            outcome: 'unknown',
            error: 'ATTACH_RUNTIME_TIMEOUT'
          };
        }
        logger.debug('attach runtime execution failed after dispatch', { tabId, error });
        return {
          ok: false,
          method: 'clipboard-fallback',
          outcome: 'unknown',
          error: 'SCRIPT_INJECTION_FAILED'
        };
      }

      return (
        (results[0]?.result as AttachResult | undefined) ?? {
          ok: false,
          method: 'clipboard-fallback',
          outcome: 'unknown',
          error: 'SCRIPT_INJECTION_FAILED'
        }
      );
    };

    if (requiresClipboardOperationLock(payload)) {
      return await runWithClipboardOperationLock(runReadyTargetOperation);
    }

    return await runReadyTargetOperation();
  } catch (error) {
    logger.error('script injection failed', { error });
    return { ok: false, method: 'clipboard-fallback', error: 'SCRIPT_INJECTION_FAILED' };
  }
}

function requiresClipboardOperationLock(payload: AttachRuntimePayload): boolean {
  return payload.settings.allowClipboardPaste && (payload.targetId === 'gemini' || payload.targetId === 'doubao');
}

function getAttachOperationKey(payload: AttachRuntimePayload): string {
  return `${payload.targetId}:${payload.image.mimeType}:${payload.image.size}:${payload.image.dataUrl}`;
}

async function executeGeminiClipboardPasteRuntime(
  tabId: number,
  deferReleaseUntil?: DeferClipboardOperationRelease
): Promise<AttachResult> {
  try {
    const execution = chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      args: [TARGET_DOCUMENT_TIMEOUT_MS, AI_TARGETS.gemini.hostnames],
      func: async (inputTimeoutMs: number, allowedHostnames: string[]) => {
        if (!allowedHostnames.includes(window.location.hostname.toLowerCase())) {
          return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'TARGET_NOT_READY' };
        }

        const composerRootSelector =
          'bard-text-input, [data-testid*="composer" i], [data-test-id*="composer" i], [class*="composer" i]';
        const inputSelectors = [
          'bard-text-input .ql-editor.textarea.new-input-ui',
          'bard-text-input .ql-editor[contenteditable="true"]',
          'bard-text-input [contenteditable="true"]',
          'rich-textarea textarea',
          'rich-textarea [contenteditable="true"]',
          '[data-testid*="composer" i] textarea',
          '[data-testid*="composer" i] [contenteditable="true"]',
          '[data-testid*="composer" i] [role="textbox"]',
          '[data-test-id*="composer" i] textarea',
          '[data-test-id*="composer" i] [contenteditable="true"]',
          '[data-test-id*="composer" i] [role="textbox"]',
          '[class*="composer" i] textarea',
          '[class*="composer" i] [contenteditable="true"]',
          '[class*="composer" i] [role="textbox"]'
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
        const findObservationRoot = (target: HTMLElement): ParentNode =>
          target.closest(composerRootSelector) ?? target.closest('rich-textarea') ?? target;
        const snapshot = (observationRoot: ParentNode) => {
          const elements = new Set<Element>();
          for (const selector of previewSelectors) {
            try {
              observationRoot.querySelectorAll(selector).forEach((element) => {
                if (isVisible(element)) {
                  elements.add(element);
                }
              });
            } catch {
              continue;
            }
          }
          const text =
            observationRoot instanceof HTMLElement
              ? (observationRoot.innerText ?? observationRoot.textContent ?? '')
              : (document.body?.innerText ?? document.body?.textContent ?? '');
          return {
            count: elements.size,
            progressTextCounts: progressPatterns.map((pattern) => {
              const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
              return Array.from(text.matchAll(new RegExp(pattern.source, flags))).length;
            })
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
          return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
        }

        focusEditable(target);
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        const observationRoot = findObservationRoot(target);
        const before = snapshot(observationRoot);

        let didPaste: boolean;
        try {
          didPaste = document.execCommand('paste');
        } catch {
          return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_FAILED' };
        }

        if (!didPaste) {
          return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_REJECTED' };
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < 4500) {
          const current = snapshot(observationRoot);
          if (current.count > before.count) {
            return { ok: true, method: 'paste-command', outcome: 'confirmed' };
          }
          if (current.progressTextCounts.some((count, index) => count > (before.progressTextCounts[index] ?? 0))) {
            return { ok: true, method: 'paste-command', outcome: 'confirmed' };
          }
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_NO_PREVIEW' };
      }
    });
    let results: Awaited<typeof execution>;
    try {
      results = await withTimeout(execution, SCRIPT_EXECUTION_TIMEOUT_MS, 'GEMINI_PASTE_RUNTIME_TIMEOUT');
    } catch (error) {
      if (isTimeoutError(error, 'GEMINI_PASTE_RUNTIME_TIMEOUT')) {
        const settlement = trackUncertainTabMutation(tabId, execution);
        deferReleaseUntil?.(settlement);
        return {
          ok: false,
          method: 'paste-command',
          outcome: 'unknown',
          error: 'GEMINI_PASTE_RUNTIME_TIMEOUT'
        };
      }
      throw error;
    }

    return (
      (results[0]?.result as AttachResult | undefined) ?? {
        ok: false,
        method: 'paste-command',
        outcome: 'unknown',
        error: 'PASTE_COMMAND_FAILED'
      }
    );
  } catch (error) {
    logger.debug('Gemini clipboard paste runtime failed', { error });
    return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_FAILED' };
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
    if (tab?.pendingUrl || !isTargetUrl(tab?.url, AI_TARGETS[targetId].hostnames)) {
      await sleep(SCRIPT_INJECTION_RETRY_INTERVAL_MS);
      continue;
    }

    try {
      await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId },
          world,
          files: [ATTACH_RUNTIME_FILE]
        }),
        SCRIPT_EXECUTION_TIMEOUT_MS,
        'ATTACH_RUNTIME_INJECTION_TIMEOUT'
      );
      return true;
    } catch (error) {
      lastError = error;
      await sleep(SCRIPT_INJECTION_RETRY_INTERVAL_MS);
    }
  }

  logger.warn('attach runtime injection retries exhausted', { tabId, targetId, error: lastError });
  return false;
}

export async function showToastOnPage(tabId: number, message: string, variant: ToastVariant): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [message, variant],
      func: showToast
    });
  } catch (error) {
    logger.warn('page toast failed', { error });
  }
}

export async function showToastOnActivePage(message: string, variant: ToastVariant): Promise<void> {
  const [tab] = await withTimeout(
    chrome.tabs.query({ active: true, currentWindow: true }),
    TAB_READ_TIMEOUT_MS,
    'TAB_QUERY_TIMEOUT'
  );
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    return;
  }

  await showToastOnPage(tab.id, message, variant);
}

async function activateTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.windowId !== undefined) {
    await withTimeout(
      chrome.windows.update(tab.windowId, { focused: true }),
      TAB_FOCUS_TIMEOUT_MS,
      'TAB_FOCUS_TIMEOUT'
    );
  }

  if (tab.id !== undefined) {
    await withTimeout(chrome.tabs.update(tab.id, { active: true }), TAB_FOCUS_TIMEOUT_MS, 'TAB_FOCUS_TIMEOUT');
  }
}

async function waitForTargetDocument(tabId: number, targetId: TargetId, timeoutMs: number): Promise<boolean> {
  const target = AI_TARGETS[targetId];
  const currentTab = await getTabSafely(tabId);
  if (!currentTab?.pendingUrl && isTargetUrl(currentTab?.url, target.hostnames)) {
    return true;
  }

  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      globalThis.clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removedListener);
      resolve(ready);
    };
    const timeoutId = globalThis.setTimeout(() => finish(false), timeoutMs);

    const listener = (updatedTabId: number, changeInfo: { url?: string }, tab: chrome.tabs.Tab) => {
      const committedUrl = changeInfo.url ?? (tab.pendingUrl ? undefined : tab.url);
      if (updatedTabId === tabId && isTargetUrl(committedUrl, target.hostnames)) {
        finish(true);
      }
    };
    const removedListener = (removedTabId: number) => {
      if (removedTabId === tabId) {
        finish(false);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
  });
}

async function getTabSafely(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await withTimeout(chrome.tabs.get(tabId), TAB_READ_TIMEOUT_MS, 'TAB_QUERY_TIMEOUT');
  } catch {
    return undefined;
  }
}

async function isTabAtTarget(tabId: number, targetId: TargetId): Promise<boolean> {
  const tab = await getTabSafely(tabId);
  return Boolean(tab && !tab.pendingUrl && isTargetUrl(tab.url, AI_TARGETS[targetId].hostnames));
}

function getUncertainTabMutationResult(tabId: number): AttachResult | undefined {
  if (!uncertainTabMutations.has(tabId)) {
    return undefined;
  }
  return {
    ok: false,
    method: 'clipboard-fallback',
    outcome: 'unknown',
    error: 'PREVIOUS_OPERATION_UNCONFIRMED'
  };
}

function acquireBusyTabTarget(tabId: number, targetId: TargetId): boolean {
  const current = busyTabTargets.get(tabId);
  if (!current) {
    busyTabTargets.set(tabId, { targetId, count: 1 });
    return true;
  }
  if (current.targetId !== targetId) {
    return false;
  }
  current.count += 1;
  return true;
}

function releaseBusyTabTarget(tabId: number, targetId: TargetId): void {
  const current = busyTabTargets.get(tabId);
  if (!current || current.targetId !== targetId) {
    return;
  }
  current.count -= 1;
  if (current.count === 0) {
    busyTabTargets.delete(tabId);
  }
}

function trackUncertainTabMutation(tabId: number, execution: PromiseLike<unknown>): Promise<void> {
  const settlement = Promise.resolve(execution).then(
    () => undefined,
    () => undefined
  );
  uncertainTabMutations.set(tabId, settlement);
  void settlement.then(() => {
    if (uncertainTabMutations.get(tabId) === settlement) {
      uncertainTabMutations.delete(tabId);
    }
  });
  return settlement;
}

async function waitForTabNavigation(
  tabId: number,
  navigation: Promise<chrome.tabs.Tab | undefined>
): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await withTimeout(navigation, TAB_NAVIGATION_TIMEOUT_MS, 'TARGET_TAB_MUTATION_TIMEOUT');
  } catch (error) {
    if (isTimeoutError(error, 'TARGET_TAB_MUTATION_TIMEOUT')) {
      trackUncertainTabNavigation(tabId, navigation);
    }
    throw error;
  }
}

function trackUncertainTabNavigation(tabId: number, navigation: PromiseLike<unknown>): void {
  const settlement = Promise.resolve(navigation).then(
    () => undefined,
    () => undefined
  );
  uncertainTabNavigations.set(tabId, settlement);
  void settlement.then(() => {
    if (uncertainTabNavigations.get(tabId) === settlement) {
      uncertainTabNavigations.delete(tabId);
    }
  });
}

function isTimeoutError(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
