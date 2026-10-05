import { HUD, VIGNETTE } from './config';
import { isFullscreen } from './fullscreen';
import { SettingsPage } from './settings-page';
import type { SettingSection } from './settings';

// Body-cam style HUD: vignette, corner brackets, REC indicator with elapsed
// time, clock, crosshair, the PSI gauge, cap and color tags beside the tool in
// hand, performance numbers, and the start/pause menu.
// The tool readout lives in inventory/hotbar.ts, the debug panel in debug/panel.ts.

const CONTROLS = [
  ['WASD / SHIFT / SPACE', 'move / run / jump'],
  ['MOVE INTO LADDER', 'climb (CTRL holds, SPACE lets go)'],
  ['LMB', 'spray / draw / place ladder / roll / scrub'],
  ['RMB', 'shake can'],
  ['1 – 5', 'can / marker / ladder / roller / sponge'],
  ['Q / E', 'color'],
  ['WHEEL', 'cap / nib or sponge size / turn ladder'],
  ['B', 'build mode'],
  ['K', 'screenshot'],
  ['F3', 'debug + tuning'],
];

const CAP_TAG_SECONDS = 2.5;
/** The color tag sits this many CSS px below the cap tag. */
const COLOR_TAG_OFFSET = 22;
/** The PSI gauge sits this many CSS px above the cap tag, the low-pressure alert above it. */
const GAUGE_OFFSET = -22;
const ALERT_OFFSET = -44;
/** The PSI gauge stays up this long after the pressure last changed (spraying, shaking). */
const GAUGE_SECONDS = 1.2;

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
  private settingsPage: SettingsPage | null = null;
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
      <div class="perf"></div>
      <div class="cap-tag" hidden></div>
      <div class="cap-tag color-tag" hidden></div>
      <div class="cap-tag psi-gauge"><span>PSI</span><div class="line"><i></i></div><b></b></div>
      <div class="cap-tag psi-alert" hidden>LOW PRESSURE — SHAKE [RMB]</div>
      <div class="overlay">
        <div class="title">roof.hidden.haus</div>
        <div class="status blink">CLICK TO START</div>
        <div class="menu">
          <button class="resume"></button>
          <button class="open-settings">&gt; SETTINGS</button>
          <button class="exit-fs">&gt; EXIT FULLSCREEN</button>
        </div>
        <table>${CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
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
    this.overlay.classList.toggle('compact', debugOpen);
    this.syncMenu();
  }

  private syncMenu() {
    this.status.textContent = this.started ? 'PAUSED' : 'CLICK TO START';
    this.resume.textContent = this.started ? '> RESUME' : '> START';
    this.exitFs.hidden = !isFullscreen();
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
    this.capTagUntil = performance.now() + CAP_TAG_SECONDS * 1000;
  }

  /** Shows the paint color (swatch + name) for a few seconds, just below the cap tag. */
  showColorTag(name: string, hex: string) {
    this.colorTag.innerHTML = `COLOR · <i class="swatch" style="background:${hex}"></i>${name.toUpperCase()}`;
    this.colorTagUntil = performance.now() + CAP_TAG_SECONDS * 1000;
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
    if (pressure !== null && pressure !== this.lastPressure && this.lastPressure >= 0) this.gaugeUntil = now + GAUGE_SECONDS * 1000;
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

  /** The performance readout, bottom left: written a few times a second. */
  setPerf(p: { fps: number; frameMs: number; calls: number; triangles: number; textureBytes: number }) {
    this.perf.hidden = !HUD.perf;
    if (!HUD.perf) return;
    const now = performance.now();
    if (now - this.perfAt < 250) return;
    this.perfAt = now;
    const mb = p.textureBytes / 1048576;
    const text = [
      `fps · ${Math.round(p.fps)} (${p.frameMs.toFixed(1)} ms cpu)`,
      `draw calls · ${p.calls}`,
      `triangles · ${p.triangles.toLocaleString('en-US')}`,
      `tex memory · ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`,
    ].join('\n');
    if (text === this.perfShown) return;
    this.perfShown = text;
    this.perf.textContent = text;
  }

  /** The vignette gradient from VIGNETTE: at start, and again when F3 changes it (live.syncVignette). */
  syncVignette() {
    const start = Math.min(99, Math.max(0, VIGNETTE.start));
    const shade = (a: number) => `color-mix(in srgb, ${VIGNETTE.color} ${Math.round(Math.min(1, Math.max(0, a)) * 100)}%, transparent)`;
    // Like the fixed gradient it replaces: a third of the strength a bit over half way out.
    this.vignette.style.background = `radial-gradient(ellipse at center, transparent ${start}%, ${shade(VIGNETTE.strength / 3)} ${start + (100 - start) * 0.55}%, ${shade(VIGNETTE.strength)} 100%)`;
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
