import { CROSSHAIR, HUD, VIGNETTE } from './config';
import { netLines, type NetStats } from './net/diagnostics';
import { PauseMenu } from './pause-menu';

// Body-cam style HUD: vignette, corner brackets, REC indicator with elapsed
// time, clock, crosshair, cap and color tags beside the tool in
// hand, performance numbers, and over it all the ESC menu (pause-menu.ts).
// Each part is a layer of its own under body (style.css, the --z-* tokens in boot.css).
// The tool readout lives in inventory/hotbar.ts, the debug panel in debug/panel.ts.

const TAGS = '<div class="cap-tag" hidden></div><div class="cap-tag color-tag" hidden></div>';

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
  /** The tags that invert, and under them their swatches. */
  private stacks: HTMLElement[];
  private capTags: HTMLElement[];
  private capTagUntil = 0;
  private colorTags: HTMLElement[];
  private colorTagUntil = 0;
  private crosshairSize = -1;
  private crosshairBar: number | null = null;
  private arc: number | null = null;
  private percent: HTMLElement;
  private percentUntil = 0;
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
      <div class="tool-stack swatches" hidden>${TAGS}</div>`;
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
    this.percent = this.crosshair.appendChild(document.createElement('span'));
    this.percent.hidden = true;
    // The tags invert too, so they're a layer of their own as well. A swatch can't, it would show the wrong color: it
    // stays in the tool layer, at the same place in tags of nothing else.
    const view = Object.assign(document.createElement('div'), { className: 'tool-stack on-view', hidden: true, innerHTML: TAGS });
    document.body.append(this.crosshair, view);
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
    this.stacks = [view, tools.querySelector<HTMLElement>('.tool-stack')!];
    this.capTags = this.stacks.map((s) => s.querySelector<HTMLElement>('.cap-tag')!);
    this.colorTags = this.stacks.map((s) => s.querySelector<HTMLElement>('.color-tag')!);
    this.menu = new PauseMenu(menu);
  }

  /** Unlocked = paused, behind the menu (pause-menu.ts); with the debug panel open it stays, compact. */
  setLocked(locked: boolean, debugOpen = false) {
    // No cursor while paused (ESC), the pause menu or the debug panel has the mouse.
    this.crosshair.hidden = !locked;
    this.menu.setLocked(locked, debugOpen);
  }

  /** The title screen (before START), the queue and the loading screen show a fixed view of the city; ESC later shows where you are. */
  get cityView() {
    return this.menu.cityView;
  }

  /** The arc beside the crosshair: the can's opacity 0..1; null: none. When it changes, the percent shows beside the arc for as long as the arc answers. */
  setArc(opacity: number | null) {
    const now = performance.now();
    if (opacity !== this.arc) {
      if (opacity !== null && this.arc !== null) {
        this.percent.textContent = `${Math.round(opacity * 100)}%`;
        this.percentUntil = now + Math.max(CROSSHAIR.arc.flowMs, CROSSHAIR.arc.lineMs);
        this.answer(this.arc, opacity);
      }
      this.arc = opacity;
      this.crosshair.classList.toggle('arc', opacity !== null);
      if (opacity !== null) this.crosshair.style.setProperty('--opacity', `${opacity}`);
    }
    this.percent.hidden = opacity === null || now >= this.percentUntil;
  }

  /** The arc answers a change: it flows to the new value and its line swells, for a moment and off the frame's work (the browser runs it). */
  private answer(from: number, to: number) {
    const { flowMs, bounce, line, peak, lineMs } = CROSSHAIR.arc;
    this.crosshair.style.setProperty('--arc-line', `${line}px`);
    this.crosshair.animate([{ '--opacity': `${from}` }, { '--opacity': `${to}` }], { duration: flowMs, easing: `cubic-bezier(0.3, ${bounce}, 0.5, 1)` });
    this.crosshair.animate([{ '--arc-line': `${peak}px` }, { '--arc-line': `${line}px` }], { duration: lineMs, easing: 'ease-out' });
  }

  /** The crosshair's size in CSS pixels: a ring's diameter, or with `bar`, a bar's width and height. */
  setCrosshair(px: number, bar: number | null) {
    if (px !== this.crosshairSize) {
      this.crosshairSize = px;
      this.crosshair.style.setProperty('--size', `${px}px`);
    }
    if (bar === this.crosshairBar) return;
    this.crosshairBar = bar;
    this.crosshair.classList.toggle('bar', bar !== null);
    if (bar !== null) this.crosshair.style.setProperty('--bar', `${bar}px`);
  }

  /** The crosshair fades where the tool in hand wouldn't reach. */
  setReach(reaches: boolean) {
    this.crosshair.style.opacity = reaches ? '' : `${CROSSHAIR.far}`;
  }

  // Kept for a flat nib on the marker, a later version.
  // /** A flat nib's crosshair, a bar turned as the nib is: as long as setCrosshair's size, and `stretch` times thinner. None: round. */
  // setNib(nib?: { stretch: number; angle: number }) {
  //   this.crosshair.classList.toggle('nib', !!nib);
  //   if (!nib) return;
  //   this.crosshair.style.setProperty('--nib-stretch', `${nib.stretch}`);
  //   this.crosshair.style.setProperty('--nib-angle', `${nib.angle}deg`);
  // }

  /** Shows the cap name for a few seconds; place it with `placeToolTags`. */
  showCapTag(name: string) {
    for (const t of this.capTags) t.textContent = `CAP · ${name}`;
    this.capTagUntil = performance.now() + HUD.tagTime * 1000;
  }

  /** Shows the paint color (swatch + name) for a few seconds, just below the cap tag. */
  showColorTag(name: string, hex: string) {
    // The swatch's color through the DOM, not a style attribute: a CSP without 'unsafe-inline' allows it.
    for (const t of this.colorTags) {
      const swatch = Object.assign(document.createElement('i'), { className: 'swatch' });
      swatch.style.background = hex;
      t.replaceChildren('COLOR · ', swatch, name.toUpperCase());
    }
    this.colorTagUntil = performance.now() + HUD.tagTime * 1000;
  }

  /**
   * Screen position (CSS px) next to the tool in hand (can, marker or roller), or null
   * with no tool. Places the cap and color tags.
   */
  placeToolTags(at: { x: number; y: number } | null) {
    const now = performance.now();
    for (const s of this.stacks) {
      s.hidden = !at;
      if (at) s.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    }
    for (const t of this.capTags) t.hidden = now >= this.capTagUntil;
    for (const t of this.colorTags) t.hidden = now >= this.colorTagUntil;
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
