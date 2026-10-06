import * as THREE from 'three';
import { NET } from '../config';
import { Avatar } from '../avatar/avatar';
import type { AvatarState } from '../avatar/pose';
import type { Level, PropData } from '../level/level';
import type { PaintOp, PaintOps } from '../paint-ops';
import { decodeSnapshot, type Snapshot } from './snapshot';

// Another player, shown from their snapshots (snapshot.ts) by interpolation:
// the figure is drawn NET.interpDelay behind the newest snapshot, between the
// two that bracket that moment, so it moves smoothly though snapshots come 20
// times a second and arrive unevenly. Their paint ops and their stepladder are
// applied when the figure gets to the time they happened, so the paint shows
// up with the arm that sprays it. Never simulated here: no physics, no
// collisions.

interface Timed {
  t: number;
  run: () => void;
}

export class RemotePlayer {
  readonly avatar = new Avatar();
  private snaps: Snapshot[] = [];
  private events: Timed[] = [];
  /**
   * Their clock on ours: local time minus sender time. `target` follows the
   * least delayed packet; `offset` eases toward it (NET.clockRate), so a
   * better estimate speeds their time up a little instead of skipping ahead.
   */
  private offset: number | null = null;
  private target = 0;
  private state: AvatarState = { velocity: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouched: false, onLadder: false, tool: null, action: null };
  private pos = new THREE.Vector3();
  /** Their time last shown: it never goes back, even when the link gets slower (it stalls instead). */
  private shown = -Infinity;

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private ops: PaintOps,
    /** Their key: what they own (their stepladder). */
    readonly owner: string,
  ) {
    this.avatar.group.visible = false;
    scene.add(this.avatar.group);
  }

  /** Where their feet are shown now. */
  get position() {
    return this.avatar.group.position;
  }

  /** A snapshot arrived at local time `now` (s). */
  receive(bytes: Uint8Array, now: number) {
    const s = decodeSnapshot(bytes);
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) return;
    // Drifts up slowly, so a link that got slower is followed, not just a faster one.
    const sample = now - s.t;
    if (this.offset === null) this.offset = this.target = sample;
    else this.target = Math.min(sample, this.target + 0.002);
    this.snaps.push(s);
  }

  /** A paint op they made at their time `t`. */
  receiveOp(t: number, op: PaintOp) {
    this.events.push({ t, run: () => this.ops.apply(op) });
  }

  /** Their stepladder placed (or taken away: null) at their time `t`. */
  receiveLadder(t: number, data: PropData | null) {
    this.events.push({ t, run: () => this.level.setRuntime(this.owner, data) });
  }

  /** Start over (their clock started again), keeping what's shown. */
  reset() {
    this.snaps.length = 0;
    this.events.length = 0;
    this.offset = null;
    this.shown = -Infinity;
  }

  update(now: number, dt: number) {
    if (this.offset === null) return;
    const ease = NET.clockRate * dt;
    this.offset += Math.min(ease, Math.max(-ease, this.target - this.offset));
    const at = Math.max(now - this.offset - NET.interpDelay, this.shown);
    this.shown = at;
    let n = 0;
    for (const e of this.events) {
      if (e.t <= at) e.run();
      else this.events[n++] = e;
    }
    this.events.length = n;
    const s = this.snaps;
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
    if (st.onLadder) this.faceLadder();
    this.avatar.group.position.copy(this.pos);
    this.avatar.group.visible = true;
    this.avatar.update(dt, st, cur.color);
  }

  dispose() {
    this.avatar.dispose();
    this.level.setRuntime(this.owner, null);
  }

  /** On a ladder they face it, whichever way they look. */
  private faceLadder() {
    const l = this.level.ladders.find((l) => l.volume.containsPoint(this.pos) || l.volume.distanceToPoint(this.pos) < 0.3);
    if (l) this.state.yaw = Math.atan2(l.normal.x, l.normal.z);
  }
}

/** An angle difference brought into -PI..PI. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
