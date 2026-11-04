import type { Box } from './paint-raster';
import { painted, resampleRect } from './paint-resample';
import { faceKey, hasPaint, rectsOf, type PaintPatch, type PaintSurface } from './paint-surface';
import type { Rect } from './surfaces';

// Paint copied as texels, not painted: a face carried over a rebuild, a face
// from a save, a box kept for undo. Plain work on atlases: PaintSystem makes
// sure the paint exists and uploads what changed.

/** Face `b` of a surface takes face `a` of `from`. */
export interface CarriedFace {
  from: PaintSurface;
  a: number;
  b: number;
}

/** The surfaces of `fresh` with paint to take from the faces of `old` in the same place, one at a time: a face that became covered (level/cover.ts) has none. */
export function* carriedFaces(old: readonly PaintSurface[], fresh: readonly PaintSurface[]) {
  const from = new Map<string, { s: PaintSurface; a: number }>();
  for (const s of old) if (hasPaint(s)) s.geo.rects.forEach((r, a) => from.set(faceKey(s, r, a), { s, a }));
  if (!from.size) return;
  for (const s of fresh) {
    const faces = s.geo.rects.flatMap((r, b): CarriedFace[] => {
      const f = from.get(faceKey(s, r, b));
      return f && hasPaint(f.s) && painted(f.s.data, f.s.geo.atlasW, f.s.geo.rects[f.a]) ? [{ from: f.s, a: f.a, b }] : [];
    });
    if (faces.length) yield { s, faces };
  }
}

/** Copies faces into `s`, resampled when the atlas differs. */
export function copyFaces(s: PaintSurface, faces: readonly CarriedFace[]) {
  for (const { from, a, b } of faces) resampleRect(from.data!, from.geo.atlasW, from.geo.rects[a], s.data!, s.geo.atlasW, s.geo.rects[b]);
}

/** Face `r` of `s` takes a saved one, `w` x `h` texels plus its 1-texel ring: copied as is at the same size, else resampled like a paint detail change. */
export function putCrop(s: PaintSurface, r: Rect, crop: Uint8Array, w: number, h: number) {
  const atlasW = s.geo.atlasW;
  if (w === r.w && h === r.h) {
    const row = (w + 2) * 4;
    for (let y = 0; y < h + 2; y++) s.data!.set(crop.subarray(y * row, (y + 1) * row), ((r.y - 1 + y) * atlasW + r.x - 1) * 4);
  } else resampleRect(crop, w + 2, { x: 1, y: 1, w, h }, s.data!, atlasW, r);
}

/** Face `rect` and its ring, as a box. */
export function faceBox(s: PaintSurface, rect: number): Box {
  const r = s.geo.rects[rect];
  return [r.x - 1, r.y - 1, r.x + r.w, r.y + r.h];
}

/** A box of a surface's paint as it is now, to put back with PaintSystem.unpatch (build mode's undo). */
export function patchOf(s: PaintSurface, box: Box): PaintPatch {
  const w = s.geo.atlasW;
  const [x0, y0, x1, y1] = box;
  let data: Uint8Array | null = null;
  if (s.data) {
    data = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1) * 4);
    for (let y = y0; y <= y1; y++) data.set(s.data.subarray((y * w + x0) * 4, (y * w + x1 + 1) * 4), (y - y0) * (x1 - x0 + 1) * 4);
  }
  return { key: s.key, atlas: [w, s.geo.atlasH], box, data, rects: rectsOf(s) };
}

/** Whether `s` is still the surface a patch was made on: the same atlas size and faces. */
export function patchFits(s: PaintSurface, { atlas, rects }: PaintPatch) {
  if (s.geo.atlasW !== atlas[0] || s.geo.atlasH !== atlas[1]) return false;
  const now = rectsOf(s);
  return now.length === rects.length && now.every((n, i) => n === rects[i]);
}

/** Writes a patch into `s` (none in it: wipes its box); restored paint is dry. */
export function putPatch(s: PaintSurface, { atlas, box, data }: PaintPatch) {
  const w = atlas[0];
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0 + 1;
  for (let y = y0; y <= y1; y++) {
    const at = y * w + x0;
    const i = (y - y0) * bw;
    if (data) s.data!.set(data.subarray(i * 4, (i + bw) * 4), at * 4);
    else s.data!.fill(0, at * 4, (at + bw) * 4);
    s.wet?.fill(0, at, at + bw);
  }
}
