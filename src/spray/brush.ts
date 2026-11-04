import type { PaintSystem, Rgb } from '../painting';
import type { Dab } from './dab';
import { SprayStroke, type Canvas, type StrokeFrame } from './stroke';
import type { WallProbe, WallSpot } from './wall-probe';

// The can's brush: what paints. A stroke (stroke.ts) on real walls (wall-probe.ts),
// its dabs stamped into the paint at once, where the aim meets the wall.

export class Brush implements Canvas<WallSpot> {
  private stroke: SprayStroke<WallSpot>;
  private rgb: Rgb = [0, 0, 0];
  private drips = 0;

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
    this.probe.near(frame.eye);
    return this.stroke.update(frame);
  }

  /** The spray stopped. */
  end() {
    this.stroke.end();
  }

  lay(hit: WallSpot, dab: Dab) {
    this.paint.stamp(hit.surface, hit.at, dab.radius, dab.amount, this.rgb, dab.softness, this.drips);
  }
}
