/** A uniform grid for nearest-neighbour lookups on the ground plane. */
export class SpatialGrid<T> {
  private cells = new Map<string, Array<{ x: number; z: number; v: T }>>();

  constructor(private cell: number) {}

  private key(ix: number, iz: number): string {
    return `${ix},${iz}`;
  }

  insert(x: number, z: number, v: T): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push({ x, z, v });
  }

  /** Nearest value within `maxRange`, or null. */
  nearest(x: number, z: number, maxRange: number): T | null {
    const r = Math.ceil(maxRange / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best: T | null = null;
    let bestD = maxRange;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        for (const e of list) {
          const d = Math.hypot(e.x - x, e.z - z);
          if (d < bestD) {
            bestD = d;
            best = e.v;
          }
        }
      }
    }
    return best;
  }
}
