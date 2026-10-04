import * as THREE from 'three';
import { BRUSH, HOLD } from '../config';
import { inkify } from '../render/ink/tone';
import { glove, segment, sleeve } from '../spray/hands';
import { brushShape } from './brush-shape';

// First-person view of the scrub brush in hand: the gloved fist around its
// handle, bristles toward the wall, cuff and sleeve going off screen.
// Drawn in ink like the other tools (no color: it's not a paint tool). While
// cleaning it presses forward and scrubs in small circles.

export class BrushModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  private shape: THREE.Group | null = null;
  private push = 0;
  private scrubT = 0;

  constructor() {
    this.build();
    this.sway.add(this.body);
    this.group.add(this.sway);
  }

  /** (Re)build from BRUSH.model, e.g. after tuning it in F3. */
  build() {
    if (this.shape) {
      this.body.remove(this.shape);
      this.shape.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const m = BRUSH.model;
    const wood = inkify(new THREE.MeshLambertMaterial({ color: m.wood }));
    const bristles = inkify(new THREE.MeshLambertMaterial({ color: m.bristles }));
    const { group: s, handleEnd: end, handleDir: dir } = brushShape(wood, bristles);
    // The fist around the end of the handle, then cuff and sleeve carrying on along it.
    const at = (t: number, x = 0) => end.clone().addScaledVector(dir, t).setX(x);
    s.add(
      segment(at(-0.045), at(0.02), 0.048, glove), // fist
      segment(at(0.02, -0.005), at(0.07, -0.02), 0.05, glove), // cuff
      segment(at(0.07, -0.02), at(0.3, -0.2), 0.075, sleeve), // bending down out of view
    );
    // Turned so the bristles face forward (-z) and the handle comes back and down toward you.
    s.rotation.x = Math.PI / 2;
    const turned = new THREE.Group();
    turned.add(s);
    this.body.add(turned);
    this.shape = turned;
  }

  /** `scrubbing`: pressed to a surface. */
  update(dt: number, camera: THREE.Camera, active: boolean, scrubbing: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.push += ((scrubbing ? 1 : 0) - this.push) * Math.min(1, dt * 14);
    if (scrubbing) this.scrubT += dt * BRUSH.scrubSpeed * Math.PI * 2;
    const r = BRUSH.scrubSize * this.push;
    // Held at HOLD.brush; pushed to the wall and scrubbing in circles while cleaning.
    const h = HOLD.brush;
    this.body.position.set(h.x * h.distance + Math.cos(this.scrubT) * r, h.y * h.distance + Math.sin(this.scrubT) * r, -h.distance - this.push * 0.08);
    this.body.rotation.set(h.pitch, h.yaw, h.roll);
    this.body.scale.setScalar(h.scale);
  }
}
