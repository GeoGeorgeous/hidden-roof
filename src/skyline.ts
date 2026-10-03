import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKYLINE } from './config';
import { makeSurfaceMaterial, tintGeometry, type SurfaceMaterial, type TexName } from './materials';
import { boxSurface, type BoxFace } from './surfaces';

// Non-paintable city around the level: deterministic random towers, merged
// into a few draw calls. Buildings overlapping the level's bounds are left out.

type Box6 = [number, number, number, number, number, number];

/** Facade materials, kept so SKYLINE.windowScale applies live. */
const facades: SurfaceMaterial[] = [];

/** Apply SKYLINE.windowScale to the current skyline. */
export function syncSkylineScale() {
  for (const m of facades) m.setTileMeters(SKYLINE.windowScale);
}

const STREET = -90;

function merged(boxes: Box6[], tex: TexName, tint: string, tile: number, skip: BoxFace[]) {
  if (!boxes.length) return null;
  const geos = boxes.map(([x0, y0, z0, x1, y1, z1]) =>
    tintGeometry(boxSurface(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), skip, false).geometry, tint),
  );
  const g = mergeGeometries(geos);
  for (const s of geos) s.dispose();
  g.computeBoundingSphere();
  const mat = makeSurfaceMaterial({ tex, tileMeters: tile });
  if (tex.startsWith('facade')) facades.push(mat);
  const mesh = new THREE.Mesh(g, mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildSkyline(level: THREE.Box3): THREE.Group {
  const group = new THREE.Group();
  for (const f of facades) f.dispose();
  facades.length = 0;
  const m = 7;
  const clear = (x0: number, z0: number, x1: number, z1: number) =>
    level.isEmpty() || x1 < level.min.x - m || x0 > level.max.x + m || z1 < level.min.z - m || z0 > level.max.z + m;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const groups: Record<'facadeA' | 'facadeB' | 'facadeC', Box6[]> = { facadeA: [], facadeB: [], facadeC: [] };
  const tops: Box6[] = [];
  const keys = Object.keys(groups) as (keyof typeof groups)[];
  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      if (gx === 0 && gz === 0) continue;
      const cx = gx * 34 + (rnd() - 0.5) * 8;
      const cz = gz * 34 + (rnd() - 0.5) * 8;
      if (Math.hypot(cx, cz) < 26) continue;
      const sx = 10 + rnd() * 14;
      const sz = 10 + rnd() * 14;
      // Closer buildings are mostly lower so you can see over them; a few towers poke up.
      const tall = rnd() < 0.18;
      const top = tall ? 10 + rnd() * 45 : -30 + rnd() * 34;
      const group = groups[keys[Math.floor(rnd() * keys.length)]];
      const ok = clear(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
      if (ok) group.push([cx - sx / 2, STREET, cz - sz / 2, cx + sx / 2, top, cz + sz / 2]);
      if (rnd() < 0.7) {
        const hx = 2 + rnd() * 4;
        const hz = 2 + rnd() * 4;
        const ox = (rnd() - 0.5) * (sx - hx);
        const oz = (rnd() - 0.5) * (sz - hz);
        const h = 1.5 + rnd() * 3;
        if (ok) tops.push([cx + ox - hx / 2, top, cz + oz - hz / 2, cx + ox + hx / 2, top + h, cz + oz + hz / 2]);
      }
    }
  }
  const parts = [
    ...keys.map((k) => merged(groups[k], k, '#ffffff', SKYLINE.windowScale, ['-y', '+y'])),
    merged(keys.flatMap((k) => groups[k]), 'flat', '#2a2d33', 1, ['-y', '+x', '-x', '+z', '-z']),
    merged(tops, 'flat', '#30333a', 1, ['-y']),
    merged([[-600, STREET - 1, -600, 600, STREET, 600]], 'flat', '#15171c', 16, ['-y']),
  ];
  for (const p of parts) if (p) group.add(p);
  return group;
}
