import * as THREE from 'three';
import { ATMOS, DAYLIGHT } from '../config';
import { moonDirection } from './moon';
import type { Lighting } from './lighting';

// Two lighting presets: the rainy night (ATMOS as configured / tuned) and plain
// daylight for build mode. Switching swaps the DAYLIGHT keys into ATMOS and
// back, then pushes the colors (which are otherwise only read at startup) into
// the sky and the lights. Numbers are read every frame anyway.

type Atmos = typeof ATMOS;

/** While daylight is on: the night values it swapped out of ATMOS, else null. */
let night: Partial<Atmos> | null = null;

/** A night value (a setting, such as rain): ATMOS's, or while daylight is on, the one it swapped out. */
function nightValue<K extends keyof Atmos>(key: K): Atmos[K] {
  return night && key in night ? night[key]! : ATMOS[key];
}

/** Sets a night value: where nightValue reads it, so leaving daylight keeps it. */
function setNightValue<K extends keyof Atmos>(key: K, value: Atmos[K]) {
  if (night && key in night) night[key] = value;
  else ATMOS[key] = value;
}

/** The night's settings (Settings → Rain): set in build mode's daylight, they hold once it ends. */
export const NIGHT = {
  get rain() {
    return nightValue('rain');
  },
  set rain(on: boolean) {
    setNightValue('rain', on);
  },
};

export class Atmosphere {
  constructor(
    private sky: THREE.Mesh,
    private lighting: Lighting,
  ) {}

  get daylight() {
    return !!night;
  }

  /** While daylight is on: the night values it replaced in ATMOS (the F3 panel edits these), else null. */
  get nightValues(): Partial<Atmos> | null {
    return night;
  }

  setDaylight(on: boolean) {
    if (on === this.daylight) return;
    if (on) {
      const keys = Object.keys(DAYLIGHT) as (keyof Atmos)[];
      night = Object.fromEntries(keys.map((k) => [k, ATMOS[k]])) as Partial<Atmos>;
      Object.assign(ATMOS, DAYLIGHT);
    } else {
      Object.assign(ATMOS, night);
      night = null;
    }
    this.syncColors();
  }

  /** After DAYLIGHT was edited: show the new values if build mode is using them. */
  reapplyDaylight() {
    if (!this.daylight) return;
    Object.assign(ATMOS, DAYLIGHT);
    this.syncColors();
  }

  /** Push ATMOS colors and the moon direction to sky and lights. */
  syncColors() {
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    moonDirection(u.uMoonDir.value);
    this.lighting.hemi.color.set(ATMOS.ambientSky);
    this.lighting.hemi.groundColor.set(ATMOS.ambientGround);
    this.lighting.moon.color.set(ATMOS.moonColor);
  }
}
