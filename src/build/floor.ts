import * as THREE from 'three';

// The top surface under a point, by a ray straight down through the level's
// meshes (build mode, and placing the stepladder).

const ray = new THREE.Raycaster();
const from = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Height of the first upward face below (x, y + 0.1, z) within `far` meters, or null. `skip`: meshes to look through. */
export function floorBelow(root: THREE.Object3D, x: number, y: number, z: number, far = 60, skip?: (o: THREE.Object3D) => boolean) {
  ray.set(from.set(x, y + 0.1, z), DOWN);
  ray.far = far;
  const h = ray.intersectObject(root, true).find((i) => (i.face?.normal.y ?? 0) > 0.5 && !skip?.(i.object));
  return h ? +h.point.y.toFixed(3) : null;
}
