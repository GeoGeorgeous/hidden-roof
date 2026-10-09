import * as THREE from 'three';
import { COLORS, PICKUP, type TagFont } from '../config';
import { parsePickup } from '../inventory/items';
import { solidsNear } from '../level/solids';
import { JP_FAMILY } from '../render/ink/jp-font';
import type { Pickup } from './pickups';

// Each pickup's tag by its ring, in the HUD, manga-style (style.css
// .pickup-tag): outlined letters with katakana under them, NEW TOOL along the
// ring's upper left edge and the name along its upper right one (NEW while it
// would give you something); paint only its name, in its color, centered over
// the ring. Shown within PICKUP.label.reach while the pickup is in sight:
// through walls, tags would give hidden pickups away.

/** A cap's or a tool's word on its tag, and in katakana. */
const WORD = { cap: ['CAP', 'キャップ'], tool: ['TOOL', 'ツール'] } as const;
/** The tag's lines (style.css .l-caption…), by their PICKUP.label key. */
const LINES = ['caption', 'captionKana', 'name', 'nameKana'] as const;
/** Each thing's name in katakana, by its id (red, fat, marker). */
const KANA: Record<string, string> = {
  white: 'ホワイト',
  red: 'レッド',
  orange: 'オレンジ',
  yellow: 'イエロー',
  lime: 'ライム',
  green: 'グリーン',
  teal: 'ティール',
  cyan: 'シアン',
  blue: 'ブルー',
  purple: 'パープル',
  pink: 'ピンク',
  brown: 'ブラウン',
  skinny: 'スキニー',
  standard: 'スタンダード',
  fat: 'ファット',
  spray: 'スプレー',
  marker: 'マーカー',
  ladder: 'ハシゴ',
  roller: 'ローラー',
  sponge: 'スポンジ',
};
const FAMILIES: Record<TagFont, string> = {
  mono: `ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace`,
  gothic: JP_FAMILY,
  graffiti: `'Sedgwick Ave Display', cursive`,
};
/** The tag's fade (style.css .pickup-tag), followed while it fades out (ms). */
const FADE = 300;

interface Tag {
  el: HTMLElement;
  /** Its NEW TOOL and katakana lines; null for paint, which has none. */
  caption: [HTMLElement, HTMLElement] | null;
  shape: 'color' | 'cap' | 'tool';
  /** Whether the caption says NEW now. */
  isNew: boolean | null;
  /** Nothing between the camera and the pickup at the last sight check. */
  seen: boolean;
  shown: boolean;
  /** Placed until then (performance.now), to follow it while it fades out. */
  until: number;
}

const center = new THREE.Vector3();
const view = new THREE.Vector3();
const up = new THREE.Vector3();
const dir = new THREE.Vector3();
const mid = new THREE.Vector3();

export class PickupLabels {
  private root = document.createElement('div');
  private tags = new Map<number, Tag>();
  private ray = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];
  private sightClock = 0;
  /** The fonts last written to the root (PICKUP.label.caption, .name). */
  private fonts = '';

  constructor(
    private camera: THREE.PerspectiveCamera,
    private solids: readonly THREE.Mesh[],
  ) {
    this.root.className = 'pickup-tags';
    document.querySelector('.hud')!.append(this.root);
  }

  /** Shows, hides and places every pickup's tag; `isNew`: it would give you something. */
  update(dt: number, pickups: Iterable<Pickup>, isNew: (p: Pickup) => boolean) {
    const { reach, sightRate } = PICKUP.label;
    this.setFonts();
    this.sightClock += dt;
    const sight = this.sightClock >= 1 / sightRate;
    if (sight) this.sightClock = 0;
    const cam = this.camera.position;
    up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    // Screen px per m at 1 m from the camera.
    const scale = window.innerHeight / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const now = performance.now();
    for (const p of pickups) {
      const tag = this.tags.get(p.id) ?? this.make(p);
      const size = p.halo.scale.y;
      // The ring's middle: it grows upward from its anchor (Pickups.place).
      center.set(p.pos[0], p.pos[1] + p.halo.position.y, p.pos[2]).addScaledVector(up, size * (0.5 - p.halo.center.y));
      const far = cam.distanceTo(center);
      const close = p.group.visible && far < reach;
      if (close && sight) tag.seen = this.inSight(center, far);
      const shown = close && tag.seen;
      if (shown) {
        if (tag.caption && tag.shape !== 'color' && tag.isNew !== isNew(p)) {
          tag.isNew = isNew(p);
          const [word, kana] = WORD[tag.shape];
          tag.caption[0].textContent = tag.isNew ? `NEW ${word}` : word;
          tag.caption[1].textContent = tag.isNew ? `ニュー${kana}` : kana;
        }
        tag.until = now + FADE;
      }
      if (shown !== tag.shown) tag.el.classList.toggle('show', (tag.shown = shown));
      if (now > tag.until) continue;
      const depth = -view.copy(center).applyMatrix4(this.camera.matrixWorldInverse).z;
      tag.el.hidden = depth <= 0;
      if (tag.el.hidden) continue;
      center.project(this.camera);
      const s = tag.el.style;
      s.transform = `translate(${Math.round((center.x * 0.5 + 0.5) * window.innerWidth)}px, ${Math.round((0.5 - center.y * 0.5) * window.innerHeight)}px)`;
      s.setProperty('--ring', `${((size * scale) / depth).toFixed(1)}px`);
      if (tag.shape === 'color') s.setProperty('--ay', String(PICKUP.label.color.up));
      else {
        const { at, tilt } = PICKUP.label[tag.shape];
        s.setProperty('--ax', String(at[0]));
        s.setProperty('--ay', String(at[1]));
        s.setProperty('--tilt', `${tilt}deg`);
      }
    }
  }

  remove(id: number) {
    this.tags.get(id)?.el.remove();
    this.tags.delete(id);
  }

  private make(p: Pickup) {
    const c = parsePickup(p.kind)!;
    const id = p.kind.split(':').pop()!;
    const shape = 'color' in c ? 'color' : 'cap' in c ? 'cap' : 'tool';
    const el = Object.assign(document.createElement('div'), { className: `pickup-tag ${shape}` });
    const line = (key: (typeof LINES)[number], text = '') => Object.assign(document.createElement('span'), { className: `l-${key}`, textContent: text });
    const name = Object.assign(document.createElement('div'), { className: 'tag-name' });
    name.append(line('name', id.toUpperCase()), line('nameKana', KANA[id]));
    // Paint's name in its color, through the DOM, not a style attribute: a CSP without 'unsafe-inline' allows it.
    if ('color' in c) name.style.color = COLORS[c.color];
    let caption: Tag['caption'] = null;
    if (shape !== 'color') {
      caption = [line('caption'), line('captionKana')];
      el.append(Object.assign(document.createElement('div'), { className: 'tag-caption' }));
      el.firstElementChild!.append(...caption);
    }
    el.append(name);
    this.root.append(el);
    const tag: Tag = { el, caption, shape, isNew: null, seen: false, shown: false, until: 0 };
    this.tags.set(p.id, tag);
    return tag;
  }

  /** Each line's font, size and outline, on the root for every tag (written when they change, in F3). */
  private setFonts() {
    const key = LINES.map((k) => Object.values(PICKUP.label[k]).join()).join('|');
    if (key === this.fonts) return;
    this.fonts = key;
    const s = this.root.style;
    for (const k of LINES) {
      const line = PICKUP.label[k];
      const { size, outline } = line;
      const font = 'font' in line ? line.font : 'gothic';
      // Katakana from the gothic, whatever the font: the others have none, and the system may have no Japanese font.
      s.setProperty(`--${k}-font`, font === 'gothic' ? JP_FAMILY : `${FAMILIES[font]}, ${JP_FAMILY}`);
      s.setProperty(`--${k}-size`, `${size}px`);
      s.setProperty(`--${k}-outline`, `${outline}px`);
    }
  }

  /** Nothing solid between the camera and `at`, `far` from it. */
  private inSight(at: THREE.Vector3, far: number) {
    const cam = this.camera.position;
    dir.subVectors(at, cam).normalize();
    this.ray.set(cam, dir);
    this.ray.far = far;
    solidsNear(this.solids, mid.copy(cam).add(at).multiplyScalar(0.5), far / 2, this.near);
    return !this.near.length || !this.ray.intersectObjects(this.near, false).length;
  }
}
