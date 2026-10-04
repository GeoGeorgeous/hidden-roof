import * as THREE from 'three';
import { LIGHTMAP } from '../../config';
import type { PaintSurface } from '../../painting';
import { layoutLightmap, type LightLayout } from './layout';
import { lightAt, type Lamp } from './lamps';
import type { Occluders } from './occluders';

// What baked light lands on: paintable surfaces get a lightmap texture each
// (half float, linear light), plus a flicker layer while neon light reaches
// them (alpha = the flicker slot); decor proxies get it in their vertices.

export interface SurfaceReceiver {
  kind: 'surface';
  /** Id of the prop it belongs to. */
  owner: number;
  bounds: THREE.Box3;
  surface: PaintSurface;
  /** Paint texels per meter the surface was built with (its atlas rects are in those). */
  paintDensity: number;
  layout: LightLayout | null;
  light: THREE.DataTexture | null;
  flicker: THREE.DataTexture | null;
}

export interface DecorReceiver {
  kind: 'decor';
  owner: number;
  bounds: THREE.Box3;
  geo: THREE.BufferGeometry;
  /** Holds some light (so it needs clearing when no lamp reaches it any more). */
  lit: boolean;
}

export type Receiver = SurfaceReceiver | DecorReceiver;

const out = new Float32Array(7);
const toHalf = THREE.DataUtils.toHalfFloat;

/** Bake a surface's lightmap from the lamps that can reach it. */
export function bakeSurface(r: SurfaceReceiver, lamps: Lamp[], occluders: Occluders) {
  if (!lamps.length) return clearSurface(r);
  r.layout ??= layoutLightmap(r.surface.geo, r.paintDensity, LIGHTMAP.texelsPerMeter);
  const { w, h, points, pixels, fill } = r.layout;
  if (r.light?.image.width !== w || r.light.image.height !== h) {
    r.light?.dispose();
    r.light = lightTexture(w, h);
  }
  const light = r.light.image.data as Uint16Array;
  let flicker: Uint16Array | null = null;
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 6;
    lightAt(points[p], points[p + 1], points[p + 2], points[p + 3], points[p + 4], points[p + 5], lamps, occluders, r.owner, out);
    const o = pixels[i] * 4;
    light[o] = toHalf(out[0]);
    light[o + 1] = toHalf(out[1]);
    light[o + 2] = toHalf(out[2]);
    if (!out[6]) continue;
    flicker ??= flickerLayer(r, w, h);
    flicker[o] = toHalf(out[3]);
    flicker[o + 1] = toHalf(out[4]);
    flicker[o + 2] = toHalf(out[5]);
    flicker[o + 3] = toHalf(out[6]);
  }
  copyFill(light, fill);
  r.light.needsUpdate = true;
  if (flicker) {
    copyFill(flicker, fill);
    r.flicker!.needsUpdate = true;
  } else if (r.flicker) {
    r.flicker.dispose();
    r.flicker = null;
  }
  r.surface.material.setLightmap(r.light, r.flicker);
}

/** Bake light into a decor proxy's vertices. Returns whether they changed. */
export function bakeDecor(r: DecorReceiver, lamps: Lamp[], occluders: Occluders) {
  const baked = r.geo.attributes.baked.array as Float32Array;
  const flicker = r.geo.attributes.bakedFlicker.array as Float32Array;
  if (!lamps.length) {
    if (!r.lit) return false;
    baked.fill(0);
    flicker.fill(0);
    r.lit = false;
    return true;
  }
  const P = r.geo.attributes.position.array;
  const N = r.geo.attributes.normal.array;
  for (let i = 0; i < r.geo.attributes.position.count; i++) {
    const p = i * 3;
    const f = i * 4;
    lightAt(P[p], P[p + 1], P[p + 2], N[p], N[p + 1], N[p + 2], lamps, occluders, r.owner, out);
    baked[p] = out[0];
    baked[p + 1] = out[1];
    baked[p + 2] = out[2];
    flicker[f] = out[3];
    flicker[f + 1] = out[4];
    flicker[f + 2] = out[5];
    flicker[f + 3] = out[6];
  }
  r.lit = true;
  return true;
}

/** Free a receiver's textures (its prop was removed or rebuilt). */
export function dropReceiver(r: Receiver) {
  if (r.kind === 'surface') {
    r.light?.dispose();
    r.flicker?.dispose();
    r.light = r.flicker = null;
  }
}

/** Bytes of GPU texture memory a receiver holds. */
export function receiverBytes(r: Receiver) {
  if (r.kind !== 'surface') return 0;
  const size = (t: THREE.DataTexture | null) => (t ? t.image.width * t.image.height * 8 : 0);
  return size(r.light) + size(r.flicker);
}

/** Set the light texel filter (LIGHTMAP.smooth) of a receiver's textures. */
export function filterReceiver(r: Receiver) {
  if (r.kind !== 'surface') return;
  for (const t of [r.light, r.flicker]) {
    if (!t) continue;
    t.minFilter = t.magFilter = filter();
    t.needsUpdate = true;
  }
}

function clearSurface(r: SurfaceReceiver) {
  dropReceiver(r);
  r.surface.material.setLightmap(null, null);
}

/** The surface's flicker layer, cleared, at the lightmap's size. */
function flickerLayer(r: SurfaceReceiver, w: number, h: number) {
  if (r.flicker?.image.width !== w || r.flicker.image.height !== h) {
    r.flicker?.dispose();
    r.flicker = lightTexture(w, h);
  }
  const data = r.flicker.image.data as Uint16Array;
  data.fill(0);
  return data;
}

/** Gutter and uncovered texels copy their nearest covered texel (see layout.ts). */
function copyFill(data: Uint16Array, fill: Int32Array) {
  for (let i = 0; i < fill.length; i += 2) data.copyWithin(fill[i] * 4, fill[i + 1] * 4, fill[i + 1] * 4 + 4);
}

const filter = () => (LIGHTMAP.smooth ? THREE.LinearFilter : THREE.NearestFilter);

function lightTexture(w: number, h: number) {
  const t = new THREE.DataTexture(new Uint16Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = filter();
  return t;
}
