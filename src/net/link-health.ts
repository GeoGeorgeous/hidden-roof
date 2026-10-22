import { NET } from '../config.ts';

// The link's state for the player, from numbers the game already has: the round trip, how long the server has been
// quiet, how far behind each other player is shown, and how many of their snapshots never came. No DOM, no clock of
// its own: tested in Node (scripts/link-health.test.mjs). At most one status is said at a time, the worst first:
//   noSignal > badConnection > packetLoss > highDelay
// (reconnecting is stronger still, and is net-menu's: it resets this while the link is down). Each condition has
// hysteresis, so a value hovering at the threshold doesn't flicker the chip.

export type LinkStatus = { id: 'noSignal' | 'badConnection' | 'packetLoss' | 'highDelay'; user?: string };

export interface LinkSample {
  /** Local time (s). */
  t: number;
  /** The last round trip (s), null before the first. */
  ping: number | null;
  /** Since the server last said anything (s). */
  silence: number;
  /** How far behind each other player is shown (s). */
  delays: { name: string; delay: number }[];
  /** Snapshots received and missed from the others, counted since the session began (only ever up). */
  got: number;
  lost: number;
}

/** On when the value stays past `on` for `hold` s, off when it stays under `off` for as long. */
class Flag {
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
  private loss = new Flag();
  private slow = new Flag();
  private counts: { t: number; got: number; lost: number }[] = [];

  /** Once a frame while the session's link is up. The status to show, or null. */
  update(s: LinkSample): LinkStatus | null {
    const silent = this.silent.step(s.t, s.silence, NET.noSignal, NET.noSignalClear, 0);
    const bad = this.bad.step(s.t, s.ping ?? 0, NET.badPing, NET.badPingClear, NET.statusHold);
    const loss = this.loss.step(s.t, this.lossShare(s), NET.lossShare, NET.lossShareClear, 0);
    let worst = { name: '', delay: 0 };
    for (const d of s.delays) if (d.delay > worst.delay) worst = d;
    const slow = this.slow.step(s.t, worst.delay, NET.highDelay, NET.highDelayClear, NET.statusHold);
    if (silent) return { id: 'noSignal' };
    if (bad) return { id: 'badConnection' };
    if (loss) return { id: 'packetLoss' };
    return slow ? { id: 'highDelay', user: worst.name } : null;
  }

  /** The link went down or the session changed: start over. */
  reset() {
    this.silent = new Flag();
    this.bad = new Flag();
    this.loss = new Flag();
    this.slow = new Flag();
    this.counts.length = 0;
  }

  /** The share of snapshots due that were missing over the last NET.lossWindow s (0 while too few were due to say). */
  private lossShare({ t, got, lost }: LinkSample) {
    const last = this.counts.at(-1);
    if (!last || t - last.t >= 1) this.counts.push({ t, got, lost });
    while (this.counts.length > 1 && t - this.counts[1].t >= NET.lossWindow) this.counts.shift();
    const first = this.counts[0];
    const due = got - first.got + (lost - first.lost);
    return due >= NET.lossMinSnapshots ? (lost - first.lost) / due : 0;
  }
}
