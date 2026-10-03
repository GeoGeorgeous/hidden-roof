import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropDef } from '../kit/def';
import type { V3 } from '../kit/pieces';
import { expandPieces } from '../level/build-prop';

// Translucent preview of the prop about to be placed: green when valid, red when
// it overlaps something or can't go on this face.

const GREEN = new THREE.Color('#3dff7a');
const RED = new THREE.Color('#ff3b30');

export class Ghost {
  readonly root = new THREE.Group();
  /** World-space colliders of the previewed prop (for the overlap test). */
  colliders: THREE.Box3[] = [];
  private material = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.4, depthWrite: false });
  private mesh: THREE.Mesh | null = null;
  private key = '';

  constructor(scene: THREE.Scene) {
    this.root.renderOrder = 10;
    scene.add(this.root);
  }

  /** `stack`: the prop's stacking neighbors there (a block on a block is one storey). */
  showProp(def: PropDef, pos: V3, rot: number, stack: { above: boolean; below: boolean }) {
    const key = `${def.type}|${pos.join(',')}|${rot}|${stack.above}|${stack.below}`;
    if (key === this.key) return;
    this.key = key;
    const ex = expandPieces(def.build({ seed: 0, pos, ...stack, adjust: def.adjust?.initial() ?? 0 }), pos, rot, false);
    const geos = ex.decor.map((d) => stripToPosition(d.geo));
    this.setGeometry(geos.length ? mergeGeometries(geos) : null);
    this.colliders = ex.colliders;
  }

  /** Pickups preview as a simple glowing column. */
  showPickup(pos: V3) {
    const key = `pickup|${pos.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const g = new THREE.BoxGeometry(0.5, 1.0, 0.5);
    g.translate(pos[0], pos[1] + 0.5, pos[2]);
    this.setGeometry(g);
    this.colliders = [new THREE.Box3(new THREE.Vector3(pos[0] - 0.25, pos[1] + 0.05, pos[2] - 0.25), new THREE.Vector3(pos[0] + 0.25, pos[1] + 1, pos[2] + 0.25))];
  }

  setValid(valid: boolean) {
    this.material.color.copy(valid ? GREEN : RED);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  private setGeometry(g: THREE.BufferGeometry | null) {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.root.remove(this.mesh);
      this.mesh = null;
    }
    if (!g) return;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 10;
    this.root.add(this.mesh);
  }
}

/** Ghost only needs positions + normals; drop the rest so merging never mismatches. */
function stripToPosition(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setIndex(g.index);
  return out;
}
