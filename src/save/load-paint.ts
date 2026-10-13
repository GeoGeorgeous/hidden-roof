import type { PaintDrips } from '../paint-drips';
import type { PaintSurface, PaintSystem } from '../painting';
import { decodePaintFile, faceBytes, type DecodedPaint } from './paint-file';
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

/** A save none of whose paint fits this level (saved on another, or on a version of it built differently). */
export class NotThisLevel extends Error {}

/**
 * Throws an Error with a message for the player if the file is no good, a
 * NotThisLevel if none of it fits this level; `maxBytes`: the most paint it
 * may hold. `apply` false: only checks, changing nothing. `bytes` already
 * decoded (decodePaintFile): a check then a load decode the file once.
 */
export async function loadPaint(paint: PaintSystem, drips: PaintDrips, bytes: Uint8Array | DecodedPaint, level: { name: string }, maxBytes?: number, apply = true): Promise<LoadedPaint> {
  const { header, body } = bytes instanceof Uint8Array ? await decodePaintFile(bytes, maxBytes) : bytes;
  const fits = new Map<string, PaintSurface | null>();
  const fit = (key: string) => {
    if (!fits.has(key)) {
      const s = paint.find(key);
      fits.set(key, s && shapeOf(s.geo) === header.surfaces[key] ? s : null);
    }
    return fits.get(key)!;
  };
  const targets = header.faces.map((f) => {
    const s = fit(f.surface);
    return s && f.rect < s.geo.rects.length ? s : null;
  });
  const faces = targets.filter(Boolean).length;
  if (header.faces.length && !faces) {
    const name = header.level.name.toUpperCase();
    throw new NotThisLevel(header.level.name === level.name ? `SAVED FOR ANOTHER VERSION OF ${name}` : `SAVED FOR ${name}`);
  }
  const skipped = header.faces.length - faces;
  if (!apply) return { faces, skipped };
  paint.clear();
  drips.clear();
  let o = 0;
  header.faces.forEach((f, i) => {
    const s = targets[i];
    if (s) paint.putFace(s, f.rect, body.subarray(o, o + faceBytes(f)), f.w, f.h);
    o += faceBytes(f);
  });
  return { faces, skipped };
}
