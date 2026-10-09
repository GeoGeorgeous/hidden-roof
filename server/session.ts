import { randomUUID } from 'node:crypto';
import { PAINT, SERVER } from '../src/config';
import type { LevelData, PropData } from '../src/level/level';
import { cleanName, closeCode, encode, NAME_MAX, partFrames, type Rejection, type ToClient, type ToServer } from '../src/net/protocol';
import { loadPaint } from '../src/save/load-paint';
import { streamPaint } from '../src/save/save-paint';
import { surfaceTable } from '../src/save/shape';
import { liveMemory, log, mb, span, who } from './log';
import { Snapshot, waiting } from './snapshot';
import { sessionPaint } from './world';

// One live session: its level, PAINT DETAIL and paint, and its players. It
// paints every op it relays, so a joiner (or a player coming back) gets the
// paint as one paint file in its welcome (snapshot.ts). A dropped player has
// SERVER.rejoinWindow to come back with their token; after that they and their
// stepladder go, and the session closes when no one is left. Nothing is
// stored: a restart ends every session.

/** A player's socket. */
export interface Link {
  send(frame: Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly open: boolean;
  /** Where it's from, and when it opened (ms), for the log. */
  readonly ip: string;
  readonly since: number;
}

export interface Player {
  id: number;
  name: string;
  /** Lets them come back as themselves (welcome hands it out). */
  token: string;
  link: Link | null;
  /** Their welcome has gone out on `link`: frames reach them. Until then what happens is in the welcome or after it. */
  live: boolean;
  /** A SAVE of theirs is under way. */
  saving: boolean;
  ladder: PropData | null;
  expires: ReturnType<typeof setTimeout> | null;
  /** Their last link that closed: from where, how long it lived, when (ms), for the log. */
  was: { ip: string; lived: number; at: number } | null;
}

type How = 'new' | 'back' | 'takeover';

export class Session {
  readonly players = new Map<number, Player>();
  readonly table: string;
  private world: ReturnType<typeof sessionPaint>;
  private nextId = 1;
  private readonly started = Date.now();
  private counts: Record<How, number> = { new: 0, back: 0, takeover: 0 };
  /** The newest paint file whose paint has been read (made or being made), while it's kept; and one waiting for its turn. */
  private snap: Snapshot | null = null;
  private next: Snapshot | null = null;
  /** Paint changes held back while a paint file reads the paint (null: none is), in order. */
  private frozen: (() => void)[] | null = null;

  constructor(
    readonly code: string,
    readonly levelName: string,
    readonly level: LevelData,
    /** PAINT DETAIL, texels per meter, picked by the host. */
    readonly detail: number,
    private onEmpty: () => void,
  ) {
    this.world = this.at(() => sessionPaint(level));
    this.table = surfaceTable(this.world.paint.surfaces);
  }

  /** Start from a paint save (HOST). Throws with a message if it's no good or doesn't fit the level. */
  async load(save: Uint8Array) {
    // At most this level all painted, at the highest detail (a save may be made at any), with each face's ring.
    const most = this.memory.full * 2 ** 20 * (96 / this.detail) ** 2 * 1.25;
    await loadPaint(this.world.paint, this.world.drips, save, { name: this.levelName }, most);
    // The save is the paint now, as the players load it (the same faces fit, resampled the same way): the host's welcome.
    this.keep(new Snapshot(partFrames([save], SERVER.partBytes)));
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
    name = cleanName(name);
    let p = token ? all.find((q) => q.token === token) : undefined;
    const how = p ? 'back' : (p = all.find((q) => !q.link && q.name === name)) ? 'takeover' : 'new';
    if (!p && this.players.size >= SERVER.maxPlayers) return 'full';
    const id = p?.id;
    // Not one with ops of their own since (a duplicated tab): the game takes no ops from itself.
    const snap = this.snapshot((s) => id === undefined || !s.senders.has(id), () => p?.link === link && link.open);
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
    } else {
      p = { id: this.nextId++, name: uniqueName(name, all), token: randomUUID(), link, live: false, saving: false, ladder: null, expires: null, was: null };
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
    const others = [...this.players.values()].filter((q) => q !== p);
    const ladders = [...this.players.values()].filter((q) => q.ladder).map((q) => ({ id: q.id, data: q.ladder! }));
    link.send(encode({ type: 'welcome', code: this.code, you: p.id, token: p.token, levelName: this.levelName, level: this.level, detail: this.detail, table: this.table, players: others.map(({ id, name }) => ({ id, name })), ladders, parts: frames.length }));
    for (const f of frames) link.send(f);
    for (const f of snap.log) link.send(f);
    p.live = true;
    snap.served++;
    return { p, how, note: `${note}${snap.served > 1 ? `; paint file shared (${snap.served})` : ''}` };
  }

  receive(p: Player, m: ToServer) {
    if (m.type === 'state') this.broadcast({ type: 'state', id: p.id, bytes: m.bytes }, p);
    else if (m.type === 'ops') {
      // Ops on surfaces this level doesn't have are dropped.
      const { paint, ops } = this.world;
      const keep = m.ops.map((op) => op.rect < (paint.find(op.key)?.geo.rects.length ?? 0));
      const t = m.t.filter((_, i) => keep[i]);
      const valid = m.ops.filter((_, i) => keep[i]);
      this.paintNow(() => valid.forEach((op) => ops.apply(op)));
      if (valid.length) this.snap?.relayed(this.broadcast({ type: 'ops', id: p.id, t, ops: valid }, p), p.id);
    } else if (m.type === 'ladder') {
      p.ladder = m.data;
      this.broadcast({ type: 'ladder', id: p.id, t: m.t, data: m.data }, p);
    } else if (m.type === 'save') void this.save(p);
    else if (m.type === 'ping') this.send(p, { type: 'pong', t: m.t });
    else if (m.type === 'leave') this.remove(p, 'left');
  }

  /** Their link closed: they have SERVER.rejoinWindow to come back. */
  dropped(p: Player, link: Link) {
    if (p.link !== link) return;
    p.link = null;
    p.live = false;
    p.was = { ip: link.ip, lived: Date.now() - link.since, at: Date.now() };
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
  }

  /** Ends it with no one in it (its host was turned away). */
  close() {
    if (!this.players.size) this.onEmpty();
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
    log(this.code, who(p), `out: ${why} (${this.players.size} players)`);
    const link = p.link;
    p.link = null;
    link?.close(1000, why);
    this.broadcast({ type: 'left', id: p.id });
    if (!this.players.size) this.onEmpty();
  }

  /** SAVE: the paint as a paint file, for `p`. One at a time each. */
  private async save(p: Player) {
    if (p.saving) return;
    const link = p.link;
    // Not one with paint since: SAVE is the paint now.
    const snap = this.snapshot((s) => !s.log.length, () => p.link === link && !!link?.open);
    if (snap === 'busy') return this.send(p, { type: 'save', parts: 0 });
    p.saving = true;
    try {
      const frames = await snap.frames;
      if (!frames || p.link !== link) return;
      this.send(p, { type: 'save', parts: frames.length });
      for (const f of frames) deliver(p, f);
      snap.served++;
    } finally {
      p.saving = false;
    }
  }

  /**
   * A paint file that `fits`, for someone who wants it while `still()`: the
   * newest one if it does, else the one waiting for its turn, else a new one
   * (none when there's no memory for it). While it reads the paint, the paint
   * holds still: what's painted meanwhile is applied after it, and its ops go
   * in the file's log.
   */
  private snapshot(fits: (s: Snapshot) => boolean, still: () => boolean): Snapshot | 'busy' {
    if (this.snap && fits(this.snap)) return this.snap.want(still);
    if (this.next) return this.next.want(still);
    if (liveMemory() > SERVER.snapshotMemory) {
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
        const { pieces, raw } = await this.at(() => streamPaint(this.world.paint, { name: this.levelName }, SERVER.snapshotChunk));
        const frames = partFrames(pieces, SERVER.partBytes);
        const size = frames.reduce((n, f) => n + f.length, 0);
        log(this.code, `paint file: ${mb(raw)} MB of paint, ${mb(size)} MB packed, in ${((performance.now() - t) / 1000).toFixed(1)} s (${waiting()} more in line)`);
        this.keep(s);
        return frames;
      } finally {
        const held = this.frozen;
        this.frozen = null;
        this.at(() => held!.forEach((f) => f()));
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
    else this.at(fn);
  }

  private send(p: Player, m: ToClient) {
    deliver(p, encode(m));
  }

  private broadcast(m: ToClient, except?: Player) {
    const f = encode(m);
    for (const p of this.players.values()) if (p !== except) deliver(p, f);
    return f;
  }

  /** Runs `fn` at this session's PAINT DETAIL: PAINT.texelsPerMeter is global, and sessions may differ. */
  private at<T>(fn: () => T): T {
    PAINT.texelsPerMeter = this.detail;
    return fn();
  }
}

function deliver(p: Player, f: Uint8Array) {
  if (p.live) p.link?.send(f);
}

/** `name`, or with the lowest number free when another player has it: "geo (2)". */
function uniqueName(name: string, players: Player[]) {
  const taken = new Set(players.map((p) => p.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const tag = ` (${n})`;
    const s = Array.from(name).slice(0, NAME_MAX - tag.length).join('') + tag;
    if (!taken.has(s)) return s;
  }
}
