import * as THREE from 'three';
import { inkify } from '../render/ink/tone';
import { glove, segment, sleeve } from '../spray/hands';

// First-person view of the stepladder in hand: the folded ladder (two rails
// and its treads, like the pickup) held by its rail at the bottom right, the
// gloved hand gripping it like the marker's, cuff and sleeve going off screen.
// Drawn in ink like the can and marker.

const REST = new THREE.Vector3(0.24, -0.27, -0.5);

export class LadderModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();

  constructor() {
    const metal = inkify(new THREE.MeshLambertMaterial({ color: '#cfcfcf' }));
    const tread = inkify(new THREE.MeshLambertMaterial({ color: '#9aa0a6' }));
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // Folded: both frames side by side, rails along +y, treads across.
    for (const x of [-0.045, 0.045]) for (const z of [-0.006, 0.006]) this.body.add(segment(V(x, -0.2, z), V(x, 0.16, z), 0.01, metal));
    for (const y of [-0.12, -0.02, 0.08]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.02), tread);
      t.position.y = y;
      this.body.add(t);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.03), tread);
    cap.position.y = 0.165;
    this.body.add(cap);
    // The hand around the right rail, then cuff and sleeve.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), glove);
    fist.position.set(0.06, -0.02, 0.004);
    this.body.add(
      fist,
      segment(V(0.04, 0.01, -0.02), V(0.03, 0.01, 0.015), 0.016, glove), // thumb over the rail
      segment(V(0.07, -0.055, 0.01), V(0.09, -0.12, 0.04), 0.044, glove), // cuff
      segment(V(0.09, -0.12, 0.04), V(0.13, -0.38, 0.14), 0.07, sleeve),
    );
    this.body.position.copy(REST);
    this.body.rotation.set(0.15, -0.35, 0.18);
    this.sway.add(this.body);
    this.group.add(this.sway);
  }

  update(camera: THREE.Camera, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
  }
}
