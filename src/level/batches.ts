import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mat } from '../kit/pieces';
import { BAKED_ATTRIBUTES, makeSurfaceMaterial, swingDepthMaterial, type SurfaceMaterial } from '../materials';
import type { PaintPage } from '../paint-gpu';
import type { PaintSurface } from '../painting';
import type { LightPage } from '../render/bake/light-pages';
import { decorMaterial, matKey, tileKey, type BuiltProp } from './build-prop';

// The level, merged per tile (RENDER.batchTile m square columns), so draw
// calls grow with the level's area, not with its number of props:
//  - decor: one mesh per material
//  - paintable surfaces: one mesh per material, paint page and light page
//    (paint-gpu.ts, render/bake/light-pages.ts), their uvs moved onto the
//    pages; each surface's own mesh stays, never drawn, for rays. Clear
//    glass gets two: its solid paint into the depth first, then its color.
//  - one shadow proxy: the surfaces' geometry merged into a mesh that only
//    casts shadows, so shadow passes cost a handful of draws
// Tiles let three skip what's out of view (camera or moon shadow), and an
// edit re-merges only the tiles whose props changed. Baked light (render/bake)
// lives on the decor proxies; a rebake copies it into the merged batch in
// place. Surfaces' light and paint live on the pages, so painting and
// baking never re-merge anything.

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
  /** The merged paintable surfaces (and their shadow proxies), and the merged decor. */
  readonly surfaces = new THREE.Group();
  readonly decor = new THREE.Group();
  private dirty = false;
  private tiles = new Map<string, Tile>();
  private tileOf = new Map<BuiltProp, Tile>();
  /** Where each proxy geometry's vertices start in its merged batch. */
  private ranges = new Map<THREE.BufferGeometry, { batch: THREE.BufferGeometry; start: number }>();

  constructor() {
    this.root.add(this.surfaces, this.decor);
  }

  markDirty() {
    this.dirty = true;
  }

  /** Merge every tile again (surfaces moved to other light blocks). */
  remergeAll() {
    for (const tile of this.tiles.values()) tile.dirty = true;
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
      m.removeFromParent();
    }
    for (const g of tile.merged) this.ranges.delete(g);
    tile.meshes = [];
    tile.merged = [];
  }

  private merge(tile: Tile) {
    const groups = new Map<string, { mat: Mat; geos: THREE.BufferGeometry[] }>();
    const paintGeos: THREE.BufferGeometry[] = [];
    const surfaces = new Map<string, { mat: Mat; list: PaintSurface[] }>();
    for (const b of tile.props) {
      for (const proxy of b.decor) {
        const mat = proxy.userData.mat as Mat;
        const k = matKey(mat);
        if (!groups.has(k)) groups.set(k, { mat, geos: [] });
        groups.get(k)!.geos.push(proxy.geometry);
      }
      for (const s of b.paint) {
        const mat = s.mesh.userData.mat as Mat;
        if (!mat.glass) paintGeos.push(positionsOnly(s.mesh.geometry)); // glass lets the moon through
        const k = `${matKey(mat)}|${s.slot!.page.index}|${s.light?.page.index}`;
        if (!surfaces.has(k)) surfaces.set(k, { mat, list: [] });
        surfaces.get(k)!.list.push(s);
      }
    }
    if (paintGeos.length) {
      const g = mergeGeometries(paintGeos);
      for (const p of paintGeos) p.dispose();
      g.computeBoundingSphere();
      const proxy = new THREE.Mesh(g, shadowOnly);
      proxy.castShadow = true;
      proxy.matrixAutoUpdate = false;
      proxy.raycast = () => {};
      this.add(tile, proxy, this.surfaces);
    }
    for (const { mat, list } of surfaces.values()) {
      const geos = list.map(onPages);
      const g = mergeGeometries(geos);
      for (const p of geos) p.dispose();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, surfaceMaterial(mat, list[0].slot!.page, list[0].light?.page));
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true; // the shadow proxy casts
      mesh.raycast = () => {}; // each surface's own mesh takes the rays
      this.add(tile, mesh, this.surfaces);
      if (mat.glass) {
        // Its solid paint into the depth, before any see-through draw (glass, light glows, rain),
        // so nothing behind shows through it: not the outlines, not the glows.
        const depth = new THREE.Mesh(g, surfaceMaterial(mat, list[0].slot!.page, list[0].light?.page, true));
        depth.matrixAutoUpdate = false;
        depth.renderOrder = -1;
        depth.raycast = () => {};
        this.add(tile, depth, this.surfaces);
      }
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
      this.add(tile, mesh, this.decor);
    }
  }

  private add(tile: Tile, mesh: THREE.Mesh, into: THREE.Group) {
    tile.meshes.push(mesh);
    into.add(mesh);
  }
}

/**
 * A surface's geometry for merging: its paint and light uvs moved from its
 * own atlases onto its blocks of the pages (the other attributes shared).
 */
function onPages(s: PaintSurface) {
  const src = s.mesh.geometry;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) out.setAttribute(name, a);
  out.setIndex(src.index);
  const move = (name: string, x: number, y: number, w: number, h: number, size: number) => {
    const from = src.attributes[name].array;
    const to = new Float32Array(from.length);
    for (let i = 0; i < from.length; i += 2) {
      to[i] = (x + from[i] * w) / size;
      to[i + 1] = (y + from[i + 1] * h) / size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(to, 2));
  };
  const p = s.slot!;
  move('uv', p.x, p.y, s.geo.atlasW, s.geo.atlasH, p.page.size);
  if (s.light) move('lightUv', s.light.x, s.light.y, s.light.w, s.light.h, s.light.page.size);
  return out;
}

/** One material per base material, paint page and light page: the pages' textures are shared uniforms. */
const surfaceMaterials = new WeakMap<PaintPage, Map<LightPage | undefined, Map<string, SurfaceMaterial>>>();
function surfaceMaterial(mat: Mat, paint: PaintPage, light: LightPage | undefined, glassDepth = false) {
  const byLight = surfaceMaterials.get(paint) ?? surfaceMaterials.set(paint, new Map()).get(paint)!;
  const byMat = byLight.get(light) ?? byLight.set(light, new Map()).get(light)!;
  const k = `${matKey(mat)}|${glassDepth}`;
  let m = byMat.get(k);
  if (!m) {
    m = makeSurfaceMaterial({ tex: mat.tex, tileMeters: mat.tile, alphaTest: mat.alpha, glass: mat.glass, glassDepth });
    m.setPaintable(true);
    m.bindPages(paint.uniform, light?.uniforms ?? null);
    byMat.set(k, m);
  }
  return m;
}

function positionsOnly(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setIndex(g.index);
  return out;
}
