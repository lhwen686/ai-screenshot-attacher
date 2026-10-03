import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiTargetAdapter } from '../../src/adapters/types';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
import { claudeAdapter } from '../../src/adapters/claude';
import { doubaoAdapter } from '../../src/adapters/doubao';
import { geminiAdapter } from '../../src/adapters/gemini';
import { makeVisible, installClipboardEventMocks } from '../helpers/dom';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('adapter readiness and input targeting', () => {
  it.each(['移除文件1：screenshot.png', '打开图片：用户上传的图片'])(
    'confirms a new ChatGPT attachment control with aria-label %s',
    async (ariaLabel) => {
      vi.useFakeTimers();
      installClipboardEventMocks();
      document.body.innerHTML =
        '<main><section data-testid="composer"><div id="prompt-textarea" contenteditable="true"></div></section></main>';
      const composer = document.querySelector('[data-testid="composer"]')!;
      const editor = document.querySelector('#prompt-textarea')!;
      makeVisible(editor);
      editor.addEventListener('paste', () => {
        const attachmentControl = document.createElement('button');
        attachmentControl.setAttribute('aria-label', ariaLabel);
        makeVisible(attachmentControl);
        composer.append(attachmentControl);
      });

      const pending = chatgptAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toMatchObject({ ok: true, method: 'paste-event', outcome: 'confirmed' });
    }
  );

  it('observes a ChatGPT attachment rendered beside the nested editor inside the unified composer form', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><form data-type="unified-composer"><div id="attachments"></div><div class="group-data-[expanded-composer-mode-button]/composer"><div id="prompt-textarea" contenteditable="true"></div></div></form></main>';
    const attachments = document.querySelector('#attachments')!;
    const editor = document.querySelector('#prompt-textarea')!;
    makeVisible(editor);
    editor.addEventListener('paste', () => {
      const attachmentControl = document.createElement('button');
      attachmentControl.setAttribute('aria-label', '移除文件1：screenshot.png');
      makeVisible(attachmentControl);
      attachments.append(attachmentControl);
    });

    const pending = chatgptAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: true, method: 'paste-event', outcome: 'confirmed' });
  });

  it('does not treat an existing ChatGPT attachment control as a new attachment', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><section data-testid="composer"><button aria-label="移除文件1：existing.png"></button><div id="prompt-textarea" contenteditable="true"></div></section></main>';
    const attachmentControl = document.querySelector('button')!;
    const editor = document.querySelector('#prompt-textarea')!;
    makeVisible(attachmentControl);
    makeVisible(editor);

    const pending = chatgptAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-event', outcome: 'unknown' });
  });

  it('does not write a global ChatGPT file input without an identifiable composer', async () => {
    installClipboardEventMocks();
    document.body.innerHTML = '<input id="global-upload" type="file" accept="image/png">';
    const setter = vi.fn();
    Object.defineProperty(document.querySelector<HTMLInputElement>('#global-upload')!, 'files', {
      configurable: true,
      get: () => [],
      set: setter
    });

    await expect(
      chatgptAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }))
    ).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(setter).not.toHaveBeenCalled();
  });

  it.each<[string, AiTargetAdapter]>([
    ['ChatGPT', chatgptAdapter],
    ['Claude', claudeAdapter],
    ['Gemini', geminiAdapter],
    ['Doubao', doubaoAdapter]
  ])('%s does not treat an ordinary settings form as a composer', async (_name, adapter) => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><form id="settings"><textarea>keep settings draft</textarea><input id="settings-upload" type="file" accept="image/png"><button type="submit">Save</button></form></main>';
    const textarea = document.querySelector('textarea')!;
    const input = document.querySelector<HTMLInputElement>('#settings-upload')!;
    makeVisible(textarea);
    const paste = vi.fn();
    const drop = vi.fn();
    const fileSetter = vi.fn();
    const submit = vi.fn();
    const execCommand = vi.fn(() => true);
    textarea.addEventListener('paste', paste);
    document.querySelector('form')!.addEventListener('drop', drop);
    document.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    Object.defineProperty(input, 'files', { configurable: true, get: () => [], set: fileSetter });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const pending = adapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: true
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(paste).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(fileSetter).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('keep settings draft');
  });

  it('does not mark Gemini ready when only a generic main element exists', async () => {
    document.body.innerHTML = '<main></main>';
    makeVisible(document.querySelector('main')!);

    await expect(geminiAdapter.waitUntilReady(20)).resolves.toBe(false);
  });

  it('targets the Claude composer instead of an unrelated global editor', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<div id="decoy" contenteditable="true"></div><main><form><div id="composer" contenteditable="true" aria-label="Write your prompt to Claude"></div></form></main>';
    const decoy = document.querySelector('#decoy')!;
    const composer = document.querySelector('#composer')!;
    makeVisible(decoy);
    makeVisible(composer);
    const decoyPaste = vi.fn();
    const composerPaste = vi.fn();
    decoy.addEventListener('paste', decoyPaste);
    composer.addEventListener('paste', composerPaste);

    const pending = claudeAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();
    await pending;

    expect(decoyPaste).not.toHaveBeenCalled();
    expect(composerPaste).toHaveBeenCalledOnce();
  });

  it("prioritizes Claude's exact labelled composer over an earlier decoy inside main without changing its draft", async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><div id="decoy" contenteditable="true">decoy draft</div><form><div id="composer" contenteditable="true" role="textbox" aria-label="Write your prompt to Claude">keep this draft</div></form></main>';
    const decoy = document.querySelector('#decoy')!;
    const composer = document.querySelector('#composer')!;
    makeVisible(decoy);
    makeVisible(composer);
    const decoyPaste = vi.fn();
    const composerPaste = vi.fn();
    decoy.addEventListener('paste', decoyPaste);
    composer.addEventListener('paste', composerPaste);

    const pending = claudeAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();
    await pending;

    expect(decoyPaste).not.toHaveBeenCalled();
    expect(composerPaste).toHaveBeenCalledOnce();
    expect(composer.textContent).toBe('keep this draft');
  });

  it('does not paste into an ambiguous Claude editor outside a composer', async () => {
    installClipboardEventMocks();
    document.body.innerHTML = '<main><div id="ambiguous" contenteditable="true">keep this draft</div></main>';
    const ambiguous = document.querySelector('#ambiguous')!;
    makeVisible(ambiguous);
    const paste = vi.fn();
    ambiguous.addEventListener('paste', paste);

    await expect(
      claudeAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }))
    ).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(paste).not.toHaveBeenCalled();
    expect(ambiguous.textContent).toBe('keep this draft');
  });

  it('opens Gemini upload controls only from the composer and clicks an item in the newly opened menu', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<button id="outside-trigger" aria-label="上传和工具"></button><main><bard-text-input><div id="gemini-editor" class="ql-editor" contenteditable="true"></div><button id="composer-trigger" aria-label="上传和工具"></button></bard-text-input></main>';
    const outsideTrigger = document.querySelector<HTMLElement>('#outside-trigger')!;
    const composerTrigger = document.querySelector<HTMLElement>('#composer-trigger')!;
    const composer = document.querySelector('bard-text-input')!;
    makeVisible(document.querySelector('#gemini-editor')!);
    makeVisible(outsideTrigger);
    makeVisible(composerTrigger);
    const outsideClick = vi.fn();
    const menuItemClick = vi.fn();
    outsideTrigger.addEventListener('click', outsideClick);
    composerTrigger.addEventListener('click', () => {
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      makeVisible(menu);
      const menuItem = document.createElement('button');
      menuItem.setAttribute('role', 'menuitem');
      menuItem.setAttribute('aria-label', '从设备上传图片');
      makeVisible(menuItem);
      menuItem.addEventListener('click', () => {
        menuItemClick();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png';
        Object.defineProperty(input, 'files', {
          configurable: true,
          get: () => [],
          set: vi.fn()
        });
        input.addEventListener('change', () => {
          const preview = document.createElement('file-preview');
          makeVisible(preview);
          composer.append(preview);
        });
        menu.append(input);
      });
      menu.append(menuItem);
      document.body.append(menu);
    });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: true, method: 'file-input', outcome: 'confirmed' });
    expect(outsideClick).not.toHaveBeenCalled();
    expect(menuItemClick).toHaveBeenCalledOnce();
  });

  it('does not confirm a Gemini upload when text inserted earlier shifts existing status text', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><span id="status">uploading done</span><div class="ql-editor" contenteditable="true"></div><input id="upload" type="file" accept="image/png"></bard-text-input></main>';
    const composer = document.querySelector<HTMLElement>('bard-text-input')!;
    const input = document.querySelector<HTMLInputElement>('#upload')!;
    makeVisible(document.querySelector('.ql-editor')!);
    composer.innerText = 'uploading done';
    Object.defineProperty(input, 'files', { configurable: true, get: () => [], set: vi.fn() });
    input.addEventListener('change', () => {
      composer.innerText = 'an unrelated longer prefix uploading done';
    });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: true
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'file-input', outcome: 'unknown' });
  });

  it('closes a Gemini menu it opened when the menu exposes no upload input', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div><button id="composer-trigger" aria-label="上传和工具"></button></bard-text-input></main>';
    makeVisible(document.querySelector('.ql-editor')!);
    const trigger = document.querySelector<HTMLElement>('#composer-trigger')!;
    makeVisible(trigger);
    const escape = vi.fn();
    trigger.addEventListener('click', () => {
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      makeVisible(menu);
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          escape();
          menu.remove();
        }
      });
      document.body.append(menu);
    });

    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: true
    });
    await vi.runAllTimersAsync();
    await pending;

    expect(escape).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('never clicks a Gemini submit button when no attachment control can be identified', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><form><bard-text-input><div id="composer" contenteditable="true" role="textbox">keep this draft</div><button id="send" type="submit" aria-label="Send message">Send</button></bard-text-input></form></main>';
    const form = document.querySelector('form')!;
    const composer = document.querySelector<HTMLElement>('#composer')!;
    const sendButton = document.querySelector<HTMLButtonElement>('#send')!;
    makeVisible(composer);
    sendButton.getBoundingClientRect = () =>
      ({
        bottom: window.innerHeight * 0.5 + 10,
        height: 10,
        left: 100,
        right: 110,
        top: window.innerHeight * 0.5,
        width: 10,
        x: 100,
        y: window.innerHeight * 0.5,
        toJSON: () => ({})
      }) as DOMRect;
    const sendClick = vi.fn();
    const submit = vi.fn();
    sendButton.addEventListener('click', sendClick);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();
    await pending;

    expect(sendClick).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(composer.textContent).toBe('keep this draft');
  });

  it('does not write an unrelated global Gemini file input and prefers a composer input', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<input id="unrelated" type="file" accept="image/png"><main><bard-text-input><div class="ql-editor" contenteditable="true"></div><input id="composer-input" type="file" accept="image/png"></bard-text-input></main>';
    const unrelated = document.querySelector<HTMLInputElement>('#unrelated')!;
    const composerInput = document.querySelector<HTMLInputElement>('#composer-input')!;
    const composer = document.querySelector('bard-text-input')!;
    makeVisible(document.querySelector('.ql-editor')!);
    const unrelatedSetter = vi.fn();
    const composerSetter = vi.fn();
    Object.defineProperty(unrelated, 'files', {
      configurable: true,
      get: () => [],
      set: unrelatedSetter
    });
    Object.defineProperty(composerInput, 'files', {
      configurable: true,
      get: () => [],
      set: composerSetter
    });
    composerInput.addEventListener('change', () => {
      const preview = document.createElement('file-preview');
      makeVisible(preview);
      composer.append(preview);
    });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: true, method: 'file-input', outcome: 'confirmed' });
    expect(unrelatedSetter).not.toHaveBeenCalled();
    expect(composerSetter).toHaveBeenCalledOnce();
  });

  it('continues to a second eligible Gemini input when the first rejects before mutation', async () => {
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div><input id="first" type="file" accept="image/png"><input id="second" type="file" accept="image/png"></bard-text-input></main>';
    const first = document.querySelector<HTMLInputElement>('#first')!;
    const second = document.querySelector<HTMLInputElement>('#second')!;
    makeVisible(document.querySelector('.ql-editor')!);
    const composer = document.querySelector('bard-text-input')!;
    Object.defineProperty(first, 'files', {
      configurable: true,
      get: () => [],
      set: () => {
        throw new TypeError('rejected before mutation');
      }
    });
    const secondSetter = vi.fn();
    Object.defineProperty(second, 'files', {
      configurable: true,
      get: () => [],
      set: secondSetter
    });
    second.addEventListener('change', () => {
      const preview = document.createElement('file-preview');
      makeVisible(preview);
      composer.append(preview);
    });

    await expect(
      geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }))
    ).resolves.toMatchObject({ ok: true, method: 'file-input', outcome: 'confirmed' });
    expect(secondSetter).toHaveBeenCalledOnce();
  });

  it('does not mutate a second eligible Gemini input after the first mutation is unconfirmed', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div><input id="first" type="file" accept="image/png"><input id="second" type="file" accept="image/png"></bard-text-input></main>';
    const first = document.querySelector<HTMLInputElement>('#first')!;
    const second = document.querySelector<HTMLInputElement>('#second')!;
    makeVisible(document.querySelector('.ql-editor')!);
    const firstSetter = vi.fn();
    const secondSetter = vi.fn();
    Object.defineProperty(first, 'files', {
      configurable: true,
      get: () => [],
      set: firstSetter
    });
    Object.defineProperty(second, 'files', {
      configurable: true,
      get: () => [],
      set: secondSetter
    });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'file-input', outcome: 'unknown' });
    expect(firstSetter).toHaveBeenCalledOnce();
    expect(secondSetter).not.toHaveBeenCalled();
  });

  it('does not try another Gemini strategy after a file input reports a post-mutation error', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div><input id="upload" type="file" accept="image/png"></bard-text-input></main>';
    const editor = document.querySelector('.ql-editor')!;
    const input = document.querySelector<HTMLInputElement>('#upload')!;
    makeVisible(editor);
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => [],
      set: vi.fn()
    });
    input.addEventListener('change', () => {
      const error = document.createElement('div');
      error.textContent = '文件为空';
      document.querySelector('bard-text-input')!.append(error);
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const paste = vi.fn();
    const drop = vi.fn();
    editor.addEventListener('paste', paste);
    editor.addEventListener('drop', drop);

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'file-input', outcome: 'unknown' });
    expect(execCommand).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it('uses only the visible Gemini composer when a hidden stale composer remains in the DOM', async () => {
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input id="stale"><div class="ql-editor" contenteditable="true"></div><input id="stale-input" type="file" accept="image/png"></bard-text-input><bard-text-input id="active"><div id="active-editor" class="ql-editor" contenteditable="true"></div><input id="active-input" type="file" accept="image/png"></bard-text-input></main>';
    const activeEditor = document.querySelector('#active-editor')!;
    const staleInput = document.querySelector<HTMLInputElement>('#stale-input')!;
    const activeInput = document.querySelector<HTMLInputElement>('#active-input')!;
    makeVisible(activeEditor);
    const staleSetter = vi.fn();
    const activeSetter = vi.fn();
    Object.defineProperty(staleInput, 'files', { configurable: true, get: () => [], set: staleSetter });
    Object.defineProperty(activeInput, 'files', { configurable: true, get: () => [], set: activeSetter });
    activeInput.addEventListener('change', () => {
      const preview = document.createElement('file-preview');
      makeVisible(preview);
      document.querySelector('#active')!.append(preview);
    });

    await expect(
      geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }))
    ).resolves.toMatchObject({ ok: true, method: 'file-input', outcome: 'confirmed' });
    expect(staleSetter).not.toHaveBeenCalled();
    expect(activeSetter).toHaveBeenCalledOnce();
  });

  it('does not run a second Doubao mutation after real paste is unconfirmed', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    makeVisible(document.querySelector('textarea')!);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const pending = doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(execCommand).toHaveBeenCalledOnce();
  });

  it('does not retry or synthesize a Doubao paste after one real paste command returns false', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    const execCommand = vi.fn(() => false);
    const syntheticPaste = vi.fn();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    textarea.addEventListener('paste', syntheticPaste);

    const pending = doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-command', outcome: 'unknown' });
    expect(execCommand).toHaveBeenCalledOnce();
    expect(syntheticPaste).not.toHaveBeenCalled();
  });

  it('does not continue after Doubao attachment observation fails following a real paste', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    const composer = document.querySelector<HTMLElement>('[data-testid="composer"]')!;
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    let pasteAttempted = false;
    Object.defineProperty(composer, 'innerText', {
      configurable: true,
      get: () => {
        if (pasteAttempted) {
          throw new Error('observer failed after paste');
        }
        return '';
      }
    });
    const execCommand = vi.fn(() => {
      pasteAttempted = true;
      return true;
    });
    const syntheticPaste = vi.fn();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    textarea.addEventListener('paste', syntheticPaste);

    const pending = doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-command', outcome: 'unknown' });
    expect(execCommand).toHaveBeenCalledOnce();
    expect(syntheticPaste).not.toHaveBeenCalled();
  });

  it('does not run a synthetic Gemini mutation after real paste is unconfirmed', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div></bard-text-input></main>';
    const editor = document.querySelector('.ql-editor')!;
    makeVisible(editor);
    const syntheticPaste = vi.fn();
    editor.addEventListener('paste', syntheticPaste);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(execCommand).toHaveBeenCalledOnce();
    expect(syntheticPaste).not.toHaveBeenCalled();
  });

  it.each([
    ['returns false', () => false],
    [
      'throws',
      () => {
        throw new Error('paste command failed');
      }
    ]
  ])('does not continue after a Gemini real paste command %s', async (_caseName, pasteCommand) => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div></bard-text-input></main>';
    const composer = document.querySelector('bard-text-input')!;
    const editor = document.querySelector('.ql-editor')!;
    makeVisible(editor);
    const syntheticPaste = vi.fn();
    const drop = vi.fn();
    const execCommand = vi.fn(pasteCommand);
    editor.addEventListener('paste', syntheticPaste);
    composer.addEventListener('drop', drop);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }));
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-command', outcome: 'unknown' });
    expect(execCommand).toHaveBeenCalledOnce();
    expect(syntheticPaste).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it('does not dispatch a Gemini drop when no composer can be identified', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<main></main>';
    const main = document.querySelector('main')!;
    makeVisible(main);
    const dropListener = vi.fn();
    main.addEventListener('drop', dropListener);

    const pending = geminiAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(dropListener).not.toHaveBeenCalled();
  });

  it('does not write a global Doubao file input when no composer can be identified', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<input id="upload" type="file" accept="image/png">';
    const input = document.querySelector<HTMLInputElement>('#upload')!;
    let assignedFiles: File[] = [];
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => assignedFiles,
      set: (value) => {
        assignedFiles = value as File[];
      }
    });
    const changeListener = vi.fn();
    input.addEventListener('change', changeListener);

    const pending = doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'rejected' });
    expect(changeListener).not.toHaveBeenCalled();
  });

  it('skips real clipboard paste for automatic Doubao attachments', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    const syntheticPaste = vi.fn();
    textarea.addEventListener('paste', syntheticPaste);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const attach = doubaoAdapter.attachImage as unknown as (
      file: File,
      options: { allowClipboardPaste: boolean }
    ) => ReturnType<typeof doubaoAdapter.attachImage>;
    const pending = attach(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(execCommand).not.toHaveBeenCalled();
    expect(syntheticPaste).toHaveBeenCalledOnce();
  });

  it('does not treat unrelated Doubao page activity outside the composer as attach success', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><section data-testid="composer"><textarea></textarea></section><section id="timeline"></section></main>';
    const textarea = document.querySelector('textarea')!;
    const timeline = document.querySelector('#timeline')!;
    makeVisible(textarea);
    textarea.addEventListener('paste', () => {
      const image = document.createElement('img');
      image.src = 'blob:https://www.doubao.com/unrelated';
      makeVisible(image);
      timeline.append(image, ' 正在上传 screenshot.png');
    });

    const pending = doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-event', outcome: 'unknown' });
  });

  it('confirms a new Doubao preview inside the composer', async () => {
    installClipboardEventMocks();
    document.body.innerHTML = '<main><section data-testid="composer"><textarea></textarea></section></main>';
    const textarea = document.querySelector('textarea')!;
    const composer = document.querySelector('[data-testid="composer"]')!;
    makeVisible(textarea);
    textarea.addEventListener('paste', () => {
      const image = document.createElement('img');
      image.src = 'blob:https://www.doubao.com/attachment';
      makeVisible(image);
      composer.append(image);
    });

    await expect(
      doubaoAdapter.attachImage(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
        allowClipboardPaste: false
      })
    ).resolves.toMatchObject({ ok: true, method: 'paste-event', outcome: 'confirmed' });
  });

  it('skips real clipboard paste for automatic Gemini attachments', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div></bard-text-input></main>';
    const editor = document.querySelector('.ql-editor')!;
    makeVisible(editor);
    const syntheticPaste = vi.fn();
    editor.addEventListener('paste', syntheticPaste);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const attach = geminiAdapter.attachImage as unknown as (
      file: File,
      options: { allowClipboardPaste: boolean }
    ) => ReturnType<typeof geminiAdapter.attachImage>;
    const pending = attach(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(execCommand).not.toHaveBeenCalled();
    expect(syntheticPaste).toHaveBeenCalledOnce();
  });

  it('prefers captured synthetic paste over Gemini file inputs in automatic mode', async () => {
    vi.useFakeTimers();
    installClipboardEventMocks();
    document.body.innerHTML =
      '<main><bard-text-input><div class="ql-editor" contenteditable="true"></div><input type="file" accept="image/png"></bard-text-input></main>';
    const editor = document.querySelector('.ql-editor')!;
    const input = document.querySelector('input')!;
    makeVisible(editor);
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => [],
      set: vi.fn()
    });
    const syntheticPaste = vi.fn();
    const fileChange = vi.fn();
    editor.addEventListener('paste', syntheticPaste);
    input.addEventListener('change', fileChange);

    const attach = geminiAdapter.attachImage as unknown as (
      file: File,
      options: { allowClipboardPaste: boolean }
    ) => ReturnType<typeof geminiAdapter.attachImage>;
    const pending = attach(new File(['image'], 'screenshot.png', { type: 'image/png' }), {
      allowClipboardPaste: false
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(syntheticPaste).toHaveBeenCalledOnce();
    expect(fileChange).not.toHaveBeenCalled();
  });
});
