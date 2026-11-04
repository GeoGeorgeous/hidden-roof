import type * as THREE from 'three';
import { CAPTURE, INK } from '../config';
import type { Input } from '../input';
import { setFrame } from '../view-rect';
import { Flight } from './flight';
import { FreeCam } from './freeCam';
import { CaptureOverlay } from './overlay';
import { Recorder } from './recorder';

// Capture mode, for filming the game (hook.ts turns it on and off). Two
// views: first person, the game as played with the HUD but the hints and the
// hotbar (html.capture, style.css), or the free camera (html.capture-free):
// nothing of the game's over the view, the game without input (main.ts), the
// camera flying free (freeCam.ts) or through the points set (flight.ts). In
// both, its plate (overlay.ts) shows its keys, never in the video; the record
// key films the canvas and its sound (recorder.ts) at the quality chosen, the frame key draws at a fixed size at
// pixel ratio 1. Leaving puts the window's size back. While paused, the pause
// menu as ever.

const K = CAPTURE.keys;
export type Shot = 'player' | 'free';

export interface CaptureView {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** The canvas back at the window's size and RESOLUTION. */
  restore: () => void;
  /** The drawing buffer changed size. */
  resized: () => void;
  /** The game's sound, for a recording. */
  sound: () => MediaStreamTrack | null;
}

export class CaptureMode {
  active = false;
  shot: Shot = 'free';
  /** The fixed frame size drawn, or null: the window's. */
  size: readonly [number, number] | null = null;
  private cam = new FreeCam();
  private flight = new Flight();
  private recorder = new Recorder();
  private overlay = new CaptureOverlay();
  /** The video quality, an index into CAPTURE.qualities: for the next recording. */
  private quality = CAPTURE.qualityStart;
  /** The free camera takes the player's view on its next frame. */
  private fresh = false;
  /** INK.hatchPx outside a fixed frame. */
  private hatchPx = INK.hatchPx;

  constructor(private view: CaptureView) {}

  toggle() {
    this.active = !this.active;
    this.fresh = this.active;
    if (this.active) return;
    this.recorder.stop();
    this.flight.stop();
    this.setSize(null);
    document.documentElement.classList.remove('capture', 'capture-free');
  }

  /** Each frame while active, after the player's view is set: the keys, and in the free view its camera instead of the player's (held while paused). */
  update(dt: number, input: Input, camera: THREE.PerspectiveCamera) {
    const playing = input.locked;
    if (playing && input.justPressed('captureView')) {
      this.shot = this.shot === 'free' ? 'player' : 'free';
      this.fresh = this.shot === 'free';
      this.flight.stop();
    }
    const free = this.shot === 'free';
    const root = document.documentElement.classList;
    root.toggle('capture', playing);
    root.toggle('capture-free', playing && free);
    if (free) this.fly(playing ? dt : 0, input, camera);
    if (!playing) return;
    if (input.justPressed('captureQuality')) this.quality = (this.quality + 1) % CAPTURE.qualities.length;
    if (input.justPressed('captureRecord')) this.recorder.toggle(this.view.renderer.domElement, CAPTURE.qualities[this.quality], this.view.sound());
    if (input.justPressed('captureSize')) this.setSize(CAPTURE.sizes[this.size ? CAPTURE.sizes.indexOf(this.size) + 1 : 0] ?? null);
    this.overlay.update({ shot: this.shot, speed: this.cam.speed, smoothing: this.cam.smoothing, size: this.size, quality: this.quality, recording: this.recorder.startedAt }, this.flight, camera, this.view.renderer.domElement);
  }

  /** The fixed frame fitted into the window, in its middle (again on a resize). */
  fit() {
    const [w, h] = this.size!;
    const k = Math.min(innerWidth / w, innerHeight / h);
    const r = { width: w * k, height: h * k, left: (innerWidth - w * k) / 2, top: (innerHeight - h * k) / 2 };
    setFrame(r);
    Object.assign(this.view.renderer.domElement.style, { position: 'fixed', width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
  }

  /** The free camera, or the flight; then its keys, with the camera in place: a point is added where it is now. */
  private fly(dt: number, input: Input, camera: THREE.PerspectiveCamera) {
    if (this.fresh) this.cam.from(camera);
    this.fresh = false;
    const flight = this.flight;
    if (flight.flying) {
      flight.update(dt, camera);
      // Landed: the free camera goes on from the last point.
      if (!flight.flying) this.cam.from(camera);
    } else this.cam.update(dt, input, camera);
    if (!input.locked) return;
    if (input.wasPressed(K.fly)) flight.toggle();
    if (!flight.flying && input.wasPressed(K.addPoint)) flight.add(camera);
    if (!flight.flying && input.wasPressed(K.removePoint)) flight.removeLast();
    flight.lengthen((input.wasTyped(K.longer) ? 1 : 0) - (input.wasTyped(K.shorter) ? 1 : 0));
  }

  private setSize(size: readonly [number, number] | null) {
    if (size === this.size) return;
    if (!this.size) this.hatchPx = INK.hatchPx;
    // The view is as tall in degrees in any frame: a taller frame has things bigger in pixels, and its hatching grows with them.
    INK.hatchPx = this.hatchPx * (size ? size[1] / CAPTURE.hatchHeight : 1);
    this.size = size;
    const { renderer, camera } = this.view;
    if (!size) {
      setFrame(null);
      Object.assign(renderer.domElement.style, { position: '', left: '', top: '' });
      return this.view.restore();
    }
    renderer.setPixelRatio(1);
    renderer.setSize(size[0], size[1], false);
    camera.aspect = size[0] / size[1];
    camera.updateProjectionMatrix();
    this.fit();
    this.view.resized();
  }
}
