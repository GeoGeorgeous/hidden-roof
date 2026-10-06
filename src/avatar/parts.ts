import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The figure's geometry: low-poly boxes, each following exactly one bone (skin
// weight 1), merged into one geometry with vertex colors. One draw call for the
// whole body, and animating it only turns bones.

type V3 = [number, number, number];

const m4 = new THREE.Matrix4();

export class Parts {
  private geos: THREE.BufferGeometry[] = [];

  constructor(private index: (bone: string) => number) {}

  /** A box centered at `c` (rest pose, figure space), sized `size`, turned by `rot` (radians, XYZ). */
  box(bone: string, c: V3, size: V3, color: string, rot: V3 = [0, 0, 0]) {
    const g = unitBox();
    g.applyMatrix4(m4.compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...size)));
    this.push(bone, g, color);
  }

  /**
   * A limb from a to b: a box whose cross-section goes from w0 x d0 at a to
   * w1 x d1 at b (width across the figure, depth front to back).
   */
  limb(bone: string, a: THREE.Vector3, b: THREE.Vector3, [w0, d0]: [number, number], [w1, d1]: [number, number], color: string) {
    const g = unitBox();
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5;
      p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * t), t, p.getZ(i) * (d0 + (d1 - d0) * t));
    }
    // Local y runs a -> b; local x stays across the figure (along z for a limb that runs along x).
    const y = b.clone().sub(a);
    const dir = y.clone().normalize();
    const x = Math.abs(dir.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    x.addScaledVector(dir, -x.dot(dir)).normalize();
    g.applyMatrix4(m4.makeBasis(x, y, new THREE.Vector3().crossVectors(x, dir)).setPosition(a));
    this.push(bone, g, color);
  }

  /** All parts as one geometry, with color, skinIndex and skinWeight. */
  merge() {
    const g = mergeGeometries(this.geos)!;
    for (const p of this.geos) p.dispose();
    this.geos = [];
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  private push(bone: string, g: THREE.BufferGeometry, color: string) {
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(color);
    const i = this.index(bone);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: n }, () => [i, 0, 0, 0]).flat(), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [1, 0, 0, 0]).flat(), 4));
    this.geos.push(g);
  }
}

/** A 1 m box around the origin without shared vertices (flat faces) and without UVs. */
function unitBox() {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}
