import * as THREE from 'three';
import { NET } from '../config';
import { msg } from '../messages';

// The other players' names over their heads: a tag each, in the HUD (style.css
// .nameplate: on a dark box, readable on paper and on paint), placed every
// frame where the head is on screen; hidden behind the camera. Seen through
// walls, so a player can always find the others, with how far they are under
// the name, fainter the further (NET.nameplateFade); the nearer drawn on top.
// What they're doing (away, in the menu…) goes after the name, colored by how bad it is.

/** What a nameplate notes after the name. */
type Note = 'away' | 'menu' | 'idle' | 'lagging' | 'silent' | 'dropped';

const WORD: Record<Note, string> = {
  away: msg('hud.noteAway'),
  menu: msg('hud.noteMenu'),
  idle: msg('hud.noteIdle'),
  lagging: msg('hud.noteLagging'),
  silent: msg('hud.noteSilent'),
  dropped: msg('hud.noteDropped'),
};

/** One player's tag, as the nameplates are told each frame: id, name, note and feet position. */
export interface Plate {
  id: number;
  name: string;
  note: Note | null;
  feet: THREE.Vector3;
}

const at = new THREE.Vector3();
const eye = new THREE.Vector3();

interface Tag {
  root: HTMLElement;
  name: HTMLElement;
  note: HTMLElement;
  far: HTMLElement;
  shows: Note | null;
  meters: number;
  opacity: number;
}

const span = (className: string) => Object.assign(document.createElement('span'), { className });

export class Nameplates {
  private root = document.createElement('div');
  private tags = new Map<number, Tag>();

  constructor() {
    this.root.className = 'nameplates';
    document.querySelector('.layer-world')!.append(this.root);
  }

  /** `players`: each one shown. */
  update(camera: THREE.Camera, players: readonly Plate[]) {
    for (const [id, tag] of this.tags) {
      if (players.some((p) => p.id === id)) continue;
      tag.root.remove();
      this.tags.delete(id);
    }
    eye.setFromMatrixPosition(camera.matrixWorld);
    const { near, far, faintest } = NET.nameplateFade;
    const { innerWidth, innerHeight } = window;
    for (const p of players) {
      const tag = this.tags.get(p.id) ?? this.add(p.id);
      if (tag.name.textContent !== p.name) tag.name.textContent = p.name;
      if (tag.shows !== p.note) {
        tag.shows = p.note;
        tag.note.hidden = !p.note;
        tag.note.dataset.note = p.note ?? '';
        tag.note.textContent = p.note ? WORD[p.note] : '';
      }
      at.copy(p.feet).setY(p.feet.y + NET.nameplateHeight);
      const d = at.distanceTo(eye);
      const meters = Math.round(d);
      if (meters !== tag.meters) {
        tag.meters = meters;
        tag.far.textContent = msg('hud.distance', { meters });
        tag.root.style.zIndex = String(Math.max(0, 10000 - meters));
      }
      const opacity = Math.round((1 - (1 - faintest) * THREE.MathUtils.clamp((d - near) / (far - near), 0, 1)) * 100) / 100;
      if (opacity !== tag.opacity) tag.root.style.opacity = String((tag.opacity = opacity));
      at.project(camera);
      tag.root.hidden = at.z > 1;
      if (!tag.root.hidden) tag.root.style.transform = `translate(${Math.round((at.x * 0.5 + 0.5) * innerWidth)}px, ${Math.round((0.5 - at.y * 0.5) * innerHeight)}px) translate(-50%, -100%)`;
    }
  }

  private add(id: number) {
    const root = Object.assign(document.createElement('div'), { className: 'nameplate' });
    const box = Object.assign(document.createElement('div'), { className: 'tag' });
    const tag: Tag = { root, name: span('name'), note: Object.assign(span('note'), { hidden: true }), far: span('far'), shows: null, meters: -1, opacity: 1 };
    box.append(tag.name, tag.note);
    root.append(box, tag.far);
    this.root.append(root);
    this.tags.set(id, tag);
    return tag;
  }
}
