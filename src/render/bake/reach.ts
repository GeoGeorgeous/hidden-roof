import * as THREE from 'three';
import { LIGHTS } from '../../config';
import type { BuiltProp } from '../../level/build-prop';

// Which parts of the level an edit relights:
//  - everything in range of a lamp that came or went (a sphere)
//  - for every lamp whose light reaches a collider that came or went, only
//    what lies in its shadow: a cone from the lamp around it, from the
//    collider out to the lamp's range. Colliders are cut into chunks of at
//    most CHUNK m first, so a tall facade casts narrow cones, not one huge one.
//    A long-range floodlight then doesn't rebake the whole level for every
//    block placed in its light.

export interface Reach {
  spheres: THREE.Sphere[];
  cones: Cone[];
}

interface Cone {
  apex: THREE.Vector3;
  axis: THREE.Vector3;
  /** Half-angle, radians. */
  half: number;
  /** Nothing nearer to the apex than this is shadowed by the prop. */
  near: number;
  range: number;
  /** Widest radius the cone reaches (at its range). */
  radius: number;
}

const CHUNK = 4;
const sphere = new THREE.Sphere();
const v = new THREE.Vector3();
const size = new THREE.Vector3();
const chunk = new THREE.Box3();

/** Spheres lit by a prop's steady lamps. */
export function lampSpheres(b: BuiltProp, out: Reach) {
  for (const a of b.lights) if (!a.track) out.spheres.push(new THREE.Sphere(a.pos.clone(), LIGHTS[a.kind].range));
}

/** Shadow cones of colliders that came or went, from every steady lamp of `props` that reaches them. */
export function shadowCones(props: Iterable<BuiltProp>, boxes: THREE.Box3[], out: Reach) {
  const lamps: { pos: THREE.Vector3; range: number }[] = [];
  for (const b of props) for (const a of b.lights) if (!a.track) lamps.push({ pos: a.pos, range: LIGHTS[a.kind].range });
  for (const box of boxes) {
    box.getSize(size);
    const n = [size.x, size.y, size.z].map((s) => Math.max(1, Math.ceil(s / CHUNK)));
    for (let i = 0; i < n[0]; i++) {
      for (let j = 0; j < n[1]; j++) {
        for (let k = 0; k < n[2]; k++) {
          chunk.min.set(box.min.x + (size.x * i) / n[0], box.min.y + (size.y * j) / n[1], box.min.z + (size.z * k) / n[2]);
          chunk.max.set(box.min.x + (size.x * (i + 1)) / n[0], box.min.y + (size.y * (j + 1)) / n[1], box.min.z + (size.z * (k + 1)) / n[2]);
          for (const l of lamps) if (chunk.distanceToPoint(l.pos) < l.range) addCone(l.pos, l.range, chunk, out);
        }
      }
    }
  }
}

function addCone(lamp: THREE.Vector3, range: number, box: THREE.Box3, out: Reach) {
  box.getBoundingSphere(sphere);
  const axis = sphere.center.clone().sub(lamp);
  const dist = axis.length();
  // The lamp sits inside it (its own prop, a neighbor): everything in range.
  if (dist <= sphere.radius) {
    out.spheres.push(new THREE.Sphere(lamp.clone(), range));
    return;
  }
  const half = Math.asin(sphere.radius / dist);
  out.cones.push({ apex: lamp.clone(), axis: axis.divideScalar(dist), half, near: dist - sphere.radius, range, radius: range * Math.tan(half) });
}

/**
 * Does the edit relight anything inside `bounds`? Cones are tested twice, both
 * conservatively: against the bounding sphere (angle) and against the box (the
 * cone fits in a capsule along its axis), since tall facades have huge spheres.
 */
export function reaches(r: Reach, bounds: THREE.Box3) {
  if (r.spheres.some((s) => bounds.intersectsSphere(s))) return true;
  if (!r.cones.length) return false;
  bounds.getBoundingSphere(sphere);
  return r.cones.some((c) => {
    const d = v.subVectors(sphere.center, c.apex).length();
    if (d - sphere.radius > c.range || d + sphere.radius < c.near) return false;
    if (d > sphere.radius && Math.acos(THREE.MathUtils.clamp(v.dot(c.axis) / d, -1, 1)) > c.half + Math.asin(sphere.radius / d)) return false;
    return axisNear(c, bounds);
  });
}

/** Does the cone's axis, from where its shadow can start to its range, pass within the cone's widest radius of the box? */
function axisNear(c: Cone, b: THREE.Box3) {
  let t0 = c.near * Math.cos(c.half);
  let t1 = c.range;
  for (let k = 0; k < 3; k++) {
    const o = c.apex.getComponent(k);
    const u = c.axis.getComponent(k);
    const lo = b.min.getComponent(k) - c.radius;
    const hi = b.max.getComponent(k) + c.radius;
    if (Math.abs(u) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    const a = (lo - o) / u;
    const e = (hi - o) / u;
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
    if (t0 > t1) return false;
  }
  return true;
}
