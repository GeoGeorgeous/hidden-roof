import * as THREE from 'three';
import { ATMOS, LIGHTMAP, LIGHTS, NEON_COLORS, PAINT } from '../../config';
import type { BuiltProp } from '../../level/build-prop';
import { lampLevel } from '../flicker';
import { bakeUniforms } from './glsl';
import { makeLamps, type Lamp } from './lamps';
import { Occluders } from './occluders';
import { lampSpheres, reaches, shadowCones, type Reach } from './reach';
import { layoutLightmap } from './layout';
import { LightPages } from './light-pages';
import { bakeDecor, bakeSurface, dropReceiver, type Receiver, type SurfaceReceiver } from './receivers';

// Bakes the light of every steady lamp into the level (receivers.ts), with
// shadows from the colliders. Moving lights (CCTV) stay real spot lights
// (render/lighting.ts). It follows the level on its own:
//  - a new or rebuilt prop gets baked, and so does whatever its change relit:
//    everything in range of a lamp that came or went, and whatever lies in
//    the shadow a prop casts (or cast) from each lamp (reach.ts)
//  - a change to any light setting (LIGHTS, falloff, LIGHTMAP) rebakes everything
// The work runs a few ms per frame, nearest first, and old light stays up
// until a surface is redone. A whole new level (load, paint detail change) is
// baked at once, so it never shows unlit.

interface Owner {
  id: number;
  built: BuiltProp;
  receivers: Receiver[];
}

/** Flicker slots are stored in half floats, exact up to 2048. */
const SLOT_MAX = 2047;

export class LightBaker {
  /** Called with a decor proxy geometry whose baked light changed. */
  onDecorBaked: (geo: THREE.BufferGeometry) => void = () => {};
  /** Called when every surface got a new light block (LIGHTMAP.texelsPerMeter changed): the level merges its surfaces again. */
  onRelayout: () => void = () => {};
  /** Surfaces' light atlases, blocks of shared pages. */
  private pages = new LightPages();
  readonly stats = { textureBytes: 0, pending: 0, ms: 0 };
  private owners = new Map<BuiltProp, Owner>();
  private nextId = 1;
  private pending = new Set<Receiver>();
  /** Pending receivers, nearest first as of the last sort; re-sorted when new work arrives. */
  private order: Receiver[] | null = null;
  private cursor = 0;
  private lamps: Lamp[] = [];
  private occluders = new Occluders();
  /** Lamps and occluders need a refresh before the next bake. */
  private stale = true;
  /** Everything is new: bake it all on the next update. */
  private all = false;
  /** Neon flicker seed -> slot (1+); the shader reads each slot's brightness from a tiny texture. */
  private seeds = new Map<number, number>();
  private flickerValues = new Float32Array(16).fill(1);
  private flickerTexture = flickerTexture(this.flickerValues);
  private watched: unknown[] = [];
  private watchIndex = 0;
  private watchChanged = false;
  /** Light kinds with a steady lamp in the level: only their settings rebake. */
  private bakedKinds = new Set<string>();
  private density = LIGHTMAP.texelsPerMeter;
  private at = new THREE.Vector3();

  constructor() {
    bakeUniforms.uFlickerValues.value = this.flickerTexture;
    this.settingsChanged();
  }

  /** After a level change: forget removed props, take in new ones, queue what they relight. */
  sync(built: readonly BuiltProp[]) {
    const current = new Set(built);
    const changed: THREE.Box3[] = [];
    const reach: Reach = { spheres: [], cones: [] };
    // A prop rebuilt as it was (a neighbor of an edit, its covered faces redone)
    // casts and lights as before: only its own surfaces are baked again.
    const gone = new Map<string, BuiltProp>();
    const same = new Set<BuiltProp>();
    let any = false;
    for (const [b] of this.owners) if (!current.has(b)) gone.set(shapeKey(b), b);
    for (const b of built) {
      if (this.owners.has(b)) continue;
      const was = gone.get(shapeKey(b));
      if (was) same.add(was).add(b);
    }
    for (const [b, o] of this.owners) {
      if (current.has(b)) continue;
      any = true;
      if (!same.has(b)) {
        changed.push(...b.occluders);
        lampSpheres(b, reach);
      }
      for (const r of o.receivers) {
        this.pending.delete(r);
        dropReceiver(r, this.pages);
      }
      this.owners.delete(b);
    }
    if (!this.owners.size) this.pages.clear(); // a new level comes
    let added = 0;
    for (const b of built) {
      if (this.owners.has(b)) continue;
      this.register(b);
      if (!same.has(b)) {
        changed.push(...b.occluders);
        lampSpheres(b, reach);
      }
      added++;
    }
    if (!any && !added) return;
    this.stale = true;
    if (added === this.owners.size) {
      this.all = true; // everything is new, and all of it is queued already
      return;
    }
    shadowCones(this.owners.keys(), changed, reach);
    this.forEachReceiver((r) => {
      if (reaches(reach, r.bounds)) this.queue(r);
    });
  }

  /** Call once per frame, after the level flushed its batches. */
  update(time: number, eye: THREE.Vector3) {
    this.updateFlicker(time);
    if (!LIGHTMAP.enabled) return;
    if (this.settingsChanged()) this.rebakeAll();
    if (this.density !== LIGHTMAP.texelsPerMeter) {
      this.density = LIGHTMAP.texelsPerMeter;
      this.forEachReceiver((r) => r.kind === 'surface' && dropReceiver(r, this.pages));
      this.forEachReceiver((r) => r.kind === 'surface' && this.layOut(r));
      this.onRelayout();
      this.rebakeAll();
    }
    this.work(this.all ? null : eye, this.all ? Infinity : LIGHTMAP.budgetMs);
    this.all = false;
  }

  /** Queue everything (a light setting changed); the old light stays up until each part is redone. */
  rebakeAll() {
    this.stale = true;
    this.forEachReceiver((r) => this.queue(r));
  }

  private queue(r: Receiver) {
    this.pending.add(r);
    this.order = null;
  }

  private register(b: BuiltProp) {
    const o: Owner = { id: this.nextId++, built: b, receivers: [] };
    for (const surface of b.paint) {
      const g = surface.geo.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const r = { kind: 'surface', owner: o.id, bounds: g.boundingBox!, surface } as SurfaceReceiver;
      this.layOut(r);
      o.receivers.push(r);
    }
    for (const proxy of b.decor) {
      proxy.geometry.computeBoundingBox();
      o.receivers.push({ kind: 'decor', owner: o.id, bounds: proxy.geometry.boundingBox!, geo: proxy.geometry, lit: false });
    }
    for (const r of o.receivers) this.queue(r);
    this.owners.set(b, o);
  }

  /** A surface's light atlas at the current density, and its block (also on the surface, for the level's merged meshes). */
  private layOut(r: SurfaceReceiver) {
    r.layout = layoutLightmap(r.surface.geo, PAINT.texelsPerMeter, this.density);
    // One set of pages for the whole level: light is small, and every surface sharing them keeps the level's draws few.
    r.slot = r.surface.light = this.pages.place(r.layout.w, r.layout.h, '');
  }

  /** Bake pending receivers, nearest to `eye` first, for up to `budget` ms. */
  private work(eye: THREE.Vector3 | null, budget: number) {
    this.stats.pending = this.pending.size;
    if (!this.pending.size) {
      this.stats.ms = 0;
      return;
    }
    const t0 = performance.now();
    if (this.stale) this.refresh();
    if (!this.order) {
      const d = new Map([...this.pending].map((r) => [r, eye ? r.bounds.distanceToPoint(eye) : 0]));
      this.order = [...d.keys()].sort((a, b) => d.get(a)! - d.get(b)!);
      this.cursor = 0;
    }
    while (this.cursor < this.order.length) {
      const r = this.order[this.cursor++];
      if (!this.pending.delete(r)) continue;
      const lamps = this.lamps.filter((l) => r.bounds.distanceToPoint(this.at.set(l.x, l.y, l.z)) < l.range);
      if (r.kind === 'surface') bakeSurface(r, lamps, this.occluders, this.pages);
      else if (bakeDecor(r, lamps, this.occluders)) this.onDecorBaked(r.geo);
      if (performance.now() - t0 > budget) break;
    }
    if (!this.pending.size) this.order = null;
    this.stats.ms = performance.now() - t0;
    this.stats.pending = this.pending.size;
    this.stats.textureBytes = this.pages.bytes;
  }

  /** Lamps and occluders from the current level. */
  private refresh() {
    this.stale = false;
    this.lamps = [];
    this.bakedKinds.clear();
    const occluders: { owner: number; boxes: THREE.Box3[] }[] = [];
    for (const o of this.owners.values()) {
      occluders.push({ owner: o.id, boxes: o.built.occluders });
      for (const a of o.built.lights) {
        if (a.track) continue;
        this.lamps.push(...makeLamps(a, o.id, a.flicker ? this.slotOf(a.flicker) : 0));
        this.bakedKinds.add(a.kind);
      }
    }
    this.occluders.build(occluders);
  }

  private slotOf(seed: number) {
    let slot = this.seeds.get(seed);
    if (slot !== undefined) return slot;
    slot = this.seeds.size + 1;
    if (slot > SLOT_MAX) return 0;
    this.seeds.set(seed, slot);
    if (slot >= this.flickerValues.length) {
      const grown = new Float32Array(this.flickerValues.length * 2).fill(1);
      grown.set(this.flickerValues);
      this.flickerValues = grown;
      this.flickerTexture.dispose();
      this.flickerTexture = flickerTexture(grown);
      bakeUniforms.uFlickerValues.value = this.flickerTexture;
    }
    return slot;
  }

  /** Each flicker slot's brightness right now (as the shader computes it, so light and tubes dip or pulse together). */
  private updateFlicker(time: number) {
    if (!this.seeds.size) return;
    for (const [seed, slot] of this.seeds) this.flickerValues[slot] = lampLevel(time, seed);
    this.flickerTexture.needsUpdate = true;
  }

  /** Did a setting the bake depends on change since the last call? */
  private settingsChanged() {
    this.watchIndex = 0;
    this.watchChanged = false;
    for (const k in LIGHTS) {
      const s = LIGHTS[k as keyof typeof LIGHTS];
      const baked = this.bakedKinds.has(k);
      if ('color' in s) this.see(s.color, baked);
      this.see(s.tint, baked);
      this.see(s.intensity, baked);
      this.see(s.range, baked);
      this.see(s.spread, baked);
      this.see(s.softness, baked);
      this.see(s.shadows, baked);
      for (let i = 0; i < 3; i++) this.see(s.dir[i], baked);
    }
    for (const c of Object.values(NEON_COLORS)) this.see(c, this.bakedKinds.has('neon'));
    this.see(ATMOS.lightDecay, true);
    this.see(LIGHTMAP.shadows, true);
    return this.watchChanged;
  }

  /** Record a watched value; `matters`: a change to it calls for a rebake. */
  private see(v: unknown, matters: boolean) {
    if (this.watched[this.watchIndex] !== v) {
      this.watched[this.watchIndex] = v;
      this.watchChanged ||= matters;
    }
    this.watchIndex++;
  }

  private forEachReceiver(f: (r: Receiver) => void) {
    for (const o of this.owners.values()) o.receivers.forEach(f);
  }
}

function flickerTexture(data: Float32Array) {
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

/** What a prop casts and lights with: its occluders and its lamps, to the mm. */
function shapeKey(b: BuiltProp) {
  const mm = (n: number) => Math.round(n * 1000);
  const boxes = b.occluders.map((o) => [o.min.x, o.min.y, o.min.z, o.max.x, o.max.y, o.max.z].map(mm).join(','));
  const lamps = b.lights.map((a) => `${a.kind}@${[a.base.x, a.base.y, a.base.z].map(mm).join(',')}`);
  return `${boxes.join(';')}|${lamps.join(';')}`;
}
