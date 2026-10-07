import * as config from '../config';

// config.ts as authored: what F3's RESET puts back and each slider's gray tick
// shows. Main captures it before the player's settings or a level change any
// value. A shader preset swaps in its own colors as the defaults of INK's.

let authored: Record<string, unknown> = {};
/** Defaults swapped in by config path (the picked shader preset's colors). */
const swapped = new Map<string, unknown>();

export function captureDefaults() {
  authored = JSON.parse(JSON.stringify(config));
}

/** What RESET puts back at a config path: config.ts's value, or the one swapped in (undefined before captureDefaults). */
export function defaultOf(path: string[]): unknown {
  const k = path.join('.');
  return swapped.has(k) ? swapped.get(k) : authoredOf(path);
}

/** A config path's value in config.ts itself. */
export function authoredOf(path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], authored);
}

/** RESET puts `v` back at `path` from now on, and the row is lit while its value differs from it. */
export function swapDefault(path: string[], v: unknown) {
  swapped.set(path.join('.'), v);
}
