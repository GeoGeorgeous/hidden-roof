import * as THREE from 'three';
import { CAPS, COLORS, SPRAY } from '../config';
import type { Audio } from '../audio';
import type { Input } from '../input';
import type { Inventory } from '../inventory/inventory';
import { rgbOf } from '../inventory/items';
import type { PaintSystem } from '../painting';
import { CanModel } from './can-model';
import { Brush } from './brush';
import { lineWidth } from './dab';
import { SprayParticles, WallMemo } from './particles';
import { WallProbe } from './wall-probe';
import { setHex } from '../hex-color';

// Spraying: color and cap come from the inventory, the opacity from the player
// (BRUSH.opacity), and nothing runs out. Shaking (the right mouse button) is
// only its motion and sound.

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const display = new THREE.Color();

export class SprayTool {
  /** 1 while paint comes out of the can, else 0. */
  flow = 0;
  /** The spray is landing on paintable surface (not the sky, not out of reach): as of the last frame that sprayed. */
  landing = false;
  /** How wide the line would land now, on screen (CSS px): the crosshair's size. */
  linePx = 0;
  readonly model = new CanModel();
  readonly particles: SprayParticles;
  /** Other players' spray (net/remote-player.ts): seen only, their paint comes as paint ops. */
  readonly others: SprayParticles;
  private brush: Brush;
  /** The wall this can's own particles fly to. */
  private wall = new WallMemo();
  private carry = 0;
  /** Time into the current shake (s); -1 = not shaking. */
  private shakeT = -1;

  constructor(
    scene: THREE.Scene,
    paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    const probe = new WallProbe(solids, paint);
    this.brush = new Brush(probe, paint);
    this.particles = new SprayParticles(scene, probe);
    this.others = new SprayParticles(scene, probe);
  }

  /** `inv` is null when the can is put away (particles still finish flying). */
  update(dt: number, input: Input, camera: THREE.PerspectiveCamera, eye: THREE.Vector3, inv: Inventory | null) {
    this.model.group.visible = !!inv;
    this.particles.update(dt);
    this.others.update(dt);
    if (!inv) {
      this.flow = 0;
      this.stop();
      this.shakeT = -1;
      this.audio.setHiss(0, 0);
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
      this.audio.rattle();
    }
    if (this.shakeT >= 0) {
      this.shakeT += dt;
      // A shake ends its motion after RMB is let go; held, the next one starts.
      if (this.shakeT >= SPRAY.shakeDuration) {
        this.shakeT = holding ? this.shakeT - SPRAY.shakeDuration : -1;
        if (holding) this.audio.rattle();
      }
    }

    const spraying = lmb && !holding;
    this.flow = spraying ? 1 : 0;
    this.audio.setHiss(this.flow * cap.hissGain, cap.hissTone);

    this.model.update(dt, camera, spraying, spraying, this.shakeT >= 0 ? this.shakeT / SPRAY.shakeDuration : -1);
    camera.getWorldDirection(forward);
    if (spraying) this.emit(dt, camera, eye, inv);
    else this.stop();
    this.measure(camera, eye, inv);
  }

  /** The line on screen: a wall square-on at the aim's distance, or at the can's reach with none. */
  private measure(camera: THREE.PerspectiveCamera, eye: THREE.Vector3, inv: Inventory) {
    const distance = this.brush.distance({ eye, forward }, this.flow > 0) ?? SPRAY.reach;
    const view = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.linePx = Math.round((lineWidth(CAPS[inv.cap], distance, this.brush.speed) / view) * window.innerHeight);
  }

  /** Nothing comes out of the can. */
  private stop() {
    this.landing = false;
    this.brush.end();
    this.wall.age = Infinity;
  }

  /** Paint would land under the aim. */
  get reaches() {
    return this.brush.reaches;
  }

  /** Shaking the can (RMB) right now. */
  get shaking() {
    return this.shakeT >= 0;
  }

  private emit(dt: number, camera: THREE.Camera, eye: THREE.Vector3, inv: Inventory) {
    const cap = CAPS[inv.cap];
    this.landing = this.brush.spray({ eye, forward, cap, dt }, rgbOf(inv.color));
    this.carry += cap.rate * dt;
    const count = Math.floor(this.carry);
    this.carry -= count;
    if (!count) return;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.crossVectors(right, forward);
    setHex(display, COLORS[inv.color]);
    this.particles.show({ count, eye, nozzle: this.model.nozzleWorld(nozzle), forward, right, up, cap, display, dt, memo: this.wall });
  }
}
