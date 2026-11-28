export type Cell = 'empty' | 'road' | 'plaza' | 'green' | 'water' | 'building' | 'wall' | 'cliff';

/** 场景栅格：既是求解时的工作区，也用于连通性校验。 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Array<Cell>(width * height).fill('empty');
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Cell {
    return this.inside(x, y) ? this.cells[y * this.width + x] : 'empty';
  }

  set(x: number, y: number, cell: Cell): void {
    if (this.inside(x, y)) this.cells[y * this.width + x] = cell;
  }

  fill(x: number, y: number, w: number, h: number, cell: Cell): void {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) this.set(col, row, cell);
    }
  }

  /**
   * 能否站立：道路、广场、绿地、空地可走；建筑、水、城墙、崖壁不可走。
   * 城墙留的门洞是 road，崖上的坡道也是 road —— 所以"能走"这件事只有栅格说了算。
   */
  walkable(x: number, y: number): boolean {
    const cell = this.get(x, y);
    return cell !== 'building' && cell !== 'water' && cell !== 'wall' && cell !== 'cliff';
  }

  count(cell: Cell): number {
    return this.cells.filter((value) => value === cell).length;
  }

  /** 四邻接 BFS，返回可达点集合。 */
  flood(startX: number, startY: number): Set<string> {
    const seen = new Set<string>();
    if (!this.walkable(startX, startY)) return seen;
    const queue: Array<[number, number]> = [[startX, startY]];
    seen.add(`${startX},${startY}`);
    while (queue.length > 0) {
      const [x, y] = queue.shift() as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key) || !this.inside(nx, ny) || !this.walkable(nx, ny)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    return seen;
  }
}
