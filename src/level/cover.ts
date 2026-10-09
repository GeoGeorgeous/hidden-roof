import type * as THREE from 'three';
import { PAINT } from '../config';
import type { BoxFace } from '../surfaces';

// Faces pressed against something solid: a paintable box face whose every
// point a little in front of it (PAINT.coverGap) lies inside an opaque box of
// a prop is covered. Nobody can see or reach it, so it isn't paintable: it's
// drawn as decor, with no paint or light texture and no draw call of its own
// (build-prop.ts). Only the level's props cover (not joints, not stepladders
// players placed), the same on every client and on the server.

/** Cells of the index (m): a box is listed in every cell it reaches. */
const CELL = 4;
/** Samples start this far in from a face's edges (m), so an edge strip left showing keeps the face paintable. */
const INSET = 0.01;
const AXIS: Record<BoxFace, [number, 1 | -1]> = { '+x': [0, 1], '-x': [0, -1], '+y': [1, 1], '-y': [1, -1], '+z': [2, 1], '-z': [2, -1] };
const q = [0, 0, 0];

/** The level's solid boxes by owner (a prop id), in a grid for point tests. */
export class CoverIndex {
  private owners = new Map<number, THREE.Box3[]>();
  private cells = new Map<string, THREE.Box3[]>();

  /** Replace an owner's boxes. Returns false when they are the same as before. */
  set(owner: number, boxes: THREE.Box3[]) {
    const old = this.owners.get(owner);
    if (old && old.length === boxes.length && old.every((b, i) => b.equals(boxes[i]))) return false;
    this.delete(owner);
    this.owners.set(owner, boxes);
    for (const b of boxes) this.eachCell(b, (k) => (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(b));
    return true;
  }

  delete(owner: number) {
    const old = this.owners.get(owner);
    if (!old) return;
    this.owners.delete(owner);
    for (const b of old)
      this.eachCell(b, (k) => {
        const list = this.cells.get(k)!;
        list.splice(list.indexOf(b), 1);
        if (!list.length) this.cells.delete(k);
      });
  }

  boxesOf(owner: number): readonly THREE.Box3[] {
    return this.owners.get(owner) ?? [];
  }

  /** Is face `f` of `box` covered: every sample point, PAINT.coverGap in front of it, inside a solid box? */
  covered(box: THREE.Box3, f: BoxFace) {
    const [a, sign] = AXIS[f];
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    const at = sign > 0 ? box.max.getComponent(a) + PAINT.coverGap : box.min.getComponent(a) - PAINT.coverGap;
    const us = samples(box.min.getComponent(b), box.max.getComponent(b));
    const vs = samples(box.min.getComponent(c), box.max.getComponent(c));
    q[a] = at;
    for (const u of us) {
      q[b] = u;
      for (const v of vs) {
        q[c] = v;
        if (!this.inside(q[0], q[1], q[2])) return false;
      }
    }
    return true;
  }

  private inside(x: number, y: number, z: number) {
    const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL)));
    return !!list?.some((b) => x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
  }

  private eachCell(b: THREE.Box3, fn: (key: string) => void) {
    for (let x = Math.floor(b.min.x / CELL); x <= Math.floor(b.max.x / CELL); x++)
      for (let y = Math.floor(b.min.y / CELL); y <= Math.floor(b.max.y / CELL); y++)
        for (let z = Math.floor(b.min.z / CELL); z <= Math.floor(b.max.z / CELL); z++) fn(cellKey(x, y, z));
  }
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Points across lo..hi: INSET in from both ends, at most PAINT.coverStep apart. */
function samples(lo: number, hi: number) {
  const a = lo + Math.min(INSET, (hi - lo) / 2);
  const b = hi - Math.min(INSET, (hi - lo) / 2);
  const n = Math.max(1, Math.ceil((b - a) / PAINT.coverStep));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
