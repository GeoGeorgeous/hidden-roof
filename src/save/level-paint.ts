import type { LevelData } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { loadPaint } from './load-paint';

// LEVEL PAINT: the paint a level ships with (its control hints), a paint file
// like any save (paint-file.ts) next to its level file:
// public/levels/<name>.rhhpaint, made in build mode (build/paint-editor.ts),
// whose P also marks the level file (`paint`): only then is it fetched, so a
// level without paint asks for nothing (a 404 would show in the console).
// A fresh game puts it on the walls as the level loads, and from then on it's
// ordinary paint: painted over, scrubbed off, saved with the rest. A session
// starts from it when its host picks FRESH LEVEL (net/net-menu.ts); joiners
// take the session's paint, never their own copy.

/** The start level's own paint, as fetched: what FRESH LEVEL starts from. */
let shipped: { name: string; bytes: Uint8Array } | null = null;

/**
 * The level's own paint, if its file `data` says it has some, on the walls of
 * the level just loaded from it, replacing any paint. Faces of props changed
 * since it was saved are skipped; a file that's missing or no good leaves the
 * walls clean (both said in the console).
 */
export async function putLevelPaint(paint: PaintSystem, drips: PaintDrips, name: string, data: LevelData) {
  if (!data.paint) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}levels/${name}.rhhpaint`);
    if (!res.ok) throw new Error(`${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { skipped } = await loadPaint(paint, drips, bytes, { name });
    shipped = { name, bytes };
    if (skipped) console.warn(`level paint of ${name}: ${skipped} faces skipped, their props changed since`);
  } catch (e) {
    console.warn(`level paint of ${name}: ${(e as Error).message}`);
  }
}

/** The paint file of level `name`'s own paint, if it has some. */
export const levelPaintOf = (name: string) => (shipped?.name === name ? shipped.bytes : null);
