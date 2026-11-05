import * as THREE from 'three';
import { CROSSHAIR } from '../config';
import type { Solids } from '../level/solids';
import type { PaintSystem } from '../painting';
import { WallProbe } from '../spray/wall-probe';

// What a crosshair says of the tool in hand: how wide its mark lands under the
// aim, and whether it lands there at all. Any tool with a reach takes a ToolAim
// and tells it its width each frame; the can, whose width and wall come from
// its stroke, takes only crosshairPx.

const forward = new THREE.Vector3();

/** How wide `width` (m) looks on a wall square-on at `distance` (m), in CSS px. Never so thin it can't be seen. */
export function crosshairPx(camera: THREE.PerspectiveCamera, width: number, distance: number) {
  const view = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return Math.max(CROSSHAIR.least, Math.round((width / view) * window.innerHeight));
}

export class ToolAim {
  /** The crosshair's width and height (CSS px): at the wall under the aim, or at the tool's reach with none. */
  px: number = CROSSHAIR.plain;
  tallPx: number = CROSSHAIR.plain;
  /** What's under the aim is in reach and takes paint. */
  reaches = false;
  private probe: WallProbe;

  constructor(
    solids: Solids,
    paint: PaintSystem,
    private reach: number,
  ) {
    this.probe = new WallProbe(solids, paint, reach);
  }

  /** `width`, `tall`: the mark the tool leaves now (m). */
  update(camera: THREE.PerspectiveCamera, eye: THREE.Vector3, width: number, tall = width) {
    this.probe.near(eye);
    const hit = this.probe.cast(eye, camera.getWorldDirection(forward));
    this.reaches = this.probe.takes(hit);
    const distance = hit?.distance ?? this.reach;
    this.px = crosshairPx(camera, width, distance);
    this.tallPx = crosshairPx(camera, tall, distance);
  }
}
