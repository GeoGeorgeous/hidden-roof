import * as THREE from 'three';
import { CAPS, COLORS, NET, PLAYER } from '../config';
import { Avatar } from '../avatar/avatar';
import { setHex } from '../hex-color';
import { WallMemo, type SprayParticles } from '../spray/particles';
import type { Level } from '../level/level';
import type { PropData } from '../level/level-data';
import type { PaintOp, PaintOps } from '../paint-ops';
import { decodeOps, type SurfaceIndex } from '../op-wire';
import type { Presence } from './protocol';
import { Flag } from './link-health';
import { RemoteTimeline, type Pose } from './remote-timeline';
import { decodeSnapshot } from './snapshot';

// Another player, shown from their snapshots (snapshot.ts) by interpolation:
// remote-timeline.ts says where they are now, a little behind the newest
// snapshot. When a late snapshot's guess is corrected by the real one, the
// difference is smoothed out instead of jumping. Their paint ops and their
// stepladder are applied when the figure gets to the time they happened, so
// the paint shows up with the arm that sprays it, and their can's spray flies
// from the figure's hand (particles only); while this game is hidden, at once.
// Never simulated here: no physics, no collisions. Away (their game hidden) they stand head down; dropped, or
// silent for NET.silentAfter, they slump, drawn faded. In the menu or idle they're shown as they are: their snapshots keep coming.

const eye = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const display = new THREE.Color();

/** How they're shown: what the server says (here, away, menu, idle, dropped), or silent (no snapshots of late). */
export type Look = Presence | 'silent';

export class RemotePlayer {
  readonly avatar = new Avatar();
  /** What the server last said of them. */
  presence: Presence = 'here';
  look: Look = 'here';
  /** Shown far behind for a while (NET.highDelay): marked on their nameplate. */
  lagging = false;
  private lag = new Flag();
  /** Their snapshots and what they did, on their clock. */
  readonly timeline = new RemoteTimeline();
  /** Where they'd be shown without smoothing, last frame, and what's still being smoothed out (shown minus that). */
  private truePos = new THREE.Vector3();
  private error = new THREE.Vector3();
  private seen = false;
  /** For F3 -> Ghost: how far behind they're shown (s), measured jitter (s), snapshots waiting, guessing past the newest, the correction still gliding (m). */
  readonly stats = { delay: 0, jitter: 0, buffered: 0, guessing: false, correction: 0 };
  /** Spray particles owed to the next frame (a fraction of one). */
  private carry = 0;
  /** The wall their spray found, kept while their aim holds. */
  private wall = new WallMemo();

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

  /** Their paint color, as their newest snapshot says; null before one comes. */
  get color() {
    return this.timeline.newest?.color ?? null;
  }

  /** A snapshot arrived at local time `now` (s): when it came, not when it's read (it may have waited behind a welcome's paint). */
  receive(bytes: Uint8Array, now: number) {
    this.timeline.receive(decodeSnapshot(bytes), now);
  }

  /** What they sent (the server hands on a player's state, ops and stepladder as they sent them; the ghost plays its recording the same way): into their figure, `now` when it came. */
  deliver(m: { type: 'state'; bytes: Uint8Array } | { type: 'ops'; bytes: Uint8Array } | { type: 'ladder'; t: number; data: PropData | null }, surfaces: SurfaceIndex, now: number) {
    if (m.type === 'state') this.receive(m.bytes, now);
    else if (m.type === 'ops') {
      const b = decodeOps(m.bytes, surfaces);
      b?.ops.forEach((op, i) => this.receiveOp(b.t[i], op));
    } else this.receiveLadder(m.t, m.data);
  }

  /** A paint op they made at their time `t`. */
  receiveOp(t: number, op: PaintOp) {
    this.at(t, () => this.ops.apply(op));
  }

  /** Their stepladder placed (or taken away: null) at their time `t`. */
  receiveLadder(t: number, data: PropData | null) {
    this.at(t, () => this.level.setRuntime(this.owner, data));
  }

  /** `run` when their figure gets to their time `t`; at once while this game is hidden. */
  private at(t: number, run: () => void) {
    this.timeline.schedule(t, run, document.hidden);
  }

  /** Start over (their clock started again), keeping what's shown. */
  reset() {
    this.timeline.reset();
  }

  update(now: number, dt: number) {
    const st = this.timeline.sample(now, dt);
    if (!st) return;
    this.lagging = this.lag.step(now, this.timeline.stats.delay, NET.highDelay, NET.highDelayClear, NET.statusHold);
    const sending = this.presence !== 'away' && this.presence !== 'dropped';
    this.look = sending && now - this.timeline.heard > NET.silentAfter ? 'silent' : this.presence;
    const gone = this.look === 'dropped' || this.look === 'silent';
    if (gone || this.look === 'away') {
      // Head down, empty-handed; gone, slumped and faded.
      Object.assign(st, { pitch: -1.2, tool: null, action: null, crouched: gone || st.crouched });
      st.velocity.set(0, 0, 0);
    }
    this.avatar.setFaded(gone);
    if (st.onLadder) this.faceLadder(st);
    this.smooth(st, dt);
    Object.assign(this.stats, this.timeline.stats, { correction: this.error.length() });
    this.avatar.group.visible = true;
    this.avatar.update(dt, st, st.color, st.cap);
    if (st.tool === 'can' && st.action === 'spray' && st.flow > 0) this.spray(dt, st);
    else this.wall.age = Infinity;
  }

  /** Their can's spray, from its nozzle along their look, as much as comes out of it (SprayTool.emit). */
  private spray(dt: number, st: Pose) {
    const cap = CAPS[st.cap];
    this.carry += cap.rate * st.flow * dt;
    const count = Math.floor(this.carry);
    this.carry -= count;
    if (!count) return;
    const cp = Math.cos(st.pitch);
    forward.set(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    up.crossVectors(right, forward);
    eye.copy(this.position).y += st.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    setHex(display, COLORS[st.color]);
    this.particles.show({ count, eye, nozzle: this.avatar.nozzle(nozzle), forward, right, up, cap, display, dt, memo: this.wall });
  }

  /** Everything they did that waits for their figure, done now. */
  finish() {
    this.timeline.flush();
  }

  dispose() {
    this.avatar.dispose();
    this.level.setRuntime(this.owner, null);
  }

  /**
   * Shown where interpolation puts them, unless that jumped (a guess past the
   * newest snapshot, corrected by the next): then the jump is kept as an error
   * that fades out, so they glide to the right place, never faster than
   * NET.glideSpeed. A teleport snaps.
   */
  private smooth(st: Pose, dt: number) {
    const moved = this.truePos.sub(st.pos).negate();
    const jump = moved.addScaledVector(st.velocity, -dt);
    if (!this.seen || jump.length() > NET.teleport) this.error.set(0, 0, 0);
    else if (jump.length() > NET.smoothFrom) this.error.sub(jump);
    this.seen = true;
    const left = this.error.length();
    this.error.setLength(left - Math.min(left * (1 - Math.exp(-NET.smoothing * dt)), NET.glideSpeed * dt));
    this.truePos.copy(st.pos);
    this.avatar.group.position.copy(st.pos).add(this.error);
  }

  /** On a ladder they face it, whichever way they look. */
  private faceLadder(st: Pose) {
    const l = this.level.ladders.find((l) => l.volume.containsPoint(st.pos) || l.volume.distanceToPoint(st.pos) < NET.ladderNear);
    if (l) st.yaw = Math.atan2(l.normal.x, l.normal.z);
  }
}
