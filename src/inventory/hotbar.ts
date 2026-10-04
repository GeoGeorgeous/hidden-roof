import { SLOTS, type Inventory, type Tool } from './inventory';
import type { Thumbnails } from './thumbnails';

// Hotbar, bottom center: one small circle per tool you have (can, marker,
// ladder), each showing the item's pickup model as a pre-rendered icon
// (thumbnails.ts; the can with the current paint color). The tool in hand has
// a solid ring, the others a faint one. No numbers, no labels. Plus toasts.
// Pressure, color and cap stay by the tool in hand (hud.ts).

/** The icon of each tool: its pickup model (the can's label in the current color). */
const ICON: Record<Tool, (inv: Inventory) => string> = {
  can: (inv) => `color:${inv.color}`,
  marker: () => 'marker',
  ladder: () => 'ladder',
};

export class Hotbar {
  private root: HTMLElement;
  private toastEl: HTMLElement;
  private toastTime = 0;
  private version = -1;

  constructor(private icons: Thumbnails) {
    this.root = document.createElement('div');
    this.root.className = 'hotbar';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.append(this.root, this.toastEl);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  toast(msg: string) {
    this.toastEl.textContent = msg.toUpperCase();
    this.toastEl.classList.add('show');
    this.toastTime = performance.now();
  }

  update(inv: Inventory) {
    if (this.toastTime && performance.now() - this.toastTime > 2200) {
      this.toastEl.classList.remove('show');
      this.toastTime = 0;
    }
    if (inv.version === this.version) return;
    this.version = inv.version;
    const owned = (t: Tool) => t === 'can' || (t === 'marker' && inv.hasMarker) || (t === 'ladder' && inv.hasLadder);
    this.root.innerHTML = SLOTS.map((t, i) =>
      owned(t) ? `<i class="${i === inv.selected ? 'on' : ''}"><img src="${this.icons.get(ICON[t](inv))}" alt=""></i>` : '',
    ).join('');
  }
}
