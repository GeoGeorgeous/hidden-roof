import * as THREE from 'three';
import { PAUSE_MENU } from '../config';

// The view behind the full pause sheet (hud.cityView): a fixed camera on the city.
// main.ts draws from it; play (aim, tools, build mode) keeps the player's camera.

const cam = new THREE.PerspectiveCamera();

/** The pause view's camera: the player's copied (lens, aspect), then put at PAUSE_MENU.view*. */
export function pauseCamera(player: THREE.PerspectiveCamera) {
  const m = PAUSE_MENU;
  cam.copy(player);
  cam.position.set(m.viewX, m.viewY, m.viewZ);
  cam.rotation.set(m.viewPitch * THREE.MathUtils.DEG2RAD, m.viewYaw * THREE.MathUtils.DEG2RAD, 0, 'YXZ');
  cam.updateMatrixWorld();
  return cam;
}
