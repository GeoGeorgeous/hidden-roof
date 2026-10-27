import type { PaintDrips } from '../src/paint-drips';
import type { PaintSystem } from '../src/painting';
import { loadPaint } from '../src/save/load-paint';
import { eachFace, readPaintHeader } from '../src/save/paint-file';
import { Refused } from './refused';
import { paintMemory } from './world';

// Whether a paint file is for a session: the admin's restore (kept.ts) and uploads (uploads.ts) check one as it is loaded.

/** The most bytes of paint a file may hold for a session: its level all painted, at the highest detail (a save may be made at any), with each face's ring. */
export const mostPaint = (paint: PaintSystem, detail: number) => paintMemory(paint).full * 2 ** 20 * (96 / detail) ** 2 * 1.25;

/**
 * Throws Refused with why unless `bytes` is a paint file of this level, made at this detail, whose faces all fit
 * `paint`'s surfaces (the surface table) and which inflates whole. It reads the file a face at a time and
 * changes nothing: all its paint is never in memory.
 */
export async function fit(bytes: Uint8Array, level: string, detail: number, paint: PaintSystem, drips: PaintDrips) {
  try {
    const file = readPaintHeader(bytes, mostPaint(paint, detail));
    const { header } = file;
    if (header.level.name !== level) throw new Refused(`level: the paint is of ${JSON.stringify(header.level.name)}, not ${JSON.stringify(level)}`);
    if (header.density !== detail) throw new Refused(`detail: the paint is at ${header.density} texels per meter, not ${detail}`);
    const { skipped } = await loadPaint(paint, drips, { header, body: new Uint8Array(0) }, { name: level }, undefined, false);
    if (skipped) throw new Refused(`surface table: ${skipped} of ${header.faces.length} faces no longer fit this level`);
    await eachFace(file, () => {});
  } catch (e) {
    throw e instanceof Refused ? e : new Refused((e as Error).message);
  }
}
