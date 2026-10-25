import { NET } from './config';
import type { NetStatus } from './net/multiplayer';

// The game's beacon for the admin page's Stats › Performance (server/beacon.ts),
// solo and in a session: once a minute the frames played (while the mouse is
// the game's and the tab is shown), join times, and errors as they happen
// (NET.beaconList a minute at most), by sendBeacon to /ws?e, where Caddy
// already passes the game's server. The first one, when the level is ready,
// says how long it took and the GPU. No id and no name: the server counts page
// loads, and reads the browser and OS from the request.

/** One: its text, cut to NET.beaconErrorChars. */
const said = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, NET.beaconErrorChars);

export class Beacon {
  /** Frames played by their time in whole ms, the last bin NET.beaconSlowFrame ms or more. */
  private frames = new Uint32Array(NET.beaconSlowFrame + 1);
  private played = 0;
  private joins: number[] = [];
  private errors: string[] = [];
  /** Errors this minute, and whether this page has had one (the server counts plays with errors). */
  private errorsNow = 0;
  private erred = false;
  /** When a join started (s), while it's under way. */
  private joining: number | null = null;

  constructor(
    private gpu: string | null,
    canvas: HTMLCanvasElement,
  ) {
    addEventListener('error', (e) => this.error(e.error ?? e.message));
    addEventListener('unhandledrejection', (e) => this.error(e.reason));
    canvas.addEventListener('webglcontextlost', () => this.error('WebGL context lost'));
    addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.send());
    setInterval(() => ((this.errorsNow = 0), this.send()), NET.beaconEvery * 1000);
  }

  /** The level is ready: the first beacon, with the load time. */
  loaded() {
    this.post({ first: { gpu: this.gpu, load: round(performance.now() / 1000) } });
  }

  /** A frame drawn, `delta` s after the last; `playing`: it counts. */
  frame(delta: number, playing: boolean) {
    if (!playing) return;
    this.frames[Math.min(NET.beaconSlowFrame, Math.round(delta * 1000))]++;
    this.played += delta;
  }

  /** The session link's state: a join is timed from connecting to in, unless it waited in line. */
  status(s: NetStatus) {
    const now = performance.now() / 1000;
    if (s.state === 'connecting') this.joining ??= now;
    else if (s.state === 'in' && this.joining !== null && this.joins.length < NET.beaconList) this.joins.push(round(now - this.joining));
    if (s.state !== 'connecting') this.joining = null;
  }

  private error(e: unknown) {
    if (++this.errorsNow > NET.beaconList) return;
    this.errors.push(said(e));
    this.send();
  }

  /** What's gathered, if anything: frames only past NET.beaconMinPlay s of play. */
  private send() {
    const fps = this.played >= NET.beaconMinPlay ? this.fps() : undefined;
    if (!fps && !this.joins.length && !this.errors.length) return;
    this.post({ fps, joins: this.joins.length ? this.joins : undefined, errors: this.errors.length ? this.errors : undefined, erred: this.errors.length && !this.erred ? true : undefined });
    if (this.errors.length) this.erred = true;
    if (fps) [this.frames, this.played] = [new Uint32Array(NET.beaconSlowFrame + 1), 0];
    [this.joins, this.errors] = [[], []];
  }

  /** The average frame rate, and the 1% low: the rate of the frame slower than 99% of them. */
  private fps() {
    let n = 0;
    for (const c of this.frames) n += c;
    let slow = this.frames.length - 1;
    for (let past = 0; slow > 0 && (past += this.frames[slow]) < n / 100; ) slow--;
    return { avg: round(n / this.played), low1: round(1000 / Math.max(1, slow)) };
  }

  private post(body: object) {
    try {
      navigator.sendBeacon('/ws?e', JSON.stringify(body));
    } catch {
      // Not sent: the page may be closing, or the browser blocks it. Stats only.
    }
  }
}

const round = (x: number) => Math.round(x * 10) / 10;
