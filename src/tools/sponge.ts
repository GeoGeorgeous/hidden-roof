import * as THREE from 'three';
import type { Audio } from '../audio';
import { SPONGE } from '../config';
import type { Input } from '../input';
import type { PaintSystem } from '../painting';
import { solidsNear } from '../level/solids';
import { SpongeModel } from './sponge-model';

// Sponge: cleans paint off surfaces. Held to a surface under the
// crosshair (arm's length), LMB scrubs: each step takes a share of the paint
// left off a round patch (PaintSystem.stamp with no color), so one pass fades
// it and scrubbing back and forth cleans it. Moving the view fills the steps in
// between frames, like the marker. Works on any paint (can, marker, roller, runs).
// The mouse wheel changes the patch size (SPONGE.radiusMin..radiusMax, see wheel-size.ts).

const dir = new THREE.Vector3();
const step = new THREE.Vector3();
/** Held still, it keeps scrubbing the same spot this often (per s), whatever the frame rate. */
const STILL_RATE = 20;

export class SpongeTool {
  readonly model = new SpongeModel();
  private prev: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private stillClock = 0;
  private sounding = false;

  constructor(
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
    private audio: Audio,
  ) {}

  /** The sponge's sway group, for ViewSway. */
  get sway() {
    return this.model.sway;
  }

  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, active: boolean) {
    const scrubbing = active && input.lmb && input.locked && this.scrub(dt, camera, eye);
    if (!(active && input.lmb && input.locked)) this.prev = null;
    if (scrubbing || this.sounding) this.audio.setScribble(scrubbing ? 0.5 : 0);
    this.sounding = scrubbing;
    this.model.update(dt, camera, active, scrubbing);
  }

  /** Scrubs from last frame's aim to this frame's; false if no surface was in reach. */
  private scrub(dt: number, camera: THREE.Camera, eye: THREE.Vector3) {
    camera.getWorldDirection(dir);
    solidsNear(this.solids, eye, SPONGE.reach, this.near);
    const from = this.prev ?? dir;
    this.prev = (this.prev ?? new THREE.Vector3()).copy(dir);
    const angle = from.angleTo(dir);
    // Held still, it scrubs the same spot at a steady rate, whatever the frame rate.
    this.stillClock += dt;
    const moving = angle > 0.0005;
    if (!moving && this.stillClock < 1 / STILL_RATE) return this.inReach(eye);
    this.stillClock = 0;
    const n = Math.min(24, Math.max(1, Math.ceil((angle * SPONGE.reach) / (SPONGE.radius * 0.5))));
    this.raycaster.far = SPONGE.reach;
    let hitAny = false;
    for (let k = 1; k <= n; k++) {
      step.copy(from).lerp(dir, k / n).normalize();
      this.raycaster.set(eye, step);
      const hit = this.near.length ? this.raycaster.intersectObjects(this.near, false)[0] : undefined;
      if (!hit) continue;
      hitAny = true;
      const surface = this.paint.get(hit.object);
      if (surface) this.paint.stamp(surface, hit.uv!, hit.faceIndex!, SPONGE.radius, SPONGE.strength, null, SPONGE.softness);
    }
    return hitAny;
  }

  /** Is a surface under the crosshair within reach? */
  private inReach(eye: THREE.Vector3) {
    this.raycaster.set(eye, dir);
    this.raycaster.far = SPONGE.reach;
    return this.near.length > 0 && this.raycaster.intersectObjects(this.near, false).length > 0;
  }
}
