import * as THREE from 'three';
import { CAPTURE } from '../config';
import { type Action, keyName, label } from '../input';
import { msg, msgLines } from '../messages';
import type { Shot } from './captureMode';
import type { Flight } from './flight';

// What capture mode shows over the game while filming (style.css .capture-ui):
// a plate with the keys of the view filmed from and what they're set to, and in
// the free camera's view a numbered mark on each point of the flight. HTML, so
// never in the video (recorder.ts films the canvas alone); shown only while
// html.capture is on.

const K = CAPTURE.keys;
const b = (s: string | number) => `**${s}**`;
const key = (code: string) => b(keyName(code));
/** An action's key as bound (Settings → Controls). */
const bound = (action: Action) => b(label(action));
const gcd = (a: number, c: number): number => (c ? gcd(c, a % c) : a);
const ratio = ([w, h]: readonly [number, number]) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;
const at = new THREE.Vector3();

export interface PlateState {
  shot: Shot;
  speed: number;
  smoothing: number;
  size: readonly [number, number] | null;
  /** An index into CAPTURE.qualities. */
  quality: number;
  /** When the recording started (performance.now() ms), or null. */
  recording: number | null;
}

export class CaptureOverlay {
  private root = Object.assign(document.createElement('div'), { className: 'capture-ui' });
  private plate = Object.assign(document.createElement('div'), { className: 'capture-plate' });
  private marks: HTMLElement[] = [];
  private shown = '';

  constructor() {
    this.root.append(this.plate);
    document.body.append(this.root);
  }

  /** The plate, and in the free camera's view the points' marks. */
  update(state: PlateState, flight: Flight, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.text(state, flight);
    this.place(state.shot === 'free' ? flight.points : [], camera, canvas);
  }

  private text({ shot, speed, smoothing, size, quality, recording }: PlateState, flight: Flight) {
    const seconds = b(flight.seconds);
    const time = recording === null ? '' : new Date(performance.now() - recording).toISOString().slice(14, 19);
    const lines = [
      msg('capture.title', { exit: bound('capture') }),
      msg(shot === 'free' ? 'capture.free' : 'capture.player', { view: bound('captureView') }),
      ...(shot === 'free'
        ? [
            msg('capture.move', { keys: [K.forward, K.left, K.back, K.right].map(key).join(''), down: key(K.down), up: key(K.up) }),
            msg('capture.speed', { speed: b(speed.toFixed(speed < 1 ? 2 : 1)) }),
            msg('capture.smoothing', { less: key(K.smoothLess), more: key(K.smoothMore), smoothing: b(smoothing) }),
            msg('capture.points', { add: key(K.addPoint), remove: key(K.removePoint), n: b(flight.points.length) }),
            flight.flying
              ? msg('capture.flying', { t: b(flight.elapsed.toFixed(1)), seconds, fly: key(K.fly) })
              : msg('capture.fly', { fly: key(K.fly), seconds, shorter: key(K.shorter), longer: key(K.longer) }),
          ]
        : []),
      msg('capture.frame', { frame: bound('captureSize'), size: b(size ? `${ratio(size)} ${size[0]}×${size[1]}` : msg('capture.window')) }),
      msg('capture.quality', { quality: bound('captureQuality'), name: b(msgLines('capture.qualities')[quality]), mbps: b(CAPTURE.qualities[quality]) }),
      time ? msg('capture.recording', { time: b(time), record: bound('captureRecord') }) : msg('capture.record', { record: bound('captureRecord') }),
    ];
    const text = lines.join('\n');
    if (text === this.shown) return;
    this.shown = text;
    this.plate.replaceChildren(
      ...lines.map((line, i) => {
        const row = document.createElement('div');
        row.classList.toggle('recording', !!time && i === lines.length - 1);
        row.append(...line.split('**').map((part, j) => (j % 2 ? Object.assign(document.createElement('b'), { textContent: part }) : part)));
        return row;
      }),
    );
  }

  /** Each point's mark where it is on the canvas. */
  private place(points: Flight['points'], camera: THREE.Camera, canvas: HTMLCanvasElement) {
    while (this.marks.length < points.length) {
      const mark = Object.assign(document.createElement('i'), { className: 'capture-mark', textContent: String(this.marks.length + 1) });
      this.marks.push(mark);
      this.root.append(mark);
    }
    while (this.marks.length > points.length) this.marks.pop()!.remove();
    if (!points.length) return;
    const view = canvas.getBoundingClientRect();
    points.forEach((p, i) => {
      at.copy(p.position).project(camera);
      const mark = this.marks[i];
      // Behind the camera, or where it stands (no direction to it).
      mark.hidden = !(at.z <= 1 && Number.isFinite(at.x));
      mark.style.transform = `translate(${view.left + (at.x * 0.5 + 0.5) * view.width}px, ${view.top + (0.5 - at.y * 0.5) * view.height}px)`;
    });
  }
}
