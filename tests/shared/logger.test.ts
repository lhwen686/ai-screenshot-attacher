import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/shared/logger';

afterEach(() => {
  logger.configure({ debug: false });
  vi.restoreAllMocks();
});

describe('logger privacy', () => {
  it('does not emit debug logs unless debug logging is enabled', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.configure({ debug: false });
    logger.debug('hidden diagnostic', { targetId: 'gemini' });

    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('redacts image payloads and chat-shaped fields recursively', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const imageDataUrl = 'data:image/png;base64,private-image-data';
    const rawBase64 = 'A'.repeat(160);

    logger.configure({ debug: true });
    logger.debug('safe diagnostic', {
      image: imageDataUrl,
      nested: {
        payload: rawBase64,
        prompt: 'private prompt',
        safe: 'gemini'
      }
    });

    expect(consoleInfo).toHaveBeenCalledOnce();
    const serializedCall = JSON.stringify(consoleInfo.mock.calls[0]);
    expect(serializedCall).not.toContain(imageDataUrl);
    expect(serializedCall).not.toContain(rawBase64);
    expect(serializedCall).not.toContain('private prompt');
    expect(serializedCall).toContain('[redacted]');
    expect(serializedCall).toContain('gemini');
  });
});
