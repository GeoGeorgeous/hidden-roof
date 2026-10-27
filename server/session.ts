import { randomUUID } from 'node:crypto';
import { SERVER } from '../src/config';
import { SLOTS, type Tool } from '../src/inventory/tool';
import type { LevelData } from '../src/level/level-data';
import { decodeOps, encodeOps, SurfaceIndex } from '../src/op-wire';
import { opTool } from '../src/paint-ops';
import { closeCode, encode, partFrames, type Rejection, type ToClient, type ToServer } from '../src/net/protocol';
import { loadPaint } from '../src/save/load-paint';
import { surfaceTable } from '../src/save/shape';
import { countPaint, DayCounts, SessionStats } from './counts';
import { event } from './events';
import { history } from './history';
import { log, span, who } from './log';
import { deliver, presence, uniqueName, type Link, type Player } from './player';
import { Queue } from './queue';
import { HOSTED } from './setup';
import { PaintFiles } from './paint-files';
import { fit, mostPaint } from './paint-fit';
import { inTurn, Snapshot } from './snapshot';
import { levelRange, spotIn, type Range } from './spot';
import { paintMemory, sessionPaint } from './world';

// One live session: its level, PAINT DETAIL and paint, and its players. It
// paints every op it relays, so a joiner (or a player coming back) gets the
// paint as one paint file in its welcome (snapshot.ts). A dropped player has
// SERVER.rejoinWindow to come back with their token; after that they and their
// stepladder go, and the session closes when no one is left, unless it stays
// (a public one, or a private one the admin made so) until the admin closes it.
// A JOIN that finds it full waits in its line (queue.ts) and comes in as a place frees.
// Its paint is stored only if it's public and DATA_DIR is set (kept.ts): a
// restart ends every other session.

type How = 'new' | 'back' | 'takeover';

export class Session {
  readonly players = new Map<number, Player>();
  readonly table: string;
  /** Who waits for a place, in order. */
  readonly line: Queue;
  /** Its surfaces as paint ops name them (op-wire.ts). */
  private surfaces: SurfaceIndex;
  private world: ReturnType<typeof sessionPaint>;
  /** The tools it turned off (setup.tools is what it allows): their ops and stepladders are dropped. */
  private off: ReadonlySet<Tool>;
  private nextId = 1;
  readonly started = Date.now();
  private counts: Record<How, number> = { new: 0, back: 0, takeover: 0 };
  /** Its paint files (paint-files.ts). */
  private files: PaintFiles;
  /** The paint being replaced by a restore, until it is loaded. */
  private restoring: Promise<void> | null = null;
  /** The save HOST sent, as its paint file: the host has its paint already. */
  private seed: Snapshot | null = null;
  /** What players gone carried and where they stood, by name: one who comes back later under it gets it back. */
  private carried = new Map<string, Pick<Player, 'inventory' | 'at'>>();
  /** Where a player may stand (spot.ts). */
  private range: Range;
  /** Painted since its last paintFile(). */
  changed = false;
  /** The admin's wipes so far: a paint file read before the last one is not this paint. */
  wipes = 0;
  /** Its paint and most players this UTC day, for the admin page. */
  readonly today = new DayCounts();
  /** Its counts since its paint began (a wipe zeroes them, kept.ts brings a save's back). */
  stats = new SessionStats();
  /** When its last player went (ms), or null with players in it. */
  emptySince: number | null = this.started;

  constructor(
    readonly code: string,
    readonly levelName: string,
    readonly level: LevelData,
    /** PAINT DETAIL, texels per meter, picked by the host. */
    readonly detail: number,
    private onEmpty: (why: string) => void,
    readonly setup = HOSTED,
  ) {
    this.off = new Set(SLOTS.filter((t) => !setup.tools.includes(t)));
    this.line = new Queue(code, () => this.players.size < this.setup.limit);
    this.range = levelRange(level);
    this.world = sessionPaint(level, detail);
    this.files = new PaintFiles(code, this.world.paint, levelName);
    this.table = surfaceTable(this.world.paint.surfaces);
    this.surfaces = new SurfaceIndex([...this.world.paint.surfaces].map((s) => s.key));
  }

  /** Start from a paint save (HOST's, or `host` false one kept on disk). Throws with a message if it's no good or doesn't fit the level. */
  async load(save: Uint8Array, host = true) {
    await loadPaint(this.world.paint, this.world.drips, save, { name: this.levelName }, mostPaint(this.world.paint, this.detail));
    // The save is the paint now, as the players load it (the same faces fit, resampled the same way): the host's welcome.
    if (host) this.files.keep((this.seed = new Snapshot(partFrames([save], SERVER.partBytes))));
  }

  /** Paint memory in MB now, and with every surface painted. */
  get memory() {
    return paintMemory(this.world.paint);
  }

  /**
   * A player on `link`: with the token of one still here, or the device of one whose link is open, that player again (a
   * reconnect, `back`); without, one who dropped under the same name (a new
   * tab, `takeover`: their stepladder and slot); else a new one, numbered if
   * the name is taken. Their welcome carries the paint as a paint file and the
   * ops painted since it was read; then they're live. Turned away when the
   * session is full or there's no memory for a paint file. `note`: for the log.
   */
  async admit(link: Link, name: string, token?: string): Promise<{ p: Player; how: How; note: string } | Rejection> {
    // Players dropped by a restore come back to the restored paint.
    if (this.restoring) await this.restoring.catch(() => {});
    const all = [...this.players.values()];
    let p = token ? all.find((q) => q.token === token) : undefined;
    // No token, but the device of a player whose link is still open (a tab whose session storage is gone, a second tab): the same player.
    if (!p && link.device) p = all.find((q) => q.device === link.device && q.link?.open);
    const dropped = all.filter((q) => !q.link);
    const how = p ? 'back' : (p = dropped.find((q) => q.name === name) ?? dropped.find((q) => q.asked === name)) ? 'takeover' : 'new';
    if (!p && this.setup.kind === 'public' && all.filter((q) => (q.link ?? q.was)?.ip === link.ip).length >= SERVER.seatsPerIp) return 'seats';
    if (!p && this.players.size >= this.setup.limit) return 'full';
    const snap = this.files.get(() => p?.link === link && link.open);
    if (snap === 'busy') return 'busy';
    this.counts[how]++;
    if (how === 'new') this.stats.joins++;
    let note = '';
    if (p) {
      if (p.expires) clearTimeout(p.expires);
      p.expires = null;
      const was = p.was;
      note = p.link ? `; replaces its link from ${p.link.ip}, open ${span(Date.now() - p.link.since)}` : was ? `; its link from ${was.ip} closed ${span(Date.now() - was.at)} ago, open ${span(was.lived)}` : '';
      // Still there on another link (a duplicated tab carries the token along): that one goes, told why, so it doesn't come back.
      if (p.link) {
        event('turned-away', this, p.name, { reason: 'replaced' });
        history.turnedAway('replaced');
      }
      p.link?.send(encode({ type: 'rejected', reason: 'replaced' }));
      p.link?.close(closeCode('replaced'), 'replaced');
      p.link = link;
      p.device = link.device ?? p.device;
      p.activity = 'here';
    } else {
      const unique = uniqueName(name, all);
      p = { id: this.nextId++, name: unique, asked: name, token: randomUUID(), device: link.device, link, joined: Date.now(), acked: 0, live: false, saving: false, activity: 'here', inventory: null, at: null, ...this.carried.get(unique), ladder: null, expires: null, was: null };
      this.broadcast({ type: 'joined', id: p.id, name: p.name }, p);
      this.players.set(p.id, p);
    }
    this.today.players(this.players.size);
    this.stats.players(this.players.size);
    this.emptySince = null;
    p.live = false;
    let frames;
    try {
      frames = await snap.frames;
    } catch (e) {
      // No welcome: they may come back as for any drop.
      this.dropped(p, link);
      throw e;
    }
    if (!frames || p.link !== link) return { p, how, note };
    // The host from a save: that save is its paint.
    const own = snap === this.seed;
    this.seed = null;
    const others = [...this.players.values()].filter((q) => q !== p);
    const ladders = [...this.players.values()].filter((q) => q.ladder).map((q) => ({ id: q.id, data: q.ladder! }));
    const players = others.map((q) => ({ id: q.id, name: q.name, state: presence(q) }));
    const { kind, limit, tools } = this.setup;
    const session = { kind, name: this.setup.name, limit, tools: [...tools] };
    link.send(encode({ type: 'welcome', code: this.code, you: p.id, name: p.name, token: p.token, session, levelName: this.levelName, level: this.level, detail: this.detail, table: this.table, players, ladders, inventory: p.inventory, at: p.at, parts: own ? 0 : frames.length, acked: p.acked }));
    if (!own) for (const f of frames) link.send(f);
    for (const f of snap.log) link.send(f);
    p.live = true;
    if (how !== 'new') this.broadcast({ type: 'presence', id: p.id, state: 'here' }, p);
    snap.served++;
    return { p, how, note: `${note}${snap.served > 1 ? `; paint file shared (${snap.served})` : ''}` };
  }

  receive(p: Player, m: ToServer) {
    if (m.type === 'state') {
      p.at = spotIn(m.bytes, this.range) ?? p.at;
      this.broadcast({ type: 'state', id: p.id, bytes: m.bytes }, p);
    }
    else if (m.type === 'ops') {
      // Not acked: the game sends them again, to the restored paint.
      if (this.restoring || m.seq <= p.acked) return;
      p.acked = m.seq;
      const batch = decodeOps(m.bytes, this.surfaces);
      if (!batch) return log(this.code, who(p), 'paint ops it could not read: dropped');
      // Ops on a face their surface doesn't have, and ops of a tool the session turned off, are dropped.
      const { paint, ops } = this.world;
      const keep = batch.ops.map((op) => {
        const tool = opTool(op);
        return op.rect < (paint.find(op.key)?.geo.rects.length ?? 0) && !(tool && this.off.has(tool));
      });
      const valid = batch.ops.filter((_, i) => keep[i]);
      this.files.now(() => valid.forEach((op) => ops.apply(op)));
      if (!valid.length) return;
      countPaint(valid, [this.today.paint, history.now(), this.stats.paint]);
      this.stats.painter(p.name);
      this.changed = true;
      const bytes = valid.length === batch.ops.length ? m.bytes : encodeOps(batch.t.filter((_, i) => keep[i]), valid, this.surfaces);
      this.broadcast({ type: 'ops', id: p.id, bytes }, p);
      this.files.log(encode({ type: 'paint', bytes }));
    } else if (m.type === 'ladder') {
      // Putting one down with the stepladder off is dropped (picking it up is not).
      if (m.data && this.off.has('ladder')) return;
      p.ladder = m.data;
      this.broadcast({ type: 'ladder', id: p.id, t: m.t, data: m.data }, p);
    } else if (m.type === 'save') void this.save(p);
    else if (m.type === 'inventory') p.inventory = m.data;
    else if (m.type === 'status') {
      p.activity = m.status;
      this.broadcast({ type: 'presence', id: p.id, state: presence(p) }, p);
    }
    else if (m.type === 'ping') this.send(p, { type: 'pong', t: m.t, acked: p.acked });
    else if (m.type === 'leave') this.remove(p, 'left');
  }

  /** Their link closed: they have SERVER.rejoinWindow to come back. */
  dropped(p: Player, link: Link) {
    if (p.link !== link) return;
    p.link = null;
    p.live = false;
    p.was = { ip: link.ip, country: link.country ?? null, lived: Date.now() - link.since, at: Date.now() };
    event('dropped', this, p.name, { held: SERVER.rejoinWindow });
    this.broadcast({ type: 'presence', id: p.id, state: 'dropped' }, p);
    p.expires = setTimeout(() => this.remove(p, `didn't come back in ${SERVER.rejoinWindow} s`), SERVER.rejoinWindow * 1000);
  }

  /** Paint runs move on (`dt` s). */
  tick(dt: number) {
    if (this.restoring) return;
    this.files.now(() => this.world.drips.update(dt));
  }

  /** To players waiting for their welcome too: their link is alive. */
  ping() {
    const f = encode({ type: 'ping' });
    for (const p of this.players.values()) p.link?.send(f);
    this.line.ping(f);
  }

  /** Ends it with no one in it (its host was turned away, or no one came to the admin's). */
  close(why: string) {
    if (!this.players.size) this.finish(why);
  }

  /**
   * The admin's wipe: no paint. Every link closes as a drop, so each game comes
   * back and its welcome brings the clean wall; after a paint file reading the
   * paint now, so no game comes back to that one.
   */
  wipe() {
    this.wipes++;
    this.stats = new SessionStats('wiped');
    this.files.now(() => {
      this.world.paint.clear();
      this.world.drips.clear();
      this.files.forget();
      for (const p of this.players.values()) p.link?.close(1012, 'wiped');
    });
  }

  /** Throws Refused with why unless `file` is a paint file this session can take as its paint (paint-fit.ts). */
  fits(file: Uint8Array) {
    return fit(file, this.levelName, this.detail, this.world.paint, this.world.drips);
  }

  /** The admin's restore: its paint and stats become `file`'s (fits()). As a wipe's, every link closes as a drop; a game that comes back waits for the paint to load, and paint sent meanwhile is dropped. */
  async restore(file: Uint8Array, stats: SessionStats) {
    this.wipes++;
    const loading = (this.restoring = inTurn(async () => {
      this.files.forget();
      await this.load(file, false);
      this.stats = stats;
    }));
    for (const p of this.players.values()) p.link?.close(1012, 'restored');
    try {
      await loading;
    } finally {
      this.restoring = null;
    }
  }

  /** The admin closed it: everyone, those in line too, is told so (`closed`, not `ended`: nobody ran out of time). */
  end() {
    for (const p of this.players.values()) {
      history.played((Date.now() - p.joined) / 1000);
      this.stats.stay(p.joined, Date.now());
      this.eject(p, 'closed');
    }
    this.players.clear();
    this.emptySince = Date.now();
    this.finish('by the admin', 'closed');
  }

  /** The admin removed a player: told why, out at once with no seat held, free to join again (the lobby refuses their token for a while). False if there's no such player. */
  kick(id: number) {
    const p = this.players.get(id);
    if (!p) return false;
    this.eject(p, 'kicked');
    event('kicked', this, p.name);
    this.remove(p, 'kicked by the admin');
    return true;
  }

  /** The paint now as a paint file (kept.ts saves it), made in turn as a welcome's is; null when there's no memory for one. */
  paintFile() {
    return this.files.file();
  }

  /** When (ms) the players now in it joined: the stats count their time so far. */
  joinedAt() {
    return [...this.players.values()].map((p) => p.joined);
  }

  /** For the log when it closes. */
  get summary() {
    const c = this.counts;
    return `after ${span(Date.now() - this.started)}, ${this.memory.now.toFixed(0)} MB of paint, ${this.nextId - 1} players: ${c.new} new, ${c.back} back, ${c.takeover} takeovers`;
  }

  remove(p: Player, why: string) {
    if (this.players.get(p.id) !== p) return;
    if (p.expires) clearTimeout(p.expires);
    this.players.delete(p.id);
    if (p.inventory || p.at) this.carried.set(p.name, { inventory: p.inventory, at: p.at });
    log(this.code, who(p), `out: ${why} (${this.players.size} players)`);
    const played = (Date.now() - p.joined) / 1000;
    event('left', this, p.name, { why, played: Math.round(played) });
    history.played(played);
    this.stats.stay(p.joined, Date.now());
    const link = p.link;
    p.link = null;
    link?.close(1000, why);
    this.broadcast({ type: 'left', id: p.id });
    this.line.update();
    if (this.players.size) return;
    this.emptySince = Date.now();
    if (!this.setup.stays) this.finish('no one left');
  }

  /** `p` is told why and their link closed; no seat held. */
  private eject(p: Player, reason: 'kicked' | 'closed') {
    if (p.expires) clearTimeout(p.expires);
    const link = p.link;
    p.link = null;
    link?.send(encode({ type: 'rejected', reason }));
    link?.close(closeCode(reason), reason);
  }

  /** It's over: those waiting are told, and the lobby forgets it. */
  private finish(why: string, told: 'ended' | 'closed' = 'ended') {
    this.line.end(told);
    this.onEmpty(why);
  }

  /** SAVE: the paint as a paint file, for `p`. One at a time each. */
  private async save(p: Player) {
    if (p.saving) return;
    const link = p.link;
    const snap = this.files.get(() => p.link === link && !!link?.open, true);
    if (snap === 'busy') return this.send(p, { type: 'save', parts: 0 });
    p.saving = true;
    try {
      const frames = await snap.frames;
      if (!frames || p.link !== link) return;
      this.send(p, { type: 'save', parts: frames.length });
      for (const f of frames) deliver(p, f);
      snap.served++;
    } catch {
      // Told as when there's no memory for one, so the game doesn't wait for it.
      this.send(p, { type: 'save', parts: 0 });
    } finally {
      p.saving = false;
    }
  }

  private send(p: Player, m: ToClient) {
    deliver(p, encode(m));
  }

  private broadcast(m: ToClient, except?: Player) {
    const f = encode(m);
    for (const p of this.players.values()) if (p !== except) deliver(p, f);
  }
}
