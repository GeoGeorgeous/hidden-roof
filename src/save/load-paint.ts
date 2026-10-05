import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { decodePaintFile, faceBytes } from './paint-file';

// LOAD: replaces all paint with a save's (paint-file.ts), at this player's
// paint detail. A save made for another level, or another version of this one
// (edited in build mode), is refused before anything changes.

/** What a LOAD did: faces painted, and faces whose surface this level doesn't have. */
export interface LoadedPaint {
  faces: number;
  missing: number;
}

/** Throws an Error with a message for the player if the file is no good or belongs to another level. */
export async function loadPaint(paint: PaintSystem, drips: PaintDrips, bytes: Uint8Array, level: { name: string; hash: string }): Promise<LoadedPaint> {
  const { header, body } = await decodePaintFile(bytes);
  if (header.level.hash !== level.hash) {
    const name = String(header.level.name).toUpperCase();
    throw new Error(header.level.name === level.name ? `SAVED FOR ANOTHER VERSION OF ${name}` : `SAVED FOR ${name}`);
  }
  paint.clear();
  drips.clear();
  let o = 0;
  let missing = 0;
  for (const f of header.faces) {
    const s = paint.find(f.surface);
    if (s && f.rect < s.geo.rects.length) paint.putFace(s, f.rect, body.subarray(o, o + faceBytes(f)), f.w, f.h);
    else missing++;
    o += faceBytes(f);
  }
  return { faces: header.faces.length - missing, missing };
}
