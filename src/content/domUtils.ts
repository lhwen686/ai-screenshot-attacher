import type { AttachEvidence, AttachMethod, AttachResult } from '../adapters/types';
import type { ClipboardImagePayload } from '../clipboard/types';

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

export const DEFAULT_ATTACHMENT_FAILURE_TEXT_PATTERNS = [
  /文件中没有内容/,
  /empty file/i,
  /file is empty/i,
  /upload failed/i,
  /failed to upload/i,
  /couldn['’]?t upload/i,
  /unable to upload/i,
  /上传失败/,
  /无法上传/,
  /权限/,
  /permission/i
];

export const DEFAULT_ATTACHMENT_SUCCESS_TEXT_PATTERNS = [
  /upload complete/i,
  /uploaded/i,
  /attached/i,
  /上传完成/,
  /已上传/,
  /已附加/
];

export const DEFAULT_ATTACHMENT_PROGRESS_TEXT_PATTERNS = [
  /uploading/i,
  /processing/i,
  /上传中/,
  /正在上传/,
  /处理中/
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
    await sleep(250);
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
      const root = findAttachmentObservationRoot(input);
      const beforeSnapshot = snapshotAttachmentState(previewSelectors, root, file);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      const result = await waitForAttachmentOutcome('file-input', previewSelectors, beforeSnapshot, root, file, {
        timeoutMs: 5000
      });
      if (result.ok || result.confidence === 'unconfirmed') {
        return result;
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
    const root = findAttachmentObservationRoot(target);
    const beforeSnapshot = snapshotAttachmentState(previewSelectors, root, file);
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

    return waitForAttachmentOutcome('paste-event', previewSelectors, beforeSnapshot, root, file, {
      timeoutMs: 3000
    });
  } catch {
    return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_FAILED' };
  }
}

export async function tryAttachViaPasteRelaxed(
  file: File,
  inputSelectors: string[],
  previewSelectors: string[],
  options: { timeoutMs?: number; successTextPatterns?: RegExp[]; progressTextPatterns?: RegExp[]; failureTextPatterns?: RegExp[] } = {}
): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(inputSelectors, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'paste-event', error: 'INPUT_NOT_FOUND' };
  }

  try {
    const root = findAttachmentObservationRoot(target);
    const beforeSnapshot = snapshotAttachmentState(previewSelectors, root, file);
    target.focus({ preventScroll: false });
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

    return waitForAttachmentOutcome('paste-event', previewSelectors, beforeSnapshot, root, file, {
      timeoutMs: options.timeoutMs ?? 8000,
      successTextPatterns: options.successTextPatterns,
      progressTextPatterns: options.progressTextPatterns,
      failureTextPatterns: options.failureTextPatterns
    });
  } catch {
    return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_FAILED' };
  }
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
    const root = findAttachmentObservationRoot(target);
    const beforeSnapshot = snapshotAttachmentState(previewSelectors, root, file);
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

    return waitForAttachmentOutcome('drop-event', previewSelectors, beforeSnapshot, root, file, {
      timeoutMs: 5000
    });
  } catch {
    return { ok: false, method: 'drop-event', error: 'DROP_EVENT_FAILED' };
  }
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

interface AttachmentStateSnapshot {
  count: number;
  imageCount: number;
  text: string;
  hasFileName: boolean;
  matchedFailure?: AttachEvidence;
  matchedProgress?: AttachEvidence;
  matchedSuccess?: AttachEvidence;
}

export function findAttachmentObservationRoot(target: Element): Element {
  const rootSelectors = [
    '[data-testid*="composer" i]',
    '[data-test-id*="composer" i]',
    '[aria-label*="composer" i]',
    'rich-textarea',
    'form',
    'main',
    '[role="main"]'
  ];

  for (const selector of rootSelectors) {
    const root = target.closest(selector);
    if (root instanceof HTMLElement && isVisible(root)) {
      return root;
    }
  }

  let candidate: Element | null = target;
  for (let depth = 0; depth < 4 && candidate?.parentElement; depth += 1) {
    candidate = candidate.parentElement;
  }

  return candidate ?? document.body;
}

export function snapshotAttachmentState(selectors: string[], root: ParentNode = document.body, file?: File): AttachmentStateSnapshot {
  const rootElement = root instanceof Element ? root : document.body;
  const text = rootElement.textContent ?? '';

  return {
    count: snapshotAttachmentCountInRoot(selectors, root),
    imageCount: querySelectorCandidatesInRoot(
      root,
      'img[src^="blob:"], img[src^="data:image"], image-preview, file-preview, upload-image'
    ).filter(isVisible).length,
    text,
    hasFileName: file ? text.includes(file.name) : false,
    matchedFailure: findTextEvidence(text, DEFAULT_ATTACHMENT_FAILURE_TEXT_PATTERNS, 'failure-text'),
    matchedProgress: findTextEvidence(text, DEFAULT_ATTACHMENT_PROGRESS_TEXT_PATTERNS, 'progress-text'),
    matchedSuccess: findTextEvidence(text, DEFAULT_ATTACHMENT_SUCCESS_TEXT_PATTERNS, 'success-text')
  };
}

export async function waitForAttachmentOutcome(
  method: AttachMethod,
  selectors: string[],
  before: AttachmentStateSnapshot,
  root: Element,
  file: File,
  options: {
    timeoutMs: number;
    successTextPatterns?: RegExp[];
    progressTextPatterns?: RegExp[];
    failureTextPatterns?: RegExp[];
  }
): Promise<AttachResult> {
  const startedAt = Date.now();
  const failurePatterns = [...DEFAULT_ATTACHMENT_FAILURE_TEXT_PATTERNS, ...(options.failureTextPatterns ?? [])];
  const successPatterns = [...DEFAULT_ATTACHMENT_SUCCESS_TEXT_PATTERNS, ...(options.successTextPatterns ?? [])];
  const progressPatterns = [...DEFAULT_ATTACHMENT_PROGRESS_TEXT_PATTERNS, ...(options.progressTextPatterns ?? [])];
  let lastProgressEvidence: AttachEvidence | undefined;
  let mutationSeen = false;
  let resolveMutation: (() => void) | undefined;
  const observer = new MutationObserver(() => {
    mutationSeen = true;
    resolveMutation?.();
    resolveMutation = undefined;
  });

  observer.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['aria-label', 'class', 'data-testid', 'data-test-id', 'src', 'title']
  });

  async function waitForNextObservationTick(): Promise<void> {
    if (!mutationSeen) {
      await Promise.race([
        sleep(250),
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        })
      ]);
      resolveMutation = undefined;
    }

    if (mutationSeen) {
      await sleep(50);
    }
  }

  try {
    while (Date.now() - startedAt < options.timeoutMs) {
      const current = snapshotAttachmentState(selectors, root, file);
      const textDelta = getTextDelta(before.text, current.text);
      const failureEvidence = current.matchedFailure ?? findTextEvidence(textDelta, failurePatterns, 'failure-text');
      if (failureEvidence && !before.matchedFailure) {
        return {
          ok: false,
          method,
          error: 'AUTO_ATTACH_FAILED',
          confidence: 'confirmed',
          evidence: [failureEvidence]
        };
      }

      if (current.count > before.count) {
        return {
          ok: true,
          method,
          confidence: 'confirmed',
          evidence: [{ kind: 'attachment-preview', message: 'A visible attachment preview appeared.' }]
        };
      }

      if (current.imageCount > before.imageCount) {
        return {
          ok: true,
          method,
          confidence: 'confirmed',
          evidence: [{ kind: 'image-preview', message: 'An image preview appeared.' }]
        };
      }

      if (!before.hasFileName && current.hasFileName) {
        return {
          ok: true,
          method,
          confidence: 'confirmed',
          evidence: [{ kind: 'file-name', message: file.name }]
        };
      }

      const successEvidence = current.matchedSuccess ?? findTextEvidence(textDelta, successPatterns, 'success-text');
      if (successEvidence && !before.matchedSuccess) {
        return {
          ok: true,
          method,
          confidence: 'confirmed',
          evidence: [successEvidence]
        };
      }

      const progressEvidence = current.matchedProgress ?? findTextEvidence(textDelta, progressPatterns, 'progress-text');
      if (progressEvidence && !before.matchedProgress) {
        lastProgressEvidence = progressEvidence;
      }

      await waitForNextObservationTick();
      mutationSeen = false;
    }
  } finally {
    observer.disconnect();
  }

  if (lastProgressEvidence) {
    return {
      ok: false,
      method,
      error: 'ATTACHMENT_UNCONFIRMED',
      confidence: 'unconfirmed',
      evidence: [lastProgressEvidence]
    };
  }

  return {
    ok: false,
    method,
    error: `${method.toUpperCase().replace('-', '_')}_NO_CONFIRMED_ATTACHMENT`,
    confidence: 'unconfirmed'
  };
}

function snapshotAttachmentCountInRoot(selectors: string[], root: ParentNode): number {
  const elements = new Set<Element>();

  for (const selector of [...selectors, ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS]) {
    for (const element of querySelectorCandidatesInRoot(root, selector)) {
      elements.add(element);
    }
  }

  return Array.from(elements).filter(isVisible).length;
}

function querySelectorCandidatesInRoot(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function findTextEvidence(text: string, patterns: RegExp[], kind: string): AttachEvidence | undefined {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return { kind, message: pattern.source };
    }
  }

  return undefined;
}

function getTextDelta(beforeText: string, currentText: string): string {
  if (!beforeText || !currentText.startsWith(beforeText)) {
    return currentText;
  }

  return currentText.slice(beforeText.length);
}
