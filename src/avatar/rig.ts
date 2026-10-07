import * as THREE from 'three';
import { AVATAR, PLAYER } from '../config';

// The figure's skeleton. Bones sit at their rest joints (standing, arms down,
// facing -z, its right toward +x) with no rest rotation, so a bone's rotation
// is its pose: x swings a limb forward (a leg, an arm) or tips the body
// forward, z swings it out to the side.

export type Side = 'L' | 'R';
export const SIDES: Side[] = ['L', 'R'];
/** +1 on the figure's right (+x), -1 on its left. */
export const sign = (s: Side) => (s === 'R' ? 1 : -1);
export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
/** Where each finger leaves the palm, front (-z) to back. */
const FINGER_Z = [-0.03, -0.01, 0.01, 0.028];

export interface Rig {
  root: THREE.Bone;
  skeleton: THREE.Skeleton;
  bone(name: string): THREE.Bone;
  /** A bone's index in the skeleton (what its parts are skinned to). */
  index(name: string): number;
  /** A joint's rest position in the figure's space (feet at the origin). */
  at(name: string): THREE.Vector3;
}

/** Every joint: name, parent, rest position. */
function joints(): [string, string | null, number[]][] {
  const A = AVATAR;
  const wrist = A.shoulder - A.upperArm - A.forearm;
  const knuckles = wrist - A.palm;
  const list: [string, string | null, number[]][] = [
    ['root', null, [0, 0, 0]],
    ['hips', 'root', [0, A.hip, 0]],
    ['spine', 'hips', [0, A.waist, 0]],
    ['chest', 'spine', [0, A.chest, 0]],
    ['neck', 'chest', [0, A.neck, 0]],
    ['head', 'neck', [0, PLAYER.height - A.head[1], 0]],
  ];
  for (const s of SIDES) {
    const x = sign(s) * A.shoulderSide;
    const hx = sign(s) * A.hipSide;
    list.push(
      [`upperArm${s}`, 'chest', [x, A.shoulder, 0]],
      [`forearm${s}`, `upperArm${s}`, [x, A.shoulder - A.upperArm, 0]],
      [`hand${s}`, `forearm${s}`, [x, wrist, 0]],
      [`thumb1${s}`, `hand${s}`, [x - sign(s) * 0.012, wrist - 0.03, -0.035]],
      [`thumb2${s}`, `thumb1${s}`, [x - sign(s) * 0.014, wrist - 0.06, -0.056]],
      [`thigh${s}`, 'hips', [hx, A.hip, 0]],
      [`shin${s}`, `thigh${s}`, [hx, (A.hip + A.ankle) / 2, 0]],
      [`foot${s}`, `shin${s}`, [hx, A.ankle, 0]],
    );
    FINGERS.forEach((f, i) => {
      list.push([`${f}1${s}`, `hand${s}`, [x, knuckles, FINGER_Z[i]]], [`${f}2${s}`, `${f}1${s}`, [x, knuckles - A.finger[0], FINGER_Z[i]]]);
    });
  }
  return list;
}

export function makeRig(): Rig {
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Vector3>();
  const list: THREE.Bone[] = [];
  for (const [name, parent, pos] of joints()) {
    const b = new THREE.Bone();
    b.name = name;
    const p = new THREE.Vector3(...pos);
    rest.set(name, p);
    b.position.copy(p);
    if (parent) {
      b.position.sub(rest.get(parent)!);
      bones.get(parent)!.add(b);
    }
    bones.set(name, b);
    list.push(b);
  }
  const get = (name: string) => {
    const b = bones.get(name);
    if (!b) throw new Error(`no bone ${name}`);
    return b;
  };
  return {
    root: get('root'),
    skeleton: new THREE.Skeleton(list),
    bone: get,
    index: (name) => list.indexOf(get(name)),
    at: (name) => rest.get(name)!.clone(),
  };
}
