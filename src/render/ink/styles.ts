import { INK, INK_PRESETS, INK_STYLES } from '../../config';

// The ink look's color set: one of INK_STYLES (GRAPHICS → STYLE) or, from
// F3 → Render → Shaders → preset, of INK_PRESETS after them. Its colors are copied into INK.

export const INK_COLORS = ['paper', 'ink', 'sky', 'cloud'] as const;

/** Every set F3 offers: the styles, then the presets. */
export const INK_SETS = [...INK_STYLES, ...INK_PRESETS];

/** Index in INK_SETS. Unpicked: the set INK's colors come from in config.ts. */
let current = Math.max(
  0,
  INK_SETS.findIndex((s) => INK_COLORS.every((k) => s[k] === INK[k])),
);
/** The style the game starts with (NEW MANGA). */
export const DEFAULT_STYLE = current;

export const inkStyle = () => current;

export function setInkStyle(i: number) {
  current = i;
  for (const k of INK_COLORS) INK[k] = INK_SETS[i][k];
}
