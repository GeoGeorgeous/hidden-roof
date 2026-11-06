import { MOUSE_SPIKE } from './config';

// Chrome on Windows works a locked mouse's movement out from the hidden cursor's
// position, and moves that cursor back to the window's center when it enters the
// window's outer 15%. Now and then an event from before that move arrives after it
// and reads as a jump from the center to the edge: 35% of the window in one event,
// among the hand's few pixels. A raw lock never moves the cursor, so it has none.

export class MouseSpikes {
  /** Events dropped so far. */
  dropped = 0;
  /** The largest recent event (px), as of `at`. */
  private peak = 0;
  private at = 0;

  /** An event's movement (px) and time (ms), and the window's size: true when it's a jump, to drop. */
  caught(dx: number, dy: number, time: number, width: number, height: number) {
    const { borderShare, slackPx, ratio, halfLifeMs } = MOUSE_SPIKE;
    const size = Math.hypot(dx, dy);
    const peak = this.peak * 0.5 ** (Math.max(0, time - this.at) / halfLifeMs);
    const far = Math.abs(dx) >= width * borderShare - slackPx || Math.abs(dy) >= height * borderShare - slackPx;
    if (far && size > ratio * peak) {
      this.dropped++;
      return true;
    }
    this.peak = Math.max(size, peak);
    this.at = time;
    return false;
  }
}
