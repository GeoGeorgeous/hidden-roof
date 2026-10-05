import { PAINT } from '../config';
import type { PaintSystem } from '../painting';
import { painted } from '../paint-resample';
import type { Rect } from '../surfaces';
import { encodePaintFile, faceBytes, type PaintFileFace } from './paint-file';

// SAVE: every painted face of every surface, as a paint file (paint-file.ts)
// for this level, at the paint detail played at. Faces without paint are left
// out, so a lightly painted level makes a small file.

export async function savePaint(paint: PaintSystem, level: { name: string; hash: string }): Promise<Uint8Array> {
  const parts: { face: PaintFileFace; data: Uint8Array; atlasW: number; r: Rect }[] = [];
  for (const s of paint.surfaces) {
    const data = s.data;
    if (!data) continue;
    s.geo.rects.forEach((r, rect) => {
      if (painted(data, s.geo.atlasW, r)) parts.push({ face: { surface: s.key, rect, w: r.w, h: r.h }, data, atlasW: s.geo.atlasW, r });
    });
  }
  const faces = parts.map((p) => p.face);
  const body = new Uint8Array(faces.reduce((n, f) => n + faceBytes(f), 0));
  let o = 0;
  // Each face with its 1-texel ring, row by row.
  for (const { data, atlasW, r } of parts) {
    const row = (r.w + 2) * 4;
    for (let y = r.y - 1; y <= r.y + r.h; y++, o += row) {
      const i = (y * atlasW + r.x - 1) * 4;
      body.set(data.subarray(i, i + row), o);
    }
  }
  return encodePaintFile({ created: new Date().toISOString(), level, density: PAINT.texelsPerMeter, faces }, body);
}
