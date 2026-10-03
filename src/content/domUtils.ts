import type { AttachResult } from '../adapters/types';
import type { ClipboardImagePayload } from '../clipboard/types';

const DOM_POLL_INTERVAL_MS = 100;
const CHANGE_BACKSTOP_INTERVAL_MS = 250;
const ATTACHMENT_OBSERVATION_SCOPE_SELECTOR = [
  '[data-testid*="composer" i]',
  '[data-test-id*="composer" i]',
  '[class*="composer" i]',
  'bard-text-input'
].join(', ');

export const GENERIC_FILE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image" i]',
  'input[type="file"][accept*="png" i]',
  'input[type="file"][accept*="jpg" i]',
  'input[type="file"][accept*="jpeg" i]',
  'input[type="file"][accept*="webp" i]',
  'input[type="file"]'
];

export const GENERIC_TEXT_INPUT_SELECTORS = [
  'textarea',
  'form textarea',
  'main textarea',
  '[contenteditable="true"]',
  'main [contenteditable="true"]',
  '[role="textbox"]',
  'main [role="textbox"]'
];

export const GENERIC_DROP_TARGET_SELECTORS = [
  'form',
  'main form',
  'main',
  '[role="main"]',
  '[contenteditable="true"]',
  'textarea',
  '[role="textbox"]'
];

export const GENERIC_ATTACHMENT_PREVIEW_SELECTORS = [
  'img[src^="blob:"]',
  'img[src^="data:image"]',
  '[data-testid*="attachment" i]',
  '[data-testid*="file" i]',
  '[data-testid*="upload" i]',
  '[aria-label*="attachment" i]',
  '[aria-label*="attached" i]',
  '[aria-label*="uploaded" i]',
  '[aria-label*="image" i]',
  'button[aria-label*="remove" i]',
  'button[aria-label*="delete" i]',
  'button[aria-label*="删除" i]'
];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function dataUrlToFile(image: ClipboardImagePayload): File {
  const [header, base64] = image.dataUrl.split(',');
  const mimeType = /data:([^;]+);base64/.exec(header)?.[1] ?? image.mimeType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], image.fileName, {
    type: mimeType,
    lastModified: image.lastModified
  });
}

export function querySelectorCandidates<T extends Element>(
  selectors: string[],
  options: { visibleOnly?: boolean; root?: ParentNode } = {}
): T[] {
  const elements = new Set<T>();
  const root = options.root ?? document;

  for (const selector of selectors) {
    try {
      if (root instanceof Element && root.matches(selector) && (!options.visibleOnly || isVisible(root))) {
        elements.add(root as unknown as T);
      }
      root.querySelectorAll<T>(selector).forEach((element) => {
        if (!options.visibleOnly || isVisible(element)) {
          elements.add(element);
        }
      });
    } catch {
      continue;
    }
  }

  return Array.from(elements);
}

export function findFirstCandidate<T extends HTMLElement>(
  selectors: string[],
  options: { visibleOnly?: boolean; root?: ParentNode } = { visibleOnly: true }
): T | undefined {
  return querySelectorCandidates<T>(selectors, options)[0];
}

export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

export async function waitForAnyElement(selectors: string[], timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (findFirstCandidate(selectors, { visibleOnly: true })) {
      return true;
    }
    await sleep(DOM_POLL_INTERVAL_MS);
  }

  return false;
}

export function focusFirstInput(selectors: string[], scopeRoot: ParentNode = document): void {
  const target = findFirstCandidate<HTMLElement>(selectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return;
  }

  target.focus({ preventScroll: false });

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const end = target.value.length;
    target.setSelectionRange(end, end);
  }
}

export function findAttachmentObservationRoot(target: Element): ParentNode {
  return target.closest(ATTACHMENT_OBSERVATION_SCOPE_SELECTOR) ?? target;
}

export function findExplicitComposerRoot(target: Element): HTMLElement | undefined {
  const root = target.closest(ATTACHMENT_OBSERVATION_SCOPE_SELECTOR);
  return root instanceof HTMLElement ? root : undefined;
}

export interface ComposerScope {
  input: HTMLElement;
  root: HTMLElement;
}

/**
 * Finds the visible composer that owns the first matching text input. An input only counts when it sits inside an
 * explicit composer container, or when it matches one of the site's strong (exact) input selectors.
 */
export function findComposerScope(
  textInputs: string[],
  strongInputSelectors: string[],
  options: { strongInputRootSelector?: string; fallbackRootSelector?: string } = {}
): ComposerScope | undefined {
  const inputs = querySelectorCandidates<HTMLElement>(textInputs, { visibleOnly: true });
  for (const input of inputs) {
    const isStrongInput = strongInputSelectors.some((selector) => input.matches(selector));
    const preferredRoot =
      isStrongInput && options.strongInputRootSelector ? input.closest(options.strongInputRootSelector) : null;
    if (preferredRoot instanceof HTMLElement) {
      return { input, root: preferredRoot };
    }

    const explicitRoot =
      findExplicitComposerRoot(input) ??
      (options.fallbackRootSelector ? input.closest(options.fallbackRootSelector) : null);
    if (explicitRoot instanceof HTMLElement) {
      return { input, root: explicitRoot };
    }

    if (isStrongInput) {
      const form = input.closest('form');
      return { input, root: form instanceof HTMLElement ? form : input };
    }
  }

  return undefined;
}

function getScopedObservationRoot(target: Element, scopeRoot: ParentNode): ParentNode {
  return scopeRoot === document ? findAttachmentObservationRoot(target) : scopeRoot;
}

export function snapshotAttachmentCount(selectors: string[], observationRoot: ParentNode = document): number {
  return countVisibleMatches([...selectors, ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS], observationRoot);
}

export function countVisibleMatches(selectors: string[], observationRoot: ParentNode): number {
  const elements = new Set<Element>();

  for (const selector of selectors) {
    try {
      observationRoot.querySelectorAll(selector).forEach((element) => elements.add(element));
    } catch {
      continue;
    }
  }

  return Array.from(elements).filter(isVisible).length;
}

/**
 * Resolves true as soon as `isDone` passes. DOM mutations under the observation root trigger an immediate check;
 * a slower backstop poll covers layout-only changes (such as an image finishing loading) that mutations miss.
 */
export function waitForCondition(
  observationRoot: ParentNode,
  isDone: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (isDone()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      window.clearInterval(backstopId);
      window.clearTimeout(timeoutId);
      resolve(result);
    };
    const check = () => {
      if (!settled && isDone()) {
        finish(true);
      }
    };

    const observer =
      typeof MutationObserver === 'function' && observationRoot instanceof Node
        ? new MutationObserver(check)
        : undefined;
    observer?.observe(observationRoot as Node, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
    const backstopId = window.setInterval(check, CHANGE_BACKSTOP_INTERVAL_MS);
    const timeoutId = window.setTimeout(() => finish(isDone()), timeoutMs);
  });
}

/** Captures the attachment state before a mutation and returns a check for whether it has since changed. */
export type AttachmentChangeDetector = (observationRoot: ParentNode) => () => boolean;

export function previewOrFileNameDetector(previewSelectors: string[], file: File): AttachmentChangeDetector {
  return (observationRoot) => {
    const beforeCount = snapshotAttachmentCount(previewSelectors, observationRoot);
    const beforeHadFileName = observationRootIncludes(observationRoot, file.name);
    return () =>
      snapshotAttachmentCount(previewSelectors, observationRoot) > beforeCount ||
      (!beforeHadFileName && observationRootIncludes(observationRoot, file.name));
  };
}

export function previewOrTextDetector(
  previewSelectors: string[],
  successTextPatterns: RegExp[] = []
): AttachmentChangeDetector {
  return (observationRoot) => {
    const before = snapshotAttachmentState(previewSelectors, successTextPatterns, observationRoot);
    return () => {
      const current = snapshotAttachmentState(previewSelectors, successTextPatterns, observationRoot);
      return (
        current.count > before.count ||
        current.successTextCounts.some((count, index) => count > (before.successTextCounts[index] ?? 0))
      );
    };
  };
}

export interface AttachStrategyOptions {
  /** Restricts targets to this root, which then also becomes the observation root. */
  scopeRoot?: ParentNode;
  timeoutMs?: number;
  detector?: AttachmentChangeDetector;
  focusTarget?: (target: HTMLElement) => void;
}

export async function tryAttachViaFileInput(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: AttachStrategyOptions = {}
): Promise<AttachResult> {
  const scopeRoot = options.scopeRoot ?? document;
  const inputs = querySelectorCandidates<HTMLInputElement>(inputSelectors, {
    visibleOnly: false,
    root: scopeRoot
  }).filter((input) => input.type === 'file' && acceptsImage(input));
  if (inputs.length === 0) {
    return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_NOT_FOUND' };
  }

  const detector = options.detector ?? previewOrFileNameDetector(previewSelectors, file);
  for (const input of inputs) {
    let mutated = false;
    try {
      const observationRoot = getScopedObservationRoot(input, scopeRoot);
      const hasChanged = detector(observationRoot);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      mutated = true;
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      if (await waitForCondition(observationRoot, hasChanged, options.timeoutMs ?? 5000)) {
        return { ok: true, method: 'file-input', outcome: 'confirmed' };
      }

      return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
    } catch {
      if (mutated) {
        return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
      }
      continue;
    }
  }

  return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_ATTACH_FAILED' };
}

export async function tryAttachViaPaste(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: AttachStrategyOptions & { composed?: boolean } = {}
): Promise<AttachResult> {
  const scopeRoot = options.scopeRoot ?? document;
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return { ok: false, method: 'paste-event', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    (options.focusTarget ?? focusElement)(target);
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, scopeRoot);
    const hasChanged = (options.detector ?? previewOrFileNameDetector(previewSelectors, file))(observationRoot);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      composed: options.composed ?? false,
      clipboardData: dataTransfer
    });
    Object.defineProperty(event, 'clipboardData', {
      value: dataTransfer
    });
    mutated = true;
    target.dispatchEvent(event);

    if (await waitForCondition(observationRoot, hasChanged, options.timeoutMs ?? 3000)) {
      return { ok: true, method: 'paste-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'paste-event', outcome: 'rejected', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' };
}

/** A synthetic paste for editors that also report progress as text and need a caret placed in the editable. */
export function tryAttachViaPasteRelaxed(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: AttachStrategyOptions & { successTextPatterns?: RegExp[] } = {}
): Promise<AttachResult> {
  return tryAttachViaPaste(file, inputSelectors, previewSelectors, {
    focusTarget: focusEditableTarget,
    detector: previewOrTextDetector(previewSelectors, options.successTextPatterns),
    timeoutMs: 8000,
    composed: true,
    ...options
  });
}

export async function tryPasteClipboardViaCommand(
  inputSelectors: string[],
  previewSelectors: string[],
  options: AttachStrategyOptions & { successTextPatterns?: RegExp[] } = {}
): Promise<AttachResult> {
  const scopeRoot = options.scopeRoot ?? document;
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    (options.focusTarget ?? focusEditableTarget)(target);
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, scopeRoot);
    const detector = options.detector ?? previewOrTextDetector(previewSelectors, options.successTextPatterns);
    const hasChanged = detector(observationRoot);
    mutated = true;
    const didPaste = document.execCommand('paste');
    if (!didPaste) {
      return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_REJECTED' };
    }

    if (await waitForCondition(observationRoot, hasChanged, options.timeoutMs ?? 4500)) {
      return { ok: true, method: 'paste-command', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_NO_PREVIEW' }
      : { ok: false, method: 'paste-command', outcome: 'rejected', error: 'PASTE_COMMAND_FAILED' };
  }

  return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_NO_PREVIEW' };
}

export async function tryAttachViaDrop(
  file: File,
  dropSelectors: string[],
  previewSelectors: string[],
  options: AttachStrategyOptions = {}
): Promise<AttachResult> {
  const scopeRoot = options.scopeRoot ?? document;
  const target = findFirstCandidate<HTMLElement>(dropSelectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return { ok: false, method: 'drop-event', outcome: 'rejected', error: 'DROP_TARGET_NOT_FOUND' };
  }

  let mutated = false;
  try {
    (options.focusTarget ?? focusElement)(target);
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, scopeRoot);
    const hasChanged = (options.detector ?? previewOrFileNameDetector(previewSelectors, file))(observationRoot);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer
      });
      Object.defineProperty(event, 'dataTransfer', {
        value: dataTransfer
      });
      mutated = true;
      target.dispatchEvent(event);
      await sleep(80);
    }

    if (await waitForCondition(observationRoot, hasChanged, options.timeoutMs ?? 5000)) {
      return { ok: true, method: 'drop-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'drop-event', outcome: 'unknown', error: 'DROP_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'drop-event', outcome: 'rejected', error: 'DROP_EVENT_FAILED' };
  }

  return { ok: false, method: 'drop-event', outcome: 'unknown', error: 'DROP_EVENT_NO_PREVIEW' };
}

export function acceptsImage(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase();
  if (!accept) {
    return true;
  }

  return (
    accept.includes('image') ||
    accept.includes('.png') ||
    accept.includes('.jpg') ||
    accept.includes('.jpeg') ||
    accept.includes('.webp')
  );
}

function focusElement(target: HTMLElement): void {
  target.focus({ preventScroll: false });
}

/** Focuses an editor and places the caret at the end, so a paste lands after any existing draft. */
export function focusEditableTarget(target: HTMLElement): void {
  target.focus({ preventScroll: false });

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const end = target.value.length;
    target.setSelectionRange(end, end);
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
}

interface AttachmentStateSnapshot {
  count: number;
  successTextCounts: number[];
}

function snapshotAttachmentState(
  selectors: string[],
  successTextPatterns: RegExp[] = [],
  observationRoot: ParentNode = document
): AttachmentStateSnapshot {
  const text = getObservationText(observationRoot);
  return {
    count: snapshotAttachmentCount(selectors, observationRoot),
    successTextCounts: successTextPatterns.map((pattern) => countPatternMatches(text, pattern))
  };
}

export function countPatternMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return Array.from(text.matchAll(new RegExp(pattern.source, flags))).length;
}

export function getObservationText(observationRoot: ParentNode): string {
  if (observationRoot instanceof HTMLElement) {
    return observationRoot.innerText ?? observationRoot.textContent ?? '';
  }

  return document.body?.innerText ?? document.body?.textContent ?? '';
}

function observationRootIncludes(observationRoot: ParentNode, text: string): boolean {
  return Boolean(text) && getObservationText(observationRoot).includes(text);
}
