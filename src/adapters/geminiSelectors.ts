// Gemini DOM knowledge shared by the content-script adapter and the real-paste function that the service worker
// injects on its own (executeGeminiClipboardPasteRuntime in tabManager.ts). That injected function cannot import
// anything, so it receives these values as script arguments: keep them plain selector strings and patterns.

// Signed-out gemini.google.com wrapped the composer in `input-area-v2` instead of `bard-text-input` on 2026-10-27,
// with attachment previews outside `rich-textarea`. Keep both wrappers.
export const GEMINI_COMPOSER_ROOT_SELECTOR =
  'bard-text-input, input-area-v2, [data-testid*="composer" i], [data-test-id*="composer" i], [class*="composer" i]';

export const GEMINI_COMPOSER_INPUT_SELECTORS = [
  'bard-text-input .ql-editor.textarea.new-input-ui',
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

/** Elements Gemini renders inside the composer while an upload is pending or after it has attached. */
export const GEMINI_UPLOAD_PREVIEW_SELECTORS = [
  'file-preview',
  'image-preview',
  'upload-image',
  'mat-chip',
  'img[src^="blob:"]',
  '[class*="image-preview" i]',
  '[class*="file-preview" i]',
  '[class*="upload" i]',
  '[class*="attachment" i]',
  '[aria-label*="attached" i]',
  '[aria-label*="uploaded" i]',
  '[aria-label*="remove" i]',
  'mat-progress-spinner',
  'mat-spinner'
];

export const GEMINI_UPLOAD_TEXT_PATTERNS = [
  /uploading/i,
  /processing/i,
  /attached/i,
  /上传中/,
  /正在上传/,
  /处理中/,
  /已附加/
];
