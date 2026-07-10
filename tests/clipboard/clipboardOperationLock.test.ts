import { describe, expect, it } from 'vitest';
import { runWithClipboardOperationLock } from '../../src/clipboard/clipboardOperationLock';

describe('clipboard operation lock', () => {
  it.each(['resolve', 'reject'] as const)(
    'returns the public result but keeps queued work blocked until a deferred settlement %ss',
    async (settlementOutcome) => {
      let resolveDeferred!: () => void;
      let rejectDeferred!: (error: Error) => void;
      const deferredSettlement = new Promise<void>((resolve, reject) => {
        resolveDeferred = resolve;
        rejectDeferred = reject;
      });
      const events: string[] = [];

      const first = runWithClipboardOperationLock(async (deferReleaseUntil) => {
        events.push('first-started');
        deferReleaseUntil(deferredSettlement);
        return 'unknown';
      });
      const second = runWithClipboardOperationLock(async () => {
        events.push('second-started');
        return 'second';
      });

      await expect(first).resolves.toBe('unknown');
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toEqual(['first-started']);

      if (settlementOutcome === 'resolve') {
        resolveDeferred();
      } else {
        rejectDeferred(new Error('late execution rejection'));
      }

      await expect(second).resolves.toBe('second');
      expect(events).toEqual(['first-started', 'second-started']);
    }
  );
});
