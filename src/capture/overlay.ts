import * as THREE from 'three';
import type { Flight } from './flight';

// What capture mode shows over the game while filming (style.css .capture-ui):
// a plate with the keys of the view filmed from and what they're set to
// (plate.ts), and in the free camera's view a numbered mark on each point of the flight. HTML, so
// never in the video (recorder.ts films the canvas alone); shown only while
// html.capture is on.

const at = new THREE.Vector3();

export class CaptureOverlay {
  private root = Object.assign(document.createElement('div'), { className: 'capture-ui' });
  private plate = Object.assign(document.createElement('div'), { className: 'capture-plate' });
  private marks: HTMLElement[] = [];
  private shown = '';

  constructor() {
    this.root.append(this.plate);
    document.body.append(this.root);
  }

  /** The plate, its last line in red while a video is recording, and the marks on `points`. */
  update(lines: string[], recording: boolean, points: Flight['points'], camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.text(lines, recording);
    this.place(points, camera, canvas);
  }

  private text(lines: string[], recording: boolean) {
    const text = lines.join('\n');
    if (text === this.shown) return;
    this.shown = text;
    this.plate.replaceChildren(
      ...lines.map((line, i) => {
        const row = document.createElement('div');
        row.classList.toggle('recording', recording && i === lines.length - 1);
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
