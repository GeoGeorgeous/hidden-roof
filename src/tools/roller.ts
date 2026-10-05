import * as THREE from 'three';
import type { Audio } from '../audio';
import { ROLLER, type PaintColor } from '../config';
import type { Input } from '../input';
import { rgbOf } from '../inventory/items';
import type { PaintSystem } from '../painting';
import { StrokeSweep } from './stroke';
import { RollerModel } from './roller-model';

// Paint roller: a wide graffiti roller on a short pole. Held to a surface
// under the crosshair, LMB rolls solid bands of paint into the surface texture
// (PaintSystem.roll, the same paint as the can and marker): each press is a
// band as wide as the roller, laid along the roller (the view's right, laid
// into the surface), with lighter ends. Moving the view rolls it: presses are
// filled in between frames, so a stroke is one continuous band. Rolling up
// and down makes the wide stroke; rolling sideways only drags it along its
// own length, like a real one. Paint runs come easily (DRIPS).

const right = new THREE.Vector3();

export class RollerTool {
  readonly model = new RollerModel();
  private stroke: StrokeSweep;
  private lastHit = new THREE.Vector3();
  private hasLastHit = false;
  private sounding = false;

  constructor(
    private paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    this.stroke = new StrokeSweep(solids, paint);
  }

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
    this.stroke.lift();
    this.hasLastHit = false;
    if (this.sounding) this.audio.setScribble(0);
    this.sounding = false;
    return null;
  }

  /** Rolls from last frame's aim to this frame's; returns meters rolled, or null if nothing was in reach. */
  private roll(dt: number, camera: THREE.Camera, eye: THREE.Vector3, color: PaintColor) {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    // Presses no farther apart than their depth at full reach.
    const spec = { reach: ROLLER.reach, rayStep: ROLLER.halfDepth / ROLLER.reach, maxRays: ROLLER.maxRays, stillRate: ROLLER.stillRate };
    let rolled: number | null = null;
    this.stroke.sweep(dt, camera, eye, spec, (hit, surface, at, fresh) => {
      if (!surface) return;
      this.paint.roll(surface, at, right, ROLLER.halfWidth, ROLLER.halfDepth, ROLLER.edge, ROLLER.strength, rgbOf(color), fresh ? ROLLER.drips : 0);
      rolled = (rolled ?? 0) + (this.hasLastHit ? hit.point.distanceTo(this.lastHit) : 0);
      this.lastHit.copy(hit.point);
      this.hasLastHit = true;
    });
    if (rolled === null) this.hasLastHit = false;
    const level = rolled === null ? 0 : Math.min(1, 0.2 + (rolled / Math.max(dt, 1e-3)) * 0.3);
    this.audio.setScribble(level);
    this.sounding = true;
    return rolled;
  }
}
