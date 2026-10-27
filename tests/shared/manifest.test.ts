import { describe, expect, it } from 'vitest';
import manifest from '../../manifest.json';
import { AI_TARGETS, TARGET_IDS, isSupportedTargetUrl } from '../../src/shared/constants';

describe('extension target permissions and commands', () => {
  it('grants exactly the configured target hosts and keeps the four default shortcut limit', () => {
    expect([...manifest.host_permissions].sort()).toEqual(
      TARGET_IDS.flatMap((id) => AI_TARGETS[id].urlPatterns).sort()
    );
    expect(Object.values(manifest.commands).filter((command) => 'suggested_key' in command)).toHaveLength(4);
    for (const id of TARGET_IDS) {
      expect(manifest.commands).toHaveProperty(`attach-to-${id}`);
    }
  });

  it.each(TARGET_IDS)('recognizes only the HTTPS hosts explicitly granted for %s', (id) => {
    const url = new URL(AI_TARGETS[id].defaultUrl);
    expect(isSupportedTargetUrl(url.href)).toBe(true);
    expect(isSupportedTargetUrl(`http://${url.hostname}/`)).toBe(false);
    expect(isSupportedTargetUrl(`https://${url.hostname}.example.com/`)).toBe(false);
  });
});
