import { describe, expect, it } from 'vitest';
import manifest from '../../manifest.json';
import englishMessages from '../../public/_locales/en/messages.json';
import chineseMessages from '../../public/_locales/zh_CN/messages.json';
import { TARGET_IDS } from '../../src/shared/constants';
import { formatMessage, getTargetDisplayName, t } from '../../src/shared/i18n';

type Catalog = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const catalogs: Record<string, Catalog> = { en: englishMessages, zh_CN: chineseMessages };

function placeholderNames(entry: Catalog[string]): string[] {
  return Object.keys(entry.placeholders ?? {}).sort();
}

describe('extension translations', () => {
  it('gives every language the same messages and placeholders', () => {
    const englishKeys = Object.keys(englishMessages).sort();
    expect(Object.keys(chineseMessages).sort()).toEqual(englishKeys);
    for (const key of englishKeys) {
      expect(placeholderNames((chineseMessages as Catalog)[key]), key).toEqual(
        placeholderNames((englishMessages as Catalog)[key])
      );
    }
  });

  it.each(Object.entries(catalogs))('keeps the %s store texts within Chrome Web Store limits', (_locale, catalog) => {
    expect(catalog.extName.message.length).toBeLessThanOrEqual(75);
    expect(catalog.extShortName.message.length).toBeLessThanOrEqual(12);
    expect(catalog.extDescription.message.length).toBeLessThanOrEqual(132);
  });

  it('resolves every manifest message reference in each language', () => {
    const references = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(0);
    expect(manifest.default_locale).toBe('en');
    for (const catalog of Object.values(catalogs)) {
      for (const key of references) {
        expect(catalog, key).toHaveProperty(key);
      }
    }
  });

  it('fills named placeholders the way chrome.i18n does', () => {
    expect(formatMessage(englishMessages.popupAttachTo, 'Claude')).toBe('Attach to Claude');
    expect(formatMessage(chineseMessages.popupAttachDefault, ['豆包'])).toBe('附加到默认模型（豆包）');
    expect(formatMessage({ message: 'Costs $$5' })).toBe('Costs $5');
  });

  it('falls back to English where chrome.i18n is unavailable, as in a page main world', () => {
    const chromeGlobal = globalThis.chrome;
    try {
      Object.defineProperty(globalThis, 'chrome', { configurable: true, value: undefined });
      expect(t('attachSuccess')).toBe(englishMessages.attachSuccess.message);
      expect(t('popupAttachTo', 'Grok')).toBe('Attach to Grok');
      expect(getTargetDisplayName('doubao')).toBe('Doubao');
    } finally {
      Object.defineProperty(globalThis, 'chrome', { configurable: true, value: chromeGlobal });
    }
  });

  it.each(TARGET_IDS)('names the %s target in the active language', (targetId) => {
    expect(getTargetDisplayName(targetId)).not.toBe('');
  });

  it('shows the localized Doubao name', () => {
    expect(getTargetDisplayName('doubao')).toBe('豆包');
  });
});
