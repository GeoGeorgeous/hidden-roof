import * as THREE from 'three';
import { BUILD, PLAYER } from './config';
import type { Input } from './input';

// First-person controller: AABB player vs static AABB colliders, axis-separated
// resolution, step-up for low ledges, Minecraft-style ladder volumes.

export interface Ladder {
  volume: THREE.Box3;
  /** Horizontal direction pointing away from the wall the ladder is on. */
  normal: THREE.Vector3;
}

const wish = new THREE.Vector3();
const before = new THREE.Vector3();
const CROUCH_KEYS = ['ControlLeft', 'ControlRight', 'KeyC'];

export class Player {
  readonly position = new THREE.Vector3(); // feet
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  onLadder = false;
  /** Running fast enough to count as sprinting (widens the FOV). */
  sprinting = false;
  /** W double-tapped: running until W is let go, as holding Shift does. */
  private tapSprint = false;
  /** Time since W was last pressed (s). */
  private sinceW = Infinity;
  /** Distance walked, for footsteps. */
  stride = 0;
  onLand: (speed: number) => void = () => {};

  /** Build mode: free-fly without collisions. */
  fly = false;
  crouched = false;
  /** Crouch toggled on (PLAYER.crouchToggle). */
  private crouchOn = false;
  /** Current collider height (standing or crouched). */
  height = PLAYER.height;
  /** Eye height above the feet, eased between standing and crouched. */
  private eyeLevel = PLAYER.eyeHeight;
  /** Camera lag after stepping up/down, decays to 0 (smooth stairs). */
  private stepOffset = 0;
  private box = new THREE.Box3();
  private near: THREE.Box3[] = [];
  private spawn = new THREE.Vector3();
  private spawnYaw = 0;

  constructor(
    private colliders: THREE.Box3[],
    private ladders: Ladder[],
  ) {}

  setSpawn(p: THREE.Vector3, yaw: number) {
    this.spawn.copy(p);
    this.spawnYaw = yaw;
    this.respawn();
  }

  /** Move the spawn point without teleporting (build mode). */
  setSpawnPoint(p: THREE.Vector3, yaw: number) {
    this.spawn.copy(p);
    this.spawnYaw = yaw;
  }

  respawn() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = this.spawnYaw;
    this.pitch = 0;
    this.stepOffset = 0;
  }

  /** Camera position: feet + eased eye height + step smoothing. */
  eye(out: THREE.Vector3) {
    return out.copy(this.position).setY(this.position.y + this.eyeLevel + this.stepOffset);
  }

  /** Ctrl or C to crouch (held, or toggled with PLAYER.crouchToggle); you can't stand up under a low ceiling. */
  private updateCrouch(dt: number, input: Input) {
    if (!PLAYER.crouchToggle) this.crouchOn = false;
    else if (CROUCH_KEYS.some((k) => input.wasPressed(k))) this.crouchOn = !this.crouchOn;
    const want = PLAYER.crouchToggle ? this.crouchOn : CROUCH_KEYS.some((k) => input.isDown(k));
    if (want) {
      this.crouched = true;
      this.height = PLAYER.crouchHeight;
    } else if (this.crouched) {
      this.height = PLAYER.height;
      if (this.overlapping()) this.height = PLAYER.crouchHeight;
      else this.crouched = false;
    } else {
      this.height = PLAYER.height;
    }
    const target = this.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eyeLevel += (target - this.eyeLevel) * (1 - Math.exp(-PLAYER.crouchTransition * dt));
  }

  update(dt: number, input: Input) {
    this.yaw -= input.mouseDX * PLAYER.mouseSensitivity;
    this.pitch -= input.mouseDY * PLAYER.mouseSensitivity;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    let fwd = 0;
    let side = 0;
    if (input.isDown('KeyW')) fwd += 1;
    if (input.isDown('KeyS')) fwd -= 1;
    if (input.isDown('KeyD')) side += 1;
    if (input.isDown('KeyA')) side -= 1;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -Z at yaw 0.
    wish.set(-sin * fwd + cos * side, 0, -cos * fwd - sin * side);
    if (wish.lengthSq() > 1) wish.normalize();

    if (this.fly) {
      this.flyMove(dt, input, wish);
      return;
    }

    this.gatherNearby(dt);
    this.updateCrouch(dt, input);
    const ladder = this.findLadder();
    this.onLadder = !!ladder;

    this.sinceW += dt;
    if (input.wasPressed('KeyW')) {
      if (this.sinceW < PLAYER.sprintDoubleTap) this.tapSprint = true;
      this.sinceW = 0;
    }
    if (!input.isDown('KeyW')) this.tapSprint = false;
    const sprint = (input.isDown('ShiftLeft') || this.tapSprint) && fwd > 0 && !this.crouched && !ladder;
    const speed = this.crouched ? PLAYER.crouchSpeed : sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const moving = wish.lengthSq() > 0;
    // Ground (and ladders): accelerate toward the wished velocity, or brake with friction.
    // Air: only steer, scaled by air control; momentum is kept otherwise.
    const grip = this.onGround || !!ladder;
    const rate = grip ? (moving ? PLAYER.acceleration : PLAYER.friction) : moving ? PLAYER.acceleration * PLAYER.airControl : 0;
    const k = 1 - Math.exp(-rate * dt);
    this.velocity.x += (wish.x * speed - this.velocity.x) * k;
    this.velocity.z += (wish.z * speed - this.velocity.z) * k;
    this.sprinting = sprint && Math.hypot(this.velocity.x, this.velocity.z) > PLAYER.walkSpeed * 1.05;

    if (ladder) {
      // Minecraft-style: holding Space or moving into the ladder climbs, crouching
      // holds, otherwise slide down. Walking away from it simply walks off; facing doesn't matter.
      const into = -(wish.x * ladder.normal.x + wish.z * ladder.normal.z);
      if (input.isDown('Space') || into > 0.3) this.velocity.y = PLAYER.climbSpeed;
      else if (this.crouched && !this.onGround) this.velocity.y = 0;
      else this.velocity.y = Math.max(this.velocity.y - PLAYER.gravity * dt, -PLAYER.climbSpeed);
    } else {
      this.velocity.y -= PLAYER.gravity * dt;
    }
    // Jump off the ground; on a ladder Space climbs instead.
    if (this.onGround && !ladder && input.wasPressed('Space')) {
      this.velocity.y = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
      this.onGround = false;
    }

    const wasGround = this.onGround;
    const fallSpeed = -this.velocity.y;
    before.copy(this.position);
    this.onGround = false;
    // Substep to avoid tunneling through thin rails.
    const steps = Math.ceil((this.velocity.length() * dt) / 0.2) || 1;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(0, (this.velocity.x * dt) / steps, wasGround || this.onLadder);
      this.moveAxis(2, (this.velocity.z * dt) / steps, wasGround || this.onLadder);
      this.moveAxis(1, (this.velocity.y * dt) / steps, false);
    }
    if (this.onGround && !wasGround && fallSpeed > 2) this.onLand(fallSpeed);
    // Smooth stairs: while staying grounded, height changes are eased on the camera.
    if (wasGround && this.onGround) this.stepOffset += before.y - this.position.y;
    this.stepOffset = Math.max(-0.6, Math.min(0.6, this.stepOffset)) * Math.exp(-PLAYER.stepSmoothing * dt);
    if (this.onGround) {
      const dx = this.position.x - before.x;
      const dz = this.position.z - before.z;
      this.stride += Math.hypot(dx, dz);
    }

    if (this.position.y < PLAYER.killY) this.respawn();
  }

  private updateBox() {
    const r = PLAYER.radius;
    const p = this.position;
    this.box.min.set(p.x - r, p.y, p.z - r);
    this.box.max.set(p.x + r, p.y + this.height, p.z + r);
  }

  /** Free-fly for build mode: no gravity, no collisions. Space up, C down. */
  private flyMove(dt: number, input: Input, wish: THREE.Vector3) {
    const speed = input.isDown('ShiftLeft') ? BUILD.flySprintSpeed : BUILD.flySpeed;
    let up = 0;
    if (input.isDown('Space')) up += 1;
    if (input.isDown('KeyC')) up -= 1;
    this.velocity.set(wish.x * speed, up * speed, wish.z * speed);
    this.position.addScaledVector(this.velocity, dt);
    this.onGround = false;
    this.onLadder = false;
    this.sprinting = false;
  }

  /** Leaving fly mode inside geometry: pop up until free. */
  unstick() {
    this.gatherNearby(0, 60);
    for (let i = 0; i < 240 && this.overlapping(); i++) this.position.y += 0.25;
    this.velocity.set(0, 0, 0);
  }

  /** Broadphase: colliders near the player for this frame's moves. */
  private gatherNearby(dt: number, reach = 2) {
    const r = reach + this.velocity.length() * dt;
    const p = this.position;
    this.near.length = 0;
    for (const c of this.colliders) {
      if (c.max.x < p.x - r || c.min.x > p.x + r || c.max.z < p.z - r || c.min.z > p.z + r) continue;
      if (c.max.y < p.y - r || c.min.y > p.y + this.height + r) continue;
      this.near.push(c);
    }
  }

  private overlapping(): THREE.Box3 | null {
    this.updateBox();
    for (const c of this.near) if (this.box.intersectsBox(c) && !touching(this.box, c)) return c;
    return null;
  }

  private moveAxis(axis: 0 | 1 | 2, delta: number, canStep: boolean) {
    if (delta === 0) return;
    const p = this.position;
    p.setComponent(axis, p.getComponent(axis) + delta);
    const hit = this.overlapping();
    if (!hit) return;

    if (axis !== 1 && canStep && hit.max.y - p.y <= PLAYER.stepHeight && hit.max.y > p.y) {
      // Try stepping up onto the obstacle.
      const oldY = p.y;
      p.y = hit.max.y + 0.001;
      if (!this.overlapping()) {
        this.onGround = true;
        return;
      }
      p.y = oldY;
    }

    // Push out against the movement direction, using the deepest overlapping box.
    const r = PLAYER.radius;
    for (let guard = 0; guard < 4; guard++) {
      const c = this.overlapping();
      if (!c) break;
      if (axis === 1) {
        if (delta < 0) {
          p.y = c.max.y;
          this.onGround = true;
        } else {
          p.y = c.min.y - this.height;
        }
        this.velocity.y = 0;
      } else {
        const v = delta > 0 ? c.min.getComponent(axis) - r : c.max.getComponent(axis) + r;
        p.setComponent(axis, v);
        this.velocity.setComponent(axis, 0);
      }
    }
  }

  private findLadder(): Ladder | null {
    this.updateBox();
    for (const l of this.ladders) if (this.box.intersectsBox(l.volume)) return l;
    return null;
  }
}

/** Boxes that only share a face don't count as overlapping. */
function touching(a: THREE.Box3, b: THREE.Box3) {
  const e = 1e-4;
  return (
    a.max.x <= b.min.x + e ||
    a.min.x >= b.max.x - e ||
    a.max.y <= b.min.y + e ||
    a.min.y >= b.max.y - e ||
    a.max.z <= b.min.z + e ||
    a.min.z >= b.max.z - e
  );
}
