import type { Rect, SurfaceGeometry } from './surfaces';

// Moves paint between two atlases of the same faces laid out at different
// texel densities (after a paint detail change), face by face: the nearest
// texel when enlarging, the average when shrinking. Colors are averaged
// weighted by alpha, so unpainted texels don't darken the edges of the paint.

/** Resample `src` (laid out as `from`) into `dst` (laid out as `to`). Faces match by index. */
export function resampleAtlas(from: SurfaceGeometry, src: Uint8Array, to: SurfaceGeometry, dst: Uint8Array) {
  const n = Math.min(from.rects.length, to.rects.length);
  for (let i = 0; i < n; i++) {
    if (painted(src, from.atlasW, from.rects[i])) resampleRect(src, from.atlasW, from.rects[i], dst, to.atlasW, to.rects[i]);
  }
}

/** Does the face (with its 1-texel padding) hold any paint? */
export function painted(src: Uint8Array, w: number, r: Rect) {
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (let i = (y * w + r.x - 1) * 4 + 3, end = (y * w + r.x + r.w) * 4 + 3; i <= end; i += 4) if (src[i]) return true;
  }
  return false;
}

/** Resample face `a` of `src` (`sw` texels wide) into face `b` of `dst` (`dw` wide), 1-texel padding included. */
export function resampleRect(src: Uint8Array, sw: number, a: Rect, dst: Uint8Array, dw: number, b: Rect) {
  const kx = a.w / b.w;
  const ky = a.h / b.h;
  // Padding included (-1 .. size), so face edges keep their paint.
  for (let y = -1; y <= b.h; y++) {
    const [v0, v1] = span(y, ky, a.h);
    for (let x = -1; x <= b.w; x++) {
      const [u0, u1] = span(x, kx, a.w);
      let r = 0;
      let g = 0;
      let bl = 0;
      let al = 0;
      for (let v = v0; v <= v1; v++) {
        for (let u = u0; u <= u1; u++) {
          const i = ((a.y + v) * sw + a.x + u) * 4;
          const t = src[i + 3];
          r += src[i] * t;
          g += src[i + 1] * t;
          bl += src[i + 2] * t;
          al += t;
        }
      }
      if (!al) continue;
      const o = ((b.y + y) * dw + b.x + x) * 4;
      dst[o] = Math.round(r / al);
      dst[o + 1] = Math.round(g / al);
      dst[o + 2] = Math.round(bl / al);
      dst[o + 3] = Math.round(al / ((v1 - v0 + 1) * (u1 - u0 + 1)));
    }
  }
}

/**
 * Source texels (inclusive, padding allowed: -1 .. size) under destination
 * texel `i`, `k` source texels per destination texel: those whose centers fall
 * inside it, or the nearest one when enlarging.
 */
function span(i: number, k: number, size: number): [number, number] {
  let lo = Math.ceil(i * k - 0.5);
  let hi = Math.ceil((i + 1) * k - 0.5) - 1;
  if (hi < lo) lo = hi = Math.floor((i + 0.5) * k);
  return [Math.min(size, Math.max(-1, lo)), Math.min(size, Math.max(-1, hi))];
}
