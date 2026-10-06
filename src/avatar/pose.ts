import * as THREE from 'three';
import { AVATAR, PLAYER } from '../config';
import type { Tool } from '../inventory/inventory';
import { reachArm } from './arm-ik';
import { FINGERS, SIDES, sign, type Rig, type Side } from './rig';

// Poses the figure from its state, the same state multiplayer sends (speed,
// on the ground, crouched, on a ladder, look pitch, tool, action). Nothing is
// a canned clip: legs reach for foot targets with two-bone IK, so knees bend
// the way knees do; the walk phase follows the distance moved, so feet don't
// slide; arms blend between a few poses, and reach with IK when they work (the
// can aimed with a bent elbow, the roller, the sponge). Each part eases toward
// its target (AVATAR.blend), so changes never snap.
// Signs: a bone's +x rotation swings a limb hanging down forward, and tips one
// pointing up (the body, the head) back.

export type AvatarAction = 'spray' | 'shake' | 'roll' | 'scrub' | null;

export interface AvatarState {
  /** World velocity (m/s). */
  velocity: THREE.Vector3;
  /** Facing (the look yaw, radians, as Player.yaw). */
  yaw: number;
  /** Look pitch (radians, up is positive). */
  pitch: number;
  onGround: boolean;
  crouched: boolean;
  onLadder: boolean;
  tool: Tool | null;
  action: AvatarAction;
}

interface Arm {
  x: number;
  z: number;
  elbow: number;
  wrist: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const L1 = (AVATAR.hip - AVATAR.ankle) / 2;
const L2 = L1;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const mixArm = (a: Arm, b: Arm, k: number): Arm => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, elbow: a.elbow + (b.elbow - a.elbow) * k, wrist: a.wrist + (b.wrist - a.wrist) * k });
/** Finger curls (first and second segment) for a grip on each tool, and with none. */
const GRIP: Record<Tool | 'none', [number, number]> = { none: [0.35, 0.45], can: [1.15, 1.0], marker: [1.4, 1.25], ladder: [1.3, 1.2], roller: [1.4, 1.3], sponge: [0.8, 0.6] };

export class Pose {
  /** Walk cycle phase (radians), and the climb's. */
  private phase = 0;
  private climbPhase = 0;
  private t = 0;
  /** Eased weights of each layer (0..1). */
  private k = { walk: 0, sprint: 0, crouch: 0, air: 0, climb: 0, hold: 0, carry: 0, aim: 0, shake: 0, roll: 0, scrub: 0 };
  private dir = new THREE.Vector2(0, 1);
  private local = new THREE.Vector3();
  private curl = { R: [0.35, 0.45], L: [0.35, 0.45], index: [0.35, 0.45] };
  /** How far the chest is tipped (its x rotation from the root: negative is forward), which arms hanging from it make up for. */
  private tilt = 0;
  private aim = new THREE.Vector3();
  private right = new THREE.Vector3();
  private target = new THREE.Vector3();
  private pole = new THREE.Vector3();

  constructor(private rig: Rig) {}

  update(dt: number, s: AvatarState) {
    this.t += dt;
    const k = this.k;
    // Velocity in the figure's frame: x to its right, z forward.
    this.local.copy(s.velocity).applyAxisAngle(UP, -s.yaw);
    const fwd = -this.local.z;
    const side = this.local.x;
    const speed = Math.hypot(fwd, side);
    if (speed > 0.3) this.dir.set(side / speed, fwd / speed);
    const moving = s.onGround && !s.onLadder ? clamp(speed / PLAYER.walkSpeed, 0, 1) : 0;
    const ease = (key: keyof typeof k, target: number) => (k[key] += (target - k[key]) * (1 - Math.exp(-AVATAR.blend * dt)));
    ease('walk', moving);
    ease('sprint', s.onGround ? clamp((speed - PLAYER.walkSpeed) / (PLAYER.sprintSpeed - PLAYER.walkSpeed), 0, 1) : 0);
    ease('crouch', s.crouched ? 1 : 0);
    ease('air', !s.onGround && !s.onLadder ? 1 : 0);
    ease('climb', s.onLadder ? 1 : 0);
    ease('hold', s.tool && s.tool !== 'ladder' ? 1 : 0);
    ease('carry', s.tool === 'ladder' ? 1 : 0);
    ease('aim', s.action === 'spray' ? 1 : 0);
    ease('shake', s.action === 'shake' ? 1 : 0);
    ease('roll', s.action === 'roll' ? 1 : 0);
    ease('scrub', s.action === 'scrub' ? 1 : 0);
    // A step is half a cycle; steps get longer the faster you go.
    const step = AVATAR.step + AVATAR.stepPerSpeed * Math.max(0, speed - PLAYER.walkSpeed);
    if (s.onGround) this.phase += ((speed * dt) / step) * Math.PI;
    if (s.onLadder) this.climbPhase += ((Math.abs(s.velocity.y) * dt) / 0.3) * Math.PI;

    // Crouched and spraying, the body leans back a little instead.
    const lean = k.crouch * (AVATAR.crouchLean + (AVATAR.crouchSprayLean - AVATAR.crouchLean) * k.aim) + k.sprint * AVATAR.sprintLean;
    this.body(lean, s.pitch);
    for (const sd of SIDES) {
      this.leg(sd, this.rig.bone('hips').rotation.x);
      this.arm(sd, s);
      this.hand(dt, sd, s);
    }
    this.reach(s);
  }

  private body(lean: number, pitch: number) {
    const r = this.rig;
    const k = this.k;
    const bob = k.walk * (0.025 + 0.02 * k.sprint) * Math.abs(Math.cos(this.phase));
    r.bone('hips').position.y = AVATAR.hip - k.crouch * AVATAR.crouchDrop - bob - k.climb * 0.05;
    // Leaning forward bends the body at the hips and the spine; looking up straightens it a little.
    const hips = -lean * 0.35;
    const spine = -lean * 0.3 + pitch * 0.1 * k.aim;
    const chest = -lean * 0.35 + pitch * 0.15;
    r.bone('hips').rotation.set(hips, 0.08 * k.walk * Math.sin(this.phase), 0);
    r.bone('spine').rotation.set(spine, -0.1 * k.walk * Math.sin(this.phase), 0);
    r.bone('chest').rotation.set(chest, 0, 0);
    this.tilt = hips + spine + chest;
    // The head looks where the player looks, whatever the body does.
    r.bone('neck').rotation.set(pitch * 0.2 + lean * 0.4, 0, 0);
    r.bone('head').rotation.set(pitch * 0.55 + lean * 0.6 - pitch * 0.1 * k.aim, 0, 0);
  }

  /** Two-bone IK toward the foot's target, below the hip joint. `hipsPitch`: the hips' x rotation (negative tips them forward). */
  private leg(sd: Side, hipsPitch: number) {
    const r = this.rig;
    const k = this.k;
    const sg = sign(sd);
    const psi = this.phase + (sd === 'R' ? 0 : Math.PI);
    const reach = (AVATAR.step / 2) * Math.sin(psi) * k.walk * (1 + 0.6 * k.sprint);
    let lift = Math.max(0, Math.cos(psi)) * AVATAR.stepLift * k.walk * (1 + k.sprint);
    let forward = reach * this.dir.y;
    let out = reach * this.dir.x + sg * 0.04 * k.crouch;
    // Crouching: one foot a little ahead. In the air: tucked, one leg forward. Climbing: on the rungs, alternating.
    forward += k.crouch * (sd === 'R' ? 0.12 : -0.04);
    forward += k.air * (sd === 'R' ? 0.16 : -0.06);
    lift += k.air * (sd === 'R' ? 0.22 : 0.1);
    const climb = Math.sin(this.climbPhase + (sd === 'R' ? 0 : Math.PI));
    forward += k.climb * 0.2;
    lift += k.climb * (0.12 + 0.18 * Math.max(0, climb));
    out *= 1 - k.climb;
    const hipH = r.bone('hips').position.y;
    const down = Math.max(0.05, hipH - AVATAR.ankle - lift);
    const thigh = r.bone(`thigh${sd}`);
    thigh.rotation.z = Math.atan2(out, down);
    const h = Math.hypot(down, out);
    const d = clamp(Math.hypot(forward, h), 0.05, L1 + L2 - 1e-4);
    const swing = Math.atan2(forward, h) - hipsPitch;
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    thigh.rotation.x = swing + a;
    r.bone(`shin${sd}`).rotation.x = -knee;
    // The foot stays flat, and points its toe down a little as it lifts.
    r.bone(`foot${sd}`).rotation.x = -(hipsPitch + thigh.rotation.x - knee) - lift * 1.2;
  }

  /** The arm's pose from angles: hanging and swinging, holding, carrying, spraying, shaking, climbing. */
  private arm(sd: Side, s: AvatarState) {
    const k = this.k;
    const sg = sign(sd);
    const swing = -0.45 * Math.sin(this.phase + (sd === 'R' ? 0 : Math.PI)) * k.walk * (1 + 0.5 * k.sprint);
    // Arms hang straight down whatever the body's lean (-tilt makes up for it).
    const hang = -this.tilt * 0.85;
    let p: Arm = { x: swing + hang, z: sg * (0.13 + 0.35 * k.air), elbow: 0.12 + 0.15 * k.walk + 1.1 * k.sprint, wrist: 0 };
    if (sd === 'R') {
      const w = this.t;
      p = mixArm(p, { x: 0.3 + hang, z: sg * 0.12, elbow: 1.25, wrist: -0.2 }, k.hold);
      // Carrying the folded ladder level at the side, by its top rail.
      p = mixArm(p, { x: hang, z: sg * 0.2, elbow: 0.15, wrist: -0.15 }, k.carry);
      // Spraying: the arm straight out along the look, a little in toward the middle; the can stands up in the fist.
      p = mixArm(p, { x: Math.PI / 2 + s.pitch - this.tilt, z: -sg * 0.12, elbow: 0.08, wrist: 0 }, k.aim);
      p = mixArm(p, { x: 0.55 + hang, z: -sg * 0.18, elbow: 1.7 + 0.35 * Math.sin(w * 38), wrist: 0.3 * Math.sin(w * 38) }, k.shake);
    }
    const climb = Math.sin(this.climbPhase + (sd === 'R' ? Math.PI : 0));
    p = mixArm(p, { x: 2.5 + 0.3 * climb - this.tilt, z: sg * 0.15, elbow: 0.55 - 0.35 * climb, wrist: -0.3 }, k.climb);
    const r = this.rig;
    r.bone(`upperArm${sd}`).rotation.set(p.x, 0, p.z);
    r.bone(`forearm${sd}`).rotation.set(p.elbow, 0, 0);
    r.bone(`hand${sd}`).rotation.set(p.wrist, 0, 0);
  }

  /**
   * The right arm at work with the roller (pushed up and down) and the
   * sponge (small circles), by IK: the elbow bends out and down.
   */
  private reach(s: AvatarState) {
    const k = this.k;
    const weight = Math.min(1, k.roll + k.scrub);
    if (weight < 0.001) return;
    const cp = Math.cos(s.pitch);
    this.aim.set(-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp);
    this.right.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const w = this.t;
    // From the shoulder: ahead along the look and a little in toward the middle.
    this.rig.bone('upperArmR').getWorldPosition(this.target);
    this.target.addScaledVector(this.aim, 0.44 * k.roll + 0.46 * k.scrub).addScaledVector(this.right, -0.06 * weight);
    this.target.y += k.roll * 0.12 * Math.sin(w * 5);
    this.target.addScaledVector(this.right, k.scrub * 0.06 * Math.cos(w * 10)).y += k.scrub * 0.06 * Math.sin(w * 10);
    this.pole.copy(this.right).multiplyScalar(0.8).y -= 1;
    reachArm(this.rig, 'R', this.target, this.pole, this.aim, weight);
  }

  /** Fingers: relaxed, or gripping the tool in hand (and the ladder's rungs while climbing); the index on the nozzle while spraying. */
  private hand(dt: number, sd: Side, s: AvatarState) {
    const r = this.rig;
    const sg = sign(sd);
    const want = this.k.climb > 0.5 ? GRIP.ladder : sd === 'R' ? GRIP[s.tool ?? 'none'] : GRIP.none;
    const idx = sd === 'R' && s.action === 'spray' ? [0.45, 0.7] : want;
    const e = 1 - Math.exp(-AVATAR.blend * 1.5 * dt);
    const c = this.curl[sd];
    const ci = sd === 'R' ? this.curl.index : c;
    for (let i = 0; i < 2; i++) {
      c[i] += (want[i] - c[i]) * e;
      if (sd === 'R') ci[i] += (idx[i] - ci[i]) * e;
    }
    FINGERS.forEach((f, i) => {
      const [a, b] = f === 'index' ? ci : c;
      // Each finger a little more than the one in front of it, like a real fist.
      r.bone(`${f}1${sd}`).rotation.set(0, 0, -sg * a * (1 + i * 0.04));
      r.bone(`${f}2${sd}`).rotation.set(0, 0, -sg * b);
    });
    r.bone(`thumb1${sd}`).rotation.set(-c[0] * 0.35, 0, -sg * c[0] * 0.55);
    r.bone(`thumb2${sd}`).rotation.set(0, 0, -sg * c[1] * 0.6);
  }
}
