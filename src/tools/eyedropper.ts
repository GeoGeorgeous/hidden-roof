import * as THREE from 'three';
import { EYEDROPPER, type PaintColor } from '../config';
import { rgbOf } from '../inventory/items';
import { solidsNear } from '../level/solids';
import type { PaintSystem } from '../painting';
import { hasPaint } from '../paint-surface';

// The eyedropper (the wheel's click, BL-020): the paint under the crosshair, as
// the nearest of the colors you have. Reads one texel of the surface's paint;
// paints nothing.

const dir = new THREE.Vector3();

export class Eyedropper {
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];

  constructor(
    private solids: THREE.Mesh[],
    private paint: PaintSystem,
  ) {}

  /** The owned color nearest the paint under the crosshair; null where there's no paint within reach. */
  pick(camera: THREE.Camera, eye: THREE.Vector3, colors: readonly PaintColor[]): PaintColor | null {
    this.raycaster.set(eye, camera.getWorldDirection(dir));
    this.raycaster.far = EYEDROPPER.reach;
    const hit = this.raycaster.intersectObjects(solidsNear(this.solids, eye, EYEDROPPER.reach, this.near), false)[0];
    const s = hit && this.paint.get(hit.object);
    if (!s || !hasPaint(s) || !hit.uv) return null;
    const x = Math.min(s.geo.atlasW - 1, Math.floor(hit.uv.x * s.geo.atlasW));
    const y = Math.min(s.geo.atlasH - 1, Math.floor(hit.uv.y * s.geo.atlasH));
    const i = (y * s.geo.atlasW + x) * 4;
    if (s.data[i + 3] < EYEDROPPER.minCover * 255) return null;
    const rgb = [s.data[i] / 255, s.data[i + 1] / 255, s.data[i + 2] / 255];
    const dist = (c: PaintColor) => rgbOf(c).reduce((sum, v, k) => sum + (v - rgb[k]) ** 2, 0);
    return colors.reduce((best, c) => (dist(c) < dist(best) ? c : best));
  }
}
