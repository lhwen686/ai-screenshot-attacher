import type { ClipboardImagePayload } from '../clipboard/types';
import { runWithClipboardOperationLock } from '../clipboard/clipboardOperationLock';
import { writeClipboardImage } from '../clipboard/writeClipboardImage';
import { USER_MESSAGES } from '../shared/constants';
import type { AppSettings } from '../shared/settings';

/**
 * Chooses the user-facing message for a failed attachment and, when allowed, writes the screenshot back to the
 * clipboard for a manual paste. Nothing is written when the page may already hold the attachment, because a manual
 * paste would then duplicate it.
 */
export async function prepareFailureFeedback(
  image: ClipboardImagePayload,
  settings: Pick<AppSettings, 'writeBackOnFailure'>,
  mutationUnconfirmed: boolean
): Promise<string> {
  if (mutationUnconfirmed) {
    return USER_MESSAGES.attachUnconfirmed;
  }
  if (!settings.writeBackOnFailure) {
    return USER_MESSAGES.attachFallbackNoWrite;
  }

  const writeResult = await runWithClipboardOperationLock(() => writeClipboardImage(image));
  return writeResult.ok
    ? USER_MESSAGES.attachFallback
    : `${USER_MESSAGES.attachFallback}（写回剪贴板失败，但原剪贴板通常仍保留截图。）`;
}
