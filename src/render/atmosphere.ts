import * as THREE from 'three';
import { ATMOS, DAYLIGHT } from '../config';
import { shared } from '../materials';
import type { Lighting } from './lighting';

// Two lighting presets: the rainy night (ATMOS as configured / tuned) and plain
// daylight for build mode. Switching swaps the DAYLIGHT keys into ATMOS and
// back, then pushes the colors (which are otherwise only read at startup) into
// fog, sky, lights and the cloud uniform. Numbers are read every frame anyway.

type Atmos = typeof ATMOS;

export class Atmosphere {
  private night: Partial<Atmos> | null = null;

  constructor(
    private scene: THREE.Scene,
    private sky: THREE.Mesh,
    private lighting: Lighting,
  ) {}

  get daylight() {
    return !!this.night;
  }

  setDaylight(on: boolean) {
    if (on === this.daylight) return;
    if (on) {
      const keys = Object.keys(DAYLIGHT) as (keyof Atmos)[];
      this.night = Object.fromEntries(keys.map((k) => [k, ATMOS[k]])) as Partial<Atmos>;
      Object.assign(ATMOS, DAYLIGHT);
    } else {
      Object.assign(ATMOS, this.night);
      this.night = null;
    }
    this.syncColors();
  }

  /** After DAYLIGHT was edited: show the new values if build mode is using them. */
  reapplyDaylight() {
    if (!this.daylight) return;
    Object.assign(ATMOS, DAYLIGHT);
    this.syncColors();
  }

  /** Push ATMOS colors and the moon direction to fog, sky, lights and clouds. */
  syncColors() {
    (this.scene.fog as THREE.FogExp2).color.set(ATMOS.fogColor);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.uZenith.value.set(ATMOS.skyZenith);
    u.uHorizon.value.set(ATMOS.skyHorizon);
    u.uFog.value.set(ATMOS.fogColor);
    u.uMoonDir.value.set(...ATMOS.moonDir).normalize();
    this.lighting.hemi.color.set(ATMOS.ambientSky);
    this.lighting.hemi.groundColor.set(ATMOS.ambientGround);
    this.lighting.moon.color.set(ATMOS.moonColor);
    shared.uCloudColor.value.set(ATMOS.cloudColor);
  }
}
