import * as THREE from 'three';
import { COLORS, HOLD, MODELS, type PaintColor } from '../config';
import { inkify } from '../render/ink/tone';
import { setHex } from '../hex-color';
import { glove, segment, sleeve } from '../spray/hands';
import { applyHold } from './hold';
import { disposeShape, inkLook, rollerShape } from './shapes';

// First-person view of the paint roller in hand: a wide graffiti roller, its
// cover soaked in the current paint color (keeps its color, like the can's
// label), on a bent wire frame with a short pole held in the gloved fist.
// The cover is as long as the stroke is wide (the player's roller width) and spins as
// it rolls (tools/shapes.ts). Drawn in ink like the can.

export class RollerModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  /** The roller (tools/shapes.ts), rebuilt for a new width; its cover spins about the axle (x). */
  private shape: ReturnType<typeof rollerShape> | null = null;
  private width = 0;
  private look = inkLook(inkify(new THREE.MeshLambertMaterial({ color: COLORS.black }), true));
  private push = 0;

  constructor() {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // The fist around the pole, then cuff and sleeve going off screen.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.05), glove);
    fist.position.set(0.012, -0.36, 0.004);
    this.body.add(
      fist,
      segment(V(0.025, -0.41, 0.01), V(0.04, -0.47, 0.02), 0.05, glove), // cuff
      segment(V(0.04, -0.47, 0.02), V(0.1, -0.74, 0.06), 0.075, sleeve),
    );
    this.sway.add(this.body);
    this.group.add(this.sway);
  }

  /** (Re)build the roller from MODELS at this width, e.g. after tuning it in F3. */
  build(width = this.width) {
    if (this.shape) disposeShape(this.shape.group);
    this.width = width;
    this.shape = rollerShape(this.look, width);
    this.body.add(this.shape.group);
  }

  /** `width`: the stroke's (m); `rolled`: meters rolled since last frame (spins the cover); `pressing`: on a wall. */
  update(dt: number, camera: THREE.Camera, active: boolean, color: PaintColor, width: number, pressing: boolean, rolled: number) {
    this.group.visible = active;
    if (!active) return;
    setHex((this.look.paint as THREE.MeshLambertMaterial).color, COLORS[color]);
    if (width !== this.width) this.build(width);
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.shape!.cover.rotation.x -= rolled / (MODELS.roller.coverThickness / 2);
    // Held at HOLD.roller; pushed out to the wall while rolling.
    this.push += ((pressing ? 1 : 0) - this.push) * Math.min(1, dt * 14);
    const h = HOLD.roller;
    applyHold(this.body, h, 0, 0, -this.push * 0.06);
  }

  /** A point just right of the roller head, for the color tag. */
  labelAnchor(out: THREE.Vector3) {
    this.group.updateMatrixWorld();
    return this.body.localToWorld(out.set(this.width / 2 + 0.06, 0, 0));
  }
}
