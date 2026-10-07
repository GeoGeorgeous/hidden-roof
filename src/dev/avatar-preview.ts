import * as THREE from 'three';
import { AVATAR, AVATAR_TEST, PLAYER, type PaintColor } from '../config';
import { Avatar } from '../avatar/avatar';
import type { AvatarState } from '../avatar/pose';
import type { Tool } from '../inventory/inventory';

// F3 -> Avatar: a test figure standing in front of you, facing you, to review
// the avatar in the level. It shows one pose at a time or cycles through them
// all, in slow motion if you like (AVATAR_TEST); moving poses go round a loop
// on the floor, so foot sliding shows, or run on the spot. Dev tools only,
// never saved.

interface Preset {
  name: string;
  /** Speed forward (m/s); on the spot. */
  speed?: number;
  sideways?: boolean;
  crouched?: boolean;
  air?: boolean;
  climb?: boolean;
  pitch?: number;
  tool?: Tool;
  action?: AvatarState['action'];
}

const POSES: Preset[] = [
  { name: 'idle' },
  { name: 'walk', speed: PLAYER.walkSpeed },
  { name: 'sprint', speed: PLAYER.sprintSpeed },
  { name: 'walk sideways', speed: PLAYER.walkSpeed * 0.7, sideways: true },
  { name: 'crouch', crouched: true },
  { name: 'crouch walk', crouched: true, speed: PLAYER.crouchSpeed },
  { name: 'jump', air: true },
  { name: 'climb', climb: true },
  { name: 'holding the can', tool: 'can' },
  { name: 'spray ahead', tool: 'can', action: 'spray' },
  { name: 'spray up', tool: 'can', action: 'spray', pitch: 0.6 },
  { name: 'spray down', tool: 'can', action: 'spray', pitch: -0.5 },
  { name: 'crouched spraying', tool: 'can', action: 'spray', crouched: true, pitch: -0.2 },
  { name: 'shake', tool: 'can', action: 'shake' },
  { name: 'marker', tool: 'marker', action: 'spray' },
  { name: 'roller', tool: 'roller', action: 'roll' },
  { name: 'sponge', tool: 'sponge', action: 'scrub' },
  { name: 'carrying the ladder', tool: 'ladder', speed: PLAYER.walkSpeed },
];
/** Seconds per pose when cycling. */
const CYCLE = 3;
const COLOR: PaintColor = 'pink';
export const POSE_COUNT = POSES.length;

export class AvatarPreview {
  private avatar: Avatar | null = null;
  private cycling = true;
  /** Time in this pose (slowed down with AVATAR_TEST.timeScale), and how far round the loop. */
  private t = 0;
  private around = 0;
  /** Where it stands and which way it faces there (toward you). */
  private center = new THREE.Vector3();
  private facing = 0;
  private state: AvatarState = { velocity: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouched: false, onLadder: false, tool: null, action: null };

  constructor(private scene: THREE.Scene) {}

  get label() {
    if (!this.avatar) return 'hidden';
    const slow = AVATAR_TEST.timeScale < 1 ? `, ${AVATAR_TEST.timeScale}x` : '';
    return `${this.index + 1} / ${POSES.length}: ${POSES[this.index].name}${this.cycling ? ' (cycling)' : ''}${slow}`;
  }

  private get index() {
    return Math.min(POSES.length - 1, Math.max(0, Math.round(AVATAR_TEST.pose)));
  }

  /** Show it a few meters in front of `feet`, facing back along `yaw` (the player's), or hide it. */
  toggle(feet: THREE.Vector3, yaw: number) {
    if (this.avatar) return this.hide();
    this.avatar = new Avatar();
    this.center.set(feet.x - Math.sin(yaw) * 2.6, feet.y, feet.z - Math.cos(yaw) * 2.6);
    this.facing = yaw + Math.PI;
    this.scene.add(this.avatar.group);
  }

  hide() {
    this.avatar?.dispose();
    this.avatar = null;
  }

  next() {
    this.pick(this.index + 1);
  }

  previous() {
    this.pick(this.index - 1);
  }

  /** Stop on a pose (AVATAR_TEST.pose by default: the slider moved). */
  pick(i = AVATAR_TEST.pose) {
    this.cycling = false;
    AVATAR_TEST.pose = (((Math.round(i) % POSES.length) + POSES.length) % POSES.length);
  }

  cycle() {
    this.cycling = true;
    this.t = 0;
  }

  /** It looks different now (AVATAR.hoodUp or the gray tones changed). */
  restyle() {
    this.avatar?.setOutfit({ hoodUp: AVATAR.hoodUp });
  }

  update(dt: number) {
    if (!this.avatar) return;
    dt *= AVATAR_TEST.timeScale;
    this.t += dt;
    if (this.cycling && this.t > CYCLE) {
      this.t = 0;
      AVATAR_TEST.pose = (this.index + 1) % POSES.length;
    }
    const p = POSES[this.index];
    const s = this.state;
    const speed = p.speed ? AVATAR_TEST.speed || p.speed : 0;
    const g = this.avatar.group;
    // Which way it goes: round the loop on the floor (so you can see if its feet slide), or on the spot facing you.
    let travel = this.facing;
    if (speed && !AVATAR_TEST.onTheSpot) {
      const R = AVATAR_TEST.loop;
      this.around += (speed / R) * dt;
      g.position.set(this.center.x + Math.sin(this.around) * R, this.center.y, this.center.z + Math.cos(this.around) * R);
      travel = Math.atan2(-Math.cos(this.around), Math.sin(this.around));
      s.yaw = travel + (p.sideways ? Math.PI / 2 : 0);
    } else {
      g.position.copy(this.center);
      s.yaw = this.facing;
      travel = this.facing - (p.sideways ? Math.PI / 2 : 0);
    }
    s.velocity.set(-Math.sin(travel) * speed, p.climb ? 1.2 : p.air ? 2 * Math.cos(this.t * 2.5) : 0, -Math.cos(travel) * speed);
    Object.assign(s, { pitch: (p.pitch ?? 0) + AVATAR_TEST.pitch, onGround: !p.air && !p.climb, crouched: !!p.crouched, onLadder: !!p.climb, tool: p.tool ?? null, action: p.action ?? null });
    this.avatar.update(dt, s, COLOR);
  }
}
