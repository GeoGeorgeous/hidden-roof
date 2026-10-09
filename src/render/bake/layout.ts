import * as THREE from 'three';
import { packRects, type Rect, type SurfaceGeometry } from '../../surfaces';

// Lightmap layout of one paintable surface. Every face of its paint atlas gets
// a rect at LIGHTMAP.texelsPerMeter (much coarser than paint), packed into the
// surface's own light atlas with a 1-texel gutter, and the geometry gets its
// `lightUv` (layoutLightmap: cheap, when the surface comes, so the level can
// merge it). Its texels are worked out on its first bake (lightTexels): per
// covered texel, the world point and normal the bake lights. Gutter texels and
// texels no triangle covers (round caps) copy their nearest covered neighbor,
// so bilinear filtering never pulls black into a face.

export interface LightLayout {
  w: number;
  h: number;
  rects: Rect[];
  /** Per vertex: its place in light texels. */
  tex: Float32Array;
  /** Made on the first bake (lightTexels). */
  texels: LightTexels | null;
}

export interface LightTexels {
  /** Per covered texel: world position xyz, then normal xyz. */
  points: Float32Array;
  /** Per covered texel: its pixel (y * w + x). */
  pixels: Int32Array;
  /** Pairs (pixel to fill, covered pixel to copy). */
  fill: Int32Array;
}

const STEPS = [1, 0, -1, 0, 0, 1, 0, -1];

/** `paintDensity`: texels per meter the paint atlas was built with; `density`: light texels per meter. */
export function layoutLightmap(geo: SurfaceGeometry, paintDensity: number, density: number): LightLayout {
  const k = density / paintDensity;
  const rects: Rect[] = geo.rects.map((r) => ({ x: 0, y: 0, w: Math.max(1, Math.ceil(r.w * k - 1e-6)), h: Math.max(1, Math.ceil(r.h * k - 1e-6)) }));
  const { w, h } = packRects(rects);
  const g = geo.geometry;
  const n = g.attributes.position.count;

  // Vertex coords in light texels, and the uv the shader samples with.
  const tex = new Float32Array(n * 2);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ri = Math.floor(geo.faceUv[i * 2]);
    const r = rects[ri];
    tex[i * 2] = r.x + ((geo.faceUv[i * 2] - ri) / 0.999) * r.w;
    tex[i * 2 + 1] = r.y + geo.faceUv[i * 2 + 1] * r.h;
    uv[i * 2] = tex[i * 2] / w;
    uv[i * 2 + 1] = tex[i * 2 + 1] / h;
  }
  g.setAttribute('lightUv', new THREE.BufferAttribute(uv, 2));
  return { w, h, rects, tex, texels: null };
}

/** A layout's texels: what each covered one lights, and how the rest are filled. */
export function lightTexels(geo: SurfaceGeometry, { w, h, rects, tex }: LightLayout): LightTexels {
  const g = geo.geometry;
  // Rasterize: a texel whose center lies in a triangle takes its interpolated point and normal.
  const P = g.attributes.position.array;
  const N = g.attributes.normal.array;
  const index = g.index!.array;
  const covered = new Int8Array(w * h);
  const perRect = new Int32Array(rects.length);
  const points: number[] = [];
  const pixels: number[] = [];
  const cover = (pix: number, a: number, b: number, c: number, wa: number, wb: number, wc: number) => {
    covered[pix] = 1;
    pixels.push(pix);
    for (let j = 0; j < 3; j++) points.push(P[a * 3 + j] * wa + P[b * 3 + j] * wb + P[c * 3 + j] * wc);
    const nx = N[a * 3] * wa + N[b * 3] * wb + N[c * 3] * wc;
    const ny = N[a * 3 + 1] * wa + N[b * 3 + 1] * wb + N[c * 3 + 1] * wc;
    const nz = N[a * 3 + 2] * wa + N[b * 3 + 2] * wb + N[c * 3 + 2] * wc;
    const l = Math.hypot(nx, ny, nz) || 1;
    points.push(nx / l, ny / l, nz / l);
  };
  for (let t = 0; t < index.length / 3; t++) {
    const a = index[t * 3];
    const b = index[t * 3 + 1];
    const c = index[t * 3 + 2];
    const ri = geo.triToRect[t];
    const r = rects[ri];
    const [ax, ay, bx, by, cx, cy] = [tex[a * 2], tex[a * 2 + 1], tex[b * 2], tex[b * 2 + 1], tex[c * 2], tex[c * 2 + 1]];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(r.x, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(r.x + r.w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(r.y, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(r.y + r.h - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const pix = y * w + x;
        if (covered[pix]) continue;
        const px = x + 0.5 - cx;
        const py = y + 0.5 - cy;
        const wa = ((by - cy) * px + (cx - bx) * py) / det;
        const wb = ((cy - ay) * px + (ax - cx) * py) / det;
        const wc = 1 - wa - wb;
        if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
        cover(pix, a, b, c, wa, wb, wc);
        perRect[ri]++;
      }
    }
  }
  // A sliver face no texel center falls in still gets one texel, at its first triangle's center.
  for (let t = 0; t < index.length / 3; t++) {
    const ri = geo.triToRect[t];
    if (perRect[ri]) continue;
    const r = rects[ri];
    const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
    const x = Math.min(r.x + r.w - 1, Math.max(r.x, Math.floor((tex[a * 2] + tex[b * 2] + tex[c * 2]) / 3)));
    const y = Math.min(r.y + r.h - 1, Math.max(r.y, Math.floor((tex[a * 2 + 1] + tex[b * 2 + 1] + tex[c * 2 + 1]) / 3)));
    cover(y * w + x, a, b, c, 1 / 3, 1 / 3, 1 / 3);
    perRect[ri]++;
  }

  // Fill each rect's uncovered texels and gutter from the nearest covered texel (breadth-first).
  const fill: number[] = [];
  const source = new Int32Array(w * h).fill(-1);
  for (const r of rects) {
    const queue: number[] = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const pix = y * w + x;
        if (!covered[pix]) continue;
        source[pix] = pix;
        queue.push(pix);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const pix = queue[q];
      const x = pix % w;
      const y = (pix - x) / w;
      for (let s = 0; s < 8; s += 2) {
        const nx = x + STEPS[s];
        const ny = y + STEPS[s + 1];
        if (nx < r.x - 1 || nx > r.x + r.w || ny < r.y - 1 || ny > r.y + r.h) continue;
        const next = ny * w + nx;
        if (source[next] >= 0) continue;
        source[next] = source[pix];
        fill.push(next, source[pix]);
        queue.push(next);
      }
    }
  }
  return { points: Float32Array.from(points), pixels: Int32Array.from(pixels), fill: Int32Array.from(fill) };
}
