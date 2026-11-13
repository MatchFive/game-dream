import type { ModelProvider, ModelRequest } from '../types.js';

export interface FakeProviderOptions {
  responses?: string[];
}

function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length < 3 || ['rpg', 'game', 'demo', 'test'].includes(ascii)) {
    return 'gamedream-demo';
  }
  return ascii;
}

function rawPrompt(user: string): string {
  const match = user.match(/Game idea:\s*([\s\S]*?)\n\nReturn the JSON object now\./);
  return (match?.[1] ?? user).trim();
}

function inferGenre(prompt: string): string {
  if (/吸血鬼|幸存者|survivor|割草|怪潮/i.test(prompt)) return 'survivor';
  if (/roguelike|rogue|随机|永久死亡/i.test(prompt)) return 'roguelike';
  if (/platformer|平台|跳跃/i.test(prompt)) return 'platformer';
  if (/塔防|tower defense/i.test(prompt)) return 'tower-defense';
  if (/射击|shooter/i.test(prompt)) return 'shooter';
  if (/puzzle|解谜|推箱子|箱子|sokoban/i.test(prompt)) return 'puzzle';
  return 'action-rpg';
}

export class FakeProvider implements ModelProvider {
  readonly name = 'fake';
  private readonly responses: string[];

  constructor(options: FakeProviderOptions = {}) {
    this.responses = [...(options.responses ?? [])];
  }

  async complete(request: ModelRequest): Promise<string> {
    const queued = this.responses.shift();
    if (queued !== undefined) return queued;
    const prompt = rawPrompt(request.user);
    return JSON.stringify({
      version: 1,
      project: {
        name: slugify(prompt),
        engine: 'godot',
        godot_version: '4.4',
        dimension: '2d',
        view: 'top-down',
        target: ['windows'],
      },
      genre: {
        primary: inferGenre(prompt),
        secondary: [],
      },
      vision: {
        fantasy: prompt,
        pillars: ['快速验证核心循环'],
        references: [],
      },
      scope: {
        levels: 1,
        enemies: 1,
        bosses: 0,
        skills: 0,
        items: 3,
        quests: 0,
      },
      systems: {
        inventory: true,
        save: true,
      },
      content: {
        language: 'zh-CN',
      },
      acceptance: ['项目可启动', 'HUD 显示 Inventory: 1'],
    });
  }
}
