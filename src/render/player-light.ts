import * as THREE from 'three';
import { ATMOS, PLAYER_LIGHT } from '../config';
import { setHex } from '../hex-color';

// A faint, shadowless point light just above the player's head, so dark
// corners stay readable without a flashlight beam. Lit from above, it reads
// as ambient spill rather than as a light the player carries. One extra light
// in every surface shader (no shadow map).

export class PlayerLight {
  private light: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.light = new THREE.PointLight(PLAYER_LIGHT.color, 0, PLAYER_LIGHT.range, 2);
    scene.add(this.light);
  }

  /** `on` is false in build mode (daylight). */
  update(eye: THREE.Vector3, on: boolean) {
    const l = this.light;
    l.intensity = on ? PLAYER_LIGHT.intensity : 0;
    setHex(l.color, PLAYER_LIGHT.color);
    l.distance = PLAYER_LIGHT.range;
    l.decay = ATMOS.lightDecay;
    l.position.set(eye.x, eye.y + PLAYER_LIGHT.height, eye.z);
  }
}
