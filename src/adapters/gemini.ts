import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_DROP_TARGET_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  GENERIC_TEXT_INPUT_SELECTORS,
  focusFirstInput,
  tryAttachViaPasteRelaxed,
  waitForAnyElement
} from '../content/domUtils';

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [
    'rich-textarea textarea',
    'rich-textarea [contenteditable="true"]',
    '[aria-label*="Enter a prompt" i]',
    '[aria-label*="输入提示" i]',
    'main textarea',
    'main [contenteditable="true"]',
    '[role="textbox"]',
    ...GENERIC_TEXT_INPUT_SELECTORS
  ],
  dropTargets: [
    'rich-textarea',
    'main form',
    'form',
    'main',
    '[role="textbox"]',
    ...GENERIC_DROP_TARGET_SELECTORS
  ],
  attachmentPreviews: [
    'file-preview',
    'image-preview',
    'upload-image',
    'mat-chip',
    '[data-testid*="attachment" i]',
    '[data-test-id*="attachment" i]',
    '[data-test-id*="file" i]',
    '[data-test-id*="upload" i]',
    '[aria-label*="attachment" i]',
    '[aria-label*="attached" i]',
    '[aria-label*="uploaded" i]',
    '[aria-label*="remove" i]',
    '[aria-label*="image" i]',
    'main img[src^="blob:"]',
    ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS
  ]
};

export const geminiAdapter: AiTargetAdapter = {
  id: 'gemini',
  name: 'Gemini',
  urlPatterns: ['https://gemini.google.com/*'],
  defaultUrl: 'https://gemini.google.com/',

  detect() {
    return location.hostname === 'gemini.google.com';
  },

  async waitUntilReady(timeoutMs: number) {
    return waitForAnyElement([...selectors.textInputs, ...selectors.fileInputs], timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const result = await tryAttachViaPasteRelaxed(file, selectors.textInputs, selectors.attachmentPreviews, {
      timeoutMs: 9000,
      successTextPatterns: [/uploading/i, /processing/i, /上传中/, /正在上传/, /处理中/]
    });
    return result.ok ? result : { ok: false, method: 'clipboard-fallback', error: result.error ?? 'AUTO_ATTACH_FAILED' };
  },

  async focusInput() {
    focusFirstInput(selectors.textInputs);
  }
};
