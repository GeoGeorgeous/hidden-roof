import type * as THREE from 'three';
import { AUDIO } from './config';
import type { Emitter } from './level/build-prop';

/** Loudness of the nearest AC fan from its distance (0 beyond AUDIO.fanRange). */
export function fanLevel(emitters: Emitter[], at: THREE.Vector3) {
  let best = Infinity;
  for (const e of emitters) if (e.kind === 'fan') best = Math.min(best, e.pos.distanceTo(at));
  const k = 1 - best / AUDIO.fanRange;
  return k > 0 ? k * k : 0;
}
