import { BUILD } from '../config';
import { itemIcon, type Thumbnails } from '../inventory/thumbnails';
import type { Choice, Entry, Picker } from './picker';
import { propIcon } from './prop-icon';

// The picker on the left edge: a wheel of categories fanned out from a hub
// (the selected one level, two on each side), the selected category's entries
// beside it with the selected one on the hub line, its variants (Tab) and the
// keys that change a placed one. Labels are fixed elements turned by CSS, so
// a turn of the wheel animates; nothing is redrawn until the selection changes.

/** Categories shown on each side of the selected one. */
const SIDE = 2;
/** Variants whose names together are longer show only the selected one and a count (sign slogans). */
const CHIPS_MAX_CHARS = 48;
/** The shade's opacity across its width, as a share of BUILD.shadeOpacity: eased, so it has no visible edge. */
const SHADE_STOPS: [number, number][] = [[0, 1], [22, 0.86], [45, 0.58], [68, 0.28], [86, 0.08], [100, 0]];

export class PickerView {
  private root = div('picker');
  private shade = div('picker-shade');
  private column = div('column');
  private cats: HTMLElement[];
  private drawn = -1;

  constructor(
    private picker: Picker,
    private icons: Thumbnails,
  ) {
    // An icon arrived from the GPU: draw the column again.
    icons.onReady = () => (this.drawn = -1);
    const wheel = div('wheel');
    this.cats = picker.categories.map((c) => {
      const el = div('cat');
      el.append(document.createElement('i'), Object.assign(document.createElement('span'), { textContent: c.id }));
      return el;
    });
    wheel.append(...this.cats);
    this.root.append(wheel, this.column);
    this.root.hidden = this.shade.hidden = true;
    document.body.append(this.shade, this.root);
    this.syncShade();
  }

  set visible(v: boolean) {
    this.root.hidden = this.shade.hidden = !v;
    this.drawn = -1;
  }

  render() {
    const p = this.picker;
    // Under the pause sheet it isn't laid out (style.css), so it can't be measured: drawn once it shows.
    const paused = document.body.classList.contains('paused');
    if (p.version === this.drawn || this.root.hidden || paused) return;
    this.drawn = p.version;
    const n = this.cats.length;
    const half = Math.floor(n / 2);
    this.cats.forEach((el, i) => {
      const k = ((i - p.category + n + half) % n) - half;
      el.style.setProperty('--k', `${k}`);
      el.dataset.d = Math.abs(k) > SIDE ? 'far' : `${Math.abs(k)}`;
    });
    const entries = p.categories[p.category].entries;
    this.column.innerHTML = `<div class="hint">Q ▲</div>${entries.map((e, i) => row(e, i === p.selected, p.variantOf(e), this.icon(e.variants[p.variantOf(e)].choice))).join('')}<div class="hint">E ▼</div>`;
    // The selected entry's name on the hub line.
    const name = this.column.querySelector<HTMLElement>('.on .name')!;
    this.column.style.transform = `translateY(${-(name.offsetTop + name.offsetHeight / 2)}px)`;
  }

  /** An entry's icon, as its selected variant looks (none for the spawn point). */
  private icon(c: Choice) {
    if (c.kind === 'prop') return this.icons.get(`prop:${c.def.type}:${c.def.variant ?? ''}`, () => propIcon(c.def));
    return c.kind === 'pickup' ? itemIcon(this.icons, c.type) : null;
  }

  /** The shade from BUILD: at start, and again when F3 changes it (live.syncBuildShade). */
  syncShade() {
    const { shadeColor: color, shadeOpacity: opacity, shadeWidth: width } = BUILD;
    const mix = (a: number) => `color-mix(in srgb, ${color} ${Math.round(Math.min(1, Math.max(0, a * opacity)) * 100)}%, transparent)`;
    this.shade.style.width = `${width}px`;
    this.shade.style.background = `linear-gradient(to right, ${SHADE_STOPS.map(([at, a]) => `${mix(a)} ${at}%`).join(', ')})`;
  }
}

function row(e: Entry, on: boolean, variant: number, icon: string | null) {
  const img = `<img src="${icon ?? ''}" alt=""${icon ? '' : ' hidden'}>`;
  const tags = e.settings.length ? ` <b>${e.settings.map((s) => s.name).join(' ')}</b>` : '';
  if (!on) return `<div class="row">${img}<div class="name">${e.label}${tags}</div></div>`;
  const chip = (i: number) => {
    const v = e.variants[i];
    return `<span${i === variant ? ' class="on"' : ''}>${v.swatch ? `<i style="background:${v.swatch}"></i>` : ''}${v.label}</span>`;
  };
  const many = e.variants.reduce((n, v) => n + v.label.length + 1, 0) > CHIPS_MAX_CHARS;
  const chips = many ? `${chip(variant)}<em>${variant + 1} / ${e.variants.length}</em> ` : e.variants.map((_, i) => chip(i)).join('');
  const variants = e.variants.length > 1 ? `<div class="variants">${chips}<em>TAB</em></div>` : '';
  const keys = e.settings.length ? `<div class="keys">${e.settings.map((s) => `${s.key} ${s.name}`).join(' · ')}</div>` : '';
  return `<div class="row on">${img}<div class="name">${e.label}</div>${variants}${keys}</div>`;
}

function div(className: string) {
  return Object.assign(document.createElement('div'), { className });
}
