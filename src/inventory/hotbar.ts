import { HOTBAR, HUD } from '../config';
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
  /** The HUD slot look last applied (rewritten only on change). */
  private look = '';

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

  /** Re-render every icon (a model changed); shown on the next update. */
  refreshIcons() {
    this.icons.forgetAll();
    this.version = -1;
  }

  update(inv: Inventory) {
    const h = HUD;
    const look = [h.slotSize, h.slotGap, h.slotRoundness, h.slotBorder, h.slotFill, h.slotFillOpacity, h.selectedBorder, h.selectedFill, h.selectedFillOpacity].join('|');
    if (look !== this.look) {
      this.look = look;
      const mix = (hex: string, a: number) => `color-mix(in srgb, ${hex} ${Math.round(Math.min(1, Math.max(0, a)) * 100)}%, transparent)`;
      const vars: Record<string, string> = {
        '--slot': `${h.slotSize}px`,
        '--gap': `${h.slotGap}px`,
        '--round': `${h.slotRoundness * 50}%`,
        '--border': mix(h.slotBorder, 0.62),
        '--fill': mix(h.slotFill, h.slotFillOpacity),
        '--on-border': h.selectedBorder,
        '--on-fill': mix(h.selectedFill, h.selectedFillOpacity),
      };
      for (const k in vars) this.root.style.setProperty(k, vars[k]);
    }
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
