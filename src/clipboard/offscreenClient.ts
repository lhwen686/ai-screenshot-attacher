import { OFFSCREEN_DOCUMENT_PATH } from '../shared/constants';

let creating: Promise<void> | undefined;

export async function hasOffscreenDocument(path = OFFSCREEN_DOCUMENT_PATH): Promise<boolean> {
  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes: ['OFFSCREEN_DOCUMENT'];
      documentUrls: string[];
    }) => Promise<Array<{ contextType: string; documentUrl?: string }>>;
  };

  if (!runtimeWithContexts.getContexts) {
    return false;
  }

  const contexts = await runtimeWithContexts.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  return contexts.length > 0;
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH)) {
    return;
  }

  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['CLIPBOARD'],
        justification: 'Read and write clipboard images only after explicit user action.'
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Only a single offscreen document')) {
          throw error;
        }
      })
      .finally(() => {
        creating = undefined;
      });
  }

  await creating;
}
