import type { PaintDrips } from '../paint-drips';
import type { PaintSurface, PaintSystem } from '../painting';
import { decodePaintFile, faceBytes } from './paint-file';
import { shapeOf } from './shape';

// LOAD: replaces all paint with a save's (paint-file.ts), at this player's
// paint detail. Each face goes back where its surface still is, with the same
// shape (shape.ts): paint on props removed or changed since (edited in build
// mode, built differently by a newer game) is skipped. A save none of whose
// paint fits is refused before anything changes.

/** What a LOAD did: faces painted, and faces skipped (their surface is gone or changed). */
export interface LoadedPaint {
  faces: number;
  skipped: number;
}

/** Throws an Error with a message for the player if the file is no good or none of it fits this level. */
export async function loadPaint(paint: PaintSystem, drips: PaintDrips, bytes: Uint8Array, level: { name: string }): Promise<LoadedPaint> {
  const { header, body } = await decodePaintFile(bytes);
  const fits = new Map<string, PaintSurface | null>();
  const fit = (key: string) => {
    if (!fits.has(key)) {
      const s = paint.find(key);
      fits.set(key, s && shapeOf(s.geo) === header.surfaces[key] ? s : null);
    }
    return fits.get(key)!;
  };
  const targets = header.faces.map((f) => fit(f.surface));
  const faces = targets.filter(Boolean).length;
  if (header.faces.length && !faces) {
    const name = header.level.name.toUpperCase();
    throw new Error(header.level.name === level.name ? `SAVED FOR ANOTHER VERSION OF ${name}` : `SAVED FOR ${name}`);
  }
  paint.clear();
  drips.clear();
  let o = 0;
  header.faces.forEach((f, i) => {
    const s = targets[i];
    if (s) paint.putFace(s, f.rect, body.subarray(o, o + faceBytes(f)), f.w, f.h);
    o += faceBytes(f);
  });
  return { faces, skipped: header.faces.length - faces };
}
