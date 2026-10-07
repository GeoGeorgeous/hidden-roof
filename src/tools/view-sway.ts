import * as THREE from 'three';
import { PLAYER, VIEWMODEL } from '../config';

// Hand sway and bob for the first-person tools. Look movement makes the hands
// lag behind, walking bobs them in a figure eight, jumping lifts and dips them.
// The result is applied to a group between the camera and the held tool.

export interface Motion {
  velocity: THREE.Vector3;
  onGround: boolean;
}

export class ViewSway {
  private yaw = 0;
  private pitch = 0;
  private phase = 0;
  private bob = 0;
  private lift = 0;

  update(dt: number, mouseDX: number, mouseDY: number, motion: Motion, target: THREE.Object3D) {
    const v = VIEWMODEL;
    const ease = 1 - Math.exp(-v.swayReturn * dt);
    const clamp = (x: number) => Math.max(-v.swayMax, Math.min(v.swayMax, x));
    this.yaw = clamp(this.yaw + mouseDX * v.swayAmount) * (1 - ease);
    this.pitch = clamp(this.pitch + mouseDY * v.swayAmount) * (1 - ease);

    const speed = Math.hypot(motion.velocity.x, motion.velocity.z);
    const walking = motion.onGround ? Math.min(speed / PLAYER.walkSpeed, 1.6) : 0;
    this.phase += speed * v.bobFrequency * Math.PI * dt;
    this.bob += (walking - this.bob) * (1 - Math.exp(-8 * dt));
    this.lift += (-motion.velocity.y * v.fallLag - this.lift) * ease;

    const a = v.bobAmount * this.bob;
    target.position.set(Math.sin(this.phase) * a, -Math.abs(Math.cos(this.phase)) * a + Math.max(-v.fallLagMax, Math.min(v.fallLagMax, this.lift)), 0);
    target.rotation.set(this.pitch * 0.5, this.yaw, this.yaw * 0.5 + Math.sin(this.phase) * a * 2);
  }
}
