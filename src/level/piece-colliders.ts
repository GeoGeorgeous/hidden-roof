import * as THREE from 'three';
import { PIECE_COLLIDERS } from '../config';
import type { Axis } from '../surfaces';

// Colliders made from a prop's rod, cone and cylinder pieces (build-prop.ts):
// boxes that follow what's drawn closely enough to stand, climb and paint by.

/**
 * A sloped rod collides as a chain of small boxes along it. A mostly vertical
 * rod ends at its end points, so a post standing on a floor doesn't reach
 * into it (masts, sign towers and billboards could not be placed on floors).
 * One that leans less than 1 in 10 (a tapering mast's corner post) is one box
 * round it: as a chain, each box would stand a centimeter out from the one
 * above, ledges to jump up one by one.
 */
export function rodColliders(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  if (Math.hypot(b.x - a.x, b.z - a.z) < Math.abs(b.y - a.y) * 0.1) return [new THREE.Box3().setFromPoints([a, b]).expandByVector(new THREE.Vector3(r, 0, r))];
  const n = Math.max(1, Math.ceil(a.distanceTo(b) / PIECE_COLLIDERS.rodLink));
  const upright = Math.abs(b.y - a.y) > a.distanceTo(b) * 0.7;
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  const out: THREE.Box3[] = [];
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, i / n);
    const q = a.clone().lerp(b, (i + 1) / n);
    const box = new THREE.Box3().setFromPoints([p, q]).expandByScalar(r);
    if (upright) {
      box.min.y = Math.max(box.min.y, lo);
      box.max.y = Math.min(box.max.y, hi);
    }
    out.push(box);
  }
  return out;
}

/** An upright cone collides as a stack of short cylinders, each as wide as the cone halfway up it: a roof that steps up to its tip. */
export function coneColliders(base: THREE.Vector3, r: number, h: number) {
  const n = Math.max(1, Math.ceil(h / PIECE_COLLIDERS.coneSlice));
  return Array.from({ length: n }, (_, i) => cylinderColliders(base.clone().setY(base.y + (h * i) / n), 'y', h / n, r * (1 - (i + 0.5) / n))).flat();
}

/** Fat vertical cylinders collide as overlapping slabs; everything else as its AABB. */
export function cylinderColliders(base: THREE.Vector3, axis: Axis, len: number, r: number) {
  if (axis !== 'y' || r < 0.8) {
    const end = base.clone().setComponent('xyz'.indexOf(axis), base.getComponent('xyz'.indexOf(axis)) + len);
    return [new THREE.Box3().setFromPoints([base, end]).expandByVector(new THREE.Vector3(axis === 'x' ? 0 : r, axis === 'y' ? 0 : r, axis === 'z' ? 0 : r))];
  }
  // N slabs per quadrant, their corners spread around the circle. Between two
  // corners the union dips in to a notch; the slabs are pushed out by half that
  // dip, so the outline stays within ~0.1 m of the visible wall, in and out
  // (fewer slabs let the eye, a player radius away, reach inside a big tank).
  const n = Math.min(12, Math.max(4, Math.ceil(r * 4)));
  const angles = Array.from({ length: n }, (_, k) => ((k + 0.5) * Math.PI) / 2 / n);
  let notch = 1;
  for (let k = 0; k + 1 < n; k++) notch = Math.min(notch, Math.hypot(Math.cos(angles[k + 1]), Math.sin(angles[k])));
  const R = r * (1 + (1 - notch) / 2);
  return angles.map((a) => {
    const hx = R * Math.cos(a);
    const hz = R * Math.sin(a);
    return new THREE.Box3(new THREE.Vector3(base.x - hx, base.y, base.z - hz), new THREE.Vector3(base.x + hx, base.y + len, base.z + hz));
  });
}
