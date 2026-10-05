import * as THREE from 'three';
import type { PaintSurface, PaintSystem } from '../painting';
import { facePoint, type FacePoint } from '../surfaces';
import { solidsNear } from '../level/solids';

// The stroke under the crosshair, shared by the tools that work a surface at
// close range (marker, roller, sponge): rays from last frame's aim to this
// frame's, close enough together that fast mouse moves leave no gaps, against
// the solids near the eye. Held still, a stroke keeps hitting the same spot
// every frame; `fresh` tells a tool when that counts again (runs, scrubbing),
// at a steady rate whatever the frame rate.

const dir = new THREE.Vector3();
const step = new THREE.Vector3();
const at: FacePoint = { rect: 0, u: 0, v: 0 };
/** Under this angle (radians) between frames the aim counts as held still. */
const STILL_ANGLE = 0.0005;

export interface StrokeSpec {
  reach: number;
  /** Most angle between two rays (radians), and most rays per frame. */
  rayStep: number;
  maxRays: number;
  /** Held still: how often per second a frame is `fresh`. */
  stillRate: number;
}

export class StrokeSweep {
  private prev: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private stillClock = 0;

  constructor(
    private solids: THREE.Mesh[],
    private paint: PaintSystem,
  ) {}

  /**
   * Sweeps from last frame's aim to this frame's and calls `each` for every
   * ray that hits a solid within reach (`surface`: its paint, if paintable;
   * `at`: the hit on it, valid only with a surface).
   * `fresh`: moving, or held still long enough. Returns the angle swept and
   * whether anything was hit.
   */
  sweep(dt: number, camera: THREE.Camera, eye: THREE.Vector3, spec: StrokeSpec, each: (hit: THREE.Intersection, surface: PaintSurface | undefined, at: FacePoint, fresh: boolean) => void) {
    camera.getWorldDirection(dir);
    solidsNear(this.solids, eye, spec.reach, this.near);
    const from = this.prev ?? dir;
    const angle = from.angleTo(dir);
    this.stillClock += dt;
    const fresh = angle > STILL_ANGLE || this.stillClock >= 1 / spec.stillRate;
    if (fresh) this.stillClock = 0;
    const n = Math.min(spec.maxRays, Math.max(1, Math.ceil(angle / spec.rayStep)));
    this.raycaster.far = spec.reach;
    let hitAny = false;
    for (let k = 1; k <= n; k++) {
      step.copy(from).lerp(dir, k / n).normalize();
      this.raycaster.set(eye, step);
      const hit = this.near.length ? this.raycaster.intersectObjects(this.near, false)[0] : undefined;
      if (!hit) continue;
      hitAny = true;
      const surface = this.paint.get(hit.object);
      if (surface) facePoint(surface.geo, hit.faceIndex!, hit.uv!, at);
      each(hit, surface, at, fresh);
    }
    this.prev = (this.prev ?? new THREE.Vector3()).copy(dir);
    return { angle, hit: hitAny };
  }

  /** Off the surface (LMB up): the next stroke starts fresh. */
  lift() {
    this.prev = null;
  }
}
