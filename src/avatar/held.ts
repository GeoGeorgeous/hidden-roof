import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CapId, PaintColor } from '../config';
import type { Tool } from '../inventory/inventory';
import { STEPLADDER } from '../kit/access';
import { itemModel } from '../pickups/visuals';
import { inkify } from '../render/ink/tone';
import { shapes } from '../tools/shapes';

// The tool in the figure's hand: the pickup model (pickups/visuals.ts) at its
// real size (centered in the fist; the ladder is the real folded stepladder), inked like the figure and merged into one mesh, plus the can's
// label in its paint color and its cap in the cap's (the only color on a
// figure). Rebuilt only when the tool, the color or the cap changes.

let keptMaterial: THREE.Material | null = null;
/** For the parts that keep their color, on every figure: only darkened by the light. */
const keptInk = () => (keptMaterial ??= inkify(new THREE.MeshLambertMaterial({ vertexColors: true }), true));

export class Held {
  /** Sits in the hand's grip: its -z runs through the fist, its y out of the thumb side. */
  readonly group = new THREE.Group();
  /** Where paint leaves the can in hand, in `group` (the cap's tip). */
  readonly nozzle = new THREE.Vector3();
  private key = '';

  constructor(private ink: THREE.Material) {}

  set(tool: Tool | null, color: PaintColor, cap: CapId) {
    const kind = tool === 'can' ? `color:${color}` : (tool ?? '');
    const key = `${kind}:${tool === 'can' ? cap : ''}#${shapes.version}`;
    if (key === this.key) return;
    this.key = key;
    this.dispose();
    if (!tool) return;
    const model = tool === 'ladder' ? foldedLadder() : itemModel(kind, cap);
    if (tool !== 'ladder') {
      // The pickup leans and is shown at twice its size.
      model.rotation.set(0, 0, 0);
      model.scale.setScalar(1);
    }
    model.updateMatrixWorld(true);
    // Held in the fist: the model's up (the can's top, the roller's frame) points through it.
    const turn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const tip = model.getObjectByName('tip');
    if (tip) this.nozzle.setFromMatrixPosition(tip.matrixWorld).applyMatrix4(turn);
    const ink: THREE.BufferGeometry[] = [];
    const kept: THREE.BufferGeometry[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const c = (m.material as THREE.MeshBasicMaterial).color;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      g.deleteAttribute('uv');
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
      ((m.material as THREE.Material).userData.keep ? kept : ink).push(g);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    if (ink.length) this.group.add(this.mesh(ink, this.ink, turn));
    if (kept.length) this.group.add(this.mesh(kept, keptInk(), turn));
  }

  private mesh(geos: THREE.BufferGeometry[], material: THREE.Material, turn: THREE.Matrix4) {
    const g = mergeGeometries(geos)!.applyMatrix4(turn);
    for (const p of geos) p.dispose();
    return new THREE.Mesh(g, material);
  }

  private dispose() {
    for (const o of [...this.group.children]) {
      (o as THREE.Mesh).geometry.dispose();
      this.group.remove(o);
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
