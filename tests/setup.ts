import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

type ChromeListener<T extends (...args: never[]) => void> = {
  addListener: ReturnType<typeof vi.fn<[T], void>>;
  removeListener: ReturnType<typeof vi.fn<[T], void>>;
};

function createListener<T extends (...args: never[]) => void>(): ChromeListener<T> {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn()
  };
}

export function createChromeMock() {
  const syncStore = new Map<string, unknown>();
  const localStore = new Map<string, unknown>();

  function getFromStore(store: Map<string, unknown>, keys?: string | string[] | Record<string, unknown> | null) {
    if (!keys) {
      return Object.fromEntries(store);
    }

    if (typeof keys === 'string') {
      return { [keys]: store.get(keys) };
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, store.get(key)]));
    }

    return Object.fromEntries(Object.entries(keys).map(([key, defaultValue]) => [key, store.get(key) ?? defaultValue]));
  }

  function setInStore(store: Map<string, unknown>, values: Record<string, unknown>) {
    Object.entries(values).forEach(([key, value]) => store.set(key, value));
  }

  return {
    action: {
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined)
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      onInstalled: createListener(),
      onMessage: createListener(),
      onStartup: createListener(),
      openOptionsPage: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined)
    },
    storage: {
      local: {
        get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) =>
          Promise.resolve(getFromStore(localStore, keys))
        ),
        remove: vi.fn((key: string) => {
          localStore.delete(key);
          return Promise.resolve();
        }),
        set: vi.fn((values: Record<string, unknown>) => {
          setInStore(localStore, values);
          return Promise.resolve();
        })
      },
      onChanged: createListener(),
      sync: {
        get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) =>
          Promise.resolve(getFromStore(syncStore, keys))
        ),
        set: vi.fn((values: Record<string, unknown>) => {
          setInStore(syncStore, values);
          return Promise.resolve();
        })
      }
    },
    tabs: {
      create: vi.fn(),
      get: vi.fn(),
      onActivated: createListener(),
      onCreated: createListener(),
      onRemoved: createListener(),
      onUpdated: createListener(),
      query: vi.fn(),
      sendMessage: vi.fn(),
      update: vi.fn()
    },
    windows: {
      getAll: vi.fn(),
      onCreated: createListener(),
      onFocusChanged: createListener(),
      onRemoved: createListener(),
      update: vi.fn()
    },
    scripting: {
      executeScript: vi.fn()
    },
    offscreen: {
      createDocument: vi.fn(),
      hasDocument: vi.fn()
    }
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: createChromeMock()
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});
