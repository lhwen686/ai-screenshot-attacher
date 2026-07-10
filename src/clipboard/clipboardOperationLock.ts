let clipboardOperationTail: Promise<void> = Promise.resolve();

export type DeferClipboardOperationRelease = (settlement: PromiseLike<unknown>) => void;

export function runWithClipboardOperationLock<T>(
  operation: (deferReleaseUntil: DeferClipboardOperationRelease) => Promise<T>
): Promise<T> {
  const deferredSettlements: Promise<void>[] = [];
  const result = clipboardOperationTail.then(() =>
    operation((settlement) => {
      deferredSettlements.push(
        Promise.resolve(settlement).then(
          () => undefined,
          () => undefined
        )
      );
    })
  );
  const release = () => Promise.all(deferredSettlements).then(() => undefined);
  clipboardOperationTail = result.then(release, release);
  return result;
}
