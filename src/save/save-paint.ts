import { PAINT } from '../config';
import type { PaintSystem } from '../painting';
import { painted } from '../paint-resample';
import type { Rect } from '../surfaces';
import { encodePaintFile, faceBytes, joinBytes, type PaintFileFace } from './paint-file';
import { shapeOf } from './shape';

// SAVE: every painted face of every surface, as a paint file (paint-file.ts)
// for this level, at the paint detail played at. Faces without paint are left
// out, so a lightly painted level makes a small file.

/** The paint as a paint file. Read at once, so paint made while it's deflated isn't in it. */
export async function savePaint(paint: PaintSystem, level: { name: string }): Promise<Uint8Array> {
  const { header, read } = paintedFaces(paint, level);
  return joinBytes(await encodePaintFile(header, [...read(Infinity)]));
}

/**
 * The same as pieces, the paint read `chunk` bytes at a time while it's
 * deflated, so it's never all copied at once (the server, at ULTRA). The paint
 * must hold still until it's done. `raw`: bytes of paint in it.
 */
export async function streamPaint(paint: PaintSystem, level: { name: string }, chunk: number) {
  const { header, read, raw } = paintedFaces(paint, level);
  return { pieces: await encodePaintFile(header, read(chunk)), raw };
}

/** The painted faces as a paint file's header, and their paint in pieces of at most `chunk` bytes, read as they're asked for. */
function paintedFaces(paint: PaintSystem, level: { name: string }) {
  const surfaces: Record<string, string> = {};
  const parts: { face: PaintFileFace; data: Uint8Array; atlasW: number; r: Rect }[] = [];
  for (const s of paint.surfaces) {
    const data = s.data;
    if (!data) continue;
    s.geo.rects.forEach((r, rect) => {
      if (!painted(data, s.geo.atlasW, r)) return;
      parts.push({ face: { surface: s.key, rect, w: r.w, h: r.h }, data, atlasW: s.geo.atlasW, r });
      surfaces[s.key] ??= shapeOf(s.geo);
    });
  }
  const faces = parts.map((p) => p.face);
  const raw = faces.reduce((n, f) => n + faceBytes(f), 0);
  const header = { created: new Date().toISOString(), level, density: PAINT.texelsPerMeter, surfaces, faces };
  function* read(chunk: number) {
    let left = raw;
    let out = new Uint8Array(Math.min(chunk, left));
    let o = 0;
    // Each face with its 1-texel ring, row by row.
    for (const { data, atlasW, r } of parts) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        let i = (y * atlasW + r.x - 1) * 4;
        for (let n = (r.w + 2) * 4; n; ) {
          const k = Math.min(n, out.length - o);
          out.set(data.subarray(i, i + k), o);
          [o, i, n] = [o + k, i + k, n - k];
          if (o < out.length) continue;
          yield out;
          left -= o;
          out = new Uint8Array(Math.min(chunk, left));
          o = 0;
        }
      }
    }
  }
  return { header, read, raw };
}
