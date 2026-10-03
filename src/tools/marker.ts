import * as THREE from 'three';
import { COLORS, MARKER, type PaintColor } from '../config';
import type { Audio } from '../audio';
import type { Input } from '../input';
import { rgbOf } from '../inventory/items';
import { glove, segment, sleeve } from '../spray/hands';
import type { PaintSystem } from '../painting';

// Marker: draws a thin solid line straight into the surface texture under the
// crosshair, at close range, in the current color. No particles, no pressure.
// Fast mouse moves are filled by interpolating rays between frames. The band
// on the barrel shows the current color, like the can's label.

const dir = new THREE.Vector3();
const step = new THREE.Vector3();

export class MarkerTool {
  readonly model = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private tipModel = new THREE.Group();
  private prev: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private bandMat = new THREE.MeshLambertMaterial({ color: COLORS.black });

  constructor(
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    const black = new THREE.MeshLambertMaterial({ color: '#1a1a1e' });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), black);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 10), this.bandMat);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 8), black);
    band.position.y = 0.02;
    nib.position.y = 0.075;
    this.tipModel.add(body, band, nib, penGrip());
    this.sway.add(this.tipModel);
    this.model.add(this.sway);
  }

  update(input: Input, camera: THREE.Camera, eye: THREE.Vector3, active: boolean, color: PaintColor) {
    this.model.visible = active;
    this.bandMat.color.set(COLORS[color]);
    const drawing = active && input.lmb && input.locked;
    this.pose(camera, drawing);
    if (!drawing) {
      this.prev = null;
      this.audio.setScribble(0);
      return;
    }
    camera.getWorldDirection(dir);
    this.near.length = 0;
    for (const m of this.solids) {
      const bs = m.geometry.boundingSphere!;
      if (bs.center.distanceTo(eye) - bs.radius < MARKER.reach) this.near.push(m);
    }
    const from = this.prev ?? dir;
    const angle = from.angleTo(dir);
    const n = Math.min(32, Math.max(1, Math.ceil(angle / 0.003)));
    let drew = false;
    this.raycaster.far = MARKER.reach;
    for (let k = 1; k <= n; k++) {
      step.copy(from).lerp(dir, k / n).normalize();
      this.raycaster.set(eye, step);
      const hit = this.near.length ? this.raycaster.intersectObjects(this.near, false)[0] : undefined;
      const surface = hit && this.paint.get(hit.object);
      if (!hit || !surface) continue;
      this.paint.stamp(surface, hit.uv!, hit.faceIndex!, MARKER.radius, MARKER.strength, rgbOf(color), 0);
      drew = true;
    }
    this.prev = (this.prev ?? new THREE.Vector3()).copy(dir);
    this.audio.setScribble(drew ? Math.min(1, 0.15 + angle * 40) : 0);
  }

  /** A point just right of the marker, for the color tag (same place as the can's). */
  labelAnchor(out: THREE.Vector3) {
    this.model.updateMatrixWorld();
    return this.tipModel.localToWorld(out.set(0.05, 0.02, 0));
  }

  private pose(camera: THREE.Camera, drawing: boolean) {
    this.model.position.copy(camera.position);
    this.model.quaternion.copy(camera.quaternion);
    // Held like a pen; pushed forward while drawing. MARKER.holdDistance slides it
    // along the line from the eye, so it stays in the same spot on screen.
    const k = MARKER.holdDistance / 0.38;
    this.tipModel.position.set(0.16 * k, (-0.17 + (drawing ? 0.02 : 0)) * k, -MARKER.holdDistance - (drawing ? 0.04 : 0));
    this.tipModel.rotation.set(-1.1, 0.3, 0.25);
    this.tipModel.scale.setScalar(MARKER.holdScale);
  }
}

/**
 * Gloved hand holding the marker like a pen, in the marker's space (pen along
 * +y, nib up): curled fingers as one block beside the pen, index finger and
 * thumb pinching it near the nib, then cuff and sleeve. Simpler than the can hand.
 */
function penGrip() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.055), glove);
  fist.position.set(0.032, -0.03, 0.006);
  g.add(
    fist,
    segment(V(0.026, 0.004, -0.012), V(0.012, 0.03, -0.012), 0.016, glove), // index, knuckle to middle joint
    segment(V(0.012, 0.03, -0.012), V(0.0, 0.045, -0.008), 0.015, glove), // index tip on the pen
    segment(V(0.02, -0.02, 0.026), V(0.004, 0.028, 0.012), 0.018, glove), // thumb
    segment(V(0.04, -0.065, 0.01), V(0.06, -0.13, 0.03), 0.046, glove), // cuff
    segment(V(0.06, -0.13, 0.03), V(0.1, -0.38, 0.12), 0.07, sleeve),
  );
  return g;
}
