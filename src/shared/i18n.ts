import englishMessages from '../../public/_locales/en/messages.json';
import type { TargetId } from './constants';

export type MessageKey = keyof typeof englishMessages;

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const TARGET_NAME_KEYS: Record<TargetId, MessageKey> = {
  chatgpt: 'targetChatgpt',
  claude: 'targetClaude',
  gemini: 'targetGemini',
  doubao: 'targetDoubao',
  grok: 'targetGrok'
};

/**
 * Returns the message in the browser's language. Falls back to English where chrome.i18n is unavailable, such as a
 * script injected into a page's main world.
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  return getLocalizedMessage(key, substitutions) || formatMessage(englishMessages[key], substitutions);
}

export function getTargetDisplayName(targetId: TargetId): string {
  return t(TARGET_NAME_KEYS[targetId]);
}

/** Resolves a messages.json entry the way chrome.i18n.getMessage does: named placeholders, $1-$9, and "$$". */
export function formatMessage(entry: MessageEntry, substitutions: string | string[] = []): string {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  const placeholders = new Map(
    Object.entries(entry.placeholders ?? {}).map(([name, placeholder]) => [name.toLowerCase(), placeholder.content])
  );

  return entry.message
    .replace(/\$([a-z0-9_@]+)\$/gi, (match, name: string) => {
      const content = placeholders.get(name.toLowerCase());
      return content === undefined
        ? match
        : content.replace(/\$([1-9])/g, (_, index: string) => values[Number(index) - 1] ?? '');
    })
    .replace(/\$\$/g, '$');
}

function getLocalizedMessage(key: string, substitutions?: string | string[]): string {
  try {
    return typeof chrome === 'undefined' ? '' : (chrome.i18n?.getMessage(key, substitutions) ?? '');
  } catch {
    return '';
  }
}
