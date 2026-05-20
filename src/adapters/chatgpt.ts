import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_DROP_TARGET_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  GENERIC_TEXT_INPUT_SELECTORS,
  focusFirstInput,
  shouldStopAttachmentStrategy,
  tryAttachViaDrop,
  tryAttachViaFileInput,
  tryAttachViaPaste,
  tryPasteClipboardViaCommand,
  waitForAnyElement
} from '../content/domUtils';

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'main form textarea',
    'main textarea',
    'main [contenteditable="true"]',
    'div[role="textbox"]',
    ...GENERIC_TEXT_INPUT_SELECTORS
  ],
  dropTargets: ['[data-testid="composer"]', 'main form', 'form', 'main', ...GENERIC_DROP_TARGET_SELECTORS],
  attachmentPreviews: [
    '[data-testid*="attachment" i]',
    '[data-testid*="upload" i]',
    '[aria-label*="attached" i]',
    '[aria-label*="remove" i]',
    'main form img[src^="blob:"]',
    ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS
  ]
};

export const chatgptAdapter: AiTargetAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  urlPatterns: ['https://chatgpt.com/*'],
  defaultUrl: 'https://chatgpt.com/',

  detect() {
    return location.hostname === 'chatgpt.com';
  },

  async waitUntilReady(timeoutMs: number) {
    return waitForAnyElement([...selectors.textInputs, ...selectors.fileInputs], timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    for (const strategy of [
      () => tryAttachViaFileInput(file, selectors.fileInputs, selectors.attachmentPreviews),
      () => tryAttachViaPaste(file, selectors.textInputs, selectors.attachmentPreviews),
      () => tryAttachViaDrop(file, selectors.dropTargets, selectors.attachmentPreviews)
    ]) {
      const result = await strategy();
      if (shouldStopAttachmentStrategy(result)) {
        return result;
      }
    }

    return { ok: false, method: 'clipboard-fallback', error: 'AUTO_ATTACH_FAILED' };
  },

  async pasteClipboardImage(): Promise<AttachResult> {
    return tryPasteClipboardViaCommand(selectors.textInputs, selectors.attachmentPreviews, {
      timeoutMs: 7000
    });
  },

  async focusInput() {
    focusFirstInput(selectors.textInputs);
  }
};
