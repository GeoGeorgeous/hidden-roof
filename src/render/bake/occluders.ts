import type * as THREE from 'three';

// What blocks baked lamp light: the level's colliders (see-through pieces
// excluded, see BuiltProp.occluders), filed in a uniform grid so a shadow ray
// only tests the boxes in the cells it crosses (3D DDA).

const CELL = 2;

export class Occluders {
  private boxes = new Float32Array(0);
  private owners = new Int32Array(0);
  private cells: (number[] | undefined)[] = [];
  private lo = [0, 0, 0];
  private dims = [1, 1, 1];
  /** Per box: id of the last ray that tested it, so a box spanning cells is tested once. */
  private stamp = new Int32Array(0);
  private ray = 0;

  /** Every occluder box, tagged with the id of the prop it belongs to. */
  build(list: { owner: number; boxes: THREE.Box3[] }[]) {
    const n = list.reduce((s, e) => s + e.boxes.length, 0);
    this.boxes = new Float32Array(n * 6);
    this.owners = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.ray = 0;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    let i = 0;
    for (const { owner, boxes } of list) {
      for (const b of boxes) {
        this.boxes.set([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], i * 6);
        this.owners[i++] = owner;
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], b.min.getComponent(k));
          hi[k] = Math.max(hi[k], b.max.getComponent(k));
        }
      }
    }
    if (!n) {
      lo.fill(0);
      hi.fill(0);
    }
    this.lo = lo;
    this.dims = lo.map((l, k) => Math.max(1, Math.ceil((hi[k] - l) / CELL)));
    const [dx, dy, dz] = this.dims;
    this.cells = new Array(dx * dy * dz);
    const cell = (k: number, v: number) => Math.min(this.dims[k] - 1, Math.max(0, Math.floor((v - lo[k]) / CELL)));
    const B = this.boxes;
    for (let b = 0; b < n; b++) {
      const o = b * 6;
      for (let x = cell(0, B[o]); x <= cell(0, B[o + 3]); x++) {
        for (let y = cell(1, B[o + 1]); y <= cell(1, B[o + 4]); y++) {
          for (let z = cell(2, B[o + 2]); z <= cell(2, B[o + 5]); z++) (this.cells[(x * dy + y) * dz + z] ??= []).push(b);
        }
      }
    }
  }

  /**
   * Does a box block the segment from o to t? Boxes of `lamp` (the lamp's own
   * prop) never do, and boxes of `self` (the lit surface's prop) don't when
   * they contain o: decor sits partly inside its own prop's colliders.
   */
  blocked(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, lamp: number, self: number) {
    const ray = ++this.ray;
    let dx = tx - ox;
    let dy = ty - oy;
    let dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    dx = dx / len || 1e-9;
    dy = dy / len || 1e-9;
    dz = dz / len || 1e-9;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    const [lx, ly, lz] = this.lo;
    const [nx, ny, nz] = this.dims;
    let cx = Math.floor((ox - lx) / CELL);
    let cy = Math.floor((oy - ly) / CELL);
    let cz = Math.floor((oz - lz) / CELL);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    // Ray distance to the next cell border on each axis, and between borders.
    let nextX = (lx + (cx + (dx > 0 ? 1 : 0)) * CELL - ox) * ix;
    let nextY = (ly + (cy + (dy > 0 ? 1 : 0)) * CELL - oy) * iy;
    let nextZ = (lz + (cz + (dz > 0 ? 1 : 0)) * CELL - oz) * iz;
    const stepX = Math.abs(CELL * ix);
    const stepY = Math.abs(CELL * iy);
    const stepZ = Math.abs(CELL * iz);
    const B = this.boxes;
    let t = 0;
    while (t <= len) {
      const list = cx >= 0 && cy >= 0 && cz >= 0 && cx < nx && cy < ny && cz < nz ? this.cells[(cx * ny + cy) * nz + cz] : undefined;
      if (list) {
        for (const b of list) {
          if (this.stamp[b] === ray) continue;
          this.stamp[b] = ray;
          const owner = this.owners[b];
          if (owner === lamp) continue;
          const o = b * 6;
          let a = (B[o] - ox) * ix;
          let c = (B[o + 3] - ox) * ix;
          let t0 = Math.min(a, c);
          let t1 = Math.max(a, c);
          a = (B[o + 1] - oy) * iy;
          c = (B[o + 4] - oy) * iy;
          t0 = Math.max(t0, Math.min(a, c));
          t1 = Math.min(t1, Math.max(a, c));
          a = (B[o + 2] - oz) * iz;
          c = (B[o + 5] - oz) * iz;
          t0 = Math.max(t0, Math.min(a, c));
          t1 = Math.min(t1, Math.max(a, c));
          if (t0 > t1 || t1 <= 0 || t0 >= len) continue;
          if (t0 < 0 && owner === self) continue;
          return true;
        }
      }
      if (nextX < nextY && nextX < nextZ) {
        t = nextX;
        nextX += stepX;
        cx += sx;
      } else if (nextY < nextZ) {
        t = nextY;
        nextY += stepY;
        cy += sy;
      } else {
        t = nextZ;
        nextZ += stepZ;
        cz += sz;
      }
    }
    return false;
  }
}
