import { OFFSCREEN_DOCUMENT_PATH } from '../shared/constants';
import { createSerialQueue } from '../shared/serialQueue';
import { withTimeout } from '../shared/withTimeout';

const OFFSCREEN_LIFECYCLE_TIMEOUT_MS = 10000;

let creating: { generation: number; promise: Promise<void> } | undefined;
const enqueueLifecycleOperation = createSerialQueue();
let documentResetGeneration = 0;
const documentResetListeners = new Set<(generation: number) => void>();

export async function hasOffscreenDocument(path = OFFSCREEN_DOCUMENT_PATH): Promise<boolean> {
  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes: ['OFFSCREEN_DOCUMENT'];
      documentUrls: string[];
    }) => Promise<Array<{ contextType: string; documentUrl?: string }>>;
  };

  const documentUrl = chrome.runtime.getURL(path);
  if (runtimeWithContexts.getContexts) {
    const contexts = await withTimeout(
      runtimeWithContexts.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [documentUrl]
      }),
      OFFSCREEN_LIFECYCLE_TIMEOUT_MS,
      'OFFSCREEN_CONTEXT_LOOKUP_TIMEOUT'
    );

    return contexts.length > 0;
  }

  const workerClients = (
    globalThis as typeof globalThis & {
      clients?: { matchAll(): Promise<Array<{ url: string }>> };
    }
  ).clients;
  if (!workerClients) {
    return false;
  }

  const matchedClients = await withTimeout(
    workerClients.matchAll(),
    OFFSCREEN_LIFECYCLE_TIMEOUT_MS,
    'OFFSCREEN_CLIENT_LOOKUP_TIMEOUT'
  );
  return matchedClients.some((client) => client.url === documentUrl);
}

export async function ensureOffscreenDocument(): Promise<void> {
  const generation = documentResetGeneration;
  if (!creating || creating.generation !== generation) {
    const quarantine = enqueueLifecycleOperation(async () => {
      if (await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH)) {
        return;
      }

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['CLIPBOARD'],
        justification:
          'Read clipboard images after user actions or while user-enabled automatic mode is active; write only for fallback.'
      });
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Only a single offscreen document')) {
        throw error;
      }
    });
    const operation = withTimeout(quarantine, OFFSCREEN_LIFECYCLE_TIMEOUT_MS, 'OFFSCREEN_CREATE_TIMEOUT');
    const tracked = operation.finally(() => {
      if (creating?.promise === tracked) {
        creating = undefined;
      }
    });
    creating = { generation, promise: tracked };
  }

  await creating.promise;
}

export function resetOffscreenDocument(): Promise<void> {
  documentResetGeneration += 1;
  const quarantine = enqueueLifecycleOperation(async () => {
    if (await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH)) {
      await chrome.offscreen.closeDocument();
    }
  });
  for (const listener of documentResetListeners) {
    try {
      listener(documentResetGeneration);
    } catch {
      // Reset safety must not depend on an observer completing successfully.
    }
  }
  return withTimeout(quarantine, OFFSCREEN_LIFECYCLE_TIMEOUT_MS, 'OFFSCREEN_CLOSE_TIMEOUT');
}

export function getOffscreenDocumentResetGeneration(): number {
  return documentResetGeneration;
}

export function addOffscreenDocumentResetListener(listener: (generation: number) => void): () => void {
  documentResetListeners.add(listener);
  return () => documentResetListeners.delete(listener);
}
