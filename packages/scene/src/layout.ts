import type {
  Anchor,
  Building,
  Kit,
  Lot,
  Prefab,
  Rect,
  Road,
  SceneLayout,
  SceneProp,
  SceneSpec,
} from './schema.js';
import { Grid } from './grid.js';
import { createRng, weightedPick, type Rng } from './rng.js';

export interface SceneBuildResult {
  layout: SceneLayout;
  grid: Grid;
}

const MARGIN = 3;
const BLOCK_GAP = 3;
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
    let hitsWater = false;
    for (let y = candidate.y; y < candidate.y + bh && !hitsWater; y += 1) {
      for (let x = candidate.x; x < candidate.x + bw; x += 1) {
        if (grid.get(x, y) === 'water') {
          hitsWater = true;
          break;
        }
      }
    }
    if (!hitsWater) return candidate;
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
    if (grid.get(x, y) === 'building' || grid.get(x, y) === 'water') break;
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

export function buildScene(spec: SceneSpec, kit: Kit): SceneBuildResult {
  const rng = createRng(spec.seed);
  const { width: W, height: H } = spec.bounds;
  const grid = new Grid(W, H);
  const roads: Road[] = [];
  const lots: Lot[] = [];
  const buildings: Building[] = [];
  const props: SceneProp[] = [];
  const anchors: Anchor[] = [];

  // 1. 十字主干道：位置带随机偏移，保证不是机械居中
  const mainW = 4;
  const verticalX = Math.round(W * (0.34 + rng.next() * 0.12));
  const horizontalY = Math.round(H * (0.44 + rng.next() * 0.1));
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

  // 2. 水系：河流横穿但给主干道留桥
  if (spec.water === 'river') {
    const riverY = horizontalY + mainW + 6 + rng.int(0, 4);
    if (riverY + 3 < H - MARGIN) {
      grid.fill(MARGIN, riverY, W - MARGIN * 2, 3, 'water');
      grid.fill(verticalX, riverY, mainW, 3, 'road'); // 桥
      lots.push({ id: 'water-river', kind: 'water', rect: { x: MARGIN, y: riverY, w: W - MARGIN * 2, h: 3 } });
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
  }

  // 3. 交叉口广场
  const plazaSize = 7;
  const plazaX = verticalX + mainW;
  const plazaY = horizontalY - plazaSize - 1;
  if (plazaY > MARGIN && plazaX + plazaSize < W - MARGIN) {
    grid.fill(plazaX, plazaY, plazaSize, plazaSize, 'plaza');
    lots.push({ id: 'plaza-center', kind: 'plaza', rect: { x: plazaX, y: plazaY, w: plazaSize, h: plazaSize } });
  }

  // 4. 四个街区 → BSP 地块
  const blocks: Rect[] = [
    { x: MARGIN, y: MARGIN, w: verticalX - MARGIN - BLOCK_GAP, h: horizontalY - MARGIN - BLOCK_GAP },
    {
      x: verticalX + mainW + BLOCK_GAP,
      y: MARGIN,
      w: W - MARGIN - (verticalX + mainW + BLOCK_GAP),
      h: horizontalY - MARGIN - BLOCK_GAP,
    },
    {
      x: MARGIN,
      y: horizontalY + mainW + BLOCK_GAP,
      w: verticalX - MARGIN - BLOCK_GAP,
      h: H - MARGIN - (horizontalY + mainW + BLOCK_GAP),
    },
    {
      x: verticalX + mainW + BLOCK_GAP,
      y: horizontalY + mainW + BLOCK_GAP,
      w: W - MARGIN - (verticalX + mainW + BLOCK_GAP),
      h: H - MARGIN - (horizontalY + mainW + BLOCK_GAP),
    },
  ].filter((block) => block.w >= MIN_LOT && block.h >= MIN_LOT);

  const rawLots: Rect[] = [];
  for (const block of blocks) splitLots(block, rng, rawLots);

  // 5. 按需求挑建筑：先满足 required，再填剩余地块
  const byId = new Map(kit.prefabs.map((prefab) => [prefab.id, prefab]));
  const queue: Prefab[] = [];
  for (const requiredId of spec.required) {
    const prefab = byId.get(requiredId);
    if (prefab) queue.push(prefab);
  }

  let buildingIndex = 0;
  for (const rect of rawLots) {
    if (lotHitsWater(grid, rect)) continue; // 沿河地块留白，交给水面
    const distance = roadDistance(rect, grid);
    const needsMain = queue.length > 0 && queue[0].mainRoad;
    if (distance > 4 && !needsMain) {
      lots.push({ id: `lot-${buildingIndex}-green`, kind: 'green', rect });
      paintGreen(grid, rect);
      continue;
    }
    if (distance > 6) {
      lots.push({ id: `lot-${buildingIndex}-green`, kind: 'green', rect });
      paintGreen(grid, rect);
      continue;
    }

    const pool = queue.length > 0 ? queue : kit.prefabs.filter((prefab) => !spec.required.includes(prefab.id));
    const prefab = queue.length > 0 ? (queue.shift() as Prefab) : weightedPick(pool, rng);

    const maxW = Math.min(prefab.footprint.maxWidth, rect.w - 2);
    const maxH = Math.min(prefab.footprint.maxHeight, rect.h - 2);
    const minW = Math.min(prefab.footprint.minWidth, maxW);
    const minH = Math.min(prefab.footprint.minHeight, maxH);
    if (maxW < minW || maxH < minH || maxW < 4 || maxH < 4) {
      lots.push({ id: `lot-${buildingIndex}-green`, kind: 'green', rect });
      paintGreen(grid, rect);
      continue;
    }

    const bw = rng.int(minW, maxW);
    const bh = rng.int(minH, maxH);
    const buildingRect = pickBuildingRect(rect, bw, bh, rng, grid);
    if (!buildingRect) {
      lots.push({ id: `lot-${buildingIndex}-green`, kind: 'green', rect });
      paintGreen(grid, rect);
      continue;
    }

    const facing = facingRoad(buildingRect, grid);
    grid.fill(buildingRect.x, buildingRect.y, buildingRect.w, buildingRect.h, 'building');
    buildings.push({
      id: `building-${buildingIndex}`,
      prefab: prefab.id,
      role: prefab.role,
      rect: buildingRect,
      facing,
      entrance: entranceFor(buildingRect, facing),
      color: prefab.color,
      roof: prefab.roof,
      floors: rng.int(1, 3),
    });
    lots.push({ id: `lot-${buildingIndex}`, kind: 'buildable', rect });

    // 正门到道路之间挖一条巷道，避免"建筑浮在空地上"
    const entrance = buildings[buildings.length - 1].entrance;
    const alley = carveAlley(grid, entrance, facing);
    if (alley) {
      roads.push({ id: `alley-${buildingIndex}`, kind: 'alley', width: 1, points: alley });
    }
    buildingIndex += 1;
  }

  // 6. 装饰：沿主干道布灯，广场放水井，绿地种树，水边放码头
  let propIndex = 0;
  const addProp = (type: SceneProp['type'], x: number, y: number) => {
    if (!grid.inside(x, y) || grid.get(x, y) === 'building' || grid.get(x, y) === 'water') return;
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
    const trees = Math.max(1, Math.floor((lot.rect.w * lot.rect.h * spec.decor) / 22));
    for (let i = 0; i < trees; i += 1) {
      addProp('tree', rng.int(lot.rect.x, lot.rect.x + lot.rect.w - 1), rng.int(lot.rect.y, lot.rect.y + lot.rect.h - 1));
    }
  }
  const plaza = lots.find((lot) => lot.kind === 'plaza');
  if (plaza) {
    addProp('well', plaza.rect.x + Math.floor(plaza.rect.w / 2), plaza.rect.y + Math.floor(plaza.rect.h / 2));
    for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]] as const) {
      addProp('flower', plaza.rect.x + Math.floor(plaza.rect.w / 2) + dx, plaza.rect.y + Math.floor(plaza.rect.h / 2) + dy);
    }
  }
  const waterLot = lots.find((lot) => lot.kind === 'water');
  if (waterLot && kit.prefabs.some((prefab) => prefab.role === 'dock')) {
    addProp('dock', waterLot.rect.x + Math.floor(waterLot.rect.w / 2), waterLot.rect.y - 1);
  }

  // 7. 锚点：出生点在南端主干道，出口在东端
  const spawnX = verticalX + Math.floor(mainW / 2);
  const spawnY = H - MARGIN - 1;
  anchors.push({ id: 'anchor-spawn', kind: 'spawn', at: [spawnX, spawnY], label: 'player spawn' });
  anchors.push({
    id: 'anchor-exit',
    kind: 'exit',
    at: [W - MARGIN - 1, horizontalY + Math.floor(mainW / 2)],
    label: 'world exit',
  });
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
  };

  return { layout, grid };
}
