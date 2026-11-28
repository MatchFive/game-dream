import type { SceneLayout, SceneSpec } from './schema.js';

export interface SceneIssue {
  code:
    | 'out-of-bounds'
    | 'overlap'
    | 'on-water'
    | 'blocked-entrance'
    | 'unreachable'
    | 'no-buildings'
    | 'too-dense'
    | 'too-sparse'
    | 'missing-required'
    | 'sealed-walls';
  detail: string;
}

export interface SceneValidation {
  pass: boolean;
  metrics: Record<string, number>;
  issues: SceneIssue[];
}

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const insideRect = (
  point: [number, number],
  rect: { x: number; y: number; w: number; h: number },
): boolean =>
  point[0] >= rect.x && point[0] < rect.x + rect.w && point[1] >= rect.y && point[1] < rect.y + rect.h;

/**
 * 场景质量闸门。指标同时是数据集里的质量标签：
 * 布局失败的原因（重叠 / 走不过去 / 太密）能直接用于 badcase 归类。
 */
export function validateScene(
  layout: SceneLayout,
  spec: SceneSpec,
  walkable: (x: number, y: number) => boolean,
  reachable: Set<string>,
): SceneValidation {
  const issues: SceneIssue[] = [];
  const total = layout.bounds.width * layout.bounds.height;

  // 边界
  const outOfBounds = [
    ...layout.buildings.flatMap((building) =>
      building.rect.x < 0
      || building.rect.y < 0
      || building.rect.x + building.rect.w > layout.bounds.width
      || building.rect.y + building.rect.h > layout.bounds.height
        ? [building.id]
        : [],
    ),
    ...layout.props.flatMap((prop) =>
      prop.at[0] < 0 || prop.at[1] < 0 || prop.at[0] >= layout.bounds.width || prop.at[1] >= layout.bounds.height
        ? [prop.id]
        : [],
    ),
  ];
  if (outOfBounds.length > 0) {
    issues.push({ code: 'out-of-bounds', detail: outOfBounds.slice(0, 5).join(', ') });
  }

  // 建筑互相重叠
  const overlapping: string[] = [];
  for (let i = 0; i < layout.buildings.length; i += 1) {
    for (let j = i + 1; j < layout.buildings.length; j += 1) {
      if (overlaps(layout.buildings[i].rect, layout.buildings[j].rect)) {
        overlapping.push(`${layout.buildings[i].id}×${layout.buildings[j].id}`);
      }
    }
  }
  if (overlapping.length > 0) {
    issues.push({ code: 'overlap', detail: overlapping.slice(0, 5).join(', ') });
  }

  // 建筑压在水面上
  const waterLots = layout.lots.filter((lot) => lot.kind === 'water');
  const onWater = layout.buildings
    .filter((building) => waterLots.some((lot) => overlaps(building.rect, lot.rect)))
    .map((building) => building.id);
  if (onWater.length > 0) {
    issues.push({ code: 'on-water', detail: onWater.join(', ') });
  }

  // 入口必须落在可走格子上，且从出生点可达
  const blocked = layout.buildings.filter((building) => !walkable(building.entrance[0], building.entrance[1]));
  if (blocked.length > 0) {
    issues.push({ code: 'blocked-entrance', detail: blocked.slice(0, 5).map((b) => b.id).join(', ') });
  }
  const unreachable = layout.buildings.filter((building) => {
    const [x, y] = building.entrance;
    return !reachable.has(`${x},${y}`);
  });
  if (unreachable.length > 0) {
    issues.push({ code: 'unreachable', detail: unreachable.slice(0, 5).map((b) => b.id).join(', ') });
  }

  if (layout.buildings.length === 0) {
    issues.push({ code: 'no-buildings', detail: 'solver placed nothing' });
  }

  // 城墙围死了没有门：城里出不去，等于把玩家关起来。
  // 只有一路堵死时才会出现（四面都是建筑、没有路穿过墙），所以是真缺陷不是噪声。
  if (layout.walls.length > 0 && layout.gates.length === 0) {
    issues.push({ code: 'sealed-walls', detail: `${layout.walls.length} wall segments, 0 gates` });
  }

  // 需求覆盖
  const placedPrefabs = new Set(layout.buildings.map((building) => building.prefab));
  const missing = spec.required.filter((prefab) => !placedPrefabs.has(prefab));
  if (missing.length > 0) {
    issues.push({ code: 'missing-required', detail: missing.join(', ') });
  }

  // 密度：太密走不动，太空不像聚落
  const buildingArea = layout.buildings.reduce((sum, building) => sum + building.rect.w * building.rect.h, 0);
  const density = buildingArea / total;
  if (density > 0.6) issues.push({ code: 'too-dense', detail: `density ${density.toFixed(2)}` });
  if (layout.buildings.length > 0 && density < 0.05) {
    issues.push({ code: 'too-sparse', detail: `density ${density.toFixed(2)}` });
  }

  const countCells = (kind: string) =>
    layout.lots
      .filter((lot) => lot.kind === kind)
      .reduce((sum, lot) => sum + lot.rect.w * lot.rect.h, 0);

  // 形态：多少建筑是"贴街连排 / 带院落"，多少是"独立落地"。
  // 这条指标用来判断聚落感——独立落地的比例高，说明求解器在撒房子而不是在排街。
  const typologyCount = (kind: string) => layout.buildings.filter((building) => building.typology === kind).length;
  const streetWall = typologyCount('street-wall');
  const courtyards = typologyCount('courtyard');
  const standalone = typologyCount('standalone');
  const frontageShare = layout.buildings.length === 0
    ? 0
    : Number(((streetWall + courtyards) / layout.buildings.length).toFixed(3));

  // 共墙（联排）：两栋建筑共享一段 ≥2 格的山墙。数值越高越像"沿街连排"，
  // 全是 0 就说明还是独栋撒点。
  let attached = 0;
  for (let i = 0; i < layout.buildings.length; i += 1) {
    const a = layout.buildings[i].rect;
    const shares = layout.buildings.some((other, j) => {
      if (i === j) return false;
      const b = other.rect;
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const touchingX = a.x + a.w === b.x || b.x + b.w === a.x;
      const touchingY = a.y + a.h === b.y || b.y + b.h === a.y;
      return (touchingX && overlapY >= 2) || (touchingY && overlapX >= 2);
    });
    if (shares) attached += 1;
  }

  const metrics: Record<string, number> = {
    buildings: layout.buildings.length,
    props: layout.props.length,
    roads: layout.roads.length,
    streetWall,
    courtyards,
    standalone,
    frontageShare,
    attached,
    // 模型声明的"做不到"数量：不判失败，但要在指标里看得见
    unmet: (spec.unmet ?? []).length,
    // 地形与边界：城墙段/门洞/崖线/坡道，以及建筑分布在第几级台阶上
    walls: layout.walls.length,
    gates: layout.gates.length,
    cliffs: layout.cliffs.length,
    ramps: layout.ramps.length,
    terraces: layout.terraces.length,
    coast: layout.coastSide === null ? 0 : 1,
    // 天际线：楼层均值与最高层。全是同一个数字就说明高度没分层，还是撒方块
    floorMean: layout.buildings.length === 0
      ? 0
      : Number((layout.buildings.reduce((sum, b) => sum + b.floors, 0) / layout.buildings.length).toFixed(2)),
    floorMax: layout.buildings.reduce((max, b) => Math.max(max, b.floors), 0),
    tallShare: layout.buildings.length === 0
      ? 0
      : Number((layout.buildings.filter((b) => b.floors >= 3).length / layout.buildings.length).toFixed(3)),
    elevationMax: layout.buildings.reduce((max, building) => Math.max(max, building.elevation), 0),
    attachedShare: layout.buildings.length === 0 ? 0 : Number((attached / layout.buildings.length).toFixed(3)),
    density: Number(density.toFixed(3)),
    roadRatio: Number((countCells('road') / total).toFixed(3)),
    greenRatio: Number((countCells('green') / total).toFixed(3)),
    waterRatio: Number((countCells('water') / total).toFixed(3)),
    reachableCells: reachable.size,
    entranceCoverage: layout.buildings.length === 0
      ? 0
      : Number(
        (
          layout.buildings.filter((building) => reachable.has(`${building.entrance[0]},${building.entrance[1]}`)).length
          / layout.buildings.length
        ).toFixed(3),
      ),
  };

  return { pass: issues.length === 0, metrics, issues };
}

/** 便捷封装：判断点是否落在某类地块内。 */
export function pointInKind(layout: SceneLayout, point: [number, number], kind: string): boolean {
  return layout.lots.some((lot) => lot.kind === kind && insideRect(point, lot.rect));
}
