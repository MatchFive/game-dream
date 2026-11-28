import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneBuildCommand } from '../src/commands/scene.js';

const kitPath = fileURLToPath(new URL('../../scene/kits/village-euro.json', import.meta.url));

/** 单元测试的输入：只用来验管道走向，不代表"场景内容由谁产出"。 */
const spec = {
  id: 'riverside-hamlet',
  name: '河畔小村',
  kind: 'village' as const,
  kitId: 'village-euro',
  seed: 4711,
  tileSize: 32,
  bounds: { width: 72, height: 60 },
  required: ['tavern', 'chapel', 'smithy'],
  water: 'river',
  decor: 0.5,
};

function writeSpec(dir: string): string {
  const file = join(dir, 'spec.json');
  writeFileSync(file, JSON.stringify(spec), 'utf8');
  return file;
}

describe('scene build into a project', () => {
  it('lands in <project>/game/scenes/<id>/ with project-relative res paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene project '));
    const specPath = writeSpec(root);

    const result = await sceneBuildCommand({ specPath, kitPath, projectPath: root });

    expect(result.finished).toBe(true);
    expect(result.scene).toBeDefined();
    const scene = result.scene!;
    expect(scene.id).toBe(spec.id);
    expect(scene.resPath).toBe(`res://game/scenes/${spec.id}/scene.tscn`);
    expect(scene.dir).toBe(join(root, 'game', 'scenes', spec.id));

    // 场景数据与引擎文件在同一个目录里：游戏侧不需要回读 .gamedream
    for (const file of ['scene.json', 'scene.svg', 'scene.tscn', 'tiles.tres', 'tiles.png', 'layout.json']) {
      expect(existsSync(join(scene.dir, file))).toBe(true);
    }

    // 资源前缀必须是场景自己的目录，否则进项目加载不到 prefab
    const tscn = readFileSync(join(scene.dir, 'scene.tscn'), 'utf8');
    expect(tscn).toContain(`path="res://game/scenes/${spec.id}/tiles.tres"`);
    expect(tscn).toContain(`path="res://game/scenes/${spec.id}/prefabs/`);

    // project.godot 属于工程根，不属于场景目录
    expect(existsSync(join(root, 'project.godot'))).toBe(true);
    expect(existsSync(join(scene.dir, 'project.godot'))).toBe(false);
    expect(readFileSync(join(root, 'project.godot'), 'utf8')).toContain(scene.resPath);

    const index = JSON.parse(readFileSync(join(root, 'game', 'scenes', 'index.json'), 'utf8')) as {
      scenes: Array<{ id: string; resPath: string }>;
    };
    expect(index.scenes.map((entry) => entry.id)).toEqual([spec.id]);
    expect(index.scenes[0].resPath).toBe(scene.resPath);
  });

  it('keeps an existing project.godot untouched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene project real '));
    const existing = ['; Engine configuration file.', 'config_version=5', '', '[application]', 'run/main_scene="res://game/_generated/main.tscn"', ''].join('\n');
    writeFileSync(join(root, 'project.godot'), existing, 'utf8');

    await sceneBuildCommand({ specPath: writeSpec(root), kitPath, projectPath: root });
    expect(readFileSync(join(root, 'project.godot'), 'utf8')).toBe(existing);
  });

  it('reuses the folder with --replace instead of piling up numbered copies', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene project replace '));
    const specPath = writeSpec(root);

    const first = await sceneBuildCommand({ specPath, kitPath, projectPath: root });
    const second = await sceneBuildCommand({ specPath, kitPath, projectPath: root });
    // 没给 --replace：不覆盖别人可能正在用着的场景
    expect(second.scene!.id).toBe(`${spec.id}-2`);

    // 覆盖时顺手清掉上一次的 prefab：否则缩小后的场景会留下已经不存在的建筑
    const stale = join(first.scene!.dir, 'prefabs', 'castle.tscn');
    writeFileSync(stale, '[gd_scene format=3]\n', 'utf8');
    const replaced = await sceneBuildCommand({ specPath, kitPath, projectPath: root, replace: true });
    expect(replaced.scene!.id).toBe(spec.id);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(join(replaced.scene!.dir, 'prefabs', 'tavern.tscn'))).toBe(true);
  });

  it('refuses to overwrite an explicit --id without --replace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene project id '));
    const specPath = writeSpec(root);
    await sceneBuildCommand({ specPath, kitPath, projectPath: root, id: 'harbour' });
    await expect(
      sceneBuildCommand({ specPath, kitPath, projectPath: root, id: 'harbour' }),
    ).rejects.toThrow(/already exists/);
    // 明确说了覆盖就照做
    const again = await sceneBuildCommand({ specPath, kitPath, projectPath: root, id: 'harbour', replace: true });
    expect(again.scene!.id).toBe('harbour');
  });

  it('still supports the standalone --out export', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene standalone '));
    const result = await sceneBuildCommand({ specPath: writeSpec(root), kitPath, outDir: join(root, 'out') });
    // 独立工程：`<out>/godot/` 是一个能直接打开的工程，场景在它的 scene/ 下
    expect(existsSync(join(root, 'out', 'godot', 'project.godot'))).toBe(true);
    expect(existsSync(join(root, 'out', 'godot', 'scene', 'scene.tscn'))).toBe(true);
    expect(result.scene).toBeUndefined();
  });

  it('reports a model that never produced a usable spec instead of crashing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene bad spec '));
    // 桩 provider 吐的是游戏工程 JSON，不是 SceneSpec：三次都解析失败
    await expect(
      sceneBuildCommand({ prompt: '河畔小渔村', kitPath, projectPath: root, provider: 'fake' }),
    ).rejects.toThrow(/spec rejected|SceneSpec/);
    // 失败不该留下半成品目录
    expect(existsSync(join(root, 'game', 'scenes'))).toBe(false);
  });

  it('requires one of --out or --project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream scene nowhere '));
    await expect(
      sceneBuildCommand({ specPath: writeSpec(root), kitPath }),
    ).rejects.toThrow(/--out|--project/);
  });
});
