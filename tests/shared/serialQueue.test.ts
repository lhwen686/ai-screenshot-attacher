import { describe, expect, it } from 'vitest';
import { createSerialQueue } from '../../src/shared/serialQueue';

describe('createSerialQueue', () => {
  it('starts each operation only after the previous one settles', async () => {
    const run = createSerialQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;

    const first = run(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
      return 1;
    });
    const second = run(async () => {
      events.push('second:start');
      return 2;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('keeps running later operations after one rejects', async () => {
    const run = createSerialQueue();

    const failed = run(async () => {
      throw new Error('boom');
    });
    const next = run(async () => 'next');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('next');
  });
});
