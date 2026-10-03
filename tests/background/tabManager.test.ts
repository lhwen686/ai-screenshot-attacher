// @vitest-environment-options {"url":"https://gemini.google.com/"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachRuntimePayload } from '../../src/shared/messages';
import { executeAttachRuntime, getOrCreateTargetTab } from '../../src/background/tabManager';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const mocks = vi.hoisted(() => ({
  writeClipboardImage: vi.fn()
}));

vi.mock('../../src/clipboard/writeClipboardImage', () => ({
  writeClipboardImage: mocks.writeClipboardImage
}));

function mockWindowsWith(tab: chrome.tabs.Tab) {
  vi.mocked(chrome.windows.getAll).mockImplementation(async (options) => {
    if (options.windowTypes?.includes('normal')) {
      return [{ id: 1, type: 'normal', focused: true, tabs: [tab] } as chrome.windows.Window];
    }
    return [];
  });
}

function makeVisible(element: Element) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 10,
      height: 10,
      left: 0,
      right: 10,
      top: 0,
      width: 10,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('target tab selection', () => {
  beforeEach(() => {
    mocks.writeClipboardImage.mockReset();
    mocks.writeClipboardImage.mockResolvedValue({ ok: true });
    vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 22, windowId: 1 } as chrome.tabs.Tab);
    vi.mocked(chrome.tabs.get).mockReset();
    vi.mocked(chrome.tabs.query).mockResolvedValue([]);
    vi.mocked(chrome.tabs.update).mockResolvedValue({} as chrome.tabs.Tab);
    vi.mocked(chrome.windows.update).mockResolvedValue({} as chrome.windows.Window);
    vi.mocked(chrome.scripting.executeScript).mockReset();
  });

  it('does not reuse a target tab that is navigating away', async () => {
    const leavingTab = {
      id: 11,
      windowId: 1,
      active: true,
      status: 'loading',
      url: 'https://chatgpt.com/',
      pendingUrl: 'https://example.com/'
    } as chrome.tabs.Tab;
    mockWindowsWith(leavingTab);
    vi.mocked(chrome.tabs.get).mockResolvedValue(leavingTab);

    const result = await getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);

    expect(result.id).toBe(22);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://chatgpt.com/', active: true });
  });

  it('reuses a tab that is already navigating to the target', async () => {
    const incomingTab = {
      id: 11,
      windowId: 1,
      active: true,
      status: 'loading',
      url: 'https://example.com/',
      pendingUrl: 'https://chatgpt.com/'
    } as chrome.tabs.Tab;
    mockWindowsWith(incomingTab);
    vi.mocked(chrome.tabs.get).mockResolvedValue(incomingTab);

    const result = await getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);

    expect(result.id).toBe(11);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.tabs.update).toHaveBeenCalledWith(11, { active: true });
  });

  it('coalesces concurrent acquisition of the same missing target tab', async () => {
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockResolvedValue([]);
    let resolveCreate!: (tab: chrome.tabs.Tab) => void;
    const created = new Promise<chrome.tabs.Tab>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(chrome.tabs.create).mockReturnValue(created);

    const first = getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledOnce());
    const second = getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(chrome.tabs.create).toHaveBeenCalledOnce();
    resolveCreate({ id: 22, windowId: 1, url: 'https://chatgpt.com/' } as chrome.tabs.Tab);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ id: 22 }),
      expect.objectContaining({ id: 22 })
    ]);
  });

  it('does not navigate the same active tab for concurrent different targets', async () => {
    const settings = { ...DEFAULT_SETTINGS, openInNewTab: false };
    const activeTab = { id: 7001, windowId: 1, active: true, url: 'https://example.com/' } as chrome.tabs.Tab;
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => (queryInfo.active ? [activeTab] : []));
    vi.mocked(chrome.tabs.update).mockImplementation(
      async (tabId, updateProperties) =>
        ({ id: tabId, windowId: 1, active: true, url: updateProperties.url }) as chrome.tabs.Tab
    );
    vi.mocked(chrome.tabs.create).mockResolvedValue({
      id: 7002,
      windowId: 1,
      active: true,
      url: 'https://claude.ai/'
    } as chrome.tabs.Tab);

    const [chatGptTab, claudeTab] = await Promise.all([
      getOrCreateTargetTab('chatgpt', settings),
      getOrCreateTargetTab('claude', settings)
    ]);

    expect(chrome.tabs.update).toHaveBeenCalledOnce();
    expect(chrome.tabs.create).toHaveBeenCalledOnce();
    expect(chatGptTab.id).not.toBe(claudeTab.id);
  });

  it('rejects stalled window discovery without creating a duplicate target tab', async () => {
    vi.useFakeTimers();
    let resolveWindows!: (windows: chrome.windows.Window[]) => void;
    const stalledWindows = new Promise<chrome.windows.Window[]>((resolve) => {
      resolveWindows = resolve;
    });
    vi.mocked(chrome.windows.getAll).mockReturnValue(stalledWindows);
    vi.mocked(chrome.tabs.query).mockResolvedValue([]);
    vi.mocked(chrome.tabs.create).mockResolvedValue({
      id: 22,
      windowId: 1,
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);

    const pending = getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);
    let state: { status: 'fulfilled' } | { status: 'rejected'; message: string } | undefined;
    const observation = pending.then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({
        status: 'rejected' as const,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    void observation.then((value) => {
      state = value;
    });
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();

    try {
      expect(chrome.windows.getAll).toHaveBeenCalledTimes(3);
      expect(state).toEqual({ status: 'rejected', message: 'WINDOW_QUERY_TIMEOUT' });
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    } finally {
      resolveWindows([]);
      await observation;
    }
  });

  it('rejects a stalled fallback tab query instead of hanging', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    let resolveQuery!: (tabs: chrome.tabs.Tab[]) => void;
    const stalledQuery = new Promise<chrome.tabs.Tab[]>((resolve) => {
      resolveQuery = resolve;
    });
    vi.mocked(chrome.tabs.query).mockReturnValue(stalledQuery);

    const pending = getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);
    let state: { status: 'fulfilled' } | { status: 'rejected'; message: string } | undefined;
    const observation = pending.then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({
        status: 'rejected' as const,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    void observation.then((value) => {
      state = value;
    });

    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();

    try {
      expect(state).toEqual({ status: 'rejected', message: 'TAB_QUERY_TIMEOUT' });
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    } finally {
      resolveQuery([]);
      await observation;
    }
  });

  it('releases target acquisition after a timed-out tab creation without retrying automatically', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockResolvedValue([]);
    let resolveCreate!: (tab: chrome.tabs.Tab) => void;
    const stalledCreate = new Promise<chrome.tabs.Tab>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(chrome.tabs.create).mockReturnValue(stalledCreate);

    const pending = getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS);
    let state: { status: 'fulfilled' } | { status: 'rejected'; message: string } | undefined;
    const observation = pending.then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({
        status: 'rejected' as const,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    void observation.then((value) => {
      state = value;
    });

    await vi.advanceTimersByTimeAsync(15000);
    await Promise.resolve();

    try {
      expect(state).toEqual({ status: 'rejected', message: 'TARGET_TAB_MUTATION_TIMEOUT' });
      expect(chrome.tabs.create).toHaveBeenCalledOnce();

      vi.mocked(chrome.tabs.create).mockResolvedValue({
        id: 23,
        windowId: 1,
        url: 'https://claude.ai/'
      } as chrome.tabs.Tab);
      await expect(getOrCreateTargetTab('claude', DEFAULT_SETTINGS)).resolves.toMatchObject({ id: 23 });
      expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    } finally {
      resolveCreate({ id: 22, windowId: 1, url: 'https://chatgpt.com/' } as chrome.tabs.Tab);
      await observation;
      await Promise.resolve();
    }
  });

  it('does not reuse a tab while a timed-out navigation may still complete', async () => {
    vi.useFakeTimers();
    const settings = { ...DEFAULT_SETTINGS, openInNewTab: false };
    const activeTab = { id: 11, windowId: 1, active: true, url: 'https://example.com/' } as chrome.tabs.Tab;
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => (queryInfo.active ? [activeTab] : []));
    let resolveNavigation!: (tab: chrome.tabs.Tab) => void;
    const stalledNavigation = new Promise<chrome.tabs.Tab>((resolve) => {
      resolveNavigation = resolve;
    });
    vi.mocked(chrome.tabs.update).mockReturnValue(stalledNavigation);
    vi.mocked(chrome.tabs.create).mockResolvedValue({
      id: 22,
      windowId: 1,
      active: true,
      url: 'https://claude.ai/'
    } as chrome.tabs.Tab);

    const first = getOrCreateTargetTab('chatgpt', settings);
    let state: { status: 'fulfilled' } | { status: 'rejected'; message: string } | undefined;
    const observation = first.then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({
        status: 'rejected' as const,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    void observation.then((value) => {
      state = value;
    });

    await vi.advanceTimersByTimeAsync(15000);
    await Promise.resolve();

    try {
      expect(state).toEqual({ status: 'rejected', message: 'TARGET_TAB_MUTATION_TIMEOUT' });
      await expect(getOrCreateTargetTab('claude', settings)).resolves.toMatchObject({ id: 22 });
      expect(chrome.tabs.update).toHaveBeenCalledOnce();
      expect(chrome.tabs.create).toHaveBeenCalledOnce();
    } finally {
      resolveNavigation({ id: 11, windowId: 1, active: true, url: 'https://chatgpt.com/' } as chrome.tabs.Tab);
      await observation;
      await Promise.resolve();
    }
  });

  it('does not treat pre-existing Gemini status text as paste success', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<p>Previous request is processing</p><bard-text-input><div class="ql-editor" contenteditable="true"></div></bard-text-input>';
    makeVisible(document.querySelector('.ql-editor')!);
    Object.defineProperty(document.body, 'innerText', {
      configurable: true,
      get: () => 'Previous request is processing'
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true)
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    const payload: AttachRuntimePayload = {
      targetId: 'gemini',
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'screenshot.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: true,
        debugLogs: false,
        showPageToast: true,
        writeBackOnFailure: true
      }
    };

    const pending = executeAttachRuntime(11, payload);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: 'unknown' });
    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
  });

  it('does not treat a new Gemini page image outside the composer as paste success', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<main><section data-testid="composer"><div class="ql-editor" contenteditable="true"></div></section><section id="timeline"></section></main>';
    const editor = document.querySelector('.ql-editor')!;
    makeVisible(editor);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'blob:https://gemini.google.com/unrelated';
        makeVisible(image);
        document.querySelector('#timeline')!.append(image, ' processing');
        return true;
      })
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    const pending = executeAttachRuntime(11, createGeminiPayload());
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-command', outcome: 'unknown' });
  });

  it('confirms a new Gemini preview inside the composer', async () => {
    document.body.innerHTML =
      '<main><section data-testid="composer"><div class="ql-editor" contenteditable="true"></div></section></main>';
    const editor = document.querySelector('.ql-editor')!;
    const composer = document.querySelector('[data-testid="composer"]')!;
    makeVisible(editor);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'blob:https://gemini.google.com/attachment';
        makeVisible(image);
        composer.append(image);
        return true;
      })
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    await expect(executeAttachRuntime(11, createGeminiPayload())).resolves.toMatchObject({
      ok: true,
      method: 'paste-command',
      outcome: 'confirmed'
    });
  });

  it('does not treat a Gemini preview revealed only by focus as paste success', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<main><section data-testid="composer"><div class="ql-editor" contenteditable="true"></div><div id="focus-controls"></div></section></main>';
    const editor = document.querySelector('.ql-editor')!;
    makeVisible(editor);
    editor.addEventListener('focus', () => {
      const image = document.createElement('img');
      image.src = 'blob:https://gemini.google.com/focus-only';
      makeVisible(image);
      document.querySelector('#focus-controls')!.append(image);
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true)
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    const pending = executeAttachRuntime(11, createGeminiPayload());
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ ok: false, method: 'paste-command', outcome: 'unknown' });
  });

  it('observes a Gemini preview beside rich-textarea within the outer bard composer', async () => {
    document.body.innerHTML =
      '<bard-text-input><div id="attachments"></div><rich-textarea><textarea></textarea></rich-textarea></bard-text-input>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        const image = document.createElement('img');
        image.src = 'blob:https://gemini.google.com/sibling-attachment';
        makeVisible(image);
        document.querySelector('#attachments')!.append(image);
        return true;
      })
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    await expect(executeAttachRuntime(11, createGeminiPayload())).resolves.toMatchObject({
      ok: true,
      method: 'paste-command',
      outcome: 'confirmed'
    });
  });

  it('does not paste after a Gemini tab navigates away during clipboard preparation', async () => {
    let finishClipboardWrite!: () => void;
    mocks.writeClipboardImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finishClipboardWrite = () => resolve({ ok: true });
      })
    );
    vi.mocked(chrome.tabs.get)
      .mockResolvedValueOnce({
        id: 11,
        windowId: 1,
        status: 'complete',
        url: 'https://gemini.google.com/'
      } as chrome.tabs.Tab)
      .mockResolvedValueOnce({
        id: 11,
        windowId: 1,
        status: 'complete',
        url: 'https://claude.ai/'
      } as chrome.tabs.Tab);

    const pending = executeAttachRuntime(11, createGeminiPayload());
    await vi.waitFor(() => expect(mocks.writeClipboardImage).toHaveBeenCalledOnce());
    finishClipboardWrite();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      method: 'paste-command',
      outcome: 'rejected',
      error: 'TARGET_NOT_READY'
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('rejects Gemini paste inside the page when its hostname no longer matches', async () => {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';
    makeVisible(document.querySelector('.ql-editor')!);
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      const args = [...(injection.args ?? [])];
      if (Array.isArray(args[1])) {
        args[1] = ['example.com'];
      }
      return [{ frameId: 0, result: await injection.func(...args) }] as never;
    });

    await expect(executeAttachRuntime(11, createGeminiPayload())).resolves.toMatchObject({
      ok: false,
      method: 'paste-command',
      outcome: 'rejected',
      error: 'TARGET_NOT_READY'
    });
    expect(execCommand).not.toHaveBeenCalled();
  });

  it.each([
    ['returns false', () => false],
    [
      'throws',
      () => {
        throw new Error('paste command failed');
      }
    ]
  ])('does not try a second Gemini mutation when real paste %s', async (_label, pasteImplementation) => {
    vi.useFakeTimers();
    document.body.innerHTML = '<bard-text-input><div class="ql-editor" contenteditable="true"></div></bard-text-input>';
    makeVisible(document.querySelector('.ql-editor')!);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(pasteImplementation)
    });
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        func?: (...args: unknown[]) => unknown;
      };
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    const pending = executeAttachRuntime(11, createGeminiPayload());
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      method: 'paste-command',
      outcome: 'unknown'
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
  });

  it('does not paste into a generic Gemini settings form', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<main><form><textarea role="textbox" aria-label="Profile note"></textarea></form></main>';
    makeVisible(document.querySelector('textarea')!);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });
    Reflect.deleteProperty(window, '__AI_SCREENSHOT_ATTACHER__');
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as {
        args?: unknown[];
        files?: string[];
        func?: (...args: unknown[]) => unknown;
      };
      if (injection.files) {
        return [];
      }
      if (!injection.func) {
        return [];
      }
      return [{ frameId: 0, result: await injection.func(...(injection.args ?? [])) }] as never;
    });

    const pending = executeAttachRuntime(11, createGeminiPayload());
    await vi.runAllTimersAsync();
    await pending;

    expect(execCommand).not.toHaveBeenCalled();
  });

  it('serializes manual and automatic attachment work for the same tab', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);

    let resolveFirstRuntime!: () => void;
    const firstRuntime = new Promise<void>((resolve) => {
      resolveFirstRuntime = resolve;
    });
    let runtimeCalls = 0;
    let activeRuntimes = 0;
    let maxConcurrentRuntimes = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as { func?: (...args: unknown[]) => unknown };
      if (!injection.func) {
        return [];
      }

      runtimeCalls += 1;
      activeRuntimes += 1;
      maxConcurrentRuntimes = Math.max(maxConcurrentRuntimes, activeRuntimes);
      if (runtimeCalls === 1) {
        await firstRuntime;
      }
      activeRuntimes -= 1;
      return [{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }] as never;
    });

    const payload: AttachRuntimePayload = {
      targetId: 'chatgpt',
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'screenshot.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: true,
        debugLogs: false,
        showPageToast: true,
        writeBackOnFailure: true
      }
    };

    const first = executeAttachRuntime(11, payload);
    await vi.waitFor(() => expect(runtimeCalls).toBe(1));
    const second = executeAttachRuntime(11, {
      ...payload,
      image: {
        ...payload.image,
        dataUrl: 'data:image/png;base64,d29ybGQ='
      }
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(maxConcurrentRuntimes).toBe(1);
    resolveFirstRuntime();
    await Promise.all([first, second]);
    expect(runtimeCalls).toBe(2);
  });

  it('coalesces overlapping requests for the same image and tab', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);

    let resolveRuntime!: () => void;
    const runtime = new Promise<void>((resolve) => {
      resolveRuntime = resolve;
    });
    let runtimeCalls = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as { func?: (...args: unknown[]) => unknown };
      if (!injection.func) {
        return [];
      }

      runtimeCalls += 1;
      await runtime;
      return [{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }] as never;
    });

    const payload: AttachRuntimePayload = {
      targetId: 'chatgpt',
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'screenshot.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: true,
        debugLogs: false,
        showPageToast: true,
        writeBackOnFailure: true
      }
    };

    const first = executeAttachRuntime(11, payload);
    await vi.waitFor(() => expect(runtimeCalls).toBe(1));
    const second = executeAttachRuntime(11, payload);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(runtimeCalls).toBe(1);
    resolveRuntime();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, method: 'paste-event', outcome: 'confirmed' },
      { ok: true, method: 'paste-event', outcome: 'confirmed' }
    ]);
  });

  it('does not navigate a busy attachment tab to a different target', async () => {
    const activeTab = {
      id: 11,
      windowId: 1,
      active: true,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab;
    vi.mocked(chrome.tabs.get).mockResolvedValue(activeTab);
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => (queryInfo.active ? [activeTab] : []));
    vi.mocked(chrome.tabs.create).mockResolvedValue({
      id: 22,
      windowId: 1,
      active: true,
      url: 'https://claude.ai/'
    } as chrome.tabs.Tab);

    let resolveRuntime!: (results: Array<{ frameId: number; result: unknown }>) => void;
    const runtime = new Promise<Array<{ frameId: number; result: unknown }>>((resolve) => {
      resolveRuntime = resolve;
    });
    let runtimeCalls = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation((details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return Promise.resolve([]) as never;
      }
      runtimeCalls += 1;
      return runtime as never;
    });

    const attachment = executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,YnVzeQ=='));
    await vi.waitFor(() => expect(runtimeCalls).toBe(1));

    await expect(getOrCreateTargetTab('claude', { ...DEFAULT_SETTINGS, openInNewTab: false })).resolves.toMatchObject({
      id: 22
    });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledOnce();

    resolveRuntime([{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }]);
    await expect(attachment).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
  });

  it('stops waiting for the target document as soon as the tab is closed', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'loading',
      url: 'https://example.com/',
      pendingUrl: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);

    const pending = executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,Y2xvc2Vk'));
    await vi.waitFor(() => expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled());
    const removedListener = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls[0][0] as (tabId: number) => void;
    removedListener(99);
    removedListener(11);

    await expect(pending).resolves.toMatchObject({ ok: false, error: 'TARGET_NOT_READY' });
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalled();
    expect(chrome.tabs.onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('quarantines a timed-out page runtime until the underlying mutation settles', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);

    let resolveFirstRuntime!: (results: Array<{ frameId: number; result: unknown }>) => void;
    const firstRuntime = new Promise<Array<{ frameId: number; result: unknown }>>((resolve) => {
      resolveFirstRuntime = resolve;
    });
    let runtimeCalls = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation((details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return Promise.resolve([]) as never;
      }

      runtimeCalls += 1;
      if (runtimeCalls === 1) {
        return firstRuntime as never;
      }
      return Promise.resolve([
        { frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }
      ]) as never;
    });

    const first = executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,Zmlyc3Q='));
    await vi.waitFor(() => expect(runtimeCalls).toBe(1));
    const second = executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,c2Vjb25k'));

    await vi.advanceTimersByTimeAsync(30000);

    await expect(first).resolves.toMatchObject({ ok: false, outcome: 'unknown', error: 'ATTACH_RUNTIME_TIMEOUT' });
    await expect(second).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'PREVIOUS_OPERATION_UNCONFIRMED'
    });
    expect(runtimeCalls).toBe(1);

    const activeTab = {
      id: 11,
      windowId: 1,
      active: true,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab;
    mockWindowsWith(activeTab);
    await expect(getOrCreateTargetTab('chatgpt', DEFAULT_SETTINGS)).resolves.toMatchObject({ id: 11 });
    await expect(
      executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,c2FtZS10YXJnZXQ='))
    ).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'PREVIOUS_OPERATION_UNCONFIRMED'
    });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(runtimeCalls).toBe(1);

    vi.mocked(chrome.tabs.update).mockClear();
    vi.mocked(chrome.windows.getAll).mockResolvedValue([]);
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => (queryInfo.active ? [activeTab] : []));
    vi.mocked(chrome.tabs.create).mockResolvedValue({
      id: 22,
      windowId: 1,
      active: true,
      url: 'https://claude.ai/'
    } as chrome.tabs.Tab);
    await expect(getOrCreateTargetTab('claude', { ...DEFAULT_SETTINGS, openInNewTab: false })).resolves.toMatchObject({
      id: 22
    });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledOnce();

    resolveFirstRuntime([{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }]);
    await Promise.resolve();
    await Promise.resolve();
    await expect(
      executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,dGhpcmQ='))
    ).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
    expect(runtimeCalls).toBe(2);
  });

  it('treats a dispatched runtime rejection as unconfirmed instead of retryable', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return [];
      }
      document.body.dataset.runtimeMutation = 'attempted';
      throw new Error('result channel closed');
    });

    await expect(
      executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,cmVqZWN0ZWQ='))
    ).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'SCRIPT_INJECTION_FAILED'
    });
    expect(document.body.dataset.runtimeMutation).toBe('attempted');
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['empty results', []],
    ['missing result', [{ frameId: 0, result: undefined }]]
  ])('treats %s after a dispatched runtime as unconfirmed', async (_label, runtimeResults) => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://chatgpt.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return [];
      }
      document.body.dataset.runtimeMutation = 'attempted';
      return runtimeResults as never;
    });

    await expect(
      executeAttachRuntime(11, createChatGptPayload('data:image/png;base64,bWlzc2luZw=='))
    ).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'SCRIPT_INJECTION_FAILED'
    });
    expect(document.body.dataset.runtimeMutation).toBe('attempted');
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it('serializes clipboard preparation and real paste across different tabs', async () => {
    vi.mocked(chrome.tabs.get).mockImplementation(
      async (tabId) =>
        ({
          id: tabId,
          windowId: 1,
          status: 'complete',
          url: 'https://gemini.google.com/'
        }) as chrome.tabs.Tab
    );

    let resolveFirstPaste!: () => void;
    const firstPaste = new Promise<void>((resolve) => {
      resolveFirstPaste = resolve;
    });
    let pasteCalls = 0;
    let activePastes = 0;
    let maxConcurrentPastes = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async () => {
      pasteCalls += 1;
      activePastes += 1;
      maxConcurrentPastes = Math.max(maxConcurrentPastes, activePastes);
      if (pasteCalls === 1) {
        await firstPaste;
      }
      activePastes -= 1;
      return [{ frameId: 0, result: { ok: true, method: 'paste-command', outcome: 'confirmed' } }] as never;
    });

    const payload: AttachRuntimePayload = {
      targetId: 'gemini',
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'screenshot.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: true,
        debugLogs: false,
        showPageToast: true,
        writeBackOnFailure: true
      }
    };

    const first = executeAttachRuntime(11, payload);
    await vi.waitFor(() => expect(pasteCalls).toBe(1));
    const second = executeAttachRuntime(22, {
      ...payload,
      image: {
        ...payload.image,
        dataUrl: 'data:image/png;base64,d29ybGQ='
      }
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(mocks.writeClipboardImage).toHaveBeenCalledOnce();
    expect(maxConcurrentPastes).toBe(1);
    resolveFirstPaste();
    await Promise.all([first, second]);

    expect(mocks.writeClipboardImage).toHaveBeenCalledTimes(2);
    expect(pasteCalls).toBe(2);
    expect(maxConcurrentPastes).toBe(1);
  });

  it('keeps the clipboard locked across tabs until a timed-out Gemini paste settles', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.tabs.get).mockImplementation(
      async (tabId) =>
        ({
          id: tabId,
          windowId: 1,
          status: 'complete',
          url: 'https://gemini.google.com/'
        }) as chrome.tabs.Tab
    );

    let resolveFirstPaste!: (results: Array<{ frameId: number; result: unknown }>) => void;
    const firstPaste = new Promise<Array<{ frameId: number; result: unknown }>>((resolve) => {
      resolveFirstPaste = resolve;
    });
    let pasteCalls = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation(() => {
      pasteCalls += 1;
      if (pasteCalls === 1) {
        return firstPaste as never;
      }
      return Promise.resolve([
        { frameId: 0, result: { ok: true, method: 'paste-command', outcome: 'confirmed' } }
      ]) as never;
    });

    const firstPayload = createGeminiPayload();
    const secondPayload: AttachRuntimePayload = {
      ...firstPayload,
      image: {
        ...firstPayload.image,
        dataUrl: 'data:image/png;base64,c2Vjb25k'
      }
    };
    const first = executeAttachRuntime(11, firstPayload);
    await vi.waitFor(() => expect(pasteCalls).toBe(1));
    const second = executeAttachRuntime(22, secondPayload);

    await vi.advanceTimersByTimeAsync(30000);

    await expect(first).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'GEMINI_PASTE_RUNTIME_TIMEOUT'
    });
    expect(mocks.writeClipboardImage).toHaveBeenCalledTimes(1);
    expect(mocks.writeClipboardImage).toHaveBeenCalledWith(firstPayload.image);
    expect(pasteCalls).toBe(1);

    resolveFirstPaste([{ frameId: 0, result: { ok: true, method: 'paste-command', outcome: 'confirmed' } }]);
    await expect(second).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
    expect(mocks.writeClipboardImage).toHaveBeenCalledTimes(2);
    expect(mocks.writeClipboardImage).toHaveBeenLastCalledWith(secondPayload.image);
    expect(pasteCalls).toBe(2);
  });

  it('keeps the clipboard locked across tabs until a timed-out Doubao runtime settles', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.tabs.get).mockImplementation(
      async (tabId) =>
        ({
          id: tabId,
          windowId: 1,
          status: 'complete',
          url: 'https://www.doubao.com/chat/'
        }) as chrome.tabs.Tab
    );

    let resolveFirstRuntime!: (results: Array<{ frameId: number; result: unknown }>) => void;
    const firstRuntime = new Promise<Array<{ frameId: number; result: unknown }>>((resolve) => {
      resolveFirstRuntime = resolve;
    });
    let runtimeCalls = 0;
    vi.mocked(chrome.scripting.executeScript).mockImplementation((details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return Promise.resolve([]) as never;
      }
      runtimeCalls += 1;
      if (runtimeCalls === 1) {
        return firstRuntime as never;
      }
      return Promise.resolve([
        { frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }
      ]) as never;
    });

    const firstPayload: AttachRuntimePayload = {
      targetId: 'doubao',
      image: {
        dataUrl: 'data:image/png;base64,Zmlyc3Q=',
        fileName: 'first.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: true,
        debugLogs: false,
        showPageToast: true,
        writeBackOnFailure: true
      }
    };
    const secondPayload: AttachRuntimePayload = {
      ...firstPayload,
      image: {
        ...firstPayload.image,
        dataUrl: 'data:image/png;base64,c2Vjb25k',
        fileName: 'second.png'
      }
    };
    const first = executeAttachRuntime(11, firstPayload);
    await vi.waitFor(() => expect(runtimeCalls).toBe(1));
    const second = executeAttachRuntime(22, secondPayload);

    await vi.advanceTimersByTimeAsync(30000);

    await expect(first).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      error: 'ATTACH_RUNTIME_TIMEOUT'
    });
    expect(mocks.writeClipboardImage).toHaveBeenCalledTimes(1);
    expect(mocks.writeClipboardImage).toHaveBeenCalledWith(firstPayload.image);
    expect(runtimeCalls).toBe(1);

    resolveFirstRuntime([{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }]);
    await expect(second).resolves.toMatchObject({ ok: true, outcome: 'confirmed' });
    expect(mocks.writeClipboardImage).toHaveBeenCalledTimes(2);
    expect(mocks.writeClipboardImage).toHaveBeenLastCalledWith(secondPayload.image);
    expect(runtimeCalls).toBe(2);
  });

  it('does not write or invoke isolated clipboard paste for automatic Gemini attachment', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 11,
      windowId: 1,
      status: 'complete',
      url: 'https://gemini.google.com/'
    } as chrome.tabs.Tab);
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (details) => {
      const injection = details as unknown as { files?: string[] };
      if (injection.files) {
        return [];
      }
      return [{ frameId: 0, result: { ok: true, method: 'paste-event', outcome: 'confirmed' } }] as never;
    });

    const result = await executeAttachRuntime(11, {
      targetId: 'gemini',
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'screenshot.png',
        lastModified: 123,
        mimeType: 'image/png',
        size: 5
      },
      settings: {
        allowClipboardPaste: false,
        debugLogs: false,
        showPageToast: false,
        writeBackOnFailure: true
      }
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.writeClipboardImage).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(vi.mocked(chrome.scripting.executeScript).mock.calls.some(([details]) => details.world === 'ISOLATED')).toBe(
      false
    );
  });
});

function createGeminiPayload(): AttachRuntimePayload {
  return {
    targetId: 'gemini',
    image: {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png',
      size: 5
    },
    settings: {
      allowClipboardPaste: true,
      debugLogs: false,
      showPageToast: true,
      writeBackOnFailure: true
    }
  };
}

function createChatGptPayload(dataUrl: string): AttachRuntimePayload {
  return {
    targetId: 'chatgpt',
    image: {
      dataUrl,
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png',
      size: 5
    },
    settings: {
      allowClipboardPaste: true,
      debugLogs: false,
      showPageToast: true,
      writeBackOnFailure: true
    }
  };
}
