export const SYSTEM_PROMPT = `You are GameDream's intake planner for 2D Godot games.
Return one JSON object only. No markdown fences, no commentary.
The JSON must match this shape:
{
  "version": 1,
  "project": { "name": "kebab-case", "engine": "godot", "godot_version": "4.4", "dimension": "2d", "view": "top-down", "target": ["windows"] },
  "genre": { "primary": "action-rpg", "secondary": [] },
  "vision": { "fantasy": "one sentence", "pillars": ["..."], "references": [] },
  "scope": { "levels": 1, "enemies": 1, "bosses": 0, "skills": 0, "items": 3, "quests": 0 },
  "systems": { "inventory": true, "save": true },
  "content": { "language": "zh-CN" },
  "acceptance": ["项目可启动"]
}
Keep scope small: one level, at most one enemy, no boss unless asked.`;

export function buildDraftPrompt(prompt: string): string {
  return `Game idea:\n${prompt}\n\nReturn the JSON object now.`;
}

export function buildRepairPrompt(previous: string, error: string): string {
  return `Your previous response was invalid.\nError: ${error}\nPrevious response:\n${previous}\n\nReturn a corrected JSON object only.`;
}
