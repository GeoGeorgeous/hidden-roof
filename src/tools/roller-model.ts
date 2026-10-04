import * as THREE from 'three';
import { COLORS, HOLD, ROLLER, type PaintColor } from '../config';
import { inkify } from '../render/ink/tone';
import { setHex } from '../hex-color';
import { glove, segment, sleeve } from '../spray/hands';

// First-person view of the paint roller in hand: a wide graffiti roller, its
// cover soaked in the current paint color (keeps its color, like the can's
// label), on a bent wire frame with a short pole held in the gloved fist.
// The cover is as long as the stroke is wide (ROLLER.halfWidth) and spins as
// it rolls; a dark seam along it shows the turning. Drawn in ink like the can.

/** The cover's radius and the length it's modeled at (scaled to 2 x ROLLER.halfWidth). */
const RADIUS = 0.04;
const LENGTH = 0.44;

export class RollerModel {
  readonly group = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private body = new THREE.Group();
  /** The cover (and its seam), spinning about the axle (x). */
  private cover = new THREE.Group();
  private coverMat = inkify(new THREE.MeshLambertMaterial({ color: COLORS.black }), true);
  private push = 0;

  constructor() {
    const metal = inkify(new THREE.MeshLambertMaterial({ color: '#cfcfcf' }));
    const black = inkify(new THREE.MeshLambertMaterial({ color: '#1a1a1e' }));
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // Cover along x, centered on the axle; a dark seam along it shows it turning.
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 16), this.coverMat);
    roll.rotation.z = Math.PI / 2;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(LENGTH * 0.98, 0.006, 0.006), black);
    seam.position.y = RADIUS;
    this.cover.add(roll, seam);
    // End caps, then the wire frame: out of the right end, down, and in to the pole under the middle.
    const end = LENGTH / 2;
    for (const x of [-end - 0.004, end + 0.004]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10), metal);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = x;
      this.cover.add(cap);
    }
    const w = end + 0.025;
    this.body.add(
      segment(V(end, 0, 0), V(w, 0, 0), 0.008, metal),
      segment(V(w, 0, 0), V(w, -0.09, 0), 0.008, metal),
      segment(V(w, -0.09, 0), V(0, -0.2, 0), 0.008, metal),
      segment(V(0, -0.2, 0), V(0, -0.24, 0), 0.014, metal), // ferrule
      segment(V(0, -0.24, 0), V(0, -0.44, 0), 0.026, black), // short pole
    );
    // The fist around the pole, then cuff and sleeve going off screen.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.05), glove);
    fist.position.set(0.012, -0.36, 0.004);
    this.body.add(
      fist,
      segment(V(0.025, -0.41, 0.01), V(0.04, -0.47, 0.02), 0.05, glove), // cuff
      segment(V(0.04, -0.47, 0.02), V(0.1, -0.74, 0.06), 0.075, sleeve),
    );
    this.body.add(this.cover);
    this.sway.add(this.body);
    this.group.add(this.sway);
  }

  /** `rolled`: meters rolled since last frame (spins the cover); `pressing`: on a wall. */
  update(dt: number, camera: THREE.Camera, active: boolean, color: PaintColor, pressing: boolean, rolled: number) {
    this.group.visible = active;
    if (!active) return;
    setHex(this.coverMat.color, COLORS[color]);
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.cover.scale.x = (ROLLER.halfWidth * 2) / LENGTH;
    this.cover.rotation.x -= rolled / RADIUS;
    // Held at HOLD.roller; pushed out to the wall while rolling.
    this.push += ((pressing ? 1 : 0) - this.push) * Math.min(1, dt * 14);
    const h = HOLD.roller;
    this.body.position.set(h.x * h.distance, h.y * h.distance, -h.distance - this.push * 0.06);
    this.body.rotation.set(h.pitch, h.yaw, h.roll);
    this.body.scale.setScalar(h.scale);
  }

  /** A point just right of the roller head, for the color tag. */
  labelAnchor(out: THREE.Vector3) {
    this.group.updateMatrixWorld();
    return this.body.localToWorld(out.set(LENGTH / 2 + 0.06, 0, 0));
  }
}
