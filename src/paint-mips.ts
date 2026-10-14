// Smaller copies of a paint atlas (mip levels) for surfaces seen from afar, so
// fine paint doesn't sparkle once a texel gets smaller than a pixel. Only the
// atlas lives on the CPU: where paint changed, each level's texels are
// averaged from the level above (the atlas, for the first) and uploaded. The
// GPU's own mipmaps would average the black of unpainted texels into the edges
// of the paint (the atlas keeps straight alpha), so here colors are weighted by alpha.

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
 * The rect to make at each level for atlas texels x0..x1, y0..y1 changed
 * (inclusive, [x0, y0, x1, y1]): half the one above, inside the level, and
 * widened by the texels the next level's 2 x 2 blocks need from it.
 */
export function mipRects(levels: readonly MipSize[], x0: number, y0: number, x1: number, y1: number): number[][] {
  const rects = levels.map((m) => (x0 = Math.min(x0 >> 1, m.width - 1), y0 = Math.min(y0 >> 1, m.height - 1), x1 = Math.min(x1 >> 1, m.width - 1), y1 = Math.min(y1 >> 1, m.height - 1), [x0, y0, x1, y1]));
  for (let i = rects.length - 1; i > 0; i--) {
    const [a, b, c, d] = rects[i];
    const [up, m] = [rects[i - 1], levels[i - 1]];
    [up[0], up[1], up[2], up[3]] = [Math.min(up[0], 2 * a), Math.min(up[1], 2 * b), Math.max(up[2], Math.min(2 * c + 1, m.width - 1)), Math.max(up[3], Math.min(2 * d + 1, m.height - 1))];
  }
  return rects;
}

/**
 * Texels x0..x1, y0..y1 (inclusive) of a level, into `out` row by row, from
 * the level above it, `pw` x `ph`: `src` holds its texels from (sx, sy) on,
 * `sw` wide (the atlas: 0, 0 and its width). Each averages its 2 x 2 block
 * (less where the level above is a texel thin), colors weighted by alpha.
 */
export function mipHalf(src: Uint8Array, sw: number, sx: number, sy: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number, out: Uint8Array) {
  let o = 0;
  for (let y = y0; y <= y1; y++) {
    const rows = Math.min(2, ph - 2 * y);
    for (let x = x0; x <= x1; x++) {
      const cols = Math.min(2, pw - 2 * x);
      const i = ((2 * y - sy) * sw + 2 * x - sx) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (rows === 2 && cols === 2) {
        // Almost every block: whole, unrolled.
        const j = i + sw * 4;
        const [t0, t1, t2, t3] = [src[i + 3], src[i + 7], src[j + 3], src[j + 7]];
        r = src[i] * t0 + src[i + 4] * t1 + src[j] * t2 + src[j + 4] * t3;
        g = src[i + 1] * t0 + src[i + 5] * t1 + src[j + 1] * t2 + src[j + 5] * t3;
        b = src[i + 2] * t0 + src[i + 6] * t1 + src[j + 2] * t2 + src[j + 6] * t3;
        a = t0 + t1 + t2 + t3;
      } else
        for (let v = 0; v < rows; v++)
          for (let k = i + v * sw * 4, end = k + cols * 4; k < end; k += 4) {
            const t = src[k + 3];
            r += src[k] * t;
            g += src[k + 1] * t;
            b += src[k + 2] * t;
            a += t;
          }
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / (rows * cols));
      o += 4;
    }
  }
}
