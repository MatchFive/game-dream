import { z } from 'zod';

const point = z.tuple([z.number().int(), z.number().int()]);

const rect = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

/**
 * 场景需求（人的语言 + 硬约束），是布局求解器的输入。
 * 与引擎无关：同一份 spec 可以导出到 Godot 或 Unity。
 */
export const sceneSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['village', 'town', 'city', 'camp']),
  kitId: z.string().min(1),
  seed: z.number().int().nonnegative(),
  tileSize: z.number().int().min(8).max(128).default(32),
  /** 以格子为单位的地图尺寸 */
  bounds: z.object({
    width: z.number().int().min(24).max(512),
    height: z.number().int().min(24).max(512),
  }),
  /** 需要出现的功能建筑；求解器保证每种至少一个（放得下时） */
  required: z.array(z.string().min(1)).default([]),
  /** 额外氛围道具密度 0–1，越大越密 */
  decor: z.number().min(0).max(1).default(0.4),
  /** 是否用水系（河流/池塘）切开地图 */
  water: z.enum(['none', 'pond', 'river']).default('none'),
  notes: z.string().optional(),
});

export type SceneSpec = z.infer<typeof sceneSpecSchema>;

export const prefabSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['house', 'shop', 'workshop', 'civic', 'landmark', 'dock']),
  /** 占地（格），求解器可在 min..max 之间选 */
  footprint: z.object({
    minWidth: z.number().int().min(3),
    maxWidth: z.number().int().min(3),
    minHeight: z.number().int().min(3),
    maxHeight: z.number().int().min(3),
  }),
  /** 抽取权重 */
  weight: z.number().positive().default(1),
  /** 视觉：俯视填充色与描边色，渲染与风格校验都用它 */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  roof: z.enum(['flat', 'gable', 'hip']).default('gable'),
  /** 是否必须贴主干道（市政、地标） */
  mainRoad: z.boolean().default(false),
});

export const kitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 风格标签，导出到引擎时映射材质/预制体集合 */
  style: z.string().min(1),
  palette: z.object({
    ground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    road: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    plaza: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    water: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    green: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  prefabs: z.array(prefabSchema).min(1),
});

export type Prefab = z.infer<typeof prefabSchema>;
export type Kit = z.infer<typeof kitSchema>;

export const roadSchema = z.object({
  id: z.string(),
  kind: z.enum(['main', 'street', 'alley']),
  width: z.number().int().positive(),
  points: z.array(point).min(2),
});

export const lotSchema = z.object({
  id: z.string(),
  kind: z.enum(['buildable', 'plaza', 'green', 'water']),
  rect,
});

export const buildingSchema = z.object({
  id: z.string(),
  prefab: z.string(),
  role: z.string(),
  rect,
  /** 0=北 1=东 2=南 3=西，正门朝向 */
  facing: z.number().int().min(0).max(3),
  /**
   * 摆放方式，用于数据集的形态统计：
   * street-wall 贴街连排 / courtyard 带院落 / standalone 独立落地
   */
  typology: z.enum(['street-wall', 'courtyard', 'standalone']).optional(),
  entrance: point,
  color: z.string(),
  roof: z.string(),
  floors: z.number().int().min(1).max(4),
});

export const propSchema = z.object({
  id: z.string(),
  type: z.enum(['tree', 'well', 'lamp', 'crate', 'sign', 'dock', 'flower']),
  at: point,
});

export const anchorSchema = z.object({
  id: z.string(),
  kind: z.enum(['spawn', 'exit', 'poi']),
  at: point,
  label: z.string().optional(),
});

/** 求解后的场景：引擎无关的完整布局，可直接导出或渲染。 */
export const sceneLayoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  kitId: z.string(),
  style: z.string(),
  seed: z.number().int(),
  tileSize: z.number().int(),
  bounds: z.object({ width: z.number().int(), height: z.number().int() }),
  palette: kitSchema.shape.palette,
  roads: z.array(roadSchema),
  lots: z.array(lotSchema),
  buildings: z.array(buildingSchema),
  props: z.array(propSchema),
  anchors: z.array(anchorSchema),
});

export type SceneLayout = z.infer<typeof sceneLayoutSchema>;
export type Road = z.infer<typeof roadSchema>;
export type Lot = z.infer<typeof lotSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type SceneProp = z.infer<typeof propSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type Rect = z.infer<typeof rect>;

export function parseSceneSpec(input: unknown): SceneSpec {
  return sceneSpecSchema.parse(input);
}

export function parseKit(input: unknown): Kit {
  return kitSchema.parse(input);
}

export function parseSceneLayout(input: unknown): SceneLayout {
  return sceneLayoutSchema.parse(input);
}
