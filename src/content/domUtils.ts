import type { AttachResult } from '../adapters/types';
import type { ClipboardImagePayload } from '../clipboard/types';

const DOM_POLL_INTERVAL_MS = 100;

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
  options: { visibleOnly?: boolean } = {}
): T[] {
  const elements = new Set<T>();

  for (const selector of selectors) {
    try {
      document.querySelectorAll<T>(selector).forEach((element) => {
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
  options: { visibleOnly?: boolean } = { visibleOnly: true }
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

export function focusFirstInput(selectors: string[]): void {
  const target = findFirstCandidate<HTMLElement>(selectors, { visibleOnly: true });
  if (!target) {
    return;
  }

  target.focus({ preventScroll: false });

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const end = target.value.length;
    target.setSelectionRange(end, end);
  }
}

export function snapshotAttachmentCount(selectors: string[]): number {
  const elements = new Set<Element>();

  for (const selector of [...selectors, ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS]) {
    try {
      document.querySelectorAll(selector).forEach((element) => elements.add(element));
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
  file?: File
): Promise<boolean> {
  const startedAt = Date.now();
  const hadFileName = file ? documentBodyIncludes(file.name) : false;

  while (Date.now() - startedAt < timeoutMs) {
    if (snapshotAttachmentCount(selectors) > beforeCount || (file && !hadFileName && documentBodyIncludes(file.name))) {
      return true;
    }
    await sleep(DOM_POLL_INTERVAL_MS);
  }

  return false;
}

export async function tryAttachViaFileInput(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[]
): Promise<AttachResult> {
  const inputs = querySelectorCandidates<HTMLInputElement>(inputSelectors, { visibleOnly: false }).filter(
    (input) => input.type === 'file' && acceptsImage(input)
  );

  for (const input of inputs) {
    try {
      const beforeCount = snapshotAttachmentCount(previewSelectors);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      if (await waitForAttachmentChange(previewSelectors, beforeCount, 5000, file)) {
        return { ok: true, method: 'file-input' };
      }
    } catch {
      continue;
    }
  }

  return { ok: false, method: 'file-input', error: 'FILE_INPUT_ATTACH_FAILED' };
}

export async function tryAttachViaPaste(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[]
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'paste-event', error: 'INPUT_NOT_FOUND' };
  }

  try {
    const beforeCount = snapshotAttachmentCount(previewSelectors);
    target.focus({ preventScroll: false });
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
    target.dispatchEvent(event);

    if (await waitForAttachmentChange(previewSelectors, beforeCount, 3000, file)) {
      return { ok: true, method: 'paste-event' };
    }
  } catch {
    return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_NO_PREVIEW' };
}

export async function tryAttachViaPasteRelaxed(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: { timeoutMs?: number; successTextPatterns?: RegExp[] } = {}
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'paste-event', error: 'INPUT_NOT_FOUND' };
  }

  try {
    const beforeSnapshot = snapshotAttachmentState(previewSelectors);
    focusEditableTarget(target);
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
    target.dispatchEvent(event);

    if (
      await waitForRelaxedAttachmentSuccess(
        previewSelectors,
        beforeSnapshot,
        options.timeoutMs ?? 8000,
        options.successTextPatterns
      )
    ) {
      return { ok: true, method: 'paste-event' };
    }
  } catch {
    return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_NO_PREVIEW' };
}

export async function tryPasteClipboardViaCommand(
  inputSelectors: string[],
  previewSelectors: string[],
  options: { timeoutMs?: number; successTextPatterns?: RegExp[] } = {}
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'paste-command', error: 'INPUT_NOT_FOUND' };
  }

  try {
    const beforeSnapshot = snapshotAttachmentState(previewSelectors);
    focusEditableTarget(target);
    const didPaste = document.execCommand('paste');
    if (!didPaste) {
      return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_REJECTED' };
    }

    if (
      await waitForRelaxedAttachmentSuccess(
        previewSelectors,
        beforeSnapshot,
        options.timeoutMs ?? 4500,
        options.successTextPatterns
      )
    ) {
      return { ok: true, method: 'paste-command' };
    }
  } catch {
    return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_FAILED' };
  }

  return { ok: false, method: 'paste-command', error: 'PASTE_COMMAND_NO_PREVIEW' };
}

export async function tryAttachViaDrop(
  file: File,
  dropSelectors: string[],
  previewSelectors: string[]
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(dropSelectors, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'drop-event', error: 'DROP_TARGET_NOT_FOUND' };
  }

  try {
    const beforeCount = snapshotAttachmentCount(previewSelectors);
    target.focus({ preventScroll: false });
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
      target.dispatchEvent(event);
      await sleep(80);
    }

    if (await waitForAttachmentChange(previewSelectors, beforeCount, 5000, file)) {
      return { ok: true, method: 'drop-event' };
    }
  } catch {
    return { ok: false, method: 'drop-event', error: 'DROP_EVENT_FAILED' };
  }

  return { ok: false, method: 'drop-event', error: 'DROP_EVENT_NO_PREVIEW' };
}

function acceptsImage(input: HTMLInputElement): boolean {
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

function documentBodyIncludes(text: string): boolean {
  return Boolean(text) && document.body?.innerText?.includes(text);
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
  imageCount: number;
  text: string;
}

function snapshotAttachmentState(selectors: string[]): AttachmentStateSnapshot {
  return {
    count: snapshotAttachmentCount(selectors),
    imageCount: document.querySelectorAll('img, image-preview, file-preview, upload-image').length,
    text: document.body?.innerText ?? ''
  };
}

async function waitForRelaxedAttachmentSuccess(
  selectors: string[],
  before: AttachmentStateSnapshot,
  timeoutMs: number,
  successTextPatterns: RegExp[] = []
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const current = snapshotAttachmentState(selectors);
    const textDelta = current.text.slice(Math.min(before.text.length, current.text.length));

    if (current.count > before.count || current.imageCount > before.imageCount) {
      return true;
    }

    if (successTextPatterns.some((pattern) => pattern.test(current.text) || pattern.test(textDelta))) {
      return true;
    }

    await sleep(DOM_POLL_INTERVAL_MS);
  }

  return false;
}
