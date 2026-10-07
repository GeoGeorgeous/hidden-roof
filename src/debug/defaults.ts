import * as config from '../config';

// config.ts as authored: what F3's RESET puts back and each slider's gray tick
// shows. Main captures it before the player's settings or a level change any
// value.

let authored: Record<string, unknown> = {};

export function captureDefaults() {
  authored = JSON.parse(JSON.stringify(config));
}

/** A config path's value in config.ts (undefined before captureDefaults). */
export function defaultOf(path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], authored);
}
