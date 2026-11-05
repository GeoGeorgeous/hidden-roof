import type * as THREE from 'three';
import type { Input } from '../input';
import type { CaptureMode, CaptureView, Extra, Shot } from './captureMode';

// Capture mode's place in the game loop (main.ts). The mode itself loads on
// first use, its key or ?capture=1: the game doesn't carry it otherwise, and
// outside it a frame costs one key check.

let mode: CaptureMode | undefined;
let view: CaptureView | undefined;
let loading = false;

function toggle() {
  if (mode) return mode.toggle();
  if (loading || !view) return;
  loading = true;
  const v = view;
  void import('./captureMode').then((m) => (mode = new m.CaptureMode(v)).toggle());
}

export const capture = {
  /** What the dev tools add: a view of their own, each frame their keys, and a plate of their own. The player build has none. */
  extra: null as Extra | null,
  /** What the game is filmed from: first person, the free camera, or null: not in capture mode. */
  get shot(): Shot | null {
    return mode?.active ? mode.shot : null;
  },
  /** The fixed frame size drawn, or null: the window's. */
  get size() {
    return mode?.size ?? null;
  },
  /** What capture mode draws with; ?capture=1 turns it on. */
  attach(v: CaptureView) {
    view = v;
    if (new URLSearchParams(location.search).get('capture') === '1') toggle();
  },
  /** Start of a frame: its key turns it on and off. */
  keys(input: Input) {
    if (input.justPressed('capture')) toggle();
  },
  /** After the player's view is set: capture mode's keys, and its camera. */
  update(dt: number, input: Input, camera: THREE.PerspectiveCamera) {
    if (mode?.active) mode.update(dt, input, camera, this.extra);
  },
  /** The window changed size: true when capture mode fitted its fixed frame into it (else the window's size is the canvas's). */
  fit() {
    if (!mode?.size) return false;
    mode.fit();
    return true;
  },
};
