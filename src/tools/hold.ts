import type * as THREE from 'three';
import type { HoldPose } from '../config';

/**
 * Put a held tool's model where HOLD says (see HoldPose): `distance` in front
 * of the eye, `x` / `y` per meter of it, rotation and scale. `dx`, `dy`, `dz`
 * (m) add the tool's own motion: shaking, recoil, pushing to the wall, scrubbing.
 */
export function applyHold(obj: THREE.Object3D, h: HoldPose, dx = 0, dy = 0, dz = 0) {
  obj.position.set(h.x * h.distance + dx, h.y * h.distance + dy, -h.distance + dz);
  obj.rotation.set(h.pitch, h.yaw, h.roll);
  obj.scale.setScalar(h.scale);
}
