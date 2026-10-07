import * as THREE from 'three';
import { INK } from '../config';
import type { PropDef } from '../kit/def';
import { expandPieces } from '../level/build-prop';

// A prop's icon in the build picker (inventory/thumbnails.ts renders it): its
// pieces drawn like the world, paper faces with ink edges, glowing pieces in
// their own color, seen from above at three quarters. Stacking props show one
// storey.

/** Edges between faces that turn more than this (degrees) are inked. */
const EDGE_ANGLE = 30;

export function propIcon(def: PropDef): THREE.Object3D {
  const pieces = def.build({ seed: 0, pos: [0, 0, 0], above: false, below: true, adjust: def.adjust?.initial() ?? 0, text: def.text ?? '' });
  const paper = new THREE.MeshBasicMaterial({ color: INK.paper, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const ink = new THREE.LineBasicMaterial({ color: INK.ink });
  const model = new THREE.Group();
  for (const { geo, mat } of expandPieces(pieces, [0, 0, 0], 0, false).decor) {
    const face = mat.emissive ? new THREE.MeshBasicMaterial({ color: mat.tint }) : paper;
    model.add(new THREE.Mesh(geo, face), new THREE.LineSegments(new THREE.EdgesGeometry(geo, EDGE_ANGLE), ink));
  }
  model.rotation.set(0.5, 0.6, 0);
  return model;
}
