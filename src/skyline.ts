import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSurfaceMaterial, tintGeometry, type TexName } from './materials';
import { FACADES, type Facade } from './render/ink/facade';
import { boxSurface, type BoxFace } from './surfaces';
import { lcg } from './lcg';

// Non-paintable city around the level: deterministic random towers, merged
// into a few draw calls. Buildings overlapping the level's bounds are left out.

type Box6 = [number, number, number, number, number, number];
const STYLES = Object.values(FACADES) as Facade[];

const STREET = -90;

function merged(boxes: Box6[], tex: TexName, tint: string, tile: number, skip: BoxFace[], facades?: Facade[]) {
  if (!boxes.length) return null;
  const geos = boxes.map(([x0, y0, z0, x1, y1, z1], i) =>
    tintGeometry(boxSurface(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), skip, false).geometry, tint, 0, 0, facades?.[i]),
  );
  const g = mergeGeometries(geos);
  for (const s of geos) s.dispose();
  g.computeBoundingSphere();
  const mat = makeSurfaceMaterial({ tex, tileMeters: tile });
  const mesh = new THREE.Mesh(g, mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Free a skyline from buildSkyline: its geometry and materials (the base textures are shared). */
export function disposeSkyline(group: THREE.Group) {
  for (const m of group.children as THREE.Mesh[]) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
}

export function buildSkyline(level: THREE.Box3): THREE.Group {
  const group = new THREE.Group();
  const m = 7;
  const clear = (x0: number, z0: number, x1: number, z1: number) =>
    level.isEmpty() || x1 < level.min.x - m || x0 > level.max.x + m || z1 < level.min.z - m || z0 > level.max.z + m;
  const rnd = lcg(7);
  const towers: Box6[] = [];
  const styles: Facade[] = [];
  const tops: Box6[] = [];
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
      const style = STYLES[Math.floor(rnd() * STYLES.length)];
      const ok = clear(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
      if (ok) {
        towers.push([cx - sx / 2, STREET, cz - sz / 2, cx + sx / 2, top, cz + sz / 2]);
        styles.push(style);
      }
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
    merged(towers, 'flat', '#c4c4c4', 1, ['-y', '+y'], styles),
    merged(towers, 'flat', '#8a8a8a', 1, ['-y', '+x', '-x', '+z', '-z']),
    merged(tops, 'flat', '#9a9a9a', 1, ['-y']),
    merged([[-600, STREET - 1, -600, 600, STREET, 600]], 'flat', '#15171c', 16, ['-y']),
  ];
  for (const p of parts) if (p) group.add(p);
  return group;
}
