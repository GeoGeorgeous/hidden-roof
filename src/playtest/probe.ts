import { PLAYTEST } from '../config';

// The playtest build's counters (docs/playtest.md): code around the game adds
// to them as it runs, the recorder (recorder.ts) reads and clears them once a
// window. Plain numbers and fixed buffers: nothing allocated per frame.

/** Up to PLAYTEST.samples values per window, for percentiles. */
export class Samples {
  private v = new Float64Array(PLAYTEST.samples);
  n = 0;
  max = 0;
  sum = 0;

  add(x: number) {
    if (this.n < this.v.length) this.v[this.n] = x;
    this.n++;
    this.sum += x;
    if (x > this.max) this.max = x;
  }

  /** p50, p95, p99 and max, rounded to 0.1; null with no samples. */
  summary() {
    if (!this.n) return null;
    const s = this.v.slice(0, Math.min(this.n, this.v.length)).sort();
    const at = (p: number) => round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
    return { n: this.n, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: round(this.max), mean: round(this.sum / this.n) };
  }

  clear() {
    this.n = this.max = this.sum = 0;
  }
}

/** Counts per bucket: `tops` are the buckets' upper bounds, one more for anything past the last. Adds up across windows and players. */
export class Histogram {
  readonly counts: number[];
  constructor(private tops: number[]) {
    this.counts = new Array(tops.length + 1).fill(0);
  }

  add(x: number) {
    let i = 0;
    while (i < this.tops.length && x > this.tops[i]) i++;
    this.counts[i]++;
  }

  take() {
    const c = [...this.counts];
    this.counts.fill(0);
    return c;
  }
}

export const round = (x: number) => Math.round(x * 10) / 10;

/** What the game counts as it goes; the recorder reads and clears it each window. */
export const probe = {
  /** Spray particles: asked for and launched (the rest found the pool full), yours and others'. */
  ownAsked: 0,
  ownLaunched: 0,
  othersAsked: 0,
  othersLaunched: 0,
  /** Other players' paint ops: applied, CPU time applying them (ms), time from arriving to applied (ms, the figure's delay), arriving later than their best (ms). */
  remoteOps: 0,
  remoteOpMs: 0,
  opWait: new Samples(),
  opLate: new Samples(),
  /** Paint ops made here, by kind. */
  ownOps: { stamp: 0, roll: 0, drip: 0 } as Record<string, number>,
  /** Remote figures: gaps between snapshots (ms), and smoothed corrections. */
  arrivals: new Histogram(PLAYTEST.arrivalBuckets),
  corrections: 0,
  /** Other players spraying this frame (the recorder clears it each frame). */
  sprayers: 0,
};
