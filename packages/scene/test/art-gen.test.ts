import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '@gamedream/core';
import {
  applyTransparency,
  applyWorkflow,
  artPromptFor,
  detectWorkflow,
  generateKitArtwork,
  trimTransparent,
  type ComfyClient,
  type WorkflowGraph,
} from '../src/index.js';
import { loadKit } from '../src/index.js';
import { fileURLToPath } from 'node:url';

const kit = loadKit(fileURLToPath(new URL('../kits/village-euro.json', import.meta.url)));

/** 结构跟 Qwen t2i 工作流一致的最小图：TextGenerate → 编码 → 采样 → VAE → Save */
const graph: WorkflowGraph = {
  '459:452': { class_type: 'TextEncodeQwenImage21', inputs: { prompt: ['459:472', 0], clip: ['459:453', 0] } },
  '459:453': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b.safetensors' } },
  '459:456': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024 } },
  '459:457': { class_type: 'VAEDecode', inputs: { samples: ['459:458', 0] } },
  '459:458': { class_type: 'KSampler', inputs: { seed: 42, model: ['459:451', 0] } },
  '459:471': { class_type: 'TextGenerate', inputs: { prompt: 'old prompt', max_length: 4096 } },
  '459:474': { class_type: 'ComfySwitchNode', inputs: { switch: false, on_false: 'old prompt' } },
  '461': { class_type: 'SaveImageAdvanced', inputs: { images: ['459:457', 0], format: 'png' } },
};

describe('scene artwork generation', () => {
  it('asks for a three-quarter building with a transparent background', () => {
    const house = kit.prefabs.find((prefab) => prefab.id === 'house-small');
    const prompt = artPromptFor(house!);
    expect(prompt).toContain('high three-quarter angle');
    expect(prompt).toContain('roof dominant');
    expect(prompt).toContain('consistent art style');
    // 每种建筑的屋顶材质不同，提示词必须跟着变，否则七张图一个样
    const chapel = artPromptFor(kit.prefabs.find((prefab) => prefab.id === 'chapel')!);
    expect(chapel).not.toBe(prompt);
    expect(chapel).toContain('stone slate');
  });

  it('detects where the prompt, seed and output live', () => {
    const workflow = detectWorkflow(graph);
    // 直出分支（TextGenerate）与兜底分支（Switch.on_false）都要写，否则改写开关一开就丢提示词
    expect(workflow.prompt.map((binding) => binding.node).sort()).toEqual(['459:471', '459:474']);
    expect(workflow.seed).toEqual({ node: '459:458', input: 'seed' });
    expect(workflow.output.node).toBe('461');
  });

  it('applies values without mutating the source graph', () => {
    const workflow = detectWorkflow(graph);
    const next = applyWorkflow(workflow, { prompt: 'a tavern', seed: 7 });

    expect(next['459:471'].inputs?.prompt).toBe('a tavern');
    expect(next['459:474'].inputs?.on_false).toBe('a tavern');
    expect(next['459:458'].inputs?.seed).toBe(7);
    // 原图必须没被改：同一份 workflow 要复用很多次
    expect(graph['459:471'].inputs?.prompt).toBe('old prompt');
  });

  it('rewires the save node through a background-removal branch', () => {
    const patched = applyTransparency(graph, { node: '461', field: 'images' });
    expect(patched['461'].inputs?.images).toEqual(['gamedream_alpha', 0]);
    expect(patched.gamedream_bg_model.class_type).toBe('LoadBackgroundRemovalModel');
    expect(patched.gamedream_alpha.class_type).toBe('JoinImageWithAlpha');
    // 原图不能被改
    expect(graph['461'].inputs?.images).toEqual(['459:457', 0]);
  });

  it('trims the transparent margin the model leaves around the subject', () => {
    // 64x64 画布，中间 20x30 是不透明的主体
    const width = 64;
    const height = 64;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 20; y < 50; y += 1) {
      for (let x = 22; x < 42; x += 1) {
        const offset = (y * width + x) * 4;
        rgba[offset] = 200;
        rgba[offset + 1] = 120;
        rgba[offset + 2] = 60;
        rgba[offset + 3] = 255;
      }
    }
    const { buffer, trimmed } = trimTransparent(encodePng(width, height, rgba));
    expect(trimmed).toEqual({ width: 24, height: 34 }); // 主体 + 四周 2px
    expect(buffer.byteLength).toBeLessThan(encodePng(width, height, rgba).byteLength);

    // 已经贴边（不透明铺满）的图不该被裁
    const full = Buffer.alloc(8 * 8 * 4, 255);
    expect(trimTransparent(encodePng(8, 8, full)).trimmed).toBeNull();
  });

  it('writes one png per prefab plus a manifest through comfyui', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream art '));
    const calls: string[] = [];
    const png = (() => {
      const width = 16;
      const height = 16;
      const rgba = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i += 1) rgba.fill(255, i * 4, i * 4 + 4);
      return encodePng(width, height, rgba);
    })();

    const client: ComfyClient = {
      baseUrl: 'http://comfy.test',
      pollMs: 1,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/prompt')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { prompt: WorkflowGraph };
          // 提交上去的图必须已经带上提示词和透明分支
          expect(body.prompt['459:471'].inputs?.prompt).toContain('three-quarter');
          expect(body.prompt.gamedream_alpha).toBeDefined();
          return new Response(JSON.stringify({ prompt_id: 'job-1' }), { status: 200 });
        }
        if (url.includes('/history/')) {
          return new Response(
            JSON.stringify({ 'job-1': { outputs: { '461': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } }),
            { status: 200 },
          );
        }
        if (url.includes('/view?')) {
          return new Response(png, { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch,
    };

    const manifest = await generateKitArtwork({
      kit,
      outDir: dir,
      client,
      workflow: detectWorkflow(graph),
      only: ['house-small', 'chapel'],
    });

    expect(manifest.entries).toHaveLength(2);
    for (const entry of manifest.entries) {
      expect(existsSync(join(dir, entry.file))).toBe(true);
    }
    // manifest 记录提示词与尺寸：换了图也要能查"这套是怎么来的"
    expect(manifest.entries[0].prompt).toContain('transparent background');
    const written = JSON.parse(readFileSync(join(dir, `${kit.id}.art-manifest.json`), 'utf8'));
    expect(written.entries).toHaveLength(2);
    expect(calls.filter((url) => url.endsWith('/prompt'))).toHaveLength(2);
  });
});
