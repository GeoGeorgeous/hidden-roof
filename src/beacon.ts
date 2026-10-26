import { NET, SERVER } from './config';
import type { NetStatus } from './net/multiplayer';

// The game's beacon for the admin page's Stats (server/beacon.ts), solo and in a
// session: once a minute the frames played (while the mouse is the game's and
// the tab is shown), join times, the funnel steps and tutorial steps reached,
// the game's events counted (pickups, jumps, falls, settings changed...), and
// the seconds spent playing, idle and in menus; errors as they happen
// (NET.beaconList a minute at most), by sendBeacon to /ws?e, where Caddy
// already passes the game's server. The minute one also says where the page
// is (`beat`), so the server counts the pages open now. The first one, when
// the level is ready, says how long it took, the GPU and the settings chosen.
// No id and no name: the server counts page loads, and reads the browser and
// OS from the request.

/** The funnel: the Play button (the first time the mouse is the game's), the level ready, the first paint, in a session. */
type Step = 'play' | 'ready' | 'sprayed' | 'joined';

/** The longest code the server takes (server/beacon-body.ts). */
const CODE_CHARS = 40;

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
  /** In a session (in it, or reconnecting). */
  private linked = false;
  /** Funnel and tutorial steps reached on this page, and those not sent yet. */
  private reached = new Set<string>();
  private steps: Step[] = [];
  private lessons: string[] = [];
  /** When each setting last changed (s). */
  private changed = new Map<string, number>();
  /** Events since the last send, by code. */
  private counts: Record<string, number> = {};
  /** Seconds since the last send. */
  private time = { playing: 0, idle: 0, menu: 0 };
  /** The GPU's name, cut to what the server takes: a beacon it refuses is lost whole. */
  private gpu: string | null;

  constructor(
    gpu: string | null,
    canvas: HTMLCanvasElement,
  ) {
    this.gpu = gpu?.slice(0, SERVER.beaconText) ?? null;
    addEventListener('error', (e) => this.error(e.error ?? e.message));
    addEventListener('unhandledrejection', (e) => this.error(e.reason));
    canvas.addEventListener('webglcontextlost', () => this.error('WebGL context lost'));
    addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.send());
    setInterval(() => ((this.errorsNow = 0), this.send(true)), NET.beaconEvery * 1000);
  }

  /** The level is ready: the first beacon, with the load time and the settings chosen (`settings`: each as a short string). */
  loaded(settings: Record<string, string>) {
    this.step('ready');
    this.send(false, { gpu: this.gpu, load: Math.min(SERVER.beaconMostSeconds, round(performance.now() / 1000)), settings });
  }

  /** A funnel step reached: counted the first time only. */
  step(s: Step) {
    if (!this.reached.has(s)) (this.reached.add(s), this.steps.push(s));
  }

  /** A tutorial step reached (a hint learnt, or 'done'): counted the first time only. */
  lesson(id: string) {
    if (!this.reached.has(`t.${id}`)) (this.reached.add(`t.${id}`), this.lessons.push(id));
  }

  /** A setting changed (`key`: its row's): one change until it's left alone for NET.beaconSettingGap s, so a slider drag counts once. */
  setting(key: string) {
    const now = performance.now() / 1000;
    if (now - (this.changed.get(key) ?? -Infinity) > NET.beaconSettingGap) this.count(`setting.${key}`);
    this.changed.set(key, now);
  }

  /** Something happened in the game: a code of lowercase letters, digits, dots and dashes (cut to CODE_CHARS; SERVER.beaconKinds a minute, the rest dropped). */
  count(code: string) {
    code = code.slice(0, CODE_CHARS);
    if (!Object.hasOwn(this.counts, code) && Object.keys(this.counts).length >= SERVER.beaconKinds) return;
    this.counts[code] = (this.counts[code] ?? 0) + 1;
  }

  /**
   * A frame drawn, `delta` s after the last. `playing`: the mouse is the game's, the tab shown (frames count);
   * `covered`: a dialog is up; `active`: when the last input was (performance.now() s).
   */
  frame(delta: number, playing: boolean, covered: boolean, active: number) {
    if (document.visibilityState !== 'visible') return;
    const s = Math.min(delta, NET.beaconStep);
    if (!playing || covered) this.time.menu += s;
    else if (performance.now() / 1000 - active >= NET.beaconIdle) this.time.idle += s;
    else this.time.playing += s;
    if (!playing) return;
    this.frames[Math.min(NET.beaconSlowFrame, Math.round(delta * 1000))]++;
    this.played += delta;
  }

  /** The session link's state: a join is timed from connecting to in, unless it waited in line. */
  status(s: NetStatus) {
    const now = performance.now() / 1000;
    this.linked = s.state === 'in' || s.state === 'reconnecting';
    if (s.state === 'in') this.step('joined');
    if (s.state === 'connecting') this.joining ??= now;
    else if (s.state === 'in' && this.joining !== null && this.joins.length < NET.beaconList) this.joins.push(Math.min(SERVER.beaconMostSeconds, round(now - this.joining)));
    if (s.state !== 'connecting') this.joining = null;
  }

  private error(e: unknown) {
    if (++this.errorsNow > NET.beaconList) return;
    this.errors.push(said(e));
    this.send();
  }

  /** Where the page is: the tab hidden, in a session, playing a level (paused too) or in the menu. */
  private beat() {
    return document.visibilityState === 'hidden' ? 'hidden' : this.linked ? 'session' : this.reached.has('play') ? 'solo' : 'menu';
  }

  /** What's gathered, if anything (`beat`: the minute's, always): frames only past NET.beaconMinPlay s of play. */
  private send(beat = false, first?: object) {
    const fps = this.played >= NET.beaconMinPlay ? this.fps() : undefined;
    const lessons = this.lessons.splice(0, NET.beaconList);
    const steps = this.steps.splice(0, NET.beaconList);
    const counts = Object.keys(this.counts).length ? this.counts : undefined;
    const seconds = this.seconds();
    if (!beat && !first && !fps && !this.joins.length && !this.errors.length && !lessons.length && !steps.length && !counts && !seconds) return;
    this.post({
      beat: beat ? this.beat() : undefined,
      first,
      fps,
      joins: this.joins.length ? this.joins : undefined,
      errors: this.errors.length ? this.errors : undefined,
      erred: this.errors.length && !this.erred ? true : undefined,
      steps: steps.length ? steps : undefined,
      tutorial: lessons.length ? lessons : undefined,
      counts,
      seconds,
    });
    if (this.errors.length) this.erred = true;
    if (fps) [this.frames, this.played] = [new Uint32Array(NET.beaconSlowFrame + 1), 0];
    [this.joins, this.errors] = [[], []];
    if (counts) this.counts = {};
    if (seconds) this.time = { playing: 0, idle: 0, menu: 0 };
  }

  /** The time spent, to 0.1 s, without what was none; undefined when all was. */
  private seconds() {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.time)) if (round(v) > 0) out[k] = round(v);
    return Object.keys(out).length ? out : undefined;
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
