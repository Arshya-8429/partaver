import { describe, expect, it } from 'vitest';
import { codeFamilyInfo } from '../../packages/domain/src/code-family.js';

describe('display-only code family heuristic', () => {
  it('returns a display root and variant while retaining the full raw code', () => {
    expect(codeFamilyInfo('0CF25B-1501113GA')).toEqual({
      root: '0CF25B-1501113',
      variant: 'GA',
      full: '0CF25B-1501113GA',
    });
  });

  it('does not remove a logistics suffix from an entry identity', () => {
    const info = codeFamilyInfo('0CF25B-1501113GA-01');
    expect(info.full).toBe('0CF25B-1501113GA-01');
  });
});
