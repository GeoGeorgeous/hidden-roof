import * as THREE from 'three';
import { SPONGE } from '../config';
import { lcg } from '../lcg';

// The sponge's shape (SPONGE.model), shared by the view model and the pickup:
// a kitchen sponge, a soft block with a darker scouring pad on its front (-z,
// the side that goes on the wall) and pores dotted over the soft part's back,
// top and sides, always in the same places. Centered on the sponge.

export function spongeShape(soft: THREE.Material, pad: THREE.Material) {
  const m = SPONGE.model;
  const g = new THREE.Group();
  const pd = Math.min(m.padDepth, m.depth * 0.8);
  const body = new THREE.Mesh(new THREE.BoxGeometry(m.width, m.height, m.depth - pd), soft);
  body.position.z = pd / 2;
  g.add(body);
  if (pd > 0) {
    const scour = new THREE.Mesh(new THREE.BoxGeometry(m.width, m.height, pd), pad);
    scour.position.z = -(m.depth - pd) / 2;
    g.add(scour);
  }
  // Pores: small dark dents on the back (+z), top (+y) and the two ends (±x).
  const rnd = lcg(7);
  const pore = new THREE.BoxGeometry(m.poreSize, m.poreSize, m.poreSize);
  const w = m.width / 2;
  const h = m.height / 2;
  const back = m.depth / 2;
  const inset = m.poreSize * 0.3;
  for (let i = 0; i < m.pores; i++) {
    const p = new THREE.Mesh(pore, pad);
    const a = rnd() * 2 - 1;
    const b = rnd() * 2 - 1;
    const face = i % 4;
    if (face < 2) p.position.set(a * (w - m.poreSize), b * (h - m.poreSize), back - inset); // back, twice as many
    else if (face === 2) p.position.set(a * (w - m.poreSize), h - inset, pd / 2 + b * (back - pd / 2 - m.poreSize));
    else p.position.set((b > 0 ? 1 : -1) * (w - inset), a * (h - m.poreSize), pd / 2 + rnd() * (back - pd / 2 - m.poreSize));
    g.add(p);
  }
  return g;
}
