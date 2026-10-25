import { randomUUID } from 'node:crypto';
import { SERVER } from '../src/config';
import type { InventoryData } from '../src/inventory/inventory';
import { SLOTS, type Tool } from '../src/inventory/tool';
import type { LevelData } from '../src/level/level-data';
import { decodeOps, encodeOps, SurfaceIndex } from '../src/op-wire';
import { opTool } from '../src/paint-ops';
import { closeCode, encode, partFrames, partPieces, type Rejection, type SessionKind, type ToClient, type ToServer } from '../src/net/protocol';
import { loadPaint } from '../src/save/load-paint';
import { joinBytes } from '../src/save/paint-file';
import { streamPaint } from '../src/save/save-paint';
import { surfaceTable } from '../src/save/shape';
import { liveMemory, log, mb, overMemory, span, who } from './log';
import { deliver, presence, uniqueName, type Link, type Player } from './player';
import { Queue } from './queue';
import { Snapshot, waiting } from './snapshot';
import { sessionPaint } from './world';

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

/** What its creator made it: public (open to all) or private (by its code), its name, most players, the tools it allows; `stays` when empty; `admin`: the admin made it. */
export interface SessionSetup {
  kind: SessionKind;
  name: string;
  limit: number;
  tools: readonly Tool[];
  stays: boolean;
  admin: boolean;
}

/** A session made without a setup (the paint tests'): private, every tool, closed when empty. */
const HOSTED: SessionSetup = { kind: 'private', name: '', limit: SERVER.players.private, tools: SLOTS, stays: false, admin: false };

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
  /** The newest paint file whose paint has been read (made or being made), while it's kept; and one waiting for its turn. */
  private snap: Snapshot | null = null;
  private next: Snapshot | null = null;
  /** Paint changes held back while a paint file reads the paint (null: none is), in order. */
  private frozen: (() => void)[] | null = null;
  /** The save HOST sent, as its paint file: the host has its paint already. */
  private seed: Snapshot | null = null;
  /** What players gone carried, by name: one who comes back later under it gets it back. */
  private carried = new Map<string, InventoryData>();
  /** Painted since its last paintFile(). */
  changed = false;
  /** The admin's wipes so far: a paint file read before the last one is not this paint. */
  wipes = 0;

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
    this.world = sessionPaint(level, detail);
    this.table = surfaceTable(this.world.paint.surfaces);
    this.surfaces = new SurfaceIndex([...this.world.paint.surfaces].map((s) => s.key));
  }

  /** Start from a paint save (HOST's, or `host` false one kept on disk). Throws with a message if it's no good or doesn't fit the level. */
  async load(save: Uint8Array, host = true) {
    // At most this level all painted, at the highest detail (a save may be made at any), with each face's ring.
    const most = this.memory.full * 2 ** 20 * (96 / this.detail) ** 2 * 1.25;
    await loadPaint(this.world.paint, this.world.drips, save, { name: this.levelName }, most);
    // The save is the paint now, as the players load it (the same faces fit, resampled the same way): the host's welcome.
    if (host) this.keep((this.seed = new Snapshot(partFrames([save], SERVER.partBytes))));
  }

  /** Paint memory in MB now, and with every surface painted. */
  get memory() {
    let now = 0;
    let full = 0;
    for (const s of this.world.paint.surfaces) {
      now += s.data?.length ?? 0;
      full += s.geo.atlasW * s.geo.atlasH * 4;
    }
    return { now: now / 2 ** 20, full: full / 2 ** 20 };
  }

  /**
   * A player on `link`: with the token of one still here, that player again (a
   * reconnect, `back`); without, one who dropped under the same name (a new
   * tab, `takeover`: their stepladder and slot); else a new one, numbered if
   * the name is taken. Their welcome carries the paint as a paint file and the
   * ops painted since it was read; then they're live. Turned away when the
   * session is full or there's no memory for a paint file. `note`: for the log.
   */
  async admit(link: Link, name: string, token?: string): Promise<{ p: Player; how: How; note: string } | Rejection> {
    const all = [...this.players.values()];
    let p = token ? all.find((q) => q.token === token) : undefined;
    const dropped = all.filter((q) => !q.link);
    const how = p ? 'back' : (p = dropped.find((q) => q.name === name) ?? dropped.find((q) => q.asked === name)) ? 'takeover' : 'new';
    if (!p && this.players.size >= this.setup.limit) return 'full';
    const snap = this.snapshot(() => p?.link === link && link.open);
    if (snap === 'busy') return 'busy';
    this.counts[how]++;
    let note = '';
    if (p) {
      if (p.expires) clearTimeout(p.expires);
      p.expires = null;
      const was = p.was;
      note = p.link ? `; replaces its link from ${p.link.ip}, open ${span(Date.now() - p.link.since)}` : was ? `; its link from ${was.ip} closed ${span(Date.now() - was.at)} ago, open ${span(was.lived)}` : '';
      // Still there on another link (a duplicated tab carries the token along): that one goes, told why, so it doesn't come back.
      p.link?.send(encode({ type: 'rejected', reason: 'replaced' }));
      p.link?.close(closeCode('replaced'), 'replaced');
      p.link = link;
      p.activity = 'here';
    } else {
      const unique = uniqueName(name, all);
      p = { id: this.nextId++, name: unique, asked: name, token: randomUUID(), link, acked: 0, live: false, saving: false, activity: 'here', inventory: this.carried.get(unique) ?? null, ladder: null, expires: null, was: null };
      this.broadcast({ type: 'joined', id: p.id, name: p.name }, p);
      this.players.set(p.id, p);
    }
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
    link.send(encode({ type: 'welcome', code: this.code, you: p.id, name: p.name, token: p.token, session, levelName: this.levelName, level: this.level, detail: this.detail, table: this.table, players, ladders, inventory: p.inventory, parts: own ? 0 : frames.length, acked: p.acked }));
    if (!own) for (const f of frames) link.send(f);
    for (const f of snap.log) link.send(f);
    p.live = true;
    if (how !== 'new') this.broadcast({ type: 'presence', id: p.id, state: 'here' }, p);
    snap.served++;
    return { p, how, note: `${note}${snap.served > 1 ? `; paint file shared (${snap.served})` : ''}` };
  }

  receive(p: Player, m: ToServer) {
    if (m.type === 'state') this.broadcast({ type: 'state', id: p.id, bytes: m.bytes }, p);
    else if (m.type === 'ops') {
      if (m.seq <= p.acked) return;
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
      this.paintNow(() => valid.forEach((op) => ops.apply(op)));
      if (!valid.length) return;
      this.changed = true;
      const bytes = valid.length === batch.ops.length ? m.bytes : encodeOps(batch.t.filter((_, i) => keep[i]), valid, this.surfaces);
      this.broadcast({ type: 'ops', id: p.id, bytes }, p);
      this.snap?.log.push(encode({ type: 'paint', bytes }));
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
    p.was = { ip: link.ip, lived: Date.now() - link.since, at: Date.now() };
    this.broadcast({ type: 'presence', id: p.id, state: 'dropped' }, p);
    p.expires = setTimeout(() => this.remove(p, `didn't come back in ${SERVER.rejoinWindow} s`), SERVER.rejoinWindow * 1000);
  }

  /** Paint runs move on (`dt` s). */
  tick(dt: number) {
    this.paintNow(() => this.world.drips.update(dt));
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
    this.paintNow(() => {
      this.world.paint.clear();
      this.world.drips.clear();
      this.snap = null;
      for (const p of this.players.values()) p.link?.close(1012, 'wiped');
    });
  }

  /** The admin closed it: everyone is told it has ended. */
  end() {
    for (const p of this.players.values()) {
      if (p.expires) clearTimeout(p.expires);
      const link = p.link;
      p.link = null;
      link?.send(encode({ type: 'rejected', reason: 'ended' }));
      link?.close(closeCode('ended'), 'ended');
    }
    this.players.clear();
    this.finish('by the admin');
  }

  /** The paint now as a paint file (kept.ts saves it), made in turn as a welcome's is; null when there's no memory for one. */
  async paintFile() {
    const snap = this.snapshot(() => true, true);
    if (snap === 'busy') return null;
    this.changed = false;
    try {
      const frames = await snap.frames;
      return frames && joinBytes(partPieces(frames));
    } catch (e) {
      this.changed = true;
      throw e;
    }
  }

  /** For the log when it closes. */
  get summary() {
    const c = this.counts;
    return `after ${span(Date.now() - this.started)}, ${this.memory.now.toFixed(0)} MB of paint, ${this.nextId - 1} players: ${c.new} new, ${c.back} back, ${c.takeover} takeovers`;
  }

  private remove(p: Player, why: string) {
    if (this.players.get(p.id) !== p) return;
    if (p.expires) clearTimeout(p.expires);
    this.players.delete(p.id);
    if (p.inventory) this.carried.set(p.name, p.inventory);
    log(this.code, who(p), `out: ${why} (${this.players.size} players)`);
    const link = p.link;
    p.link = null;
    link?.close(1000, why);
    this.broadcast({ type: 'left', id: p.id });
    this.line.update();
    if (!this.players.size && !this.setup.stays) this.finish('no one left');
  }

  /** It's over: those waiting are told, and the lobby forgets it. */
  private finish(why: string) {
    this.line.end();
    this.onEmpty(why);
  }

  /** SAVE: the paint as a paint file, for `p`. One at a time each. */
  private async save(p: Player) {
    if (p.saving) return;
    const link = p.link;
    const snap = this.snapshot(() => p.link === link && !!link?.open, true);
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

  /**
   * A paint file for someone who wants it while `still()`: the newest one (for
   * SAVE only with nothing painted since: SAVE is the paint now), else the one
   * waiting for its turn, else a new one (none when there's no memory for it). While it reads the paint, the paint
   * holds still: what's painted meanwhile is applied after it, and its ops go
   * in the file's log.
   */
  private snapshot(still: () => boolean, save = false): Snapshot | 'busy' {
    if (this.snap && !(save && this.snap.log.length)) return this.snap.want(still);
    if (this.next) return this.next.want(still);
    if (overMemory(SERVER.snapshotMemory)) {
      log(this.code, `no memory for a paint file (${liveMemory().toFixed(0)} MB live)`);
      return 'busy';
    }
    const s = (this.next = new Snapshot().want(still));
    const gone = () => this.next === s && (this.next = null);
    s.frames.then(gone, gone);
    s.queue(async () => {
      this.next = null;
      this.snap = s;
      this.frozen = [];
      const t = performance.now();
      try {
        const { pieces, raw } = await streamPaint(this.world.paint, { name: this.levelName }, SERVER.snapshotChunk);
        const frames = partFrames(pieces, SERVER.partBytes);
        const size = frames.reduce((n, f) => n + f.length, 0);
        log(this.code, `paint file: ${mb(raw)} MB of paint, ${mb(size)} MB packed, in ${((performance.now() - t) / 1000).toFixed(1)} s (${waiting()} more in line)`);
        this.keep(s);
        return frames;
      } catch (e) {
        // Only who waited for it goes without: the next one who wants a paint file gets a new one.
        if (this.snap === s) this.snap = null;
        log(this.code, `paint file failed: ${(e as Error).message}`);
        throw e;
      } finally {
        const held = this.frozen;
        this.frozen = null;
        held!.forEach((f) => f());
      }
    });
    return s;
  }

  /** `s` is the newest paint file, for SERVER.snapshotKeep. */
  private keep(s: Snapshot) {
    this.snap = s;
    setTimeout(() => {
      if (this.snap === s) this.snap = null;
      if (s.served > 1) log(this.code, `paint file served ${s.served}`);
    }, SERVER.snapshotKeep * 1000);
  }

  /** A change to the paint now, or after the paint file that's reading it. */
  private paintNow(fn: () => void) {
    if (this.frozen) this.frozen.push(fn);
    else fn();
  }

  private send(p: Player, m: ToClient) {
    deliver(p, encode(m));
  }

  private broadcast(m: ToClient, except?: Player) {
    const f = encode(m);
    for (const p of this.players.values()) if (p !== except) deliver(p, f);
  }

}
