import type * as THREE from 'three';

/**
 * The solids whose bounding sphere comes within `range` of `p`, into `out`
 * (cleared first): the broad phase before raycasting them (spray, marker,
 * the hand on walls). Level meshes sit at the origin, so their geometry's
 * bounding spheres are in world space.
 */
export function solidsNear(solids: readonly THREE.Mesh[], p: THREE.Vector3, range: number, out: THREE.Object3D[]) {
  out.length = 0;
  for (const m of solids) {
    const bs = m.geometry.boundingSphere!;
    if (bs.center.distanceTo(p) - bs.radius < range) out.push(m);
  }
  return out;
}
