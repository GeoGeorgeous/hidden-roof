import { isFullscreen } from './fullscreen';

// Body-cam style HUD: vignette, corner brackets, REC indicator with elapsed
// time, clock, crosshair, the cap tag beside the can, and the start/pause menu.
// The tool readout lives in inventory/hotbar.ts, the debug panel in debug/panel.ts.

const CONTROLS = [
  ['WASD / SHIFT / SPACE', 'move / run / jump'],
  ['MOVE INTO LADDER', 'climb (CTRL holds, SPACE lets go)'],
  ['LMB', 'spray / draw'],
  ['RMB', 'shake can'],
  ['1 / 2', 'can / marker'],
  ['Q / E', 'color'],
  ['WHEEL', 'cap'],
  ['B', 'build mode'],
  ['F3', 'debug + tuning'],
];

const CAP_TAG_SECONDS = 2.5;
/** The color tag sits this many CSS px below the cap tag. */
const COLOR_TAG_OFFSET = 22;

export class Hud {
  onResume = () => {};
  onExitFullscreen = () => {};
  private overlay: HTMLElement;
  private status: HTMLElement;
  private exitFs: HTMLElement;
  private resume: HTMLElement;
  private rec: HTMLElement;
  private clock: HTMLElement;
  private crosshair: HTMLElement;
  private capTag: HTMLElement;
  private capTagUntil = 0;
  private colorTag: HTMLElement;
  private colorTagUntil = 0;
  private crosshairSize = -1;
  private started = false;
  private settingSyncs: (() => void)[] = [];
  private start = performance.now();
  private lastSecond = -1;

  constructor() {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="rec"><i></i><span class="rec-time">REC 00:00:00</span><div class="dim">CAM 01 · ROOFTOP</div></div>
      <div class="clock"></div>
      <div class="crosshair"></div>
      <div class="cap-tag" hidden></div>
      <div class="cap-tag color-tag" hidden></div>
      <div class="overlay">
        <div class="title">TAGGIN'</div>
        <div class="status blink">CLICK TO START</div>
        <div class="menu">
          <button class="resume"></button>
          <button class="exit-fs">&gt; EXIT FULLSCREEN</button>
        </div>
        <div class="settings"></div>
        <table>${CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      </div>`;
    document.body.appendChild(root);
    this.overlay = root.querySelector('.overlay')!;
    this.status = root.querySelector('.status')!;
    this.exitFs = root.querySelector('.exit-fs')!;
    this.rec = root.querySelector('.rec-time')!;
    this.clock = root.querySelector('.clock')!;
    this.crosshair = root.querySelector('.crosshair')!;
    this.capTag = root.querySelector('.cap-tag')!;
    this.colorTag = root.querySelector('.color-tag')!;
    // mousedown, like the canvas: the click that starts the game is the same gesture.
    this.resume = root.querySelector('.resume')!;
    this.resume.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onResume();
    });
    this.exitFs.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onExitFullscreen();
    });
    document.addEventListener('fullscreenchange', () => this.syncMenu());
    this.syncMenu();
  }

  /**
   * Unlocked = paused: before the first start it's the title screen, after that the
   * pause menu. With the debug panel open the menu stays, but compact and see-through.
   */
  setLocked(locked: boolean, debugOpen = false) {
    if (locked) this.started = true;
    this.overlay.hidden = locked;
    this.overlay.classList.toggle('compact', debugOpen);
    this.syncMenu();
  }

  private syncMenu() {
    this.status.textContent = this.started ? 'PAUSED' : 'CLICK TO START';
    this.resume.textContent = this.started ? '> RESUME' : '> START';
    this.exitFs.hidden = !isFullscreen();
    for (const s of this.settingSyncs) s();
  }

  /** Settings rows under the menu buttons: click a value for the next one, right-click for the previous. */
  setSettings(rows: { label: string; value: () => string; step: (d: number) => void }[]) {
    const box = this.overlay.querySelector('.settings')!;
    box.innerHTML = '';
    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'setting';
      const btn = document.createElement('button');
      const sync = () => (btn.textContent = `< ${row.value()} >`);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        row.step(e.button === 2 ? -1 : 1);
        sync();
      });
      el.append(Object.assign(document.createElement('span'), { textContent: row.label }), btn);
      box.append(el);
      sync();
      this.settingSyncs.push(sync);
    }
  }

  /** Crosshair circle diameter in CSS pixels. */
  setCrosshair(px: number) {
    if (px === this.crosshairSize) return;
    this.crosshairSize = px;
    this.crosshair.style.setProperty('--size', `${px}px`);
  }

  /** Shows the cap name for a few seconds; place it with `placeCapTag`. */
  showCapTag(name: string) {
    this.capTag.textContent = `CAP · ${name}`;
    this.capTagUntil = performance.now() + CAP_TAG_SECONDS * 1000;
  }

  /** Shows the paint color (swatch + name) for a few seconds, just below the cap tag. */
  showColorTag(name: string, hex: string) {
    this.colorTag.innerHTML = `COLOR · <i class="swatch" style="background:${hex}"></i>${name.toUpperCase()}`;
    this.colorTagUntil = performance.now() + CAP_TAG_SECONDS * 1000;
  }

  /** Screen position (CSS px) next to the can, or null when the can isn't in hand. Places the cap and color tags. */
  placeCapTag(at: { x: number; y: number } | null) {
    const now = performance.now();
    const place = (el: HTMLElement, until: number, dy: number) => {
      const show = !!at && now < until;
      el.hidden = !show;
      if (show) el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + dy)}px)`;
    };
    place(this.capTag, this.capTagUntil, 0);
    place(this.colorTag, this.colorTagUntil, COLOR_TAG_OFFSET);
  }

  update() {
    const s = Math.floor((performance.now() - this.start) / 1000);
    if (s === this.lastSecond) return;
    this.lastSecond = s;
    const p = (n: number) => String(n).padStart(2, '0');
    this.rec.textContent = `REC ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    const d = new Date();
    this.clock.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}
