// Paint save size and time: fills a share of every face of the demo level with
// paint, then times SAVE (faces copied and deflated) and LOAD (inflated, put
// back, uploaded), at LOW and ULTRA. Two kinds of paint: real (the most painted
// face of the golden strokes, tiled; run `npm run golden` first, it writes
// shots/golden/<detail>.rhhpaint) and random dots of random colors (barely
// compresses: the worst case). Tiling repeats, so real paint is the best case.
// Times are SwiftShader's; the upload is far faster on a real GPU.
// Usage: node scripts/save-size.bench.mjs [url]   (no url: starts its own server)
import fs from 'node:fs';
import { decodePaintFile, faceBytes } from '../src/save/paint-file.ts';
import { gameReady, openTestBrowser } from './test-browser.mjs';

const SHARES = [0.1, 0.25, 1];

/** The most painted face of a golden save, cropped to its paint, as a tile. */
async function realTile(detail) {
  const path = `shots/golden/${detail}.rhhpaint`;
  if (!fs.existsSync(path)) throw new Error(`${path} is missing: run npm run golden first`);
  const { header, body } = await decodePaintFile(new Uint8Array(fs.readFileSync(path)));
  let o = 0;
  let best = null;
  for (const f of header.faces) {
    const crop = body.subarray(o, o + faceBytes(f));
    const W = f.w + 2;
    o += faceBytes(f);
    let [x0, y0, x1, y1, n] = [Infinity, Infinity, -1, -1, 0];
    for (let y = 0; y < f.h + 2; y++) for (let x = 0; x < W; x++) if (crop[(y * W + x) * 4 + 3]) [n, x0, y0, x1, y1] = [n + 1, Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    if (!best || n > best.n) best = { n, crop, W, x0, y0, x1, y1 };
  }
  const { crop, W, x0, y0, x1, y1 } = best;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(crop.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4), y * w * 4);
  return { w, h, data: Buffer.from(data).toString('base64') };
}

const test = await openTestBrowser(process.argv[2]);
console.log('| Detail | Paint | Faces painted | m² | File | SAVE | LOAD | upload |');
console.log('|---|---|---|---|---|---|---|---|');
for (const detail of ['low', 'ultra']) {
  const tile = await realTile(detail);
  for (const kind of ['real', 'random']) {
    const page = await test.browser.newPage({ viewport: { width: 320, height: 180 } });
    await page.addInitScript((d) => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: d, cityDetail: 'low' })), detail);
    await page.goto(test.url);
    await gameReady(page, 2);
    for (const share of SHARES) {
      const r = await page.evaluate(fill, { share, tile: kind === 'real' ? tile : null });
      console.log(`| ${detail.toUpperCase()} | ${kind} | ${Math.round(share * 100)}% | ${r.m2} | ${r.mb.toFixed(1)} MB | ${r.save} ms | ${r.load} ms | ${r.upload} ms |`);
    }
    await page.close();
  }
}
await test.close();

/** Runs in the page: paints `share` of all faces with the tile (or random dots), then saves and loads, timed. */
async function fill({ share, tile }) {
  const g = window.game;
  g.renderer.render = () => {};
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let Tw = 256;
  let Th = 256;
  let texels;
  if (tile) [Tw, Th, texels] = [tile.w, tile.h, Uint8Array.from(atob(tile.data), (c) => c.charCodeAt(0))];
  else {
    texels = new Uint8Array(Tw * Th * 4);
    for (let n = 0; n < 900; n++) {
      const [cx, cy, r, a] = [rnd() * Tw, rnd() * Th, 2 + rnd() * 10, 0.3 + rnd() * 0.6];
      const col = [rnd(), rnd(), rnd()].map((c) => Math.round(c * 255));
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d > 1) continue;
          const i = (((y + Th) % Th) * Tw + ((x + Tw) % Tw)) * 4;
          const k = a * (1 - d * d * 0.7);
          for (let c = 0; c < 3; c++) texels[i + c] = Math.round(texels[i + c] + (col[c] - texels[i + c]) * k);
          texels[i + 3] = Math.min(255, texels[i + 3] + Math.round(255 * k));
        }
    }
  }
  g.paint.clear();
  const tpm = g.config.PAINT.texelsPerMeter;
  let m2 = 0;
  for (const s of g.paint.surfaces)
    s.geo.rects.forEach((r, i) => {
      // A share of all faces, picked by a hash.
      if (((i * 2654435761 + s.key.length * 97) >>> 0) / 4294967296 >= share) return;
      const crop = new Uint8Array((r.w + 2) * (r.h + 2) * 4);
      for (let y = 0; y < r.h + 2; y++) for (let x = 0; x < r.w + 2; x++) crop.set(texels.subarray(((y % Th) * Tw + (x % Tw)) * 4, ((y % Th) * Tw + (x % Tw)) * 4 + 4), (y * (r.w + 2) + x) * 4);
      g.paint.putFace(s, i, crop, r.w, r.h);
      m2 += (r.w * r.h) / tpm ** 2;
    });
  g.paint.gpu.flush(g.renderer);
  let t = performance.now();
  const bytes = await g.paintFile.save();
  const save = performance.now() - t;
  t = performance.now();
  await g.paintFile.load(bytes);
  const load = performance.now() - t;
  t = performance.now();
  g.paint.gpu.flush(g.renderer);
  const upload = performance.now() - t;
  return { m2: Math.round(m2), mb: bytes.length / 1048576, save: Math.round(save), load: Math.round(load), upload: Math.round(upload) };
}
