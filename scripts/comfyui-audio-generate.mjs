#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const server = process.env.COMFYUI_URL ?? 'http://192.168.124.56:8000';
const modelNames = {
  unet: 'minimax_music3_dit_int8_convrot.safetensors',
  clip: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  vae: 'minimax_music3_dav.safetensors',
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function listModels(folder) {
  const response = await fetch(`${server}/models/${folder}`);
  if (!response.ok) throw new Error(`cannot list /models/${folder}: ${response.status}`);
  return (await response.json());
}

function missingModel(label, file, installed) {
  if (!installed.includes(file)) {
    throw new Error(
      `missing ${label} model: ${file}\nInstalled ${label} models: ${installed.join(', ') || '(none)'}`,
    );
  }
}

const caption = arg('caption');
const out = resolve(arg('out', 'C:/temp/gamedream-audio/bgm.mp3'));
const lyrics = arg('lyrics', '');
const duration = Number(arg('duration', '30'));
const seed = Number(arg('seed', String(Date.now() % 2147483647)));
if (!caption) {
  console.error('usage: comfyui-audio-generate.mjs --caption <style> [--out <mp3>] [--duration 30]');
  process.exit(2);
}

const [unets, clips, vaes] = await Promise.all([
  listModels('diffusion_models'),
  listModels('clip'),
  listModels('vae'),
]);
missingModel('diffusion', modelNames.unet, unets);
missingModel('text encoder', modelNames.clip, clips);
missingModel('VAE', modelNames.vae, vaes);

const workflow = {
  '1': {
    class_type: 'CLIPLoader',
    inputs: { clip_name: modelNames.clip, type: 'minimax', device: 'default' },
  },
  '2': {
    class_type: 'UNETLoader',
    inputs: { unet_name: modelNames.unet, weight_dtype: 'default' },
  },
  '3': {
    class_type: 'VAELoader',
    inputs: { vae_name: modelNames.vae },
  },
  '4': {
    class_type: 'MiniMaxMusic3TextEncode',
    inputs: {
      clip: ['1', 0],
      caption,
      lyrics,
      seed,
      max_duration: duration,
      cfg_scale: 1.5,
      top_k: 50,
    },
  },
  '5': {
    class_type: 'EmptyMiniMaxMusic3LatentAudio',
    inputs: { seconds: duration, batch_size: 1 },
  },
  '6': {
    class_type: 'ConditioningZeroOut',
    inputs: { conditioning: ['4', 0] },
  },
  '7': {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps: 30,
      cfg: 1.5,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
      model: ['2', 0],
      positive: ['4', 0],
      negative: ['6', 0],
      latent_image: ['5', 0],
    },
  },
  '8': {
    class_type: 'VAEDecodeAudio',
    inputs: { samples: ['7', 0], vae: ['3', 0] },
  },
  '9': {
    class_type: 'SaveAudioAdvanced',
    inputs: {
      audio: ['8', 0],
      filename_prefix: 'audio/gamedream_bgm',
      format: 'mp3',
      'format.quality': 'V0',
    },
  },
};

const submitted = await fetch(`${server}/prompt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: workflow, client_id: `gamedream-audio-${seed}` }),
});
const job = await submitted.json().catch(() => ({}));
if (!submitted.ok || !job.prompt_id) {
  throw new Error(`audio submit failed ${submitted.status}: ${JSON.stringify(job).slice(0, 1200)}`);
}
console.log(`prompt_id=${job.prompt_id}`);

let audio;
for (let attempt = 0; attempt < 300; attempt += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  const history = await fetch(`${server}/history/${job.prompt_id}`).then((response) => response.json());
  const outputs = history[job.prompt_id]?.outputs ?? {};
  for (const value of Object.values(outputs)) {
    const candidate = value?.audio?.[0] ?? value?.files?.[0] ?? value?.images?.[0];
    if (candidate?.filename) {
      audio = candidate;
      break;
    }
  }
  if (audio) break;
}
if (!audio) throw new Error('audio generation timed out');

const query = new URLSearchParams({
  filename: audio.filename,
  subfolder: audio.subfolder ?? '',
  type: audio.type ?? 'output',
});
const response = await fetch(`${server}/view?${query}`);
if (!response.ok) throw new Error(`audio download failed ${response.status}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await response.arrayBuffer()));
console.log(`saved=${out}`);
console.log(`source=${audio.filename}`);
