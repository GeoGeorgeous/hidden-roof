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
import { session } from '../session';
import type { Tools } from '../tools/tools';
import { GhostWall } from './ghost-wall';
import { SimLink } from './sim-link';

// F3 -> Ghost: a second player made from your own play, to see how other
// players will look (net/remote-player.ts) before there's a server, and to film
// yourself from outside (ghost-capture.ts).
// RECORD keeps what multiplayer sends (net/sender.ts), with its times:
// snapshots, paint ops, your stepladder. A new take keeps the last one until it
// stops.
// PLAY puts the paint back as it was when recording began and plays it all
// through a pretend network (sim-link.ts, GHOST), into a remote player: the
// ghost repaints your strokes as it goes, and you watch from anywhere. It can
// hold still or go faster. Your wall and stepladder come back when it stops
// (ghost-wall.ts).
// The clean wall is the paint as it began, with no ghost; again, all goes on
// from where it was.
// FOLLOW sends you live, GHOST.followDelay behind, without paint (yours is
// already there).
// Dev tools only. It runs on game time (the frames' dt), so the game tests can
// play it frame by frame.

interface GhostContext {
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
  /** The surfaces its ops name. */
  surfaces: SurfaceIndex;
}

const OWNER = 'ghost';
const NO_SURFACES = new SurfaceIndex([]);

export class Ghost {
  private mode: 'off' | 'recording' | 'playing' | 'following' = 'off';
  private rec: Recording | null = null;
  /** The take being recorded: it's `rec` once it stops. */
  private take: Recording | null = null;
  private remote: RemotePlayer | null = null;
  /** The pretend network; tests seed its randomness (`link.random`). */
  readonly link = new SimLink<Said>();
  /**
   * Game time (s) since recording, following or this loop of playing began. From 0 each time, so every run adds the same dts.
   */
  private time = 0;
  /** How much of the recording this loop has sent. */
  private played = 0;
  /** Plays over and over, or holds its last frame. */
  private looping = false;
  /** Holding its last frame. */
  ended = false;
  /** What a stop or a new start makes an older start give up on. */
  private starts = 0;
  /** Playing holds still, and so do its paint runs. */
  paused = false;
  private stillRuns: PaintDrips['runs'] = [];
  /** How fast playing goes: an index into GHOST.speeds. */
  pace = 0;
  private wall: GhostWall;
  /** What this player sends (a recording's paint ops go through the wire's encoding, like a session's). */
  private sender: Sender;

  constructor(private g: GhostContext) {
    this.wall = new GhostWall(g, OWNER);
    this.sender = new Sender({ capture: (at) => encodeSnapshot(capture(at, g.player, g.inventory, g.tools)), paint: g.paint, level: g.level, owner: () => session.player, inventory: g.inventory });
  }

  get label() {
    const r = this.rec;
    const took = r ? `${r.length.toFixed(1)} s, ${r.ops} paint ops` : 'nothing recorded';
    if (this.mode === 'recording') return `recording ${this.time.toFixed(1)} s`;
    if (this.cleaned) return `clean wall (${took})`;
    if (this.ended) return `done (${took})`;
    if (this.mode === 'playing') return `${this.paused ? 'paused' : 'playing'} at ${this.speed}x, ${took}`;
    if (this.mode === 'following') return `following ${GHOST.followDelay} s behind`;
    return `off (${took})`;
  }

  /** There's something to play. */
  get recorded() {
    return !!this.rec;
  }

  get recording() {
    return this.mode === 'recording';
  }

  get playing() {
    return this.mode === 'playing';
  }

  /** How far it is into recording or playing (s). */
  get elapsed() {
    return this.recording ? this.time : Math.min(this.time, this.length);
  }

  /** How long the recording is (s). */
  get length() {
    return this.rec?.length ?? 0;
  }

  get cleaned() {
    return this.wall.cleaned;
  }

  /** Done when the paint going on now is. */
  get settled() {
    return this.wall.settled;
  }

  /** How many times as fast playing goes. */
  get speed() {
    return GHOST.speeds[this.pace];
  }

  /** Its remote player's network numbers (net/remote-player.ts), while there is one. */
  get net() {
    return this.remote?.stats ?? null;
  }

  /** Where the ghost stands, for the stepladder's room check; null when there's none. */
  get position(): THREE.Vector3 | null {
    return this.remote?.avatar.group.visible ? this.remote.position : null;
  }

  /** Your wall first, if the ghost has it: that's what the take starts from. */
  record() {
    this.stop();
    const id = this.starts;
    void this.wall.settled.then(() => {
      if (id === this.starts) this.begin();
    });
  }

  play(loop = false) {
    this.halt();
    if (!this.recorded) return;
    this.wall.setAside();
    this.mode = 'playing';
    this.looping = loop;
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
    this.fromStart();
  }

  togglePause() {
    this.paused = !this.paused;
    const { runs } = this.g.drips;
    if (this.paused) this.stillRuns = runs.splice(0);
    else runs.push(...this.stillRuns.splice(0));
  }

  /** The wall as it was when recording began and no ghost, all it was doing held back; again, it goes on from there. */
  clean() {
    if (this.wall.loading || this.recording || !this.recorded) return;
    if (!this.cleaned) {
      this.wall.clean(this.rec!.start);
      if (this.remote) this.remote.avatar.group.visible = false;
    } else if (this.playing) this.wall.unclean();
    else this.stop();
  }

  follow() {
    this.stop();
    this.mode = 'following';
    this.time = 0;
    this.sender.restart();
    this.remote = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, OWNER, this.g.tools.spray.others);
  }

  /** Your wall and stepladder back, but in a session: the wall is the session's then. */
  stop() {
    this.halt();
    if (session.multiplayer) this.wall.forget();
    else this.wall.giveBack();
  }

  /** It looks different now (AVATAR.hoodUp or the gray tones changed). */
  restyle() {
    this.remote?.avatar.setOutfit({ hoodUp: AVATAR.hoodUp });
  }

  update(frame: number) {
    if (this.cleaned || this.ended) return;
    const playing = this.mode === 'playing';
    const dt = !playing ? frame : this.paused ? 0 : frame * this.speed;
    // The game runs paint at 1x (main.ts): the rest of playing's speed.
    if (dt > frame && !this.wall.loading) this.g.drips.update(dt - frame);
    const t = (this.time += dt);
    if (this.mode === 'recording') this.keep(t);
    // Following: only where you are, the stepladder and paint are yours already.
    else if (this.mode === 'following') this.sender.update(t, t).messages.forEach((m) => m.type === 'state' && this.link.send(m, t, GHOST.followDelay));
    else if (playing && !this.wall.loading) this.send(t);
    const remote = this.remote;
    if (!remote) return;
    for (const m of this.link.receive(t)) remote.deliver(m, this.rec?.surfaces ?? NO_SURFACES, t);
    remote.update(t, dt);
  }

  /** Recording: what the player sends this frame, with the time. */
  private keep(t: number) {
    const take = this.take!;
    const { messages, ops } = this.sender.update(t, t);
    for (const m of messages) if (m.type === 'state' || m.type === 'ladder') take.sent.push({ t, m });
    if (!ops.length) return;
    take.ops += ops.length;
    take.sent.push({ t, m: { type: 'ops', seq: 0, bytes: encodeOps(ops.map(() => t), ops, take.surfaces) } });
  }

  /** Playing: what the recording sent by now goes into the link; once the last of it has arrived and been shown, the end. */
  private send(t: number) {
    const rec = this.rec!;
    while (this.played < rec.sent.length && rec.sent[this.played].t <= t) this.link.send(rec.sent[this.played++].m, t);
    if (t <= rec.length + NET.interpDelay + GHOST.latency + GHOST.jitter + GHOST.hiccupDelay + GHOST.tail) return;
    if (this.looping) this.fromStart();
    else this.ended = true;
  }

  /** Paint back as it was when recording began, then play from the start. */
  private fromStart() {
    this.wall.swap(this.rec!.start, () => {
      this.g.level.setRuntime(OWNER, null);
      this.link.clear();
      this.remote?.reset();
      this.played = 0;
      this.time = 0;
    });
  }

  private begin() {
    const g = this.g;
    this.mode = 'recording';
    this.time = 0;
    this.take = { start: this.wall.save(), sent: [], ops: 0, length: 0, surfaces: new SurfaceIndex([...g.paint.surfaces].map((s) => s.key)) };
    // Refused while a session has the paint log: then only the walk is recorded.
    this.sender.begin();
    this.sender.restart();
  }

  /** Stops what's going on, the wall as it is. */
  private halt() {
    if (this.mode === 'recording') this.endTake();
    this.remote?.dispose();
    this.remote = null;
    this.link.clear();
    this.mode = 'off';
    this.ended = false;
    this.paused = false;
    this.stillRuns = [];
    this.starts++;
    this.wall.cancel();
  }

  /** It takes the last one's place, unless it's a slip or has nothing to play. */
  private endTake() {
    const take = this.take!;
    take.length = this.time;
    this.sender.end();
    this.take = null;
    if (take.sent.some((s) => s.m.type === 'state') && (!this.rec || take.length >= GHOST.minTake)) this.rec = take;
  }
}
