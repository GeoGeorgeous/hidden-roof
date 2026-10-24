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
import { FEEL, showGauge, sprayDistance } from '../sandbox/feel';
import { dabRadius, SprayBrush } from '../sandbox/brush';

// Spraying: color and cap come from the inventory. Paint never runs out;
// pressure drains while spraying and is restored by shaking: hold the right
// mouse button (a press alone gives back only a little).

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const display = new THREE.Color();
const lastForward = new THREE.Vector3();

export class SprayTool {
  /** 0..1 flow actually coming out this frame. */
  flow = 0;
  /** The spray is landing on paintable surface (not the sky, not out of reach): as of the last frame that sprayed. */
  landing = false;
  readonly model = new CanModel();
  readonly particles: SprayParticles;
  /** Other players' spray (net/remote-player.ts): seen only, their paint comes as paint ops. */
  readonly others: SprayParticles;
  private carry = 0;
  /** Time into the current shake (s); -1 = not shaking. */
  private shakeT = -1;
  private sputterOn = true;
  private sputterTimer = 0;
  /** Sandbox: seconds into the current press, the release tail left (s), aim speed (rad/s). */
  private holdT = 0;
  private tailT = 0;
  private aimSpeed = 0;
  private brush: SprayBrush;

  constructor(
    scene: THREE.Scene,
    paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    this.particles = new SprayParticles(scene, paint, solids);
    this.others = new SprayParticles(scene, paint, solids);
    this.brush = new SprayBrush(paint, this.particles);
  }

  /** `inv` is null when the can is put away (particles still finish flying). */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, inv: Inventory | null) {
    this.model.group.visible = !!inv;
    this.particles.update(dt);
    this.others.update(dt);
    if (!inv) {
      this.flow = 0;
      this.landing = false;
      this.shakeT = -1;
      this.audio.setHiss(0, 0);
      showGauge(null);
      return;
    }
    const cap = CAPS[inv.cap];
    this.model.setCan(inv.color, inv.cap);

    // Shaking (RMB) and spraying (LMB) exclude each other: the one pressed first wins, and
    // LMB cuts a shake short once RMB is let go. Else a player could shake forever while painting.
    const lmb = input.held('use') && input.locked;
    const holding = input.held('shake') && input.locked && (this.shakeT >= 0 || !lmb);
    if (lmb && !holding) this.shakeT = -1;
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

    const spraying = lmb && !holding;
    camera.getWorldDirection(forward);
    const turn = lastForward.lengthSq() ? forward.angleTo(lastForward) : 0;
    lastForward.copy(forward);
    this.aimSpeed += (turn / Math.max(dt, 1e-3) - this.aimSpeed) * Math.min(1, dt * 20);
    // Let go after a real stroke: the can keeps spitting for a moment.
    if (!spraying && this.holdT > 0.15 && FEEL.on) this.tailT = FEEL.releaseTail;
    this.holdT = spraying ? this.holdT + dt : 0;
    this.tailT = spraying ? 0 : Math.max(0, this.tailT - dt);
    this.flow = spraying ? this.computeFlow(dt, inv.pressure) : 0;
    this.aimGauge(camera, eye, cap, inv);
    if (spraying) inv.pressure = Math.max(0, inv.pressure - cap.drain * dt);
    this.audio.setHiss(this.flow * cap.hissGain, cap.hissTone);

    this.model.update(dt, camera, spraying, this.flow > 0, this.shakeT >= 0 ? this.shakeT / PRESSURE.shakeDuration : -1);
    if (this.flow > 0) this.emit(dt, camera, eye, inv);
    else if (this.tailT > 0 && inv.pressure > 0) this.emit(dt, camera, eye, inv, this.tailT / Math.max(FEEL.releaseTail, 1e-3));
    else {
      this.landing = false;
      this.brush.end();
    }
  }

  /** Shaking the can (RMB) right now. */
  get shaking() {
    return this.shakeT >= 0;
  }

  /** The crosshair as wide as the spot will land where the aim meets the wall. */
  private aimGauge(camera: THREE.Camera, eye: THREE.Vector3, cap: (typeof CAPS)[keyof typeof CAPS], inv: Inventory) {
    if (!FEEL.on) return showGauge(null);
    const hit = this.particles.probe(eye, forward);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 70;
    const px = hit ? ((2 * dabRadius(cap, hit.distance)) / hit.distance / Math.tan((fov * Math.PI) / 360)) * (window.innerHeight / 2) : 16;
    showGauge(COLORS[inv.color], px, !!hit && sprayDistance(hit.distance) < FEEL.closeAt * 1.3, hit ? hit.distance : -1);
  }

  /** `tail` (1..0): the release tail, weak flow and lots of spatter. */
  private emit(dt: number, camera: THREE.Camera, eye: THREE.Vector3, inv: Inventory, tail = 0) {
    const cap = CAPS[inv.cap];
    const flow = tail > 0 ? 0.35 * tail : this.flow;
    this.carry += cap.rate * flow * dt;
    const count = Math.floor(this.carry);
    this.carry -= count;
    camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.crossVectors(right, forward);
    setHex(display, COLORS[inv.color]);
    const feel = FEEL.on;
    const spit = feel && FEEL.spitTime > 0 && this.holdT < FEEL.spitTime ? FEEL.spit * (1 - this.holdT / FEEL.spitTime) : 0;
    const low = Math.max(0, 1 - inv.pressure / PRESSURE.thinThreshold);
    const spatter = feel ? (low + (tail > 0 ? 2 : 0)) * FEEL.spatterLowPressure : 0;
    const cone = feel ? 1 / (1 + this.aimSpeed * FEEL.speedThin) : 1;
    if (feel && FEEL.brush) this.landing = this.brush.stroke({ eye, forward, cap, rgb: rgbOf(inv.color), flow, spit, spatter, dt });
    if (!count) return;
    const shown = this.particles.emit({ count, eye, nozzle: this.model.nozzleWorld(nozzle), forward, right, up, cap, flow, rgb: rgbOf(inv.color), display, spit, spatter, cone }) > 0;
    if (!(feel && FEEL.brush)) this.landing = shown;
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
