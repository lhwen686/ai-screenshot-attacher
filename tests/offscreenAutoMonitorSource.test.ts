import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('offscreen automatic clipboard monitor', () => {
  it('keeps paste fallback enabled for automatic monitor reads', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/offscreen/offscreen.ts'), 'utf8');
    expect(source).toContain('async function readClipboardImageForAutoMonitor()');
    expect(source).toContain('usePasteFallback: true');
  });
});
