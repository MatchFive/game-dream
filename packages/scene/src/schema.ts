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
  /** 水域：river/pond 在地图中间，coast 沿一条边铺开海面 */
  water: z.enum(['none', 'pond', 'river', 'coast']).default('none'),
  /**
   * 城墙：沿建成区外圈一圈墙，主干道穿过的地方自动留门洞。
   * 墙不是装饰——它会挡路，所以门洞位置由路网决定，城区依然连通。
   */
  walls: z
    .object({
      enabled: z.boolean().default(false),
      /** 墙体厚度（格） */
      thickness: z.number().int().min(1).max(2).default(1),
      /** 城墙离最外侧建筑的最小距离（格），留出临墙那一排房子的位置 */
      setback: z.number().int().min(1).max(8).default(3),
    })
    .default({}),
  /**
   * 高程：从 from 那一侧向内每 step 格抬一级，级间是崖（不可通行），
   * 路穿过崖的地方变成坡道。levels=0 即平地。
   */
  elevation: z
    .object({
      /** 抬几级（0 = 平地） */
      levels: z.number().int().min(0).max(3).default(0),
      /** 每级进深（格） */
      step: z.number().int().min(5).max(40).default(12),
      /** 高地在哪一侧 */
      from: z.enum(['north', 'east', 'south', 'west']).default('north'),
    })
    .default({}),
  /**
   * 需求里这份 format 表达不了的部分（泉眼、矿坑、沼泽、雪原…）。
   *
   * 不判失败——求解器没有这些能力不是模型的错；但必须显式写出来，
   * 否则"沿海崖顶"被悄悄做成一条河，数据里永远发现不了。
   * 城墙/海岸/高程现在能做了，再写进 unmet 就是谎报。
   */
  unmet: z.array(z.string().min(1)).default([]),
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
    /** 岸线沙滩；不给就按 ground 提亮 */
    sand: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    /** 崖壁；不给就按 ground 压暗 */
    rock: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    /** 墙体；不给就按 road 压暗 */
    wall: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
  /** 所在台阶：0 = 最低一级，用于渲染阴影与导出叠放顺序 */
  elevation: z.number().int().min(0).max(4).default(0),
  /**
   * 临街性质，楼层数的依据（主街高、背街低）。
   * 记下来是为了可追溯：看一行数据就知道这栋楼为什么是四层。
   */
  band: z.enum(['main', 'street', 'back', 'yard', 'outskirt']).default('street'),
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

/** 城墙上一段连续墙体（门洞已从这些矩形里扣掉）。 */
export const wallSchema = z.object({
  id: z.string(),
  rect,
});

/** 门洞：城墙被路切开的位置，导出成可通行的缺口 + 门框。 */
export const gateSchema = z.object({
  id: z.string(),
  /** 门洞中点（格） */
  at: point,
  /** 门洞宽度（格），等于穿过的路宽 */
  width: z.number().int().positive(),
  /** 门洞朝向：0=北 1=东 2=南 3=西，指墙的走向 */
  facing: z.number().int().min(0).max(3),
});

/**
 * 一级台阶：从 from 那侧数第 level 级（0 = 最低）。
 * 只记带的范围，具体高差由 cliffs 表达。
 */
export const terraceSchema = z.object({
  level: z.number().int().min(0),
  rect,
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
  /** 城墙段与门洞；没开城墙时为空 */
  walls: z.array(wallSchema).default([]),
  gates: z.array(gateSchema).default([]),
  /** 崖壁（不可通行）与坡道（崖上的路口） */
  cliffs: z.array(wallSchema).default([]),
  ramps: z.array(wallSchema).default([]),
  terraces: z.array(terraceSchema).default([]),
  /** 海在哪个边（0=北 1=东 2=南 3=西）；内陆地图为 null */
  coastSide: z.number().int().min(0).max(3).nullable().default(null),
});

export type SceneLayout = z.infer<typeof sceneLayoutSchema>;
export type Road = z.infer<typeof roadSchema>;
export type Lot = z.infer<typeof lotSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type SceneProp = z.infer<typeof propSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type WallSegment = z.infer<typeof wallSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type Terrace = z.infer<typeof terraceSchema>;
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
