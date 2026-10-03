import * as THREE from 'three';
import { PLAYER } from './config';
import type { Input } from './input';

// First-person controller: AABB player vs static AABB colliders, axis-separated
// resolution, step-up for low ledges, ladder volumes that switch off gravity.

export interface Ladder {
  volume: THREE.Box3;
  /** Horizontal direction pointing away from the wall the ladder is on. */
  normal: THREE.Vector3;
}

export class Player {
  readonly position = new THREE.Vector3(); // feet
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  onLadder = false;
  /** Distance walked, for footsteps. */
  stride = 0;
  onLand: (speed: number) => void = () => {};

  private box = new THREE.Box3();
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

  respawn() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = this.spawnYaw;
    this.pitch = 0;
  }

  eye(out: THREE.Vector3) {
    return out.copy(this.position).setY(this.position.y + PLAYER.eyeHeight);
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
    const wish = new THREE.Vector3(-sin * fwd + cos * side, 0, -cos * fwd - sin * side);
    if (wish.lengthSq() > 1) wish.normalize();

    const ladder = this.findLadder();
    this.onLadder = !!ladder;

    if (ladder) {
      // Climb: W goes up unless looking clearly down. Gravity off.
      const dir = this.pitch < -0.45 ? -1 : 1;
      this.velocity.y = fwd * dir * PLAYER.climbSpeed;
      const speed = PLAYER.walkSpeed * 0.6;
      this.velocity.x = wish.x * speed;
      this.velocity.z = wish.z * speed;
      if (input.wasPressed('Space')) {
        this.velocity.copy(ladder.normal).multiplyScalar(3.5);
        this.velocity.y = 4;
      }
    } else {
      const speed = input.isDown('ShiftLeft') ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const accel = this.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
      const k = 1 - Math.exp(-accel * dt);
      this.velocity.x += (wish.x * speed - this.velocity.x) * k;
      this.velocity.z += (wish.z * speed - this.velocity.z) * k;
      this.velocity.y -= PLAYER.gravity * dt;
      if (this.onGround && input.wasPressed('Space')) {
        this.velocity.y = PLAYER.jumpSpeed;
        this.onGround = false;
      }
    }

    const wasGround = this.onGround;
    const fallSpeed = -this.velocity.y;
    const before = this.position.clone();
    this.onGround = false;
    // Substep to avoid tunneling through thin rails.
    const steps = Math.ceil((this.velocity.length() * dt) / 0.2) || 1;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(0, (this.velocity.x * dt) / steps, wasGround || this.onLadder);
      this.moveAxis(2, (this.velocity.z * dt) / steps, wasGround || this.onLadder);
      this.moveAxis(1, (this.velocity.y * dt) / steps, false);
    }
    if (this.onGround && !wasGround && fallSpeed > 2) this.onLand(fallSpeed);
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
    this.box.max.set(p.x + r, p.y + PLAYER.height, p.z + r);
  }

  private overlapping(): THREE.Box3 | null {
    this.updateBox();
    for (const c of this.colliders) if (this.box.intersectsBox(c) && !touching(this.box, c)) return c;
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
          p.y = c.min.y - PLAYER.height;
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
