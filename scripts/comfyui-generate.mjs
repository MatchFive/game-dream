#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const server = (arg('server', process.env.COMFYUI_URL ?? 'http://192.168.124.56:8000')).replace(/\/$/, '');
const workflowPath = resolve(arg('workflow', 'D:/QQ/image_qwen_image_2_1_t2i.json'));
const prompt = arg('prompt');
const out = resolve(arg('out'));
const seed = Number(arg('seed', String(Date.now() % 2147483647)));
if (!prompt || !out) {
  console.error('usage: comfyui-generate.mjs --prompt <text> --out <png> [--workflow <json>] [--seed <n>]');
  process.exit(2);
}

const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
const promptNode = workflow['459:471'];
const switchNode = workflow['459:474'];
const sampler = workflow['459:458'];
if (!promptNode?.inputs || !switchNode?.inputs || !sampler?.inputs) {
  throw new Error('workflow does not contain the expected Qwen image nodes');
}
promptNode.inputs.prompt = prompt;
switchNode.inputs.on_false = prompt;
switchNode.inputs.switch = false;
sampler.inputs.seed = seed;

const submit = await fetch(`${server}/prompt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: workflow, client_id: `gamedream-${seed}` }),
});
const submitted = await submit.json().catch(() => ({}));
if (!submit.ok || !submitted.prompt_id) {
  throw new Error(`comfy submit failed ${submit.status}: ${JSON.stringify(submitted).slice(0, 1000)}`);
}
console.log(`prompt_id=${submitted.prompt_id}`);

let image;
for (let attempt = 0; attempt < 240; attempt += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  const history = await fetch(`${server}/history/${submitted.prompt_id}`).then((response) => response.json());
  const entry = history[submitted.prompt_id];
  image = entry?.outputs?.['461']?.images?.[0];
  if (image) break;
}
if (!image) throw new Error('comfy generation timed out');

const query = new URLSearchParams({
  filename: image.filename,
  subfolder: image.subfolder ?? '',
  type: image.type ?? 'output',
});
const imageResponse = await fetch(`${server}/view?${query}`);
if (!imageResponse.ok) throw new Error(`comfy image download failed ${imageResponse.status}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await imageResponse.arrayBuffer()));
console.log(`saved=${out}`);
console.log(`source=${image.filename}`);
