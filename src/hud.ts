import { HUD, VIGNETTE } from './config';
import { label } from './input';
import { netLines, type NetStats } from './net/diagnostics';
import { msg } from './messages';
import { PauseMenu } from './pause-menu';

// Body-cam style HUD: vignette, corner brackets, REC indicator with elapsed
// time, clock, crosshair, the PSI gauge, cap and color tags beside the tool in
// hand, performance numbers, and over it all the ESC menu (pause-menu.ts).
// Each part is a layer of its own under body (style.css, the --z-* tokens in boot.css).
// The tool readout lives in inventory/hotbar.ts, the debug panel in debug/panel.ts.

/** The tool stack starts this many CSS px above the cap tag: the low-pressure alert, then the PSI gauge, then the cap tag (style.css .tool-stack). */
const STACK_TOP = -44;

export class Hud {
  /** The start / pause screen and its pages. */
  readonly menu: PauseMenu;
  private rec: HTMLElement;
  private clock: HTMLElement;
  private crosshair: HTMLElement;
  private perf: HTMLElement;
  private perfShown = '';
  private perfAt = 0;
  private vignette: HTMLElement;
  private stack: HTMLElement;
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
  private start = performance.now();
  private lastSecond = -1;
  /** The parts HUD switches on and off, and which were shown last (rewritten only on change). */
  private parts: [keyof typeof HUD, HTMLElement[]][];
  private partsShown = '';

  constructor() {
    const frame = document.createElement('div');
    frame.className = 'layer layer-frame';
    frame.innerHTML = `
      <div class="vignette"></div>
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="rec"><div class="rec-line"><i></i><span class="rec-time">REC 00:00:00</span></div><div class="dim">CAM 01 · ROOFTOP</div></div>
      <div class="clock"></div>
      <div class="perf"></div>`;
    const tools = document.createElement('div');
    tools.className = 'layer layer-tool';
    tools.innerHTML = `
      <div class="tool-stack" hidden>
        <div class="cap-tag psi-alert off">${msg('hud.lowPressure', { shake: label('shake') })}</div>
        <div class="cap-tag psi-gauge"><span>PSI</span><div class="line"><i></i></div><b></b></div>
        <div class="cap-tag" hidden></div>
        <div class="cap-tag color-tag" hidden></div>
      </div>`;
    const world = document.createElement('div');
    world.className = 'layer layer-world';
    const menu = document.createElement('div');
    menu.className = 'layer layer-menu';
    document.body.append(world, frame, tools, menu);
    // The crosshair inverts what's under it (style.css), so it's its own layer
    // over the game view: inside the HUD it could only blend with the HUD.
    // Under the pause menu, over the world tags.
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    document.body.append(this.crosshair);
    this.vignette = frame.querySelector('.vignette')!;
    this.perf = frame.querySelector('.perf')!;
    this.syncVignette();
    this.rec = frame.querySelector('.rec-time')!;
    this.clock = frame.querySelector('.clock')!;
    this.parts = [
      ['frame', [...frame.querySelectorAll<HTMLElement>('.corner')]],
      ['rec', [frame.querySelector('.rec-line')!]],
      ['cam', [frame.querySelector('.rec .dim')!]],
      ['clock', [this.clock]],
    ];
    this.stack = tools.querySelector('.tool-stack')!;
    this.capTag = tools.querySelector('.cap-tag:not(.psi-alert, .psi-gauge)')!;
    this.colorTag = tools.querySelector('.color-tag')!;
    this.gauge = tools.querySelector('.psi-gauge')!;
    this.gaugeFill = tools.querySelector('.psi-gauge i')!;
    this.gaugeText = tools.querySelector('.psi-gauge b')!;
    this.alert = tools.querySelector('.psi-alert')!;
    this.menu = new PauseMenu(menu);
  }

  /** Unlocked = paused, behind the menu (pause-menu.ts); with the debug panel open it stays, compact. */
  setLocked(locked: boolean, debugOpen = false) {
    // No cursor while paused (ESC), the pause menu or the debug panel has the mouse.
    this.crosshair.hidden = !locked;
    this.menu.setLocked(locked, debugOpen);
  }

  /** The title screen (before START) shows a fixed view of the city; ESC later shows where you are. */
  get cityView() {
    return this.menu.cityView;
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
    // The swatch's color through the DOM, not a style attribute: a CSP without 'unsafe-inline' allows it.
    const swatch = Object.assign(document.createElement('i'), { className: 'swatch' });
    swatch.style.background = hex;
    this.colorTag.replaceChildren('COLOR · ', swatch, name.toUpperCase());
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
    // Keeps following the can while the gauge fades out.
    this.stack.hidden = !at;
    if (at) this.stack.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + STACK_TOP)}px)`;
    const alert = !!at && pressure !== null && low;
    this.alert.classList.toggle('off', !alert);
    if (alert) {
      // The shake key may have been rebound (Settings → Controls).
      const text = msg('hud.lowPressure', { shake: label('shake') });
      if (this.alert.textContent !== text) this.alert.textContent = text;
    }
    this.capTag.hidden = now >= this.capTagUntil;
    this.colorTag.hidden = now >= this.colorTagUntil;
  }

  /** The performance readout, bottom left: written a few times a second. `gpuName`: what draws (null: hidden by the browser); `gpu`: ms per frame, null = not measurable, undefined = not shown. */
  setPerf(p: { fps: number; frameMs: number; gpuName: string | null; gpu?: number | null; calls: number; triangles: number; textureBytes: number; net: NetStats | null }) {
    this.perf.hidden = !HUD.perf;
    if (!HUD.perf) return;
    const now = performance.now();
    if (now - this.perfAt < 250) return;
    this.perfAt = now;
    const mb = p.textureBytes / 1048576;
    const text = [
      `fps · ${Math.round(p.fps)} (${p.frameMs.toFixed(1)} ms cpu)`,
      `gpu · ${p.gpuName ?? 'hidden'}${p.gpu === undefined ? '' : ` · ${p.gpu === null ? 'n/a' : `${p.gpu.toFixed(1)} ms`}`}`,
      `draw calls · ${p.calls}`,
      `triangles · ${p.triangles.toLocaleString('en-US')}`,
      `tex memory · ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`,
      ...netLines(p.net),
    ].join('\n');
    if (text === this.perfShown) return;
    this.perfShown = text;
    this.perf.textContent = text;
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
    this.menu.update();
    const shown = this.parts.map(([k]) => (HUD[k] ? 1 : 0)).join('');
    if (shown !== this.partsShown) {
      this.partsShown = shown;
      for (const [k, els] of this.parts) for (const el of els) el.hidden = !HUD[k];
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
