export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
