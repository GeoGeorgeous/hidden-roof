import type * as THREE from 'three';
import { ATMOS } from '../config';

const RAD = Math.PI / 180;

/** Unit vector toward the moon (the sun in daylight) from ATMOS.moonHeight / moonHeading, into `out`. */
export function moonDirection(out: THREE.Vector3) {
  const h = ATMOS.moonHeight * RAD;
  const a = ATMOS.moonHeading * RAD;
  return out.set(Math.cos(h) * Math.sin(a), Math.sin(h), Math.cos(h) * Math.cos(a));
}
