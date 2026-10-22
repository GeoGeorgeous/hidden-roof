import { AUDIO, HUD, INK_STYLES, PAINT, PAINT_DETAIL, PLAYER, RENDER, SKYLINE, SMOKE, TUTORIAL, VOLUMETRICS, WALL_HAND } from './config';
import { exitGameFullscreen } from './fullscreen';
import { msg } from './messages';
import { sentence } from './menu-ui';
import { DEFAULT_STYLE, inkStyle, setInkStyle } from './render/ink/styles';
import { NIGHT } from './render/atmosphere';
import { ControlsTab } from './controls-tab';
import { applyKeys, keyOverrides } from './key-bindings';
import { applyValues, changedValues, defaultsOf, loadSaved, save, type Remembered } from './settings-store';
import { currentOs, fasterGpuHow, type GpuInfo } from './gpu-name';
import type { TestedSettings } from './perf-test';

// Player settings, on the settings page of the pause menu (settings-page.ts):
// gameplay, controls (controls-tab.ts), graphics and sound. They write the same config values the debug
// panel (F3) edits, so both stay in step. All are remembered in this browser
// (settings-store.ts).
// Paint and city detail apply when the game resumes, since they rebuild every
// paint texture or the whole city: stepping through the choices costs
// nothing. config.ts holds the defaults.

const PIXEL_SCALES = [1, 1.5, 2, 2.5, 3, 4];
/** FRAME RATE choices (fps); 0 = no limit. */
const FRAME_RATES = [0, 30, 60, 90, 120, 144];
/** After PAINT and CITY DETAIL's value once it's changed: it applies when the game resumes. */
const ON_RESUME = '  ·  on resume';
/** Mouse sensitivity is shown as a multiple of config's (1.00x). */
const BASE_SENSITIVITY = PLAYER.mouseSensitivity;
/** config's field of view and running boost: their sliders' default ticks. */
const BASE_FOV = RENDER.fov;
const BASE_RUN_FOV = RENDER.sprintFovBoost;
const VOL_PRESETS = {
  off: { enabled: false, downscale: 2, steps: 16 },
  low: { enabled: true, downscale: 4, steps: 12 },
  medium: { enabled: true, downscale: 2, steps: 16 },
  high: { enabled: true, downscale: 1, steps: 24 },
};
type VolPreset = keyof typeof VOL_PRESETS;
const VOL_ORDER = Object.keys(VOL_PRESETS) as VolPreset[];
type PaintDetail = keyof typeof PAINT_DETAIL;
const DETAIL_ORDER = Object.keys(PAINT_DETAIL) as PaintDetail[];
/** How much of the city around the level is built: reach, rooftop clutter and how far thin lines show. */
const CITY_DETAIL = {
  low: { radius: 380, clutterRange: 110, lineRange: 0.55 },
  medium: { radius: 520, clutterRange: 190, lineRange: 0.8 },
  high: { radius: SKYLINE.radius, clutterRange: SKYLINE.clutterRange, lineRange: SKYLINE.lineRange },
};
type CityDetail = keyof typeof CITY_DETAIL;
const CITY_ORDER = Object.keys(CITY_DETAIL) as CityDetail[];

export class Settings {
  private vol: VolPreset;
  private detail: PaintDetail;
  private city: CityDetail;
  /** The city detail the current city was built with. */
  private builtCity: CityDetail;
  /** In a multiplayer session: the host's PAINT DETAIL, which holds whatever is picked here. */
  private locked: PaintDetail | null = null;
  /** The remembered fields' defaults, as they are when Settings starts: after main.ts turned the player build's performance lines off. */
  private defaults = defaultsOf(REMEMBERED);

  /**
   * `applyResolution` resizes the renderer after the pixel scale changed,
   * `applyPaintDetail` rebuilds the paint textures after PAINT.texelsPerMeter changed,
   * `applyCityDetail` rebuilds the city after SKYLINE changed.
   */
  constructor(
    private applyResolution: () => void,
    private applyPaintDetail: () => void,
    private applyCityDetail: () => void,
  ) {
    const s = loadSaved();
    applyValues(REMEMBERED, this.defaults, s.values);
    applyKeys(s.controls);
    const style = INK_STYLES.findIndex((t) => t.name === s.style);
    if (style >= 0) setInkStyle(style);
    if (s.pixelScale && PIXEL_SCALES.includes(s.pixelScale)) RENDER.pixelScale = s.pixelScale;
    if (s.maxFps !== undefined && FRAME_RATES.includes(s.maxFps)) RENDER.maxFps = s.maxFps;
    this.vol = s.volumetrics && s.volumetrics in VOL_PRESETS ? (s.volumetrics as VolPreset) : VOL_ORDER.find((k) => VOL_PRESETS[k].enabled === VOLUMETRICS.enabled && VOL_PRESETS[k].downscale === VOLUMETRICS.downscale && VOL_PRESETS[k].steps === VOLUMETRICS.steps) ?? (VOLUMETRICS.enabled ? 'medium' : 'off');
    Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
    // Unsaved: the choice nearest to config's PAINT.texelsPerMeter.
    const values = DETAIL_ORDER.map((k) => PAINT_DETAIL[k]);
    const preset = DETAIL_ORDER[values.indexOf(nearest(values, PAINT.texelsPerMeter))];
    this.detail = s.paintDetail && s.paintDetail in PAINT_DETAIL ? (s.paintDetail as PaintDetail) : preset;
    PAINT.texelsPerMeter = PAINT_DETAIL[this.detail];
    this.city = this.builtCity = s.cityDetail && s.cityDetail in CITY_DETAIL ? (s.cityDetail as CityDetail) : 'high';
    Object.assign(SKYLINE, CITY_DETAIL[this.city]);
  }

  /** The settings page (pause menu → SETTINGS): one section per tab. Every change is saved. `gpu`: what the game draws with; `runTest`: the performance test; `resetHints`: forget the hints learnt. */
  sections(gpu: GpuInfo, runTest: () => void, resetHints: () => void): SettingSection[] {
    const saving = (row: SettingRow): SettingRow => {
      if (row.kind === 'choice') return { ...row, step: (d) => (row.step(d), this.save()) };
      if (row.kind === 'range') return { ...row, set: (v) => (row.set(v), this.save()) };
      // Info and action rows change nothing.
      return row;
    };
    return [
      { title: 'Gameplay', rows: gameplayRows(resetHints).map(saving) },
      { title: 'Sound', rows: soundRows().map(saving) },
      { title: 'Controls', rows: [], tab: new ControlsTab(() => this.save()) },
      { title: 'Graphics', rows: [{ kind: 'action', label: 'Performance test', desc: 'Flies over the roof for a few seconds at your current settings and shows how it ran.', button: 'Run', act: runTest }, ...this.graphicsRows(gpu).map(saving)] },
    ];
  }

  private graphicsRows(gpu: GpuInfo): SettingRow[] {
    return [
      {
        kind: 'choice',
        label: 'Style',
        desc: 'The colors of paper, ink and sky.',
        // An F3-only preset shows as such; stepping goes on from the default style.
        value: () => sentence(INK_STYLES[inkStyle()]?.name ?? 'F3 preset'),
        step: (d) => {
          const i = inkStyle() < INK_STYLES.length ? inkStyle() : DEFAULT_STYLE;
          this.setStyle((i + d + INK_STYLES.length) % INK_STYLES.length);
        },
      },
      {
        kind: 'choice',
        label: 'Resolution',
        // Per-pixel work follows the pixel count: 1/2 draws a quarter of 1/1's pixels.
        cost: 'HIGH',
        value: resolution,
        step: (d) => {
          RENDER.pixelScale = cycle(PIXEL_SCALES, nearest(PIXEL_SCALES, RENDER.pixelScale), d);
          this.applyResolution();
        },
      },
      {
        kind: 'info',
        label: 'GPU',
        // A laptop's browser may draw on its built-in GPU while a faster one idles: say how to switch.
        desc: ['The graphics chip the browser draws the game with.', gpu.integrated ? `It's built into the processor. ${fasterGpuHow(currentOs()) ?? ''}` : ''].join(' ').trim(),
        value: () => gpu.name ?? 'Hidden by the browser',
      },
      {
        kind: 'choice',
        label: 'Frame rate',
        desc: "Above your display's refresh rate this acts like Max.",
        cost: 'LOW',
        value: () => (RENDER.maxFps ? `${RENDER.maxFps} FPS` : 'Max'),
        step: (d) => {
          RENDER.maxFps = cycle(FRAME_RATES, nearest(FRAME_RATES, RENDER.maxFps), d);
        },
      },
      {
        kind: 'choice',
        label: 'Volumetrics',
        desc: 'Light shafts and lamp glow in the fog. The heaviest setting: lower it first if the game stutters.',
        // Raymarch work = pixels x steps: HIGH is about 30x LOW.
        cost: 'HIGH',
        value: () => sentence(this.vol),
        step: (d) => {
          this.vol = cycle(VOL_ORDER, this.vol, d);
          Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
        },
      },
      {
        kind: 'choice',
        label: 'Paint detail',
        desc: 'Size of one paint texel on walls.',
        note: 'Ultra is recommended: 1 cm texels keep marker lines and fades sharp. It costs memory only for surfaces you actually paint, and a little CPU while painting; drawing the game is no slower.',
        // Stamping and uploading paint grow with the square (ULTRA 16x LOW), and paint memory; drawing doesn't.
        cost: 'MEDIUM',
        // Shown with the size of one paint texel.
        value: () => {
          if (this.locked) return `${paintDetailName(this.locked)}  (host)`;
          return paintDetailName(this.detail) + (PAINT_DETAIL[this.detail] !== PAINT.texelsPerMeter ? ON_RESUME : '');
        },
        // In a session: the host's.
        locked: () => !!this.locked,
        step: (d) => {
          this.detail = cycle(DETAIL_ORDER, this.detail, d);
        },
      },
      {
        kind: 'choice',
        label: 'City detail',
        desc: 'How far the city stretches around the roofs. Lower trims distant blocks the haze mostly hides.',
        // The city drawn grows with the radius squared: HIGH about 3x LOW.
        cost: 'MEDIUM',
        value: () => sentence(this.city) + (this.city !== this.builtCity ? ON_RESUME : ''),
        step: (d) => {
          this.city = cycle(CITY_ORDER, this.city, d);
        },
      },
      toggle(
        'Forced fullscreen',
        () => RENDER.fullscreen,
        (on) => {
          RENDER.fullscreen = on;
          if (!on) void exitGameFullscreen();
        },
        'LOW',
      ),
      toggle('Rain', () => NIGHT.rain, (on) => (NIGHT.rain = on), 'LOW'),
      toggle('Smoke', () => SMOKE.enabled, (on) => (SMOKE.enabled = on), 'LOW'),
      toggle('Moving parts', () => RENDER.propMotion, (on) => (RENDER.propMotion = on), 'LOW'),
      toggle('Performance lines', () => HUD.perf, (on) => (HUD.perf = on), undefined, 'Shows fps, ms, the GPU, draw calls, triangles, texture memory and network stats at the bottom left.'),
    ];
  }

  /** The settings that change how fast the game draws, as the performance test runs with them (its popup and tip). */
  tested(): TestedSettings {
    // The paint and city detail drawn now, not one waiting for the game to resume.
    const paint = DETAIL_ORDER.find((k) => PAINT_DETAIL[k] === PAINT.texelsPerMeter);
    const next = PIXEL_SCALES[PIXEL_SCALES.indexOf(nearest(PIXEL_SCALES, RENDER.pixelScale)) + 1];
    return {
      size: drawnSize().replace('x', '×'),
      volumetrics: sentence(this.vol),
      paint: paint ? sentence(paint) : `${PAINT.texelsPerMeter}/m`,
      city: sentence(this.builtCity),
      volOff: this.vol === 'off',
      volHigh: this.vol === 'high',
      nextScale: next ?? null,
      cityLow: this.builtCity === 'low',
    };
  }

  /** The same in one line, for npm run bench: "1/1  1920x1080 · Volumetrics Low · Paint Ultra · City High". */
  summary() {
    const t = this.tested();
    return [resolution(), `Volumetrics ${t.volumetrics}`, `Paint ${t.paint}`, `City ${t.city}`, ...(RENDER.maxFps ? [`${RENDER.maxFps} FPS`] : [])].join(' · ');
  }

  /** STYLE: an INK_STYLES index (also the pause screen's switcher). */
  setStyle(i: number) {
    setInkStyle(i);
    this.save();
  }

  /** Apply a changed paint or city detail. Call when the game resumes. */
  applyPending() {
    if (this.city !== this.builtCity) {
      this.builtCity = this.city;
      Object.assign(SKYLINE, CITY_DETAIL[this.city]);
      this.applyCityDetail();
    }
    const tpm = PAINT_DETAIL[this.locked ?? this.detail];
    if (tpm === PAINT.texelsPerMeter) return;
    PAINT.texelsPerMeter = tpm;
    this.applyPaintDetail();
  }

  /**
   * Hold PAINT DETAIL at a multiplayer session's (texels per meter): set at
   * once, for the session's level to be built with. Null: back to this
   * player's own, applied when the game resumes.
   */
  lockPaintDetail(tpm: number | null) {
    this.locked = tpm === null ? null : DETAIL_ORDER.find((k) => PAINT_DETAIL[k] === tpm)!;
    if (this.locked) PAINT.texelsPerMeter = tpm!;
  }

  /** Give PAINT DETAIL back to this player's own at once, for the level opened next to be built with (lockPaintDetail's null waits for the game to resume). */
  useOwnDetail() {
    this.locked = null;
    PAINT.texelsPerMeter = PAINT_DETAIL[this.detail];
  }

  private save() {
    save({ style: INK_STYLES[inkStyle()]?.name, pixelScale: RENDER.pixelScale, maxFps: RENDER.maxFps, volumetrics: this.vol, paintDetail: this.detail, cityDetail: this.city, values: changedValues(REMEMBERED, this.defaults), controls: keyOverrides() });
  }
}

/**
 * The renderer's pixel ratio: PIXEL SCALE, and never more pixels than the screen has. The buffer is
 * in CSS pixels, and a page zoomed out (Ctrl + wheel, remembered per site) has more of them than the
 * screen: a 3080 Ti drew 3840×2160 for a 2560×1440 screen. At zoom 100% and above nothing changes.
 */
export function pixelRatio() {
  return Math.min(1, devicePixelRatio) / RENDER.pixelScale;
}

/** RESOLUTION: the pixel scale and the size drawn, "1/1  1920x1080". */
function resolution() {
  return `1/${RENDER.pixelScale}  ${drawnSize()}`;
}

/** The size drawn at RESOLUTION's pixel scale: "1920x1080". */
function drawnSize() {
  return `${Math.round(window.innerWidth / RENDER.pixelScale)}x${Math.round(window.innerHeight / RENDER.pixelScale)}`;
}

/** "Ultra  1.0 cm": a PAINT DETAIL with the size of one texel (the multiplayer page's too). */
export function paintDetailName(d: PaintDetail) {
  return `${sentence(d)}  ${(100 / PAINT_DETAIL[d]).toFixed(1)} cm`;
}

export function cycle<T>(list: T[], cur: T, d: number): T {
  return list[(list.indexOf(cur) + d + list.length) % list.length];
}

function nearest(list: number[], v: number) {
  return list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/**
 * A setting row: a choice stepped through with < and >, a slider (`def`: its
 * default, marked on it), a value to read (info) or a button (action). `desc` is an optional line under it, `note` a callout
 * (recommendations), `cost` how much the setting can change how smoothly the
 * game runs, whatever its value.
 */
type RowBase = { label: string; desc?: string; note?: string; cost?: Cost };
type Cost = 'LOW' | 'MEDIUM' | 'HIGH';
export type SettingRow =
  | (RowBase & { kind: 'choice'; value: () => string; step: (d: number) => void; locked?: () => boolean })
  | (RowBase & { kind: 'info'; value: () => string })
  | (RowBase & { kind: 'action'; button: string; act: () => void; /** The button says this for a moment after it's pressed. */ done?: string })
  | (RowBase & { kind: 'range'; min: number; max: number; step: number; def: number; get: () => number; set: (v: number) => void; format: (v: number) => string });
/** A tab that builds its own page (Controls): its rows' column, its footer line and a control top right; `open` readies it each time it shows, `close` when it goes. */
export interface OwnTab {
  rows: HTMLElement;
  foot: HTMLElement;
  corner: HTMLElement;
  open(): void;
  close(): void;
}
export interface SettingSection {
  title: string;
  rows: SettingRow[];
  tab?: OwnTab;
}

/** An On / Off choice. */
function toggle(label: string, get: () => boolean, set: (on: boolean) => void, cost?: Cost, desc?: string): SettingRow {
  return { kind: 'choice', label, cost, desc, value: () => (get() ? 'On' : 'Off'), step: () => set(!get()) };
}

function gameplayRows(resetHints: () => void): SettingRow[] {
  return [
    {
      kind: 'range',
      label: 'Sensitivity',
      min: 0.25,
      max: 3,
      step: 0.05,
      def: 1,
      get: () => PLAYER.mouseSensitivity / BASE_SENSITIVITY,
      set: (v) => (PLAYER.mouseSensitivity = v * BASE_SENSITIVITY),
      format: (v) => `${v.toFixed(2)}x`,
    },
    { kind: 'range', label: 'Field of view', desc: 'How wide you see, in degrees.', min: 60, max: 110, step: 1, def: BASE_FOV, get: () => RENDER.fov, set: (v) => (RENDER.fov = v), format: (v) => `${v}°` },
    {
      kind: 'range',
      label: 'Field of view: running',
      desc: 'Extra field of view while running, for a sense of speed. 0 turns it off.',
      min: 0,
      max: 15,
      step: 1,
      def: BASE_RUN_FOV,
      get: () => RENDER.sprintFovBoost,
      set: (v) => (RENDER.sprintFovBoost = v),
      format: (v) => (v ? `+${v}°` : 'Off'),
    },
    toggle('Hints', () => TUTORIAL.enabled, (on) => (TUTORIAL.enabled = on), undefined, 'Short lines at the bottom of the screen that teach a control when you need it, and go once you have done it.'),
    { kind: 'action', label: 'Show hints again', desc: 'Forget the hints you have learnt: they come back as you play.', button: 'Show', act: resetHints, done: msg('menu.hintsReset') },
    toggle('Show left hand', () => WALL_HAND.enabled, (on) => (WALL_HAND.enabled = on), undefined, 'Your free hand rests on walls you stand close to. It may get in the way of what you paint.'),
  ];
}

/** Volume sliders, 0..200% of each sound's default level. */
const SOUNDS: [label: string, key: keyof typeof AUDIO, desc: string][] = [
  ['Master', 'masterGain', 'Everything.'],
  ['Spray', 'hissGain', 'The can hissing while you spray.'],
  ['Footsteps', 'footstepGain', 'Your steps and landings.'],
  ['Rain', 'rainGain', 'The rain bed (only while it rains).'],
  ['Drops on metal', 'metalGain', 'Raindrops pinging on AC units, rails and vents near you.'],
  ['Thunder', 'thunderGain', 'Thunder after lightning.'],
  ['City', 'ambienceGain', 'The low rumble of the city below.'],
  ['AC fans', 'fanGain', 'The hum of AC fans when you are close.'],
];
const SOUND_DEFAULTS = Object.fromEntries(SOUNDS.map(([, k]) => [k, AUDIO[k]]));

/** The gameplay, sound and on/off settings, saved as overrides (settings-store.ts). */
const REMEMBERED: Remembered[] = [
  ...(['mouseSensitivity', 'crouchToggle', 'tapToRun'] as const).map((field) => ({ name: `PLAYER.${field}`, obj: PLAYER, field })),
  ...(['fov', 'sprintFovBoost', 'fullscreen', 'propMotion'] as const).map((field) => ({ name: `RENDER.${field}`, obj: RENDER, field })),
  { name: 'ATMOS.rain', obj: NIGHT, field: 'rain' },
  { name: 'SMOKE.enabled', obj: SMOKE, field: 'enabled' },
  { name: 'HUD.perf', obj: HUD, field: 'perf' },
  { name: 'WALL_HAND.enabled', obj: WALL_HAND, field: 'enabled' },
  { name: 'TUTORIAL.enabled', obj: TUTORIAL, field: 'enabled' },
  ...SOUNDS.map(([, field]) => ({ name: `AUDIO.${field}`, obj: AUDIO, field })),
];

function soundRows(): SettingRow[] {
  return SOUNDS.map(([label, key, desc]) => ({
    kind: 'range',
    label,
    desc,
    min: 0,
    max: 200,
    step: 5,
    def: 100,
    get: () => Math.round((AUDIO[key] / SOUND_DEFAULTS[key]) * 100),
    set: (v: number) => (AUDIO[key] = (SOUND_DEFAULTS[key] * v) / 100),
    format: (v: number) => `${v}%`,
  }));
}
