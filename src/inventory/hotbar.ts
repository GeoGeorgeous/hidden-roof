import { HOTBAR } from '../config';
import { SLOTS, type Inventory, type Tool } from './inventory';
import type { Thumbnails } from './thumbnails';

// Hotbar, bottom center: a row of small circles, HOTBAR.slots of them from the
// start, one per slot key (1 = can, 2 = marker, 3 = ladder, 4 = roller,
// 5 = sponge, any more spare). A tool you have shows its pickup model as a pre-rendered icon
// (thumbnails.ts; the can with the current paint color); a slot you haven't
// found the tool for yet stays an empty circle, so every tool always sits under
// its own key. The selected slot has a solid ring, the others a faint one. No
// numbers, no labels. Plus toasts.
// Pressure, color and cap stay by the tool in hand (hud.ts).

/** The icon of each tool: its pickup model (the can's label in the current color). */
const ICON: Record<Tool, (inv: Inventory) => string> = {
  can: (inv) => `color:${inv.color}`,
  marker: () => 'marker',
  ladder: () => 'ladder',
  roller: () => 'roller',
  sponge: () => 'sponge',
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
    // An icon arrived from the GPU: draw the slots again.
    icons.onReady = () => (this.version = -1);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  toast(msg: string) {
    this.toastEl.textContent = msg.toUpperCase();
    this.toastEl.classList.add('show');
    this.toastTime = performance.now();
  }

  /** Re-render an item's icon (its model changed); shown on the next update. */
  refreshIcon(kind: string) {
    this.icons.forget(kind);
    this.version = -1;
  }

  update(inv: Inventory) {
    if (this.toastTime && performance.now() - this.toastTime > 2200) {
      this.toastEl.classList.remove('show');
      this.toastTime = 0;
    }
    if (inv.version === this.version) return;
    this.version = inv.version;
    let html = '';
    for (let i = 0; i < Math.max(HOTBAR.slots, SLOTS.length); i++) {
      const t = SLOTS[i] as Tool | undefined;
      const icon = t && inv.has(t) ? `<img src="${this.icons.get(ICON[t](inv))}" alt="">` : '';
      html += `<i class="${i === inv.selected ? 'on' : ''}${icon ? '' : ' empty'}">${icon}</i>`;
    }
    this.root.innerHTML = html;
  }
}
