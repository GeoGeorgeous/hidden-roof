import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, type PaintColor } from '../config';
import type { Tool } from '../inventory/inventory';
import { STEPLADDER } from '../kit/access';
import { itemModel } from '../pickups/visuals';
import { inkify } from '../render/ink/tone';

// The tool in the figure's hand: the pickup model (pickups/visuals.ts) at its
// real size, inked like the figure and merged into one mesh, plus the can's
// label in its paint color (the one color on a figure). Rebuilt only when the
// tool or the color changes.

/** Size against the pickup model at real size (the pickup's roller is small). */
const SIZE: Partial<Record<Tool, number>> = { roller: 1.5 };

export class Held {
  /** Sits in the hand's grip: its -z runs through the fist, its y out of the thumb side. */
  readonly group = new THREE.Group();
  private key = '';

  constructor(private ink: THREE.Material) {}

  set(tool: Tool | null, color: PaintColor) {
    const key = tool === 'can' ? `color:${color}` : (tool ?? '');
    if (key === this.key) return;
    this.key = key;
    this.dispose();
    if (!tool) return;
    const model = tool === 'ladder' ? foldedLadder() : itemModel(key);
    if (tool !== 'ladder') {
      // The pickup leans and is shown at twice its size.
      model.rotation.set(0, 0, 0);
      model.scale.multiplyScalar(0.5 * (SIZE[tool] ?? 1));
    }
    model.updateMatrixWorld(true);
    const ink: THREE.BufferGeometry[] = [];
    const paint: THREE.BufferGeometry[] = [];
    const label = tool === 'can' ? new THREE.Color(COLORS[color]) : null;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const c = (m.material as THREE.MeshBasicMaterial).color;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      g.deleteAttribute('uv');
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
      (label && c.equals(label) ? paint : ink).push(g);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    // Held in the fist: the model's up (the can's top, the roller's frame) points through it.
    const turn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    if (ink.length) this.group.add(this.mesh(ink, this.ink, turn));
    if (paint.length) this.group.add(this.mesh(paint, inkify(new THREE.MeshLambertMaterial({ color: label!, vertexColors: false }), true), turn));
  }

  private mesh(geos: THREE.BufferGeometry[], material: THREE.Material, turn: THREE.Matrix4) {
    const g = mergeGeometries(geos)!.applyMatrix4(turn);
    for (const p of geos) p.dispose();
    const m = new THREE.Mesh(g, material);
    m.userData.own = material !== this.ink;
    return m;
  }

  private dispose() {
    for (const o of [...this.group.children]) {
      const m = o as THREE.Mesh;
      m.geometry.dispose();
      if (m.userData.own) (m.material as THREE.Material).dispose();
      this.group.remove(m);
    }
  }
}

/**
 * The stepladder folded, at its real size (kit/access.ts), carried by its top
 * rail at the side: in the model's frame (before the grip's turn) it runs along
 * y and hangs toward -z.
 */
function foldedLadder() {
  const g = new THREE.Group();
  const { height: h, halfWidth: w } = STEPLADDER;
  const box = (x: number, z: number, size: [number, number, number], color: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, 0, z);
    g.add(m);
  };
  for (const x of [-0.025, 0.025]) for (const z of [0, -2 * w]) box(x, z, [0.022, h, 0.022], '#cfcfcf');
  for (const y of [-0.2, 0.2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 2 * w), new THREE.MeshBasicMaterial({ color: '#9aa0a6' }));
    m.position.set(-0.025, y, -w);
    g.add(m);
  }
  return g;
}
