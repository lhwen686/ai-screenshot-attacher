import type { AdapterSelectorSet, AiTargetAdapter, AttachResult } from './types';
import {
  GENERIC_DROP_TARGET_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  GENERIC_TEXT_INPUT_SELECTORS,
  findFirstCandidate,
  focusFirstInput,
  isVisible,
  querySelectorCandidates,
  sleep,
  waitForAnyElement
} from '../content/domUtils';

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
  textInputs: [
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="豆包"]',
    '[contenteditable="true"][data-testid*="chat" i]',
    '[contenteditable="true"][data-testid*="input" i]',
    '[contenteditable="true"][aria-label*="输入"]',
    '[contenteditable="true"][aria-label*="message" i]',
    '[contenteditable="true"][aria-label*="prompt" i]',
    '[data-testid*="chat" i] [contenteditable="true"]',
    '[data-testid*="input" i] [contenteditable="true"]',
    '[role="textbox"]',
    'main [contenteditable="true"]',
    ...GENERIC_TEXT_INPUT_SELECTORS
  ],
  dropTargets: [
    '[data-testid*="composer" i]',
    '[data-testid*="chat" i]',
    '[data-testid*="input" i]',
    'main form',
    'form',
    'main [contenteditable="true"]',
    '[role="textbox"]',
    'main',
    ...GENERIC_DROP_TARGET_SELECTORS
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
    return waitForAnyElement([...selectors.textInputs, ...selectors.fileInputs], timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const pasteCommandResult = await tryDoubaoPasteClipboardViaCommand(file);
    if (pasteCommandResult.ok) {
      return pasteCommandResult;
    }

    const pasteEventResult = await tryDoubaoSyntheticPaste(file);
    if (pasteEventResult.ok) {
      return pasteEventResult;
    }

    const dropResult = await tryDoubaoDrop(file);
    if (dropResult.ok) {
      return dropResult;
    }

    const fileInputResult = await tryDoubaoFileInput(file);
    return fileInputResult.ok
      ? fileInputResult
      : {
          ok: false,
          method: 'clipboard-fallback',
          error:
            fileInputResult.error ??
            dropResult.error ??
            pasteEventResult.error ??
            pasteCommandResult.error ??
            'AUTO_ATTACH_FAILED'
        };
  },

  async focusInput() {
    focusFirstInput(selectors.textInputs);
  }
};

async function tryDoubaoPasteClipboardViaCommand(file: File): Promise<AttachResult> {
  let lastError = 'PASTE_COMMAND_NO_PREVIEW';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const target = findFirstCandidate<HTMLElement>(selectors.textInputs, { visibleOnly: true });
    if (!target) {
      lastError = 'INPUT_NOT_FOUND';
      await sleep(300);
      continue;
    }

    try {
      const before = snapshotDoubaoAttachmentState(file);
      focusEditableTarget(target);
      await sleep(attempt === 0 ? 250 : 500);
      const didPaste = document.execCommand('paste');
      if (!didPaste) {
        lastError = 'PASTE_COMMAND_REJECTED';
        continue;
      }

      if (await waitForDoubaoAttachmentSuccess(before, file, 5500)) {
        return { ok: true, method: 'paste-command' };
      }
    } catch {
      lastError = 'PASTE_COMMAND_FAILED';
    }
  }

  return { ok: false, method: 'paste-command', error: lastError };
}

async function tryDoubaoSyntheticPaste(file: File): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(selectors.textInputs, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'paste-event', error: 'INPUT_NOT_FOUND' };
  }

  try {
    const before = snapshotDoubaoAttachmentState(file);
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

    if (await waitForDoubaoAttachmentSuccess(before, file, 5500)) {
      return { ok: true, method: 'paste-event' };
    }
  } catch {
    return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_FAILED' };
  }

  return { ok: false, method: 'paste-event', error: 'PASTE_EVENT_NO_PREVIEW' };
}

async function tryDoubaoDrop(file: File): Promise<AttachResult> {
  const target = findFirstCandidate<HTMLElement>(selectors.dropTargets, { visibleOnly: true });
  if (!target) {
    return { ok: false, method: 'drop-event', error: 'DROP_TARGET_NOT_FOUND' };
  }

  try {
    const before = snapshotDoubaoAttachmentState(file);
    focusEditableTarget(target);
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

    if (await waitForDoubaoAttachmentSuccess(before, file, 5500)) {
      return { ok: true, method: 'drop-event' };
    }
  } catch {
    return { ok: false, method: 'drop-event', error: 'DROP_EVENT_FAILED' };
  }

  return { ok: false, method: 'drop-event', error: 'DROP_EVENT_NO_PREVIEW' };
}

async function tryDoubaoFileInput(file: File): Promise<AttachResult> {
  const inputs = querySelectorCandidates<HTMLInputElement>(selectors.fileInputs, { visibleOnly: false }).filter(
    (input) => input.type === 'file' && acceptsImage(input)
  );

  let lastError = inputs.length > 0 ? 'FILE_INPUT_ATTACH_FAILED' : 'FILE_INPUT_NOT_FOUND';
  for (const input of inputs) {
    try {
      const before = snapshotDoubaoAttachmentState(file);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      if (await waitForDoubaoAttachmentSuccess(before, file, 5500)) {
        return { ok: true, method: 'file-input' };
      }
    } catch {
      lastError = 'FILE_INPUT_ATTACH_FAILED';
    }
  }

  return { ok: false, method: 'file-input', error: lastError };
}

interface DoubaoAttachmentState {
  previewCount: number;
  blobImageCount: number;
  editorDataImageCount: number;
  text: string;
  hadFileName: boolean;
}

function snapshotDoubaoAttachmentState(file: File): DoubaoAttachmentState {
  return {
    previewCount: countVisibleDoubaoPreviewElements(),
    blobImageCount: document.querySelectorAll('main img[src^="blob:"]').length,
    editorDataImageCount: document.querySelectorAll('main [contenteditable="true"] img[src^="data:image"]').length,
    text: document.body?.innerText ?? '',
    hadFileName: documentBodyIncludes(file.name)
  };
}

async function waitForDoubaoAttachmentSuccess(
  before: DoubaoAttachmentState,
  file: File,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const currentText = document.body?.innerText ?? '';
    const textDelta = currentText.slice(Math.min(before.text.length, currentText.length));

    if (countVisibleDoubaoPreviewElements() > before.previewCount) {
      return true;
    }

    if (document.querySelectorAll('main img[src^="blob:"]').length > before.blobImageCount) {
      return true;
    }

    if (
      document.querySelectorAll('main [contenteditable="true"] img[src^="data:image"]').length >
      before.editorDataImageCount
    ) {
      return true;
    }

    if (!before.hadFileName && documentBodyIncludes(file.name)) {
      return true;
    }

    if (uploadTextPatterns.some((pattern) => pattern.test(textDelta))) {
      return true;
    }

    await sleep(100);
  }

  return false;
}

function countVisibleDoubaoPreviewElements(): number {
  return querySelectorCandidates<Element>(selectors.attachmentPreviews, { visibleOnly: true }).filter(isVisible).length;
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

function documentBodyIncludes(text: string): boolean {
  return Boolean(text) && document.body?.innerText?.includes(text);
}
