import {
  SUPPORTED_CLIPBOARD_IMAGE_TYPES,
  type ClipboardImagePayload,
  type ClipboardReadResult,
  type OffscreenMonitorResult,
  type ClipboardWriteResult,
  type OffscreenClipboardMessage,
  type SupportedClipboardImageType
} from '../clipboard/types';
import { AUTO_MONITOR_BASELINE_HEARTBEAT_MS, AUTO_MONITOR_BASELINE_KEY, USER_MESSAGES } from '../shared/constants';
import type { AutoClipboardImageDetectedMessage, OffscreenClipboardWriteTimedOutMessage } from '../shared/messages';

const CLIPBOARD_READ_DEADLINE_MS = 5000;
const CLIPBOARD_WRITE_DEADLINE_MS = 10000;
const MONITOR_DELIVERY_DEADLINE_MS = 60000;
const PASTE_FALLBACK_DEADLINE_MS = 5000;
const CLIPBOARD_WRITE_SUPPRESSION_MS = 120000;

let monitorTimer: number | undefined;
let lastMonitorFingerprint: string | undefined;
let monitorBaselinePending = true;
let lastSentFingerprint: string | undefined;
let lastSentAt = 0;
let pendingDelivery: { fingerprint: string; deliveryId: string } | undefined;
let deliverySequence = 0;
const suppressedWriteFingerprints = new Map<string, number>();
let monitorPollInFlight = false;
let monitorGeneration = 0;
let clipboardWriteGeneration = 0;
let clipboardWritesInFlight = 0;
let persistedMonitorBaselineKnown = false;
let persistedMonitorBaselineFingerprint: string | undefined;
let persistedMonitorBaselineAt = 0;

chrome.runtime.onMessage.addListener((message: OffscreenClipboardMessage, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_READ_CLIPBOARD_IMAGE') {
    readClipboardImageInDocument().then(sendResponse, () => {
      sendResponse({
        ok: false,
        error: 'CLIPBOARD_READ_FAILED',
        message: '读取剪贴板失败，请重新截图后再试。'
      });
    });
    return true;
  }

  if (message.type === 'OFFSCREEN_WRITE_CLIPBOARD_IMAGE') {
    writeClipboardImageInDocument(message.image).then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_START_AUTO_MONITOR') {
    startAutoMonitor(message.intervalMs ?? 1500, message.resumeBaseline).then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_STOP_AUTO_MONITOR') {
    stopAutoMonitor().then(sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_REGISTER_CLIPBOARD_WRITE_FINGERPRINT') {
    registerSuppressedWriteFingerprint(message.fingerprint);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function readClipboardImageInDocument(
  options: { usePasteFallback: boolean } = { usePasteFallback: true }
): Promise<ClipboardReadResult> {
  let asyncClipboardError: ClipboardReadResult | undefined;

  try {
    const items = await withTimeout(navigator.clipboard.read(), CLIPBOARD_READ_DEADLINE_MS);
    let foundUnsupportedImage = false;

    for (const item of items) {
      const supportedType = SUPPORTED_CLIPBOARD_IMAGE_TYPES.find((type) => item.types.includes(type));
      const imageType = item.types.find((type) => type.startsWith('image/'));

      if (!supportedType) {
        foundUnsupportedImage = foundUnsupportedImage || Boolean(imageType);
        continue;
      }

      const blob = await withTimeout(item.getType(supportedType), CLIPBOARD_READ_DEADLINE_MS);
      return await withTimeout(blobToClipboardPayload(blob, supportedType), CLIPBOARD_READ_DEADLINE_MS);
    }

    asyncClipboardError = {
      ok: false,
      error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
      message: foundUnsupportedImage ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。' : USER_MESSAGES.noClipboardImage
    };
  } catch (error) {
    const type =
      error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
        ? 'NO_PERMISSION'
        : 'CLIPBOARD_READ_FAILED';

    asyncClipboardError = {
      ok: false,
      error: type,
      message:
        type === 'NO_PERMISSION'
          ? '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。'
          : '读取剪贴板失败，请重新截图后再试。'
    };
  }

  if (!options.usePasteFallback) {
    return (
      asyncClipboardError ?? {
        ok: false,
        error: 'CLIPBOARD_READ_FAILED',
        message: '读取剪贴板失败，请重新截图后再试。'
      }
    );
  }

  const pasteCommandResult = await readClipboardImageByPasteCommand();
  if (pasteCommandResult.ok) {
    return pasteCommandResult;
  }

  return asyncClipboardError ?? pasteCommandResult;
}

async function writeClipboardImageInDocument(image: ClipboardImagePayload): Promise<ClipboardWriteResult> {
  if (clipboardWritesInFlight > 0) {
    return clipboardWriteFailure();
  }

  clipboardWriteGeneration += 1;
  clipboardWritesInFlight += 1;
  let finalized = false;
  const finalizeWrite = (writeSucceeded: boolean, fingerprint?: string) => {
    if (finalized) {
      return;
    }
    finalized = true;
    if (writeSucceeded) {
      lastMonitorFingerprint = fingerprint;
      // Chrome may re-encode images written through the async clipboard API, so the bytes read back can differ
      // from the written payload. The next successful read becomes the baseline instead of a new screenshot.
      monitorBaselinePending = true;
      pendingDelivery = undefined;
      persistMonitorBaselineFingerprint(fingerprint);
      if (fingerprint) {
        registerSuppressedWriteFingerprint(fingerprint);
      }
    }
    clipboardWritesInFlight = Math.max(0, clipboardWritesInFlight - 1);
    clipboardWriteGeneration += 1;
  };

  let fingerprint: string | undefined;
  try {
    fingerprint = await withTimeout(createImageFingerprint(image), CLIPBOARD_READ_DEADLINE_MS);
  } catch {
    fingerprint = undefined;
  }

  let writePromise: Promise<void>;
  try {
    const blob = dataUrlToBlob(image.dataUrl, image.mimeType);
    writePromise = navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || image.mimeType]: blob
      })
    ]);
  } catch {
    finalizeWrite(false);
    return clipboardWriteFailure();
  }

  try {
    await withTimeout(writePromise, CLIPBOARD_WRITE_DEADLINE_MS);
    finalizeWrite(true, fingerprint);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'OFFSCREEN_OPERATION_TIMEOUT') {
      void writePromise.then(
        () => finalizeWrite(true, fingerprint),
        () => finalizeWrite(false)
      );
      const recoveryMessage: OffscreenClipboardWriteTimedOutMessage = {
        type: 'OFFSCREEN_CLIPBOARD_WRITE_TIMED_OUT',
        fingerprint
      };
      void chrome.runtime.sendMessage(recoveryMessage).catch(() => undefined);
    } else {
      finalizeWrite(false);
    }
    return clipboardWriteFailure();
  }
}

function clipboardWriteFailure(): ClipboardWriteResult {
  return {
    ok: false,
    error: 'CLIPBOARD_WRITE_FAILED',
    message: '写回剪贴板失败，请重新截图后手动粘贴。'
  };
}

async function startAutoMonitor(
  intervalMs: number,
  resumeBaseline?: { fingerprint?: string }
): Promise<OffscreenMonitorResult> {
  if (monitorTimer !== undefined) {
    return { ok: true, active: true };
  }

  const generation = ++monitorGeneration;
  monitorBaselinePending = true;
  const writeGeneration = clipboardWriteGeneration;
  if (resumeBaseline !== undefined) {
    lastMonitorFingerprint = resumeBaseline.fingerprint;
    monitorBaselinePending = false;
    pendingDelivery = undefined;
    persistedMonitorBaselineKnown = true;
    persistedMonitorBaselineFingerprint = resumeBaseline.fingerprint;
    persistedMonitorBaselineAt = 0;
  } else {
    try {
      const initialResult = await withTimeout(readClipboardImageForAutoMonitor(), CLIPBOARD_READ_DEADLINE_MS);
      if (generation !== monitorGeneration) {
        return { ok: true, active: false };
      }

      const writeStateIsStable = writeGeneration === clipboardWriteGeneration && clipboardWritesInFlight === 0;
      if (writeStateIsStable && !initialResult.ok && initialResult.error === 'NO_PERMISSION') {
        return {
          ok: false,
          active: false,
          message: initialResult.message
        };
      }

      const baselineReadIsReliable =
        initialResult.ok ||
        initialResult.error === 'NO_IMAGE_IN_CLIPBOARD' ||
        initialResult.error === 'UNSUPPORTED_IMAGE_TYPE';
      if (writeStateIsStable && baselineReadIsReliable) {
        const fingerprint = initialResult.ok
          ? await withTimeout(createImageFingerprint(initialResult.image), CLIPBOARD_READ_DEADLINE_MS)
          : undefined;
        if (
          generation === monitorGeneration &&
          writeGeneration === clipboardWriteGeneration &&
          clipboardWritesInFlight === 0
        ) {
          lastMonitorFingerprint = fingerprint;
          monitorBaselinePending = false;
          pendingDelivery = undefined;
          persistMonitorBaselineFingerprint(fingerprint);
        }
      }
    } catch {
      if (
        generation === monitorGeneration &&
        writeGeneration === clipboardWriteGeneration &&
        clipboardWritesInFlight === 0
      ) {
        lastMonitorFingerprint = undefined;
      }
    }
  }

  if (generation !== monitorGeneration) {
    return { ok: true, active: false };
  }

  monitorTimer = window.setInterval(() => {
    void pollClipboardForNewImage(generation);
  }, intervalMs);
  if (resumeBaseline !== undefined) {
    void pollClipboardForNewImage(generation);
  }

  return { ok: true, active: true };
}

async function stopAutoMonitor(): Promise<OffscreenMonitorResult> {
  monitorGeneration += 1;
  if (monitorTimer !== undefined) {
    window.clearInterval(monitorTimer);
    monitorTimer = undefined;
  }

  monitorPollInFlight = false;
  lastMonitorFingerprint = undefined;
  monitorBaselinePending = true;
  lastSentFingerprint = undefined;
  lastSentAt = 0;
  pendingDelivery = undefined;
  persistedMonitorBaselineKnown = false;
  persistedMonitorBaselineFingerprint = undefined;
  persistedMonitorBaselineAt = 0;
  return { ok: true, active: false };
}

async function readClipboardImageForAutoMonitor(): Promise<ClipboardReadResult> {
  return readClipboardImageInDocument({ usePasteFallback: true });
}

async function pollClipboardForNewImage(generation: number): Promise<void> {
  if (monitorPollInFlight) {
    return;
  }

  monitorPollInFlight = true;
  const writeGeneration = clipboardWriteGeneration;
  try {
    const result = await withTimeout(readClipboardImageForAutoMonitor(), CLIPBOARD_READ_DEADLINE_MS);
    if (
      generation !== monitorGeneration ||
      monitorTimer === undefined ||
      writeGeneration !== clipboardWriteGeneration ||
      clipboardWritesInFlight > 0
    ) {
      return;
    }

    if (!result.ok) {
      if (result.error === 'NO_IMAGE_IN_CLIPBOARD' || result.error === 'UNSUPPORTED_IMAGE_TYPE') {
        lastMonitorFingerprint = undefined;
        monitorBaselinePending = false;
        pendingDelivery = undefined;
        persistMonitorBaselineFingerprint(undefined);
      }
      return;
    }

    const fingerprint = await withTimeout(createImageFingerprint(result.image), CLIPBOARD_READ_DEADLINE_MS);
    if (
      generation !== monitorGeneration ||
      monitorTimer === undefined ||
      writeGeneration !== clipboardWriteGeneration ||
      clipboardWritesInFlight > 0
    ) {
      return;
    }

    if (monitorBaselinePending) {
      consumeSuppressedWriteFingerprint(fingerprint);
      lastMonitorFingerprint = fingerprint;
      monitorBaselinePending = false;
      pendingDelivery = undefined;
      persistMonitorBaselineFingerprint(fingerprint);
      return;
    }

    if (consumeSuppressedWriteFingerprint(fingerprint)) {
      lastMonitorFingerprint = fingerprint;
      pendingDelivery = undefined;
      persistMonitorBaselineFingerprint(fingerprint);
      return;
    }

    if (fingerprint === lastMonitorFingerprint) {
      persistMonitorBaselineFingerprint(fingerprint);
      return;
    }

    if (isRecentlySent(fingerprint)) {
      lastMonitorFingerprint = fingerprint;
      pendingDelivery = undefined;
      persistMonitorBaselineFingerprint(fingerprint);
      return;
    }

    if (!pendingDelivery || pendingDelivery.fingerprint !== fingerprint) {
      pendingDelivery = {
        fingerprint,
        deliveryId: createDeliveryId(fingerprint)
      };
    }

    const message: AutoClipboardImageDetectedMessage = {
      type: 'AUTO_CLIPBOARD_IMAGE_DETECTED',
      image: result.image,
      fingerprint,
      deliveryId: pendingDelivery.deliveryId
    };
    try {
      const response = (await withTimeout(chrome.runtime.sendMessage(message), MONITOR_DELIVERY_DEADLINE_MS)) as
        { ok?: boolean } | undefined;
      if (!response?.ok) {
        throw new Error('AUTO_CLIPBOARD_IMAGE_DELIVERY_REJECTED');
      }
      if (generation === monitorGeneration) {
        lastMonitorFingerprint = fingerprint;
        lastSentFingerprint = fingerprint;
        lastSentAt = Date.now();
        pendingDelivery = undefined;
        persistMonitorBaselineFingerprint(fingerprint);
      }
    } catch {
      if (generation === monitorGeneration) {
        lastMonitorFingerprint = undefined;
      }
    }
  } catch {
    // A transient clipboard read or fingerprint failure must not stop later monitor polls.
  } finally {
    if (generation === monitorGeneration) {
      monitorPollInFlight = false;
    }
  }
}

function createDeliveryId(fingerprint: string): string {
  deliverySequence += 1;
  return `${Date.now().toString(36)}-${deliverySequence.toString(36)}-${fingerprint.slice(0, 12)}`;
}

function registerSuppressedWriteFingerprint(fingerprint: string): void {
  pruneSuppressedWriteFingerprints();
  suppressedWriteFingerprints.set(fingerprint, Date.now() + CLIPBOARD_WRITE_SUPPRESSION_MS);
}

function consumeSuppressedWriteFingerprint(fingerprint: string): boolean {
  pruneSuppressedWriteFingerprints();
  if (!suppressedWriteFingerprints.has(fingerprint)) {
    return false;
  }
  suppressedWriteFingerprints.delete(fingerprint);
  return true;
}

function pruneSuppressedWriteFingerprints(): void {
  const now = Date.now();
  for (const [fingerprint, expiresAt] of suppressedWriteFingerprints) {
    if (expiresAt <= now) {
      suppressedWriteFingerprints.delete(fingerprint);
    }
  }
}

function isRecentlySent(fingerprint: string): boolean {
  return fingerprint === lastSentFingerprint && Date.now() - lastSentAt < 10000;
}

function persistMonitorBaselineFingerprint(fingerprint: string | undefined): void {
  const observedAt = Date.now();
  const age = observedAt - persistedMonitorBaselineAt;
  if (
    persistedMonitorBaselineKnown &&
    persistedMonitorBaselineFingerprint === fingerprint &&
    age >= 0 &&
    age < AUTO_MONITOR_BASELINE_HEARTBEAT_MS
  ) {
    return;
  }

  persistedMonitorBaselineKnown = true;
  persistedMonitorBaselineFingerprint = fingerprint;
  persistedMonitorBaselineAt = observedAt;
  const persistence = chrome.storage.local.set({
    [AUTO_MONITOR_BASELINE_KEY]: { fingerprint: fingerprint ?? null, observedAt }
  });
  void persistence.catch(() => undefined);
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
    let timer: number | undefined;

    target.contentEditable = 'true';
    target.setAttribute('aria-hidden', 'true');
    target.style.position = 'fixed';
    target.style.left = '-9999px';
    target.style.top = '0';
    target.style.width = '1px';
    target.style.height = '1px';
    document.body.appendChild(target);

    const cleanup = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
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

    timer = window.setTimeout(() => {
      done({
        ok: false,
        error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
        message: foundUnsupportedImage ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。' : USER_MESSAGES.noClipboardImage
      });
    }, PASTE_FALLBACK_DEADLINE_MS);

    async function onPaste(event: ClipboardEvent) {
      event.preventDefault();

      try {
        const data = event.clipboardData;
        const files = Array.from(data?.files ?? []);
        const supportedFile = files.find((file) =>
          SUPPORTED_CLIPBOARD_IMAGE_TYPES.includes(file.type as SupportedClipboardImageType)
        );

        if (supportedFile) {
          done(
            await withTimeout(
              blobToClipboardPayload(supportedFile, supportedFile.type as SupportedClipboardImageType),
              PASTE_FALLBACK_DEADLINE_MS
            )
          );
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
            done(
              await withTimeout(
                blobToClipboardPayload(file, item.type as SupportedClipboardImageType),
                PASTE_FALLBACK_DEADLINE_MS
              )
            );
            return;
          }
        }

        done({
          ok: false,
          error: foundUnsupportedImage ? 'UNSUPPORTED_IMAGE_TYPE' : 'NO_IMAGE_IN_CLIPBOARD',
          message: foundUnsupportedImage
            ? '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。'
            : USER_MESSAGES.noClipboardImage
        });
      } catch {
        done({
          ok: false,
          error: 'CLIPBOARD_READ_FAILED',
          message: '读取剪贴板失败，请重新截图后再试。'
        });
      }
    }

    target.addEventListener('paste', onPaste);
    target.focus();

    try {
      const didPaste = document.execCommand('paste');
      if (!didPaste) {
        done({
          ok: false,
          error: 'NO_PERMISSION',
          message: '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。'
        });
      }
    } catch {
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('OFFSCREEN_OPERATION_TIMEOUT'));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
