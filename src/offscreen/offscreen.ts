import {
  SUPPORTED_CLIPBOARD_IMAGE_TYPES,
  type ClipboardImagePayload,
  type ClipboardReadResult,
  type OffscreenMonitorResult,
  type ClipboardWriteResult,
  type OffscreenClipboardMessage,
  type SupportedClipboardImageType
} from '../clipboard/types';
import { USER_MESSAGES } from '../shared/constants';
import type { AutoClipboardImageDetectedMessage } from '../shared/messages';

let monitorTimer: number | undefined;
let lastMonitorFingerprint: string | undefined;
let lastSentFingerprint: string | undefined;
let lastSentAt = 0;
let monitorPollInFlight = false;

chrome.runtime.onMessage.addListener((message: OffscreenClipboardMessage, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_READ_CLIPBOARD_IMAGE') {
    readClipboardImageInDocument().then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE') {
    writeClipboardImageInDocument(message.image).then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_START_AUTO_MONITOR') {
    startAutoMonitor(message.intervalMs ?? 1500).then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_STOP_AUTO_MONITOR') {
    stopAutoMonitor().then(sendResponse);
    return true;
  }

  return false;
});

async function readClipboardImageInDocument(options: { usePasteFallback: boolean } = { usePasteFallback: true }): Promise<ClipboardReadResult> {
  let asyncClipboardError: ClipboardReadResult | undefined;

  try {
    const items = await navigator.clipboard.read();
    let foundUnsupportedImage = false;

    for (const item of items) {
      const supportedType = SUPPORTED_CLIPBOARD_IMAGE_TYPES.find((type) => item.types.includes(type));
      const imageType = item.types.find((type) => type.startsWith('image/'));

      if (!supportedType) {
        foundUnsupportedImage = foundUnsupportedImage || Boolean(imageType);
        continue;
      }

      return blobToClipboardPayload(await item.getType(supportedType), supportedType);
    }

    asyncClipboardError = {
      ok: false,
      error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
      message: foundUnsupportedImage ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。' : USER_MESSAGES.noClipboardImage
    };
  } catch (error) {
    const type = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
      ? 'NO_PERMISSION'
      : 'CLIPBOARD_READ_FAILED';

    asyncClipboardError = {
      ok: false,
      error: type,
      message: type === 'NO_PERMISSION' ? '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。' : '读取剪贴板失败，请重新截图后再试。'
    };
  }

  if (!options.usePasteFallback) {
    return asyncClipboardError ?? {
      ok: false,
      error: 'CLIPBOARD_READ_FAILED',
      message: '读取剪贴板失败，请重新截图后再试。'
    };
  }

  const pasteCommandResult = await readClipboardImageByPasteCommand();
  if (pasteCommandResult.ok) {
    return pasteCommandResult;
  }

  return asyncClipboardError ?? pasteCommandResult;
}

async function writeClipboardImageInDocument(image: ClipboardImagePayload): Promise<ClipboardWriteResult> {
  try {
    const blob = dataUrlToBlob(image.dataUrl, image.mimeType);
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || image.mimeType]: blob
      })
    ]);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'CLIPBOARD_WRITE_FAILED',
      message: '写回剪贴板失败，请重新截图后手动粘贴。'
    };
  }
}

async function startAutoMonitor(intervalMs: number): Promise<OffscreenMonitorResult> {
  if (monitorTimer !== undefined) {
    return { ok: true, active: true };
  }

  try {
    const initialResult = await readClipboardImageForAutoMonitor();
    if (!initialResult.ok && ['NO_PERMISSION', 'CLIPBOARD_READ_FAILED'].includes(initialResult.error)) {
      return {
        ok: false,
        active: false,
        message: initialResult.message
      };
    }

    lastMonitorFingerprint = initialResult.ok ? await createImageFingerprint(initialResult.image) : undefined;
  } catch {
    lastMonitorFingerprint = undefined;
  }

  monitorTimer = window.setInterval(() => {
    void pollClipboardForNewImage();
  }, intervalMs);

  return { ok: true, active: true };
}

async function stopAutoMonitor(): Promise<OffscreenMonitorResult> {
  if (monitorTimer !== undefined) {
    window.clearInterval(monitorTimer);
    monitorTimer = undefined;
  }

  monitorPollInFlight = false;
  lastMonitorFingerprint = undefined;
  lastSentFingerprint = undefined;
  lastSentAt = 0;
  return { ok: true, active: false };
}

async function readClipboardImageForAutoMonitor(): Promise<ClipboardReadResult> {
  return readClipboardImageInDocument({ usePasteFallback: true });
}

async function pollClipboardForNewImage(): Promise<void> {
  if (monitorPollInFlight) {
    return;
  }

  monitorPollInFlight = true;
  try {
    const result = await readClipboardImageForAutoMonitor();
    if (!result.ok) {
      if (result.error === 'NO_IMAGE_IN_CLIPBOARD' || result.error === 'UNSUPPORTED_IMAGE_TYPE') {
        lastMonitorFingerprint = undefined;
      }
      return;
    }

    const fingerprint = await createImageFingerprint(result.image);
    if (fingerprint === lastMonitorFingerprint) {
      return;
    }

    lastMonitorFingerprint = fingerprint;
    if (isRecentlySent(fingerprint)) {
      return;
    }

    lastSentFingerprint = fingerprint;
    lastSentAt = Date.now();
    const message: AutoClipboardImageDetectedMessage = {
      type: 'AUTO_CLIPBOARD_IMAGE_DETECTED',
      image: result.image,
      fingerprint
    };
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } finally {
    monitorPollInFlight = false;
  }
}

function isRecentlySent(fingerprint: string): boolean {
  return fingerprint === lastSentFingerprint && Date.now() - lastSentAt < 10000;
}

async function createImageFingerprint(image: ClipboardImagePayload): Promise<string> {
  const bytes = new TextEncoder().encode(`${image.mimeType}:${image.size}:${image.dataUrl}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function convertToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!pngBlob) {
    throw new Error('PNG conversion failed');
  }
  return pngBlob;
}

async function blobToClipboardPayload(
  sourceBlob: Blob,
  sourceType: SupportedClipboardImageType
): Promise<ClipboardReadResult> {
  const pngBlob = sourceType === 'image/png' ? sourceBlob : await convertToPng(sourceBlob);
  const dataUrl = await blobToDataUrl(pngBlob);
  const timestamp = Date.now();

  return {
    ok: true,
    image: {
      dataUrl,
      mimeType: 'image/png',
      fileName: `screenshot-${timestamp}.png`,
      size: pngBlob.size,
      lastModified: timestamp
    }
  };
}

function readClipboardImageByPasteCommand(): Promise<ClipboardReadResult> {
  return new Promise((resolve) => {
    const target = document.createElement('div');
    let settled = false;
    let foundUnsupportedImage = false;

    target.contentEditable = 'true';
    target.setAttribute('aria-hidden', 'true');
    target.style.position = 'fixed';
    target.style.left = '-9999px';
    target.style.top = '0';
    target.style.width = '1px';
    target.style.height = '1px';
    document.body.appendChild(target);

    const cleanup = () => {
      target.removeEventListener('paste', onPaste);
      target.remove();
    };

    const done = (result: ClipboardReadResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      done({
        ok: false,
        error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
        message: foundUnsupportedImage ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。' : USER_MESSAGES.noClipboardImage
      });
    }, 800);

    async function onPaste(event: ClipboardEvent) {
      event.preventDefault();
      window.clearTimeout(timer);

      const data = event.clipboardData;
      const files = Array.from(data?.files ?? []);
      const supportedFile = files.find((file) =>
        SUPPORTED_CLIPBOARD_IMAGE_TYPES.includes(file.type as SupportedClipboardImageType)
      );

      if (supportedFile) {
        done(await blobToClipboardPayload(supportedFile, supportedFile.type as SupportedClipboardImageType));
        return;
      }

      const items = Array.from(data?.items ?? []);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          foundUnsupportedImage = true;
        }

        if (!SUPPORTED_CLIPBOARD_IMAGE_TYPES.includes(item.type as SupportedClipboardImageType)) {
          continue;
        }

        const file = item.getAsFile();
        if (file) {
          done(await blobToClipboardPayload(file, item.type as SupportedClipboardImageType));
          return;
        }
      }

      done({
        ok: false,
        error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
        message: foundUnsupportedImage ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。' : USER_MESSAGES.noClipboardImage
      });
    }

    target.addEventListener('paste', onPaste);
    target.focus();

    try {
      const didPaste = document.execCommand('paste');
      if (!didPaste) {
        window.clearTimeout(timer);
        done({
          ok: false,
          error: 'NO_PERMISSION',
          message: '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。'
        });
      }
    } catch {
      window.clearTimeout(timer);
      done({
        ok: false,
        error: 'NO_PERMISSION',
        message: '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。'
      });
    }
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, fallbackType: SupportedClipboardImageType): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeType = /data:([^;]+);base64/.exec(header)?.[1] ?? fallbackType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
