import * as THREE from 'three';
import { NET, type CapId, type PaintColor } from '../config';
import type { AvatarState } from '../avatar/pose';
import type { Snapshot } from './snapshot';

// Another player's clock, apart from their figure (remote-player.ts): their
// snapshots (snapshot.ts) come in, what they did waits for its time, and
// `sample` says where they are now. The figure is shown a little behind the
// newest snapshot (NET.interpDelay, or more on a jittery link), between the
// two that bracket that moment, so it moves smoothly though snapshots come 20
// times a second and arrive unevenly. A late snapshot is guessed at for a
// moment (NET.extrapolate). Knows no scene and no document: the caller says
// whether this game is hidden.

/** What `sample` says of them: the avatar's state, where the feet are, and the paint in hand. */
export interface Pose extends AvatarState {
  pos: THREE.Vector3;
  color: PaintColor;
  cap: CapId;
  flow: number;
}

interface Timed {
  t: number;
  run: () => void;
}

export class RemoteTimeline {
  /** When their newest snapshot arrived (local s). */
  heard = -Infinity;
  /** For F3 -> Ghost: how far behind they're shown (s), measured jitter (s), snapshots waiting, guessing past the newest. */
  readonly stats = { delay: 0, jitter: 0, buffered: 0, guessing: false };
  private snaps: Snapshot[] = [];
  private events: Timed[] = [];
  /**
   * How far behind their clock we show them: local time minus sender time,
   * plus the interpolation delay. `target` follows the least delayed packet,
   * `jitter` how much later than that packets come on average; `lag` eases
   * toward both (NET.clockRate), so a change speeds their time up or slows it
   * a little instead of skipping.
   */
  private lag: number | null = null;
  private target = 0;
  private jitter = 0;
  /** Their time last shown: it never goes back, even when the link gets slower (it stalls instead). */
  private shown = -Infinity;
  private pose: Pose = { pos: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouched: false, onLadder: false, tool: null, action: null, color: 'black', cap: 'standard', flow: 0 };

  /** Their newest snapshot; undefined before one comes. */
  get newest() {
    return this.snaps[this.snaps.length - 1];
  }

  /** How many things they did still wait for their time. */
  get waiting() {
    return this.events.length;
  }

  /** A snapshot arrived at local time `now` (s): when it came, not when it's read (it may have waited behind a welcome's paint). */
  receive(s: Snapshot, now: number) {
    this.heard = now;
    const last = this.newest;
    // Their clock started over (they reloaded the page and came back): follow the new one.
    if (last && s.t < last.t - 1) this.reset();
    else if (last && s.t <= last.t) return;
    // Drifts up slowly, so a link that got slower is followed, not just a faster one.
    const sample = now - s.t;
    if (this.lag === null) {
      this.target = sample;
      this.lag = sample + NET.interpDelay;
    } else this.target = Math.min(sample, this.target + NET.lagDrift);
    this.jitter += (sample - this.target - this.jitter) * NET.jitterShare;
    this.snaps.push(s);
    // Not shown for a while (a hidden tab draws no frames): keep only the newest.
    if (this.snaps.length > NET.snapsKept) this.snaps.shift();
  }

  /**
   * `run` when their time gets to `t`; at once while this game is `hidden`,
   * which draws no frames: queued, all they did for as long as it's hidden
   * would wait (memory) and land in one frame when it's shown again. What
   * still waited from before goes first, so it all lands in their order (a
   * stepladder they took away stays away).
   */
  schedule(t: number, run: () => void, hidden: boolean) {
    if (!hidden) return void this.events.push({ t, run });
    this.flush();
    run();
  }

  /** Everything that waits, done now, in order. */
  flush() {
    for (const e of this.events.splice(0)) e.run();
  }

  /** Start over (their clock started again). */
  reset() {
    this.snaps.length = 0;
    this.events.length = 0;
    this.lag = null;
    this.jitter = 0;
    this.shown = -Infinity;
  }

  /** Their time moves on by `dt` to local time `now`: what's due is run, and where they are is returned (valid until the next call); null before there is anything to show. */
  sample(now: number, dt: number): Pose | null {
    if (this.lag === null) return null;
    const delay = Math.min(NET.maxDelay, Math.max(NET.interpDelay, 1 / NET.sendRate + NET.jitterCover * this.jitter));
    const ease = NET.clockRate * dt;
    this.lag += Math.min(ease, Math.max(-ease, this.target + delay - this.lag));
    const s = this.snaps;
    // Far behind every snapshot kept (they piled up while this game was busy or hidden): catch up at once, not over a minute.
    if (s.length && now - this.lag < s[0].t - NET.maxDelay) this.lag = Math.min(this.lag, this.target + delay);
    const at = Math.max(now - this.lag, this.shown);
    this.shown = at;
    let n = 0;
    for (const e of this.events) {
      if (e.t <= at) e.run();
      else this.events[n++] = e;
    }
    this.events.length = n;
    while (s.length > 2 && s[1].t <= at) s.shift();
    if (!s.length || s[0].t > at) return null;
    const a = s[0];
    const b = s[1];
    const st = this.pose;
    if (b && b.t > a.t) {
      // Between a and b; past b only while the newest is late (going on its way), then it stands.
      const span = b.t - a.t;
      const late = 1 + NET.extrapolate / span;
      const k = Math.min((at - a.t) / span, late);
      this.stats.guessing = k > 1;
      st.pos.lerpVectors(a.pos, b.pos, k);
      st.velocity.subVectors(b.pos, a.pos).divideScalar(span);
      if (k >= late) st.velocity.set(0, 0, 0);
      st.yaw = a.yaw + wrap(b.yaw - a.yaw) * Math.min(k, 1);
      st.pitch = a.pitch + (b.pitch - a.pitch) * Math.min(k, 1);
    } else {
      st.pos.copy(a.pos);
      st.velocity.set(0, 0, 0);
      st.yaw = a.yaw;
      st.pitch = a.pitch;
    }
    // States switch at the later snapshot's time, like the player did.
    const cur = b && at >= b.t ? b : a;
    st.onGround = cur.onGround;
    st.crouched = cur.crouched;
    st.onLadder = cur.onLadder;
    st.tool = cur.tool;
    st.action = cur.action;
    st.color = cur.color;
    st.cap = cur.cap;
    st.flow = cur.flow;
    Object.assign(this.stats, { delay: this.lag - this.target, jitter: this.jitter, buffered: s.length });
    return st;
  }
}

/** An angle difference brought into -PI..PI. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
