import * as THREE from 'three';
import { SKYLINE } from './config';
import { makeSurfaceMaterial } from './materials';
import { layoutCity } from './city/layout';
import { CityMesh, disposeCityMesh } from './city/mesh';
import { Lines, setLineRange } from './city/lines';
import { dressTower } from './city/rooftops';

// The non-playable city around the level (src/city): towers in a street grid
// with barcode facades, packed rooftops, and thin steel drawn as pen lines.
// Seeded, so the same on every load; a level can override SKYLINE values in
// its own `skyline` object. Merged into chunks: draw calls grow with the area
// in view, not with the number of towers.

export type SkylineSettings = Partial<typeof SKYLINE>;

/** Free a skyline from buildSkyline: its geometry and material. */
export function disposeSkyline(group: THREE.Group) {
  let material: THREE.Material | null = null;
  for (const o of group.children) {
    if ((o as THREE.Mesh).isMesh) {
      disposeCityMesh(o as THREE.Mesh);
      material = (o as THREE.Mesh).material as THREE.Material;
    } else (o as THREE.LineSegments).geometry.dispose();
  }
  material?.dispose();
}

/** Live settings that need no rebuild. */
export function syncSkyline() {
  setLineRange(SKYLINE.lineRange);
}

export function buildSkyline(level: THREE.Box3, overrides: SkylineSettings = {}): THREE.Group {
  const cfg = { ...SKYLINE, ...overrides };
  const group = new THREE.Group();
  const mesh = new CityMesh();
  const lines = new Lines();
  for (const tw of layoutCity(level, cfg)) {
    let y = cfg.street;
    for (const t of tw.tiers) {
      mesh.set(tw.gray, tw.facade, (t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2);
      mesh.box(t.x0, y, t.z0, t.x1, t.top, t.z1);
      y = t.top;
    }
    dressTower(tw, mesh, lines);
  }
  // The street, far down in the void: nothing shows through under the city.
  mesh.set(0.1, undefined, 0, 0);
  mesh.box(-2000, cfg.street - 1, -2000, 2000, cfg.street, 2000);
  const material = makeSurfaceMaterial({ tex: 'flat' });
  for (const m of mesh.build(material)) group.add(m);
  for (const l of lines.build()) group.add(l);
  syncSkyline();
  return group;
}
