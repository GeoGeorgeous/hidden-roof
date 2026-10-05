import * as THREE from 'three';
import type { Audio } from '../audio';
import { SPONGE } from '../config';
import type { Input } from '../input';
import type { PaintSystem } from '../painting';
import { StrokeSweep } from './stroke';
import { SpongeModel } from './sponge-model';

// Sponge: cleans paint off surfaces. Held to a surface under the
// crosshair (arm's length), LMB scrubs: each step takes a share of the paint
// left off a round patch (PaintSystem.stamp with no color), so one pass fades
// it and scrubbing back and forth cleans it. Moving the view fills the steps in
// between frames, like the marker. Works on any paint (can, marker, roller, runs).
// The mouse wheel changes the patch size (Inventory.size, SPONGE.radiusMin..radiusMax, see wheel-size.ts).

export class SpongeTool {
  readonly model = new SpongeModel();
  private stroke: StrokeSweep;
  private sounding = false;

  constructor(
    private paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    this.stroke = new StrokeSweep(solids, paint);
  }

  /** The sponge's sway group, for ViewSway. */
  get sway() {
    return this.model.sway;
  }

  /** `radius`: the patch it cleans (m). */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, active: boolean, radius: number) {
    const pressed = active && input.lmb && input.locked;
    const scrubbing = pressed && this.scrub(dt, camera, eye, radius);
    if (!pressed) this.stroke.lift();
    if (scrubbing || this.sounding) this.audio.setScribble(scrubbing ? 0.5 : 0);
    this.sounding = scrubbing;
    this.model.update(dt, camera, active, scrubbing);
  }

  /** Scrubs from last frame's aim to this frame's (held still: at SPONGE.stillRate); false if no surface was in reach. */
  private scrub(dt: number, camera: THREE.Camera, eye: THREE.Vector3, radius: number) {
    // Steps half a patch apart at full reach.
    const spec = { reach: SPONGE.reach, rayStep: (radius * 0.5) / SPONGE.reach, maxRays: SPONGE.maxRays, stillRate: SPONGE.stillRate };
    return this.stroke.sweep(dt, camera, eye, spec, (_hit, surface, at, fresh) => {
      if (fresh && surface) this.paint.stamp(surface, at, radius, SPONGE.strength, null, SPONGE.softness);
    }).hit;
  }
}
