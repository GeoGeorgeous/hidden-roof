import type * as THREE from 'three';
import { DRIPS, PAINT } from './config';
import { paintRandom } from './lcg';
import type { Rgb } from './painting';
import type { Rect, SurfaceGeometry } from './surfaces';

// The paint raster: dots, roller bands and single texels written into a
// surface's CPU paint (its RGBA atlas), and the excess paint that may start
// runs. CPU only: textures and uploads are paint-gpu.ts, so this can run
// anywhere the paint has to be the same (a server, a test).

/** The CPU side of a paint surface (painting.ts PaintSurface): its paint must exist before anything is drawn. */
export interface RasterSurface {
  geo: SurfaceGeometry;
  data: Uint8Array | null;
  /** Excess paint per texel on already-opaque paint, in 1/256 coats (created on first excess). */
  excess: Uint16Array | null;
}

/** Atlas texels x0..x1, y0..y1, inclusive. */
export type Box = [x0: number, y0: number, x1: number, y1: number];

/** The part of `box` on face `rect` and its 1-texel ring. */
export const inRing = (rect: Rect, [x0, y0, x1, y1]: Box): Box => [Math.max(rect.x - 1, x0), Math.max(rect.y - 1, y0), Math.min(rect.x + rect.w, x1), Math.min(rect.y + rect.h, y1)];

/** A roller band's size and paint (see PaintSystem.roll). */
export interface Band {
  halfLength: number;
  halfWidth: number;
  edge: number;
  amount: number;
  color: Rgb;
  drip: number;
}

export class PaintRaster<S extends RasterSurface> {
  constructor(
    private hooks: {
      /** Texels in this rect (inclusive) changed. */
      touched: (s: S, x0: number, y0: number, x1: number, y1: number) => void;
      /** Heavy paint on a vertical face should start a run here (see paint-drips.ts). */
      drip: (s: S, rect: Rect, x: number, y: number, rgb: Rgb) => void;
    },
  ) {}

  /** One roller band centered at atlas texel coords (cx, cy), clipped to `rect` (see PaintSystem.roll). */
  band(s: S, rect: Rect, cx: number, cy: number, axis: THREE.Vector3, b: Band) {
    // The axis in texels: texel x runs along the face's u, y along its v, at the same density.
    let ax = 1;
    let ay = 0;
    if (rect.face) {
      const u = axis.dot(rect.face.uAxis) / rect.face.uAxis.length();
      const v = axis.dot(rect.face.vAxis) / rect.face.vAxis.length();
      const len = Math.hypot(u, v);
      if (len > 1e-3) [ax, ay] = [u / len, v / len];
    }
    const w = s.geo.atlasW;
    const data = s.data!;
    const L = Math.max(0.5, b.halfLength * PAINT.texelsPerMeter);
    const T = Math.max(0.5, b.halfWidth * PAINT.texelsPerMeter);
    const fade = b.edge * L;
    const ex = Math.abs(ax) * L + Math.abs(ay) * T;
    const ey = Math.abs(ay) * L + Math.abs(ax) * T;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - ex));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + ex));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - ey));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + ey));
    const runs = DRIPS.enabled && rect.upright ? b.drip : 0;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const along = Math.abs(dx * ax + dy * ay);
        if (along > L || Math.abs(dy * ax - dx * ay) > T) continue;
        const amt = fade > 0 ? b.amount * Math.min(1, (L - along) / fade) : b.amount;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (runs && data[i + 3] >= 250) this.addExcess(s, rect, x, y, amt, runs);
        blend(data, i, amt, b.color);
        touched = true;
      }
    }
    if (touched) this.hooks.touched(s, x0, y0, x1, y1);
  }

  /** One dot centered at atlas texel coords (cx, cy), clipped to `rect` (see PaintSystem.stamp). */
  dot(
    s: S,
    rect: Rect,
    cx: number,
    cy: number,
    radius: number,
    amount: number,
    color: Rgb | null,
    softness: number,
    drip: number,
    square: boolean,
  ) {
    const w = s.geo.atlasW;
    const data = s.data!;
    const r = radius * PAINT.texelsPerMeter;
    // Under half a texel diagonal the dot could miss every texel center.
    const dot = r >= Math.SQRT1_2;
    const reach = dot ? r - 0.5 : 0;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - reach));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + reach));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - reach));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + reach));
    const runs = DRIPS.enabled && rect.upright ? drip : 0;
    const r2 = r * r;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (dot && (square ? Math.abs(dx) > r || Math.abs(dy) > r : d2 > r2)) continue;
        const falloff = dot && !square ? 1 - (d2 / r2) * softness : 1;
        const amt = amount * falloff;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (!color) {
          if (data[i + 3] === 0) continue;
          data[i + 3] = toward(data[i + 3], 0, amt);
          touched = true;
          continue;
        }
        if (runs && data[i + 3] >= 250) this.addExcess(s, rect, x, y, amt, runs);
        blend(data, i, amt, color);
        touched = true;
      }
    }
    if (touched) this.hooks.touched(s, x0, y0, x1, y1);
  }

  /**
   * An image (PaintSystem.imprint): each texel of `rect` and its ring in
   * `box` gets `alpha(x, y)` (0..1, at its center) of `color`. False if none
   * got any.
   */
  image(s: S, rect: Rect, box: Box, alpha: (x: number, y: number) => number, color: Rgb) {
    const w = s.geo.atlasW;
    const [x0, y0, x1, y1] = inRing(rect, box);
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const a = alpha(x + 0.5, y + 0.5);
        if (a <= 0) continue;
        blend(s.data!, (y * w + x) * 4, Math.min(1, a), color);
        touched = true;
      }
    }
    if (touched) this.hooks.touched(s, x0, y0, x1, y1);
    return touched;
  }

  /** Paint a single texel (paint runs). */
  texel(s: S, x: number, y: number, amount: number, color: Rgb) {
    blend(s.data!, (y * s.geo.atlasW + x) * 4, amount, color);
    this.hooks.touched(s, x, y, x, y);
  }

  private addExcess(s: S, rect: Rect, x: number, y: number, amt: number, rate: number) {
    const e = (s.excess ??= new Uint16Array(s.geo.atlasW * s.geo.atlasH));
    const k = y * s.geo.atlasW + x;
    const v = e[k] + Math.round(amt * 256);
    if (v < DRIPS.excess * 256) {
      e[k] = v;
      return;
    }
    e[k] = 0;
    if (paintRandom.drips() >= rate / PAINT.texelsPerMeter ** 2) return;
    const i = k * 4;
    const d = s.data!;
    this.hooks.drip(s, rect, x, y, [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  }
}

/**
 * One paint layer, new paint composited OVER it: the color always moves toward
 * the new paint by its own amount, even where the layer is already opaque.
 * (Alpha and color are independent: a full-alpha texel still takes new color.)
 */
function blend(data: Uint8Array, i: number, amt: number, color: Rgb) {
  const a = data[i + 3] / 255;
  const na = amt + a * (1 - amt);
  const k = amt / na;
  data[i] = toward(data[i], color[0] * 255, k);
  data[i + 1] = toward(data[i + 1], color[1] * 255, k);
  data[i + 2] = toward(data[i + 2], color[2] * 255, k);
  data[i + 3] = toward(data[i + 3], 255, amt);
}

/**
 * Move an 8-bit channel toward `target` by fraction k, always by at least one
 * step, so repeated light coats converge on the new color instead of stalling
 * a few values short because of rounding.
 */
function toward(cur: number, target: number, k: number) {
  const t = Math.round(target);
  if (cur === t) return cur;
  const next = Math.round(cur + (t - cur) * k);
  return t > cur ? Math.min(t, Math.max(cur + 1, next)) : Math.max(t, Math.min(cur - 1, next));
}
