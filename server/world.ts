import * as THREE from 'three';
import type { LevelData } from '../src/level/level';
import { levelPaintFaces } from '../src/level/prop-pieces';
import type { SurfaceMaterial } from '../src/materials';
import { PaintDrips } from '../src/paint-drips';
import { PaintOps } from '../src/paint-ops';
import { PaintSystem } from '../src/painting';

// A session's paint on the server: the level's paint surfaces under the same
// keys as on every client, painted by the same code (painting.ts, paint-raster.ts)
// at the session's PAINT DETAIL. Nothing is drawn: textures exist but never
// reach a GPU.

const noMaterial = { setPaint() {} } as unknown as SurfaceMaterial;

export function sessionPaint(level: LevelData) {
  const paint = new PaintSystem();
  for (const { key, geo } of levelPaintFaces(level)) paint.register(key, new THREE.Mesh(), noMaterial, geo);
  const drips = new PaintDrips(paint);
  return { paint, drips, ops: new PaintOps(paint, drips) };
}
