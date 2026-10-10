import * as THREE from 'three';
import { ATMOS, AUDIO } from './config';
import type { Audio } from './audio';
import type { Emitter } from './level/build-prop';
import type { Heightmap } from './render/heightmap';

// Sounds of the level's props near you (their emitters): AC fans hum, rain
// pings on metal tops.

const toDrop = new THREE.Vector3();
const camRight = new THREE.Vector3();
/** Raindrops pinging on nearby metal tops that are open to the sky (not under a roof). */
export function metalDrops(audio: Audio, emitters: Emitter[], heightmap: Heightmap, camera: THREE.Camera, dt: number, at: THREE.Vector3) {
  const range = AUDIO.metalRange;
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const rate = AUDIO.metalRate * ATMOS.rainDensity * dt;
  let n = 0;
  for (const e of emitters) {
    if (e.kind !== 'metal') continue;
    const d = e.pos.distanceTo(at);
    if (d > range || Math.random() > rate) continue;
    if (heightmap.heightAt(e.pos.x, e.pos.z) > e.pos.y + 0.1) continue; // sheltered
    toDrop.subVectors(e.pos, at).normalize();
    const k = 1 - d / range;
    audio.drop(toDrop.dot(camRight) * 0.8, k * k);
    if (++n >= 4) break;
  }
}

/** Loudness of the nearest AC fan from its distance (0 beyond AUDIO.fanRange). */
export function fanLevel(emitters: Emitter[], at: THREE.Vector3) {
  let best = Infinity;
  for (const e of emitters) if (e.kind === 'fan') best = Math.min(best, e.pos.distanceTo(at));
  const k = 1 - best / AUDIO.fanRange;
  return k > 0 ? k * k : 0;
}
