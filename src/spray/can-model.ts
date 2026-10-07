import * as THREE from 'three';
import { COLORS, HOLD, MODELS, VIEWMODEL, type CapId, type PaintColor } from '../config';
import { Hand } from './hands';
import { setHex } from '../hex-color';
import { inkify } from '../render/ink/tone';
import { applyHold } from '../tools/hold';
import { paintRandom } from '../lcg';
import { canShape, capSeat, capShape, disposeShape, inkLook } from '../tools/shapes';

// First-person spray can in a gloved hand (drawn in the view-model pass).
// group follows the camera -> sway (look lag, walk bob) -> body (rest pose,
// shake) -> can + cap + hand (tools/shapes.ts). The index finger presses the
// nozzle while LMB is held.

const PRESS_DEPTH = 0.004;
/** Cap middle height the hand's index finger is modeled for (hands.ts). */
const HAND_CAP = 0.117;

export class CanModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  private hand = new Hand();
  /** The label shows the paint color, so it keeps its color; everything else is ink. */
  private look = inkLook(inkify(new THREE.MeshLambertMaterial(), true));
  private can: THREE.Group | null = null;
  private cap: THREE.Group | null = null;
  private capId: CapId | null = null;
  private tip = new THREE.Object3D();
  private recoil = 0;
  private press = 0;
  /** Cap base height above the can's middle. */
  private capBase = 0;

  constructor() {
    this.body.add(this.hand.group);
    this.sway.add(this.body);
    this.group.add(this.sway);
    this.build();
  }

  /** (Re)build the can from MODELS, e.g. after tuning it in F3; the cap follows on the next setCan. */
  build() {
    if (this.can) disposeShape(this.can);
    this.can = canShape(this.look);
    this.body.add(this.can);
    this.capBase = capSeat();
    this.capId = null;
  }

  setCan(color: PaintColor, cap: CapId) {
    setHex((this.look.paint as THREE.MeshLambertMaterial).color, COLORS[color]);
    if (cap === this.capId) return;
    this.capId = cap;
    if (this.cap) disposeShape(this.cap);
    const c = capShape(cap, this.look);
    this.cap = c.group;
    this.tip = c.tip;
    this.body.add(this.cap);
  }

  /** pressing: trigger held (finger down); flowing: paint is coming out; shake: 0..1 progress or -1. */
  update(dt: number, camera: THREE.Camera, pressing: boolean, flowing: boolean, shake: number) {
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.recoil += ((flowing ? 1 : 0) - this.recoil) * Math.min(1, dt * 20);
    this.press += ((pressing ? 1 : 0) - this.press) * Math.min(1, dt * VIEWMODEL.pressSpeed);
    const sh = shake >= 0 ? Math.sin(shake * Math.PI * 8) * Math.sin(shake * Math.PI) : 0;
    // Seeded with the paint: particles leave from the nozzle, so the jitter changes when they land.
    const j = flowing ? (paintRandom.spray() - 0.5) * 0.0015 : 0;
    // Held at HOLD.can, plus shaking, recoil and jitter while spraying.
    const h = HOLD.can;
    applyHold(this.body, h, j, sh * 0.06 + j, this.recoil * 0.006);
    this.body.rotation.x += sh * 0.35;
    this.body.rotation.z += sh * 0.15;

    if (this.cap) this.cap.position.y = this.capBase - this.press * PRESS_DEPTH;
    this.hand.pose(this.press, VIEWMODEL.pressCurl, this.capBase + MODELS.cap.height / 2 - HAND_CAP);
  }

  nozzleWorld(out: THREE.Vector3) {
    this.group.updateMatrixWorld();
    return this.tip.getWorldPosition(out);
  }

  /** A point just right of the can, for the cap tag. */
  labelAnchor(out: THREE.Vector3) {
    this.group.updateMatrixWorld();
    return this.body.localToWorld(out.set(0.07, 0.06, 0));
  }
}
