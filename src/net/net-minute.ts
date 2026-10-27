import { NET } from '../config.ts';

// What this game's session link did since the beacon last asked (src/beacon.ts): its pings,
// how it closed, how long coming back took, its stalls (nothing from the server for over
// NET.stallGap s), the bytes each way while live. No ids; the server keeps only counts.

/** As the beacon sends it: seconds in a session (0.1 s), ping (ms), drops by close code ('timeout': this game gave up on a silent link), reconnect and stall times (s), KB/s each way. */
export interface NetReport {
  seconds: number;
  ping?: { p50: number; p95: number; max: number };
  drops?: Record<string, number>;
  back?: number[];
  stalls?: number;
  stallLong?: number[];
  down: number;
  up: number;
}

export class NetMinute {
  private seconds = 0;
  private pings: number[] = [];
  private drops: Record<string, number> = {};
  private back: number[] = [];
  private stalls: number[] = [];
  private bytes = { down: 0, up: 0 };
  /** The longest silence of the stall under way (s), 0 when none; when the link dropped (s), null when it hasn't. */
  private gap = 0;
  private droppedAt: number | null = null;

  /** A frame in the session, `dt` s after the last, `silence` s since the server last said anything. */
  frame(dt: number, silence: number) {
    this.seconds += dt;
    if (silence > NET.stallGap) this.gap = Math.max(this.gap, silence);
    else if (this.gap) this.stalled();
  }

  /** A pong's round trip (ms). */
  pinged(ms: number) {
    this.pings.push(ms);
  }

  /** The link carried these bytes while live. */
  carried(up: number, down: number) {
    this.bytes.up += up;
    this.bytes.down += down;
  }

  /** The link closed at `t` (s) as `code`; a reconnect follows. */
  dropped(code: string, t: number) {
    if (this.gap) this.stalled();
    this.drops[code] = (this.drops[code] ?? 0) + 1;
    this.droppedAt ??= t;
  }

  /** In the session again at `t` (s), after a drop or not. */
  in(t: number) {
    if (this.droppedAt !== null && this.back.length < NET.beaconList) this.back.push(round(t - this.droppedAt));
    this.droppedAt = null;
  }

  /** What there is since the last take, and starts over; undefined when the game wasn't in a session. */
  take(): NetReport | undefined {
    const s = this.seconds;
    const had = s > 0 || Object.keys(this.drops).length > 0;
    const sorted = this.pings.sort((a, b) => a - b);
    const at = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
    const report: NetReport = {
      seconds: round(s),
      ping: sorted.length ? { p50: at(0.5), p95: at(0.95), max: at(1) } : undefined,
      drops: Object.keys(this.drops).length ? this.drops : undefined,
      back: this.back.length ? this.back : undefined,
      stalls: this.stalls.length || undefined,
      stallLong: this.stalls.length ? this.stalls.sort((a, b) => b - a).slice(0, NET.beaconList) : undefined,
      down: s > 0 ? Math.round(this.bytes.down / s / 1000) : 0,
      up: s > 0 ? Math.round(this.bytes.up / s / 1000) : 0,
    };
    [this.seconds, this.pings, this.drops, this.back, this.stalls, this.bytes] = [0, [], {}, [], [], { down: 0, up: 0 }];
    return had ? report : undefined;
  }

  private stalled() {
    this.stalls.push(round(this.gap));
    this.gap = 0;
  }
}

const round = (x: number) => Math.round(x * 10) / 10;
