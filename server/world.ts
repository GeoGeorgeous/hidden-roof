import * as THREE from 'three';
import type { LevelData } from '../src/level/level-data';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { PaintDrips } from '../src/paint-drips';
import { PaintOps } from '../src/paint-ops';
import { PaintSystem } from '../src/painting';

// A session's paint on the server: the level's paint surfaces under the same
// keys as on every client, painted by the same code (painting.ts, paint-raster.ts)
// at the session's PAINT DETAIL (texels per meter), which its surfaces keep. Nothing
// is drawn: textures exist but never reach a GPU.

export function sessionPaint(level: LevelData, texelsPerMeter: number) {
  const paint = new PaintSystem(texelsPerMeter);
  for (const { key, geo } of levelPaintFaces(level, texelsPerMeter)) paint.register(key, new THREE.Mesh(), geo, '');
  const drips = new PaintDrips(paint);
  return { paint, drips, ops: new PaintOps(paint, drips) };
}

/** Paint memory in MB now, and with every surface painted. */
export function paintMemory(paint: PaintSystem) {
  let now = 0;
  let full = 0;
  for (const s of paint.surfaces) {
    now += s.data?.length ?? 0;
    full += s.geo.atlasW * s.geo.atlasH * 4;
  }
  return { now: now / 2 ** 20, full: full / 2 ** 20 };
}
