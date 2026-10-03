import type { AdapterSelectorSet, AiTargetAdapter, AttachResult } from './types';
import {
  GENERIC_FILE_INPUT_SELECTORS,
  countPatternMatches,
  countVisibleMatches,
  findComposerScope,
  focusEditableTarget,
  focusFirstInput,
  getObservationText,
  tryAttachViaDrop,
  tryAttachViaFileInput,
  tryAttachViaPaste,
  tryPasteClipboardViaCommand,
  waitForAnyElement,
  type AttachStrategyOptions,
  type AttachmentChangeDetector
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

    const strategyOptions = createDoubaoStrategyOptions(file, composerRoot);
    const allowClipboardPaste = options?.allowClipboardPaste ?? true;
    let pasteCommandResult: AttachResult = {
      ok: false,
      method: 'paste-command',
      outcome: 'rejected',
      error: 'CLIPBOARD_PASTE_DISABLED'
    };
    if (allowClipboardPaste) {
      pasteCommandResult = await tryPasteClipboardViaCommand(
        selectors.textInputs,
        selectors.attachmentPreviews,
        strategyOptions
      );
      if (pasteCommandResult.ok || pasteCommandResult.outcome === 'unknown') {
        return pasteCommandResult;
      }
    }

    const pasteEventResult = await tryAttachViaPaste(file, selectors.textInputs, selectors.attachmentPreviews, {
      ...strategyOptions,
      composed: true
    });
    if (pasteEventResult.ok || pasteEventResult.outcome === 'unknown') {
      return pasteEventResult;
    }

    const dropResult = await tryAttachViaDrop(
      file,
      selectors.dropTargets,
      selectors.attachmentPreviews,
      strategyOptions
    );
    if (dropResult.ok || dropResult.outcome === 'unknown') {
      return dropResult;
    }

    const fileInputResult = await tryAttachViaFileInput(
      file,
      selectors.fileInputs,
      selectors.attachmentPreviews,
      strategyOptions
    );
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

function createDoubaoStrategyOptions(file: File, composerRoot: HTMLElement): AttachStrategyOptions {
  return {
    scopeRoot: composerRoot,
    timeoutMs: 5500,
    detector: doubaoAttachmentDetector(file),
    focusTarget: (target) => {
      // Doubao's editor only accepts paste and drop after it has been activated by a click.
      target.click();
      focusEditableTarget(target);
    }
  };
}

/** Doubao renders previews as blob images or inline data images, and only some of them carry labelled controls. */
function doubaoAttachmentDetector(file: File): AttachmentChangeDetector {
  return (observationRoot) => {
    const before = snapshotDoubaoAttachmentState(file, observationRoot);
    return () => {
      const current = snapshotDoubaoAttachmentState(file, observationRoot);
      return (
        current.previewCount > before.previewCount ||
        current.blobImageCount > before.blobImageCount ||
        current.editorDataImageCount > before.editorDataImageCount ||
        (!before.hadFileName && current.hadFileName) ||
        current.successTextCounts.some((count, index) => count > (before.successTextCounts[index] ?? 0))
      );
    };
  };
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
    previewCount: countVisibleMatches(selectors.attachmentPreviews, observationRoot),
    blobImageCount: observationRoot.querySelectorAll('img[src^="blob:"]').length,
    editorDataImageCount: observationRoot.querySelectorAll('[contenteditable="true"] img[src^="data:image"]').length,
    successTextCounts: uploadTextPatterns.map((pattern) => countPatternMatches(text, pattern)),
    hadFileName: text.includes(file.name)
  };
}

function findActiveDoubaoComposerRoot(): HTMLElement | undefined {
  return findComposerScope(selectors.textInputs, strongInputSelectors, {
    fallbackRootSelector: '[data-testid*="chat-input" i], [data-testid*="message-input" i], [data-testid*="input" i]'
  })?.root;
}
