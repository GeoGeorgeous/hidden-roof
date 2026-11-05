import type * as THREE from 'three';
import { DRIPS, PAINT } from './config';
import type { StampOp } from './paint-ops';
import { WetPaint, type RunRule, type WetSurface } from './paint-wet';
import type { Rgb } from './painting';
import type { Rect, SurfaceGeometry } from './surfaces';

// The paint raster: dots, roller bands and single texels written into a
// surface's CPU paint (its RGBA atlas), and the wet paint that may start
// runs. CPU only: textures and uploads are paint-gpu.ts, so this can run
// anywhere the paint has to be the same (a server, a test).

/** The CPU side of a paint surface (paint-surface.ts PaintSurface): its paint must exist before anything is drawn. */
export interface RasterSurface extends WetSurface {
  geo: SurfaceGeometry;
  data: Uint8Array | null;
}

const TAU = Math.PI * 2;

/** Atlas texels x0..x1, y0..y1, inclusive. */
export type Box = [x0: number, y0: number, x1: number, y1: number];

/** The part of `box` on face `rect` and its 1-texel ring. */
export const inRing = (rect: Rect, [x0, y0, x1, y1]: Box): Box => [Math.max(rect.x - 1, x0), Math.max(rect.y - 1, y0), Math.min(rect.x + rect.w, x1), Math.min(rect.y + rect.h, y1)];

/** A dot's size and paint (see PaintSystem.stamp). */
export type Dot = Pick<StampOp, 'radius' | 'amount' | 'color' | 'softness' | 'square' | 'slant'>;

/** A roller band's size and paint (see PaintSystem.roll). */
export interface Band {
  halfLength: number;
  halfWidth: number;
  edge: number;
  amount: number;
  color: Rgb;
  runs: RunRule | null;
}

export class PaintRaster<S extends RasterSurface> {
  readonly wet = new WetPaint();

  constructor(
    private hooks: {
      /** Texels in this rect (inclusive) changed. */
      touched: (s: S, x0: number, y0: number, x1: number, y1: number) => void;
      /** Heavy paint on a vertical face starts a run here, of `length` (0..1 of DRIPS' lengths; paint-drips.ts). */
      drip: (s: S, rect: Rect, x: number, y: number, rgb: Rgb, length: number) => void;
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
    const L = Math.max(0.5, b.halfLength * s.geo.texelsPerMeter);
    const T = Math.max(0.5, b.halfWidth * s.geo.texelsPerMeter);
    const fade = b.edge * L;
    const ex = Math.abs(ax) * L + Math.abs(ay) * T;
    const ey = Math.abs(ay) * L + Math.abs(ax) * T;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - ex));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + ex));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - ey));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + ey));
    const runs = DRIPS.enabled && rect.upright && b.runs?.chance ? b.runs : null;
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
        if (runs && data[i + 3] >= 250) this.addWet(s, rect, x, y, amt, runs);
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
    { radius, amount, color, softness, square, slant }: Dot,
    rule: RunRule | null,
  ) {
    const w = s.geo.atlasW;
    const data = s.data!;
    let r = radius * s.geo.texelsPerMeter;
    let stretch = slant?.stretch ?? 1;
    // Narrower than a texel, a long dab would miss texel centers along its length: it keeps its length and is a texel wide.
    if (r < Math.SQRT1_2 && r * stretch >= Math.SQRT1_2) [r, stretch] = [Math.SQRT1_2, (r * stretch) / Math.SQRT1_2];
    const tail = slant?.tail ?? 0;
    // The far end's direction: an ellipse's texels are those of a circle, squeezed back along it.
    const ax = slant ? Math.cos(slant.turn * TAU) : 1;
    const ay = slant ? Math.sin(slant.turn * TAU) : 0;
    // Under half a texel diagonal the dot could miss every texel center.
    const dot = r >= Math.SQRT1_2;
    // The box around the ellipse, not a square of its length: along a diagonal that's about half the texels.
    const reachX = dot ? (slant ? Math.hypot(r * stretch * ax, r * ay) : r) - 0.5 : 0;
    const reachY = dot ? (slant ? Math.hypot(r * stretch * ay, r * ax) : r) - 0.5 : 0;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - reachX));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + reachX));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - reachY));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + reachY));
    const runs = DRIPS.enabled && rect.upright && rule?.chance ? rule : null;
    const r2 = r * r;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let dx = x + 0.5 - cx;
        let dy = y + 0.5 - cy;
        let fade = 1;
        if (slant) {
          const along = dx * ax + dy * ay;
          dy = dy * ax - dx * ay;
          dx = along / stretch;
          if (along > 0) fade = 1 - tail * Math.min(1, dx / r);
        }
        const d2 = dx * dx + dy * dy;
        if (dot && (square ? Math.abs(dx) > r || Math.abs(dy) > r : d2 > r2)) continue;
        const falloff = dot && !square ? 1 - (d2 / r2) * softness : 1;
        const amt = amount * falloff * fade;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (!color) {
          if (data[i + 3] === 0) continue;
          data[i + 3] = toward(data[i + 3], 0, amt);
          touched = true;
          continue;
        }
        if (runs && data[i + 3] >= 250) this.addWet(s, rect, x, y, amt, runs);
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

  /** `amt` coats more on an opaque texel of `rect`: a run may start there. */
  private addWet(s: S, rect: Rect, x: number, y: number, amt: number, rule: RunRule) {
    const length = this.wet.add(s, rect, x, y, amt, rule);
    if (length === null) return;
    const i = (y * s.geo.atlasW + x) * 4;
    const d = s.data!;
    this.hooks.drip(s, rect, x, y, [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], length);
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
 * Move an 8-bit channel toward `target` by fraction k, by at least one step, so
 * repeated light coats converge on the new color instead of stalling a few
 * values short because of rounding. Under PAINT.faintest there's no coat to
 * speak of: a step would be a dab's far rim showing as a halo.
 */
function toward(cur: number, target: number, k: number) {
  const t = Math.round(target);
  if (cur === t) return cur;
  const next = Math.round(cur + (t - cur) * k);
  if (next === cur && k < PAINT.faintest) return cur;
  return t > cur ? Math.min(t, Math.max(cur + 1, next)) : Math.max(t, Math.min(cur - 1, next));
}
