import { ATMOS, AUDIO, PAINT, PLAYER, RENDER, SKYLINE, SMOKE, VOLUMETRICS } from './config';
import { exitGameFullscreen } from './fullscreen';

// Player settings, on the settings page of the pause menu (settings-page.ts):
// gameplay, graphics and sound. They write the same config values the debug
// panel (F3) edits, so both stay in step. Resolution, volumetrics, paint and
// city detail are remembered in this browser; the rest reset on reload.
// Paint and city detail apply when the game resumes, since they rebuild every
// paint texture or the whole city: stepping through the choices costs
// nothing. config.ts holds the defaults.

const KEY = 'taggin.settings.v2';
/** Settings saved before v2: their paint detail and volumetrics are dropped, so the defaults (ULTRA, off) apply once. */
const OLD_KEY = 'taggin.settings';
const PIXEL_SCALES = [1, 1.5, 2, 2.5, 3, 4];
const VOL_PRESETS = {
  off: { enabled: false, downscale: 2, steps: 16 },
  low: { enabled: true, downscale: 4, steps: 12 },
  medium: { enabled: true, downscale: 2, steps: 16 },
  high: { enabled: true, downscale: 1, steps: 24 },
};
type VolPreset = keyof typeof VOL_PRESETS;
const VOL_ORDER = Object.keys(VOL_PRESETS) as VolPreset[];
/** Paint texels per meter. Paint memory grows with the square: ULTRA needs 16x LOW. */
const PAINT_DETAIL = { low: 24, medium: 48, high: 72, ultra: 96 };
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
        desc: 'Renders at a fraction of your screen and scales it up with crisp pixels. 1/1 is sharpest; 1/2 and up run much faster.',
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
        label: 'VOLUMETRICS',
        desc: 'Light shafts and lamp glow in the fog.',
        note: 'The biggest cost on this page: a light pass through the fog every frame. Turn it down first if the game stutters.',
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
        desc: 'Size of one paint texel on walls. Applies when you resume.',
        note: 'ULTRA is recommended: 1 cm texels keep marker lines and fades sharp. It costs memory only for surfaces you actually paint, not speed.',
        // Shown with the size of one paint texel.
        value: () => `${this.detail.toUpperCase()}  ${(100 / PAINT_DETAIL[this.detail]).toFixed(1)} CM`,
        step: (d) => {
          this.detail = cycle(DETAIL_ORDER, this.detail, d);
          this.save();
        },
      },
      {
        kind: 'choice',
        label: 'CITY DETAIL',
        desc: 'How far the city reaches around the level, and how far rooftop clutter and thin lines show. Applies when you resume.',
        value: () => this.city.toUpperCase(),
        step: (d) => {
          this.city = cycle(CITY_ORDER, this.city, d);
          this.save();
        },
      },
      toggle('FULLSCREEN', 'Go fullscreen when the game takes the mouse. Off: play in the browser window.', () => RENDER.fullscreen, (on) => {
        RENDER.fullscreen = on;
        if (!on) void exitGameFullscreen();
      }),
      toggle('RAIN', 'Rain, its sound, and lightning with thunder.', () => ATMOS.rain, (on) => (ATMOS.rain = on), 'Some performance cost while on: falling rain, raindrops pinging on metal and lightning flashes.'),
      toggle('SMOKE', 'Smoke from exhaust pipes.', () => SMOKE.enabled, (on) => (SMOKE.enabled = on), 'Small performance cost: one particle batch for every exhaust in the level.'),
      toggle('MOVING PARTS', 'CCTV cameras pan and follow you, AC fans spin. Off: they stay still.', () => RENDER.propMotion, (on) => (RENDER.propMotion = on), 'Almost no performance cost: the parts turn on the GPU, which does the same work either way.'),
    ];
  }

  /** Apply a changed paint or city detail. Call when the game resumes. */
  applyPending() {
    if (this.city !== this.builtCity) {
      this.builtCity = this.city;
      Object.assign(SKYLINE, CITY_DETAIL[this.city]);
      this.applyCityDetail();
    }
    const tpm = PAINT_DETAIL[this.detail];
    if (tpm === PAINT.texelsPerMeter) return;
    PAINT.texelsPerMeter = tpm;
    this.applyPaintDetail();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pixelScale: RENDER.pixelScale, volumetrics: this.vol, paintDetail: this.detail, cityDetail: this.city } satisfies Saved));
    } catch {
      // Storage unavailable (private mode): settings last for this session only.
    }
  }
}

function load(): Saved {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as Saved;
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Saved;
    return { pixelScale: old.pixelScale, cityDetail: old.cityDetail };
  } catch {
    return {};
  }
}

function cycle<T>(list: T[], cur: T, d: number): T {
  return list[(list.indexOf(cur) + d + list.length) % list.length];
}

function nearest(list: number[], v: number) {
  return list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/** A setting row: a choice stepped through with clicks, or a slider. `note` is a callout (performance etc). */
export type SettingRow =
  | { kind: 'choice'; label: string; desc: string; note?: string; value: () => string; step: (d: number) => void }
  | { kind: 'range'; label: string; desc: string; note?: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void; format: (v: number) => string };
export interface SettingSection {
  title: string;
  rows: SettingRow[];
}

function toggle(label: string, desc: string, get: () => boolean, set: (on: boolean) => void, note?: string): SettingRow {
  return { kind: 'choice', label, desc, note, value: () => (get() ? 'ON' : 'OFF'), step: () => set(!get()) };
}

function gameplayRows(): SettingRow[] {
  return [
    { kind: 'range', label: 'FIELD OF VIEW', desc: 'How wide you see, in degrees.', min: 60, max: 110, step: 1, get: () => RENDER.fov, set: (v) => (RENDER.fov = v), format: (v) => `${v}°` },
    {
      kind: 'range',
      label: 'RUN FOV',
      desc: 'Extra field of view while running, for a sense of speed. 0 turns it off.',
      min: 0,
      max: 15,
      step: 1,
      get: () => RENDER.sprintFovBoost,
      set: (v) => (RENDER.sprintFovBoost = v),
      format: (v) => (v ? `+${v}°` : 'OFF'),
    },
    {
      kind: 'choice',
      label: 'CROUCH',
      desc: 'HOLD: crouch while Ctrl or C is held. TOGGLE: press once to crouch, again to stand.',
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
  ['SIRENS', 'sirenGain', 'Police and fire sirens passing far off.'],
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
    get: () => Math.round((AUDIO[key] / SOUND_DEFAULTS[key]) * 100),
    set: (v: number) => (AUDIO[key] = (SOUND_DEFAULTS[key] * v) / 100),
    format: (v: number) => `${v}%`,
  }));
}
