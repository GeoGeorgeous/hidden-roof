import * as THREE from 'three';
import { SKYLINE } from './config';
import { makeSurfaceMaterial } from './materials';
import { layoutCity } from './city/layout';
import { CityMesh, disposeCityMesh } from './city/mesh';
import { Lines, setLineRange } from './city/lines';
import { dressTower, wallSigns } from './city/rooftops';
import { stringWires } from './city/wires';
import { lcg } from './lcg';

// The non-playable city around the level (src/city): towers in a street grid
// with barcode facades, packed rooftops, thin steel and wires drawn as pen lines.
// Seeded, so the same on every load; a level can override SKYLINE values in
// its own `skyline` object. Merged into chunks: draw calls grow with the area
// in view, not with the number of towers.

export type SkylineSettings = Partial<typeof SKYLINE>;

/** Free a skyline from buildSkyline: its geometry and materials. */
export function disposeSkyline(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  for (const o of group.children) {
    if ((o as THREE.Mesh).isMesh) {
      disposeCityMesh(o as THREE.Mesh);
      materials.add((o as THREE.Mesh).material as THREE.Material);
    } else (o as THREE.LineSegments).geometry.dispose();
  }
  for (const m of materials) m.dispose();
}

/** Live settings that need no rebuild. */
export function syncSkyline() {
  setLineRange(SKYLINE.lineRange);
}

export function buildSkyline(level: THREE.Box3, overrides: SkylineSettings = {}): THREE.Group {
  const cfg = { ...SKYLINE, ...overrides };
  const group = new THREE.Group();
  const mesh = new CityMesh();
  const signs = new CityMesh(true);
  const lines = new Lines();
  const towers = layoutCity(level, cfg);
  for (const tw of towers) {
    let y = cfg.street;
    for (const t of tw.tiers) {
      mesh.set(tw.gray, tw.facade, (t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2);
      mesh.box(t.x0, y, t.z0, t.x1, t.top, t.z1);
      y = t.top;
    }
    dressTower(tw, mesh, signs, lines);
    wallSigns(tw, signs, lines);
  }
  stringWires(towers, level, lines, lcg(cfg.seed * 31 + 5));
  // The street, far down in the void: nothing shows through under the city.
  mesh.set(0.1, undefined, 0, 0);
  mesh.box(-2000, cfg.street - 1, -2000, 2000, cfg.street, 2000);
  const material = makeSurfaceMaterial({ tex: 'flat' });
  for (const m of mesh.build(material)) group.add(m);
  const lettering = makeSurfaceMaterial({ tex: 'glyphs', tileMeters: 1 });
  for (const m of signs.build(lettering)) group.add(m);
  for (const l of lines.build()) group.add(l);
  syncSkyline();
  return group;
}
