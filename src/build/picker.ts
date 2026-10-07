import { CATEGORIES, type Category, type PropDef } from '../kit/def';
import { defOf, kitIn } from '../kit';
import { PICKUP_KINDS, pickupLabel } from '../inventory/items';

// Hotbar-style prop picker: Tab / Shift+Tab (or 1-7) switch category, the mouse
// wheel picks the prop. The selected prop's name is always on screen.

export type Entry = { kind: 'prop'; def: PropDef; label: string } | { kind: 'pickup'; type: string; label: string };

function entriesFor(c: Category): Entry[] {
  if (c === 'pickups') return PICKUP_KINDS.map((k) => ({ kind: 'pickup', type: k, label: pickupLabel(k) }));
  return kitIn(c).map((d) => ({ kind: 'prop', def: defOf(d.type)!, label: d.label }));
}

export class Picker {
  readonly categories = CATEGORIES.map((c) => ({ id: c, entries: entriesFor(c) })).filter((c) => c.entries.length);
  private cat = 0;
  private index = this.categories.map(() => 0);
  private root: HTMLElement;
  private dirty = true;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'picker';
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  get entry(): Entry {
    return this.categories[this.cat].entries[this.index[this.cat]];
  }

  setCategory(i: number) {
    if (i < 0 || i >= this.categories.length) return;
    this.cat = i;
    this.dirty = true;
  }

  nextCategory(dir: number) {
    this.setCategory((this.cat + dir + this.categories.length) % this.categories.length);
  }

  wheel(dir: number) {
    const n = this.categories[this.cat].entries.length;
    this.index[this.cat] = (this.index[this.cat] + dir + n) % n;
    this.dirty = true;
  }

  /** Select the entry for a prop type or pickup kind (middle-click pick). */
  pick(kind: 'prop' | 'pickup', type: string) {
    this.categories.forEach((c, ci) =>
      c.entries.forEach((e, ei) => {
        const t = e.kind === 'prop' ? e.def.type : e.type;
        if (e.kind === kind && t === type) {
          this.cat = ci;
          this.index[ci] = ei;
          this.dirty = true;
        }
      }),
    );
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const c = this.categories[this.cat];
    const i = this.index[this.cat];
    this.root.innerHTML = `
      <div class="name">${this.entry.label.toUpperCase()}</div>
      <div class="strip">${c.entries.map((e, k) => `<span class="${k === i ? 'on' : ''}">${e.label}</span>`).join('')}</div>
      <div class="cats">${this.categories.map((x, k) => `<span class="${k === this.cat ? 'on' : ''}">[${k + 1}] ${x.id.toUpperCase()}</span>`).join('')}</div>`;
  }
}
