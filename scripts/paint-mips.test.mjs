// Tests of paint mip levels (src/paint-mips.ts) in Node: each level made from
// the one above stays within a step of the true alpha-weighted average of its
// atlas block, and a changed rect made alone (as PaintGpu.upload makes it)
// gives exactly the texels the whole level would, thin levels included.
// Usage: node scripts/paint-mips.test.mjs
import assert from 'node:assert/strict';
import { mipHalf, mipRects, mipSizes } from '../src/paint-mips.ts';

let seed = 3;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/** Every level of a w x h atlas, whole, each from the one above. */
function levels(atlas, w, h, sizes) {
  const out = [];
  let [src, pw, ph] = [atlas, w, h];
  for (const m of sizes) {
    const level = new Uint8Array(m.width * m.height * 4);
    mipHalf(src, pw, 0, 0, pw, ph, 0, 0, m.width - 1, m.height - 1, level);
    out.push(level);
    [src, pw, ph] = [level, m.width, m.height];
  }
  return out;
}

for (const [w, h] of [[37, 21], [64, 64], [9, 2], [1, 13]]) {
  const atlas = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 && rnd() < 0.3 ? 0 : Math.floor(rnd() * 256)));
  const sizes = mipSizes(w, h, 4);
  const whole = levels(atlas, w, h, sizes);
  // Within a step of the true average of the atlas block (floor halves: a level-k texel covers 2^k x 2^k, less at a thin edge).
  sizes.forEach((m, k) => {
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++) {
        let [r, a, n] = [0, 0, 0];
        for (let v = y << (k + 1); v < Math.min(h, (y + 1) << (k + 1)); v++)
          for (let u = x << (k + 1); u < Math.min(w, (x + 1) << (k + 1)); u++) [r, a, n] = [r + atlas[(v * w + u) * 4] * atlas[(v * w + u) * 4 + 3], a + atlas[(v * w + u) * 4 + 3], n + 1];
        const got = whole[k].subarray((y * m.width + x) * 4, (y * m.width + x) * 4 + 4);
        if (h >= 2 << k && w >= 2 << k) assert.ok(Math.abs(got[3] - a / n) <= 1.5 && (!a || got[3] < 4 || Math.abs(got[0] - r / a) <= 3), `${w}x${h} level ${k + 1} texel ${x},${y}: ${[...got]} vs ${(r / a).toFixed(1)}, ${(a / n).toFixed(1)}`);
      }
  });
  // A changed rect made alone matches the whole level.
  for (let n = 0; n < 50; n++) {
    const [x0, y0] = [Math.floor(rnd() * w), Math.floor(rnd() * h)];
    const [x1, y1] = [Math.min(w - 1, x0 + Math.floor(rnd() * 12)), Math.min(h - 1, y0 + Math.floor(rnd() * 12))];
    let [src, sw, sx, sy, pw, ph] = [atlas, w, 0, 0, w, h];
    mipRects(sizes, x0, y0, x1, y1).forEach(([a, b, c, d], k) => {
      const out = new Uint8Array((c - a + 1) * (d - b + 1) * 4);
      mipHalf(src, sw, sx, sy, pw, ph, a, b, c, d, out);
      const m = sizes[k];
      for (let y = b; y <= d; y++) assert.deepEqual(out.subarray((y - b) * (c - a + 1) * 4, (y - b + 1) * (c - a + 1) * 4), whole[k].subarray((y * m.width + a) * 4, (y * m.width + c + 1) * 4), `${w}x${h} rect ${[x0, y0, x1, y1]} level ${k + 1} row ${y}`);
      // It covers what changed: the rect halved, inside the level.
      assert.ok(a <= Math.min(x0 >> (k + 1), m.width - 1) && c >= Math.min(x1 >> (k + 1), m.width - 1));
      [src, sw, sx, sy, pw, ph] = [out, c - a + 1, a, b, m.width, m.height];
    });
  }
}
console.log('paint mips: ok (levels within a step of the atlas average; a changed rect alone matches the whole level)');
