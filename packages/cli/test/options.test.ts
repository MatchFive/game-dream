import { describe, expect, it } from 'vitest';
import { parseIntegerOption, parsePositiveNumberOption } from '../src/options.js';

describe('numeric CLI options', () => {
  it('accepts valid integers and applies minimums', () => {
    expect(parseIntegerOption('12', '--max-steps')).toBe(12);
    expect(parseIntegerOption('0', '--event-seq-start', 0)).toBe(0);
    expect(parseIntegerOption(undefined, '--max-steps')).toBeUndefined();
  });

  it('rejects fractional, negative, and non-numeric integers', () => {
    expect(() => parseIntegerOption('1.5', '--max-steps')).toThrow('--max-steps');
    expect(() => parseIntegerOption('-1', '--max-steps')).toThrow('--max-steps');
    expect(() => parseIntegerOption('abc', '--max-steps')).toThrow('--max-steps');
    expect(() => parseIntegerOption('0', '--candidates')).toThrow('--candidates');
  });

  it('accepts positive numbers and rejects zero or NaN', () => {
    expect(parsePositiveNumberOption('0.25', '--max-cost')).toBe(0.25);
    expect(parsePositiveNumberOption(undefined, '--max-cost')).toBeUndefined();
    expect(() => parsePositiveNumberOption('0', '--max-cost')).toThrow('--max-cost');
    expect(() => parsePositiveNumberOption('abc', '--max-cost')).toThrow('--max-cost');
  });
});
