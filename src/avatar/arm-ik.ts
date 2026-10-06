import * as THREE from 'three';
import { AVATAR } from '../config';
import type { Rig, Side } from './rig';

// Two-bone IK for an arm: the wrist goes to a target in world space, the elbow
// bends toward a pole (out and down, like a real arm holding something up in
// front), and the hand turns so what it holds points along `aim`. Blended over
// the arm's current pose by `weight`.

const L1 = AVATAR.upperArm;
const L2 = AVATAR.forearm;
const shoulder = new THREE.Vector3();
const dir = new THREE.Vector3();
const elbow = new THREE.Vector3();
const side = new THREE.Vector3();
const x = new THREE.Vector3();
const y = new THREE.Vector3();
const z = new THREE.Vector3();
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const parent = new THREE.Quaternion();
const local = new THREE.Vector3();
const toWrist = new THREE.Vector3();

export function reachArm(rig: Rig, sd: Side, target: THREE.Vector3, pole: THREE.Vector3, aim: THREE.Vector3, weight: number) {
  const upper = rig.bone(`upperArm${sd}`);
  const fore = rig.bone(`forearm${sd}`);
  const hand = rig.bone(`hand${sd}`);
  upper.parent!.updateWorldMatrix(true, false);
  upper.getWorldPosition(shoulder);
  dir.subVectors(target, shoulder);
  const d = Math.min(Math.max(dir.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  dir.normalize();
  // The elbow: on the circle of points L1 from the shoulder and L2 from the wrist, on the pole's side.
  const along = (L1 * L1 + d * d - L2 * L2) / (2 * d);
  side.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  elbow.copy(shoulder).addScaledVector(dir, along).addScaledVector(side, Math.sqrt(Math.max(0, L1 * L1 - along * along)));
  // The upper arm runs along its -y to the elbow and bends the forearm toward its -z.
  y.subVectors(shoulder, elbow).normalize();
  toWrist.subVectors(target, elbow);
  z.copy(toWrist).addScaledVector(y, -toWrist.dot(y)).normalize().negate();
  x.crossVectors(y, z);
  q.setFromRotationMatrix(m.makeBasis(x, y, z));
  upper.parent!.getWorldQuaternion(parent);
  upper.quaternion.slerp(parent.invert().multiply(q), weight);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  fore.rotation.x += (bend - fore.rotation.x) * weight;
  fore.rotation.y *= 1 - weight;
  fore.rotation.z *= 1 - weight;
  // The hand: its -z (the can's top) along the aim, turned only at the wrist.
  fore.updateWorldMatrix(true, false);
  fore.getWorldQuaternion(parent);
  local.copy(aim).applyQuaternion(parent.invert());
  hand.rotation.x += (Math.atan2(local.y, -local.z) - hand.rotation.x) * weight;
}
