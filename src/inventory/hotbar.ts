import { CAP_ORDER, CAPS, COLORS } from '../config';
import { SLOTS, type Inventory } from './inventory';

// Tool readout, bottom-left: slots, color, cap (or how to place the ladder); plus toasts. The PSI
// gauge and the low-pressure alert sit beside the can (hud.ts).
// Minimal text only.

export class Hotbar {
  private root: HTMLElement;
  private slots: HTMLElement;
  private rows: HTMLElement;
  private toastEl: HTMLElement;
  private toastTime = 0;
  private version = -1;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'readout';
    this.root.innerHTML = `
      <div class="slots"></div>
      <div class="rows"></div>
`;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.append(this.root, this.toastEl);
    this.slots = this.root.querySelector('.slots')!;
    this.rows = this.root.querySelector('.rows')!;
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
    if (inv.version !== this.version) {
      this.version = inv.version;
      this.slots.innerHTML = SLOTS.map((t, i) => {
        const name = t === 'can' ? 'CAN' : t === 'marker' ? (inv.hasMarker ? 'MARKER' : '------') : inv.hasLadder ? 'LADDER' : '------';
        return `<span class="${i === inv.selected ? 'on' : ''}">[${i + 1}] ${name}</span>`;
      }).join('');
      const tool = inv.tool;
      // The ladder has no color: it shows how it's used instead.
      const rows =
        tool === 'ladder'
          ? [['LMB', 'PLACE (MOVES IT)', '']]
          : [['COLOR', `<i class="swatch" style="background:${COLORS[inv.color]}"></i>${inv.color.toUpperCase()}`, `${inv.colors.indexOf(inv.color) + 1}/${inv.colors.length}`]];
      if (tool === 'can') {
        rows.push(['CAP', CAPS[inv.cap].name, `${inv.caps.length}/${CAP_ORDER.length}`]);
      }
      this.rows.innerHTML = tool ? rows.map(([k, v, n]) => `<div><span>${k}</span>${v}<em>${n}</em></div>`).join('') : '<div class="dim">NO TOOL</div>';
    }
  }
}
