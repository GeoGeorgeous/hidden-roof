import { CAP_ORDER, CAPS, COLORS, PRESSURE } from '../config';
import { SLOTS, type Inventory } from './inventory';

// Tool readout, bottom-left: slots, color, cap, can size, pressure; plus toasts.
// Minimal text only; red is reserved for alerts (low pressure).

export class Hotbar {
  private root: HTMLElement;
  private slots: HTMLElement;
  private rows: HTMLElement;
  private psi: HTMLElement;
  private psiFill: HTMLElement;
  private psiText: HTMLElement;
  private alert: HTMLElement;
  private toastEl: HTMLElement;
  private toastTime = 0;
  private version = -1;
  /** What the pressure readout shows now (null before the first update). */
  private shown: { can: boolean; low: boolean; pressure: number } | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'readout';
    this.root.innerHTML = `
      <div class="slots"></div>
      <div class="rows"></div>
      <div class="psi"><span>PSI</span><div class="line"><i></i></div><b></b></div>
      <div class="alert">LOW PRESSURE — SHAKE [RMB]</div>`;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.append(this.root, this.toastEl);
    this.slots = this.root.querySelector('.slots')!;
    this.rows = this.root.querySelector('.rows')!;
    this.psi = this.root.querySelector('.psi')!;
    this.psiFill = this.root.querySelector('.psi i')!;
    this.psiText = this.root.querySelector('.psi b')!;
    this.alert = this.root.querySelector('.alert')!;
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
        const name = t === 'can' ? 'CAN' : inv.hasMarker ? 'MARKER' : '------';
        return `<span class="${i === inv.selected ? 'on' : ''}">[${i + 1}] ${name}</span>`;
      }).join('');
      const tool = inv.tool;
      const rows = [
        ['COLOR', `<i class="swatch" style="background:${COLORS[inv.color]}"></i>${inv.color.toUpperCase()}`, `${inv.colors.indexOf(inv.color) + 1}/${inv.colors.length}`],
      ];
      if (tool === 'can') {
        rows.push(['CAP', CAPS[inv.cap].name, `${inv.caps.length}/${CAP_ORDER.length}`]);
        rows.push(['CAN', inv.size.toUpperCase(), '']);
      }
      this.rows.innerHTML = tool ? rows.map(([k, v, n]) => `<div><span>${k}</span>${v}<em>${n}</em></div>`).join('') : '<div class="dim">NO TOOL</div>';
    }
    // The pressure readout is rewritten only when what it shows changed.
    const can = inv.tool === 'can';
    const low = can && inv.pressure < PRESSURE.sputterThreshold;
    const s = this.shown;
    if (s && can === s.can && low === s.low && (!can || inv.pressure === s.pressure)) return;
    this.shown = { can, low, pressure: inv.pressure };
    this.psi.hidden = !can;
    this.alert.hidden = !low;
    if (can) {
      this.psiFill.style.width = `${inv.pressure * 100}%`;
      this.psiText.textContent = `${Math.round(inv.pressure * 100)}%`;
      this.psi.classList.toggle('low', low);
    }
  }
}
