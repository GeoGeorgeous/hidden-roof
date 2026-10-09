import type * as THREE from 'three';
import { AVATAR, GHOST, NET } from '../config';
import type { Inventory } from '../inventory/inventory';
import type { Level, PropData } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintOp, PaintOps } from '../paint-ops';
import type { PaintSystem } from '../painting';
import type { Player } from '../player';
import { RemotePlayer } from '../net/remote-player';
import { capture, encodeSnapshot } from '../net/snapshot';
import { loadPaint } from '../save/load-paint';
import { savePaint } from '../save/save-paint';
import { session } from '../session';
import type { Tools } from '../tools/tools';
import { SimLink } from './sim-link';

// F3 -> Ghost: a second player made from your own play, to see how other
// players will look (net/remote-player.ts) before there's a server.
// RECORD keeps what multiplayer sends, with its times: snapshots, paint ops,
// your stepladder. PLAY puts the paint back as it was when recording began and
// plays it all on a loop through a pretend network (sim-link.ts, GHOST), into
// a remote player: the ghost repaints your strokes as it goes, and you watch
// from anywhere. FOLLOW sends you live, GHOST.followDelay behind, without
// paint (yours is already there). Dev tools only.

export interface GhostContext {
  scene: THREE.Scene;
  level: Level;
  paint: PaintSystem;
  paintOps: PaintOps;
  drips: PaintDrips;
  player: Player;
  inventory: Inventory;
  tools: Tools;
}

type Msg = { kind: 'snap'; bytes: Uint8Array } | { kind: 'op'; t: number; op: PaintOp } | { kind: 'ladder'; t: number; data: PropData | null };

interface Recording {
  /** The paint when it began (a paint save). */
  start: Promise<Uint8Array>;
  snaps: { t: number; bytes: Uint8Array }[];
  ops: { t: number; op: PaintOp }[];
  ladders: { t: number; data: PropData | null }[];
  length: number;
}

const OWNER = 'ghost';
const NAME = { name: 'ghost' };
const now = () => performance.now() / 1000;

export class Ghost {
  private mode: 'off' | 'recording' | 'playing' | 'following' = 'off';
  private rec: Recording | null = null;
  private remote: RemotePlayer | null = null;
  private link = new SimLink<Msg>();
  /** When recording or this loop of playing began (local s), and when the next snapshot goes. */
  private t0 = 0;
  private next = 0;
  /** How much of the recording this loop has sent. */
  private sent = { snaps: 0, ops: 0, ladders: 0 };
  /** Putting the paint back for the next loop; which loop is current (a stop or a new PLAY makes an older one give up). */
  private loading = false;
  private loops = 0;
  private ladderId: number | undefined;
  private log: PaintOp[] | null = null;

  constructor(private g: GhostContext) {}

  get label() {
    const r = this.rec;
    const took = r ? `${r.length.toFixed(1)} s, ${r.ops.length} paint ops` : 'nothing recorded';
    if (this.mode === 'recording') return `recording ${(now() - this.t0).toFixed(1)} s`;
    if (this.mode === 'playing') return `playing ${took}`;
    if (this.mode === 'following') return `following ${GHOST.followDelay} s behind`;
    return `off (${took})`;
  }

  /** Its remote player's network numbers (net/remote-player.ts), while there is one. */
  get net() {
    return this.remote?.stats ?? null;
  }

  /** Where the ghost stands, for the stepladder's room check; null when there's none. */
  get position(): THREE.Vector3 | null {
    return this.remote?.avatar.group.visible ? this.remote.position : null;
  }

  record() {
    this.stop();
    const g = this.g;
    this.mode = 'recording';
    this.t0 = now();
    this.next = 0;
    this.rec = { start: savePaint(g.paint, NAME), snaps: [], ops: [], ladders: [], length: 0 };
    // Paint ops as the paint system logs them (as the golden test does).
    this.log = g.paint.log;
    g.paint.log = [];
    this.ladderId = undefined;
  }

  play() {
    if (this.mode === 'recording') this.stop();
    if (!this.rec?.snaps.length) return;
    this.stop();
    this.mode = 'playing';
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
    void this.loop();
  }

  follow() {
    this.stop();
    this.mode = 'following';
    this.next = 0;
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
  }

  stop() {
    if (this.mode === 'recording' && this.rec) {
      this.rec.length = now() - this.t0;
      this.g.paint.log = this.log;
    }
    this.remote?.dispose();
    this.remote = null;
    this.link.clear();
    this.mode = 'off';
    this.loading = false;
    this.loops++;
  }

  /** It looks different now (AVATAR.hoodUp or the gray tones changed). */
  restyle() {
    this.remote?.avatar.setOutfit({ hoodUp: AVATAR.hoodUp });
  }

  update(dt: number) {
    const t = now();
    if (this.mode === 'recording') this.keep(t);
    else if (this.mode === 'following' && t >= this.next) {
      this.next = t + 1 / NET.sendRate;
      this.link.send({ kind: 'snap', bytes: this.snapshot(t) }, t, GHOST.followDelay);
    } else if (this.mode === 'playing' && !this.loading) this.send(t);
    const remote = this.remote;
    if (!remote) return;
    for (const m of this.link.receive(t)) {
      if (m.kind === 'snap') remote.receive(m.bytes, t);
      else if (m.kind === 'op') remote.receiveOp(m.t, m.op);
      else remote.receiveLadder(m.t, m.data);
    }
    remote.update(t, dt);
  }

  /** Recording: a snapshot every 1 / NET.sendRate s, the paint ops since last frame, the stepladder when it moves. */
  private keep(t: number) {
    const g = this.g;
    const rec = this.rec!;
    const at = t - this.t0;
    if (t >= this.next) {
      this.next = t + 1 / NET.sendRate;
      rec.snaps.push({ t: at, bytes: this.snapshot(at) });
    }
    for (const op of g.paint.log!.splice(0)) rec.ops.push({ t: at, op: structuredClone(op) });
    const id = g.level.runtimeOf(session.player);
    if (id !== this.ladderId) {
      this.ladderId = id;
      const p = id === undefined ? undefined : g.level.props.get(id);
      rec.ladders.push({ t: at, data: p ? { type: p.type, pos: [...p.pos], rot: p.rot } : null });
    }
  }

  private snapshot(t: number) {
    return encodeSnapshot(capture(t, this.g.player, this.g.inventory, this.g.tools));
  }

  /** Playing: what the recording sent by now goes into the link; at the end, start over. */
  private send(t: number) {
    const rec = this.rec!;
    const at = t - this.t0;
    const s = this.sent;
    while (s.snaps < rec.snaps.length && rec.snaps[s.snaps].t <= at) this.link.send({ kind: 'snap', bytes: rec.snaps[s.snaps++].bytes }, t);
    while (s.ops < rec.ops.length && rec.ops[s.ops].t <= at) this.link.send({ kind: 'op', ...rec.ops[s.ops++] }, t);
    while (s.ladders < rec.ladders.length && rec.ladders[s.ladders].t <= at) this.link.send({ kind: 'ladder', ...rec.ladders[s.ladders++] }, t);
    // Once the last of it has arrived and been shown.
    if (at > rec.length + NET.interpDelay + GHOST.latency + GHOST.jitter + GHOST.hiccupDelay + 0.5) void this.loop();
  }

  /** Paint back as it was when recording began, then play from the start. */
  private async loop() {
    const id = ++this.loops;
    this.loading = true;
    const start = await this.rec!.start;
    if (id !== this.loops || this.mode !== 'playing') return;
    await loadPaint(this.g.paint, this.g.drips, start, NAME);
    if (id !== this.loops || this.mode !== 'playing') return;
    this.g.level.setRuntime(OWNER, null);
    this.link.clear();
    this.remote?.reset();
    this.sent = { snaps: 0, ops: 0, ladders: 0 };
    this.t0 = now();
    this.loading = false;
  }
}
