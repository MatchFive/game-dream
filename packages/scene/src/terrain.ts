/**
 * 地形与边界：海岸、城墙、高程。
 *
 * 这三件事原来都写在 `spec.unmet` 里（"这份 format 做不到"），重跑 24 条真实需求后
 * 发现它们占了 unmet 的一半以上——不是模型偷懒，是求解器真的没有这些概念。
 * 现在它们和河/池塘一样，是 spec 的一等公民：模型说要海岸就给海岸，
 * 说要在城墙里就围一圈墙，说半山梯田就把地图切成台阶。
 *
 * 一个共同约束：这里的几何必须能被 BFS 判定。墙是栅格上的 `wall`、崖是 `cliff`，
 * 门洞和坡道是 `road`——连通性不靠"求解器认为应该连通"，而是走一遍图看。
 */
import type { Building, Gate, Rect, SceneSpec, WallSegment } from './schema.js';
import { Grid } from './grid.js';
import type { Rng } from './rng.js';

/** 0=北 1=东 2=南 3=西 */
export type Side = 0 | 1 | 2 | 3;

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/**
 * 把一堆矩形合并成尽量少的矩形：先按行并横向相邻的，再按列并纵向相邻的。
 * 不合并的话，一条 100 格长的城墙会是 100 个 1×1 矩形——layout.json 会膨胀，
 * 导出时也会生成 100 个碰撞体。
 */
export function coalesceRects(rects: Rect[]): Rect[] {
  if (rects.length === 0) return [];

  const rows = new Map<string, Rect[]>();
  for (const rect of rects) {
    const key = `${rect.y}:${rect.h}`;
    const list = rows.get(key);
    if (list) list.push(rect);
    else rows.set(key, [rect]);
  }
  const horizontal: Rect[] = [];
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    let run = { ...list[0] };
    for (const rect of list.slice(1)) {
      if (run.x + run.w === rect.x) {
        run.w += rect.w;
      } else {
        horizontal.push(run);
        run = { ...rect };
      }
    }
    horizontal.push(run);
  }

  const cols = new Map<string, Rect[]>();
  for (const rect of horizontal) {
    const key = `${rect.x}:${rect.w}`;
    const list = cols.get(key);
    if (list) list.push(rect);
    else cols.set(key, [rect]);
  }
  const merged: Rect[] = [];
  for (const list of cols.values()) {
    list.sort((a, b) => a.y - b.y);
    let run = { ...list[0] };
    for (const rect of list.slice(1)) {
      if (run.y + run.h === rect.y) {
        run.h += rect.h;
      } else {
        merged.push(run);
        run = { ...rect };
      }
    }
    merged.push(run);
  }

  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 把一串格子收成一堆矩形（每格先当 1×1，再合并）。 */
function cellsToRects(cells: Array<[number, number]>): Rect[] {
  return coalesceRects(cells.map(([x, y]) => ({ x, y, w: 1, h: 1 })));
}

// ---------------------------------------------------------------- 海岸

export interface CoastPlan {
  side: Side;
  /** 岸线离该边界的平均深度（格） */
  depth: number;
  /** 沿边每 1 格的实际岸线位置：第 i 列/行的海延伸到这里 */
  shore: number[];
}

/** 海铺在东西两侧之一：南北向的海岸在 2D 俯视图里更好认，也更像港口城镇。 */
export function planCoast(rng: Rng, bounds: { width: number; height: number }): CoastPlan {
  const side: Side = rng.chance(0.5) ? 1 : 3;
  const vertical = side === 1 || side === 3;
  const along = vertical ? bounds.height : bounds.width;
  const cross = vertical ? bounds.width : bounds.height;
  const depth = clamp(Math.round(cross * 0.16), 6, 14);

  const shore: number[] = [];
  let value = depth;
  for (let i = 0; i < along; i += 1) {
    // 缓变而不是逐格乱跳：跳变会画出锯齿，看起来像噪点不像岸线
    if (i > 0 && rng.chance(0.35)) {
      value = clamp(value + (rng.chance(0.5) ? 1 : -1), Math.max(4, depth - 2), depth + 3);
    }
    shore.push(value);
  }
  return { side, depth, shore };
}

/** 海水灌进栅格，返回合并后的水面矩形（供渲染、校验、导航用）。 */
export function paintCoast(grid: Grid, coast: CoastPlan): Rect[] {
  const cells: Rect[] = [];
  coast.shore.forEach((shore, i) => {
    if (coast.side === 0) {
      grid.fill(i, 0, 1, shore, 'water');
      cells.push({ x: i, y: 0, w: 1, h: shore });
    } else if (coast.side === 2) {
      grid.fill(i, grid.height - shore, 1, shore, 'water');
      cells.push({ x: i, y: grid.height - shore, w: 1, h: shore });
    } else if (coast.side === 3) {
      grid.fill(0, i, shore, 1, 'water');
      cells.push({ x: 0, y: i, w: shore, h: 1 });
    } else {
      grid.fill(grid.width - shore, i, shore, 1, 'water');
      cells.push({ x: grid.width - shore, y: i, w: shore, h: 1 });
    }
  });
  return coalesceRects(cells);
}

// ---------------------------------------------------------------- 高程

export interface CliffPlan {
  cliffs: WallSegment[];
  ramps: WallSegment[];
  terraces: Array<{ level: number; rect: Rect }>;
  /** 崖线在轴上的位置（升序），用于给建筑算台阶 */
  lines: number[];
}

const ELEVATION_AXIS: Record<string, 'x' | 'y'> = {
  north: 'y',
  south: 'y',
  west: 'x',
  east: 'x',
};

const HIGH_AT_START: Record<string, boolean> = {
  north: true,
  west: true,
  south: false,
  east: false,
};

/** 崖线位置：从高地那一侧往里，每 step 格一条。 */
export function cliffLines(elevation: SceneSpec['elevation'], bounds: { width: number; height: number }): number[] {
  if (elevation.levels <= 0) return [];
  const axis = ELEVATION_AXIS[elevation.from];
  const size = axis === 'y' ? bounds.height : bounds.width;
  const lo = 9;
  const hi = size - 9;
  const lines: number[] = [];
  for (let k = 1; k <= elevation.levels; k += 1) {
    const raw = HIGH_AT_START[elevation.from] ? k * elevation.step : size - k * elevation.step;
    if (raw < lo || raw > hi) break;
    lines.push(raw);
  }
  return lines.sort((a, b) => a - b);
}

/** 建筑所在台阶：它和高地之间隔了几条崖线。 */
export function elevationLevel(
  rect: Rect,
  elevation: SceneSpec['elevation'],
  bounds: { width: number; height: number },
): number {
  if (elevation.levels <= 0) return 0;
  const axis = ELEVATION_AXIS[elevation.from];
  const lines = cliffLines(elevation, bounds);
  const center = axis === 'y' ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
  const highAtStart = HIGH_AT_START[elevation.from];
  const level = lines.filter((line) => (highAtStart ? line > center : line < center)).length;
  return clamp(level, 0, elevation.levels);
}

/**
 * 把崖画进栅格。
 *
 * 崖线每隔 8 格错开 ±1 格——直线看着像刀切的，错开之后沿等高线走。
 * 错开不会漏：相邻两格只差 1，四邻接走对角线过不去，墙还是连续的。
 * 路穿过崖线的地方留成坡道（road），否则整座山会被一刀切断。
 */
export function paintElevation(
  grid: Grid,
  elevation: SceneSpec['elevation'],
  seed: number,
): CliffPlan {
  const lines = cliffLines(elevation, { width: grid.width, height: grid.height });
  if (lines.length === 0) {
    return { cliffs: [], ramps: [], terraces: [], lines: [] };
  }
  const axis = ELEVATION_AXIS[elevation.from];
  const along = axis === 'y' ? grid.width : grid.height;
  const cross = axis === 'y' ? grid.height : grid.width;

  const cliffCells: Array<[number, number]> = [];
  const rampCells: Array<[number, number]> = [];
  const offset = seed % 8;

  for (const line of lines) {
    for (let t = 3; t < along - 3; t += 1) {
      const jitter = (Math.floor((t + offset) / 8) % 3) - 1;
      const pos = clamp(line + jitter, 4, cross - 5);
      const x = axis === 'y' ? t : pos;
      const y = axis === 'y' ? pos : t;
      const cell = grid.get(x, y);
      if (cell === 'road' || cell === 'plaza') {
        rampCells.push([x, y]);
        continue;
      }
      if (cell === 'water' || cell === 'building') continue;
      grid.set(x, y, 'cliff');
      cliffCells.push([x, y]);
    }
  }

  // 台阶带：供渲染做明暗、供导出做叠放顺序
  const terraces: Array<{ level: number; rect: Rect }> = [];
  const size = axis === 'y' ? grid.height : grid.width;
  const boundaries = [0, ...lines, size];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i] + (i === 0 ? 0 : 1);
    const end = boundaries[i + 1];
    if (end - start <= 0) continue;
    const level = HIGH_AT_START[elevation.from] ? lines.length - i : i;
    terraces.push({
      level,
      rect: axis === 'y'
        ? { x: 0, y: start, w: grid.width, h: end - start }
        : { x: start, y: 0, w: end - start, h: grid.height },
    });
  }

  return {
    cliffs: cellsToRects(cliffCells).map((rect, index) => ({ id: `cliff-${index}`, rect })),
    ramps: cellsToRects(rampCells).map((rect, index) => ({ id: `ramp-${index}`, rect })),
    terraces,
    lines,
  };
}

// ---------------------------------------------------------------- 城墙

export interface WallPlan {
  walls: WallSegment[];
  gates: Gate[];
}

/**
 * 沿建成区外圈砌墙。
 *
 * 墙不按"美观的圆"来画，而是贴着最外侧建筑外扩一圈——街区的形状决定城墙的形状，
 * 这才像先有镇、后有墙。墙经过路的地方留门洞（路本来就是连通的），
 * 经过水的地方断开（海那一段是海堤，不是城门）。
 */
export function planWalls(
  grid: Grid,
  buildings: Building[],
  spec: SceneSpec,
  keepOpen: Array<[number, number]>,
): WallPlan {
  if (!spec.walls.enabled || buildings.length < 4) return { walls: [], gates: [] };

  const pad = spec.walls.setback;
  const thickness = spec.walls.thickness;
  const minX = Math.min(...buildings.map((building) => building.rect.x));
  const minY = Math.min(...buildings.map((building) => building.rect.y));
  const maxX = Math.max(...buildings.map((building) => building.rect.x + building.rect.w));
  const maxY = Math.max(...buildings.map((building) => building.rect.y + building.rect.h));

  const x0 = clamp(minX - pad, 1, grid.width - 3);
  const y0 = clamp(minY - pad, 1, grid.height - 3);
  const x1 = clamp(maxX + pad, x0 + 8, grid.width - 1);
  const y1 = clamp(maxY + pad, y0 + 8, grid.height - 1);

  const openCells = new Set(keepOpen.map(([x, y]) => `${x},${y}`));
  const wallCells: Array<[number, number]> = [];
  const gates: Gate[] = [];
  const gateAt = new Set<string>();

  const isOpen = (x: number, y: number): boolean => {
    const cell = grid.get(x, y);
    return openCells.has(`${x},${y}`) || cell === 'road' || cell === 'plaza';
  };

  /** 沿一行墙走一遍：路上开门，水上断开，其余砌墙。 */
  const sweep = (side: Side, cells: Array<[number, number]>, along: (cell: [number, number]) => number): void => {
    let run: { start: number; end: number } | null = null;
    const flush = () => {
      if (!run) return;
      const at = Math.floor((run.start + run.end) / 2);
      const key = `${side}:${at}`;
      if (!gateAt.has(key)) {
        gateAt.add(key);
        const spot: [number, number] = side === 0
          ? [at, y0]
          : side === 2
            ? [at, y1]
            : side === 3
              ? [x0, at]
              : [x1, at];
        gates.push({
          id: `gate-${gates.length}`,
          at: spot,
          width: run.end - run.start + 1,
          facing: side,
        });
      }
      run = null;
    };

    for (const cell of cells) {
      const at = along(cell);
      if (isOpen(cell[0], cell[1])) {
        if (run && at === run.end + 1) run.end = at;
        else {
          flush();
          run = { start: at, end: at };
        }
        continue;
      }
      flush();
      if (grid.get(cell[0], cell[1]) === 'water') continue; // 海堤那一段不砌墙
      grid.set(cell[0], cell[1], 'wall');
      wallCells.push(cell);
    }
    flush();
  };

  for (let t = 0; t < thickness; t += 1) {
    const top: Array<[number, number]> = [];
    const bottom: Array<[number, number]> = [];
    for (let x = x0; x <= x1; x += 1) {
      top.push([x, y0 + t]);
      bottom.push([x, y1 - t]);
    }
    sweep(0, top, (cell) => cell[0]);
    sweep(2, bottom, (cell) => cell[0]);
  }
  for (let t = 0; t < thickness; t += 1) {
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    // 角上两格归上下两道墙，左右两边从内缩一格起砌，避免同一格记两次
    for (let y = y0 + thickness; y <= y1 - thickness; y += 1) {
      left.push([x0 + t, y]);
      right.push([x1 - t, y]);
    }
    sweep(3, left, (cell) => cell[1]);
    sweep(1, right, (cell) => cell[1]);
  }

  const walls: WallSegment[] = cellsToRects(wallCells).map((rect, index) => ({
    id: `wall-${index}`,
    rect,
  }));

  return { walls, gates };
}

/** 锚点落进墙/水里时，沿一个方向挪到最近的可走格——否则自检脚本第一帧就找不到出生点。 */
export function snapToWalkable(
  grid: Grid,
  at: [number, number],
  step: [number, number],
): [number, number] {
  let [x, y] = at;
  for (let i = 0; i < 40; i += 1) {
    if (grid.inside(x, y) && grid.walkable(x, y)) return [x, y];
    x += step[0];
    y += step[1];
    if (!grid.inside(x, y)) break;
  }
  return at;
}
