import * as THREE from 'three';
import { RUNS_VIEW } from '../config';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { texelToWorld } from '../paint-seams';
import type { Rect } from '../surfaces';

// F3's runs view: every texel a paint run painted, in one loud color, to see
// runs on paint of their own color. Dev tools only (devtools.ts). The texels
// are recorded from the start of the session into a ring of RUNS_VIEW.maxPoints
// (the oldest go first), so runs made before it was switched on show too; the
// paint itself is not touched. One Points object with a fixed buffer, rebuilt
// every RUNS_VIEW.refresh seconds while on; off, it is invisible and costs the
// ring write alone. The ring holds a surface's key and rect, never the surface:
// its paint atlas goes with the level or the session.

const p = new THREE.Vector3();

export class RunsView {
  /** Points in the last refresh. */
  count = 0;
  private points: THREE.Points;
  private pos = new Float32Array(RUNS_VIEW.maxPoints * 3);
  private keys: (string | null)[] = new Array(RUNS_VIEW.maxPoints).fill(null);
  private rects: Rect[] = new Array(RUNS_VIEW.maxPoints);
  private xs = new Int32Array(RUNS_VIEW.maxPoints);
  private ys = new Int32Array(RUNS_VIEW.maxPoints);
  /** The paint's epoch when each was recorded: a clear() invalidates them all. */
  private epochs = new Int32Array(RUNS_VIEW.maxPoints);
  private head = 0;
  private since = Infinity;

  constructor(scene: THREE.Scene, drips: PaintDrips, private paint: PaintSystem) {
    drips.tap = (s, rect, x, y) => {
      const i = this.head;
      this.keys[i] = s.key;
      this.rects[i] = rect;
      this.xs[i] = x;
      this.ys[i] = y;
      this.epochs[i] = paint.epoch;
      this.head = i + 1 === RUNS_VIEW.maxPoints ? 0 : i + 1;
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ sizeAttenuation: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** Every frame: `on` shows it and refreshes it on its interval. */
  update(dt: number, on: boolean) {
    if (this.points.visible !== on) {
      this.points.visible = on;
      this.since = Infinity;
    }
    if (!on) return;
    const material = this.points.material as THREE.PointsMaterial;
    material.size = RUNS_VIEW.size;
    material.color.set(RUNS_VIEW.color);
    this.since += dt;
    if (this.since >= RUNS_VIEW.refresh) this.refresh();
  }

  /** The points as the runs recorded are now: those on a removed, rebuilt or cleared surface are left out. */
  refresh() {
    this.since = 0;
    const epoch = this.paint.epoch;
    let n = 0;
    for (let i = 0; i < RUNS_VIEW.maxPoints; i++) {
      const key = this.keys[i];
      if (!key) break;
      const rect = this.rects[i];
      // A rebuilt surface keeps its key but not its rects.
      if (this.epochs[i] !== epoch || !rect.face || !this.paint.find(key)?.geo.rects.includes(rect)) continue;
      texelToWorld(rect, this.xs[i] + 0.5, this.ys[i] + 0.5, p).addScaledVector(rect.face.normal, RUNS_VIEW.lift).toArray(this.pos, n * 3);
      n++;
    }
    this.count = n;
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
  }
}
