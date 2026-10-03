import { createSerialQueue } from '../shared/serialQueue';

const runClipboardOperation = createSerialQueue();

export type DeferClipboardOperationRelease = (settlement: PromiseLike<unknown>) => void;

/**
 * Serializes system-clipboard work across tabs. An operation may extend its hold on the lock until a mutation it
 * dispatched has settled, even after the operation itself has returned (for example after a timeout).
 */
export function runWithClipboardOperationLock<T>(
  operation: (deferReleaseUntil: DeferClipboardOperationRelease) => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    void runClipboardOperation(async () => {
      const deferredSettlements: Promise<void>[] = [];
      const result = Promise.resolve().then(() =>
        operation((settlement) => {
          deferredSettlements.push(
            Promise.resolve(settlement).then(
              () => undefined,
              () => undefined
            )
          );
        })
      );
      result.then(resolve, reject);
      await result.catch(() => undefined);
      await Promise.all(deferredSettlements);
    });
  });
}
