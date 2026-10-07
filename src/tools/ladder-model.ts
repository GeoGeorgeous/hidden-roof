import * as THREE from 'three';
import { HOLD } from '../config';
import { glove, segment, sleeve } from '../spray/hands';
import { applyHold } from './hold';
import { disposeShape, inkLook, ladderShape } from './shapes';

// First-person view of the stepladder in hand: the folded A-frame (like the
// pickup) at the bottom right, both frames showing: the front one with its
// treads, the back one braced, hinged together at the top cap and a little
// apart at the feet. The gloved hand closes around the right rails of both,
// cuff and sleeve going off screen.
// Drawn in ink like the can and marker.

export class LadderModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  private shape: THREE.Group | null = null;

  constructor() {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // The hand around the right rails of both frames, then cuff and sleeve.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.07), glove);
    fist.position.set(0.062, -0.02, 0);
    this.body.add(
      fist,
      segment(V(0.04, 0.01, -0.035), V(0.03, 0.01, 0.03), 0.016, glove), // fingers across both rails
      segment(V(0.07, -0.055, 0.01), V(0.09, -0.12, 0.04), 0.044, glove), // cuff
      segment(V(0.09, -0.12, 0.04), V(0.13, -0.38, 0.14), 0.07, sleeve),
    );
    this.sway.add(this.body);
    this.group.add(this.sway);
    this.build();
  }

  /** (Re)build the ladder from MODELS, e.g. after tuning it in F3. */
  build() {
    if (this.shape) disposeShape(this.shape);
    this.shape = ladderShape(inkLook(glove));
    this.body.add(this.shape);
  }

  update(camera: THREE.Camera, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    // Held at HOLD.ladder (turned so both frames show).
    const h = HOLD.ladder;
    applyHold(this.body, h);
  }
}
