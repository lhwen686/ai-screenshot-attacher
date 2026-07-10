import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  findExplicitComposerRoot,
  focusFirstInput,
  querySelectorCandidates,
  tryAttachViaPaste,
  waitForAnyElement
} from '../content/domUtils';

const strongInputSelectors = [
  'main [contenteditable="true"][aria-label="Write your prompt to Claude"]',
  'main [role="textbox"][aria-label="Write your prompt to Claude"]',
  'main textarea[aria-label="Write your prompt to Claude"]'
];
const explicitComposerInputSelectors = [
  '[data-testid*="composer" i] [contenteditable="true"]',
  '[data-testid*="composer" i] [role="textbox"]',
  '[data-testid*="composer" i] textarea',
  '[data-test-id*="composer" i] [contenteditable="true"]',
  '[data-test-id*="composer" i] [role="textbox"]',
  '[data-test-id*="composer" i] textarea',
  '[class*="composer" i] [contenteditable="true"]',
  '[class*="composer" i] [role="textbox"]',
  '[class*="composer" i] textarea'
];

const selectors: AdapterSelectorSet = {
  fileInputs: [],
  textInputs: [...strongInputSelectors, ...explicitComposerInputSelectors],
  dropTargets: ['[data-testid*="composer" i]', '[data-test-id*="composer" i]', '[class*="composer" i]'],
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
    return waitForAnyElement(selectors.textInputs, timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const composerScope = findActiveClaudeComposerScope();
    if (!composerScope) {
      return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
    }
    const { root: composerRoot } = composerScope;

    const result = await tryAttachViaPaste(file, selectors.textInputs, selectors.attachmentPreviews, composerRoot);
    return result.ok || result.outcome === 'unknown'
      ? result
      : {
          ok: false,
          method: 'clipboard-fallback',
          outcome: 'rejected',
          error: result.error ?? 'AUTO_ATTACH_FAILED'
        };
  },

  async focusInput() {
    const composerScope = findActiveClaudeComposerScope();
    if (composerScope) {
      focusFirstInput(selectors.textInputs, composerScope.root);
    }
  }
};

function findActiveClaudeComposerScope(): { input: HTMLElement; root: HTMLElement } | undefined {
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
