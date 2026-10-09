import * as THREE from 'three';
import { NET } from '../config';

// The other players' names over their heads: a tag each, in the HUD (style.css
// .nameplate: white on black, readable on paper and on paint), placed every
// frame where the head is on screen; hidden behind the camera. Seen through
// walls, so a player can always find the others. A note (AWAY…) goes after the name.

const at = new THREE.Vector3();

export class Nameplates {
  private root = document.createElement('div');
  private tags = new Map<number, HTMLElement>();

  constructor() {
    this.root.className = 'nameplates';
    document.querySelector('.hud')!.append(this.root);
  }

  /** `players`: id, name, note and feet position of each one shown. */
  update(camera: THREE.Camera, players: { id: number; name: string; note: string; feet: THREE.Vector3 }[]) {
    for (const [id, tag] of this.tags) {
      if (players.some((p) => p.id === id)) continue;
      tag.remove();
      this.tags.delete(id);
    }
    for (const p of players) {
      let tag = this.tags.get(p.id);
      if (!tag) {
        tag = Object.assign(document.createElement('div'), { className: 'nameplate' });
        this.root.append(tag);
        this.tags.set(p.id, tag);
      }
      const text = p.note ? `${p.name.toUpperCase()} · ${p.note}` : p.name.toUpperCase();
      if (tag.textContent !== text) tag.textContent = text;
      at.copy(p.feet).setY(p.feet.y + NET.nameplateHeight).project(camera);
      tag.hidden = at.z > 1;
      if (!tag.hidden) tag.style.transform = `translate(${Math.round((at.x * 0.5 + 0.5) * window.innerWidth)}px, ${Math.round((0.5 - at.y * 0.5) * window.innerHeight)}px) translate(-50%, -100%)`;
    }
  }
}
