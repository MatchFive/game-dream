import { z } from 'zod';

/**
 * 一张图集里，每个精灵是什么。
 *
 * 字段刻意收窄：`kind` 是封闭集合（好聚合、好过滤），`label` 只要一句中文名，
 * `prefab` 限定在本套件的 prefab id 上——模型乱编一个建筑类型对下游毫无用处。
 */
export const spriteLabelSchema = z.object({
  index: z.number().int().min(0),
  kind: z.enum([
    'building', // 整栋建筑（有屋顶、有立面）
    'building-part', // 屋顶/墙/门窗这类零件
    'wall', // 城墙、院墙段
    'gate', // 牌坊、城门、院门
    'terrain', // 铺地、草地、水面（可平铺）
    'prop', // 摊位、桌椅、灯笼、箱子这类小件
    'tree',
    'vehicle', // 船、车
    'decoration', // 旗、招牌、石碑
    'unknown',
  ]),
  label: z.string().min(1).max(40),
  tags: z.array(z.string().min(1).max(24)).max(8).default([]),
  /** 建议挂到哪个 prefab 上；不是建筑就给 null */
  prefab: z.string().nullable().default(null),
  /** 地形类：这块能不能四边无缝平铺 */
  tileable: z.boolean().default(false),
});

export type SpriteLabel = z.infer<typeof spriteLabelSchema>;

export const labelBatchSchema = z.object({
  sprites: z.array(spriteLabelSchema),
});

export interface ImageDescriber {
  readonly name: string;
  /** 传入 base64（不带 data: 前缀），返回模型原文 */
  describe(request: { imageBase64: string; system: string; user: string; maxTokens?: number }): Promise<string>;
}

/** OpenAI 兼容的多模态接口（MiniMax / OpenAI / 本地网关都是这套）。 */
export function createOpenAIDescriber(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): ImageDescriber {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    name: `openai:${options.model}`,
    async describe(request) {
      const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: request.system },
            {
              role: 'user',
              content: [
                { type: 'text', text: request.user },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${request.imageBase64}` } },
              ],
            },
          ],
          temperature: 0,
          max_tokens: request.maxTokens ?? 8000,
          response_format: { type: 'json_object' },
          stream: false,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`vision HTTP ${response.status}: ${detail}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return payload.choices?.[0]?.message?.content ?? '';
    },
  };
}

export const LABEL_SYSTEM_PROMPT = `You catalogue 2D game art sprites for a top-down RPG scene builder.
You get one contact sheet: a grid of sprite cut-outs, each with a small dark number in its top-left corner.
Return exactly one JSON object, no prose, no code fences:
{ "sprites": [ { "index": number, "kind": string, "label": string, "tags": string[], "prefab": string | null, "tileable": boolean } ] }

Rules:
- "index" MUST be the number printed on that cell. Do not invent numbers, do not skip cells you can see.
- "kind" is one of: building, building-part, wall, gate, terrain, prop, tree, vehicle, decoration, unknown.
  Use "building" only when the sprite is a whole structure with a roof; a lone roof, wall panel, door or window is "building-part".
- "label" is a short Chinese name a level designer would use, e.g. "两层酒楼（红灯笼）", "石砌院墙段", "青石板铺地".
- "tags" are lowercase search keywords (chinese or english), at most 8.
- "prefab" is the closest id from the allowed list, or null. Only pick a prefab when the sprite could serve as that building in a top-down town; never invent ids.
- "tileable" is true only for terrain sprites that look seamless as a repeating tile.`;

/** 一次问多少个精灵：太多模型会漏编号，太少调用次数爆炸。16 是实测比较稳的数。 */
export const DEFAULT_BATCH = 16;

export function labelPrompt(options: {
  sheetName: string;
  indices: number[];
  prefabs: string[];
}): string {
  return [
    `Sheet: ${options.sheetName}`,
    `The contact sheet contains exactly these sprite indices (numbers printed in the cells): ${options.indices.join(', ')}.`,
    `Allowed prefab ids: ${options.prefabs.length > 0 ? options.prefabs.join(', ') : '(none)'}.`,
    'Return one entry per index listed above, in ascending order.',
  ].join('\n');
}

/** 从模型原文里取 JSON：有些模型会加解释或代码块。 */
export function parseLabelResponse(raw: string): SpriteLabel[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model did not return a JSON object');
  const parsed = labelBatchSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  return parsed.sprites;
}
