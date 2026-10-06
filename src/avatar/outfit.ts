import * as THREE from 'three';
import { AVATAR, PLAYER } from '../config';
import type { Parts } from './parts';
import { SIDES, sign, type Rig } from './rig';

// What the figure wears, as rigid parts on its bones (no cloth): a loose
// hoodie down to just below the waist (hood up or down, rounded shoulders, a
// kangaroo pocket, drawstrings), pants that
// widen toward the cuff, chunky sneakers. Other outfits can replace these
// without touching the body.

export interface Outfit {
  hoodUp: boolean;
}

const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export function hoodie(p: Parts, rig: Rig, outfit: Outfit) {
  const A = AVATAR;
  const C = A.colors;
  // Above the hip joints, so the legs swing under it.
  const hem = A.waist - 0.09;
  // Body: a loose box from the hem to the shoulders, hanging from the spine and the chest.
  p.limb('spine', v(0, hem, 0.005), v(0, A.chest, 0.005), [0.41, 0.3], [0.4, 0.3], C.hoodie);
  p.limb('chest', v(0, A.chest - 0.01, 0.005), v(0, A.neck, 0), [0.4, 0.3], [0.33, 0.26], C.hoodie);
  p.box('spine', [0, hem + 0.02, 0.005], [0.415, 0.05, 0.31], C.trim);
  p.box('spine', [0, hem + 0.11, -0.157], [0.25, 0.12, 0.02], C.pocket);
  for (const x of [-1, 1]) p.box('chest', [x * 0.045, A.neck - 0.09, -0.137], [0.012, 0.13, 0.012], C.sole);
  if (outfit.hoodUp) {
    // Around the head, open in front.
    const top = PLAYER.height;
    const [w, , d] = A.head;
    p.box('head', [0, top + 0.022, 0.02], [w + 0.06, 0.045, d + 0.06], C.hoodie);
    p.box('head', [0, top - 0.13, d / 2 + 0.03], [w + 0.06, 0.3, 0.05], C.hoodie);
    for (const x of [-1, 1]) p.box('head', [x * (w / 2 + 0.02), top - 0.12, 0.005], [0.035, 0.27, d + 0.04], C.hoodie);
    p.box('chest', [0, A.neck + 0.03, 0.05], [0.27, 0.1, 0.2], C.hoodie);
  } else {
    // Down: bunched behind the neck.
    p.box('chest', [0, A.neck + 0.025, 0.1], [0.29, 0.1, 0.13], C.hoodie, [-0.35, 0, 0]);
    p.box('chest', [0, A.neck + 0.01, -0.05], [0.2, 0.045, 0.07], C.trim);
  }
  for (const s of SIDES) {
    const shoulder = rig.at(`upperArm${s}`);
    const elbow = rig.at(`forearm${s}`);
    const wrist = rig.at(`hand${s}`);
    // A round shoulder on the side of the hoodie's body, no higher than its top, so it rounds the corner without a bump.
    p.ball(`upperArm${s}`, [shoulder.x + sign(s) * 0.008, shoulder.y - 0.05, 0], [0.15, 0.14, 0.165], C.hoodie, [10, 8]);
    p.limb(`upperArm${s}`, shoulder, elbow, [0.135, 0.135], [0.125, 0.125], C.hoodie);
    p.box(`forearm${s}`, [elbow.x, elbow.y, 0], [0.125, 0.07, 0.125], C.hoodie);
    p.limb(`forearm${s}`, elbow, wrist.clone().setY(wrist.y + 0.02), [0.125, 0.125], [0.13, 0.13], C.hoodie);
    p.box(`forearm${s}`, [wrist.x, wrist.y + 0.03, 0], [0.105, 0.05, 0.105], C.trim);
  }
}

export function pants(p: Parts, rig: Rig) {
  const A = AVATAR;
  const C = A.colors;
  p.box('hips', [0, A.hip + 0.01, 0.005], [0.33, 0.17, 0.24], C.pants);
  for (const s of SIDES) {
    const hip = rig.at(`thigh${s}`);
    const knee = rig.at(`shin${s}`);
    const ankle = rig.at(`foot${s}`);
    // A round hip, so the thigh turns in it without its corners poking out.
    p.ball(`thigh${s}`, [hip.x, hip.y, 0.005], [0.17, 0.16, 0.19], C.pants);
    p.limb(`thigh${s}`, hip, knee, [0.165, 0.185], [0.145, 0.16], C.pants);
    p.box(`shin${s}`, [knee.x, knee.y, 0], [0.145, 0.07, 0.16], C.pants);
    p.limb(`shin${s}`, knee, ankle.clone().setY(ankle.y + 0.04), [0.14, 0.155], [0.16, 0.17], C.pants);
    p.box(`shin${s}`, [ankle.x, ankle.y + 0.06, 0], [0.17, 0.06, 0.18], C.pants);
  }
}

export function shoes(p: Parts, rig: Rig) {
  const C = AVATAR.colors;
  for (const s of SIDES) {
    const x = rig.at(`foot${s}`).x;
    p.box(`foot${s}`, [x, 0.075, -0.045], [0.115, 0.1, 0.27], C.shoe);
    p.box(`foot${s}`, [x, 0.13, 0.03], [0.1, 0.05, 0.1], C.shoe);
    p.box(`foot${s}`, [x, 0.02, -0.045], [0.125, 0.04, 0.29], C.sole);
  }
}
