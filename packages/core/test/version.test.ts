import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('VERSION', () => {
  it('exports the package version', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
