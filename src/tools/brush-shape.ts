import * as THREE from 'three';
import { BRUSH } from '../config';

// The scrub brush's shape (BRUSH.model), shared by the view model and the
// pickup: a wooden block along x, bristle tufts under it (-y) splaying out past
// its edges (so they show around the block from any side), and a handle rising
// from its back toward +z. Centered on the block. `handleEnd` is where the
// handle ends (for the hand).

export function brushShape(wood: THREE.Material, bristles: THREE.Material) {
  const m = BRUSH.model;
  const g = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(m.blockLength, m.blockHeight, m.blockWidth), wood);
  g.add(block);
  // Tufts in a grid, a little apart and leaning out toward the rim, so they read as bristles.
  const across = Math.max(1, Math.round(m.tuftsAcross));
  const along = Math.max(1, Math.round(m.tuftsAlong));
  const spanX = m.blockLength * (1 + m.splay);
  const spanZ = m.blockWidth * (1 + m.splay);
  const sx = spanX / along;
  const sz = spanZ / across;
  const tuft = new THREE.BoxGeometry(sx * 0.6, m.bristleLength, sz * 0.6);
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const u = along > 1 ? (i / (along - 1)) * 2 - 1 : 0;
      const v = across > 1 ? (j / (across - 1)) * 2 - 1 : 0;
      const t = new THREE.Mesh(tuft, bristles);
      t.position.set((u * (spanX - sx)) / 2, -(m.blockHeight + m.bristleLength) / 2, (v * (spanZ - sz)) / 2);
      t.rotation.set(v * m.splay, 0, -u * m.splay);
      g.add(t);
    }
  }
  // Handle: from the top of the block, over its back edge, rising at handleAngle.
  const a = m.handleAngle;
  const dir = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
  const start = new THREE.Vector3(0, m.blockHeight / 2, 0);
  const handleEnd = start.clone().addScaledVector(dir, m.handleLength);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(m.handleThickness * 1.4, m.handleThickness, m.handleLength), wood);
  handle.position.copy(start).add(handleEnd).multiplyScalar(0.5);
  handle.rotation.x = -a;
  g.add(handle);
  return { group: g, handleEnd, handleDir: dir };
}
