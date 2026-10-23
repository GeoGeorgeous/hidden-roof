import * as THREE from 'three';
import { NET } from '../config';
import { msg } from '../messages';

// The other players' names over their heads: a tag each, in the HUD (style.css
// .nameplate: white on black, readable on paper and on paint), placed every
// frame where the head is on screen; hidden behind the camera. Seen through
// walls, so a player can always find the others, fainter the further they are
// (NET.nameplateFade). A note (away, in the menu…) is an icon after the name.

/** What a nameplate notes after the name, as an icon (public/icons/note-*.svg). */
export type Note = 'away' | 'menu' | 'idle' | 'lagging' | 'silent' | 'dropped';

/** Each icon's words, for screen readers. */
const LABEL: Record<Note, string> = {
  away: msg('hud.noteAway'),
  menu: msg('hud.noteMenu'),
  idle: msg('hud.noteIdle'),
  lagging: msg('hud.noteLagging'),
  silent: msg('hud.noteSilent'),
  dropped: msg('hud.noteDropped'),
};

const at = new THREE.Vector3();
const eye = new THREE.Vector3();

interface Tag {
  root: HTMLElement;
  name: HTMLElement;
  icon: HTMLElement;
  note: Note | null;
  opacity: number;
}

export class Nameplates {
  private root = document.createElement('div');
  private tags = new Map<number, Tag>();

  constructor() {
    this.root.className = 'nameplates';
    document.querySelector('.layer-world')!.append(this.root);
  }

  /** `players`: id, name, note and feet position of each one shown. */
  update(camera: THREE.Camera, players: { id: number; name: string; note: Note | null; feet: THREE.Vector3 }[]) {
    for (const [id, tag] of this.tags) {
      if (players.some((p) => p.id === id)) continue;
      tag.root.remove();
      this.tags.delete(id);
    }
    eye.setFromMatrixPosition(camera.matrixWorld);
    const { near, far, faintest } = NET.nameplateFade;
    for (const p of players) {
      const tag = this.tags.get(p.id) ?? this.add(p.id);
      const name = p.name.toUpperCase();
      if (tag.name.textContent !== name) tag.name.textContent = name;
      if (tag.note !== p.note) {
        tag.note = p.note;
        tag.icon.hidden = !p.note;
        tag.icon.dataset.note = p.note ?? '';
        tag.icon.setAttribute('aria-label', p.note ? LABEL[p.note] : '');
      }
      at.copy(p.feet).setY(p.feet.y + NET.nameplateHeight);
      const opacity = Math.round((1 - (1 - faintest) * THREE.MathUtils.smoothstep(at.distanceTo(eye), near, far)) * 100) / 100;
      if (opacity !== tag.opacity) tag.root.style.opacity = String((tag.opacity = opacity));
      at.project(camera);
      tag.root.hidden = at.z > 1;
      if (!tag.root.hidden) tag.root.style.transform = `translate(${Math.round((at.x * 0.5 + 0.5) * window.innerWidth)}px, ${Math.round((0.5 - at.y * 0.5) * window.innerHeight)}px) translate(-50%, -100%)`;
    }
  }

  private add(id: number) {
    const root = Object.assign(document.createElement('div'), { className: 'nameplate' });
    const name = document.createElement('span');
    const icon = Object.assign(document.createElement('i'), { hidden: true });
    icon.setAttribute('role', 'img');
    root.append(name, icon);
    this.root.append(root);
    const tag: Tag = { root, name, icon, note: null, opacity: 1 };
    this.tags.set(id, tag);
    return tag;
  }
}
