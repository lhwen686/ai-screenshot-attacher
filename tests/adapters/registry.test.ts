import { describe, expect, it } from 'vitest';
import { adapters, getAdapterById } from '../../src/adapters/registry';
import { AI_TARGETS, TARGET_IDS } from '../../src/shared/constants';

describe('adapter registry', () => {
  it('has one adapter for each configured target id', () => {
    expect(adapters.map((adapter) => adapter.id).sort()).toEqual([...TARGET_IDS].sort());
  });

  it('returns adapters by target id', () => {
    for (const targetId of TARGET_IDS) {
      expect(getAdapterById(targetId)?.defaultUrl).toBe(AI_TARGETS[targetId].defaultUrl);
    }
  });
});
