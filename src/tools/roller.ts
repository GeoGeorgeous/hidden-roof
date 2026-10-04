import * as THREE from 'three';
import type { Audio } from '../audio';
import { ROLLER, type PaintColor } from '../config';
import type { Input } from '../input';
import { rgbOf } from '../inventory/items';
import type { PaintSystem } from '../painting';
import { solidsNear } from '../level/solids';
import { RollerModel } from './roller-model';

// Paint roller: a wide graffiti roller on a short pole. Held to a surface
// under the crosshair, LMB rolls solid bands of paint into the surface texture
// (PaintSystem.roll, the same paint as the can and marker): each press is a
// band as wide as the roller, laid along the roller (the view's right, laid
// into the surface), with lighter ends. Moving the view rolls it: presses are
// filled in between frames, so a stroke is one continuous band. Rolling up
// and down makes the wide stroke; rolling sideways only drags it along its
// own length, like a real one. Paint runs come easily (DRIPS).

const dir = new THREE.Vector3();
const step = new THREE.Vector3();
const right = new THREE.Vector3();
/** Held still, presses add to runs this often (per s), whatever the frame rate. */
const STILL_DRIP_RATE = 20;

export class RollerTool {
  readonly model = new RollerModel();
  private prev: THREE.Vector3 | null = null;
  private lastHit = new THREE.Vector3();
  private hasLastHit = false;
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private stillClock = 0;
  private sounding = false;

  constructor(
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
    private audio: Audio,
  ) {}

  /** The roller's sway group, for ViewSway. */
  get sway() {
    return this.model.sway;
  }

  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, active: boolean, color: PaintColor) {
    const rolled = active && input.lmb && input.locked ? this.roll(dt, camera, eye, color) : this.lift();
    this.model.update(dt, camera, active, color, rolled !== null, rolled ?? 0);
  }

  /** LMB up: off the wall. */
  private lift() {
    this.prev = null;
    this.hasLastHit = false;
    if (this.sounding) this.audio.setScribble(0);
    this.sounding = false;
    return null;
  }

  /** Rolls from last frame's aim to this frame's; returns meters rolled, or null if nothing was in reach. */
  private roll(dt: number, camera: THREE.Camera, eye: THREE.Vector3, color: PaintColor) {
    camera.getWorldDirection(dir);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    solidsNear(this.solids, eye, ROLLER.reach, this.near);
    const from = this.prev ?? dir;
    const angle = from.angleTo(dir);
    // Presses no farther apart than their depth at full reach.
    const n = Math.min(48, Math.max(1, Math.ceil((angle * ROLLER.reach) / ROLLER.halfDepth)));
    this.stillClock += dt;
    const canDrip = angle > 0.0005 || this.stillClock >= 1 / STILL_DRIP_RATE;
    if (canDrip) this.stillClock = 0;
    this.raycaster.far = ROLLER.reach;
    let rolled: number | null = null;
    for (let k = 1; k <= n; k++) {
      step.copy(from).lerp(dir, k / n).normalize();
      this.raycaster.set(eye, step);
      const hit = this.near.length ? this.raycaster.intersectObjects(this.near, false)[0] : undefined;
      const surface = hit && this.paint.get(hit.object);
      if (!hit || !surface) continue;
      this.paint.roll(surface, hit.uv!, hit.faceIndex!, right, ROLLER.halfWidth, ROLLER.halfDepth, ROLLER.edge, ROLLER.strength, rgbOf(color), canDrip ? ROLLER.drips : 0);
      rolled = (rolled ?? 0) + (this.hasLastHit ? hit.point.distanceTo(this.lastHit) : 0);
      this.lastHit.copy(hit.point);
      this.hasLastHit = true;
    }
    if (rolled === null) this.hasLastHit = false;
    this.prev = (this.prev ?? new THREE.Vector3()).copy(dir);
    const level = rolled === null ? 0 : Math.min(1, 0.2 + (rolled / Math.max(dt, 1e-3)) * 0.3);
    this.audio.setScribble(level);
    this.sounding = true;
    return rolled;
  }
}
