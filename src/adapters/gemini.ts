import type { AiTargetAdapter, AttachResult, AdapterSelectorSet } from './types';
import {
  GENERIC_ATTACHMENT_PREVIEW_SELECTORS,
  GENERIC_DROP_TARGET_SELECTORS,
  GENERIC_FILE_INPUT_SELECTORS,
  GENERIC_TEXT_INPUT_SELECTORS,
  focusFirstInput,
  isVisible,
  querySelectorCandidates,
  sleep,
  snapshotAttachmentCount,
  tryAttachViaDrop,
  tryAttachViaPasteRelaxed,
  tryPasteClipboardViaCommand,
  waitForAttachmentChange,
  waitForAnyElement
} from '../content/domUtils';

const uploadTextPatterns = [/uploading/i, /processing/i, /attached/i, /上传中/, /正在上传/, /处理中/, /已附加/];
const uploadMenuTextPattern = /upload|attach|image|photo|file|device|上传|附件|图片|照片|文件|设备|本机/i;
const attachmentButtonTextPattern = /add|attach|upload|plus|more|添加|附件|上传|更多/i;
const invalidAttachmentTextPattern = /文件中没有内容|文件为空|empty file|file is empty|has no content|unable to upload|无法上传/i;

const selectors: AdapterSelectorSet = {
  fileInputs: [...GENERIC_FILE_INPUT_SELECTORS],
  textInputs: [
    '.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'div[contenteditable="true"][aria-label*="提示" i]',
    'main [contenteditable]:not([contenteditable="false"])',
    'bard-text-input textarea',
    'bard-text-input [contenteditable="true"]',
    'rich-textarea textarea',
    'rich-textarea [contenteditable="true"]',
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="提示" i]',
    '[aria-label*="Enter a prompt" i]',
    '[aria-label*="输入提示" i]',
    'main textarea',
    'main [contenteditable="true"]',
    '[role="textbox"]',
    ...GENERIC_TEXT_INPUT_SELECTORS
  ],
  dropTargets: [
    'bard-text-input',
    'rich-textarea',
    '.ql-editor[contenteditable="true"]',
    'main [contenteditable]:not([contenteditable="false"])',
    '[aria-label*="Ask Gemini" i]',
    '[aria-label*="问问 Gemini" i]',
    '[aria-label*="prompt" i]',
    '[aria-label*="提示" i]',
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
    return waitForAnyElement([...selectors.textInputs, ...selectors.fileInputs, ...selectors.dropTargets], timeoutMs);
  },

  async attachImage(file: File): Promise<AttachResult> {
    const uploadResult = await tryGeminiUpload(file);
    if (uploadResult.ok) {
      return uploadResult;
    }

    const pasteCommandResult = await tryPasteClipboardViaCommand(selectors.textInputs, selectors.attachmentPreviews, {
      timeoutMs: 4500,
      successTextPatterns: uploadTextPatterns
    });
    if (pasteCommandResult.ok) {
      return pasteCommandResult;
    }

    const pasteEventResult = await tryAttachViaPasteRelaxed(file, selectors.textInputs, selectors.attachmentPreviews, {
      timeoutMs: 4500,
      successTextPatterns: uploadTextPatterns
    });
    if (pasteEventResult.ok) {
      return pasteEventResult;
    }

    const dropResult = await tryAttachViaDrop(file, selectors.dropTargets, selectors.attachmentPreviews);
    return dropResult.ok
      ? dropResult
      : {
          ok: false,
          method: 'clipboard-fallback',
          error: dropResult.error ?? pasteEventResult.error ?? pasteCommandResult.error ?? uploadResult.error ?? 'AUTO_ATTACH_FAILED'
        };
  },

  async focusInput() {
    focusFirstInput(selectors.textInputs);
  }
};

async function tryGeminiUpload(file: File): Promise<AttachResult> {
  const directResult = await attachToGeminiFileInputs(file);
  if (directResult.ok) {
    return directResult;
  }

  await openGeminiAttachmentEntryPoint();
  await sleep(150);
  await clickGeminiUploadMenuItem();
  await sleep(150);

  const menuResult = await attachToGeminiFileInputs(file);
  return menuResult.ok ? menuResult : { ok: false, method: 'file-input', error: menuResult.error ?? directResult.error ?? 'GEMINI_UPLOAD_INPUT_NOT_FOUND' };
}

async function attachToGeminiFileInputs(file: File): Promise<AttachResult> {
  const inputs = querySelectorCandidates<HTMLInputElement>(selectors.fileInputs, { visibleOnly: false }).filter(
    (input) => input.type === 'file' && acceptsGeminiImage(input)
  );

  let lastError: string | undefined = inputs.length > 0 ? undefined : 'FILE_INPUT_NOT_FOUND';

  for (const input of inputs) {
    try {
      const beforeCount = snapshotAttachmentCount(selectors.attachmentPreviews);
      const beforeText = document.body?.innerText ?? '';
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      const result = await waitForGeminiUploadOutcome(beforeCount, beforeText, file);
      if (result.ok) {
        return result;
      }
      lastError = result.error;
    } catch {
      lastError = 'FILE_INPUT_ATTACH_FAILED';
    }
  }

  return { ok: false, method: 'file-input', error: lastError ?? 'FILE_INPUT_ATTACH_FAILED' };
}

async function waitForGeminiUploadOutcome(beforeCount: number, beforeText: string, file: File): Promise<AttachResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 2500) {
    const currentText = document.body?.innerText ?? '';
    const newText = currentText.slice(Math.min(beforeText.length, currentText.length));

    if (invalidAttachmentTextPattern.test(newText) || invalidAttachmentTextPattern.test(currentText)) {
      return { ok: false, method: 'file-input', error: 'GEMINI_FILE_INPUT_INVALID' };
    }

    if (
      snapshotAttachmentCount(selectors.attachmentPreviews) > beforeCount ||
      uploadTextPatterns.some((pattern) => pattern.test(newText) || pattern.test(currentText)) ||
      (await waitForAttachmentChange(selectors.attachmentPreviews, beforeCount, 100, file))
    ) {
      return { ok: true, method: 'file-input' };
    }

    await sleep(100);
  }

  return { ok: false, method: 'file-input', error: 'FILE_INPUT_ATTACH_FAILED' };
}

async function openGeminiAttachmentEntryPoint(): Promise<void> {
  const namedButton = visibleActionCandidates().find((candidate) => attachmentButtonTextPattern.test(getElementName(candidate)));
  if (namedButton) {
    namedButton.click();
    return;
  }

  const positionedButton = visibleActionCandidates()
    .filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.top > window.innerHeight * 0.35 && rect.left > 80 && rect.left < window.innerWidth * 0.5;
    })
    .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)[0];

  positionedButton?.click();
}

async function clickGeminiUploadMenuItem(): Promise<void> {
  const menuItem = visibleActionCandidates().find((candidate) => uploadMenuTextPattern.test(getElementName(candidate)));
  menuItem?.click();
}

function visibleActionCandidates(): HTMLElement[] {
  return querySelectorCandidates<HTMLElement>(
    [
      'button',
      '[role="button"]',
      '[role="menuitem"]',
      'input[type="button"]',
      'div[aria-label]',
      'span[aria-label]'
    ],
    { visibleOnly: true }
  ).filter(isVisible);
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

function acceptsGeminiImage(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase();
  return !accept || accept.includes('image') || accept.includes('.png') || accept.includes('.jpg') || accept.includes('.jpeg') || accept.includes('.webp');
}
