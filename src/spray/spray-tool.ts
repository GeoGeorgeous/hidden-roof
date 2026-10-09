import * as THREE from 'three';
import { CAPS, COLORS, PRESSURE } from '../config';
import type { Audio } from '../audio';
import type { Input } from '../input';
import type { Inventory } from '../inventory/inventory';
import { rgbOf } from '../inventory/items';
import type { PaintSystem } from '../painting';
import { CanModel } from './can-model';
import { SprayParticles } from './particles';
import { setHex } from '../hex-color';
import { paintRandom } from '../lcg';

// Spraying: color and cap come from the inventory. Paint never runs out;
// pressure drains while spraying and is restored by shaking: hold the right
// mouse button (a press alone gives back only a little).

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const display = new THREE.Color();

export class SprayTool {
  /** 0..1 flow actually coming out this frame. */
  flow = 0;
  readonly model = new CanModel();
  readonly particles: SprayParticles;
  private carry = 0;
  /** Time into the current shake (s); -1 = not shaking. */
  private shakeT = -1;
  private sputterOn = true;
  private sputterTimer = 0;

  constructor(
    scene: THREE.Scene,
    paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    this.particles = new SprayParticles(scene, paint, solids);
  }

  /** `inv` is null when the can is put away (particles still finish flying). */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, inv: Inventory | null) {
    this.model.group.visible = !!inv;
    this.particles.update(dt);
    if (!inv) {
      this.flow = 0;
      this.shakeT = -1;
      this.audio.setHiss(0, 0);
      return;
    }
    const cap = CAPS[inv.cap];
    this.model.setCan(inv.color, inv.cap);

    const holding = input.rmb && input.locked;
    if (holding && this.shakeT < 0) {
      this.shakeT = 0;
      inv.pressure = Math.min(1, inv.pressure + PRESSURE.shakeTap);
      this.audio.rattle();
    }
    if (this.shakeT >= 0) {
      if (holding) inv.pressure = Math.min(1, inv.pressure + PRESSURE.shakeRate * dt);
      this.shakeT += dt;
      // A shake ends its motion after RMB is let go; held, the next one starts.
      if (this.shakeT >= PRESSURE.shakeDuration) {
        this.shakeT = holding ? this.shakeT - PRESSURE.shakeDuration : -1;
        if (holding) this.audio.rattle();
      }
    }

    const spraying = input.lmb && input.locked;
    this.flow = spraying ? this.computeFlow(dt, inv.pressure) : 0;
    if (spraying) inv.pressure = Math.max(0, inv.pressure - cap.drain * dt);
    this.audio.setHiss(this.flow * cap.hissGain, cap.hissTone);

    this.model.update(dt, camera, spraying, this.flow > 0, this.shakeT >= 0 ? this.shakeT / PRESSURE.shakeDuration : -1);
    if (this.flow > 0) this.emit(dt, camera, eye, inv);
  }

  /** Shaking the can (RMB) right now. */
  get shaking() {
    return this.shakeT >= 0;
  }

  private emit(dt: number, camera: THREE.Camera, eye: THREE.Vector3, inv: Inventory) {
    const cap = CAPS[inv.cap];
    this.carry += cap.rate * this.flow * dt;
    const count = Math.floor(this.carry);
    this.carry -= count;
    if (!count) return;
    camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.crossVectors(right, forward);
    setHex(display, COLORS[inv.color]);
    this.particles.emit({ count, eye, nozzle: this.model.nozzleWorld(nozzle), forward, right, up, cap, flow: this.flow, rgb: rgbOf(inv.color), display });
  }

  private computeFlow(dt: number, p: number): number {
    if (p <= 0) return 0;
    if (p < PRESSURE.sputterThreshold) {
      this.sputterTimer -= dt;
      if (this.sputterTimer <= 0) {
        this.sputterOn = paintRandom.sputter() < PRESSURE.sputterDuty;
        this.sputterTimer = 0.03 + paintRandom.sputter() * 0.12;
      }
      const weak = 0.5 + 0.5 * (p / PRESSURE.sputterThreshold);
      return this.sputterOn ? PRESSURE.minSteadyFlow * weak : 0;
    }
    if (p < PRESSURE.thinThreshold) {
      const t = (p - PRESSURE.sputterThreshold) / (PRESSURE.thinThreshold - PRESSURE.sputterThreshold);
      return PRESSURE.minSteadyFlow + (1 - PRESSURE.minSteadyFlow) * t;
    }
    return 1;
  }
}
