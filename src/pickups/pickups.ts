import * as THREE from 'three';
import { PICKUP } from '../config';
import type { V3 } from '../kit/pieces';
import type { Inventory } from '../inventory/inventory';
import { parsePickup, pickupLabel, type PickupKind } from '../inventory/items';
import { PickupLabels } from './labels';
import { glow as makeGlow, halo as makeHalo, itemModel, setGlow, setRing, type Glow } from './visuals';

// Pickups placed on the map. Walk into one to collect it; if it unlocks nothing
// new (color/cap already owned, tool already found) it stays. Saved in level
// JSON as {kind, pos}.

/** You have what `kind` gives. */
function owns(inv: Inventory, kind: PickupKind) {
  const c = parsePickup(kind)!;
  return 'color' in c ? inv.colors.includes(c.color) : 'cap' in c ? inv.caps.includes(c.cap) : inv.has(c.tool);
}

export interface PickupData {
  kind: PickupKind;
  pos: V3;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  /** Ground point; the item hovers above it. */
  pos: V3;
  group: THREE.Group;
  /** Bobs and spins; holds `pose`, which holds the model. */
  item: THREE.Group;
  /** PICKUP.models for this kind. */
  pose: THREE.Group;
  halo: THREE.Sprite;
  glow: Glow;
  collected: boolean;
  /** Player was in range last frame (avoids repeating "full" messages). */
  inRange: boolean;
  phase: number;
}

/** A kind's entry in PICKUP.models: color unlocks are cans, caps share one, tools have their own. */
function modelOf(kind: PickupKind): keyof typeof PICKUP.models {
  const k = kind.split(':')[0];
  return k === 'color' ? 'can' : (k as keyof typeof PICKUP.models);
}

export class Pickups {
  readonly root = new THREE.Group();
  readonly list = new Map<number, Pickup>();
  /** In build mode everything is shown and nothing can be collected. */
  editing = false;
  onCollect: (label: string) => void = () => {};
  onBlocked: (label: string) => void = () => {};
  private nextId = 1;
  private time = 0;
  private labels: PickupLabels;

  /** `camera`: rings keep their shape readable on its screen (PICKUP.ring.minSize); tags hide behind `solids`. */
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, solids: readonly THREE.Mesh[]) {
    scene.add(this.root);
    this.labels = new PickupLabels(camera, solids);
  }

  /** Rebuild every pickup's item model (after a model changed in F3). */
  restyle() {
    for (const p of this.list.values()) {
      for (const old of [...p.pose.children]) {
        old.traverse((o) => {
          (o as THREE.Mesh).geometry?.dispose();
          ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
        });
        p.pose.remove(old);
      }
      p.pose.add(itemModel(p.kind));
    }
  }

  add(kind: PickupKind, pos: V3): Pickup | null {
    if (!parsePickup(kind)) {
      console.warn(`unknown pickup "${kind}"`);
      return null;
    }
    const group = new THREE.Group();
    const item = new THREE.Group();
    const pose = new THREE.Group();
    pose.add(itemModel(kind));
    item.add(pose);
    // The glow first: three.js draws transparent things at the same spot in the order they were made, so the ring goes over it.
    const glow = makeGlow(kind);
    const halo = makeHalo(kind);
    // Invisible hit box so build mode can select the pickup.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.y = 0.6;
    const p: Pickup = { id: this.nextId++, kind, pos: [...pos], group, item, pose, halo, glow, collected: false, inRange: false, phase: Math.random() * 6 };
    hit.userData.pickupId = p.id;
    group.add(item, halo, glow.light, glow.floor, hit);
    group.position.set(...p.pos);
    this.root.add(group);
    this.list.set(p.id, p);
    // Placed now too: before the game first runs (the start screen), update doesn't.
    this.place(p);
    return p;
  }

  /** Hover, spin, the model's pose, the ring and the glow, at the current time (PICKUP is live in F3 → Items). */
  private place(p: Pickup) {
    const bob = Math.sin(this.time * 2 + p.phase) * PICKUP.bob;
    p.item.position.y = PICKUP.hover + bob;
    p.item.rotation.y = this.time * PICKUP.spin + p.phase;
    const m = PICKUP.models[modelOf(p.kind)];
    p.pose.position.set(...m.offset);
    p.pose.rotation.set(...m.rotation);
    p.pose.scale.setScalar(m.size);
    p.halo.position.y = PICKUP.hover + bob;
    const size = this.ringSize(p);
    p.halo.scale.setScalar(size);
    // Grown past its size it grows upward, so the floor in front doesn't cut off its bottom.
    p.halo.center.y = PICKUP.ring.size / 2 / size;
    setRing(p.halo, p.kind);
    const g = PICKUP.glow;
    p.glow.light.position.y = PICKUP.hover + bob;
    p.glow.light.scale.setScalar(g.size);
    p.glow.floor.position.y = 0.01;
    p.glow.floor.scale.setScalar(g.floor);
    setGlow(p.glow, g.strength * (1 + g.pulse * Math.sin(this.time * g.pulseRate + p.phase)));
  }

  /** PICKUP.ring.size, but never under ring.minSize of the screen's height, so its shape reads from far away. */
  private ringSize(p: Pickup) {
    const { size, minSize } = PICKUP.ring;
    const c = this.camera;
    const far = Math.hypot(c.position.x - p.pos[0], c.position.y - p.pos[1] - p.halo.position.y, c.position.z - p.pos[2]);
    return Math.max(size, minSize * far * 2 * Math.tan((c.fov * Math.PI) / 360));
  }

  remove(id: number) {
    const p = this.list.get(id);
    if (!p) return;
    p.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // three.js gives every sprite the same geometry: only the halo's material is its own.
      if (!(o as THREE.Sprite).isSprite) m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    p.group.removeFromParent();
    this.list.delete(id);
    this.labels.remove(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  load(data: PickupData[] = []) {
    this.clear();
    for (const d of data) this.add(d.kind, d.pos);
  }

  /** All placements, collected or not. */
  toJSON(): PickupData[] {
    return [...this.list.values()].map(({ kind, pos }) => ({ kind, pos }));
  }

  setEditing(on: boolean) {
    this.editing = on;
    for (const p of this.list.values()) p.group.visible = on || !p.collected;
  }

  idOf(o: THREE.Object3D): number | undefined {
    return o.userData.pickupId;
  }

  update(dt: number, feet: THREE.Vector3, inv: Inventory) {
    this.time += dt;
    for (const p of this.list.values()) {
      if (!p.group.visible) continue;
      this.place(p);
      if (this.editing || p.collected) continue;
      const near =
        Math.hypot(feet.x - p.pos[0], feet.z - p.pos[2]) < PICKUP.reach && Math.abs(feet.y - p.pos[1]) < PICKUP.reachHeight;
      if (near && !p.inRange) this.tryCollect(p, inv);
      p.inRange = near;
    }
    this.labels.update(dt, this.list.values(), (p) => !owns(inv, p.kind));
  }

  /** Pickups of what the player already has count as collected (a multiplayer session gave their inventory back). */
  collectOwned(inv: Inventory) {
    for (const p of this.list.values()) {
      if (!owns(inv, p.kind)) continue;
      p.collected = true;
      p.group.visible = this.editing;
    }
  }

  private tryCollect(p: Pickup, inv: Inventory) {
    const c = parsePickup(p.kind)!;
    const ok = 'color' in c ? inv.addColor(c.color) : 'cap' in c ? inv.addCap(c.cap) : inv.give(c.tool);
    if (!ok) {
      this.onBlocked(`already have ${pickupLabel(p.kind)}`);
      return;
    }
    p.collected = true;
    p.group.visible = false;
    this.onCollect(pickupLabel(p.kind));
  }
}
