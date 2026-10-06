import * as THREE from 'three';
import { AVATAR, PLAYER } from '../config';
import { Parts } from './parts';
import { FINGERS, SIDES, sign, type Rig, type Side } from './rig';
import { hoodie, pants, shoes, type Outfit } from './outfit';

// The figure itself: a slightly robotic head (visor and two eyes), the neck
// and gloved hands with fingers, plus what it wears (outfit.ts). One geometry,
// skinned to the rig (parts.ts).

/** Finger lengths against AVATAR.finger, index to pinky. */
const FINGER_LENGTH = [0.95, 1, 0.95, 0.8];

export function buildBody(rig: Rig, outfit: Outfit) {
  const p = new Parts(rig.index);
  head(p, rig);
  for (const s of SIDES) hand(p, rig, s);
  hoodie(p, rig, outfit);
  pants(p, rig);
  shoes(p, rig);
  return p.merge();
}

function head(p: Parts, rig: Rig) {
  const C = AVATAR.colors;
  const [w, h, d] = AVATAR.head;
  const eyes = PLAYER.eyeHeight;
  p.limb('neck', rig.at('neck'), rig.at('head'), [0.085, 0.085], [0.08, 0.08], C.head);
  p.box('head', [0, PLAYER.height - h / 2, 0.005], [w, h, d], C.head);
  // A narrower jaw, the visor plate with two eyes, and a bolt on either side.
  p.box('head', [0, PLAYER.height - h + 0.03, -0.012], [w * 0.86, 0.07, d * 0.9], C.head);
  p.box('head', [0, eyes, -d / 2 - 0.004], [w * 0.9, 0.075, 0.02], C.visor);
  for (const x of [-1, 1]) {
    p.box('head', [x * 0.042, eyes + 0.002, -d / 2 - 0.014], [0.034, 0.02, 0.012], C.eyes);
    p.box('head', [x * (w / 2 + 0.008), eyes - 0.015, 0.01], [0.018, 0.05, 0.05], C.trim);
  }
}

function hand(p: Parts, rig: Rig, s: Side) {
  const C = AVATAR.colors;
  const wrist = rig.at(`hand${s}`);
  p.box(`hand${s}`, [wrist.x, wrist.y - AVATAR.palm / 2, 0], [0.032, AVATAR.palm + 0.01, 0.088], C.glove);
  const [l1, l2] = AVATAR.finger;
  FINGERS.forEach((f, i) => {
    const k = FINGER_LENGTH[i];
    const a = rig.at(`${f}1${s}`);
    const b = a.clone().setY(a.y - l1 * k);
    p.limb(`${f}1${s}`, a, b, [0.02, 0.02], [0.019, 0.019], C.glove);
    p.limb(`${f}2${s}`, b, b.clone().setY(b.y - l2 * k), [0.019, 0.019], [0.017, 0.017], C.glove);
  });
  const t1 = rig.at(`thumb1${s}`);
  const t2 = rig.at(`thumb2${s}`);
  p.limb(`thumb1${s}`, t1, t2, [0.023, 0.023], [0.021, 0.021], C.glove);
  p.limb(`thumb2${s}`, t2, t2.clone().add(new THREE.Vector3(-sign(s) * 0.004, -0.026, -0.018)), [0.021, 0.021], [0.018, 0.018], C.glove);
}
