import * as THREE from 'three';
import { PAUSE_MENU, PERF_TEST } from '../config';

// The title screen's view (hud.cityView): a fixed camera on the city; and the
// performance test's flight, from it around the level. main.ts draws from
// them; play (aim, tools) keeps the player's camera.

const cam = new THREE.PerspectiveCamera();

/** The title view's camera: the player's copied (lens, aspect), then put at PAUSE_MENU.view*. */
export function titleCamera(player: THREE.PerspectiveCamera) {
  const m = PAUSE_MENU;
  cam.copy(player);
  cam.position.set(m.viewX, m.viewY, m.viewZ);
  cam.rotation.set(m.viewPitch * THREE.MathUtils.DEG2RAD, m.viewYaw * THREE.MathUtils.DEG2RAD, 0, 'YXZ');
  cam.updateMatrixWorld();
  return cam;
}

/**
 * The performance test's camera (perf-test.ts), `t` (0..1) through its run: from the title view, PERF_TEST.turns times
 * around `middle` (the level's), at the title view's height and pitch, turning with it. The same path on every run.
 */
export function flyCamera(player: THREE.PerspectiveCamera, t: number, middle: THREE.Vector3) {
  const m = PAUSE_MENU;
  const turn = t * PERF_TEST.turns * Math.PI * 2;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const dx = m.viewX - middle.x;
  const dz = m.viewZ - middle.z;
  cam.copy(player);
  cam.position.set(middle.x + dx * c + dz * s, m.viewY, middle.z - dx * s + dz * c);
  cam.rotation.set(m.viewPitch * THREE.MathUtils.DEG2RAD, m.viewYaw * THREE.MathUtils.DEG2RAD + turn, 0, 'YXZ');
  cam.updateMatrixWorld();
  return cam;
}
