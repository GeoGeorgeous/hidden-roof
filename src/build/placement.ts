import * as THREE from 'three';
import { H_MODULE as H, V_MODULE as V, type PropDef } from '../kit/def';
import type { V3 } from '../kit/pieces';

// Where does a prop go, given the face under the crosshair? Minecraft-style:
// the ghost sits on the face you look at, snapped to the grid.

export type PlaceSpec = Pick<PropDef, 'place' | 'snap' | 'footprint' | 'anchorTop' | 'vSnap' | 'hang'>;

export interface Hit {
  point: THREE.Vector3;
  /** Axis-aligned face normal. */
  normal: THREE.Vector3;
  /** Hit the build plane (empty space at the working level), not a real face. */
  plane?: boolean;
}

/** Bounds of a prop around its origin, already rotated (see build/extent.ts). */
export interface Extent {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface Placement {
  pos: V3;
  rot: number;
  /** False when the prop can't go on this kind of face (e.g. a ladder on a floor). */
  ok: boolean;
}

/** Top surface height below a point, or null. */
export type FloorAt = (x: number, y: number, z: number) => number | null;

const snap = (v: number, s: number) => +(Math.round(v / s) * s).toFixed(3);

/** Cell origin so a footprint of `size` meters covers the cell containing v. */
function cellCenter(v: number, size: number) {
  const k = size / H;
  return Math.floor(v / H) * H - Math.floor((k - 1) / 2) * H + size / 2;
}

export function place(spec: PlaceSpec, hit: Hit, rot: number, floorAt: FloorAt, extent?: Extent): Placement {
  const p = hit.point;
  const n = hit.normal;
  const top = n.y > 0.5;
  const bottom = n.y < -0.5;
  const side = !top && !bottom;
  // Step slightly off the face so "the cell next to it" is well defined.
  const t = p.clone().addScaledVector(n, 0.05);
  // Module level for props standing on their base vs props whose origin is their top.
  // The build plane is the floor of the working level: props stand on it, slabs and blocks form it.
  let levelBase = top ? Math.round(p.y / V) * V : bottom ? Math.round(p.y / V) * V - V : Math.floor((p.y + 0.01) / V) * V;
  let levelTop = top ? Math.ceil((p.y + 0.01) / V) * V : bottom ? Math.floor((p.y - 0.01) / V) * V : Math.ceil((p.y - 0.01) / V) * V;
  if (hit.plane) levelBase = levelTop = Math.round(p.y / V) * V;

  switch (spec.place) {
    case 'cell': {
      const [fw, fd] = spec.footprint ?? [H, H];
      const [w, d] = rot % 2 ? [fd, fw] : [fw, fd];
      let y = spec.anchorTop ? levelTop : levelBase;
      // Short blocks stack by their own height (half block: 2 m).
      const vs = spec.vSnap;
      if (vs && !spec.anchorTop && !hit.plane) y = top ? Math.round(p.y / vs) * vs : bottom ? Math.round(p.y / vs) * vs - vs : Math.floor((p.y + 0.01) / vs) * vs;
      return { pos: [cellCenter(t.x, w), y, cellCenter(t.z, d)], rot, ok: true };
    }
    case 'edge': {
      const alongX = rot % 2 === 0;
      const x = alongX ? Math.floor(t.x / H) * H + H / 2 : snap(t.x, H);
      const z = alongX ? snap(t.z, H) : Math.floor(t.z / H) * H + H / 2;
      return { pos: [x, levelBase, z], rot, ok: true };
    }
    case 'mount': {
      // Back on the face, facing out along the normal.
      const r = (((Math.round(Math.atan2(-n.x, -n.z) / (Math.PI / 2)) % 4) + 4) % 4) as number;
      const alongZ = Math.abs(n.x) > 0.5;
      const x = alongZ ? p.x : snap(p.x, spec.snap);
      const z = alongZ ? snap(p.z, spec.snap) : p.z;
      const front = p.clone().addScaledVector(n, 0.3);
      const floor = floorAt(front.x, p.y, front.z);
      let y: number;
      if (spec.vSnap) y = Math.max(floor ?? -Infinity, Math.floor((p.y + 0.01) / spec.vSnap) * spec.vSnap);
      else if (spec.hang !== undefined) y = snap(p.y, 0.5) - spec.hang;
      else y = floor ?? p.y;
      return { pos: [x, y, z], rot: r, ok: side };
    }
    case 'floor': {
      if (top) return { pos: [snap(p.x, spec.snap), +p.y.toFixed(3), snap(p.z, spec.snap)], rot, ok: true };
      const q = p.clone().addScaledVector(n, 0.5);
      if (side && extent) {
        // Next to the face: the prop's near side touches it, snapped away from it.
        const i = Math.abs(n.x) > 0.5 ? 0 : 2;
        const s = spec.snap;
        const face = p.getComponent(i);
        const c = n.getComponent(i) > 0 ? Math.ceil((face - extent.min.getComponent(i) - 0.001) / s) * s : Math.floor((face - extent.max.getComponent(i) + 0.001) / s) * s;
        q.setComponent(i, c);
      }
      const floor = floorAt(q.x, p.y, q.z);
      return { pos: [snap(q.x, spec.snap), floor ?? p.y, snap(q.z, spec.snap)], rot, ok: side && floor !== null };
    }
  }
}
