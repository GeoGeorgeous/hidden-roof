import * as THREE from 'three';
import { HOLD, MODELS, SPONGE } from '../config';
import { glove, segment, sleeve } from '../spray/hands';
import { disposeShape, inkLook, spongeShape } from './shapes';
import { applyHold } from './hold';

// First-person view of the sponge in hand, held like the can: the gloved hand
// behind it with the fingers over its top and the thumb under it, scouring pad
// toward the wall; cuff and sleeve leave toward the bottom right exactly like
// the can's, so switching tools keeps the arm where it was. Drawn in ink like
// the other tools (no color: it's not a paint tool). While cleaning it presses
// forward and scrubs in small circles.

export class SpongeModel {
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

  /** (Re)build from MODELS.sponge, e.g. after tuning it in F3. */
  build() {
    if (this.shape) disposeShape(this.shape);
    const m = MODELS.sponge;
    const s = spongeShape(inkLook(glove));
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const w = m.width / 2;
    const h = m.height / 2;
    const d = m.depth / 2;
    // Palm flat on the back of the right half, fingers over the top, thumb under it.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 1.3, 0.018), glove);
    palm.position.set(w * 0.4, -h * 0.15, d + 0.009);
    s.add(palm);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.05 + i * 0.3);
      s.add(segment(V(x, h * 0.55, d + 0.012), V(x, h + 0.006, d * 0.2), 0.014, glove));
    }
    s.add(segment(V(w * 0.85, -h * 0.6, d + 0.01), V(w * 0.55, -h - 0.006, 0), 0.015, glove)); // thumb
    // Where the can's grip is, so the arm is the can's: same cuff and sleeve, same place on screen.
    s.position.y = SPONGE.gripHeight;
    const held = new THREE.Group();
    const wrist = V(w * 0.55, SPONGE.gripHeight - h * 0.75, d + 0.02);
    held.add(s, segment(wrist, V(0.07, -0.12, 0.08), 0.042, glove), segment(V(0.07, -0.12, 0.08), V(0.14, -0.3, 0.32), 0.07, sleeve));
    this.body.add(held);
    this.shape = held;
  }

  /** `scrubbing`: pressed to a surface. */
  update(dt: number, camera: THREE.Camera, active: boolean, scrubbing: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.push += ((scrubbing ? 1 : 0) - this.push) * Math.min(1, dt * 14);
    if (scrubbing) this.scrubT += dt * SPONGE.scrubSpeed * Math.PI * 2;
    const r = SPONGE.scrubSize * this.push;
    // Held at HOLD.sponge; pushed to the wall and scrubbing in circles while cleaning.
    const h = HOLD.sponge;
    applyHold(this.body, h, Math.cos(this.scrubT) * r, Math.sin(this.scrubT) * r, -this.push * 0.08);
  }
}
