import * as THREE from 'three';
import type { PaintSurface } from '../../painting';
import type { LightLayout } from './layout';
import { lightAt, type Lamp } from './lamps';
import type { LightPages, LightSlot } from './light-pages';
import type { Occluders } from './occluders';

// What baked light lands on: paintable surfaces get a light atlas each, a
// block of a shared page (light-pages.ts: half float, linear light, plus a
// flicker layer where neon light reaches, alpha = the flicker slot); decor
// proxies get it in their vertices.

export interface SurfaceReceiver {
  kind: 'surface';
  /** Id of the prop it belongs to. */
  owner: number;
  bounds: THREE.Box3;
  surface: PaintSurface;
  layout: LightLayout;
  /** Its block on a light page (also PaintSurface.light). */
  slot: LightSlot;
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

/** Bake a surface's lightmap from the lamps that can reach it, into its block. */
export function bakeSurface(r: SurfaceReceiver, lamps: Lamp[], occluders: Occluders, pages: LightPages) {
  if (!lamps.length) return pages.write(r.slot, null, null);
  const { w, h, points, pixels, fill } = r.layout;
  const light = (lightScratch = room(lightScratch, w * h * 4));
  let flicker: Uint16Array | null = null;
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 6;
    lightAt(points[p], points[p + 1], points[p + 2], points[p + 3], points[p + 4], points[p + 5], lamps, occluders, r.owner, out);
    const o = pixels[i] * 4;
    light[o] = toHalf(out[0]);
    light[o + 1] = toHalf(out[1]);
    light[o + 2] = toHalf(out[2]);
    if (!out[6]) continue;
    flicker ??= flickerScratch = room(flickerScratch, w * h * 4);
    flicker[o] = toHalf(out[3]);
    flicker[o + 1] = toHalf(out[4]);
    flicker[o + 2] = toHalf(out[5]);
    flicker[o + 3] = toHalf(out[6]);
  }
  copyFill(light, fill);
  if (flicker) copyFill(flicker, fill);
  pages.write(r.slot, light, flicker, w, h);
}

let lightScratch: Uint16Array = new Uint16Array(0);
let flickerScratch: Uint16Array = new Uint16Array(0);
/** A scratch block of at least `n` values, zeroed. */
function room(a: Uint16Array, n: number): Uint16Array {
  if (a.length < n) a = new Uint16Array(n);
  a.fill(0, 0, n);
  return a;
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

/** Give a surface's block back (its prop was removed or rebuilt). */
export function dropReceiver(r: Receiver, pages: LightPages) {
  if (r.kind === 'surface') pages.release(r.slot);
}

/** Gutter and uncovered texels copy their nearest covered texel (see layout.ts). */
function copyFill(data: Uint16Array, fill: Int32Array) {
  for (let i = 0; i < fill.length; i += 2) data.copyWithin(fill[i] * 4, fill[i + 1] * 4, fill[i + 1] * 4 + 4);
}
