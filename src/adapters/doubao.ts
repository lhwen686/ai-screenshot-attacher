import type { AdapterSelectorSet, AiTargetAdapter, AttachResult } from './types';
import {
  GENERIC_FILE_INPUT_SELECTORS,
  findExplicitComposerRoot,
  findFirstCandidate,
  focusFirstInput,
  isVisible,
  querySelectorCandidates,
  sleep,
  waitForAnyElement
} from '../content/domUtils';

const strongInputSelectors = [
  'textarea[placeholder*="豆包"]',
  'textarea[placeholder*="消息"]',
  '[contenteditable="true"][data-testid*="chat-input" i]',
  '[contenteditable="true"][data-testid*="message-input" i]',
  '[contenteditable="true"][data-testid*="input" i]',
  '[contenteditable="true"][aria-label*="message" i]',
  '[contenteditable="true"][aria-label*="prompt" i]'
];
const explicitComposerInputSelectors = [
  '[data-testid*="composer" i] [contenteditable="true"]',
  '[data-testid*="composer" i] textarea',
  '[data-test-id*="composer" i] [contenteditable="true"]',
  '[data-test-id*="composer" i] textarea',
  '[class*="composer" i] [contenteditable="true"]',
  '[class*="composer" i] textarea',
  '[data-testid*="chat-input" i] [contenteditable="true"]',
  '[data-testid*="chat-input" i] textarea',
  '[data-testid*="message-input" i] [contenteditable="true"]',
  '[data-testid*="message-input" i] textarea',
  '[data-testid*="input" i] [contenteditable="true"]',
  '[data-testid*="input" i] textarea'
];

const uploadTextPatterns = [
  /uploading/i,
  /processing/i,
  /uploaded/i,
  /attached/i,
  /上传中/,
  /正在上传/,
  /处理中/,
  /已上传/,
  /已添加/,
  /上传成功/
];

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [...strongInputSelectors, ...explicitComposerInputSelectors],
  dropTargets: [
    '[data-testid*="composer" i]',
    '[data-testid*="chat" i]',
    '[data-testid*="input" i]',
    'form',
    '[data-testid*="composer" i] [contenteditable="true"]',
    '[data-testid*="composer" i] textarea',
    '[role="textbox"]',
    '[data-testid*="composer" i]'
  ],
  attachmentPreviews: [
    '[data-testid*="attachment" i]',
    '[aria-label*="attachment" i]',
    '[aria-label*="uploaded" i]',
    '[aria-label*="remove" i]',
    '[aria-label*="删除"]',
    'button[aria-label*="删除"]',
    'main img[src^="blob:"]'
  ]
};

export const doubaoAdapter: AiTargetAdapter = {
  id: 'doubao',
  name: '豆包',
  urlPatterns: ['https://doubao.com/*', 'https://www.doubao.com/*'],
  defaultUrl: 'https://www.doubao.com/chat/',

  detect() {
    return location.hostname === 'doubao.com' || location.hostname === 'www.doubao.com';
  },

  async waitUntilReady(timeoutMs: number) {
    return waitForAnyElement(selectors.textInputs, timeoutMs);
  },

  async attachImage(file: File, options): Promise<AttachResult> {
    const composerRoot = findActiveDoubaoComposerRoot();
    if (!composerRoot) {
      return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
    }

    const allowClipboardPaste = options?.allowClipboardPaste ?? true;
    let pasteCommandResult: AttachResult = {
      ok: false,
      method: 'paste-command',
      outcome: 'rejected',
      error: 'CLIPBOARD_PASTE_DISABLED'
    };
    if (allowClipboardPaste) {
      pasteCommandResult = await tryDoubaoPasteClipboardViaCommand(file, composerRoot);
      if (pasteCommandResult.ok || pasteCommandResult.outcome === 'unknown') {
        return pasteCommandResult;
      }
    }

    const pasteEventResult = await tryDoubaoSyntheticPaste(file, composerRoot);
    if (pasteEventResult.ok || pasteEventResult.outcome === 'unknown') {
      return pasteEventResult;
    }

    const dropResult = await tryDoubaoDrop(file, composerRoot);
    if (dropResult.ok || dropResult.outcome === 'unknown') {
      return dropResult;
    }

    const fileInputResult = await tryDoubaoFileInput(file, composerRoot);
    return fileInputResult.ok || fileInputResult.outcome === 'unknown'
      ? fileInputResult
      : {
          ok: false,
          method: 'clipboard-fallback',
          outcome: 'rejected',
          error:
            fileInputResult.error ??
            dropResult.error ??
            pasteEventResult.error ??
            pasteCommandResult.error ??
            'AUTO_ATTACH_FAILED'
        };
  },

  async focusInput() {
    const composerRoot = findActiveDoubaoComposerRoot();
    if (composerRoot) {
      focusFirstInput(selectors.textInputs, composerRoot);
    }
  }
};

async function tryDoubaoPasteClipboardViaCommand(file: File, composerRoot: HTMLElement): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(selectors.textInputs, {
    visibleOnly: true,
    root: composerRoot
  });
  if (!target) {
    return { ok: false, method: 'paste-command', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let pasteAttempted = false;
  try {
    focusEditableTarget(target);
    await sleep(100);
    const observationRoot = composerRoot;
    const before = snapshotDoubaoAttachmentState(file, observationRoot);
    let didPaste = false;
    try {
      pasteAttempted = true;
      didPaste = document.execCommand('paste');
    } catch {
      return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_FAILED' };
    }

    if (!didPaste) {
      return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_REJECTED' };
    }

    if (await waitForDoubaoAttachmentSuccess(before, file, 5500, observationRoot)) {
      return { ok: true, method: 'paste-command', outcome: 'confirmed' };
    }

    return { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_NO_PREVIEW' };
  } catch {
    return pasteAttempted
      ? { ok: false, method: 'paste-command', outcome: 'unknown', error: 'PASTE_COMMAND_FAILED' }
      : { ok: false, method: 'paste-command', outcome: 'rejected', error: 'PASTE_COMMAND_FAILED' };
  }
}

async function tryDoubaoSyntheticPaste(file: File, composerRoot: HTMLElement): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(selectors.textInputs, { visibleOnly: true, root: composerRoot });
  if (!target) {
    return { ok: false, method: 'paste-event', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
  }

  let mutated = false;
  try {
    focusEditableTarget(target);
    await sleep(100);
    const observationRoot = composerRoot;
    const before = snapshotDoubaoAttachmentState(file, observationRoot);
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
    mutated = true;

    if (await waitForDoubaoAttachmentSuccess(before, file, 5500, observationRoot)) {
      return { ok: true, method: 'paste-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'paste-event', outcome: 'rejected', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', outcome: 'unknown', error: 'PASTE_EVENT_NO_PREVIEW' };
}

async function tryDoubaoDrop(file: File, composerRoot: HTMLElement): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(selectors.dropTargets, { visibleOnly: true, root: composerRoot });
  if (!target) {
    return { ok: false, method: 'drop-event', outcome: 'rejected', error: 'DROP_TARGET_NOT_FOUND' };
  }

  let mutated = false;
  try {
    focusEditableTarget(target);
    await sleep(100);
    const observationRoot = composerRoot;
    const before = snapshotDoubaoAttachmentState(file, observationRoot);
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
      mutated = true;
      await sleep(80);
    }

    if (await waitForDoubaoAttachmentSuccess(before, file, 5500, observationRoot)) {
      return { ok: true, method: 'drop-event', outcome: 'confirmed' };
    }
  } catch {
    return mutated
      ? { ok: false, method: 'drop-event', outcome: 'unknown', error: 'DROP_EVENT_NO_PREVIEW' }
      : { ok: false, method: 'drop-event', outcome: 'rejected', error: 'DROP_EVENT_FAILED' };
  }

  return { ok: false, method: 'drop-event', outcome: 'unknown', error: 'DROP_EVENT_NO_PREVIEW' };
}

async function tryDoubaoFileInput(file: File, composerRoot: HTMLElement): Promise<AttachResult> {
  const inputs = querySelectorCandidates<HTMLInputElement>(selectors.fileInputs, {
    visibleOnly: false,
    root: composerRoot
  }).filter((input) => input.type === 'file' && acceptsImage(input));
  if (inputs.length === 0) {
    return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_NOT_FOUND' };
  }

  for (const input of inputs) {
    let mutated = false;
    try {
      const observationRoot = composerRoot;
      const before = snapshotDoubaoAttachmentState(file, observationRoot);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      mutated = true;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      if (await waitForDoubaoAttachmentSuccess(before, file, 5500, observationRoot)) {
        return { ok: true, method: 'file-input', outcome: 'confirmed' };
      }

      return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
    } catch {
      if (mutated) {
        return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
      }
    }
  }

  return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_ATTACH_FAILED' };
}

interface DoubaoAttachmentState {
  previewCount: number;
  blobImageCount: number;
  editorDataImageCount: number;
  successTextCounts: number[];
  hadFileName: boolean;
}

function snapshotDoubaoAttachmentState(file: File, observationRoot: ParentNode): DoubaoAttachmentState {
  const text = getObservationText(observationRoot);
  return {
    previewCount: countVisibleDoubaoPreviewElements(observationRoot),
    blobImageCount: observationRoot.querySelectorAll('img[src^="blob:"]').length,
    editorDataImageCount: observationRoot.querySelectorAll('[contenteditable="true"] img[src^="data:image"]').length,
    successTextCounts: uploadTextPatterns.map((pattern) => countPatternMatches(text, pattern)),
    hadFileName: text.includes(file.name)
  };
}

async function waitForDoubaoAttachmentSuccess(
  before: DoubaoAttachmentState,
  file: File,
  timeoutMs: number,
  observationRoot: ParentNode
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const currentText = getObservationText(observationRoot);

    if (countVisibleDoubaoPreviewElements(observationRoot) > before.previewCount) {
      return true;
    }

    if (observationRoot.querySelectorAll('img[src^="blob:"]').length > before.blobImageCount) {
      return true;
    }

    if (
      observationRoot.querySelectorAll('[contenteditable="true"] img[src^="data:image"]').length >
      before.editorDataImageCount
    ) {
      return true;
    }

    if (!before.hadFileName && currentText.includes(file.name)) {
      return true;
    }

    if (
      uploadTextPatterns.some(
        (pattern, index) => countPatternMatches(currentText, pattern) > (before.successTextCounts[index] ?? 0)
      )
    ) {
      return true;
    }

    await sleep(100);
  }

  return false;
}

function countVisibleDoubaoPreviewElements(observationRoot: ParentNode): number {
  const elements = new Set<Element>();
  for (const selector of selectors.attachmentPreviews) {
    try {
      observationRoot.querySelectorAll(selector).forEach((element) => elements.add(element));
    } catch {
      continue;
    }
  }
  return Array.from(elements).filter(isVisible).length;
}

function focusEditableTarget(target: HTMLElement): void {
  target.click();
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

function findActiveDoubaoComposerRoot(): HTMLElement | undefined {
  const inputs = querySelectorCandidates<HTMLElement>(selectors.textInputs, { visibleOnly: true });
  for (const input of inputs) {
    const explicitRoot =
      findExplicitComposerRoot(input) ??
      input.closest('[data-testid*="chat-input" i], [data-testid*="message-input" i], [data-testid*="input" i]');
    if (explicitRoot instanceof HTMLElement) {
      return explicitRoot;
    }

    if (strongInputSelectors.some((selector) => input.matches(selector))) {
      const form = input.closest('form');
      return form instanceof HTMLElement ? form : input;
    }
  }

  return undefined;
}

function acceptsImage(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase();
  return (
    !accept ||
    accept.includes('image') ||
    accept.includes('.png') ||
    accept.includes('.jpg') ||
    accept.includes('.jpeg') ||
    accept.includes('.webp')
  );
}

function countPatternMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return Array.from(text.matchAll(new RegExp(pattern.source, flags))).length;
}

function getObservationText(observationRoot: ParentNode): string {
  if (observationRoot instanceof HTMLElement) {
    return observationRoot.innerText ?? observationRoot.textContent ?? '';
  }

  return document.body?.innerText ?? document.body?.textContent ?? '';
}
