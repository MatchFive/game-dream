import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AgentError } from '../errors.js';

export interface TemplateSelection {
  templateId: string;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  templateId: string;
}

const RULES: Rule[] = [
  { pattern: /roguelike|rogue|随机|永久死亡/i, templateId: 'roguelike-topdown' },
  { pattern: /platformer|平台|跳跃/i, templateId: 'platformer-2d' },
  { pattern: /塔防|tower defense/i, templateId: 'tower-defense' },
  { pattern: /射击|shooter/i, templateId: 'shooter-topdown' },
  { pattern: /puzzle|解谜|推箱子|箱子|sokoban/i, templateId: 'puzzle-2d' },
  { pattern: /rpg|角色扮演|背包|装备|技能|boss/i, templateId: 'rpg-action-m1' },
  { pattern: /rpg|角色扮演|背包|装备|技能|boss/i, templateId: 'rpg-action-m0' },
];

export function selectTemplate(input: {
  prompt: string;
  genre: string;
  templatesDir: string;
}): TemplateSelection {
  const available = existsSync(input.templatesDir)
    ? readdirSync(input.templatesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((id) => existsSync(join(input.templatesDir, id, 'template.yaml')))
    : [];

  if (available.length === 0) {
    throw new AgentError('NO_TEMPLATES', `no templates found in ${input.templatesDir}`);
  }

  const haystack = `${input.prompt} ${input.genre}`;
  const matchedAvailable = RULES.find(
    (rule) => rule.pattern.test(haystack) && available.includes(rule.templateId),
  );
  if (matchedAvailable) {
    return {
      templateId: matchedAvailable.templateId,
      reason: `rule:${matchedAvailable.templateId}`,
    };
  }

  const matched = RULES.find((rule) => rule.pattern.test(haystack));
  const sorted = [...available].sort();
  const fallback = sorted.includes('fixture-minimal') ? 'fixture-minimal' : sorted[0];
  return {
    templateId: fallback,
    reason: matched
      ? `fallback:${matched.templateId}->${fallback}`
      : `fallback:default->${fallback}`,
  };
}
