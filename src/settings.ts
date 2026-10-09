import { ATMOS, AUDIO, HUD, PAINT, PLAYER, RENDER, SKYLINE, SMOKE, VOLUMETRICS } from './config';
import { exitGameFullscreen } from './fullscreen';

// Player settings, on the settings page of the pause menu (settings-page.ts):
// gameplay, graphics and sound. They write the same config values the debug
// panel (F3) edits, so both stay in step. Resolution, volumetrics, paint and
// city detail and the frame rate are remembered in this browser; the rest reset on reload.
// Paint and city detail apply when the game resumes, since they rebuild every
// paint texture or the whole city: stepping through the choices costs
// nothing. config.ts holds the defaults.

const KEY = 'roofhiddenhaus.settings';
/** Settings saved under the old name (taggin): read once, so nothing resets with the rename. */
const RENAMED_KEY = 'taggin.settings.v2';
/** Settings saved before v2: their paint detail and volumetrics are dropped, so the defaults (ULTRA, off) apply once. */
const OLD_KEY = 'taggin.settings';
const PIXEL_SCALES = [1, 1.5, 2, 2.5, 3, 4];
/** FRAME RATE choices (fps); 0 = no limit. */
const FRAME_RATES = [0, 30, 60, 90, 120, 144];
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
/** Paint texels per meter. Paint memory grows with the square: ULTRA needs 16x LOW. */
export const PAINT_DETAIL = { low: 24, medium: 48, high: 72, ultra: 96 };
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

interface Saved {
  pixelScale?: number;
  maxFps?: number;
  volumetrics?: VolPreset;
  paintDetail?: PaintDetail;
  cityDetail?: CityDetail;
}

export class Settings {
  private vol: VolPreset;
  private detail: PaintDetail;
  private city: CityDetail;
  /** The city detail the current city was built with. */
  private builtCity: CityDetail;
  /** In a multiplayer session: the host's PAINT DETAIL, which holds whatever is picked here. */
  private locked: PaintDetail | null = null;

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
    const s = load();
    if (s.pixelScale && PIXEL_SCALES.includes(s.pixelScale)) RENDER.pixelScale = s.pixelScale;
    if (s.maxFps !== undefined && FRAME_RATES.includes(s.maxFps)) RENDER.maxFps = s.maxFps;
    this.vol = s.volumetrics && s.volumetrics in VOL_PRESETS ? s.volumetrics : VOLUMETRICS.enabled ? 'medium' : 'off';
    Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
    // Unsaved: the choice nearest to config's PAINT.texelsPerMeter.
    const values = DETAIL_ORDER.map((k) => PAINT_DETAIL[k]);
    const preset = DETAIL_ORDER[values.indexOf(nearest(values, PAINT.texelsPerMeter))];
    this.detail = s.paintDetail && s.paintDetail in PAINT_DETAIL ? s.paintDetail : preset;
    PAINT.texelsPerMeter = PAINT_DETAIL[this.detail];
    this.city = this.builtCity = s.cityDetail && s.cityDetail in CITY_DETAIL ? s.cityDetail : 'high';
    Object.assign(SKYLINE, CITY_DETAIL[this.city]);
  }

  /** The settings page (pause menu → SETTINGS): one section per tab. */
  sections(): SettingSection[] {
    return [
      { title: 'GAMEPLAY', rows: gameplayRows() },
      { title: 'GRAPHICS', rows: this.graphicsRows() },
      { title: 'SOUND', rows: soundRows() },
    ];
  }

  private graphicsRows(): SettingRow[] {
    return [
      {
        kind: 'choice',
        label: 'RESOLUTION',
        // Per-pixel work follows the pixel count: 1/2 draws a quarter of 1/1's pixels.
        cost: 'HIGH',
        value: () => {
          const w = Math.round(window.innerWidth / RENDER.pixelScale);
          const h = Math.round(window.innerHeight / RENDER.pixelScale);
          return `1/${RENDER.pixelScale}  ${w}x${h}`;
        },
        step: (d) => {
          RENDER.pixelScale = cycle(PIXEL_SCALES, nearest(PIXEL_SCALES, RENDER.pixelScale), d);
          this.applyResolution();
          this.save();
        },
      },
      {
        kind: 'choice',
        label: 'FRAME RATE',
        cost: 'LOW',
        value: () => (RENDER.maxFps ? `${RENDER.maxFps} FPS` : 'MAX'),
        step: (d) => {
          RENDER.maxFps = cycle(FRAME_RATES, nearest(FRAME_RATES, RENDER.maxFps), d);
          this.save();
        },
      },
      {
        kind: 'choice',
        label: 'VOLUMETRICS',
        desc: 'Light shafts and lamp glow in the fog. The heaviest setting: lower it first if the game stutters.',
        // Raymarch work = pixels x steps: HIGH is about 30x LOW.
        cost: 'HIGH',
        value: () => this.vol.toUpperCase(),
        step: (d) => {
          this.vol = cycle(VOL_ORDER, this.vol, d);
          Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
          this.save();
        },
      },
      {
        kind: 'choice',
        label: 'PAINT DETAIL',
        desc: 'Size of one paint texel on walls.',
        note: 'ULTRA is recommended: 1 cm texels keep marker lines and fades sharp. It costs memory only for surfaces you actually paint, and a little CPU while painting; drawing the game is no slower.',
        // Stamping and uploading paint grow with the square (ULTRA 16x LOW), and paint memory; drawing doesn't.
        cost: 'MEDIUM',
        // Shown with the size of one paint texel.
        value: () => {
          const d = this.locked ?? this.detail;
          return `${d.toUpperCase()}  ${(100 / PAINT_DETAIL[d]).toFixed(1)} CM${this.locked ? '  (HOST)' : ''}`;
        },
        step: (d) => {
          if (this.locked) return;
          this.detail = cycle(DETAIL_ORDER, this.detail, d);
          this.save();
        },
      },
      {
        kind: 'choice',
        label: 'CITY DETAIL',
        desc: 'How far the city stretches around the roofs. Lower trims distant blocks the haze mostly hides.',
        // The city drawn grows with the radius squared: HIGH about 3x LOW.
        cost: 'MEDIUM',
        value: () => this.city.toUpperCase(),
        step: (d) => {
          this.city = cycle(CITY_ORDER, this.city, d);
          this.save();
        },
      },
      toggle(
        'FORCED FULLSCREEN',
        () => RENDER.fullscreen,
        (on) => {
          RENDER.fullscreen = on;
          if (!on) void exitGameFullscreen();
        },
        'LOW',
      ),
      toggle('RAIN', () => ATMOS.rain, (on) => (ATMOS.rain = on), 'LOW'),
      toggle('SMOKE', () => SMOKE.enabled, (on) => (SMOKE.enabled = on), 'LOW'),
      toggle('MOVING PARTS', () => RENDER.propMotion, (on) => (RENDER.propMotion = on), 'LOW'),
      toggle('PERFORMANCE LINES', () => HUD.perf, (on) => (HUD.perf = on)),
    ];
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

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pixelScale: RENDER.pixelScale, maxFps: RENDER.maxFps, volumetrics: this.vol, paintDetail: this.detail, cityDetail: this.city } satisfies Saved));
    } catch {
      // Storage unavailable (private mode): settings last for this session only.
    }
  }
}

function load(): Saved {
  try {
    const saved = localStorage.getItem(KEY) ?? localStorage.getItem(RENAMED_KEY);
    if (saved) return JSON.parse(saved) as Saved;
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Saved;
    return { pixelScale: old.pixelScale, cityDetail: old.cityDetail };
  } catch {
    return {};
  }
}

export function cycle<T>(list: T[], cur: T, d: number): T {
  return list[(list.indexOf(cur) + d + list.length) % list.length];
}

function nearest(list: number[], v: number) {
  return list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/**
 * A setting row: a choice stepped through with < and >, or a slider (`def`: its
 * default, marked on it). `desc` is an optional line under it, `note` a callout
 * (recommendations), `cost` how much the setting can change how smoothly the
 * game runs, whatever its value.
 */
type RowBase = { label: string; desc?: string; note?: string; cost?: Cost };
type Cost = 'LOW' | 'MEDIUM' | 'HIGH';
export type SettingRow =
  | (RowBase & { kind: 'choice'; value: () => string; step: (d: number) => void })
  | (RowBase & { kind: 'range'; min: number; max: number; step: number; def: number; get: () => number; set: (v: number) => void; format: (v: number) => string });
export interface SettingSection {
  title: string;
  rows: SettingRow[];
}

/** An ON / OFF choice. */
function toggle(label: string, get: () => boolean, set: (on: boolean) => void, cost?: Cost): SettingRow {
  return { kind: 'choice', label, cost, value: () => (get() ? 'ON' : 'OFF'), step: () => set(!get()) };
}

function gameplayRows(): SettingRow[] {
  return [
    {
      kind: 'range',
      label: 'SENSITIVITY',
      min: 0.25,
      max: 3,
      step: 0.05,
      def: 1,
      get: () => PLAYER.mouseSensitivity / BASE_SENSITIVITY,
      set: (v) => (PLAYER.mouseSensitivity = v * BASE_SENSITIVITY),
      format: (v) => `${v.toFixed(2)}x`,
    },
    { kind: 'range', label: 'FIELD OF VIEW', desc: 'How wide you see, in degrees.', min: 60, max: 110, step: 1, def: BASE_FOV, get: () => RENDER.fov, set: (v) => (RENDER.fov = v), format: (v) => `${v}°` },
    {
      kind: 'range',
      label: 'FIELD OF VIEW: RUNNING',
      desc: 'Extra field of view while running, for a sense of speed. 0 turns it off.',
      min: 0,
      max: 15,
      step: 1,
      def: BASE_RUN_FOV,
      get: () => RENDER.sprintFovBoost,
      set: (v) => (RENDER.sprintFovBoost = v),
      format: (v) => (v ? `+${v}°` : 'OFF'),
    },
    {
      kind: 'choice',
      label: 'CROUCH',
      value: () => (PLAYER.crouchToggle ? 'TOGGLE' : 'HOLD'),
      step: () => (PLAYER.crouchToggle = !PLAYER.crouchToggle),
    },
  ];
}

/** Volume sliders, 0..200% of each sound's default level. */
const SOUNDS: [label: string, key: keyof typeof AUDIO, desc: string][] = [
  ['MASTER', 'masterGain', 'Everything.'],
  ['SPRAY', 'hissGain', 'The can hissing while you spray.'],
  ['FOOTSTEPS', 'footstepGain', 'Your steps and landings.'],
  ['RAIN', 'rainGain', 'The rain bed (only while it rains).'],
  ['DROPS ON METAL', 'metalGain', 'Raindrops pinging on AC units, rails and vents near you.'],
  ['THUNDER', 'thunderGain', 'Thunder after lightning.'],
  ['CITY', 'ambienceGain', 'The low rumble of the city below.'],
  ['AC FANS', 'fanGain', 'The hum of AC fans when you are close.'],
];
const SOUND_DEFAULTS = Object.fromEntries(SOUNDS.map(([, k]) => [k, AUDIO[k]]));

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
