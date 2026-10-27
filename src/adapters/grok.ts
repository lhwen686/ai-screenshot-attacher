import type { AiTargetAdapter, AttachResult } from './types';
import { AI_TARGETS, isTargetUrl } from '../shared/constants';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  findFirstCandidate,
  focusEditableTarget,
  tryAttachViaFileInput,
  tryAttachViaPaste,
  tryAttachViaDrop,
  waitForAnyElement
} from '../content/domUtils';

// Observed on public grok.com on 2026-10-27: the file input is outside .query-bar, inside this form.
// Observe the whole composer so attachment previews outside the editor can also be detected.
const composerSelector = 'form[data-composer="true"]';
const textInputs = [
  `${composerSelector} [data-testid="chat-input"] [contenteditable="true"][role="combobox"]:not([aria-disabled="true"])`,
  `${composerSelector} [data-testid="chat-input"] textarea:not(:disabled):not([aria-disabled="true"])`
];
const attachmentPreviews = [...GENERIC_ATTACHMENT_PREVIEW_SELECTORS];

function findComposer(): { input: HTMLElement; root: HTMLFormElement } | undefined {
  const input = findFirstCandidate<HTMLElement>(textInputs, { visibleOnly: true });
  const root = input?.closest(composerSelector);
  return input && root instanceof HTMLFormElement ? { input, root } : undefined;
}

export const grokAdapter: AiTargetAdapter = {
  ...AI_TARGETS.grok,
  detect() {
    return isTargetUrl(location.href, AI_TARGETS.grok.hostnames);
  },
  waitUntilReady(timeoutMs: number) {
    return waitForAnyElement(textInputs, timeoutMs);
  },
  async attachImage(file: File): Promise<AttachResult> {
    const composer = findComposer();
    if (!composer) {
      return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
    }
    const options = { scopeRoot: composer.root, timeoutMs: 8000 };
    // Use the captured File for both manual and automatic requests. No system clipboard paste,
    // upload-menu clicks, send-button clicks, or inputs outside the active composer are needed.
    for (const strategy of [
      () => tryAttachViaFileInput(file, GENERIC_FILE_INPUT_SELECTORS, attachmentPreviews, options),
      () =>
        tryAttachViaPaste(file, textInputs, attachmentPreviews, {
          ...options,
          composed: true,
          focusTarget: focusEditableTarget
        }),
      () => tryAttachViaDrop(file, [composerSelector], attachmentPreviews, options)
    ]) {
      const result = await strategy();
      if (result.ok || result.outcome === 'unknown') {
        return result;
      }
    }
    return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'AUTO_ATTACH_FAILED' };
  },
  async focusInput() {
    const composer = findComposer();
    if (composer) {
      focusEditableTarget(composer.input);
    }
  }
};
