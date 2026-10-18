import { NET, SERVER } from '../config';
import type { PaintOp } from '../paint-ops';
import { loadPaint } from '../save/load-paint';
import { surfaceTable } from '../save/shape';
import { session } from '../session';
import { PROTOCOL, type Rejection, type ToClient, type ToServer } from './protocol';
import { diagnose, NetLog, Traffic } from './diagnostics';
import { decodeOps, encodeOps, SurfaceIndex } from '../op-wire';
import { playSessionLevel, type MultiplayerContext } from './game-context';
import { Outbox } from './outbox';
import { ServerLink } from './server-link';
import { ownerOf, Remotes } from './remotes';
import { keepTabSession, tabSession } from './tab-session';
import { capture, encodeSnapshot } from './snapshot';

// This game in a multiplayer session (server/, protocol.ts): HOST or JOIN,
// then NET.sendRate times a second this player's snapshot and the paint ops
// they made since, and their stepladder when it moves; the others come in as
// remote players. The welcome brings the session's level, PAINT DETAIL and
// paint. A dropped link is retried with the player's token for as long as the
// server keeps them (SERVER.rejoinWindow); the token is kept in sessionStorage,
// so a reload comes back too, and each tab is its own player. The server
// keeps what the player carries, and hears when the game is hidden.

/** Why the game isn't in a session: the server said so (Rejection), it never answered, it couldn't handle a message (broken), or diagnose's guess at why it can't be reached. */
export type Failure = Rejection | 'timeout' | 'broken' | Awaited<ReturnType<typeof diagnose>>['reason'];

/** What the player sees of the link, shown on the menus; `detail`: what was seen (a close code, an HTTP status, tries), for reports. */
export type NetStatus = { state: 'off' } | { state: 'connecting' } | { state: 'in'; code: string } | { state: 'reconnecting'; code: string; detail: string } | { state: 'failed'; reason: Failure; detail?: string };

const now = () => performance.now() / 1000;

export class Multiplayer {
  status: NetStatus = { state: 'off' };
  onStatus: (s: NetStatus) => void = () => {};
  /** Someone joined or left the session. */
  onPlayer: (name: string, joined: boolean) => void = () => {};
  /** What's under way, for the player to watch (UPLOADING PAINT 40%…); null when it's done. */
  onProgress: (text: string | null) => void = () => {};
  /** What happened to the link (COPY NETWORK LOG). */
  readonly log = new NetLog();
  /** The link to the server, while there's one. */
  private link: ServerLink | null = null;
  private remotes: Remotes;
  /** Who we are, once welcomed, and how to come back. */
  private joined: { code: string; token: string; name: string; you: number; levelName: string } | null = null;
  /** Messages are handled one at a time, in order (a welcome loads paint before what follows it). */
  private queue = Promise.resolve();
  private t0 = 0;
  private nextSend = 0;
  /** This player's paint ops, until the server has them. */
  private outbox = new Outbox();
  /** The session's surfaces, as paint ops name them. */
  private surfaces = new SurfaceIndex([]);
  private ladderId: number | undefined;
  /** SAVE on its way: a second SAVE meanwhile waits for the same file. */
  private saving: { promise: Promise<Uint8Array>; done: (bytes: Uint8Array) => void; fail: (e: Error) => void } | null = null;
  /** The inventory's version last sent. */
  private carried = -1;
  private retry: { until: number; wait: number; tries: number } | null = null;
  private net = new Traffic();
  /** The name we go by in the session. */
  private name = '';

  constructor(private g: MultiplayerContext) {
    this.remotes = new Remotes(g, this.log);
    document.addEventListener('visibilitychange', () => this.link?.live && this.send({ type: 'away', away: document.hidden }));
  }

  /** The other players' names, by id. */
  get names() {
    return this.remotes.names;
  }

  /** Where the other players shown stand (a stepladder can't go there). */
  get shown() {
    return this.remotes.shown;
  }

  /** In a session: everyone in it, us first, with their paint colors (null: not known yet). */
  get players() {
    return this.joined ? [{ name: this.name, color: this.g.inventory.color }, ...this.remotes.roster] : [];
  }

  /** The last round trip to the server (s), null before the first. */
  get ping() {
    return this.net.ping;
  }

  /** Start a session on this level at this PAINT DETAIL, from a paint save or clean. */
  host(name: string, detail: number, save?: Uint8Array) {
    const { data, name: levelName } = this.g.levelData();
    this.connect({ type: 'host', protocol: PROTOCOL, table: surfaceTable(this.g.paint.surfaces), name, levelName, level: data, detail, bytes: save });
  }

  join(name: string, code: string) {
    this.connect({ type: 'join', protocol: PROTOCOL, name, code });
  }

  /** Back into the session this tab was in before a reload, if the server may still have it. */
  resume() {
    const s = tabSession();
    if (s) this.connect({ type: 'join', protocol: PROTOCOL, name: s.name, code: s.code, token: s.token });
  }

  /** SAVE in a session: the session's paint, as a file the server makes. One request at a time. */
  savePaint() {
    if (!this.saving) {
      let done!: (bytes: Uint8Array) => void, fail!: (e: Error) => void;
      const promise = new Promise<Uint8Array>((ok, no) => ((done = ok), (fail = no)));
      this.saving = { promise, done, fail };
      this.onProgress('Saving paint…');
      this.send({ type: 'save' });
    }
    return this.saving.promise;
  }

  /** The SAVE on its way gets its file, or fails with `error`. */
  private saved(bytes: Uint8Array | null, error = 'The server is busy: save again later') {
    if (bytes) this.saving?.done(bytes);
    else this.saving?.fail(new Error(error));
    this.saving = null;
  }

  leave() {
    this.log.add('LEAVE SESSION');
    this.send({ type: 'leave' });
    this.end({ state: 'off' });
  }

  /** Once a frame: send this player's state and paint, show the others. */
  update(dt: number) {
    const t = now();
    this.remotes.update(this.g.camera, t, dt);
    const link = this.link;
    if (!this.joined || !link?.live || !link.open) return;
    if (t - link.lastHeard > NET.serverSilence) {
      this.log.add(`nothing from the server for ${NET.serverSilence} s: closing to reconnect`);
      return link.close();
    }
    if (this.net.measure(t)) this.send({ type: 'ping', t });
    const at = t - this.t0;
    this.outbox.take(this.g.paint.log!, at);
    const id = this.g.level.runtimeOf(session.player);
    if (id !== this.ladderId) {
      this.ladderId = id;
      const p = id === undefined ? undefined : this.g.level.props.get(id);
      this.send({ type: 'ladder', t: at, data: p ? { type: p.type, pos: [...p.pos], rot: p.rot } : null });
    }
    if (this.g.inventory.version !== this.carried) {
      this.carried = this.g.inventory.version;
      this.send({ type: 'inventory', data: this.g.inventory.toJSON() });
    }
    if (t < this.nextSend) return;
    this.nextSend = Math.max(this.nextSend + 1 / NET.sendRate, t);
    this.send({ type: 'state', bytes: encodeSnapshot(capture(at, this.g.player, this.g.inventory, this.g.tools)) });
    const ops = this.outbox.batch();
    if (ops) this.sendOps(ops);
  }

  private connect(hello: Extract<ToServer, { type: 'host' | 'join' }>) {
    this.link?.abandon();
    this.name = hello.name;
    // HOST goes where the server takes big messages (a save), a few at a time.
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${hello.type === 'host' ? '?host' : ''}`;
    this.log.add(`connecting to ${url}: ${hello.type === 'host' ? `HOST at ${hello.detail} texels/m${hello.bytes ? ` with ${(hello.bytes.length / 1024).toFixed(0)} KB of paint` : ''}` : `JOIN ${hello.code}${hello.token ? ' (coming back)' : ''}`}`);
    if (!this.joined) this.setStatus({ state: 'connecting' });
    // A message this game can't handle (a bug, a paint file it can't load) ends the session for it, with the error in the log.
    const handle = (m: ToClient, arrived: number, file?: Uint8Array) =>
      (this.queue = this.queue.then(() => this.receive(m, arrived, link, file)).catch((err) => {
        console.error(err);
        this.log.add(`couldn't handle ${m.type}: ${err}`);
        this.send({ type: 'leave' });
        this.end({ state: 'failed', reason: 'broken' });
      }));
    const link: ServerLink = (this.link = new ServerLink(
      hello,
      {
        message: handle,
        progress: (text) => this.onProgress(text),
        log: (line) => this.log.add(line),
        traffic: (up, down) => ((this.net.up += up), (this.net.down += down)),
        closed: (code, timedOut) => {
          if (this.link === link) this.link = null;
          if (timedOut && !this.joined) return this.end({ state: 'failed', reason: 'timeout', detail: `NO ANSWER IN ${NET.connectTimeout} S` });
          this.dropped(code);
        },
      },
      { url, open: (u) => new WebSocket(u), now, every: (tick, ms) => ((id) => () => clearInterval(id))(setInterval(tick, ms)) },
    ));
  }

  /**
   * The link closed (WebSocket close code `code`): while the server keeps us,
   * try again with our token; never welcomed, give up. Either way, ask the
   * server over HTTP what's wrong (diagnostics.ts), for the message.
   */
  private dropped(code: number) {
    const j = this.joined;
    const why = diagnose().then((d) => (this.log.add(`asked the server over HTTP: ${d.reason} (${d.detail})`), d));
    if (!j) {
      void why.then((d) => !this.link && !this.joined && this.end({ state: 'failed', reason: d.reason, detail: `${d.detail} · WS ${code}` }));
      return;
    }
    if (this.status.state !== 'reconnecting') this.retry = { until: now() + SERVER.rejoinWindow, wait: NET.retryFirst, tries: 0 };
    const r = this.retry!;
    if (now() > r.until) return this.end({ state: 'failed', reason: 'ended', detail: `NO WAY BACK IN ${SERVER.rejoinWindow} S` });
    r.tries++;
    this.setStatus({ state: 'reconnecting', code: j.code, detail: `WS ${code} · TRY ${r.tries}` });
    void why.then((d) => this.status.state === 'reconnecting' && this.joined === j && this.setStatus({ state: 'reconnecting', code: j.code, detail: `${d.detail} · WS ${code} · TRY ${r.tries}` }));
    this.log.add(`trying again in ${r.wait} s (try ${r.tries})`);
    setTimeout(() => this.joined === j && !this.link && this.connect({ type: 'join', protocol: PROTOCOL, name: j.name, code: j.code, token: j.token }), r.wait * 1000);
    r.wait = Math.min(r.wait * 2, NET.retryMost);
  }

  /** `arrived`: when it came (local s); `link`: the link it came on; `file`: the paint file of a welcome or a save. */
  private async receive(m: ToClient, arrived: number, link: ServerLink, file?: Uint8Array) {
    if (m.type === 'welcome') return this.welcome(m, link, file!);
    if (m.type === 'rejected') {
      this.log.add(`turned away by the server: ${m.reason}`);
      // A session that's gone (the server restarted) while we were coming back: it ended.
      const ended = this.joined && m.reason === 'no-session';
      return this.end({ state: 'failed', reason: ended ? 'ended' : m.reason });
    }
    if (!this.joined) return;
    if (m.type === 'state') this.remotes.get(m.id)?.receive(m.bytes, arrived);
    else if (m.type === 'ops') {
      const r = this.remotes.get(m.id);
      const b = decodeOps(m.bytes, this.surfaces);
      b?.ops.forEach((op, i) => r?.receiveOp(b.t[i], op));
    } else if (m.type === 'ladder') this.remotes.get(m.id)?.receiveLadder(m.t, m.data);
    else if (m.type === 'paint') decodeOps(m.bytes, this.surfaces)?.ops.forEach((op) => this.g.paintOps.apply(op));
    else if (m.type === 'joined') {
      this.remotes.add(m.id, m.name, 'here', arrived);
      this.onPlayer(m.name, true);
    } else if (m.type === 'presence') this.remotes.presence(m.id, m.state);
    else if (m.type === 'left') {
      const name = this.names.get(m.id);
      this.remotes.remove(m.id, true);
      if (name !== undefined) this.onPlayer(name, false);
    }
    else if (m.type === 'save') {
      this.onProgress(null);
      this.saved(file ?? null);
    }
    else if (m.type === 'pong') {
      this.net.ping = now() - m.t;
      this.outbox.acked(m.acked);
    }
  }

  private async welcome(w: Extract<ToClient, { type: 'welcome' }>, link: ServerLink, file: Uint8Array) {
    const g = this.g;
    if (this.joined?.code !== w.code) {
      if (!playSessionLevel(g, w)) {
        this.send({ type: 'leave' });
        return this.end({ state: 'failed', reason: 'version' });
      }
      // As the server's: the level as it opens, before anyone's stepladder is in it.
      this.surfaces = new SurfaceIndex([...g.paint.surfaces].map((s) => s.key));
      this.t0 = now();
      // Back in this session from a new page: what we carried here before (a reconnect keeps its own).
      if (w.inventory) {
        g.inventory.restore(w.inventory);
        g.pickups.collectOwned(g.inventory);
      }
    }
    const back = this.joined?.code === w.code;
    this.onProgress('Loading paint…');
    // The session's paint replaces ours: what the server doesn't have yet is painted again on top (and sent again, below).
    const loading = now();
    await loadPaint(g.paint, g.drips, file, { name: w.levelName });
    this.log.add(`paint loaded in ${Math.round((now() - loading) * 1000)} ms`);
    if (back) this.outbox.take(g.paint.log ?? [], now() - this.t0);
    else this.outbox.clear();
    const resend = back ? this.outbox.rejoined(w.acked, (op) => g.paintOps.apply(op)) : [];
    const name = this.name;
    this.log.add(`in session ${w.code} as #${w.you}, at ${w.detail} texels/m, with ${w.players.length} others, ${(file.length / 1024).toFixed(0)} KB of paint`);
    this.joined = { code: w.code, token: w.token, name, you: w.you, levelName: w.levelName };
    keepTabSession({ code: w.code, token: w.token, name });
    session.multiplayer = true;
    session.player = ownerOf(w.you);
    this.remotes.clear();
    for (const p of w.players) this.remotes.add(p.id, p.name, p.state, now());
    for (const l of w.ladders) g.level.setRuntime(ownerOf(l.id), l.data);
    g.paint.log = [];
    this.ladderId = g.level.runtimeOf(session.player);
    this.nextSend = 0;
    this.net = new Traffic();
    // Its welcome has come: it sends, and a silence on it means it's dead. That link only: a newer one (this one dropped
    // while the paint loaded) waits for its own welcome, or gives up after NET.connectTimeout (BL-088).
    Object.assign(link, { live: true, lastHeard: now() });
    this.carried = -1;
    for (const b of resend) this.sendOps(b);
    if (document.hidden) this.send({ type: 'away', away: true });
    this.onProgress(null);
    this.setStatus({ state: 'in', code: w.code });
  }

  /** Out of the session: single player again, keeping the paint (SAVE PAINT still has it). */
  private end(status: NetStatus) {
    this.link?.abandon();
    this.link = null;
    this.onProgress(null);
    if (this.joined) {
      this.remotes.clear();
      this.g.level.setRuntime(session.player, null);
      this.g.paint.log = null;
      this.g.lockDetail(null);
      session.multiplayer = false;
      session.player = 'local';
      this.joined = null;
    }
    keepTabSession(null);
    this.setStatus(status);
  }

  /**
   * The link for the HUD's performance lines, in a session: round trip to the
   * server, traffic each way, and for each other player how far behind they're
   * shown and the jitter of their snapshots (remote-player.ts).
   */
  get stats() {
    if (!this.joined) return null;
    const n = this.net;
    return { reconnecting: this.status.state === 'reconnecting', ping: n.ping, up: n.upRate, down: n.downRate, players: this.remotes.stats };
  }

  private send(m: ToServer) {
    this.link?.send(m);
  }

  private sendOps(b: { seq: number; t: number[]; ops: PaintOp[] }) {
    this.send({ type: 'ops', seq: b.seq, bytes: encodeOps(b.t, b.ops, this.surfaces) });
  }

  private setStatus(s: NetStatus) {
    // Out of the session (or reconnecting) before the server sent its paint.
    if (s.state !== 'in' && this.saving) this.saved(null, 'The link dropped before the paint came: save again');
    if (s.state === 'failed' || s.state === 'off') this.log.add(`status: ${s.state}${s.state === 'failed' ? ` ${s.reason}${s.detail ? ` (${s.detail})` : ''}` : ''}`);
    this.status = s;
    this.onStatus(s);
  }
}
