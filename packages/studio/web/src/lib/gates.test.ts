import { describe, expect, it } from 'vitest';
import { gatesPassed, gateStatusClass, gateStatusKey } from './gates';

describe('gate status presentation', () => {
  it('maps every known status to a distinct style', () => {
    expect(gateStatusClass('pass')).toBe('ok');
    expect(gateStatusClass('fail')).toBe('bad');
    expect(gateStatusClass('error')).toBe('error');
    expect(gateStatusClass('skip')).toBe('warn');
    expect(gateStatusClass(undefined)).toBe('warn');
    expect(gateStatusClass('something-new')).toBe('warn');
  });

  it('keeps environment errors distinguishable from project failures', () => {
    // X3 的核心：环境崩溃不能复用红色的 fail 文案
    expect(gateStatusClass('error')).not.toBe(gateStatusClass('fail'));
    expect(gateStatusKey('error')).toBe('studio.gateError');
    expect(gateStatusKey('fail')).toBe('common.fail');
  });

  it('maps statuses onto dictionary keys', () => {
    expect(gateStatusKey('pass')).toBe('common.pass');
    expect(gateStatusKey('skip')).toBe('common.skip');
    expect(gateStatusKey(undefined)).toBe('studio.notRun');
  });
});

describe('gatesPassed', () => {
  it('requires every gate to pass', () => {
    expect(gatesPassed({ G1: { status: 'pass' }, G2: { status: 'pass' } })).toBe(true);
  });

  it('treats skip and error as not passed', () => {
    expect(gatesPassed({ G1: { status: 'pass' }, G2: { status: 'skip' } })).toBe(false);
    expect(gatesPassed({ G1: { status: 'pass' }, G2: { status: 'error' } })).toBe(false);
    expect(gatesPassed({ G1: { status: 'pass' }, G2: { status: 'fail' } })).toBe(false);
  });

  it('does not call an empty gate set a pass', () => {
    expect(gatesPassed({})).toBe(false);
    expect(gatesPassed({ G1: undefined })).toBe(false);
  });
});
