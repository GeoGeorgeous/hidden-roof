import * as THREE from 'three';
import { AVATAR, PLAYER, type PaintColor } from '../config';
import { Avatar } from '../avatar/avatar';
import type { AvatarState } from '../avatar/pose';
import type { Tool } from '../inventory/inventory';

// F3 -> Avatar: a test figure standing in front of you, facing you, to review
// the avatar in the level. It shows one pose at a time or cycles through them
// all; moving poses run on the spot. Dev tools only, never saved.

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

export class AvatarPreview {
  private avatar: Avatar | null = null;
  private index = 0;
  private cycling = true;
  private t = 0;
  private state: AvatarState = { velocity: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouched: false, onLadder: false, tool: null, action: null };

  constructor(private scene: THREE.Scene) {}

  get label() {
    return this.avatar ? `${POSES[this.index].name}${this.cycling ? ' (cycling)' : ''}` : 'hidden';
  }

  /** Show it a few meters in front of `feet`, facing back along `yaw` (the player's), or hide it. */
  toggle(feet: THREE.Vector3, yaw: number) {
    if (this.avatar) return this.hide();
    this.avatar = new Avatar();
    this.avatar.group.position.set(feet.x - Math.sin(yaw) * 2.6, feet.y, feet.z - Math.cos(yaw) * 2.6);
    this.state.yaw = yaw + Math.PI;
    this.scene.add(this.avatar.group);
  }

  hide() {
    this.avatar?.dispose();
    this.avatar = null;
  }

  next() {
    this.cycling = false;
    this.index = (this.index + 1) % POSES.length;
  }

  cycle() {
    this.cycling = true;
    this.t = 0;
  }

  /** A new outfit (AVATAR.hoodUp changed). */
  restyle() {
    this.avatar?.setOutfit({ hoodUp: AVATAR.hoodUp });
  }

  update(dt: number) {
    if (!this.avatar) return;
    this.t += dt;
    if (this.cycling && this.t > CYCLE) {
      this.t = 0;
      this.index = (this.index + 1) % POSES.length;
    }
    const p = POSES[this.index];
    const s = this.state;
    const speed = p.speed ?? 0;
    // Its own forward is -z turned by yaw; sideways is to its right.
    const a = s.yaw + (p.sideways ? -Math.PI / 2 : 0);
    s.velocity.set(-Math.sin(a) * speed, p.climb ? 1.2 : p.air ? 2 * Math.cos(this.t * 2.5) : 0, -Math.cos(a) * speed);
    Object.assign(s, { pitch: p.pitch ?? 0, onGround: !p.air && !p.climb, crouched: !!p.crouched, onLadder: !!p.climb, tool: p.tool ?? null, action: p.action ?? null });
    this.avatar.update(dt, s, COLOR);
  }
}
