import { HUD, PAUSE_MENU, VIGNETTE } from './config';
import { isFullscreen } from './fullscreen';
import { SettingsPage } from './settings-page';
import type { SettingSection } from './settings';

// Body-cam style HUD: vignette, corner brackets, REC indicator with elapsed
// time, clock, crosshair, the PSI gauge, cap and color tags beside the tool in
// hand, performance numbers, and the start/pause menu.
// The tool readout lives in inventory/hotbar.ts, the debug panel in debug/panel.ts.

/** The key list under the pause menu: the main keys, then the tools a little apart (style.css). */
const CONTROLS = [
  ['WASD • SHIFT • SPACE', 'move • run • jump'],
  ['LMB', 'draw'],
  ['RMB', 'shake can'],
  ['Q / E', 'color'],
  ['MOUSE WHEEL', 'cap • tool width • turn ladder'],
  ['K', 'screenshot'],
];
const TOOLS = [
  ['1', 'can'],
  ['2', 'marker'],
  ['3', 'ladder'],
  ['4', 'roller'],
  ['5', 'sponge'],
];

/** The color tag sits this many CSS px below the cap tag. */
const COLOR_TAG_OFFSET = 22;
/** The PSI gauge sits this many CSS px above the cap tag, the low-pressure alert above it. */
const GAUGE_OFFSET = -22;
const ALERT_OFFSET = -44;
/** Menu messages (SAVE / LOAD PAINT) show this long. */
const NOTICE_SECONDS = 3;
/** previewSheet shows the full pause sheet this long after the last change. */
const PREVIEW_SECONDS = 1.5;

export class Hud {
  onResume = () => {};
  onExitFullscreen = () => {};
  /** SAVE PAINT / LOAD PAINT in the menu (save/). */
  onSavePaint = () => {};
  onLoadPaint = () => {};
  private overlay: HTMLElement;
  private status: HTMLElement;
  private exitFs: HTMLElement;
  private savePaint: HTMLElement;
  private resume: HTMLElement;
  private rec: HTMLElement;
  private clock: HTMLElement;
  private crosshair: HTMLElement;
  private perf: HTMLElement;
  private perfShown = '';
  private perfAt = 0;
  private vignette: HTMLElement;
  private capTag: HTMLElement;
  private capTagUntil = 0;
  private colorTag: HTMLElement;
  private colorTagUntil = 0;
  private gauge: HTMLElement;
  private gaugeFill: HTMLElement;
  private gaugeText: HTMLElement;
  private alert: HTMLElement;
  /** What the gauge shows now, so it's rewritten only on change. */
  private gaugeShown = '';
  private gaugeUntil = 0;
  private gaugeOn = false;
  private lastPressure = -1;
  private crosshairSize = -1;
  private started = false;
  /** A message (notice) shows in the menu's status line until this time. */
  private noticeUntil = 0;
  private settingsPage: SettingsPage | null = null;
  private start = performance.now();
  private lastSecond = -1;
  /** The parts HUD switches on and off, and which were shown last (rewritten only on change). */
  private parts: [keyof typeof HUD, HTMLElement[]][];
  private partsShown = '';
  /** The PAUSE_MENU look last applied (rewritten only on change). */
  private sheet = '';
  private debugOpen = false;
  /** The full sheet shows until this time (previewSheet). */
  private previewUntil = 0;

  constructor() {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="rec"><div class="rec-line"><i></i><span class="rec-time">REC 00:00:00</span></div><div class="dim">CAM 01 · ROOFTOP</div></div>
      <div class="clock"></div>
      <div class="perf"></div>
      <div class="cap-tag" hidden></div>
      <div class="cap-tag color-tag" hidden></div>
      <div class="cap-tag psi-gauge"><span>PSI</span><div class="line"><i></i></div><b></b></div>
      <div class="cap-tag psi-alert" hidden>LOW PRESSURE — SHAKE [RMB]</div>
      <div class="overlay">
        <div class="title">Hidden Roof</div>
        <div class="status blink">CLICK TO START</div>
        <div class="menu">
          <button class="resume"></button>
          <button class="save-paint">&gt; SAVE PAINT</button>
          <button class="load-paint">&gt; LOAD PAINT</button>
          <button class="open-settings">&gt; SETTINGS</button>
          <button class="exit-fs">&gt; EXIT FULLSCREEN</button>
        </div>
        <table>${[CONTROLS, TOOLS].map((keys) => `<tbody>${keys.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody>`).join('')}</table>
      </div>`;
    document.body.appendChild(root);
    // The crosshair inverts what's under it (style.css), so it's its own layer
    // over the game view: inside the HUD it could only blend with the HUD.
    // Before the HUD, so the pause menu still covers it.
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    document.body.insertBefore(this.crosshair, root);
    this.overlay = root.querySelector('.overlay')!;
    this.status = root.querySelector('.status')!;
    this.exitFs = root.querySelector('.exit-fs')!;
    this.vignette = root.querySelector('.vignette')!;
    this.perf = root.querySelector('.perf')!;
    this.syncVignette();
    this.rec = root.querySelector('.rec-time')!;
    this.clock = root.querySelector('.clock')!;
    this.parts = [
      ['frame', [...root.querySelectorAll<HTMLElement>('.corner')]],
      ['rec', [root.querySelector('.rec-line')!]],
      ['cam', [root.querySelector('.rec .dim')!]],
      ['clock', [this.clock]],
    ];
    this.capTag = root.querySelector('.cap-tag')!;
    this.colorTag = root.querySelector('.color-tag')!;
    this.gauge = root.querySelector('.psi-gauge')!;
    this.gaugeFill = root.querySelector('.psi-gauge i')!;
    this.gaugeText = root.querySelector('.psi-gauge b')!;
    this.alert = root.querySelector('.psi-alert')!;
    // mousedown, like the canvas: the click that starts the game is the same gesture.
    this.resume = root.querySelector('.resume')!;
    this.resume.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onResume();
    });
    root.querySelector('.open-settings')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.openSettings(true);
    });
    this.exitFs.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onExitFullscreen();
    });
    this.savePaint = root.querySelector('.save-paint')!;
    this.savePaint.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onSavePaint();
    });
    // click, not mousedown: the file picker opens only from a click.
    root.querySelector('.load-paint')!.addEventListener('click', () => this.onLoadPaint());
    document.addEventListener('fullscreenchange', () => this.syncMenu());
    this.syncMenu();
  }

  /**
   * Unlocked = paused: before the first start it's the title screen, after that the
   * pause menu. With the debug panel open the menu stays, but compact and see-through.
   */
  setLocked(locked: boolean, debugOpen = false) {
    if (locked) {
      this.started = true;
      this.openSettings(false);
    }
    this.overlay.hidden = locked;
    // No cursor while paused (ESC), the pause menu or the debug panel has the mouse.
    this.crosshair.hidden = !locked;
    this.debugOpen = debugOpen;
    this.syncCompact();
    this.syncMenu();
  }

  /** Show the full pause sheet (as without F3) for a moment: F3 is tuning it (PAUSE_MENU). */
  previewSheet() {
    this.previewUntil = performance.now() + PREVIEW_SECONDS * 1000;
    this.syncCompact();
  }

  /** With F3 open the sheet is compact and lighter, unless it's being previewed. Paused without F3: no in-game UI. */
  private syncCompact() {
    const compact = this.debugOpen && performance.now() >= this.previewUntil;
    this.overlay.classList.toggle('compact', compact);
    // The full sheet hides the in-game UI (style.css); with F3 it stays, to tune it.
    document.body.classList.toggle('paused', !this.overlay.hidden && !compact);
  }

  /** Shows a message in the menu's status line for `seconds` (the toasts don't show over the menu); Infinity: until the next one. */
  notice(msg: string, seconds = NOTICE_SECONDS) {
    this.noticeUntil = performance.now() + seconds * 1000;
    this.status.textContent = msg.toUpperCase();
  }

  private syncMenu() {
    if (performance.now() >= this.noticeUntil) this.status.textContent = this.started ? 'PAUSED' : 'CLICK TO START';
    this.resume.textContent = this.started ? '> RESUME' : '> START';
    this.exitFs.hidden = !isFullscreen();
    // Nothing to save on the title screen; LOAD can come first.
    this.savePaint.hidden = !this.started;
  }

  /** The settings page, opened from the pause menu (SETTINGS) and closed with BACK. */
  setSettings(sections: SettingSection[]) {
    this.settingsPage?.root.remove();
    this.settingsPage = new SettingsPage(sections, () => this.openSettings(false));
    this.overlay.querySelector('.menu')!.after(this.settingsPage.root);
  }

  private openSettings(open: boolean) {
    this.overlay.classList.toggle('in-settings', open);
    if (open) this.settingsPage?.sync();
  }

  /** Crosshair circle diameter in CSS pixels. */
  setCrosshair(px: number) {
    if (px === this.crosshairSize) return;
    this.crosshairSize = px;
    this.crosshair.style.setProperty('--size', `${px}px`);
  }

  /** Shows the cap name for a few seconds; place it with `placeToolTags`. */
  showCapTag(name: string) {
    this.capTag.textContent = `CAP · ${name}`;
    this.capTagUntil = performance.now() + HUD.tagTime * 1000;
  }

  /** Shows the paint color (swatch + name) for a few seconds, just below the cap tag. */
  showColorTag(name: string, hex: string) {
    this.colorTag.innerHTML = `COLOR · <i class="swatch" style="background:${hex}"></i>${name.toUpperCase()}`;
    this.colorTagUntil = performance.now() + HUD.tagTime * 1000;
  }

  /**
   * Screen position (CSS px) next to the tool in hand (can, marker or roller), or null
   * with no tool. Places the cap and color tags, and above them the PSI gauge
   * (`pressure` 0..1 with the can in hand, else null): it fades in while the
   * pressure changes (spraying, shaking) and out a moment after, but stays up
   * while the pressure is low, with the low-pressure alert above it.
   */
  placeToolTags(at: { x: number; y: number } | null, pressure: number | null, low: boolean) {
    const now = performance.now();
    if (pressure !== null && pressure !== this.lastPressure && this.lastPressure >= 0) this.gaugeUntil = now + HUD.gaugeTime * 1000;
    this.lastPressure = pressure ?? -1;
    const on = !!at && pressure !== null && (low || now < this.gaugeUntil);
    if (on !== this.gaugeOn) this.gauge.classList.toggle('show', (this.gaugeOn = on));
    if (on) {
      const shown = `${Math.round(pressure * 100)}|${low}`;
      if (shown !== this.gaugeShown) {
        this.gaugeShown = shown;
        this.gaugeFill.style.width = `${pressure * 100}%`;
        this.gaugeText.textContent = `${Math.round(pressure * 100)}%`;
        this.gauge.classList.toggle('low', low);
      }
    }
    // Keeps following the can while it fades out.
    if (at) this.gauge.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + GAUGE_OFFSET)}px)`;
    const alert = !!at && pressure !== null && low;
    this.alert.hidden = !alert;
    if (alert) this.alert.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + ALERT_OFFSET)}px)`;
    const place = (el: HTMLElement, until: number, dy: number) => {
      const show = !!at && now < until;
      el.hidden = !show;
      if (show) el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + dy)}px)`;
    };
    place(this.capTag, this.capTagUntil, 0);
    // The marker has no cap: its color tag takes the cap tag's place.
    place(this.colorTag, this.colorTagUntil, this.capTag.hidden ? 0 : COLOR_TAG_OFFSET);
  }

  /** The performance readout, bottom left: written a few times a second. `gpu`: ms per frame, null = not measurable, undefined = not shown. */
  setPerf(p: { fps: number; frameMs: number; gpu?: number | null; calls: number; triangles: number; textureBytes: number }) {
    this.perf.hidden = !HUD.perf;
    if (!HUD.perf) return;
    const now = performance.now();
    if (now - this.perfAt < 250) return;
    this.perfAt = now;
    const mb = p.textureBytes / 1048576;
    const text = [
      `fps · ${Math.round(p.fps)} (${p.frameMs.toFixed(1)} ms cpu)`,
      ...(p.gpu === undefined ? [] : [`gpu · ${p.gpu === null ? 'n/a' : `${p.gpu.toFixed(1)} ms`}`]),
      `draw calls · ${p.calls}`,
      `triangles · ${p.triangles.toLocaleString('en-US')}`,
      `tex memory · ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`,
    ].join('\n');
    if (text === this.perfShown) return;
    this.perfShown = text;
    this.perf.textContent = text;
  }

  /** The pause menu's sheet and key list from PAUSE_MENU. */
  private syncSheet() {
    const m = PAUSE_MENU;
    const sheet = `${m.color}|${m.opacity}|${m.debugOpacity}|${m.controls}`;
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    const mix = (a: number) => `color-mix(in srgb, ${m.color} ${Math.round(Math.min(1, Math.max(0, a)) * 100)}%, transparent)`;
    this.overlay.style.setProperty('--sheet', mix(m.opacity));
    this.overlay.style.setProperty('--sheet-debug', mix(m.debugOpacity));
    this.overlay.querySelector('table')!.hidden = !m.controls;
  }

  /** The vignette gradient from VIGNETTE: at start, and again when F3 changes it (live.syncVignette). */
  syncVignette() {
    const start = Math.min(99, Math.max(0, VIGNETTE.start));
    const shade = (a: number) => `color-mix(in srgb, ${VIGNETTE.color} ${Math.round(Math.min(1, Math.max(0, a)) * 100)}%, transparent)`;
    this.vignette.hidden = !VIGNETTE.enabled;
    // Like the fixed gradient it replaces: a third of the strength a bit over half way out.
    this.vignette.style.background = `radial-gradient(ellipse at center, transparent ${start}%, ${shade(VIGNETTE.strength / 3)} ${start + (100 - start) * 0.55}%, ${shade(VIGNETTE.strength)} 100%)`;
  }

  update() {
    if (this.previewUntil && performance.now() >= this.previewUntil) {
      this.previewUntil = 0;
      this.syncCompact();
    }
    const shown = this.parts.map(([k]) => (HUD[k] ? 1 : 0)).join('');
    if (shown !== this.partsShown) {
      this.partsShown = shown;
      for (const [k, els] of this.parts) for (const el of els) el.hidden = !HUD[k];
    }
    this.syncSheet();
    if (this.noticeUntil && performance.now() >= this.noticeUntil) {
      this.noticeUntil = 0;
      this.syncMenu();
    }
    const s = Math.floor((performance.now() - this.start) / 1000);
    if (s === this.lastSecond) return;
    this.lastSecond = s;
    const p = (n: number) => String(n).padStart(2, '0');
    this.rec.textContent = `REC ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    const d = new Date();
    this.clock.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}
