import * as THREE from 'three';
import { BUILD } from '../config';
import { texelToWorld } from '../paint-seams';
import type { PaintSystem } from '../painting';
import type { Rect } from '../surfaces';

// Build mode's view of the paint on the walls (H): a box around the paint on
// each painted face, drawn over everything, so the level's own paint (hints,
// save/level-paint.ts) is found from anywhere. One line mesh for all of it,
// made only while building.

const p = new THREE.Vector3();

export class PaintedSpots {
  private lines: THREE.LineSegments;
  /** Painted faces in the last show(). */
  count = 0;

  constructor(scene: THREE.Scene) {
    const material = new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.lines.renderOrder = 10;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.syncLook();
  }

  /** BUILD.spot* changed (F3). */
  syncLook() {
    const m = this.lines.material as THREE.LineBasicMaterial;
    m.color.set(BUILD.spotColor);
    m.opacity = BUILD.spotOpacity;
  }

  get visible() {
    return this.lines.visible;
  }

  set visible(on: boolean) {
    this.lines.visible = on;
  }

  /** The boxes around the paint as it is now. */
  show(paint: PaintSystem) {
    const v: number[] = [];
    this.count = 0;
    for (const s of paint.surfaces) {
      if (!s.data) continue;
      s.geo.rects.forEach((r) => {
        const box = paintBox(s.data!, s.geo.atlasW, r);
        if (!box) return;
        this.count++;
        if (r.face) {
          const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => texelToWorld(r, x, y, p).toArray());
          corners.forEach((c, i) => v.push(...c, ...corners[(i + 1) % 4]));
        } else edges(s.geo.geometry, v);
      });
    }
    const geo = this.lines.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeBoundingSphere();
    this.lines.visible = true;
  }
}

/** The texel box around a face's paint (x0, y0 inclusive, x1, y1 exclusive), or null if it has none. */
function paintBox(data: Uint8Array, w: number, r: Rect): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!data[(y * w + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/** A curved surface's bounding box, as 12 edges. */
function edges(geometry: THREE.BufferGeometry, v: number[]) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const at = (i: number) => [i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) v.push(...at(i), ...at(i | bit));
}
