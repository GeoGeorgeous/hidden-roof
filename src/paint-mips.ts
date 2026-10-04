// Smaller copies of a paint atlas (mip levels) for surfaces seen from afar, so
// fine paint doesn't sparkle once a texel gets smaller than a pixel. Only the
// atlas lives on the CPU: where paint changed, each level's texels are
// averaged straight from it and uploaded. The GPU's own mipmaps would average
// the black of unpainted texels into the edges of the paint (the atlas keeps
// straight alpha), so here colors are weighted by alpha.

export interface MipSize {
  width: number;
  height: number;
}

/** Sizes of the levels below a w x h atlas, each half the one above: `count` levels with the atlas. */
export function mipSizes(w: number, h: number, count: number): MipSize[] {
  const out: MipSize[] = [];
  while (out.length < count - 1 && (w > 1 || h > 1)) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    out.push({ width: w, height: h });
  }
  return out;
}

/**
 * Level-`k` texels x0..x1, y0..y1 (inclusive) of a w x h atlas, into `out`
 * row by row: each one averages its 2^k x 2^k block of the atlas.
 */
export function mipRect(atlas: Uint8Array, w: number, h: number, k: number, x0: number, y0: number, x1: number, y1: number, out: Uint8Array) {
  let o = 0;
  for (let y = y0; y <= y1; y++) {
    const v0 = y << k;
    const v1 = Math.min(h, (y + 1) << k);
    for (let x = x0; x <= x1; x++) {
      const u0 = x << k;
      const u1 = Math.min(w, (x + 1) << k);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let v = v0; v < v1; v++) {
        for (let i = (v * w + u0) * 4, end = (v * w + u1) * 4; i < end; i += 4) {
          const t = atlas[i + 3];
          r += atlas[i] * t;
          g += atlas[i + 1] * t;
          b += atlas[i + 2] * t;
          a += t;
        }
      }
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / ((v1 - v0) * (u1 - u0)));
      o += 4;
    }
  }
}
