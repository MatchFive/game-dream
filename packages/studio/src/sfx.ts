import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assetIdFor } from './assets.js';
import type { ComfyJob } from './types.js';

export type SfxType = 'hit' | 'pickup' | 'ui' | 'jump' | 'laser' | 'explosion' | 'footstep';

export interface SfxOptions {
  prompt: string;
  duration?: number;
  type?: SfxType;
  seed?: number;
}

export interface SfxResult {
  job: ComfyJob;
  file: string;
  type: SfxType;
  duration: number;
}

const SAMPLE_RATE = 44_100;

export function sfxTypeFromPrompt(prompt: string): SfxType {
  const value = prompt.toLowerCase();
  if (/(coin|pickup|collect|gem|item|power)/.test(value)) return 'pickup';
  if (/(jump|leap|hop)/.test(value)) return 'jump';
  if (/(explode|explosion|boom|blast)/.test(value)) return 'explosion';
  if (/(laser|shoot|shot|bolt|zap|energy)/.test(value)) return 'laser';
  if (/(step|walk|foot)/.test(value)) return 'footstep';
  if (/(ui|click|select|menu|confirm|button)/.test(value)) return 'ui';
  return 'hit';
}

function noise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function sample(type: SfxType, time: number, progress: number, random: () => number): number {
  const decay = Math.exp(-4.5 * progress);
  const attack = Math.min(1, time * 120);
  switch (type) {
    case 'pickup':
      return Math.sin(2 * Math.PI * (880 + progress * 660) * time) * decay * 0.5;
    case 'ui':
      return Math.sin(2 * Math.PI * 660 * time) * Math.exp(-9 * progress) * 0.35;
    case 'jump':
      return Math.sin(2 * Math.PI * (300 + progress * 420) * time) * decay * 0.45;
    case 'laser':
      return (Math.sin(2 * Math.PI * (1200 - progress * 900) * time) * 0.35
        + random() * 0.12) * decay;
    case 'explosion':
      return (random() * 0.55 + Math.sin(2 * Math.PI * 90 * time) * 0.35)
        * Math.exp(-2.4 * progress);
    case 'footstep':
      return random() * Math.exp(-16 * progress) * 0.45;
    case 'hit':
    default:
      return (random() * 0.4 + Math.sin(2 * Math.PI * 150 * time) * 0.35)
        * Math.exp(-8 * progress);
  }
}

function wavBuffer(samples: number[]): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((value, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2);
  });
  return buffer;
}

export function generateSfx(root: string, options: SfxOptions): SfxResult {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error('prompt is required');
  const requestedDuration = Number(options.duration ?? 0.6);
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(0.1, Math.min(3, requestedDuration))
    : 0.6;
  const type = options.type ?? sfxTypeFromPrompt(prompt);
  const seed = options.seed ?? Math.floor(Math.random() * 2_147_483_647);
  const random = noise(seed);
  const samples: number[] = [];
  const count = Math.max(1, Math.round(duration * SAMPLE_RATE));
  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / duration;
    samples.push(sample(type, time, progress, random) * 0.8);
  }
  const digest = createHash('sha1')
    .update(`${prompt}:${type}:${duration}:${seed}`)
    .digest('hex')
    .slice(0, 10);
  const slug = prompt.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    || 'sfx';
  const directory = join(root, '.gamedream', 'studio', 'generated');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `sfx-${slug}-${digest}.wav`);
  writeFileSync(file, wavBuffer(samples));
  const now = new Date().toISOString();
  writeFileSync(
    join(directory, `sfx-${slug}-${digest}.json`),
    `${JSON.stringify({
      name: `SFX ${type}`,
      prompt,
      seed,
      duration,
      type,
      kind: 'sfx',
      file: basename(file),
      createdAt: now,
    }, null, 2)}\n`,
    'utf8',
  );
  const relativeFile = relative(root, file).split('\\').join('/');
  const job: ComfyJob = {
    id: randomUUID(),
    status: 'done',
    prompt,
    transparent: false,
    seed,
    createdAt: now,
    updatedAt: now,
    progress: 'ready',
    kind: 'audio',
    duration,
    assetId: assetIdFor(relativeFile),
  };
  return { job, file: relativeFile, type, duration };
}
