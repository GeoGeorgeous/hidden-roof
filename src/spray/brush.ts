import * as THREE from 'three';
import type { PaintSystem, Rgb } from '../painting';
import { slantOf, type Dab } from './dab';
import { SprayStroke, type Canvas, type StrokeFrame } from './stroke';
import type { WallProbe, WallSpot } from './wall-probe';

// The can's brush: what paints. A stroke (stroke.ts) on real walls (wall-probe.ts),
// its dabs stamped into the paint at once, where the aim meets the wall.

const ray = new THREE.Vector3();

export class Brush implements Canvas<WallSpot> {
  private stroke: SprayStroke<WallSpot>;
  private rgb: Rgb = [0, 0, 0];
  private drips = 0;
  /** Paint would land under the aim, as of the last `distance`. */
  reaches = false;
  private eye = new THREE.Vector3();

  constructor(
    private probe: WallProbe,
    private paint: PaintSystem,
  ) {
    this.stroke = new SprayStroke(probe, this);
  }

  /** This frame's paint; returns whether it reaches paint-taking surface. */
  spray(frame: StrokeFrame, rgb: Rgb) {
    this.rgb = rgb;
    this.drips = frame.cap.drips;
    this.eye.copy(frame.eye);
    this.probe.near(frame.eye);
    return this.stroke.update(frame);
  }

  /** How far the wall under the aim is (m), spraying or not: a spraying stroke's ray, else one of its own. null: none. It also says whether paint would land there (`reaches`). */
  distance(frame: Pick<StrokeFrame, 'eye' | 'forward'>, spraying: boolean) {
    if (spraying) {
      this.reaches = this.stroke.distance !== null;
      return this.stroke.distance;
    }
    this.probe.near(frame.eye);
    const hit = this.probe.cast(frame.eye, frame.forward);
    this.reaches = this.probe.takes(hit);
    return hit?.distance ?? null;
  }

  /** How fast the hand moves over the wall (m/s). */
  get speed() {
    return this.stroke.speed;
  }

  /** The spray stopped. */
  end() {
    this.stroke.end();
  }

  lay(hit: WallSpot, dab: Dab) {
    // Kept for a flat nib on the marker, a later version. A nib takes the wall's slant's place: nibOf(face, nib) (dab.ts).
    const slant = slantOf(hit.surface.geo.rects[hit.at.rect].face, ray.subVectors(hit.point, this.eye).normalize());
    this.paint.stamp(hit.surface, hit.at, dab.radius, dab.amount, this.rgb, dab.softness, this.drips, false, slant);
  }
}
