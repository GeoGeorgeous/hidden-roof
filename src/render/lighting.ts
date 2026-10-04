import * as THREE from 'three';
import { ATMOS, LIGHTMAP, LIGHTS, THUNDER } from '../config';
import { neonFlicker } from './flicker';
import { syncAnchor, type LightAnchor } from '../level/build-prop';
import { rotateY, trackAngle, trackWeight } from './cctv-track';
import { bakeUniforms, HIGHLIGHT_MAX } from './bake/glsl';

// Scene lighting for the rainy night:
//  - dim cold ambient (hemisphere) + one moon light with a shadow map that
//    follows the player
//  - lamps are baked (render/bake): their light and shadows live in light
//    textures, so any number of them costs the same. Real lights only do what
//    a bake can't:
//     - moving lights (CCTV): a pool of MOVING_POOL real spot lights
//     - wet highlights: the nearest LIGHTMAP.highlights lamps add their
//       specular highlight (a short loop in the surface shader, wet pixels only)
//  - with LIGHTMAP.enabled off it lights the old way, for comparison: a pool
//    of real spot lights handed each frame to the light props nearest the
//    camera (ATMOS.lightBudget of them); the rest only show their cheap tricks
//    (emissive parts, glow sprite, beam). The first SPOT_SHADOWS slots may cast
//    shadows (ATMOS.spotShadows) and then only go to kinds with `shadows`.
//  - every real light is a spot on the lens, aimed where the lens faces.
//  - volumetrics scatter the nearest lights either way (`scatter`).
//
// Cost: three.js shades every pool light on every lit pixel, whatever its
// range or intensity, so the pool size and the shadow slots are what cost.
// Changing them (or switching the bake on or off) recompiles all shaders.

const SPOT_POOL = 8;
const MOVING_POOL = 2;
const SPOT_SHADOWS = 2;
/** Lights volumetrics scatter (render/volumetrics.ts). */
export const SCATTER_MAX = 8;
/** Highlights and scatter fade out over this many meters before the next lamp takes their place. */
const FADE = 2;
const hv = new THREE.Vector3();

/** A light the volumetric pass scatters. */
export interface ScatterLight {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** Color x strength; black = unused. */
  color: THREE.Color;
  range: number;
  angle: number;
  penumbra: number;
  /** The real spot light whose shadow map shapes it, if any. */
  shadow: THREE.SpotLight | null;
}

type Near = { a: LightAnchor; d: number };

export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly moon: THREE.DirectionalLight;
  readonly spots: THREE.SpotLight[] = [];
  readonly scatter: ScatterLight[] = Array.from({ length: SCATTER_MAX }, () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0), color: new THREE.Color(0, 0, 0), range: 1, angle: 1, penumbra: 0, shadow: null }));
  private anchors: LightAnchor[] = [];
  /** How many real lights are lit right now (for the debug panel). */
  active = 0;
  private shadowState = '';
  private poolSize = -1;

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
  }

  setAnchors(list: LightAnchor[]) {
    this.anchors = list;
  }

  /** `view`: the camera's world-to-view matrix; `time` drives neon flicker (same clock as the surface shader); `flash` 0..1 is lightning. */
  update(cam: THREE.Vector3, view: THREE.Matrix4, time = 0, flash = 0) {
    const baked = LIGHTMAP.enabled;
    this.hemi.intensity = ATMOS.ambient + flash * THUNDER.flashAmbient;
    this.moon.intensity = ATMOS.moon + flash * THUNDER.flashMoon;
    this.applyShadowToggles(baked);
    this.setPoolSize(baked ? MOVING_POOL : SPOT_POOL);

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

    for (const a of this.anchors) {
      syncAnchor(a); // live LIGHTS offset / aim / color
      if (a.track) aimTracking(a, time, cam);
    }
    const near: Near[] = this.anchors
      .filter((a) => a.level > 0.001)
      .map((a) => ({ a, d: a.pos.distanceTo(cam) - LIGHTS[a.kind].range }))
      .filter((x) => x.d < 40)
      .sort((x, y) => x.d - y.d);
    const real = baked ? near.filter((x) => x.a.track).slice(0, MOVING_POOL) : near.slice(0, Math.min(SPOT_POOL, ATMOS.lightBudget));
    this.assign(real.map((x) => x.a), time);
    this.active = real.length;
    if (baked) {
      this.highlights(faded(near.filter((x) => !x.a.track), Math.min(HIGHLIGHT_MAX, LIGHTMAP.highlights)), view, time);
      this.scatterLamps(faded(near, SCATTER_MAX), time);
    } else {
      bakeUniforms.uHiCount.value = 0;
      this.scatterSpots();
    }
  }

  /** Real lights for these lamps; with spot shadows on, shadow slots go to shadow-casting kinds first. */
  private assign(lamps: LightAnchor[], time: number) {
    const slots: (LightAnchor | undefined)[] = new Array(SPOT_POOL);
    let next = 0;
    if (this.spotShadows) {
      const shadowy = lamps.filter((a) => LIGHTS[a.kind].shadows).slice(0, SPOT_SHADOWS);
      shadowy.forEach((a, i) => (slots[i] = a));
      lamps = lamps.filter((a) => !shadowy.includes(a));
      next = SPOT_SHADOWS;
    }
    for (const a of lamps) if (next < this.poolSize) slots[next++] = a;

    this.spots.forEach((l, i) => {
      const a = slots[i];
      l.intensity = a ? strength(a, time) : 0;
      if (i < SPOT_SHADOWS) l.shadow.autoUpdate = !!a && this.spotShadows;
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
  }

  /** Wet highlights of the nearest baked lamps, in view space for the surface shader. */
  private highlights(list: { a: LightAnchor; w: number }[], view: THREE.Matrix4, time: number) {
    const u = bakeUniforms;
    u.uHiCount.value = list.length;
    list.forEach(({ a, w }, i) => {
      const spec = LIGHTS[a.kind];
      const angle = Math.min(spec.spread, 1.55);
      hv.copy(a.pos).applyMatrix4(view).toArray(u.uHiPos.value, i * 3);
      hv.copy(a.dir).transformDirection(view).negate().toArray(u.uHiDir.value, i * 3);
      hv.set(a.color.r, a.color.g, a.color.b).multiplyScalar(strength(a, time) * w).toArray(u.uHiColor.value, i * 3);
      u.uHiCone.value.set([Math.cos(angle), Math.cos(angle * (1 - spec.softness)), spec.range, ATMOS.lightDecay], i * 4);
    });
  }

  private scatterLamps(list: { a: LightAnchor; w: number }[], time: number) {
    this.scatter.forEach((s, i) => {
      const e = list[i];
      s.shadow = null;
      if (!e) {
        s.color.setRGB(0, 0, 0);
        return;
      }
      const spec = LIGHTS[e.a.kind];
      s.pos.copy(e.a.pos);
      s.dir.copy(e.a.dir);
      s.color.copy(e.a.color).multiplyScalar(strength(e.a, time) * e.w);
      s.range = spec.range;
      s.angle = Math.min(spec.spread, 1.55);
      s.penumbra = spec.softness;
    });
  }

  private scatterSpots() {
    this.scatter.forEach((s, i) => {
      const l = this.spots[i];
      s.shadow = i < SPOT_SHADOWS && l.castShadow ? l : null;
      if (!l.visible || l.intensity <= 0) {
        s.color.setRGB(0, 0, 0);
        return;
      }
      s.pos.copy(l.position);
      s.dir.subVectors(l.target.position, l.position).normalize();
      s.color.copy(l.color).multiplyScalar(l.intensity);
      s.range = l.distance;
      s.angle = l.angle;
      s.penumbra = l.penumbra;
    });
  }

  /** Spot shadows only light the old way: baked lamps have baked shadows. */
  private get spotShadows() {
    return ATMOS.spotShadows && !LIGHTMAP.enabled;
  }

  /** Changing castShadow recompiles shaders, so only touch it when a toggle changed. */
  private applyShadowToggles(baked: boolean) {
    const state = `${ATMOS.shadows}|${ATMOS.spotShadows}|${baked}`;
    if (state === this.shadowState) return;
    this.shadowState = state;
    this.moon.castShadow = ATMOS.shadows;
    this.spots.forEach((l, i) => (l.castShadow = this.spotShadows && i < SPOT_SHADOWS));
  }

  /** Lights beyond the pool are hidden, so shaders only loop over the pool (recompiles on change). */
  private setPoolSize(n: number) {
    if (n === this.poolSize) return;
    this.poolSize = n;
    this.spots.forEach((l, i) => (l.visible = i < n));
  }
}

/** A lamp's real-light intensity right now. */
function strength(a: LightAnchor, time: number) {
  return LIGHTS[a.kind].intensity * ATMOS.practical * a.level * (a.flicker ? neonFlicker(time, a.flicker) : 1);
}

/** The first `k` of a nearest-first list, each fading out as the next one closes in, so swaps never pop. */
function faded(list: Near[], k: number) {
  const cut = list[k]?.d ?? Infinity;
  return list.slice(0, k).map(({ a, d }) => ({ a, w: Math.min(1, (cut - d) / FADE) }));
}

const rel = new THREE.Vector3();

/** CCTV light: turn it with its head (same angle as the shader) and fade it in near the player. */
function aimTracking(a: LightAnchor, time: number, player: THREE.Vector3) {
  const t = a.track!;
  const angle = trackAngle(t, time, player);
  a.pos.copy(t.pivot).add(rotateY(rel.copy(a.pos).sub(t.pivot), angle));
  rotateY(a.dir, angle);
  a.level = trackWeight(t, player);
}
