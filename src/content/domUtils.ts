import type { AttachResult } from '../adapters/types';
import type { ClipboardImagePayload } from '../clipboard/types';

const DOM_POLL_INTERVAL_MS = 100;
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

function getScopedObservationRoot(target: Element, scopeRoot: ParentNode): ParentNode {
  return scopeRoot === document ? findAttachmentObservationRoot(target) : scopeRoot;
}

export function snapshotAttachmentCount(selectors: string[], observationRoot: ParentNode = document): number {
  const elements = new Set<Element>();

  for (const selector of [...selectors, ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS]) {
    try {
      observationRoot.querySelectorAll(selector).forEach((element) => elements.add(element));
    } catch {
      continue;
    }
  }

  return Array.from(elements).filter(isVisible).length;
}

export async function waitForAttachmentChange(
  selectors: string[],
  beforeCount: number,
  timeoutMs = 3000,
  file?: File,
  observationRoot: ParentNode = document,
  beforeHadFileName = file ? observationRootIncludes(observationRoot, file.name) : false
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (
      snapshotAttachmentCount(selectors, observationRoot) > beforeCount ||
      (file && !beforeHadFileName && observationRootIncludes(observationRoot, file.name))
    ) {
      return true;
    }
    await sleep(DOM_POLL_INTERVAL_MS);
  }

  return false;
}

export async function tryAttachViaFileInput(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  scopeRoot: ParentNode = document
): Promise<AttachResult> {
  const inputs = querySelectorCandidates<HTMLInputElement>(inputSelectors, {
    visibleOnly: false,
    root: scopeRoot
  }).filter((input) => input.type === 'file' && acceptsImage(input));
  if (inputs.length === 0) {
    return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_NOT_FOUND' };
  }

  for (const input of inputs) {
    let mutated = false;
    try {
      const observationRoot = getScopedObservationRoot(input, scopeRoot);
      const beforeCount = snapshotAttachmentCount(previewSelectors, observationRoot);
      const beforeHadFileName = observationRootIncludes(observationRoot, file.name);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      mutated = true;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      if (
        await waitForAttachmentChange(previewSelectors, beforeCount, 5000, file, observationRoot, beforeHadFileName)
      ) {
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
  scopeRoot: ParentNode = document
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return { ok: false, method: 'paste-event', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    target.focus({ preventScroll: false });
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, scopeRoot);
    const beforeCount = snapshotAttachmentCount(previewSelectors, observationRoot);
    const beforeHadFileName = observationRootIncludes(observationRoot, file.name);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    Object.defineProperty(event, 'clipboardData', {
      value: dataTransfer
    });
    mutated = true;
    target.dispatchEvent(event);

    if (await waitForAttachmentChange(previewSelectors, beforeCount, 3000, file, observationRoot, beforeHadFileName)) {
      return { ok: true, method: 'paste-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'paste-event', outcome: 'rejected', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' };
}

export async function tryAttachViaPasteRelaxed(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: { timeoutMs?: number; successTextPatterns?: RegExp[]; scopeRoot?: ParentNode } = {}
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, {
    visibleOnly: true,
    root: options.scopeRoot ?? document
  });
  if (!target) {
    return { ok: false, method: 'paste-event', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    focusEditableTarget(target);
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, options.scopeRoot ?? document);
    const beforeSnapshot = snapshotAttachmentState(previewSelectors, options.successTextPatterns, observationRoot);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: dataTransfer
    });
    Object.defineProperty(event, 'clipboardData', {
      value: dataTransfer
    });
    mutated = true;
    target.dispatchEvent(event);

    if (
      await waitForRelaxedAttachmentSuccess(
        previewSelectors,
        beforeSnapshot,
        options.timeoutMs ?? 8000,
        options.successTextPatterns,
        observationRoot
      )
    ) {
      return { ok: true, method: 'paste-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'paste-event', outcome: 'rejected', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' };
}

export async function tryPasteClipboardViaCommand(
  inputSelectors: string[],
  previewSelectors: string[],
  options: { timeoutMs?: number; successTextPatterns?: RegExp[]; scopeRoot?: ParentNode } = {}
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, {
    visibleOnly: true,
    root: options.scopeRoot ?? document
  });
  if (!target) {
    return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    focusEditableTarget(target);
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, options.scopeRoot ?? document);
    const beforeSnapshot = snapshotAttachmentState(previewSelectors, options.successTextPatterns, observationRoot);
    mutated = true;
    const didPaste = document.execCommand('paste');
    if (!didPaste) {
      return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_REJECTED' };
    }

    if (
      await waitForRelaxedAttachmentSuccess(
        previewSelectors,
        beforeSnapshot,
        options.timeoutMs ?? 4500,
        options.successTextPatterns,
        observationRoot
      )
    ) {
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
  scopeRoot: ParentNode = document
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(dropSelectors, { visibleOnly: true, root: scopeRoot });
  if (!target) {
    return { ok: false, method: 'drop-event', outcome: 'rejected', error: 'DROP_TARGET_NOT_FOUND' };
  }

  let mutated = false;
  try {
    target.focus({ preventScroll: false });
    await sleep(DOM_POLL_INTERVAL_MS);
    const observationRoot = getScopedObservationRoot(target, scopeRoot);
    const beforeCount = snapshotAttachmentCount(previewSelectors, observationRoot);
    const beforeHadFileName = observationRootIncludes(observationRoot, file.name);
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

    if (await waitForAttachmentChange(previewSelectors, beforeCount, 5000, file, observationRoot, beforeHadFileName)) {
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

function focusEditableTarget(target: HTMLElement): void {
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

async function waitForRelaxedAttachmentSuccess(
  selectors: string[],
  before: AttachmentStateSnapshot,
  timeoutMs: number,
  successTextPatterns: RegExp[] = [],
  observationRoot: ParentNode = document
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const current = snapshotAttachmentState(selectors, successTextPatterns, observationRoot);

    if (current.count > before.count) {
      return true;
    }

    if (current.successTextCounts.some((count, index) => count > (before.successTextCounts[index] ?? 0))) {
      return true;
    }

    await sleep(DOM_POLL_INTERVAL_MS);
  }

  return false;
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
