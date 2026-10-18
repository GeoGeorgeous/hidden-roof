import type * as THREE from 'three';
import { AVATAR, GHOST, NET } from '../config';
import type { Inventory } from '../inventory/inventory';
import type { Level } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintOps } from '../paint-ops';
import type { PaintSystem } from '../painting';
import type { Player } from '../player';
import { encodeOps, SurfaceIndex } from '../op-wire';
import type { ToServer } from '../net/protocol';
import { RemotePlayer } from '../net/remote-player';
import { Sender } from '../net/sender';
import { capture, encodeSnapshot } from '../net/snapshot';
import { loadPaint } from '../save/load-paint';
import { savePaint } from '../save/save-paint';
import { session } from '../session';
import type { Tools } from '../tools/tools';
import { SimLink } from './sim-link';

// F3 -> Ghost: a second player made from your own play, to see how other
// players will look (net/remote-player.ts) before there's a server.
// RECORD keeps what multiplayer sends (net/sender.ts), with its times:
// snapshots, paint ops, your stepladder. PLAY puts the paint back as it was when recording began and
// plays it all on a loop through a pretend network (sim-link.ts, GHOST), into
// a remote player: the ghost repaints your strokes as it goes, and you watch
// from anywhere. FOLLOW sends you live, GHOST.followDelay behind, without
// paint (yours is already there). Dev tools only. It runs on game time (the
// frames' dt), so the game tests can play it frame by frame.

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

/** The messages a remote player takes (net/remote-player.ts deliver), as the game sends them. */
type Said = Extract<ToServer, { type: 'state' | 'ops' | 'ladder' }>;

interface Recording {
  /** The paint when it began (a paint save). */
  start: Promise<Uint8Array>;
  /** What was sent, and when (game time, s), in order. */
  sent: { t: number; m: Said }[];
  /** How many paint ops. */
  ops: number;
  length: number;
}

const OWNER = 'ghost';
const NAME = { name: 'ghost' };

export class Ghost {
  private mode: 'off' | 'recording' | 'playing' | 'following' = 'off';
  private rec: Recording | null = null;
  private remote: RemotePlayer | null = null;
  /** The pretend network; tests seed its randomness (`link.random`). */
  readonly link = new SimLink<Said>();
  /**
   * Game time (s) since recording, following or this loop of playing began. From 0 each time, so every run adds the same dts.
   */
  private time = 0;
  /** How much of the recording this loop has sent. */
  private played = 0;
  /** Putting the paint back for the next loop; which loop is current (a stop or a new PLAY makes an older one give up). */
  private loading = false;
  private loops = 0;
  /** What this player sends (a recording's paint ops go through the wire's encoding, like a session's), and the surfaces the ops name. */
  private sender: Sender;
  private surfaces = new SurfaceIndex([]);

  constructor(private g: GhostContext) {
    this.sender = new Sender({ capture: (at) => encodeSnapshot(capture(at, g.player, g.inventory, g.tools)), paint: g.paint, level: g.level, owner: () => session.player, inventory: g.inventory });
  }

  get label() {
    const r = this.rec;
    const took = r ? `${r.length.toFixed(1)} s, ${r.ops} paint ops` : 'nothing recorded';
    if (this.mode === 'recording') return `recording ${this.time.toFixed(1)} s`;
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
    this.time = 0;
    this.surfaces = new SurfaceIndex([...g.paint.surfaces].map((s) => s.key));
    this.rec = { start: savePaint(g.paint, NAME), sent: [], ops: 0, length: 0 };
    // Refused while a session has the paint log: then only the walk is recorded.
    this.sender.begin();
    this.sender.restart();
  }

  play() {
    if (this.mode === 'recording') this.stop();
    if (!this.rec?.sent.some((s) => s.m.type === 'state')) return;
    this.stop();
    this.mode = 'playing';
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
    void this.loop();
  }

  follow() {
    this.stop();
    this.mode = 'following';
    this.time = 0;
    this.sender.restart();
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
  }

  stop() {
    if (this.mode === 'recording' && this.rec) {
      this.rec.length = this.time;
      this.sender.end();
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
    const t = (this.time += dt);
    if (this.mode === 'recording') this.keep(t);
    // Following: only where you are, the stepladder and paint are yours already.
    else if (this.mode === 'following') this.sender.update(t, t).messages.forEach((m) => m.type === 'state' && this.link.send(m, t, GHOST.followDelay));
    else if (this.mode === 'playing' && !this.loading) this.send(t);
    const remote = this.remote;
    if (!remote) return;
    for (const m of this.link.receive(t)) remote.deliver(m, this.surfaces, t);
    remote.update(t, dt);
  }

  /** Recording: what the player sends this frame, with the time. */
  private keep(t: number) {
    const rec = this.rec!;
    const { messages, ops } = this.sender.update(t, t);
    for (const m of messages) if (m.type === 'state' || m.type === 'ladder') rec.sent.push({ t, m });
    if (!ops.length) return;
    rec.ops += ops.length;
    rec.sent.push({ t, m: { type: 'ops', seq: 0, bytes: encodeOps(ops.map(() => t), ops, this.surfaces) } });
  }

  /** Playing: what the recording sent by now goes into the link; at the end, start over. */
  private send(t: number) {
    const rec = this.rec!;
    while (this.played < rec.sent.length && rec.sent[this.played].t <= t) this.link.send(rec.sent[this.played++].m, t);
    // Once the last of it has arrived and been shown.
    if (t > rec.length + NET.interpDelay + GHOST.latency + GHOST.jitter + GHOST.hiccupDelay + 0.5) void this.loop();
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
    this.played = 0;
    this.time = 0;
    this.loading = false;
  }
}
