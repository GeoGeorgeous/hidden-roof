import * as THREE from 'three';
import type { Lines } from './lines';
import type { V3 } from './mesh';
import type { Tower } from './layout';

// Wires that weave the city together: bundles strung across the streets from
// one facade to the one facing it, and long spans high over the level between
// the towers around it. All pen lines (city/lines.ts). Each wire ends on a
// wall (found by casting along the anchor's facade normal), so none passes
// through a building; none passes through the level below its roofs.

const NEAR = 320;
const MAX_SPAN = 70;

interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** Index into the near towers. */
  tower: number;
}

const ray = new THREE.Ray();
const hit = new THREE.Vector3();
const box = new THREE.Box3();

export function stringWires(towers: Tower[], level: THREE.Box3, lines: Lines, rnd: () => number) {
  const near = towers.filter((t) => t.dist < NEAR);
  const boxes: Box[] = near.flatMap((t, i) => {
    let y = -1000;
    return t.tiers.map((tr) => {
      const b = { min: new THREE.Vector3(tr.x0, y, tr.z0), max: new THREE.Vector3(tr.x1, tr.top, tr.z1), tower: i };
      y = tr.top;
      return b;
    });
  });
  const levelBox = level.isEmpty() ? null : level.clone().expandByVector(new THREE.Vector3(1, 0, 1));
  const levelTop = level.isEmpty() ? 0 : level.max.y;

  /** First wall hit from p along d within MAX_SPAN, skipping the box p is on. */
  const cast = (p: THREE.Vector3, d: THREE.Vector3, own: Box) => {
    ray.set(p, d);
    let best = Infinity;
    for (const b of boxes) {
      if (b === own) continue;
      box.set(b.min, b.max);
      if (ray.intersectBox(box, hit) && hit.distanceTo(p) < best) best = hit.distanceTo(p);
    }
    return best < MAX_SPAN ? best : -1;
  };
  const clearOfLevel = (a: V3, b: V3) => {
    if (!levelBox) return true;
    // Over the level only well above its roofs.
    const low = Math.min(a[1], b[1]) - 2;
    box.copy(levelBox);
    ray.set(new THREE.Vector3(...a), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return !(ray.intersectBox(box, hit) && hit.distanceTo(ray.origin) < len && low < levelTop + 4);
  };

  // Street bundles: anchors on walls, cast across the street.
  for (const own of boxes) {
    const tw = near[own.tower];
    const k = Math.floor(rnd() * (tw.dist < 150 ? 5 : 2.5));
    for (let i = 0; i < k; i++) {
      const side = Math.floor(rnd() * 4);
      const n = new THREE.Vector3(side === 0 ? -1 : side === 1 ? 1 : 0, 0, side === 2 ? -1 : side === 3 ? 1 : 0);
      const lo = Math.max(own.min.y, own.max.y - 45);
      const y = lo + rnd() * (own.max.y - lo - 1);
      const t = 0.1 + rnd() * 0.8;
      const p = new THREE.Vector3(
        side < 2 ? (side === 0 ? own.min.x : own.max.x) : own.min.x + (own.max.x - own.min.x) * t,
        y,
        side >= 2 ? (side === 2 ? own.min.z : own.max.z) : own.min.z + (own.max.z - own.min.z) * t,
      ).addScaledVector(n, 0.05);
      // Mostly straight across, sometimes diagonal, a little up or down.
      const d = n.clone();
      d.x += (rnd() - 0.5) * (side >= 2 ? 1.6 : 0.3);
      d.z += (rnd() - 0.5) * (side < 2 ? 1.6 : 0.3);
      d.y = (rnd() - 0.5) * 0.25;
      d.normalize();
      const dist = cast(p, d, own);
      if (dist < 4) continue;
      const q = p.clone().addScaledVector(d, dist - 0.05);
      const a: V3 = [p.x, p.y, p.z];
      const b: V3 = [q.x, q.y, q.z];
      if (!clearOfLevel(a, b)) continue;
      const strands = 1 + Math.floor(rnd() * 4);
      lines.style(0.85, 420);
      for (let s = 0; s < strands; s++) {
        const off = s * 0.25;
        lines.wire([a[0], a[1] - off, a[2]], [b[0], b[1] - off * (0.5 + rnd()), b[2]], dist * (0.03 + rnd() * 0.05), Math.max(6, Math.round(dist / 3)));
      }
    }
  }

  // Long spans over the level, between the towers around it that rise above it.
  if (!levelBox) return;
  const c = levelBox.getCenter(new THREE.Vector3());
  const tall = boxes.filter((b) => b.max.y > levelTop + 10 && Math.hypot((b.min.x + b.max.x) / 2 - c.x, (b.min.z + b.max.z) / 2 - c.z) < 120);
  for (let i = 0; i < 40 && tall.length > 1; i++) {
    const A = tall[Math.floor(rnd() * tall.length)];
    const B = tall[Math.floor(rnd() * tall.length)];
    if (A === B) continue;
    const ya = levelTop + 6 + rnd() * Math.min(30, A.max.y - levelTop - 7);
    const yb = levelTop + 6 + rnd() * Math.min(30, B.max.y - levelTop - 7);
    // From the face of A toward B to the face of B toward A.
    const pa = new THREE.Vector3(THREE.MathUtils.clamp(c.x, A.min.x, A.max.x), ya, THREE.MathUtils.clamp(c.z, A.min.z, A.max.z));
    const pb = new THREE.Vector3(THREE.MathUtils.clamp(c.x, B.min.x, B.max.x), yb, THREE.MathUtils.clamp(c.z, B.min.z, B.max.z));
    const len = pa.distanceTo(pb);
    if (len < 20 || len > 220) continue;
    const strands = 1 + Math.floor(rnd() * 3);
    lines.style(0.9, 600);
    for (let s = 0; s < strands; s++) lines.wire([pa.x, pa.y - s * 0.3, pa.z], [pb.x, pb.y - s * 0.3, pb.z], len * (0.02 + rnd() * 0.03), Math.round(len / 4));
  }
}
