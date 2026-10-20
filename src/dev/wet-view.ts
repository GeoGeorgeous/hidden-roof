import * as THREE from 'three';
import { DRIPS, WET_VIEW } from '../config';
import type { PaintSystem } from '../painting';
import { texelToWorld } from '../paint-seams';
import type { Rect } from '../surfaces';

// F3's wet view: one Points object with a fixed buffer, rebuilt a few times a
// second from the wet paint near the player, so paint runs can be tuned by
// eye. Dev tools only (devtools.ts); off, it is invisible and does no work.
// The walk is O(texels of the nearby wet faces) every WET_VIEW.refresh seconds.

const p = new THREE.Vector3();

export class WetView {
  /** Points in the last refresh. */
  count = 0;
  /** The most build-up (coats) among them. */
  peak = 0;
  private points: THREE.Points;
  private pos = new Float32Array(WET_VIEW.maxPoints * 3);
  private col = new Float32Array(WET_VIEW.maxPoints * 4);
  private since = Infinity;

  constructor(scene: THREE.Scene, private paint: PaintSystem, private at: () => THREE.Vector3) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false });
    this.points = new THREE.Points(geo, material);
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
    (this.points.material as THREE.PointsMaterial).size = WET_VIEW.size;
    this.since += dt;
    if (this.since >= WET_VIEW.refresh) this.refresh();
  }

  /** The panel's readout: the most build-up found near you against what makes paint run. */
  get label() {
    return this.points.visible ? `${this.peak.toFixed(1)} / ${DRIPS.excess.toFixed(1)}` : '-';
  }

  /** The points as the wet paint is now. */
  refresh() {
    this.since = 0;
    const { reach, maxPoints, lift } = WET_VIEW;
    const at = this.at();
    const now = this.paint.now;
    const faces: [Float32Array, number, Rect][] = [];
    let texels = 0;
    for (const s of this.paint.surfaces) {
      if (!s.wet) continue;
      s.geo.geometry.boundingBox ?? s.geo.geometry.computeBoundingBox();
      if (s.geo.geometry.boundingBox!.distanceToPoint(at) > reach) continue;
      for (const r of s.geo.rects) {
        if (!r.upright || !r.face) continue;
        faces.push([s.wet, s.geo.atlasW, r]);
        texels += r.w * r.h;
      }
    }
    const stride = Math.max(1, Math.ceil(Math.sqrt(texels / maxPoints)));
    const cool = new THREE.Color(WET_VIEW.cool);
    const hot = new THREE.Color(WET_VIEW.color);
    const ramp = new THREE.Color();
    let n = 0;
    let most = 0;
    for (const [wet, w, r] of faces) {
      if (n === maxPoints) break;
      const nm = r.face!.normal;
      for (let y = r.y; y < r.y + r.h; y += stride) {
        for (let x = r.x; x < r.x + r.w; x += stride) {
          const left = wet[y * w + x] - now;
          if (left <= 0) continue;
          if (n === maxPoints) break;
          texelToWorld(r, x + 0.5, y + 0.5, p).addScaledVector(nm, lift).toArray(this.pos, n * 3);
          // The share of the build-up needed to run: 1 is where it may.
          const buildUp = Math.min(1, left / DRIPS.dryTime);
          if (buildUp > most) most = buildUp;
          ramp.lerpColors(cool, hot, buildUp);
          const i = n * 4;
          this.col[i] = ramp.r;
          this.col[i + 1] = ramp.g;
          this.col[i + 2] = ramp.b;
          this.col[i + 3] = WET_VIEW.minOpacity + (1 - WET_VIEW.minOpacity) * buildUp;
          n++;
        }
      }
    }
    this.count = n;
    this.peak = most * DRIPS.excess;
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
