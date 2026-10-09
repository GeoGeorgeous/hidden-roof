import { INK, INK_STYLES } from '../../config';

// The ink look's color set (GRAPHICS → STYLE, F3 → Render → Shaders → preset):
// one of INK_STYLES, its colors copied into INK.

export const INK_COLORS = ['paper', 'ink', 'sky', 'cloud'] as const;

/** Unpicked: the set INK's colors come from in config.ts. */
let current = Math.max(
  0,
  INK_STYLES.findIndex((s) => INK_COLORS.every((k) => s[k] === INK[k])),
);

export const inkStyle = () => current;

export function setInkStyle(i: number) {
  current = i;
  for (const k of INK_COLORS) INK[k] = INK_STYLES[i][k];
}
