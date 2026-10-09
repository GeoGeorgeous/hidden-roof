import * as THREE from 'three';
import { COLORS, PICKUP, type TagFont } from '../config';
import { parsePickup, pickupVariant } from '../inventory/items';
import { solidsNear } from '../level/solids';
import { JP_FAMILY } from '../render/ink/jp-font';
import type { Pickup } from './pickups';

// Each pickup's tag by its ring, in the HUD, manga-style (style.css
// .pickup-tag): NEW TOOL in a caption box along the ring's upper left edge,
// the name in outlined letters along its upper right one, with its katakana
// (NEW while it would give you something; paint's name in its color). Shown
// within PICKUP.label.reach while the pickup is in sight: through walls,
// tags would give hidden pickups away.

/** Each build picker group's word on a tag: the in-hand tags' words. */
const WORD: Record<string, string> = { Paint: 'COLOR', Cap: 'CAP', Tool: 'TOOL' };
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
  caption: HTMLElement;
  /** Where its texts sit (PICKUP.label.place). */
  shape: keyof typeof PICKUP.label.place;
  /** Its kind's word (TOOL), and what the caption says now (NEW TOOL). */
  word: string;
  text: string;
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
    // Katakana in the gothic, whatever the name's font: the system may have no Japanese font.
    this.root.style.setProperty('--kana-font', FAMILIES.gothic);
    document.querySelector('.hud')!.append(this.root);
  }

  /** Shows, hides and places every pickup's tag; `isNew`: it would give you something. */
  update(dt: number, pickups: Iterable<Pickup>, isNew: (p: Pickup) => boolean) {
    const { reach, sightRate, place } = PICKUP.label;
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
        const text = isNew(p) ? `NEW ${tag.word}` : tag.word;
        if (tag.text !== text) tag.caption.textContent = tag.text = text;
        tag.until = now + FADE;
      }
      if (shown !== tag.shown) tag.el.classList.toggle('show', (tag.shown = shown));
      if (now > tag.until) continue;
      const depth = -view.copy(center).applyMatrix4(this.camera.matrixWorldInverse).z;
      tag.el.hidden = depth <= 0;
      if (tag.el.hidden) continue;
      center.project(this.camera);
      const { at, tilt } = place[tag.shape];
      const s = tag.el.style;
      s.transform = `translate(${Math.round((center.x * 0.5 + 0.5) * window.innerWidth)}px, ${Math.round((0.5 - center.y * 0.5) * window.innerHeight)}px)`;
      s.setProperty('--ring', `${((size * scale) / depth).toFixed(1)}px`);
      s.setProperty('--ax', String(at[0]));
      s.setProperty('--ay', String(at[1]));
      s.setProperty('--tilt', `${tilt}deg`);
    }
  }

  remove(id: number) {
    this.tags.get(id)?.el.remove();
    this.tags.delete(id);
  }

  private make(p: Pickup) {
    const c = parsePickup(p.kind)!;
    const id = p.kind.split(':').pop()!;
    const el = Object.assign(document.createElement('div'), { className: 'pickup-tag' });
    const caption = Object.assign(document.createElement('div'), { className: 'tag-caption' });
    const name = Object.assign(document.createElement('div'), { className: 'tag-name', textContent: id.toUpperCase() });
    // Paint's name in its color, through the DOM, not a style attribute: a CSP without 'unsafe-inline' allows it.
    if ('color' in c) name.style.color = COLORS[c.color];
    if (KANA[id]) name.append(document.createElement('br'), Object.assign(document.createElement('span'), { className: 'tag-kana', textContent: KANA[id] }));
    el.append(caption, name);
    this.root.append(el);
    const tag: Tag = { el, caption, shape: 'color' in c ? 'color' : 'cap' in c ? 'cap' : 'tool', word: WORD[pickupVariant(p.kind).group], text: '', seen: false, shown: false, until: 0 };
    this.tags.set(p.id, tag);
    return tag;
  }

  /** The texts' fonts and sizes, on the root for every tag (written when they change, in F3). */
  private setFonts() {
    const { caption, name } = PICKUP.label;
    const key = `${caption.font}|${caption.size}|${name.font}|${name.size}|${name.outline}|${name.kana}`;
    if (key === this.fonts) return;
    this.fonts = key;
    const s = this.root.style;
    s.setProperty('--caption-font', FAMILIES[caption.font]);
    s.setProperty('--caption-size', `${caption.size}px`);
    s.setProperty('--name-font', FAMILIES[name.font]);
    s.setProperty('--name-size', `${name.size}px`);
    s.setProperty('--outline', `${name.outline}px`);
    s.setProperty('--kana-size', `${name.kana}px`);
    this.root.classList.toggle('no-kana', name.kana <= 0);
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
