import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mat } from '../kit/pieces';
import { BAKED_ATTRIBUTES, swingDepthMaterial } from '../materials';
import { decorMaterial, matKey, type BuiltProp } from './build-prop';

// All non-paintable decor of the level, merged into one mesh per material, so
// draw calls don't grow with the number of props. Also one shadow proxy: the
// paint meshes' geometry merged into a mesh that only casts shadows, so shadow
// passes cost a handful of draws instead of one per paint mesh.
// Rebuilt lazily after edits. Baked light (render/bake) lives on the proxies;
// a rebake copies it into the merged batch in place.

const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

export class DecorBatches {
  readonly root = new THREE.Group();
  private dirty = false;
  /** Where each proxy geometry's vertices start in its merged batch. */
  private ranges = new Map<THREE.BufferGeometry, { batch: THREE.BufferGeometry; start: number }>();

  markDirty() {
    this.dirty = true;
  }

  /** Rebuild if anything changed since the last call. */
  flush(built: Iterable<BuiltProp>) {
    if (!this.dirty) return;
    this.dirty = false;
    for (const m of this.root.children as THREE.Mesh[]) m.geometry.dispose();
    this.root.clear();
    this.ranges.clear();
    const groups = new Map<string, { mat: Mat; geos: THREE.BufferGeometry[] }>();
    for (const b of built) {
      for (const proxy of b.decor) {
        const mat = proxy.userData.mat as Mat;
        const k = matKey(mat);
        if (!groups.has(k)) groups.set(k, { mat, geos: [] });
        groups.get(k)!.geos.push(proxy.geometry);
      }
    }
    const paintGeos: THREE.BufferGeometry[] = [];
    for (const b of built) for (const s of b.paint) paintGeos.push(positionsOnly(s.mesh.geometry));
    if (paintGeos.length) {
      const proxy = new THREE.Mesh(mergeGeometries(paintGeos), shadowOnly);
      for (const g of paintGeos) g.dispose();
      proxy.castShadow = true;
      proxy.matrixAutoUpdate = false;
      proxy.frustumCulled = false;
      proxy.raycast = () => {};
      this.root.add(proxy);
    }
    for (const { mat, geos } of groups.values()) {
      const g = mergeGeometries(geos);
      let start = 0;
      for (const p of geos) {
        this.ranges.set(p, { batch: g, start });
        start += p.attributes.position.count;
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, decorMaterial(mat));
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = swingDepthMaterial; // swinging parts cast moving shadows
      mesh.raycast = () => {}; // proxies handle raycasts
      this.root.add(mesh);
    }
  }

  /**
   * Copy a proxy's baked light into its batch (only that range is uploaded).
   * While a re-merge is pending it does nothing: the merge copies the proxy's
   * current values anyway.
   */
  pushBaked(geo: THREE.BufferGeometry) {
    const r = this.dirty ? undefined : this.ranges.get(geo);
    if (!r) return;
    for (const name of BAKED_ATTRIBUTES) {
      const src = geo.attributes[name] as THREE.BufferAttribute;
      const dst = r.batch.attributes[name] as THREE.BufferAttribute;
      const at = r.start * src.itemSize;
      (dst.array as Float32Array).set(src.array as Float32Array, at);
      dst.addUpdateRange(at, src.array.length);
      dst.needsUpdate = true;
    }
  }
}

function positionsOnly(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setIndex(g.index);
  return out;
}
