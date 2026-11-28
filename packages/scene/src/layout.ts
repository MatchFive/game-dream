import type {
  Anchor,
  Building,
  Gate,
  Kit,
  Lot,
  Prefab,
  Rect,
  Road,
  SceneLayout,
  SceneProp,
  SceneSpec,
  WallSegment,
} from './schema.js';
import { Grid } from './grid.js';
import { createRng, weightedPick, type Rng } from './rng.js';
import {
  elevationLevel,
  paintCoast,
  paintElevation,
  planCoast,
  planWalls,
  snapToWalkable,
} from './terrain.js';

export interface SceneBuildResult {
  layout: SceneLayout;
  grid: Grid;
}

const MARGIN = 3;
const BLOCK_GAP = 1;
const MIN_LOT = 8;

/** BSP 递归切分：切到不能再切，得到若干"地块"。 */
function splitLots(rect: Rect, rng: Rng, out: Rect[] = []): Rect[] {
  const canSplitX = rect.w >= MIN_LOT * 2 + BLOCK_GAP;
  const canSplitY = rect.h >= MIN_LOT * 2 + BLOCK_GAP;
  if (!canSplitX && !canSplitY) {
    out.push(rect);
    return out;
  }
  // 长边优先切，避免出现细长条地块
  const horizontal = canSplitY && (!canSplitX || rect.h * rng.next() > rect.w * 0.5);
  if (horizontal) {
    const min = MIN_LOT;
    const max = rect.h - MIN_LOT - BLOCK_GAP;
    const cut = rng.int(min, Math.max(min, max));
    splitLots({ x: rect.x, y: rect.y, w: rect.w, h: cut }, rng, out);
    splitLots(
      { x: rect.x, y: rect.y + cut + BLOCK_GAP, w: rect.w, h: rect.h - cut - BLOCK_GAP },
      rng,
      out,
    );
  } else {
    const min = MIN_LOT;
    const max = rect.w - MIN_LOT - BLOCK_GAP;
    const cut = rng.int(min, Math.max(min, max));
    splitLots({ x: rect.x, y: rect.y, w: cut, h: rect.h }, rng, out);
    splitLots(
      { x: rect.x + cut + BLOCK_GAP, y: rect.y, w: rect.w - cut - BLOCK_GAP, h: rect.h },
      rng,
      out,
    );
  }
  return out;
}

function roadDistance(rect: Rect, grid: Grid): number {
  let best = Number.POSITIVE_INFINITY;
  for (let y = rect.y - 4; y < rect.y + rect.h + 4; y += 1) {
    for (let x = rect.x - 4; x < rect.x + rect.w + 4; x += 1) {
      if (grid.get(x, y) !== 'road' && grid.get(x, y) !== 'plaza') continue;
      const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w - 1));
      const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h - 1));
      best = Math.min(best, Math.max(dx, dy));
    }
  }
  return best;
}

/** 找最近的道路方向，决定建筑正门朝哪。返回 0=北 1=东 2=南 3=西。 */
function facingRoad(rect: Rect, grid: Grid): number {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const candidates: Array<{ side: number; dist: number }> = [];
  for (let d = 1; d <= 10; d += 1) {
    if (grid.get(Math.round(cx), rect.y - d) === 'road' || grid.get(Math.round(cx), rect.y - d) === 'plaza') {
      candidates.push({ side: 0, dist: d });
    }
    if (grid.get(rect.x + rect.w - 1 + d, Math.round(cy)) === 'road' || grid.get(rect.x + rect.w - 1 + d, Math.round(cy)) === 'plaza') {
      candidates.push({ side: 1, dist: d });
    }
    if (grid.get(Math.round(cx), rect.y + rect.h - 1 + d) === 'road' || grid.get(Math.round(cx), rect.y + rect.h - 1 + d) === 'plaza') {
      candidates.push({ side: 2, dist: d });
    }
    if (grid.get(rect.x - d, Math.round(cy)) === 'road' || grid.get(rect.x - d, Math.round(cy)) === 'plaza') {
      candidates.push({ side: 3, dist: d });
    }
    if (candidates.length > 0 && d >= 2) break;
  }
  if (candidates.length === 0) return 2;
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].side;
}

/** 候选建筑位置：中心优先，再上下左右微调，避开水面。 */
function pickBuildingRect(rect: Rect, bw: number, bh: number, rng: Rng, grid: Grid): Rect | null {
  const cx = rect.x + Math.floor((rect.w - bw) / 2);
  const cy = rect.y + Math.floor((rect.h - bh) / 2);
  const offsets: Array<[number, number]> = [
    [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0],
    [0, 2], [0, -2], [2, 0], [-2, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  if (rng.chance(0.5)) offsets.reverse();
  for (const [dx, dy] of offsets) {
    const candidate: Rect = {
      x: Math.max(rect.x + 1, Math.min(cx + dx, rect.x + rect.w - bw - 1)),
      y: Math.max(rect.y + 1, Math.min(cy + dy, rect.y + rect.h - bh - 1)),
      w: bw,
      h: bh,
    };
    if (candidate.x < rect.x + 1 || candidate.y < rect.y + 1) continue;
    if (candidate.x + bw > rect.x + rect.w || candidate.y + bh > rect.y + rect.h) continue;
    if (rectFree(grid, candidate)) return candidate;
  }
  return null;
}

function entranceFor(rect: Rect, side: number): [number, number] {
  const cx = rect.x + Math.floor(rect.w / 2);
  const cy = rect.y + Math.floor(rect.h / 2);
  if (side === 0) return [cx, rect.y - 1];
  if (side === 2) return [cx, rect.y + rect.h];
  if (side === 3) return [rect.x - 1, cy];
  return [rect.x + rect.w, cy];
}

/** 只把空地染成绿地，别把水面/道路盖掉。 */
function paintGreen(grid: Grid, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (grid.get(x, y) === 'empty') grid.set(x, y, 'green');
    }
  }
}

/** 从入口向道路方向挖一条 1 格宽巷道（L 形），让建筑真正"接上"路网。 */
function carveAlley(grid: Grid, start: [number, number], facing: number): Array<[number, number]> | null {
  const [sx, sy] = start;
  const dir: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const [dx, dy] = dir[facing];
  let target: [number, number] | null = null;
  for (let step = 1; step <= 14; step += 1) {
    const x = sx + dx * step;
    const y = sy + dy * step;
    if (grid.get(x, y) === 'road' || grid.get(x, y) === 'plaza') {
      target = [x, y];
      break;
    }
    if (grid.get(x, y) === 'building' || grid.get(x, y) === 'water' || grid.get(x, y) === 'cliff') break;
  }
  if (!target) return null;
  const points: Array<[number, number]> = [start];
  const paint = (x: number, y: number) => {
    const cell = grid.get(x, y);
    if (cell === 'empty' || cell === 'green') grid.set(x, y, 'road');
  };
  // 先沿朝向走到目标行/列，再横向对齐
  if (dy !== 0) {
    for (let y = sy; y !== target[1]; y += Math.sign(target[1] - sy)) paint(sx, y);
    for (let x = sx; x !== target[0]; x += Math.sign(target[0] - sx)) paint(x, target[1]);
  } else {
    for (let x = sx; x !== target[0]; x += Math.sign(target[0] - sx)) paint(x, sy);
    for (let y = sy; y !== target[1]; y += Math.sign(target[1] - sy)) paint(target[0], y);
  }
  points.push(target);
  return points;
}

/** 地块是否压到水面：这类地块不参与建造，也不登记为绿地。 */
function lotHitsWater(grid: Grid, rect: Rect): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (grid.get(x, y) === 'water') return true;
    }
  }
  return false;
}


type Side = 0 | 1 | 2 | 3;

/** 建筑前脸退到地块内一格，留出人行道。 */
const SETBACK = 1;

interface Frontage {
  side: Side;
  /** 这条边上有多少格正对道路/广场 */
  length: number;
  /** 是否主要面向广场（市政/地标该放这里） */
  plaza: boolean;
}

/** 建筑前脸所在的坐标系：沿街方向 + 进深方向。 */
interface FrontFrame {
  side: Side;
  /** 沿街起点与可用长度 */
  start: number;
  length: number;
  /** 从前脸到地块另一侧的可用进深 */
  depth: number;
  /** 前沿（贴线）与后沿各取一个深度，得到具体矩形 */
  rect(along: number, alongLen: number, deep: number): Rect;
  /** 贴地块后墙的版本，用来放后院小屋 */
  back(along: number, alongLen: number, deep: number): Rect;
  /** 从正面向内偏移 offset 处切一条厚 thickness 的带（用于后巷） */
  band(offset: number, thickness: number, along: number, alongLen: number): Rect;
  lot: Rect;
}


/** 一串道路带之间剩下的空隙（宽度不足的直接丢掉，太窄建不了东西）。 */
function gapsBetween(
  bands: Array<[number, number]>,
  lo: number,
  hi: number,
  minWidth = 6,
): Array<[number, number]> {
  const sorted = [...bands].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cursor = lo;
  for (const [start, end] of sorted) {
    if (start > cursor) out.push([cursor, Math.min(start, hi)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < hi) out.push([cursor, hi]);
  return out.filter(([start, end]) => end - start >= minWidth && end > lo && start < hi);
}


/** 从 area 里挖掉 hole，最多得到四块互不重叠的矩形。 */
function subtractRect(area: Rect, hole: Rect): Rect[] {
  const x0 = Math.max(area.x, hole.x);
  const y0 = Math.max(area.y, hole.y);
  const x1 = Math.min(area.x + area.w, hole.x + hole.w);
  const y1 = Math.min(area.y + area.h, hole.y + hole.h);
  if (x0 >= x1 || y0 >= y1) return [area];

  const out: Rect[] = [];
  if (y0 > area.y) out.push({ x: area.x, y: area.y, w: area.w, h: y0 - area.y });
  if (y1 < area.y + area.h) out.push({ x: area.x, y: y1, w: area.w, h: area.y + area.h - y1 });
  if (x0 > area.x) out.push({ x: area.x, y: y0, w: x0 - area.x, h: y1 - y0 });
  if (x1 < area.x + area.w) out.push({ x: x1, y: y0, w: area.x + area.w - x1, h: y1 - y0 });
  return out;
}


/** 两个矩形之间隔了几格（相交算 0）。 */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.max(dx, dy);
}

function edgeCells(rect: Rect, side: Side): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  if (side === 0) for (let x = rect.x; x < rect.x + rect.w; x += 1) cells.push([x, rect.y - 1]);
  else if (side === 2) for (let x = rect.x; x < rect.x + rect.w; x += 1) cells.push([x, rect.y + rect.h]);
  else if (side === 3) for (let y = rect.y; y < rect.y + rect.h; y += 1) cells.push([rect.x - 1, y]);
  else for (let y = rect.y; y < rect.y + rect.h; y += 1) cells.push([rect.x + rect.w, y]);
  return cells;
}

/** 一条边算不算"临街"：至少 55% 的格子正对道路或广场。 */
function edgeFrontage(rect: Rect, grid: Grid, side: Side): Frontage | null {
  const cells = edgeCells(rect, side);
  let road = 0;
  let plaza = 0;
  for (const [x, y] of cells) {
    const cell = grid.get(x, y);
    if (cell === 'road') road += 1;
    else if (cell === 'plaza') plaza += 1;
  }
  const coverage = (road + plaza) / cells.length;
  if (coverage < 0.55) return null;
  return { side, length: cells.length, plaza: plaza > road };
}

/** 取最该被贴的那条边：面向广场优先，其次最长。 */
function lotFrontage(rect: Rect, grid: Grid): Frontage | null {
  const edges = ([0, 1, 2, 3] as Side[])
    .map((side) => edgeFrontage(rect, grid, side))
    .filter((frontage): frontage is Frontage => frontage !== null);
  if (edges.length === 0) return null;
  edges.sort((a, b) => Number(b.plaza) - Number(a.plaza) || b.length - a.length);
  return edges[0];
}

function frontFrame(lot: Rect, frontage: Frontage): FrontFrame {
  const horizontal = frontage.side === 0 || frontage.side === 2;
  const start = (horizontal ? lot.x : lot.y) + SETBACK;
  const length = (horizontal ? lot.w : lot.h) - SETBACK * 2;
  const depth = (horizontal ? lot.h : lot.w) - SETBACK * 2;
  const side = frontage.side;
  const at = (along: number, alongLen: number, deep: number, fromBack: boolean): Rect => {
    if (side === 0) {
      return { x: along, y: fromBack ? lot.y + lot.h - SETBACK - deep : lot.y + SETBACK, w: alongLen, h: deep };
    }
    if (side === 2) {
      return { x: along, y: fromBack ? lot.y + SETBACK : lot.y + lot.h - SETBACK - deep, w: alongLen, h: deep };
    }
    if (side === 3) {
      return { x: fromBack ? lot.x + lot.w - SETBACK - deep : lot.x + SETBACK, y: along, w: deep, h: alongLen };
    }
    return { x: fromBack ? lot.x + SETBACK : lot.x + lot.w - SETBACK - deep, y: along, w: deep, h: alongLen };
  };
  return {
    side,
    start,
    length,
    depth,
    lot,
    rect: (along, alongLen, deep) => at(along, alongLen, deep, false),
    back: (along, alongLen, deep) => at(along, alongLen, deep, true),
    band: (offset, thickness, along, alongLen) => {
      if (side === 0) return { x: along, y: lot.y + SETBACK + offset, w: alongLen, h: thickness };
      if (side === 2) return { x: along, y: lot.y + lot.h - SETBACK - offset - thickness, w: alongLen, h: thickness };
      if (side === 3) return { x: lot.x + SETBACK + offset, y: along, w: thickness, h: alongLen };
      return { x: lot.x + lot.w - SETBACK - offset - thickness, y: along, w: thickness, h: alongLen };
    },
  };
}

/** 候选矩形内必须全是空地/绿地——不能压路、压广场、压水、压别的建筑。 */
function rectFree(grid: Grid, rect: Rect): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const cell = grid.get(x, y);
      if (cell !== 'empty' && cell !== 'green') return false;
    }
  }
  return true;
}

/** 地块是否已经整体被占（广场切进来、或压在已建建筑上）。 */
function lotFree(grid: Grid, rect: Rect): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const cell = grid.get(x, y);
      if (cell === 'road' || cell === 'plaza' || cell === 'water' || cell === 'building') return false;
    }
  }
  return true;
}

/**
 * 广场切进地块时，把地块裁成剩下那块完整矩形（取面积大的一侧）。
 * 不这么做的话，广场边上要么被整块跳过（广场周围全是空地），
 * 要么建筑直接盖在广场上。
 */
function clipAroundPlaza(rect: Rect, plaza: Rect): Rect | null {
  const overlapX = rect.x < plaza.x + plaza.w && plaza.x < rect.x + rect.w;
  const overlapY = rect.y < plaza.y + plaza.h && plaza.y < rect.y + rect.h;
  if (!(overlapX && overlapY)) return rect;

  const right: Rect = { x: plaza.x + plaza.w, y: rect.y, w: rect.x + rect.w - (plaza.x + plaza.w), h: rect.h };
  const top: Rect = { x: rect.x, y: rect.y, w: rect.w, h: plaza.y - rect.y };
  const options = [right, top].filter((candidate) => candidate.w > 0 && candidate.h > 0);
  if (options.length === 0) return null;
  options.sort((a, b) => b.w * b.h - a.w * a.h);
  const best = options[0];
  // 裁完只剩窄条就不值得建，交给绿地
  return best.w >= 5 && best.h >= 5 ? best : null;
}

export function buildScene(spec: SceneSpec, kit: Kit): SceneBuildResult {
  const rng = createRng(spec.seed);
  const { width: W, height: H } = spec.bounds;
  const grid = new Grid(W, H);
  const roads: Road[] = [];
  const lots: Lot[] = [];
  const buildings: Building[] = [];
  const props: SceneProp[] = [];
  const anchors: Anchor[] = [];

  // 1. 路网：十字主干道 + 大图次级街道。所有道路都记成"带"，
  //    地块直接在带与带之间的空隙里切，天生临街——这是街墙能成立的前提。
  const mainW = 4;
  const verticalX = Math.round(W * (0.34 + rng.next() * 0.12));
  const horizontalY = Math.round(H * (0.44 + rng.next() * 0.1));
  const vBands: Array<[number, number]> = [[verticalX, verticalX + mainW]];
  const hBands: Array<[number, number]> = [[horizontalY, horizontalY + mainW]];

  grid.fill(verticalX, MARGIN, mainW, H - MARGIN * 2, 'road');
  grid.fill(MARGIN, horizontalY, W - MARGIN * 2, mainW, 'road');
  roads.push({
    id: 'road-main-v',
    kind: 'main',
    width: mainW,
    points: [[verticalX + Math.floor(mainW / 2), MARGIN], [verticalX + Math.floor(mainW / 2), H - MARGIN]],
  });
  roads.push({
    id: 'road-main-h',
    kind: 'main',
    width: mainW,
    points: [[MARGIN, horizontalY + Math.floor(mainW / 2)], [W - MARGIN, horizontalY + Math.floor(mainW / 2)]],
  });

  // 1.5 大图补次级路网：只靠一条十字主路，离路远的地块全成绿地，城市会变成荒地
  if (W >= 120 || H >= 100) {
    const spacing = 18;
    const streetW = 2;
    for (let x = MARGIN + spacing; x < W - MARGIN - streetW; x += spacing) {
      if (x + streetW > verticalX - 2 && x < verticalX + mainW + 2) continue; // 让开主路
      grid.fill(x, MARGIN, streetW, H - MARGIN * 2, 'road');
      vBands.push([x, x + streetW]);
      roads.push({
        id: `street-v-${x}`,
        kind: 'street',
        width: streetW,
        points: [[x + 1, MARGIN], [x + 1, H - MARGIN]],
      });
    }
    for (let y = MARGIN + spacing; y < H - MARGIN - streetW; y += spacing) {
      if (y + streetW > horizontalY - 2 && y < horizontalY + mainW + 2) continue;
      grid.fill(MARGIN, y, W - MARGIN * 2, streetW, 'road');
      hBands.push([y, y + streetW]);
      roads.push({
        id: `street-h-${y}`,
        kind: 'street',
        width: streetW,
        points: [[MARGIN, y + 1], [W - MARGIN, y + 1]],
      });
    }
  }

  // 2. 水系：河流横穿，但每条纵向道路都架桥，不然街道会被切断成孤岛
  let coastSide: Side | null = null;
  if (spec.water === 'river') {
    const riverY = horizontalY + mainW + 6 + rng.int(0, 4);
    if (riverY + 3 < H - MARGIN) {
      grid.fill(MARGIN, riverY, W - MARGIN * 2, 3, 'water');
      for (const [bandStart, bandEnd] of vBands) {
        grid.fill(bandStart, riverY, bandEnd - bandStart, 3, 'road');
      }
      hBands.push([riverY, riverY + 3]);
      // 水面按桥切成若干段登记：整条河当成一块水，导航会把桥也一起封掉
      for (const [x0, x1] of gapsBetween([...vBands].map(([a, b]) => [a, b] as [number, number]), MARGIN, W - MARGIN, 1)) {
        lots.push({ id: `water-river-${x0}`, kind: 'water', rect: { x: x0, y: riverY, w: x1 - x0, h: 3 } });
      }
    }
  } else if (spec.water === 'pond') {
    const r = 4;
    const px = rng.chance(0.5) ? MARGIN + r + 2 : W - MARGIN - r - 2;
    const py = horizontalY + mainW + 8;
    for (let y = py - r; y <= py + r; y += 1) {
      for (let x = px - r; x <= px + r; x += 1) {
        if ((x - px) ** 2 + (y - py) ** 2 <= r * r && grid.get(x, y) === 'empty') grid.set(x, y, 'water');
      }
    }
    lots.push({ id: 'water-pond', kind: 'water', rect: { x: px - r, y: py - r, w: r * 2 + 1, h: r * 2 + 1 } });
  } else if (spec.water === 'coast') {
    // 海沿着一条边铺开，岸线逐格起伏。水面会盖掉伸进海里的路——那一段就是码头。
    const coast = planCoast(rng, { width: W, height: H });
    for (const rect of paintCoast(grid, coast)) {
      lots.push({ id: `water-sea-${lots.length}`, kind: 'water', rect });
    }
    coastSide = coast.side;
  }

  // 3. 交叉口广场：贴着十字路口，四面街区都会向它开正门
  const plazaSize = 7;
  const plazaX = verticalX + mainW;
  const plazaY = horizontalY - plazaSize - 1;
  if (plazaY > MARGIN && plazaX + plazaSize < W - MARGIN) {
    grid.fill(plazaX, plazaY, plazaSize, plazaSize, 'plaza');
    lots.push({ id: 'plaza-center', kind: 'plaza', rect: { x: plazaX, y: plazaY, w: plazaSize, h: plazaSize } });
  }

  // 3.5 高程：崖线必须在切地块之前定下来，否则房子会盖在崖上。
  //     崖上的路口（坡道）由路网决定——路已经画好了，这里只判定哪些格子是坡。
  const cliffPlan = paintElevation(grid, spec.elevation, spec.seed);

  // 3.6 锚点先算出来：城墙要绕开出生点与出口，否则第一步就站在墙里
  const spawnAt: [number, number] = [verticalX + Math.floor(mainW / 2), H - MARGIN - 1];
  const exitAt: [number, number] = [W - MARGIN - 1, horizontalY + Math.floor(mainW / 2)];

  // 4. 街区 = 路网带之间的空隙，BSP 再切成地块。
  //    有城墙时城区往内缩一圈：墙外留出田野与牧场，墙才不像"画在地图边上的框"。
  //    路仍然通到地图边缘——穿过墙的那一段就是城外大路，墙在那里开门。
  const belt = spec.walls.enabled ? 9 : 0;
  const gapX = gapsBetween(vBands, MARGIN + belt, W - MARGIN - belt);
  const gapY = gapsBetween(hBands, MARGIN + belt, H - MARGIN - belt);
  const rawLots: Rect[] = [];
  for (const [x0, x1] of gapX) {
    for (const [y0, y1] of gapY) {
      splitLots({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, rng, rawLots);
    }
  }

  // 5. 摆放：贴街连排（街墙）优先，其次院落，最后才是独立落地
  const byId = new Map(kit.prefabs.map((prefab) => [prefab.id, prefab]));
  const queue: Prefab[] = [];
  for (const requiredId of spec.required) {
    const prefab = byId.get(requiredId);
    if (prefab) queue.push(prefab);
  }
  const fillers = kit.prefabs.filter((prefab) => !spec.required.includes(prefab.id));
  const houses = fillers.filter((prefab) => prefab.role === 'house');
  const rowPool = houses.length > 0 ? houses : fillers;

  const takeQueued = (predicate: (prefab: Prefab) => boolean = () => true): Prefab | null => {
    const index = queue.findIndex(predicate);
    return index < 0 ? null : queue.splice(index, 1)[0];
  };

  let buildingIndex = 0;
  /** 院落/后院：留给树与杂物，避免整块地全被建筑占满 */
  const yards: Rect[] = [];

  /** 落一栋建筑：校验空位 → 填格 → 记录 → 从正门挖巷道到路。 */
  const commit = (
    prefab: Prefab,
    rect: Rect,
    facing: number,
    typology: Building['typology'],
    floors: number,
  ): boolean => {
    if (!rectFree(grid, rect)) return false;
    // 正门那一格必须能站人。台阶地形里房子常紧贴崖壁，门开在崖上就走不出去了——
    // 先试同一面，再试对门与两侧，都不行就放弃这栋（宁可不放，也不放一栋没有门的房子）
    const facingOrder = [facing, (facing + 2) % 4, (facing + 1) % 4, (facing + 3) % 4];
    let side = facing;
    let entrance: [number, number] = entranceFor(rect, facing);
    for (const candidate of facingOrder) {
      const spot = entranceFor(rect, candidate);
      if (grid.walkable(spot[0], spot[1])) {
        side = candidate;
        entrance = spot;
        break;
      }
    }
    if (!grid.walkable(entrance[0], entrance[1])) return false;
    grid.fill(rect.x, rect.y, rect.w, rect.h, 'building');
    buildings.push({
      id: `building-${buildingIndex}`,
      prefab: prefab.id,
      role: prefab.role,
      rect,
      facing: side,
      entrance,
      color: prefab.color,
      roof: prefab.roof,
      floors,
      typology,
      elevation: elevationLevel(rect, spec.elevation, spec.bounds),
    });
    const alley = carveAlley(grid, entrance, side);
    if (alley) roads.push({ id: `alley-${buildingIndex}`, kind: 'alley', width: 1, points: alley });
    buildingIndex += 1;
    return true;
  };

  /**
   * 沿一条线一栋接一栋，共用山墙（不留缝），同排进深统一——这是"街墙"。
   * anchor=front 贴临街面，anchor=back 贴地块后墙（后巷那一排）。
   */
  const placeRow = (
    frame: FrontFrame,
    options: { anchor: 'front' | 'back'; depthCap: number; first: Prefab | null; floorsMax: number },
  ): { count: number; depth: number } => {
    let along = frame.start;
    let placed = 0;
    let locked = options.first;
    let rowDepth = 0;
    const limit = frame.start + frame.length;
    const place = options.anchor === 'front' ? frame.rect : frame.back;

    while (along < limit - 4 && placed < 6) {
      const remaining = limit - along;
      const candidate = locked ?? weightedPick(rowPool.length > 0 ? rowPool : kit.prefabs, rng);
      const maxW = Math.min(candidate.footprint.maxWidth, remaining);
      const minW = Math.min(candidate.footprint.minWidth, maxW);
      const maxD = Math.min(candidate.footprint.maxHeight, options.depthCap);
      const minD = Math.min(candidate.footprint.minHeight, maxD);
      if (maxW < minW || maxD < minD || maxW < 4 || maxD < 4) break;

      const depth = placed === 0 ? rng.int(minD, maxD) : Math.max(minD, Math.min(maxD, rowDepth));
      // 收尾那一栋把剩余宽度吃掉：街墙要连续，不能每块地尾巴都空一截；
      // 否则两栋之间留 2–3 格缝，一排就变成"断开的独栋"
      const width = remaining <= maxW
        ? remaining
        : rng.int(minW, Math.max(minW, Math.min(maxW, remaining - minW)));
      const rect = place(along, width, depth);
      if (!rectFree(grid, rect)) break;
      if (!commit(candidate, rect, frame.side, 'street-wall', rng.int(1, options.floorsMax))) break;
      along += width;
      placed += 1;
      rowDepth = depth;
      locked = null;
    }
    return { count: placed, depth: rowDepth };
  };

  /**
   * 后排：沿一条后巷再排一排。巷子会向两侧延伸到相邻地块，直到接上路或被挡住——
   * 只在自己那一格里画 2 格宽的短巷，看起来像贴了块灰砖，也不像街。
   */
  const placeBackRow = (frame: FrontFrame, usedDepth: number): number => {
    const lane = 2;
    const backDepth = frame.depth - usedDepth - lane;
    if (backDepth < 5) return 0;

    const horizontal = frame.side === 0 || frame.side === 2;
    const laneRect = frame.band(usedDepth, lane, frame.start - SETBACK, frame.length + SETBACK * 2);

    const stateAt = (pos: number): 'free' | 'road' | 'blocked' => {
      let road = false;
      for (let i = 0; i < lane; i += 1) {
        const cell = horizontal ? grid.get(pos, laneRect.y + i) : grid.get(laneRect.x + i, pos);
        if (cell === 'road' || cell === 'plaza') road = true;
        else if (cell !== 'empty' && cell !== 'green') return 'blocked';
      }
      return road ? 'road' : 'free';
    };

    let lo = horizontal ? laneRect.x : laneRect.y;
    let hi = horizontal ? laneRect.x + laneRect.w : laneRect.y + laneRect.h;
    const limitHi = horizontal ? W - MARGIN : H - MARGIN;

    for (let pos = lo - 1; pos >= MARGIN; pos -= 1) {
      const state = stateAt(pos);
      if (state === 'blocked') break;
      lo = pos;
      if (state === 'road') break;
    }
    for (let pos = hi; pos < limitHi; pos += 1) {
      const state = stateAt(pos);
      if (state === 'blocked') break;
      hi = pos + 1;
      if (state === 'road') break;
    }

    if (horizontal) grid.fill(lo, laneRect.y, hi - lo, lane, 'road');
    else grid.fill(laneRect.x, lo, lane, hi - lo, 'road');

    const mid = horizontal
      ? Math.round(laneRect.y + (lane - 1) / 2)
      : Math.round(laneRect.x + (lane - 1) / 2);
    roads.push({
      id: `lane-${buildingIndex}`,
      kind: 'alley',
      width: lane,
      points: horizontal ? [[lo, mid], [hi, mid]] : [[mid, lo], [mid, hi]],
    });

    return placeRow(frame, { anchor: 'back', depthCap: backDepth, first: null, floorsMax: 2 }).count;
  };

  /** 院落：临街主屋 + 侧巷 + 院子 + 后排小屋。侧巷保证后排的门走得出去。 */
  const placeCourtyard = (frame: FrontFrame): boolean => {
    if (frame.length < 9 || frame.depth < 8) return false;
    const passage = 2;
    const mainSpan = frame.length - passage - 1;
    if (mainSpan < 5) return false;

    const fromQueue = takeQueued();
    const mainPrefab = fromQueue ?? weightedPick(rowPool.length > 0 ? rowPool : kit.prefabs, rng);
    // 从需求队列里取出来的预置建筑，放不下要还回去——否则"必有酒馆"会被
    // 一次失败的院落尝试悄悄吃掉，最后 gates 报 missing-required，而队列里已经没有它了
    const giveBack = (): boolean => {
      if (fromQueue) queue.unshift(fromQueue);
      return false;
    };
    const mainW = Math.min(mainPrefab.footprint.maxWidth, mainSpan);
    // 先留出 4 格后院，主屋因此比连排房浅一档
    const mainD = Math.min(mainPrefab.footprint.maxHeight, frame.depth - 3);
    if (mainW < mainPrefab.footprint.minWidth || mainD < mainPrefab.footprint.minHeight) return giveBack();

    const mainRect = frame.rect(frame.start, mainW, mainD);
    if (!rectFree(grid, mainRect)) return giveBack();
    if (!commit(mainPrefab, mainRect, frame.side, 'courtyard', rng.int(1, 2))) return giveBack();

    // 后排小屋：贴后墙，门朝院子，与主屋错开留出一条侧巷
    const backPool = houses.length > 0 ? houses : rowPool;
    const backPrefab = weightedPick(backPool.length > 0 ? backPool : kit.prefabs, rng);
    const backW = Math.min(backPrefab.footprint.maxWidth, mainW);
    const backD = Math.min(backPrefab.footprint.maxHeight, frame.depth - mainD - 2);
    if (backD >= backPrefab.footprint.minHeight && backW >= backPrefab.footprint.minWidth) {
      const backRect = frame.back(frame.start, backW, backD);
      if (rectFree(grid, backRect)) commit(backPrefab, backRect, frame.side, 'courtyard', 1);
    }

    // 院子本身：主屋背后那一整条
    yards.push(frame.back(frame.start, mainW, frame.depth - mainD));
    return true;
  };

  /** 广场正面：把市政/地标放在正对广场的位置，形成围合。 */
  const placePlazaFront = (frame: FrontFrame): boolean => {
    const prefab = takeQueued((item) => item.mainRoad)
      ?? takeQueued((item) => item.role === 'civic' || item.role === 'landmark')
      ?? takeQueued();
    if (!prefab) return false;

    const span = Math.min(prefab.footprint.maxWidth, frame.length - 1);
    const depth = Math.min(prefab.footprint.maxHeight, frame.depth - 1);
    if (span < prefab.footprint.minWidth || depth < prefab.footprint.minHeight) {
      queue.unshift(prefab);
      return false;
    }
    const centred = frame.start + Math.floor((frame.length - span) / 2);
    for (const delta of [0, -1, 1, -2, 2, -3, 3]) {
      const along = centred + delta;
      if (along < frame.start || along + span > frame.start + frame.length) continue;
      const rect = frame.rect(along, span, depth);
      if (!rectFree(grid, rect)) continue;
      return commit(prefab, rect, frame.side, 'street-wall', rng.int(2, 3));
    }
    queue.unshift(prefab);
    return false;
  };

  /** 独立落地：地块不临街时退而求其次，用巷道接路。 */
  const placeStandalone = (rect: Rect, prefab: Prefab | null): boolean => {
    const candidate = prefab ?? weightedPick(fillers.length > 0 ? fillers : kit.prefabs, rng);
    const maxW = Math.min(candidate.footprint.maxWidth, rect.w - 2);
    const maxH = Math.min(candidate.footprint.maxHeight, rect.h - 2);
    const minW = Math.min(candidate.footprint.minWidth, maxW);
    const minH = Math.min(candidate.footprint.minHeight, maxH);
    if (maxW < minW || maxH < minH || maxW < 4 || maxH < 4) return false;

    const buildingRect = pickBuildingRect(rect, rng.int(minW, maxW), rng.int(minH, maxH), rng, grid);
    if (!buildingRect) return false;
    return commit(candidate, buildingRect, facingRoad(buildingRect, grid), 'standalone', rng.int(1, 3));
  };

  const plazaRect = lots.find((lot) => lot.kind === 'plaza')?.rect;

  interface LotPlan {
    rect: Rect;
    front: FrontFrame | null;
    plazaFront: boolean;
    nearPlaza: boolean;
    distance: number;
  }

  const plans: LotPlan[] = [];
  for (const original of rawLots) {
    const clipped = plazaRect ? clipAroundPlaza(original, plazaRect) : original;
    if (!clipped || lotHitsWater(grid, clipped) || !lotFree(grid, clipped)) continue;
    const frontage = lotFrontage(clipped, grid);
    plans.push({
      rect: clipped,
      front: frontage ? frontFrame(clipped, frontage) : null,
      plazaFront: frontage?.plaza ?? false,
      nearPlaza: plazaRect ? rectDistance(clipped, plazaRect) <= 6 : false,
      distance: roadDistance(clipped, grid),
    });
  }

  // 广场正面 → 必需要素 → 临街 → 其余按离路远近
  plans.sort((a, b) => {
    const rank = (plan: LotPlan) => (plan.plazaFront ? 0 : plan.nearPlaza ? 1 : plan.front ? 2 : 3);
    return rank(a) - rank(b) || a.distance - b.distance;
  });

  for (const plan of plans) {
    let placed = false;
    const firstBuilding = buildings.length;

    if (plan.plazaFront && plan.front) {
      placed = placePlazaFront(plan.front);
    }
    // 广场周围再补一栋市政/地标，围合才有"广场"的样子
    if (!placed && plan.nearPlaza && plan.front && queue.some((item) => item.mainRoad)) {
      placed = placePlazaFront(plan.front);
    }
    if (!placed && plan.front && queue.length > 0) {
      const prefab = takeQueued();
      if (prefab) {
        const row = placeRow(plan.front, {
          anchor: 'front',
          depthCap: Math.max(4, plan.front.depth - 2),
          first: prefab,
          floorsMax: 2,
        });
        if (row.count === 0) queue.unshift(prefab);
        if (row.count > 0) placeBackRow(plan.front, row.depth);
        placed = row.count > 0;
      }
    }
    if (!placed && plan.front && plan.front.depth >= 8 && rng.chance(0.5)) {
      placed = placeCourtyard(plan.front);
    }
    if (!placed && plan.front) {
      const row = placeRow(plan.front, {
        anchor: 'front',
        depthCap: Math.max(4, plan.front.depth - 2),
        first: null,
        floorsMax: 2,
      });
      if (row.count > 0) placeBackRow(plan.front, row.depth);
      placed = row.count > 0;
    }
    if (!placed && plan.distance <= 8) {
      placed = placeStandalone(plan.rect, queue.length > 0 ? queue[0] : null);
      if (placed && queue.length > 0) queue.shift();
    }

    if (!placed) {
      lots.push({ id: `lot-${buildingIndex}-green`, kind: 'green', rect: plan.rect });
      paintGreen(grid, plan.rect);
      continue;
    }

    lots.push({ id: `lot-${buildingIndex}`, kind: 'buildable', rect: plan.rect });

    // 剩余空地逐块登记成绿地：渲染只认 lots，不认栅格，
    // 不登记的话建筑背后会是光秃秃的地面色
    let rest: Rect[] = [plan.rect];
    for (const building of buildings.slice(firstBuilding)) {
      rest = rest.flatMap((piece) => subtractRect(piece, building.rect));
    }
    // 只在建筑背后留一块草坪（后院/果园）；整块地全铺绿会像公园，
    // 其余保持地面色（土院），这样"院子"和"草地"才有区别
    rest.sort((a, b) => b.w * b.h - a.w * a.h);
    const garden = rest.find((piece) => piece.w * piece.h >= 48);
    if (garden) {
      lots.push({ id: `lot-${buildingIndex}-garden`, kind: 'green', rect: garden });
      paintGreen(grid, garden);
    }
  }

  // 必需要素没找到位置：最后兜底塞进任意还能建的地块，宁可挤也不能缺
  for (const prefab of [...queue]) {
    if (placeStandalone(
      {
        x: MARGIN + belt,
        y: MARGIN + belt,
        w: verticalX - MARGIN - belt - BLOCK_GAP,
        h: horizontalY - MARGIN - belt - BLOCK_GAP,
      },
      prefab,
    )) {
      const index = queue.indexOf(prefab);
      if (index >= 0) queue.splice(index, 1);
    }
  }

  // 5.5 城墙：建成区外圈一圈墙，路穿过的地方成为城门。
  //     顺序很重要——必须等房子都落定，墙才知道该围多大。
  const wallPlan = planWalls(grid, buildings, spec, [spawnAt, exitAt]);
  const walls: WallSegment[] = wallPlan.walls;
  const gates: Gate[] = wallPlan.gates;

  // 6. 装饰：沿主干道布灯，广场放水井，绿地种树，水边放码头
  let propIndex = 0;
  /** 一格只放一个道具：叠在一起的话引擎里只会画出一个，预览也会糊成一团 */
  const occupied = new Set<string>();
  const addProp = (type: SceneProp['type'], x: number, y: number) => {
    if (!grid.inside(x, y) || grid.get(x, y) === 'building' || grid.get(x, y) === 'water') return;
    const key = `${x},${y}`;
    if (occupied.has(key)) return;
    occupied.add(key);
    props.push({ id: `prop-${propIndex}`, type, at: [x, y] });
    propIndex += 1;
  };

  const spacing = Math.max(4, Math.round(9 - spec.decor * 5));
  for (let y = MARGIN + 2; y < H - MARGIN; y += spacing) {
    addProp('lamp', verticalX - 1, y);
    addProp('lamp', verticalX + mainW, y);
  }
  for (let x = MARGIN + 2; x < W - MARGIN; x += spacing) {
    addProp('lamp', x, horizontalY - 1);
    addProp('lamp', x, horizontalY + mainW);
  }
  for (const lot of lots) {
    if (lot.kind !== 'green') continue;
    const area = lot.rect.w * lot.rect.h;
    if (area < 30) continue; // 窄条空地不放树，否则会挤在巷道口
    const trees = Math.max(1, Math.round((area * spec.decor) / 55));
    for (let i = 0; i < trees; i += 1) {
      addProp('tree', rng.int(lot.rect.x, lot.rect.x + lot.rect.w - 1), rng.int(lot.rect.y, lot.rect.y + lot.rect.h - 1));
    }
  }
  // 院落：一棵树 + 箱子，让院子看起来是有人在用的
  for (const yard of yards) {
    addProp('tree', rng.int(yard.x, yard.x + yard.w - 1), rng.int(yard.y, yard.y + yard.h - 1));
    addProp('crate', rng.int(yard.x, yard.x + yard.w - 1), rng.int(yard.y, yard.y + yard.h - 1));
    if (rng.chance(spec.decor)) {
      addProp('flower', rng.int(yard.x, yard.x + yard.w - 1), rng.int(yard.y, yard.y + yard.h - 1));
    }
  }
  // 墙外的田野：有城墙才有"城外"。不种树的话，墙外那圈就是大片纯色地面，
  // 一眼看去像地图没画完
  if (walls.length > 0) {
    const wx0 = Math.min(...walls.map((wall) => wall.rect.x));
    const wy0 = Math.min(...walls.map((wall) => wall.rect.y));
    const wx1 = Math.max(...walls.map((wall) => wall.rect.x + wall.rect.w));
    const wy1 = Math.max(...walls.map((wall) => wall.rect.y + wall.rect.h));
    const groves = Math.round(60 + 80 * spec.decor);
    for (let i = 0; i < groves; i += 1) {
      const x = rng.int(MARGIN, W - MARGIN - 1);
      const y = rng.int(MARGIN, H - MARGIN - 1);
      if (x >= wx0 && x < wx1 && y >= wy0 && y < wy1) continue;
      addProp('tree', x, y);
    }
  }

  const plaza = lots.find((lot) => lot.kind === 'plaza');
  if (plaza) {
    addProp('well', plaza.rect.x + Math.floor(plaza.rect.w / 2), plaza.rect.y + Math.floor(plaza.rect.h / 2));
    for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]] as const) {
      addProp('flower', plaza.rect.x + Math.floor(plaza.rect.w / 2) + dx, plaza.rect.y + Math.floor(plaza.rect.h / 2) + dy);
    }
  }
  const dockKit = kit.prefabs.some((prefab) => prefab.role === 'dock');
  if (dockKit) {
    if (coastSide !== null) {
      // 海岸：水面是沿岸线合并出来的窄长条，第一块多半贴着地图边，
      // 照老逻辑取"水面上一格"会落到图外。改成取面积最大的一段，贴它的陆地一侧，
      // 也就是码头的栈桥从岸上伸到海里。
      const biggest = lots
        .filter((lot) => lot.kind === 'water')
        .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
      if (biggest) {
        const { x, y, w, h } = biggest.rect;
        const at: [number, number] = coastSide === 1
          ? [x - 1, y + Math.floor(h / 2)]
          : coastSide === 3
            ? [x + w, y + Math.floor(h / 2)]
            : coastSide === 0
              ? [x + Math.floor(w / 2), y + h]
              : [x + Math.floor(w / 2), y - 1];
        addProp('dock', at[0], at[1]);
      }
    } else {
      const waterLot = lots.find((lot) => lot.kind === 'water');
      if (waterLot) addProp('dock', waterLot.rect.x + Math.floor(waterLot.rect.w / 2), waterLot.rect.y - 1);
    }
  }

  // 7. 锚点：出生点在南端主干道，出口在东端。
  //    城墙/海岸可能压在默认位置上，所以往外挪到最近的可走格——自检脚本第一帧就要用到。
  const spawn = snapToWalkable(grid, spawnAt, [0, -1]);
  const exit = snapToWalkable(grid, exitAt, [-1, 0]);
  anchors.push({ id: 'anchor-spawn', kind: 'spawn', at: spawn, label: 'player spawn' });
  anchors.push({ id: 'anchor-exit', kind: 'exit', at: exit, label: 'world exit' });
  if (plaza) {
    anchors.push({
      id: 'anchor-plaza',
      kind: 'poi',
      at: [plaza.rect.x + Math.floor(plaza.rect.w / 2), plaza.rect.y + Math.floor(plaza.rect.h / 2)],
      label: 'town square',
    });
  }

  const layout: SceneLayout = {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    kitId: kit.id,
    style: kit.style,
    seed: spec.seed,
    tileSize: spec.tileSize,
    bounds: { width: W, height: H },
    palette: kit.palette,
    roads,
    lots,
    buildings,
    props,
    anchors,
    walls,
    gates,
    cliffs: cliffPlan.cliffs,
    ramps: cliffPlan.ramps,
    terraces: cliffPlan.terraces,
    coastSide,
  };

  return { layout, grid };
}
