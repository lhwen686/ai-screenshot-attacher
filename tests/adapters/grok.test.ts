import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { grokAdapter } from '../../src/adapters/grok';
import { installClipboardEventMocks, makeVisible } from '../helpers/dom';
import fixture from '../fixtures/grok-composer.html?raw';

const file = new File(['synthetic image'], 'grok-audit.png', { type: 'image/png' });

function mountComposer() {
  document.body.innerHTML = fixture;
  const form = document.querySelector('form')!;
  const editor = form.querySelector<HTMLElement>('[contenteditable]')!;
  const input = form.querySelector<HTMLInputElement>('input[type="file"]')!;
  const setFiles = vi.fn();
  Object.defineProperty(input, 'files', { configurable: true, get: () => [], set: setFiles });
  makeVisible(form);
  makeVisible(editor);
  return { form, editor, input, setFiles };
}

function appendPreview(root: Element) {
  const image = document.createElement('img');
  image.src = 'blob:synthetic-grok-preview';
  makeVisible(image);
  root.append(image);
}

beforeEach(() => {
  vi.useFakeTimers();
  installClipboardEventMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Grok adapter', () => {
  it.each(['https://grok.com/', 'https://grok.com/c/synthetic'])('recognizes %s', (href) => {
    vi.stubGlobal('location', { href });
    expect(grokAdapter.detect()).toBe(true);
  });

  it.each([
    'http://grok.com/',
    'https://grok.com.evil.example/',
    'https://x.com/i/grok',
    'https://example.com/grok.com'
  ])('rejects non-target URL %s', (href) => {
    vi.stubGlobal('location', { href });
    expect(grokAdapter.detect()).toBe(false);
  });

  it.each([true, false])(
    'uploads only the captured File and preserves the draft; allowClipboardPaste=%s',
    async (allowClipboardPaste) => {
      const { form, editor, input, setFiles } = mountComposer();
      const submit = vi.fn((event: Event) => event.preventDefault());
      const click = vi.fn();
      const paste = vi.fn();
      form.addEventListener('submit', submit);
      form.querySelectorAll('button').forEach((button) => button.addEventListener('click', click));
      editor.addEventListener('paste', paste);
      input.addEventListener('change', () =>
        appendPreview(form.querySelector('[data-testid="synthetic-attachment-tray"]')!)
      );
      const execCommand = vi.fn();
      Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
      const originalDraft = editor.innerHTML;

      await expect(grokAdapter.attachImage(file, { allowClipboardPaste })).resolves.toMatchObject({
        ok: true,
        method: 'file-input',
        outcome: 'confirmed'
      });
      expect(setFiles).toHaveBeenCalledExactlyOnceWith([file]);
      expect(editor.innerHTML).toBe(originalDraft);
      expect(submit).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      expect(paste).not.toHaveBeenCalled();
      expect(execCommand).not.toHaveBeenCalled();
    }
  );

  it('ignores file inputs outside the composer and a hidden stale composer', async () => {
    const { form, input, setFiles } = mountComposer();
    const hidden = form.cloneNode(true) as HTMLFormElement;
    document.body.prepend(hidden);
    const hiddenSetter = vi.fn();
    Object.defineProperty(hidden.querySelector('input')!, 'files', {
      configurable: true,
      get: () => [],
      set: hiddenSetter
    });
    const outside = document.createElement('input');
    outside.type = 'file';
    const outsideSetter = vi.fn();
    Object.defineProperty(outside, 'files', { configurable: true, get: () => [], set: outsideSetter });
    document.body.prepend(outside);
    input.addEventListener('change', () => appendPreview(form));
    await expect(grokAdapter.attachImage(file)).resolves.toMatchObject({ ok: true });
    expect(setFiles).toHaveBeenCalledOnce();
    expect(hiddenSetter).not.toHaveBeenCalled();
    expect(outsideSetter).not.toHaveBeenCalled();
  });

  it('rejects an ordinary settings form even when it contains an editor and file input', async () => {
    const { form, setFiles } = mountComposer();
    form.removeAttribute('data-composer');
    await expect(grokAdapter.attachImage(file)).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(setFiles).not.toHaveBeenCalled();
  });

  it('rejects a disabled editor', async () => {
    const { editor, setFiles } = mountComposer();
    editor.setAttribute('aria-disabled', 'true');
    await expect(grokAdapter.attachImage(file)).resolves.toMatchObject({ ok: false, error: 'INPUT_NOT_FOUND' });
    expect(setFiles).not.toHaveBeenCalled();
  });

  it('does not mistake old previews or unrelated page activity for a successful upload, and stops after the mutation', async () => {
    const { form, editor, input, setFiles } = mountComposer();
    appendPreview(form);
    const paste = vi.fn();
    const drop = vi.fn();
    editor.addEventListener('paste', paste);
    form.addEventListener('drop', drop);
    input.addEventListener('change', () => {
      appendPreview(document.body);
      document.body.append(file.name);
    });
    const result = grokAdapter.attachImage(file);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ ok: false, method: 'file-input', outcome: 'unknown' });
    expect(setFiles).toHaveBeenCalledOnce();
    expect(paste).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it('uses a captured synthetic paste if the composer has no file input', async () => {
    const { form, editor, input } = mountComposer();
    input.remove();
    let received: File | undefined;
    editor.addEventListener('paste', (event) => {
      received = (event as ClipboardEvent).clipboardData?.files[0];
      appendPreview(form);
    });
    const result = grokAdapter.attachImage(file, { allowClipboardPaste: false });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ ok: true, method: 'paste-event' });
    expect(received).toBe(file);
  });
});
