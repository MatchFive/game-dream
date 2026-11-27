import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import { generateSfx, sfxTypeFromPrompt } from '../src/sfx.js';

const SAMPLE_RATE = 44_100;

/** 读 16-bit 单声道 WAV 的采样值。 */
function readSamples(file: string): number[] {
  const buffer = readFileSync(file);
  const dataStart = 44;
  const count = (buffer.length - dataStart) / 2;
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    samples.push(buffer.readInt16LE(dataStart + index * 2) / 32768);
  }
  return samples;
}

function analyze(samples: number[]) {
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return { peak, mean, first: Math.abs(samples[0]), last: Math.abs(samples[samples.length - 1]) };
}

describe('procedural sfx', () => {
  it('maps prompts onto sound types', () => {
    expect(sfxTypeFromPrompt('coin pickup')).toBe('pickup');
    expect(sfxTypeFromPrompt('laser shot')).toBe('laser');
    expect(sfxTypeFromPrompt('big explosion')).toBe('explosion');
    expect(sfxTypeFromPrompt('menu click')).toBe('ui');
    expect(sfxTypeFromPrompt('hero jump')).toBe('jump');
    expect(sfxTypeFromPrompt('gravel footsteps')).toBe('footstep');
    expect(sfxTypeFromPrompt('something else')).toBe('hit');
  });

  it('fades the edges to zero so playback does not click', () => {
    const root = makeTempDir('gamedream sfx edges ');
    const result = generateSfx(root, { prompt: 'laser zap', duration: 0.6, seed: 7 });
    const stats = analyze(readSamples(join(root, result.file)));
    // 首尾各留至少 4ms/20ms 的斜坡，边界值必须接近静音
    expect(stats.first).toBeLessThan(0.02);
    expect(stats.last).toBeLessThan(0.02);
  });

  it('normalizes every type to the same peak instead of per-type gains', () => {
    const root = makeTempDir('gamedream sfx peak ');
    for (const prompt of ['ui click', 'huge explosion', 'coin pickup']) {
      const result = generateSfx(root, { prompt, duration: 0.5, seed: 11 });
      const stats = analyze(readSamples(join(root, result.file)));
      expect(stats.peak).toBeGreaterThan(0.85);
      expect(stats.peak).toBeLessThanOrEqual(0.9);
    }
  });

  it('keeps the signal free of a DC offset', () => {
    const root = makeTempDir('gamedream sfx dc ');
    const result = generateSfx(root, { prompt: 'explosion', duration: 0.8, seed: 3 });
    expect(Math.abs(analyze(readSamples(join(root, result.file))).mean)).toBeLessThan(0.005);
  });

  it('is deterministic for a given seed', () => {
    const root = makeTempDir('gamedream sfx deterministic ');
    const first = generateSfx(root, { prompt: 'laser zap', duration: 0.6, seed: 42 });
    const second = generateSfx(root, { prompt: 'laser zap', duration: 0.6, seed: 42 });
    expect(second.file).toBe(first.file);
    expect(readFileSync(join(root, first.file))).toEqual(readFileSync(join(root, second.file)));
  });

  it('writes a sidecar that records the procedural engine', () => {
    const root = makeTempDir('gamedream sfx sidecar ');
    const result = generateSfx(root, { prompt: 'coin', duration: 0.4, seed: 5 });
    const meta = JSON.parse(readFileSync(join(root, result.file.replace(/\.wav$/, '.json')), 'utf8'));
    expect(meta.kind).toBe('sfx');
    expect(meta.engine).toBe('procedural');
    expect(meta.duration).toBeCloseTo(0.4, 3);
  });

  it('clamps duration into the supported window', () => {
    const root = makeTempDir('gamedream sfx duration ');
    expect(generateSfx(root, { prompt: 'hit', duration: 9, seed: 1 }).duration).toBe(3);
    expect(generateSfx(root, { prompt: 'hit', duration: 0.01, seed: 1 }).duration).toBe(0.1);
  });

  it('writes exactly the requested number of samples', () => {
    const root = makeTempDir('gamedream sfx length ');
    const result = generateSfx(root, { prompt: 'hit', duration: 0.5, seed: 2 });
    expect(readSamples(join(root, result.file)).length).toBe(Math.round(0.5 * SAMPLE_RATE));
  });
});
