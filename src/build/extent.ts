import * as THREE from 'three';
import type { PropDef } from '../kit/def';
import { expandPieces } from '../level/build-prop';
import type { Extent } from './placement';

// Bounds of a prop around its origin for a given rotation, so a prop placed
// against a side face can sit flush next to it. Cached per type, variant and rotation.

const cache = new Map<string, Extent>();

export function extentOf(def: PropDef, rot: number): Extent {
  const key = `${def.type}|${def.variant}|${rot}`;
  let e = cache.get(key);
  if (e) return e;
  const ex = expandPieces(def.build({ seed: 0, pos: [0, 0, 0], above: false, below: false, adjust: def.adjust?.initial() ?? 0, text: def.text ?? '' }), [0, 0, 0], rot, false);
  const box = new THREE.Box3();
  for (const c of ex.colliders) box.union(c);
  if (box.isEmpty()) {
    for (const d of ex.decor) {
      d.geo.computeBoundingBox();
      box.union(d.geo.boundingBox!);
    }
  }
  for (const d of ex.decor) d.geo.dispose();
  e = { min: box.min, max: box.max };
  cache.set(key, e);
  return e;
}
