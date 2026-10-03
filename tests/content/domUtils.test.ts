import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dataUrlToFile,
  findExplicitComposerRoot,
  focusFirstInput,
  querySelectorCandidates,
  snapshotAttachmentCount,
  tryAttachViaPaste,
  tryPasteClipboardViaCommand,
  waitForCondition
} from '../../src/content/domUtils';
import { makeVisible, installClipboardEventMocks } from '../helpers/dom';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dom utilities', () => {
  it('converts clipboard data urls into files', () => {
    const file = dataUrlToFile({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png',
      size: 5
    });

    expect(file.name).toBe('screenshot.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(5);
  });

  it('deduplicates selector candidates and ignores invalid selectors', () => {
    document.body.innerHTML = '<button class="target">Attach</button>';
    const button = document.querySelector('button')!;
    makeVisible(button);

    expect(querySelectorCandidates(['button', '.target', '[']).map((element) => element.tagName)).toEqual(['BUTTON']);
  });

  it('does not treat an ordinary form as an explicit composer root', () => {
    document.body.innerHTML = '<main><form><textarea></textarea></form></main>';

    expect(findExplicitComposerRoot(document.querySelector('textarea')!)).toBeUndefined();
  });

  it('filters attachment previews to visible elements', () => {
    document.body.innerHTML =
      '<img src="data:image/png;base64,aGVsbG8=" alt="preview"><img src="data:image/png;base64,aGVsbG8=" alt="hidden">';
    makeVisible(document.querySelector('img')!);

    expect(snapshotAttachmentCount([])).toBe(1);
  });

  it('focuses the first visible input and moves the caret to the end', () => {
    document.body.innerHTML = '<textarea>hello</textarea>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);

    focusFirstInput(['textarea']);

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
  });

  it('marks an unconfirmed paste mutation as unknown', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<textarea></textarea>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    const pasteListener = vi.fn();
    textarea.addEventListener('paste', pasteListener);

    const pending = tryAttachViaPaste(new File(['image'], 'screenshot.png', { type: 'image/png' }), ['textarea'], []);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(pasteListener).toHaveBeenCalledOnce();
  });

  it('keeps a paste terminal when dispatch throws after the page mutates', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<section data-testid="composer"><textarea></textarea><div id="attachments"></div></section>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    const nativeDispatch = textarea.dispatchEvent.bind(textarea);
    vi.spyOn(textarea, 'dispatchEvent').mockImplementation((event) => {
      nativeDispatch(event);
      document.querySelector('#attachments')!.textContent = 'mutation attempted';
      throw new Error('page handler failed after mutation');
    });

    const pending = tryAttachViaPaste(new File(['image'], 'screenshot.png', { type: 'image/png' }), ['textarea'], []);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(document.querySelector('#attachments')).toHaveTextContent('mutation attempted');
  });

  it('does not treat a preview revealed only by focus as attachment success', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><section data-testid="composer"><textarea></textarea><div id="focus-controls"></div></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    textarea.addEventListener('focus', () => {
      const preview = document.createElement('img');
      preview.src = 'data:image/png;base64,aGVsbG8=';
      makeVisible(preview);
      document.querySelector('#focus-controls')!.append(preview);
    });

    const pending = tryAttachViaPaste(new File(['image'], 'screenshot.png', { type: 'image/png' }), ['textarea'], []);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
  });

  it('confirms a filename rendered synchronously by the attachment mutation', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><section data-testid="composer"><textarea></textarea><div id="attachments"></div></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    textarea.addEventListener('paste', () => {
      document.querySelector('#attachments')!.textContent = 'screenshot.png';
    });

    const pending = tryAttachViaPaste(new File(['image'], 'screenshot.png', { type: 'image/png' }), ['textarea'], []);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
  });

  it('does not treat pre-existing status text as a successful paste', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>Previous item is already attached</p><textarea></textarea>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true)
    });

    const pending = tryPasteClipboardViaCommand(['textarea'], [], {
      timeoutMs: 200,
      successTextPatterns: [/attached/i]
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
  });

  it('does not treat a new unrelated page image outside the composer as paste success', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<main><section data-testid="composer"><textarea></textarea></section><section id="timeline"></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,aGVsbG8=';
        image.alt = 'unrelated timeline image';
        makeVisible(image);
        document.querySelector('#timeline')!.append(image);
        return true;
      })
    });

    const pending = tryPasteClipboardViaCommand(['textarea'], [], { timeoutMs: 200 });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
  });

  it('does not expand confirmation to the whole main element when no composer wrapper exists', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main><textarea></textarea><section id="timeline"></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,aGVsbG8=';
        makeVisible(image);
        document.querySelector('#timeline')!.append(image);
        return true;
      })
    });

    const pending = tryPasteClipboardViaCommand(['textarea'], [], { timeoutMs: 200 });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
  });

  it('still confirms a new preview image inside the composer', async () => {
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    const textarea = document.querySelector('textarea')!;
    const composer = document.querySelector('[data-testid="composer"]')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,aGVsbG8=';
        image.alt = 'attachment preview';
        makeVisible(image);
        composer.append(image);
        return true;
      })
    });

    await expect(tryPasteClipboardViaCommand(['textarea'], [], { timeoutMs: 200 })).resolves.toMatchObject({
      ok: true,
      outcome: 'confirmed'
    });
  });

  it('observes a preview beside rich-textarea within the same Gemini composer', async () => {
    document.body.innerHTML =
      '<bard-text-input><div id="attachments"></div><rich-textarea><textarea></textarea></rich-textarea></bard-text-input>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,aGVsbG8=';
        image.alt = 'Gemini attachment preview';
        makeVisible(image);
        document.querySelector('#attachments')!.append(image);
        return true;
      })
    });

    await expect(tryPasteClipboardViaCommand(['textarea'], [], { timeoutMs: 200 })).resolves.toMatchObject({
      ok: true,
      outcome: 'confirmed'
    });
  });

  it('does not treat a new matching filename outside the composer as attach success', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><section data-testid="composer"><textarea></textarea></section><section id="timeline"></section></main>';
    Object.defineProperty(document.body, 'innerText', {
      configurable: true,
      get: () => document.body.textContent ?? ''
    });
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    const file = new File(['image'], 'screenshot.png', { type: 'image/png' });
    textarea.addEventListener('paste', () => {
      window.setTimeout(() => {
        document.querySelector('#timeline')!.textContent = file.name;
      }, 50);
    });

    const pending = tryAttachViaPaste(file, ['textarea'], []);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
  });
});

describe('waitForCondition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the first DOM mutation without waiting for the backstop poll', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section id="root"></section>';
    const root = document.querySelector('#root')!;
    const isDone = vi.fn(() => root.childElementCount > 0);

    const pending = waitForCondition(root, isDone, 5000);
    root.append(document.createElement('img'));

    await expect(pending).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the backstop poll for changes that produce no DOM mutation', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section id="root"></section>';
    let laidOut = false;

    const pending = waitForCondition(document.querySelector('#root')!, () => laidOut, 5000);
    laidOut = true;
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toBe(true);
  });

  it('resolves false at the deadline and stops observing', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section id="root"></section>';
    const root = document.querySelector('#root')!;
    const isDone = vi.fn(() => false);

    const pending = waitForCondition(root, isDone, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(false);

    const callsAtDeadline = isDone.mock.calls.length;
    root.append(document.createElement('img'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(isDone).toHaveBeenCalledTimes(callsAtDeadline);
  });
});
