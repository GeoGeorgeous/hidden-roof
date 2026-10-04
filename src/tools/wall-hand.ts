import * as THREE from 'three';
import { WALL_HAND } from '../config';
import { chain, glove, segment, sleeve } from '../spray/hands';
import { solidsNear } from '../level/solids';

// The free left hand is only shown while it touches a wall: hidden otherwise,
// it comes in from below the view. A fan of level rays from the left shoulder
// (WALL_HAND.fromAngle..toAngle to the left of where you look) looks for a
// wall; the hand goes to the most forward ray that reaches one within `reach`
// (so it lands where you can see it, not out at your side) and rests flat on
// it. Beyond `release`, or once the wall leaves the fan, it goes back out of
// view. The hand stays planted where it landed and only slides when that spot
// drifts too far, like a hand leaning on a wall. Drawn in the view-model pass
// with the other hand.

const UP = new THREE.Vector3(0, 1, 0);

const dir = new THREE.Vector3();
const y = new THREE.Vector3();
const x = new THREE.Vector3();
const basis = new THREE.Matrix4();
const restPos = new THREE.Vector3();
const restQuat = new THREE.Quaternion();
const touchQuat = new THREE.Quaternion();
const tilt = new THREE.Quaternion();
const euler = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);
const RAYS = 7;
const shoulder = new THREE.Vector3();
const fwd = new THREE.Vector3();
const left = new THREE.Vector3();

export class WallHand {
  readonly group = new THREE.Group();
  private hand = new THREE.Group();
  private arm = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private anchor = new THREE.Vector3();
  private normal = new THREE.Vector3(0, 0, 1);
  private touching = false;
  private t = 0;

  constructor(private solids: THREE.Mesh[]) {
    // Local frame: palm on the z = 0 plane facing -z (the wall), fingers +y,
    // thumb +x (left hand seen from behind), forearm back toward the viewer.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.024), glove);
    palm.position.set(0, 0, 0.012);
    this.hand.add(palm);
    const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
    [
      [-0.03, 0.058],
      [-0.01, 0.074],
      [0.01, 0.08],
      [0.03, 0.072],
    ].forEach(([fx, len]) => this.hand.add(chain([V(fx, 0.04, 0.01), V(fx, 0.04 + len * 0.55, 0.012), V(fx * 1.1, 0.04 + len, 0.009)], 0.017)));
    this.hand.add(chain([V(0.035, -0.025, 0.014), V(0.06, 0.0, 0.013), V(0.075, 0.03, 0.01)], 0.019));
    // Forearm on its own wrist joint: straight along -y, bent back by `wristBend`.
    this.arm.position.set(0, -0.04, 0.016);
    this.arm.add(segment(V(0, 0, 0), V(0, -0.085, 0), 0.045, glove), segment(V(0, -0.085, 0), V(0, -0.36, 0), 0.07, sleeve));
    this.hand.add(this.arm);
    this.group.add(this.hand);
    this.group.visible = false;
  }

  /** `sway`: the other hand's sway/bob offsets (camera space), applied while hanging. */
  update(dt: number, camera: THREE.Camera, eye: THREE.Vector3, enabled: boolean, sway?: THREE.Object3D) {
    const W = WALL_HAND;
    shoulder.copy(eye).y -= W.drop;
    const hit = enabled ? this.findWall(camera, this.touching ? W.release : W.reach) : null;
    if (this.touching) {
      if (!hit || shoulder.distanceTo(this.anchor) > W.release) this.touching = false;
      else if (this.anchor.distanceTo(hit.point) > W.slide) {
        this.anchor.lerp(hit.point, 1 - Math.exp(-W.speed * dt));
        this.normal.lerp(hit.normal, 1 - Math.exp(-W.speed * dt)).normalize();
      }
    } else if (hit) {
      this.touching = true;
      this.anchor.copy(hit.point);
      this.normal.copy(hit.normal);
    }
    this.t += ((this.touching ? 1 : 0) - this.t) * (1 - Math.exp(-W.speed * dt));
    if (!enabled) this.t = 0;
    this.group.visible = enabled && this.t > 0.01;
    if (!this.group.visible) return;

    // Touch pose: palm flat on the wall, fingers up and leaning a little inward.
    y.copy(UP).addScaledVector(this.normal, -UP.dot(this.normal));
    if (y.lengthSq() < 1e-4) y.set(0, 0, -1);
    y.normalize();
    x.crossVectors(y, this.normal);
    basis.makeBasis(x, y, this.normal);
    touchQuat.setFromRotationMatrix(basis).multiply(tilt.setFromAxisAngle(Z, -W.fingerLean));
    // Rest pose: out of view below the lower left, swaying with the other hand.
    restPos.set(...W.restOffset);
    restQuat.copy(camera.quaternion);
    if (sway) {
      restPos.add(sway.position);
      restQuat.multiply(tilt.setFromEuler(sway.rotation));
    }
    restPos.applyMatrix4(camera.matrixWorld);
    restQuat.multiply(tilt.setFromEuler(euler.set(...W.restRotation)));

    const k = this.t * this.t * (3 - 2 * this.t);
    this.hand.position.copy(restPos).lerp(dir.copy(this.anchor).addScaledVector(this.normal, W.gap), k);
    this.hand.quaternion.copy(restQuat).slerp(touchQuat, k);
    this.arm.rotation.x = THREE.MathUtils.lerp(W.restWristBend, W.wallWristBend, k);
  }

  /** The most forward wall hit in the fan of level rays from the left shoulder, within `limit`. */
  private findWall(camera: THREE.Camera, limit: number) {
    const W = WALL_HAND;
    if (!solidsNear(this.solids, shoulder, W.release, this.near).length) return null;
    camera.getWorldDirection(fwd).setY(0).normalize();
    left.set(fwd.z, 0, -fwd.x);
    this.raycaster.far = limit;
    for (let i = 0; i < RAYS; i++) {
      const a = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(W.fromAngle, W.toAngle, i / (RAYS - 1)));
      dir.copy(fwd).multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a));
      this.raycaster.set(shoulder, dir);
      const hit = this.raycaster.intersectObjects(this.near, false)[0];
      // Meshes live at the origin, so face normals are in world space. Walls only.
      if (hit?.face && Math.abs(hit.face.normal.y) <= 0.6) return { point: hit.point, normal: hit.face.normal.clone() };
    }
    return null;
  }
}
