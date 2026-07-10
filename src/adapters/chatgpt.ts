import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  findExplicitComposerRoot,
  focusFirstInput,
  querySelectorCandidates,
  tryAttachViaDrop,
  tryAttachViaFileInput,
  tryAttachViaPaste,
  waitForAnyElement
} from '../content/domUtils';

const strongInputSelectors = ['#prompt-textarea', '[data-testid="prompt-textarea"]'];
const explicitComposerInputSelectors = [
  '[data-testid*="composer" i] textarea',
  '[data-testid*="composer" i] [contenteditable="true"]',
  '[data-testid*="composer" i] [role="textbox"]',
  '[data-test-id*="composer" i] textarea',
  '[data-test-id*="composer" i] [contenteditable="true"]',
  '[data-test-id*="composer" i] [role="textbox"]',
  '[class*="composer" i] textarea',
  '[class*="composer" i] [contenteditable="true"]',
  '[class*="composer" i] [role="textbox"]'
];

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [...strongInputSelectors, ...explicitComposerInputSelectors],
  dropTargets: ['[data-testid*="composer" i]', 'form', 'textarea', '[contenteditable="true"]', '[role="textbox"]'],
  attachmentPreviews: [
    '[data-testid*="attachment" i]',
    '[data-testid*="upload" i]',
    '[aria-label*="attached" i]',
    '[aria-label*="remove" i]',
    '[aria-label^="移除文件"]',
    '[aria-label^="打开图片"]',
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
    return waitForAnyElement(selectors.textInputs, timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const composerScope = findActiveChatGptComposerScope();
    if (!composerScope) {
      return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
    }
    const { root: composerRoot } = composerScope;

    for (const strategy of [
      () => tryAttachViaPaste(file, selectors.textInputs, selectors.attachmentPreviews, composerRoot),
      () => tryAttachViaFileInput(file, selectors.fileInputs, selectors.attachmentPreviews, composerRoot),
      () => tryAttachViaDrop(file, selectors.dropTargets, selectors.attachmentPreviews, composerRoot)
    ]) {
      const result = await strategy();
      if (result.ok || result.outcome === 'unknown') {
        return result;
      }
    }

    return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'AUTO_ATTACH_FAILED' };
  },

  async focusInput() {
    const composerScope = findActiveChatGptComposerScope();
    if (composerScope) {
      focusFirstInput(selectors.textInputs, composerScope.root);
    }
  }
};

function findActiveChatGptComposerScope(): { input: HTMLElement; root: HTMLElement } | undefined {
  const inputs = querySelectorCandidates<HTMLElement>(selectors.textInputs, { visibleOnly: true });
  for (const input of inputs) {
    const explicitRoot = findExplicitComposerRoot(input);
    if (explicitRoot) {
      return { input, root: explicitRoot };
    }

    if (strongInputSelectors.some((selector) => input.matches(selector))) {
      const form = input.closest('form');
      return { input, root: form instanceof HTMLElement ? form : input };
    }
  }

  return undefined;
}
