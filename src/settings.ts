import { PAINT, RENDER, VOLUMETRICS } from './config';

// Player settings shown in the pause menu and remembered in this browser:
// render resolution (pixel scale), volumetric light quality and paint detail.
// Resolution and volumetrics apply immediately. Paint detail applies when the
// game resumes, since it rebuilds every paint texture: stepping through the
// choices costs nothing and never blurs the paint on the way. config.ts holds
// the defaults.

const KEY = 'taggin.settings';
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

interface Saved {
  pixelScale?: number;
  volumetrics?: VolPreset;
  paintDetail?: PaintDetail;
}

export class Settings {
  private vol: VolPreset;
  private detail: PaintDetail;

  /**
   * `applyResolution` resizes the renderer after the pixel scale changed,
   * `applyPaintDetail` rebuilds the paint textures after PAINT.texelsPerMeter changed.
   */
  constructor(
    private applyResolution: () => void,
    private applyPaintDetail: () => void,
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
  }

  /** Rows for the pause menu: label, current value, and a step to the next/previous value. */
  rows() {
    return [
      {
        label: 'RESOLUTION',
        value: () => {
          const w = Math.round(window.innerWidth / RENDER.pixelScale);
          const h = Math.round(window.innerHeight / RENDER.pixelScale);
          return `1/${RENDER.pixelScale}  ${w}x${h}`;
        },
        step: (d: number) => {
          RENDER.pixelScale = cycle(PIXEL_SCALES, nearest(PIXEL_SCALES, RENDER.pixelScale), d);
          this.applyResolution();
          this.save();
        },
      },
      {
        label: 'VOLUMETRICS',
        value: () => this.vol.toUpperCase(),
        step: (d: number) => {
          this.vol = cycle(VOL_ORDER, this.vol, d);
          Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
          this.save();
        },
      },
      {
        label: 'PAINT DETAIL',
        // Shown with the size of one paint texel.
        value: () => `${this.detail.toUpperCase()}  ${(100 / PAINT_DETAIL[this.detail]).toFixed(1)} CM`,
        step: (d: number) => {
          this.detail = cycle(DETAIL_ORDER, this.detail, d);
          this.save();
        },
      },
    ];
  }

  /** Apply a changed paint detail. Call when the game resumes. */
  applyPending() {
    const tpm = PAINT_DETAIL[this.detail];
    if (tpm === PAINT.texelsPerMeter) return;
    PAINT.texelsPerMeter = tpm;
    this.applyPaintDetail();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pixelScale: RENDER.pixelScale, volumetrics: this.vol, paintDetail: this.detail } satisfies Saved));
    } catch {
      // Storage unavailable (private mode): settings last for this session only.
    }
  }
}

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
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
