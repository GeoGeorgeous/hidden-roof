import * as THREE from 'three';
import { PICKUP } from '../config';
import type { V3 } from '../kit/pieces';
import type { Inventory } from '../inventory/inventory';
import { parsePickup, pickupLabel, type PickupKind } from '../inventory/items';
import { glowColor, halo as makeHalo, itemModel } from './visuals';

// Pickups placed on the map. Walk into one to collect it; if it unlocks nothing
// new (color/cap already owned, tool already found) it stays. Saved in level
// JSON as {kind, pos}.

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
  item: THREE.Group;
  halo: THREE.Sprite;
  collected: boolean;
  /** Player was in range last frame (avoids repeating "full" messages). */
  inRange: boolean;
  phase: number;
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

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** Rebuild the item model of every pickup of this kind (after its config changed in F3). */
  restyle(kind: PickupKind) {
    for (const p of this.list.values()) {
      if (p.kind !== kind) continue;
      const item = itemModel(kind);
      item.position.copy(p.item.position);
      item.rotation.y = p.item.rotation.y;
      p.group.remove(p.item);
      p.item.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      p.group.add(item);
      p.item = item;
    }
  }

  add(kind: PickupKind, pos: V3): Pickup | null {
    if (!parsePickup(kind)) {
      console.warn(`unknown pickup "${kind}"`);
      return null;
    }
    const color = glowColor(kind);
    const group = new THREE.Group();
    const item = itemModel(kind);
    const halo = makeHalo(color);
    // Invisible hit box so build mode can select the pickup.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.y = 0.6;
    const p: Pickup = { id: this.nextId++, kind, pos: [...pos], group, item, halo, collected: false, inRange: false, phase: Math.random() * 6 };
    hit.userData.pickupId = p.id;
    group.add(item, halo, hit);
    group.position.set(...p.pos);
    this.root.add(group);
    this.list.set(p.id, p);
    return p;
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
      const bob = Math.sin(this.time * 2 + p.phase) * PICKUP.bob;
      p.item.position.y = PICKUP.hover + bob;
      p.item.rotation.y = this.time * PICKUP.spin + p.phase;
      p.halo.position.y = PICKUP.hover + bob;
      if (this.editing || p.collected) continue;
      const near =
        Math.hypot(feet.x - p.pos[0], feet.z - p.pos[2]) < PICKUP.radius && feet.y > p.pos[1] - 1.2 && feet.y < p.pos[1] + 1.2;
      if (near && !p.inRange) this.tryCollect(p, inv);
      p.inRange = near;
    }
  }

  private tryCollect(p: Pickup, inv: Inventory) {
    const c = parsePickup(p.kind)!;
    const ok =
      'color' in c
        ? inv.addColor(c.color)
        : 'cap' in c
          ? inv.addCap(c.cap)
          : 'ladder' in c
            ? inv.giveLadder()
            : 'roller' in c
              ? inv.giveRoller()
              : 'sponge' in c
                ? inv.giveSponge()
                : inv.giveMarker();
    if (!ok) {
      this.onBlocked(`already have ${pickupLabel(p.kind)}`);
      return;
    }
    p.collected = true;
    p.group.visible = false;
    this.onCollect(pickupLabel(p.kind));
  }
}
