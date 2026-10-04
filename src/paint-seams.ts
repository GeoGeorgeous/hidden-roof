import * as THREE from 'three';
import type { Rect } from './surfaces';

// Paint across seams. A dot is clipped to the face it hit, so where two faces
// meet in one plane (wall pieces side by side, a block on a block, the
// pieces of a door frame) the part of a dot past the edge would be lost and
// the seam would show as a thin unpainted line. The index finds the faces
// that share a plane near a point, so the rest of the dot goes onto them.
// Faces are bucketed per plane in 2 m cells; only dots that cross an edge
// look anything up.

const CELL = 2;
/** Planes closer than this are the same plane (meters). */
const EPS = 0.002;

export interface SeamFace<S> {
  surface: S;
  rect: Rect;
  /** Bounds in the plane's two in-plane world axes. */
  min: [number, number];
  max: [number, number];
}

/** Normal axis (0 x, 1 y, 2 z), its sign, and the two in-plane axes. */
function planeOf(n: THREE.Vector3) {
  const a = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
  return { a, sign: n.getComponent(a) > 0 ? 1 : -1, b: a === 0 ? 1 : 0, c: a === 2 ? 1 : 2 };
}

const planeKey = (a: number, sign: number, offset: number) => `${a}${sign}|${Math.round(offset / EPS)}`;

export class SeamIndex<S> {
  private cells = new Map<string, SeamFace<S>[]>();
  private keys = new Map<S, string[]>();
  private found = new Set<SeamFace<S>>();
  private corner = new THREE.Vector3();

  add(surface: S, rects: Rect[]) {
    const keys: string[] = [];
    for (const rect of rects) {
      const f = rect.face;
      if (!f) continue;
      const { a, sign, b, c } = planeOf(f.normal);
      const lo: [number, number] = [Infinity, Infinity];
      const hi: [number, number] = [-Infinity, -Infinity];
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const p = this.corner.copy(f.origin).addScaledVector(f.uAxis, u).addScaledVector(f.vAxis, v);
        lo[0] = Math.min(lo[0], p.getComponent(b));
        lo[1] = Math.min(lo[1], p.getComponent(c));
        hi[0] = Math.max(hi[0], p.getComponent(b));
        hi[1] = Math.max(hi[1], p.getComponent(c));
      }
      const entry: SeamFace<S> = { surface, rect, min: lo, max: hi };
      const plane = planeKey(a, sign, f.origin.getComponent(a));
      for (let i = Math.floor(lo[0] / CELL); i <= Math.floor(hi[0] / CELL); i++) {
        for (let j = Math.floor(lo[1] / CELL); j <= Math.floor(hi[1] / CELL); j++) {
          const k = `${plane}|${i}|${j}`;
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(entry);
          keys.push(k);
        }
      }
    }
    this.keys.set(surface, keys);
  }

  remove(surface: S) {
    for (const k of this.keys.get(surface) ?? []) {
      const list = this.cells.get(k);
      if (!list) continue;
      const kept = list.filter((e) => e.surface !== surface);
      if (kept.length) this.cells.set(k, kept);
      else this.cells.delete(k);
    }
    this.keys.delete(surface);
  }

  /**
   * Faces in the plane of `rect` (other than it) that a dot of radius `r`
   * meters at world point `p` reaches. The returned set is reused.
   */
  near(rect: Rect, p: THREE.Vector3, r: number) {
    this.found.clear();
    const f = rect.face;
    if (!f) return this.found;
    const { a, sign, b, c } = planeOf(f.normal);
    const plane = planeKey(a, sign, f.origin.getComponent(a));
    const pb = p.getComponent(b);
    const pc = p.getComponent(c);
    for (let i = Math.floor((pb - r) / CELL); i <= Math.floor((pb + r) / CELL); i++) {
      for (let j = Math.floor((pc - r) / CELL); j <= Math.floor((pc + r) / CELL); j++) {
        for (const e of this.cells.get(`${plane}|${i}|${j}`) ?? []) {
          if (e.rect === rect || pb + r < e.min[0] || pb - r > e.max[0] || pc + r < e.min[1] || pc - r > e.max[1]) continue;
          this.found.add(e);
        }
      }
    }
    return this.found;
  }
}

/** World point of atlas texel coords (cx, cy) on a flat face. */
export function texelToWorld(rect: Rect, cx: number, cy: number, out: THREE.Vector3) {
  const f = rect.face!;
  return out
    .copy(f.origin)
    .addScaledVector(f.uAxis, (cx - rect.x) / rect.w)
    .addScaledVector(f.vAxis, (cy - rect.y) / rect.h);
}

/** Atlas texel coords of a world point in a flat face's plane. */
export function worldToTexel(rect: Rect, p: THREE.Vector3, out: THREE.Vector2) {
  const f = rect.face!;
  const d = tmp.subVectors(p, f.origin);
  return out.set(rect.x + (d.dot(f.uAxis) / f.uAxis.lengthSq()) * rect.w, rect.y + (d.dot(f.vAxis) / f.vAxis.lengthSq()) * rect.h);
}
const tmp = new THREE.Vector3();
