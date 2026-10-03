import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  acceptsImage,
  countPatternMatches,
  findExplicitComposerRoot,
  focusFirstInput,
  getObservationText,
  isVisible,
  querySelectorCandidates,
  sleep,
  snapshotAttachmentCount,
  tryAttachViaDrop,
  tryAttachViaPasteRelaxed,
  tryPasteClipboardViaCommand,
  waitForAnyElement
} from '../content/domUtils';

const uploadTextPatterns = [/uploading/i, /processing/i, /attached/i, /上传中/, /正在上传/, /处理中/, /已附加/];
const uploadMenuTextPattern = /upload|attach|image|photo|file|device|上传|附件|图片|照片|文件|设备|本机/i;
const attachmentButtonTextPattern = /add|attach|upload|plus|more|添加|附件|上传|更多/i;
const submitActionTextPattern = /send|submit|发送|提交/i;
const invalidAttachmentTextPattern =
  /文件中没有内容|文件为空|empty file|file is empty|has no content|unable to upload|无法上传/i;
const strongInputSelectors = [
  'div[contenteditable="true"][aria-label*="prompt" i]',
  'div[contenteditable="true"][aria-label*="提示" i]',
  'textarea[aria-label*="prompt" i]',
  'textarea[aria-label*="提示" i]',
  '[aria-label*="Enter a prompt" i]',
  '[aria-label*="输入提示" i]'
];
const explicitComposerInputSelectors = [
  'bard-text-input .ql-editor[contenteditable="true"]',
  'bard-text-input textarea',
  'bard-text-input [contenteditable="true"]',
  'rich-textarea textarea',
  'rich-textarea [contenteditable="true"]',
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
const geminiMenuRootSelectors = ['[role="menu"]', '[role="listbox"]'];
const geminiActionSelectors = [
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  'input[type="button"]',
  'div[aria-label]',
  'span[aria-label]'
];

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [...strongInputSelectors, ...explicitComposerInputSelectors],
  dropTargets: [
    'bard-text-input',
    'rich-textarea',
    '.ql-editor[contenteditable="true"]',
    'main [contenteditable]:not([contenteditable="false"])',
    '[aria-label*="Ask Gemini" i]',
    '[aria-label*="问问 Gemini" i]',
    '[aria-label*="prompt" i]',
    '[aria-label*="提示" i]',
    'form',
    '[role="textbox"]',
    '[data-testid*="composer" i]'
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
    '[class*="image-preview" i]',
    '[class*="file-preview" i]',
    '[class*="upload" i]',
    '[class*="attachment" i]',
    'mat-progress-spinner',
    'mat-spinner',
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
    return waitForAnyElement(selectors.textInputs, timeoutMs);
  },

  async attachImage(file: File, options): Promise<AttachResult> {
    const composerRoot = findActiveGeminiComposerRoot();
    if (!composerRoot) {
      return { ok: false, method: 'clipboard-fallback', outcome: 'rejected', error: 'INPUT_NOT_FOUND' };
    }

    const allowClipboardPaste = options?.allowClipboardPaste ?? true;
    let pasteEventResult: AttachResult = {
      ok: false,
      method: 'paste-event',
      outcome: 'rejected',
      error: 'PASTE_EVENT_NOT_ATTEMPTED'
    };
    if (!allowClipboardPaste) {
      pasteEventResult = await tryAttachViaPasteRelaxed(file, selectors.textInputs, selectors.attachmentPreviews, {
        timeoutMs: 4500,
        successTextPatterns: uploadTextPatterns,
        scopeRoot: composerRoot
      });
      if (pasteEventResult.ok || pasteEventResult.outcome === 'unknown') {
        return pasteEventResult;
      }
    }

    const uploadResult = await tryGeminiUpload(file, composerRoot);
    if (uploadResult.ok || uploadResult.outcome === 'unknown') {
      return uploadResult;
    }

    let pasteCommandResult: AttachResult = {
      ok: false,
      method: 'paste-command',
      outcome: 'rejected',
      error: 'CLIPBOARD_PASTE_DISABLED'
    };
    if (allowClipboardPaste) {
      pasteCommandResult = await tryPasteClipboardViaCommand(selectors.textInputs, selectors.attachmentPreviews, {
        timeoutMs: 4500,
        successTextPatterns: uploadTextPatterns,
        scopeRoot: composerRoot
      });
      if (pasteCommandResult.ok || pasteCommandResult.outcome === 'unknown') {
        return pasteCommandResult;
      }
    }

    if (allowClipboardPaste) {
      pasteEventResult = await tryAttachViaPasteRelaxed(file, selectors.textInputs, selectors.attachmentPreviews, {
        timeoutMs: 4500,
        successTextPatterns: uploadTextPatterns,
        scopeRoot: composerRoot
      });
      if (pasteEventResult.ok || pasteEventResult.outcome === 'unknown') {
        return pasteEventResult;
      }
    }

    const dropResult = await tryAttachViaDrop(file, selectors.dropTargets, selectors.attachmentPreviews, composerRoot);
    return dropResult.ok || dropResult.outcome === 'unknown'
      ? dropResult
      : {
          ok: false,
          method: 'clipboard-fallback',
          outcome: 'rejected',
          error:
            dropResult.error ??
            pasteEventResult.error ??
            pasteCommandResult.error ??
            uploadResult.error ??
            'AUTO_ATTACH_FAILED'
        };
  },

  async focusInput() {
    const composerRoot = findActiveGeminiComposerRoot();
    if (composerRoot) {
      focusFirstInput(selectors.textInputs, composerRoot);
    }
  }
};

async function tryGeminiUpload(file: File, composerRoot: HTMLElement): Promise<AttachResult> {
  const composerRoots = [composerRoot];
  const directResult = await attachToGeminiFileInputs(file, composerRoots, []);
  if (directResult.ok || directResult.outcome === 'unknown' || directResult.error === 'GEMINI_FILE_INPUT_INVALID') {
    return directResult;
  }

  const existingMenuRoots = new Set(findVisibleGeminiMenuRoots());
  openGeminiAttachmentEntryPoint(composerRoots);
  await sleep(150);
  const newMenuRoots = findVisibleGeminiMenuRoots().filter((root) => !existingMenuRoots.has(root));
  clickGeminiUploadMenuItem(newMenuRoots);
  await sleep(150);

  const menuResult = await attachToGeminiFileInputs(file, composerRoots, newMenuRoots);
  if (menuResult.ok || menuResult.outcome === 'unknown') {
    return menuResult;
  }

  closeGeminiMenus(newMenuRoots);
  return {
    ok: false,
    method: 'file-input',
    outcome: 'rejected',
    error: menuResult.error ?? directResult.error ?? 'GEMINI_UPLOAD_INPUT_NOT_FOUND'
  };
}

async function attachToGeminiFileInputs(
  file: File,
  composerRoots: HTMLElement[],
  menuRoots: HTMLElement[]
): Promise<AttachResult> {
  const inputs = findGeminiFileInputs([...composerRoots, ...menuRoots]);

  if (inputs.length === 0) {
    return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_NOT_FOUND' };
  }

  for (const input of inputs) {
    let mutated = false;
    try {
      const observationRoot = composerRoots[0] ?? input;
      const before = snapshotGeminiUploadState(file, observationRoot);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      mutated = true;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      return await waitForGeminiUploadOutcome(before, file, observationRoot);
    } catch {
      if (mutated) {
        return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
      }
      continue;
    }
  }

  return { ok: false, method: 'file-input', outcome: 'rejected', error: 'FILE_INPUT_ATTACH_FAILED' };
}

interface GeminiUploadState {
  previewCount: number;
  invalidTextCount: number;
  uploadTextCounts: number[];
  hadFileName: boolean;
}

function snapshotGeminiUploadState(file: File, observationRoot: ParentNode): GeminiUploadState {
  const text = getObservationText(observationRoot);
  return {
    previewCount: snapshotAttachmentCount(selectors.attachmentPreviews, observationRoot),
    invalidTextCount: countPatternMatches(text, invalidAttachmentTextPattern),
    uploadTextCounts: uploadTextPatterns.map((pattern) => countPatternMatches(text, pattern)),
    hadFileName: text.includes(file.name)
  };
}

async function waitForGeminiUploadOutcome(
  before: GeminiUploadState,
  file: File,
  observationRoot: ParentNode
): Promise<AttachResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 2500) {
    // Compare match counts rather than slicing by the previous text length, so edits elsewhere in the composer
    // cannot shift old status text into the "new" range.
    const current = snapshotGeminiUploadState(file, observationRoot);

    if (current.invalidTextCount > before.invalidTextCount) {
      return { ok: false, method: 'file-input', outcome: 'unknown', error: 'GEMINI_FILE_INPUT_INVALID' };
    }

    if (
      current.previewCount > before.previewCount ||
      current.uploadTextCounts.some((count, index) => count > (before.uploadTextCounts[index] ?? 0)) ||
      (!before.hadFileName && current.hadFileName)
    ) {
      return { ok: true, method: 'file-input', outcome: 'confirmed' };
    }

    await sleep(100);
  }

  return { ok: false, method: 'file-input', outcome: 'unknown', error: 'FILE_INPUT_ATTACH_UNCONFIRMED' };
}

function openGeminiAttachmentEntryPoint(composerRoots: HTMLElement[]): void {
  const candidates = visibleActionCandidates(composerRoots);
  const namedButton = candidates.find((candidate) => {
    const name = getElementName(candidate);
    return attachmentButtonTextPattern.test(name) && !isSubmitAction(candidate, name);
  });
  if (namedButton) {
    namedButton.click();
  }
}

function clickGeminiUploadMenuItem(menuRoots: HTMLElement[]): void {
  const menuItem = visibleActionCandidates(menuRoots).find((candidate) => {
    const name = getElementName(candidate);
    return uploadMenuTextPattern.test(name) && !isSubmitAction(candidate, name);
  });
  menuItem?.click();
}

function closeGeminiMenus(menuRoots: HTMLElement[]): void {
  // A menu the adapter opened must not stay on screen when no upload input was found. Escape is the standard
  // dismissal for Material menus and never activates a menu item.
  for (const root of menuRoots) {
    if (!root.isConnected) {
      continue;
    }
    const target = root.contains(document.activeElement) ? (document.activeElement as HTMLElement) : root;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }
}

function isSubmitAction(element: HTMLElement, name: string): boolean {
  if (submitActionTextPattern.test(name)) {
    return true;
  }

  return (
    (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
    element.type === 'submit' &&
    element.form !== null
  );
}

function visibleActionCandidates(roots: HTMLElement[]): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  for (const root of roots) {
    for (const selector of geminiActionSelectors) {
      try {
        root.querySelectorAll<HTMLElement>(selector).forEach((candidate) => {
          if (isVisible(candidate)) {
            candidates.add(candidate);
          }
        });
      } catch {
        continue;
      }
    }
  }

  return Array.from(candidates);
}

function findActiveGeminiComposerRoot(): HTMLElement | undefined {
  const inputs = querySelectorCandidates<HTMLElement>(selectors.textInputs, { visibleOnly: true });
  for (const input of inputs) {
    const explicitRoot = findExplicitComposerRoot(input);
    if (explicitRoot) {
      return explicitRoot;
    }

    if (strongInputSelectors.some((selector) => input.matches(selector))) {
      const form = input.closest('form');
      return form instanceof HTMLElement ? form : input;
    }
  }

  return undefined;
}

function findVisibleGeminiMenuRoots(): HTMLElement[] {
  return querySelectorCandidates<HTMLElement>(geminiMenuRootSelectors, { visibleOnly: true });
}

function findGeminiFileInputs(roots: HTMLElement[]): HTMLInputElement[] {
  const inputs = new Set<HTMLInputElement>();

  for (const root of roots) {
    for (const selector of selectors.fileInputs) {
      try {
        root.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
          if (input.type === 'file' && acceptsImage(input)) {
            inputs.add(input);
          }
        });
      } catch {
        continue;
      }
    }
  }

  return Array.from(inputs);
}

function getElementName(element: HTMLElement): string {
  return [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('data-tooltip'),
    element.getAttribute('data-test-id'),
    element.textContent
  ]
    .filter(Boolean)
    .join(' ');
}
