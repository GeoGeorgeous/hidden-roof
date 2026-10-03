import * as THREE from 'three';

// First-person gloved hand gripping the spray can, built from box segments in
// the can's local space (can axis = +y, nozzle facing -z, camera behind +z).
// Middle, ring and pinky fingers wrap the front of the can, the thumb wraps the
// back, the index finger arches over the cap and pivots at the knuckle to press
// the nozzle. Neutral grays only (gloves + sleeve).

const CAN_R = 0.033;
export const glove = new THREE.MeshLambertMaterial({ color: '#75787e' });
export const sleeve = new THREE.MeshLambertMaterial({ color: '#3c3f44' });
const UP = new THREE.Vector3(0, 1, 0);

/** Point on a circle around the can axis: angle 0 = back (+z), 90° = right (+x), 180° = front. */
function around(deg: number, y: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** Box from a to b with a square cross-section (a finger bone, a forearm). */
export function segment(a: THREE.Vector3, b: THREE.Vector3, thick: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, d.length() + thick * 0.6, thick), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/** Chain of segments through the points. */
export function chain(points: THREE.Vector3[], thick: number, mat = glove) {
  const g = new THREE.Group();
  for (let i = 1; i < points.length; i++) g.add(segment(points[i - 1], points[i], thick, mat));
  return g;
}

export class Hand {
  readonly group = new THREE.Group();
  private index = new THREE.Group();
  private indexBase = new THREE.Vector3();

  constructor() {
    const r = CAN_R + 0.009;
    // Palm on the back-right of the can.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.022), glove);
    palm.position.copy(around(60, -0.012, CAN_R + 0.013));
    palm.rotation.y = (60 * Math.PI) / 180;
    this.group.add(palm);

    // Three fingers wrapping the front.
    [-0.002, -0.026, -0.05].forEach((y, i) => {
      const end = 205 - i * 8;
      this.group.add(chain([around(95, y, r + 0.004), around(135, y, r), around(170, y, r), around(end, y - 0.002, r - 0.002)], 0.017));
    });
    // Thumb around the back-left.
    this.group.add(chain([around(30, -0.03, r + 0.006), around(-5, 0.0, r + 0.002), around(-40, 0.012, r)], 0.019));

    // Index finger: knuckle at the top of the palm, over the shoulder, pad on the cap.
    this.indexBase.copy(around(98, 0.032, r + 0.003));
    const k = this.indexBase;
    const pts = [new THREE.Vector3(0.042, 0.032, -0.006), new THREE.Vector3(0.03, 0.1, -0.012), new THREE.Vector3(0.013, 0.135, -0.011), new THREE.Vector3(-0.004, 0.133, -0.009)];
    const finger = chain(pts.map((p) => p.sub(k)), 0.016);
    this.index.add(finger);
    this.index.position.copy(k);
    this.group.add(this.index);

    // Cuff and sleeve, out toward the bottom-right of the screen.
    this.group.add(segment(around(55, -0.05, CAN_R + 0.012), new THREE.Vector3(0.07, -0.12, 0.08), 0.042, glove));
    this.group.add(segment(new THREE.Vector3(0.07, -0.12, 0.08), new THREE.Vector3(0.14, -0.3, 0.32), 0.07, sleeve));
  }

  /**
   * press 0..1 curls the index finger down onto the nozzle.
   * capLift: how far the cap top sits above its default height (bigger cans).
   */
  pose(press: number, curl: number, capLift: number) {
    this.index.position.copy(this.indexBase).setY(this.indexBase.y + capLift);
    this.index.rotation.z = press * curl;
  }
}
