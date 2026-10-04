import * as THREE from 'three';
import { HOLD } from '../config';
import { inkify } from '../render/ink/tone';
import { glove, segment, sleeve } from '../spray/hands';

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

  constructor() {
    const metal = inkify(new THREE.MeshLambertMaterial({ color: '#cfcfcf' }));
    const tread = inkify(new THREE.MeshLambertMaterial({ color: '#9aa0a6' }));
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // Folded A-frame: front frame (-z) and back frame (+z) meet at the top cap,
    // a hand's width apart at the feet. Rails along +y.
    const z = (frame: number, y: number) => frame * (0.006 + ((0.16 - y) / 0.36) * 0.03);
    for (const frame of [-1, 1]) {
      for (const x of [-0.045, 0.045]) this.body.add(segment(V(x, -0.2, z(frame, -0.2)), V(x, 0.16, z(frame, 0.16)), 0.01, metal));
    }
    // Treads on the front frame, a cross brace on the back one.
    for (const y of [-0.12, -0.02, 0.08]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.018), tread);
      t.position.set(0, y, z(-1, y) - 0.004);
      this.body.add(t);
    }
    this.body.add(segment(V(-0.045, -0.16, z(1, -0.16)), V(0.045, 0.1, z(1, 0.1)), 0.006, metal));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.036), tread);
    cap.position.y = 0.165;
    this.body.add(cap);
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
  }

  update(camera: THREE.Camera, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    // Held at HOLD.ladder (turned so both frames show).
    const h = HOLD.ladder;
    this.body.position.set(h.x * h.distance, h.y * h.distance, -h.distance);
    this.body.rotation.set(h.pitch, h.yaw, h.roll);
    this.body.scale.setScalar(h.scale);
  }
}
