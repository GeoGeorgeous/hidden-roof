import { AUDIO, PLAYER, RENDER, TUTORIAL, WALL_HAND } from './config';
import { msg } from './messages';
import type { Cost, SettingRow } from './settings';

// The rows of Settings → Gameplay and Sound (settings.ts builds the rest and saves them).

/** Mouse sensitivity is shown as a multiple of config's (1.00x). */
const BASE_SENSITIVITY = PLAYER.mouseSensitivity;
/** config's field of view and running boost: their sliders' default ticks. */
const BASE_FOV = RENDER.fov;
const BASE_RUN_FOV = RENDER.sprintFovBoost;

/** What Settings needs of the tutorial: forgetting what was learnt, and whether there is any. */
export interface Hints {
  reset(): void;
  anyLearnt(): boolean;
}

/** An On / Off choice. */
export function toggle(label: string, get: () => boolean, set: (on: boolean) => void, cost?: Cost, desc?: string): SettingRow {
  return { kind: 'choice', label, cost, desc, value: () => (get() ? 'On' : 'Off'), step: () => set(!get()) };
}

export function gameplayRows(hints: Hints): SettingRow[] {
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
    { kind: 'action', label: 'Show hints again', desc: 'Forget the hints you have learnt: they come back as you play.', button: 'Show', act: () => hints.reset(), enabled: () => hints.anyLearnt(), done: msg('menu.hintsReset') },
    toggle('Show left hand', () => WALL_HAND.enabled, (on) => (WALL_HAND.enabled = on), undefined, 'Your free hand rests on walls you stand close to. It may get in the way of what you paint.'),
  ];
}

/** Volume sliders, 0..200% of each sound's default level. */
export const SOUNDS: [label: string, key: keyof typeof AUDIO, desc: string][] = [
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

export function soundRows(): SettingRow[] {
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
