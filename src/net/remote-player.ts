import * as THREE from 'three';
import { CAPS, COLORS, NET, PLAYER } from '../config';
import { Avatar } from '../avatar/avatar';
import { setHex } from '../hex-color';
import type { SprayParticles } from '../spray/particles';
import type { AvatarState } from '../avatar/pose';
import type { Level, PropData } from '../level/level';
import type { PaintOp, PaintOps } from '../paint-ops';
import type { Presence } from './protocol';
import { decodeSnapshot, type Snapshot } from './snapshot';

// Another player, shown from their snapshots (snapshot.ts) by interpolation:
// the figure is drawn a little behind the newest snapshot (NET.interpDelay, or
// more on a jittery link), between the two that bracket that moment, so it
// moves smoothly though snapshots come 20 times a second and arrive unevenly.
// A late snapshot is guessed at for a moment (NET.extrapolate); when the real
// one comes, the difference is smoothed out instead of jumping. Their paint ops and their stepladder are
// applied when the figure gets to the time they happened, so the paint shows
// up with the arm that sprays it, and their can's spray flies from the
// figure's hand (particles only); while this game is hidden, at once. Never simulated here: no physics, no
// collisions. Away (their game hidden) they stand head down; dropped, or
// silent for NET.silentAfter, they slump, drawn faded.

interface Timed {
  t: number;
  run: () => void;
}

const eye = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const display = new THREE.Color();

/** How they're shown: here, away, dropped (the server says), or silent (no snapshots of late). */
export type Look = Presence | 'silent';

export class RemotePlayer {
  readonly avatar = new Avatar();
  /** What the server last said of them. */
  presence: Presence = 'here';
  look: Look = 'here';
  /** When their newest snapshot arrived (local s). */
  private heard = -Infinity;
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
  /** Where they'd be shown without smoothing, last frame, and what's still being smoothed out (shown minus that). */
  private truePos = new THREE.Vector3();
  private error = new THREE.Vector3();
  private seen = false;
  /** For F3 -> Ghost: how far behind they're shown (s), measured jitter (s), snapshots waiting, guessing past the newest, the correction still gliding (m). */
  readonly stats = { delay: 0, jitter: 0, buffered: 0, guessing: false, correction: 0 };
  private state: AvatarState = { velocity: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouched: false, onLadder: false, tool: null, action: null };
  private pos = new THREE.Vector3();
  /** Their time last shown: it never goes back, even when the link gets slower (it stalls instead). */
  private shown = -Infinity;
  /** Spray particles owed to the next frame (a fraction of one). */
  private carry = 0;

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private ops: PaintOps,
    /** Their key: what they own (their stepladder). */
    readonly owner: string,
    /** Where their can's spray goes (SprayTool.others). */
    private particles: SprayParticles,
  ) {
    this.avatar.group.visible = false;
    scene.add(this.avatar.group);
  }

  /** Where their feet are shown now. */
  get position() {
    return this.avatar.group.position;
  }

  /** A snapshot arrived at local time `now` (s): when it came, not when it's read (it may have waited behind a welcome's paint). */
  receive(bytes: Uint8Array, now: number) {
    this.heard = now;
    const s = decodeSnapshot(bytes);
    const last = this.snaps[this.snaps.length - 1];
    // Their clock started over (they reloaded the page and came back): follow the new one.
    if (last && s.t < last.t - 1) this.reset();
    else if (last && s.t <= last.t) return;
    // Drifts up slowly, so a link that got slower is followed, not just a faster one.
    const sample = now - s.t;
    if (this.lag === null) {
      this.target = sample;
      this.lag = sample + NET.interpDelay;
    } else this.target = Math.min(sample, this.target + 0.002);
    this.jitter += (sample - this.target - this.jitter) * 0.05;
    this.snaps.push(s);
    // Not shown for a while (a hidden tab draws no frames): keep only the newest.
    if (this.snaps.length > 64) this.snaps.shift();
  }

  /** A paint op they made at their time `t`. */
  receiveOp(t: number, op: PaintOp) {
    this.at(t, () => this.ops.apply(op));
  }

  /** Their stepladder placed (or taken away: null) at their time `t`. */
  receiveLadder(t: number, data: PropData | null) {
    this.at(t, () => this.level.setRuntime(this.owner, data));
  }

  /**
   * `run` when their figure gets to their time `t`; at once while this game is
   * hidden, which draws no frames: queued, all they did for as long as it's
   * hidden would wait (memory) and land in one frame when it's shown again.
   */
  private at(t: number, run: () => void) {
    if (document.hidden) run();
    else this.events.push({ t, run });
  }

  /** Start over (their clock started again), keeping what's shown. */
  reset() {
    this.snaps.length = 0;
    this.events.length = 0;
    this.lag = null;
    this.jitter = 0;
    this.shown = -Infinity;
  }

  update(now: number, dt: number) {
    if (this.lag === null) return;
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
    if (!s.length || s[0].t > at) return;
    const a = s[0];
    const b = s[1];
    const st = this.state;
    if (b && b.t > a.t) {
      // Between a and b; past b only while the newest is late (going on its way), then it stands.
      const span = b.t - a.t;
      const late = 1 + NET.extrapolate / span;
      const k = Math.min((at - a.t) / span, late);
      this.stats.guessing = k > 1;
      this.pos.lerpVectors(a.pos, b.pos, k);
      st.velocity.subVectors(b.pos, a.pos).divideScalar(span);
      if (k >= late) st.velocity.set(0, 0, 0);
      st.yaw = a.yaw + wrap(b.yaw - a.yaw) * Math.min(k, 1);
      st.pitch = a.pitch + (b.pitch - a.pitch) * Math.min(k, 1);
    } else {
      this.pos.copy(a.pos);
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
    this.look = this.presence === 'here' && now - this.heard > NET.silentAfter ? 'silent' : this.presence;
    if (this.look !== 'here') {
      // Head down, empty-handed; gone, slumped and faded.
      Object.assign(st, { pitch: -1.2, tool: null, action: null, crouched: this.look !== 'away' || st.crouched });
      st.velocity.set(0, 0, 0);
    }
    this.avatar.setFaded(this.look === 'dropped' || this.look === 'silent');
    if (st.onLadder) this.faceLadder();
    this.smooth(dt);
    Object.assign(this.stats, { delay: this.lag - this.target, jitter: this.jitter, buffered: s.length, correction: this.error.length() });
    this.avatar.group.visible = true;
    this.avatar.update(dt, st, cur.color, cur.cap);
    if (st.tool === 'can' && st.action === 'spray' && cur.flow > 0) this.spray(dt, cur);
  }

  /** Their can's spray, from its nozzle along their look, as much as comes out of it (SprayTool.emit). */
  private spray(dt: number, s: Snapshot) {
    const cap = CAPS[s.cap];
    this.carry += cap.rate * s.flow * dt;
    const count = Math.floor(this.carry);
    this.carry -= count;
    if (!count) return;
    const st = this.state;
    const cp = Math.cos(st.pitch);
    forward.set(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    up.crossVectors(right, forward);
    eye.copy(this.position).y += st.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    setHex(display, COLORS[s.color]);
    this.particles.show({ count, eye, nozzle: this.avatar.nozzle(nozzle), forward, right, up, cap, display, dt });
  }

  /** Everything they did that waits for their figure, done now. */
  finish() {
    for (const e of this.events.splice(0)) e.run();
  }

  dispose() {
    this.avatar.dispose();
    this.level.setRuntime(this.owner, null);
  }

  /**
   * Shown where interpolation puts them, unless that jumped (a guess past the
   * newest snapshot, corrected by the next): then the jump is kept as an error
   * that fades out, so they glide to the right place. A teleport snaps.
   */
  private smooth(dt: number) {
    const moved = this.truePos.sub(this.pos).negate();
    const jump = moved.addScaledVector(this.state.velocity, -dt);
    if (!this.seen || jump.length() > NET.teleport) this.error.set(0, 0, 0);
    else if (jump.length() > 0.05) this.error.sub(jump);
    this.seen = true;
    this.error.multiplyScalar(Math.exp(-NET.smoothing * dt));
    this.truePos.copy(this.pos);
    this.avatar.group.position.copy(this.pos).add(this.error);
  }

  /** On a ladder they face it, whichever way they look. */
  private faceLadder() {
    const l = this.level.ladders.find((l) => l.volume.containsPoint(this.pos) || l.volume.distanceToPoint(this.pos) < 0.3);
    if (l) this.state.yaw = Math.atan2(l.normal.x, l.normal.z);
  }
}

/** An angle difference brought into -PI..PI. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
