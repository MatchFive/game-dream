import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyPath } from '../src/io/copy-path.js';
import { makeTempDir } from '@gamedream/testing';

function plantTree(root: string, label: string): string {
  const source = join(root, label);
  mkdirSync(join(source, 'nested', 'deep'), { recursive: true });
  writeFileSync(join(source, 'top.txt'), `top:${label}`, 'utf8');
  writeFileSync(join(source, 'nested', 'mid.txt'), `mid:${label}`, 'utf8');
  writeFileSync(join(source, 'nested', 'deep', 'leaf.txt'), `leaf:${label}`, 'utf8');
  return source;
}

describe('copyPath', () => {
  it('copies a nested directory tree into an ASCII destination', () => {
    const root = makeTempDir('gamedream copy ascii ');
    const source = plantTree(root, 'source');
    const target = join(root, 'out');

    copyPath(source, target);

    expect(readdirSync(target).sort()).toEqual(['nested', 'top.txt']);
    expect(readFileSync(join(target, 'nested/deep/leaf.txt'), 'utf8')).toBe('leaf:source');
  });

  it('copies into a non-ASCII destination', () => {
    const root = makeTempDir('gamedream copy dest ');
    const source = plantTree(root, 'source');
    const target = join(root, '我的 游戏 Ünïcode');

    copyPath(source, target);

    expect(readFileSync(join(target, 'nested/mid.txt'), 'utf8')).toBe('mid:source');
  });

  it('copies from a non-ASCII source', () => {
    const root = makeTempDir('gamedream copy source ');
    const source = plantTree(root, '源 目录');

    copyPath(source, join(root, 'ascii-target'));

    expect(readFileSync(join(root, 'ascii-target/nested/deep/leaf.txt'), 'utf8')).toBe(
      'leaf:源 目录',
    );
  });

  it('copies between two non-ASCII paths', () => {
    const root = makeTempDir('gamedream copy both ');
    const source = plantTree(root, '项目 源码');
    const target = join(root, '项目 输出', '游戏');

    copyPath(source, target);

    expect(readFileSync(join(target, 'top.txt'), 'utf8')).toBe('top:项目 源码');
  });

  it('overwrites existing files and merges into an existing directory', () => {
    const root = makeTempDir('gamedream copy merge ');
    const source = plantTree(root, 'source');
    const target = join(root, 'out');
    mkdirSync(join(target, 'nested'), { recursive: true });
    writeFileSync(join(target, 'top.txt'), 'stale', 'utf8');
    writeFileSync(join(target, 'nested', 'keep.txt'), 'keep', 'utf8');

    copyPath(source, target);

    expect(readFileSync(join(target, 'top.txt'), 'utf8')).toBe('top:source');
    expect(readFileSync(join(target, 'nested', 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('copies a single file into a non-ASCII destination directory', () => {
    const root = makeTempDir('gamedream copy file ');
    const source = join(root, 'BgmPlayer.cs');
    writeFileSync(source, 'class BgmPlayer {}', 'utf8');

    copyPath(source, join(root, '我的游戏', 'Assets', 'BgmPlayer.cs'));

    expect(readFileSync(join(root, '我的游戏', 'Assets', 'BgmPlayer.cs'), 'utf8')).toBe(
      'class BgmPlayer {}',
    );
  });
});
