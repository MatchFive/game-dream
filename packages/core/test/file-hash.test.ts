import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '@gamedream/testing';
import { hashDirectory } from '../src/composer/file-hash.js';

describe('hashDirectory', () => {
  it('ignores Godot import sidecars while detecting real content changes', () => {
    const directory = makeTempDir('gamedream hash ');
    mkdirSync(join(directory, 'assets'), { recursive: true });
    writeFileSync(join(directory, 'main.gd'), 'extends Node\n', 'utf8');
    writeFileSync(join(directory, 'assets', 'hero.svg'), '<svg/>', 'utf8');

    const initial = hashDirectory(directory);
    writeFileSync(join(directory, 'main.gd.uid'), 'uid://1', 'utf8');
    writeFileSync(join(directory, 'assets', 'hero.svg.import'), 'import', 'utf8');
    mkdirSync(join(directory, '.godot'), { recursive: true });
    writeFileSync(join(directory, '.godot', 'cache'), 'cache', 'utf8');
    writeFileSync(join(directory, '.DS_Store'), 'junk', 'utf8');
    expect(hashDirectory(directory)).toBe(initial);

    writeFileSync(join(directory, 'main.gd'), 'extends Node2D\n', 'utf8');
    expect(hashDirectory(directory)).not.toBe(initial);
  });
});
