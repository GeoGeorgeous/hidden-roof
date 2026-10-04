import type * as THREE from 'three';

// Colors that follow a config hex string every frame (F3 tuning is live):
// the string is parsed only when it changed. A color set through here must
// not be changed any other way, or the remembered string goes stale.

const last = new WeakMap<THREE.Color, string>();

/** color.set(hex), skipped when this color was last set from the same string. */
export function setHex(color: THREE.Color, hex: string) {
  if (last.get(color) !== hex) {
    last.set(color, hex);
    color.set(hex);
  }
  return color;
}
