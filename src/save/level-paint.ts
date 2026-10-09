import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { putPaint } from './load-paint';
import { decodePaintFile, isPaintFile, type PaintFile } from './paint-file';

// LEVEL PAINT: the paint a level ships with (its control hints), a paint file
// like any save (paint-file.ts) next to its level file:
// public/levels/<name>.rhhpaint, made in build mode (build/paint-editor.ts).
// A fresh game puts it on the walls as the level loads, and from then on it's
// ordinary paint: painted over, scrubbed off, saved with the rest. A session
// starts from it when its host picks FRESH LEVEL (net/net-menu.ts); joiners
// take the session's paint, never their own copy.

export interface LevelPaint {
  /** The level it's for. */
  name: string;
  bytes: Uint8Array;
  file: PaintFile;
}

/** The level's own paint, or null when it has none (or it's no good: said in the console). */
export async function fetchLevelPaint(name: string): Promise<LevelPaint | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}levels/${name}.rhhpaint`);
    const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    // A level without one gets a 404, or the game's page from a dev server.
    if (!bytes || !isPaintFile(bytes)) return null;
    return { name, bytes, file: await decodePaintFile(bytes) };
  } catch (e) {
    console.warn(`level paint of ${name}: ${(e as Error).message}`);
    return null;
  }
}

/** On the walls of the level just loaded, replacing any paint: faces of props changed since it was saved are skipped (said in the console). */
export function putLevelPaint(paint: PaintSystem, drips: PaintDrips, own: LevelPaint) {
  try {
    const { skipped } = putPaint(paint, drips, own.file, { name: own.name });
    if (skipped) console.warn(`level paint of ${own.name}: ${skipped} faces skipped, their props changed since`);
  } catch (e) {
    console.warn(`level paint of ${own.name}: ${(e as Error).message}`);
  }
}
