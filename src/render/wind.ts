import type * as THREE from 'three';
import { ATMOS } from '../config';

const RAD = Math.PI / 180;

/** The wind (m/s, level) from ATMOS.windStrength / windHeading, into `out`. */
export function windVector(out: THREE.Vector3) {
  const a = ATMOS.windHeading * RAD;
  return out.set(Math.sin(a) * ATMOS.windStrength, 0, Math.cos(a) * ATMOS.windStrength);
}
