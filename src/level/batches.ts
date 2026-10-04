import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RENDER } from '../config';
import type { Mat } from '../kit/pieces';
import { BAKED_ATTRIBUTES, swingDepthMaterial } from '../materials';
import { decorMaterial, matKey, type BuiltProp } from './build-prop';

// All non-paintable decor of the level, merged into one mesh per material
// per tile (RENDER.batchTile m square columns), so draw calls grow with the
// level's area, not with its number of props. Each tile also gets one shadow
// proxy: its paint meshes' geometry merged into a mesh that only casts
// shadows, so shadow passes cost a handful of draws instead of one per paint
// mesh. Tiles let three skip what's out of view (camera or moon shadow), and
// an edit re-merges only the tiles whose props changed.
// Baked light (render/bake) lives on the decor proxies; a rebake copies it
// into the merged batch in place.

// three.js has no shadow-only flag, so a shadow proxy is in the camera pass
// too. There this material puts every vertex outside the view: nothing is
// rasterized. The shadow pass draws it with three's own depth material.
const shadowOnly = new THREE.ShaderMaterial({
  vertexShader: 'void main() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
  colorWrite: false,
  depthWrite: false,
});

interface Tile {
  props: Set<BuiltProp>;
  meshes: THREE.Mesh[];
  /** Decor proxy geometries merged into `meshes` (their entries in `ranges`). */
  merged: THREE.BufferGeometry[];
  dirty: boolean;
}

export class DecorBatches {
  readonly root = new THREE.Group();
  private dirty = false;
  private tiles = new Map<string, Tile>();
  private tileOf = new Map<BuiltProp, Tile>();
  /** Where each proxy geometry's vertices start in its merged batch. */
  private ranges = new Map<THREE.BufferGeometry, { batch: THREE.BufferGeometry; start: number }>();

  markDirty() {
    this.dirty = true;
  }

  /** Re-merge the tiles whose props changed since the last call. */
  flush(built: readonly BuiltProp[]) {
    if (!this.dirty) return;
    this.dirty = false;
    const current = new Set(built);
    for (const [b, tile] of this.tileOf) {
      if (current.has(b)) continue;
      tile.props.delete(b);
      tile.dirty = true;
      this.tileOf.delete(b);
    }
    for (const b of built) {
      if (this.tileOf.has(b)) continue;
      const key = tileKey(b.bounds);
      let tile = this.tiles.get(key);
      if (!tile) this.tiles.set(key, (tile = { props: new Set(), meshes: [], merged: [], dirty: true }));
      tile.props.add(b);
      tile.dirty = true;
      this.tileOf.set(b, tile);
    }
    for (const [key, tile] of this.tiles) {
      if (!tile.dirty) continue;
      tile.dirty = false;
      this.clear(tile);
      if (tile.props.size) this.merge(tile);
      else this.tiles.delete(key);
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

  private clear(tile: Tile) {
    for (const m of tile.meshes) {
      m.geometry.dispose();
      this.root.remove(m);
    }
    for (const g of tile.merged) this.ranges.delete(g);
    tile.meshes = [];
    tile.merged = [];
  }

  private merge(tile: Tile) {
    const groups = new Map<string, { mat: Mat; geos: THREE.BufferGeometry[] }>();
    const paintGeos: THREE.BufferGeometry[] = [];
    for (const b of tile.props) {
      for (const proxy of b.decor) {
        const mat = proxy.userData.mat as Mat;
        const k = matKey(mat);
        if (!groups.has(k)) groups.set(k, { mat, geos: [] });
        groups.get(k)!.geos.push(proxy.geometry);
      }
      for (const s of b.paint) paintGeos.push(positionsOnly(s.mesh.geometry));
    }
    if (paintGeos.length) {
      const g = mergeGeometries(paintGeos);
      for (const p of paintGeos) p.dispose();
      g.computeBoundingSphere();
      const proxy = new THREE.Mesh(g, shadowOnly);
      proxy.castShadow = true;
      proxy.matrixAutoUpdate = false;
      proxy.raycast = () => {};
      this.add(tile, proxy);
    }
    for (const { mat, geos } of groups.values()) {
      const g = mergeGeometries(geos);
      let start = 0;
      for (const p of geos) {
        this.ranges.set(p, { batch: g, start });
        start += p.attributes.position.count;
        tile.merged.push(p);
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, decorMaterial(mat));
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = swingDepthMaterial; // swinging parts cast moving shadows
      mesh.raycast = () => {}; // proxies handle raycasts
      this.add(tile, mesh);
    }
  }

  private add(tile: Tile, mesh: THREE.Mesh) {
    tile.meshes.push(mesh);
    this.root.add(mesh);
  }
}

/** The tile a prop belongs to: the column its bounds' center is in. */
function tileKey(bounds: THREE.Box3) {
  const t = RENDER.batchTile;
  return `${Math.floor((bounds.min.x + bounds.max.x) / 2 / t)},${Math.floor((bounds.min.z + bounds.max.z) / 2 / t)}`;
}

function positionsOnly(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setIndex(g.index);
  return out;
}
