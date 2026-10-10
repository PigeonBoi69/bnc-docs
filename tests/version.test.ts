import { describe, expect, it } from 'vitest';
import { nextVersion } from '../tools/bump-version';

describe('version bump (one step per update, digits roll over after 9)', () => {
  it('adds one to the last part', () => {
    expect(nextVersion('0.1.2')).toBe('0.1.3');
    expect(nextVersion('0.1.0')).toBe('0.1.1');
    expect(nextVersion('1.4.7')).toBe('1.4.8');
  });
  it('rolls .9 over into the next part', () => {
    expect(nextVersion('0.1.9')).toBe('0.2.0');
    expect(nextVersion('0.9.9')).toBe('1.0.0');
    expect(nextVersion('1.9.9')).toBe('2.0.0');
  });
  it('works for two-part versions too (0.9 -> 1.0)', () => {
    expect(nextVersion('0.8')).toBe('0.9');
    expect(nextVersion('0.9')).toBe('1.0');
  });
  it('rejects things that are not versions', () => {
    expect(() => nextVersion('banana')).toThrow();
    expect(() => nextVersion('1.2.3.4')).toThrow();
  });
});
