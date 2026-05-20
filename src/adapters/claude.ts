import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_DROP_TARGET_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  GENERIC_TEXT_INPUT_SELECTORS,
  focusFirstInput,
  tryAttachViaPaste,
  waitForAnyElement
} from '../content/domUtils';

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [
    'div[contenteditable="true"]',
    'main div[contenteditable="true"]',
    '[role="textbox"]',
    'main [role="textbox"]',
    'textarea',
    ...GENERIC_TEXT_INPUT_SELECTORS
  ],
  dropTargets: [
    'main form',
    'form',
    'main div[contenteditable="true"]',
    '[role="textbox"]',
    'main',
    ...GENERIC_DROP_TARGET_SELECTORS
  ],
  attachmentPreviews: [
    '[data-testid*="attachment" i]',
    '[data-testid*="file" i]',
    '[aria-label*="attachment" i]',
    '[aria-label*="remove" i]',
    'main img[src^="blob:"]',
    ...GENERIC_ATTACHMENT_PREVIEW_SELECTORS
  ]
};

export const claudeAdapter: AiTargetAdapter = {
  id: 'claude',
  name: 'Claude',
  urlPatterns: ['https://claude.ai/*'],
  defaultUrl: 'https://claude.ai/',

  detect() {
    return location.hostname === 'claude.ai';
  },

  async waitUntilReady(timeoutMs: number) {
    return waitForAnyElement([...selectors.textInputs, ...selectors.fileInputs], timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const result = await tryAttachViaPaste(file, selectors.textInputs, selectors.attachmentPreviews);
    return result.ok
      ? result
      : { ok: false, method: 'clipboard-fallback', error: result.error ?? 'AUTO_ATTACH_FAILED' };
  },

  async focusInput() {
    focusFirstInput(selectors.textInputs);
  }
};
