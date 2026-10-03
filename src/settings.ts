import { RENDER, VOLUMETRICS } from './config';

// Player settings shown in the pause menu and remembered in this browser:
// render resolution (pixel scale) and volumetric light quality. They apply
// immediately; config.ts holds the defaults.

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

interface Saved {
  pixelScale?: number;
  volumetrics?: VolPreset;
}

export class Settings {
  private vol: VolPreset;

  /** `applyResolution` resizes the renderer after the pixel scale changed. */
  constructor(private applyResolution: () => void) {
    const s = load();
    if (s.pixelScale && PIXEL_SCALES.includes(s.pixelScale)) RENDER.pixelScale = s.pixelScale;
    this.vol = s.volumetrics && s.volumetrics in VOL_PRESETS ? s.volumetrics : VOLUMETRICS.enabled ? 'medium' : 'off';
    Object.assign(VOLUMETRICS, VOL_PRESETS[this.vol]);
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
    ];
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pixelScale: RENDER.pixelScale, volumetrics: this.vol } satisfies Saved));
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
