import { NET } from '../config.ts';

// The link's state for the player, from numbers the game already has: the round trip and how long the server has been
// quiet. No DOM, no clock of its own: tested in Node (scripts/link-health.test.mjs). At most one status is said at a time, the worst first:
//   noSignal > badConnection
// (reconnecting is stronger still, and is net-menu's: it resets this while the link is down). Each condition has
// hysteresis, so a value hovering at the threshold doesn't flicker the chip.

export type LinkStatus = { id: 'noSignal' | 'badConnection' };

export interface LinkSample {
  /** Local time (s). */
  t: number;
  /** The last round trip (s), null before the first. */
  ping: number | null;
  /** Since the server last said anything (s). */
  silence: number;
}

/** On when the value stays past `on` for `hold` s, off when it stays under `off` for as long. */
export class Flag {
  active = false;
  private since: number | null = null;

  step(t: number, value: number, on: number, off: number, hold: number) {
    if (this.active ? value >= off : value <= on) this.since = null;
    else {
      this.since ??= t;
      if (t - this.since >= hold) {
        this.active = !this.active;
        this.since = null;
      }
    }
    return this.active;
  }
}

export class LinkHealth {
  private silent = new Flag();
  private bad = new Flag();

  /** Once a frame while the session's link is up. The status to show, or null. */
  update(s: LinkSample): LinkStatus | null {
    const silent = this.silent.step(s.t, s.silence, NET.noSignal, NET.noSignalClear, 0);
    const bad = this.bad.step(s.t, s.ping ?? 0, NET.badPing, NET.badPingClear, NET.statusHold);
    if (silent) return { id: 'noSignal' };
    return bad ? { id: 'badConnection' } : null;
  }

  /** The link went down or the session changed: start over. */
  reset() {
    this.silent = new Flag();
    this.bad = new Flag();
  }
}
