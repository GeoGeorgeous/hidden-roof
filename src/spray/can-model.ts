import * as THREE from 'three';
import { CAN_SIZES, CAPS, COLORS, VIEWMODEL, type CanSize, type CapId, type PaintColor } from '../config';
import { Hand } from './hands';
import { setHex } from '../hex-color';
import { inkify } from '../render/ink/tone';

// First-person spray can in a gloved hand (drawn in the view-model pass).
// group follows the camera -> sway (look lag, walk bob) -> body (rest pose,
// shake) -> can + hand. The index finger presses the nozzle while LMB is held.

const REST = new THREE.Vector3(0.2, -0.22, -0.5);
const CAP_TOP = 0.124;
const PRESS_DEPTH = 0.004;
/** Nozzle size per cap (it hints at the cap). */
const NOZZLE: Record<CapId, number> = { skinny: 0.7, standard: 1, fat: 1.7, spray: 2.2 };

export class CanModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  private can = new THREE.Group();
  private hand = new Hand();
  /** The label shows the paint color, so it keeps its color; everything else is ink. */
  private labelMat = inkify(new THREE.MeshLambertMaterial(), true);
  private capMat = inkify(new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
  private cap: THREE.Mesh;
  private nozzle: THREE.Mesh;
  private tip = new THREE.Object3D();
  private recoil = 0;
  private press = 0;
  private capLift = 0;

  constructor() {
    const silver = inkify(new THREE.MeshLambertMaterial({ color: '#d8d8d8' }));
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.17, 12), silver);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.09, 12), this.labelMat);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.033, 0.025, 12), inkify(new THREE.MeshLambertMaterial({ color: '#c0c0c0' })));
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 8), this.capMat);
    this.nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: '#202020' }));
    label.position.y = -0.01;
    shoulder.position.y = 0.0975;
    this.can.add(shell, label, shoulder);
    this.body.add(this.can, this.cap, this.nozzle, this.tip, this.hand.group);
    this.sway.add(this.body);
    this.group.add(this.sway);
  }

  setCan(color: PaintColor, size: CanSize, cap: CapId) {
    setHex(this.labelMat.color, COLORS[color]);
    const s = CAN_SIZES[size].scale;
    this.can.scale.set(1, s, 1);
    this.capLift = CAP_TOP * (s - 1);
    const n = NOZZLE[cap];
    this.nozzle.scale.set(n, n, 1);
    setHex(this.capMat.color, CAPS[cap].color);
  }

  /** pressing: trigger held (finger down); flowing: paint is coming out; shake: 0..1 progress or -1. */
  update(dt: number, camera: THREE.Camera, pressing: boolean, flowing: boolean, shake: number) {
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.recoil += ((flowing ? 1 : 0) - this.recoil) * Math.min(1, dt * 20);
    this.press += ((pressing ? 1 : 0) - this.press) * Math.min(1, dt * VIEWMODEL.pressSpeed);
    const sh = shake >= 0 ? Math.sin(shake * Math.PI * 8) * Math.sin(shake * Math.PI) : 0;
    const j = flowing ? (Math.random() - 0.5) * 0.0015 : 0;
    this.body.position.set(REST.x + j, REST.y + sh * 0.06 + j, REST.z + this.recoil * 0.006);
    this.body.rotation.set(-0.12 + sh * 0.35, 0.25, 0.08 + sh * 0.15);

    const top = this.capLift - this.press * PRESS_DEPTH;
    this.cap.position.y = 0.117 + top;
    this.nozzle.position.set(0, 0.119 + top, -0.009);
    this.tip.position.set(0, 0.119 + top, -0.012);
    this.hand.pose(this.press, VIEWMODEL.pressCurl, this.capLift);
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
