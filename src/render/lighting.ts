import * as THREE from 'three';
import { ATMOS, LIGHTS, THUNDER } from '../config';
import { neonFlicker } from './flicker';
import { syncAnchor, type LightAnchor } from '../level/build-prop';

// Scene lighting for the rainy night:
//  - dim cold ambient (hemisphere) + one moon light with a shadow map that
//    follows the player
//  - a fixed pool of real spot lights, handed each frame to the light props
//    nearest the camera; every other light prop only shows its cheap tricks
//    (emissive parts, glow sprite, beam). Every light prop is a spot placed on
//    its lens and aimed where the lens faces (wide spreads for lamps and signs).
//  - the first SPOT_SHADOWS slots cast shadows and only go to kinds with
//    `shadows` (floodlights, billboard lamps). Unused shadow slots stop
//    rendering their shadow map.
//
//
// Cost: three.js shades every pool slot on every lit pixel, whatever its range
// or intensity, so range is free on the GPU; the pool size and the shadow
// slots are what cost. Changing them recompiles all shaders.

const SPOT_POOL = 8;
const SPOT_SHADOWS = 2;

export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly moon: THREE.DirectionalLight;
  readonly spots: THREE.SpotLight[] = [];
  private anchors: LightAnchor[] = [];
  /** How many real lights are lit right now (for the debug panel). */
  active = 0;
  private shadowState = '';

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  ) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // crisp, cheap, fits the pixel look
    this.hemi = new THREE.HemisphereLight(ATMOS.ambientSky, ATMOS.ambientGround, ATMOS.ambient);
    this.moon = new THREE.DirectionalLight(ATMOS.moonColor, ATMOS.moon);
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.bias = -0.0008;
    this.moon.shadow.normalBias = 0.04;
    scene.add(this.hemi, this.moon, this.moon.target);
    for (let i = 0; i < SPOT_POOL; i++) {
      const l = new THREE.SpotLight('#ffffff', 0, 18, 0.6, 0.5, ATMOS.lightDecay);
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.0005;
      l.shadow.camera.near = 0.1;
      this.spots.push(l);
      scene.add(l, l.target);
    }
    this.applyShadowToggles();
  }

  setAnchors(list: LightAnchor[]) {
    this.anchors = list;
  }

  /** `time` drives neon flicker (same clock as the surface shader); `flash` 0..1 is lightning. */
  update(cam: THREE.Vector3, time = 0, flash = 0) {
    this.hemi.intensity = ATMOS.ambient + flash * THUNDER.flashAmbient;
    this.moon.intensity = ATMOS.moon + flash * THUNDER.flashMoon;
    this.applyShadowToggles();

    // Moon shadow box centered on the player, snapped to 1 m to limit shimmering.
    const r = ATMOS.shadowRange;
    const s = this.moon.shadow.camera;
    if (s.right !== r) {
      Object.assign(s, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 160 });
      s.updateProjectionMatrix();
    }
    const c = new THREE.Vector3(Math.round(cam.x), Math.round(cam.y), Math.round(cam.z));
    this.moon.target.position.copy(c);
    this.moon.position.copy(c).addScaledVector(new THREE.Vector3(...ATMOS.moonDir).normalize(), 70);

    // Nearest light props get the real lights; shadow slots go to shadow-casting kinds first.
    for (const a of this.anchors) syncAnchor(a); // live LIGHTS offset / aim / color
    const budget = Math.min(SPOT_POOL, ATMOS.lightBudget);
    const near = this.anchors
      .map((a) => ({ a, d: a.pos.distanceTo(cam) - LIGHTS[a.kind].range }))
      .filter((x) => x.d < 40)
      .sort((x, y) => x.d - y.d)
      .slice(0, budget)
      .map((x) => x.a);
    const slots: (LightAnchor | undefined)[] = new Array(SPOT_POOL);
    const shadowy = ATMOS.spotShadows ? near.filter((a) => LIGHTS[a.kind].shadows).slice(0, SPOT_SHADOWS) : [];
    shadowy.forEach((a, i) => (slots[i] = a));
    let next = SPOT_SHADOWS;
    for (const a of near) if (!shadowy.includes(a) && next < SPOT_POOL) slots[next++] = a;

    this.spots.forEach((l, i) => {
      const a = slots[i];
      l.intensity = a ? LIGHTS[a.kind].intensity * ATMOS.practical * (a.flicker ? neonFlicker(time, a.flicker) : 1) : 0;
      if (i < SPOT_SHADOWS) l.shadow.autoUpdate = !!a && ATMOS.spotShadows;
      if (!a) return;
      const spec = LIGHTS[a.kind];
      l.position.copy(a.pos);
      l.target.position.copy(a.pos).add(a.dir);
      l.color.copy(a.color);
      l.distance = spec.range;
      l.decay = ATMOS.lightDecay;
      l.angle = Math.min(spec.spread, 1.55);
      l.penumbra = spec.softness;
    });
    this.active = near.length;
  }

  /** Changing castShadow recompiles shaders, so only touch it when a toggle changed. */
  private applyShadowToggles() {
    const state = `${ATMOS.shadows}|${ATMOS.spotShadows}`;
    if (state === this.shadowState) return;
    this.shadowState = state;
    this.moon.castShadow = ATMOS.shadows;
    this.spots.forEach((l, i) => (l.castShadow = ATMOS.spotShadows && i < SPOT_SHADOWS));
  }
}
