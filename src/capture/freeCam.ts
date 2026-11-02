import * as THREE from 'three';
import { CAPTURE, PLAYER } from '../config';
import type { Input } from '../input';

// Capture mode's camera: it flies where it looks, through everything. Its keys
// (CAPTURE.keys) move it, the mouse turns it at the player's sensitivity and
// the chosen smoothing, the wheel sets the speed.

const K = CAPTURE.keys;
const move = new THREE.Vector3();
const axis = (input: Input, plus: string, minus: string) => (input.isDown(plus) ? 1 : 0) - (input.isDown(minus) ? 1 : 0);

export class FreeCam {
  private position = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  /** Where the mouse has turned to; the view follows at the smoothing. */
  private aimYaw = 0;
  private aimPitch = 0;
  speed = CAPTURE.speed;
  private smoothStep = CAPTURE.smoothingStart;

  /** The mouse smoothing (s; 0 none). */
  get smoothing() {
    return CAPTURE.smoothing[this.smoothStep];
  }

  /** Starts where `camera` is, looking where it looks (rotation in YXZ, as main.ts sets it). */
  from(camera: THREE.Camera) {
    this.position.copy(camera.position);
    this.aimPitch = this.pitch = camera.rotation.x;
    this.aimYaw = this.yaw = camera.rotation.y;
  }

  /** Moves by this frame's input and puts `camera` there; `dt` 0 holds it still. */
  update(dt: number, input: Input, camera: THREE.Camera) {
    this.smoothStep = THREE.MathUtils.clamp(this.smoothStep + (input.wasTyped(K.smoothMore) ? 1 : 0) - (input.wasTyped(K.smoothLess) ? 1 : 0), 0, CAPTURE.smoothing.length - 1);
    this.aimYaw -= input.mouseDX * PLAYER.mouseSensitivity;
    this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - input.mouseDY * PLAYER.mouseSensitivity, -1.55, 1.55);
    const follow = this.smoothing > 0 ? 1 - Math.exp(-dt / this.smoothing) : 1;
    this.yaw += (this.aimYaw - this.yaw) * follow;
    this.pitch += (this.aimPitch - this.pitch) * follow;
    this.speed = THREE.MathUtils.clamp(this.speed * CAPTURE.speedStep ** -input.wheelSteps, CAPTURE.speedMin, CAPTURE.speedMax);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    move.set(axis(input, K.right, K.left), 0, axis(input, K.back, K.forward)).applyEuler(camera.rotation);
    move.y += axis(input, K.up, K.down);
    if (move.lengthSq() > 1) move.normalize();
    this.position.addScaledVector(move, this.speed * dt);
    camera.position.copy(this.position);
    camera.updateMatrixWorld();
  }
}
