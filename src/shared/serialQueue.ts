export type SerialQueue = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * Returns a runner that starts each operation only after every previously queued operation has settled.
 * A rejected operation rejects its own caller but never blocks the operations queued after it.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();

  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
