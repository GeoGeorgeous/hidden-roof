import { NET, SERVER } from '../config';
import { msg } from '../messages';
import type { PaintOp } from '../paint-ops';
import { loadPaint } from '../save/load-paint';
import { surfaceTable } from '../save/shape';
import { session } from '../session';
import { cleanName, PROTOCOL, rejectionOf, type Rejection, type ToClient, type ToServer } from './protocol';
import { diagnose, NetLog, Traffic } from './diagnostics';
import { decodeOps, encodeOps, SurfaceIndex } from '../op-wire';
import { playSessionLevel, type MultiplayerContext } from './game-context';
import { keepSolo, SoloReturn, type Solo } from './solo';
import { LinkHealth, type LinkStatus } from './link-health';
import { Outbox } from './outbox';
import { SaveRequest } from './save-request';
import { Sender } from './sender';
import { ServerLink } from './server-link';
import { OwnStatus } from './own-status';
import { ownerOf, Remotes } from './remotes';
import { keepTabSession, tabSession } from './tab-session';
import { capture, encodeSnapshot } from './snapshot';

// This game in a multiplayer session (server/, protocol.ts): HOST or JOIN,
// then what this player sends (sender.ts: NET.sendRate times a second their
// snapshot and the paint ops they made since, their stepladder when it moves)
// goes to the server; the others come in as remote players. The welcome brings the session's level, PAINT DETAIL and
// paint. A dropped link is retried with the player's token for as long as the
// server keeps them (SERVER.rejoinWindow); the token is kept in sessionStorage,
// so a reload comes back too, and each tab is its own player. The server
// keeps what the player carries, and hears what they're doing (own-status.ts).

/** Why the game isn't in a session: the server said so (Rejection), it never answered, it couldn't handle a message (broken), the time to rejoin ran out (expired), the server came back without the session (restarted: it said `no-session` to a rejoin), or diagnose's guess at why it can't be reached. */
export type Failure = Rejection | 'timeout' | 'broken' | 'expired' | 'restarted' | Awaited<ReturnType<typeof diagnose>>['reason'];

/** What the player sees of the link, shown on the menus; `detail`: what was seen (a close code, an HTTP status, tries), for reports. */
export type NetStatus = { state: 'off' } | { state: 'connecting' } | { state: 'in'; code: string } | { state: 'reconnecting'; code: string; detail: string; tries: number } | { state: 'failed'; reason: Failure; detail?: string; code?: string };

const now = () => performance.now() / 1000;
/** The rejections that are a server's trouble of the moment, not an answer: a player coming back tries again for as long as the server keeps them. */
const refusedForNow = (r?: Rejection) => (r === 'busy' || r === 'too-many' ? r : undefined);

export class Multiplayer {
  status: NetStatus = { state: 'off' };
  onStatus: (s: NetStatus) => void = () => {};
  /** Someone joined or left the session. */
  onPlayer: (name: string, joined: boolean) => void = () => {};
  /** The session is over and the player's own level and paint are back (solo.ts): the menu shows its title view. */
  onEnd: () => void = () => {};
  /** The link's state worth telling the player (slow, quiet), or null; called when it changes, while in a session. */
  onHealth: (h: LinkStatus | null) => void = () => {};
  /** What's under way, for the player to watch (UPLOADING PAINT 40%…); null when it's done. */
  onProgress: (text: string | null) => void = () => {};
  /** What happened to the link (COPY NETWORK LOG). */
  readonly log = new NetLog();
  /** The link to the server, while there's one. */
  private link: ServerLink | null = null;
  private remotes: Remotes;
  /** Who we are, once welcomed, and how to come back. */
  private joined: { code: string; token: string; name: string; asked: string; you: number; levelName: string } | null = null;
  /** Messages are handled one at a time, in order (a welcome loads paint before what follows it). */
  private queue = Promise.resolve();
  private t0 = 0;
  /** What this player sends, and owns paint.log. */
  private sender: Sender;
  /** This player's paint ops, until the server has them. */
  private outbox = new Outbox();
  /** The session's surfaces, as paint ops name them. */
  private surfaces = new SurfaceIndex([]);
  private saving = new SaveRequest();
  private retry: { until: number; wait: number; tries: number } | null = null;
  private net = new Traffic();
  /** The name the player typed, sent in every join of this session (the welcome's name may be numbered). */
  private asked = '';
  /** The player's own level and paint, from before the session's welcome replaced them until it ends. */
  private solo: Solo | null = null;
  /** Gets the player's own level and paint back when the session ends (HOST and JOIN wait for it). */
  private tail: SoloReturn;
  /** Counts the sessions ended: a HOST or JOIN waiting for the restore is dropped by LEAVE. */
  private attempt = 0;
  private health = new LinkHealth();
  /** What this player is doing, for the others. */
  private own: OwnStatus;
  /** Tries the link again now, instead of when the wait is over (the browser came back online). */
  private retryNow: (() => void) | null = null;

  constructor(private g: MultiplayerContext) {
    this.remotes = new Remotes(g, this.log);
    this.tail = new SoloReturn(g, {
      enqueue: (job) => (this.queue = this.queue.then(job).catch(console.error)),
      log: (line) => this.log.add(line),
      attempt: () => this.attempt,
      connecting: () => this.status.state === 'connecting',
      onEnd: () => this.onEnd(),
    });
    this.sender = new Sender({ capture: (at) => encodeSnapshot(capture(at, g.player, g.inventory, g.tools)), paint: g.paint, level: g.level, owner: () => session.player, inventory: g.inventory });
    addEventListener('online', () => this.status.state === 'reconnecting' && this.retryNow?.());
    this.own = new OwnStatus(g, (status) => this.send({ type: 'status', status }), () => Boolean(this.link?.live), () => this.health.troubled);
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
    return this.joined ? [{ name: this.joined.name, color: this.g.inventory.color }, ...this.remotes.roster] : [];
  }

  /** The last round trip to the server (s), null before the first. */
  get ping() {
    return this.net.ping;
  }

  /** Start a session on this level at this PAINT DETAIL, from a paint save or clean. */
  host(name: string, detail: number, save?: Uint8Array) {
    this.afterRestore(() => {
      const { data, name: levelName } = this.g.levelData();
      this.connect({ type: 'host', protocol: PROTOCOL, table: surfaceTable(this.g.paint.surfaces), name, levelName, level: data, detail, bytes: save });
    });
  }

  join(name: string, code: string) {
    this.afterRestore(() => this.connect({ type: 'join', protocol: PROTOCOL, name, code }));
  }

  /** `start` once the player's own level is back from the last session (it reads the level), unless the session was left meanwhile; connecting is shown at once. */
  private afterRestore(start: () => void) {
    // Starting another session is a choice to leave without saving.
    void this.resolveLoss(false);
    const attempt = this.attempt;
    if (!this.joined) this.setStatus({ state: 'connecting' });
    void this.tail.restoring.then(() => attempt === this.attempt && start());
  }

  /** Back into the session this tab was in before a reload, if the server may still have it. */
  resume() {
    const s = tabSession();
    if (s) this.connect({ type: 'join', protocol: PROTOCOL, name: cleanName(s.asked ?? s.name), code: s.code, token: s.token });
  }

  /** SAVE in a session: the session's paint, as a file the server makes. One request at a time; none while the link is down (nothing would answer it). */
  savePaint() {
    if (!this.saving.active && !this.link?.live) return Promise.reject(new Error(msg('menu.saveReconnecting')));
    return this.saving.request(() => (this.onProgress(msg('menu.progressSaving')), this.send({ type: 'save' })));
  }

  /** Resolves once the player's own paint is back. */
  leave() {
    this.log.add('LEAVE SESSION');
    this.send({ type: 'leave' });
    this.end({ state: 'off' });
    return this.tail.restoring;
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
    this.own.update(t);
    if (this.health.due(t)) this.health.report({ t, ping: this.net.ping, silence: t - link.lastHeard }, this.onHealth);
    if (this.net.measure(t)) this.send({ type: 'ping', t });
    const at = t - this.t0;
    const out = this.sender.update(t, at);
    this.outbox.take(out.ops, at);
    out.messages.forEach((m) => this.send(m));
    const ops = out.tick && this.outbox.batch();
    if (ops) this.sendOps(ops);
  }

  private connect(hello: Extract<ToServer, { type: 'host' | 'join' }>) {
    this.link?.abandon();
    this.asked = hello.name;
    // HOST goes where the server takes big messages (a save), a few at a time.
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${hello.type === 'host' ? '?host' : ''}`;
    this.log.add(`connecting to ${url}: ${hello.type === 'host' ? `HOST at ${hello.detail} texels/m${hello.bytes ? ` with ${(hello.bytes.length / 1024).toFixed(0)} KB of paint` : ''}` : `JOIN ${hello.code}${hello.token ? ' (coming back)' : ''}`}`);
    if (!this.joined && this.status.state !== 'connecting') this.setStatus({ state: 'connecting' });
    // A message this game can't handle (a bug, a paint file it can't load) ends the session for it, with the error in the log.
    const handle = (m: ToClient, arrived: number, file?: Uint8Array) =>
      (this.queue = this.queue.then(() => this.receive(m, arrived, link, file)).catch((err) => {
        console.error(err);
        this.log.add(`couldn't handle ${m.type}: ${err}`);
        this.send({ type: 'leave' });
        this.end({ state: 'failed', reason: 'broken', detail: err instanceof Error ? err.message : String(err) });
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
          if (timedOut && !this.joined) return this.end({ state: 'failed', reason: 'timeout', detail: msg('menu.detailNoAnswer', { seconds: NET.connectTimeout }) });
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
      void why.then((d) => !this.link && !this.joined && this.end({ state: 'failed', reason: d.reason, detail: `${d.detail} · ${msg('menu.detailWs', { code })}` }));
      return;
    }
    if (this.status.state !== 'reconnecting') this.retry = { until: now() + SERVER.rejoinWindow, wait: NET.retryFirst, tries: 0 };
    const r = this.retry!;
    // A server too busy to take us back (busy, too-many) is a failed try like a dropped link; once the window is over that is what the player is told.
    const busy = refusedForNow(rejectionOf(code));
    if (now() > r.until) return this.end({ state: 'failed', reason: busy ?? 'expired', detail: msg('menu.detailNoWayBack', { seconds: SERVER.rejoinWindow }) });
    r.tries++;
    this.setStatus({ state: 'reconnecting', code: j.code, detail: msg('menu.detailTry', { code, n: r.tries }), tries: r.tries });
    void why.then((d) => this.status.state === 'reconnecting' && this.joined === j && this.setStatus({ state: 'reconnecting', code: j.code, detail: `${d.detail} · ${msg('menu.detailTry', { code, n: r.tries })}`, tries: r.tries }));
    this.log.add(`trying again in ${r.wait} s (try ${r.tries})`);
    // After the wait, or at once when the browser says it is back online.
    const timer = setTimeout(() => this.retryNow?.(), r.wait * 1000);
    this.retryNow = () => {
      clearTimeout(timer);
      this.retryNow = null;
      if (this.joined === j && !this.link) this.connect({ type: 'join', protocol: PROTOCOL, name: j.asked, code: j.code, token: j.token });
    };
    r.wait = Math.min(r.wait * 2, NET.retryMost);
  }

  /** `arrived`: when it came (local s); `link`: the link it came on; `file`: the paint file of a welcome or a save. */
  private async receive(m: ToClient, arrived: number, link: ServerLink, file?: Uint8Array) {
    if (m.type === 'welcome') return this.welcome(m, link, file!);
    if (m.type === 'rejected') {
      this.log.add(`turned away by the server: ${m.reason}`);
      // Coming back, too busy a server isn't the end: its close (this message is followed by one) is a failed try (dropped).
      if (this.joined && refusedForNow(m.reason)) return;
      // A session that's gone while we were coming back is the server's restart: it has none of its sessions.
      return this.end({ state: 'failed', reason: this.joined && m.reason === 'no-session' ? 'restarted' : m.reason });
    }
    if (!this.joined) return;
    if (m.type === 'state' || m.type === 'ops' || m.type === 'ladder') this.remotes.get(m.id)?.deliver(m, this.surfaces, arrived);
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
      this.saving.settle(file ?? null, msg('menu.saveBusy'));
    }
    else if (m.type === 'pong') {
      this.net.ping = now() - m.t;
      this.outbox.acked(m.acked);
    }
  }

  private async welcome(w: Extract<ToClient, { type: 'welcome' }>, link: ServerLink, file: Uint8Array) {
    // LEAVE, or the link dropped, before it was handled (it waited behind other messages): nothing to open or lock.
    if (this.link !== link) return this.log.add('welcome dropped: its link is gone');
    const g = this.g;
    if (this.joined?.code !== w.code) {
      // Their own level and paint come back when the session ends: kept before the session's replaces them.
      if (!this.solo) {
        const solo = await keepSolo(g, (line) => this.log.add(line));
        if (this.link !== link) return this.log.add('welcome dropped: its link is gone');
        this.solo = solo;
      }
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
    this.onProgress(msg('menu.progressLoading'));
    // The session's paint replaces ours: what the server doesn't have yet is painted again on top (and sent again, below).
    const loading = now();
    await loadPaint(g.paint, g.drips, file, { name: w.levelName });
    this.log.add(`paint loaded in ${Math.round((now() - loading) * 1000)} ms`);
    // LEAVE, or the link dropped, while it loaded: this welcome is over (a retry gets its own).
    if (this.link !== link) return this.log.add('welcome dropped: its link is gone');
    if (back) this.outbox.take(this.sender.take(), now() - this.t0);
    else this.outbox.clear(w.acked);
    const resend = back ? this.outbox.rejoined(w.acked, (op) => g.paintOps.apply(op)) : [];
    // The session may have numbered it ("geo (2)" when geo was taken): the player goes by that, but every join sends what they typed (a numbered name is not one a player can type).
    const name = w.name;
    const asked = this.asked;
    this.log.add(`in session ${w.code} as #${w.you}, at ${w.detail} texels/m, with ${w.players.length} others, ${(file.length / 1024).toFixed(0)} KB of paint`);
    this.joined = { code: w.code, token: w.token, name, asked, you: w.you, levelName: w.levelName };
    keepTabSession({ code: w.code, token: w.token, name, asked });
    session.multiplayer = true;
    session.player = ownerOf(w.you);
    this.remotes.clear();
    for (const p of w.players) this.remotes.add(p.id, p.name, p.state, now());
    for (const l of w.ladders) g.level.setRuntime(ownerOf(l.id), l.data);
    // The session's log counts: a ghost recording (F3) that had it is left without paint ops.
    this.sender.begin(true);
    this.sender.restart(g.level.runtimeOf(session.player));
    this.net = new Traffic();
    // Its welcome has come: it sends, and a silence on it means it's dead.
    Object.assign(link, { live: true, lastHeard: now() });
    for (const b of resend) this.sendOps(b);
    this.own.restart(now());
    this.onProgress(null);
    this.setStatus({ state: 'in', code: w.code });
  }

  /** Out of the session: single player again, with the paint the player had before it (SAVE has the session's). A session lost for good while playing waits for the dialog's answer first (solo.ts). */
  private end(status: NetStatus) {
    // A failure after the welcome says which session it cost the player (a failed JOIN or HOST has none).
    if (status.state === 'failed' && this.joined) status = { ...status, code: this.joined.code };
    this.attempt++;
    this.link?.abandon();
    this.link = null;
    this.onProgress(null);
    // A welcome locks it before the player is in (its paint still loading): unlocked whatever the stage.
    this.g.lockDetail(null);
    const was = this.joined;
    if (was) {
      this.remotes.clear();
      this.g.level.setRuntime(session.player, null);
      this.sender.end();
      session.multiplayer = false;
      session.player = 'local';
      this.joined = null;
    }
    keepTabSession(null);
    this.setStatus(status);
    const solo = this.solo;
    this.solo = null;
    if (!solo) return;
    this.tail.end(solo, was && status.state === 'failed' ? was.levelName : undefined);
  }

  /** The answer to the lost session's dialog (solo.ts). */
  resolveLoss = (save: boolean) => this.tail.answer(save);

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
    if (s.state !== 'in' && this.saving.active) this.saving.settle(null, msg('menu.saveDropped'));
    if (s.state === 'failed' || s.state === 'off') this.log.add(`status: ${s.state}${s.state === 'failed' ? ` ${s.reason}${s.detail ? ` (${s.detail})` : ''}` : ''}`);
    // From JOIN or HOST until the welcome's paint has loaded the game can't be played (a reconnect, or a welcome for the session we are in, doesn't count).
    session.joining = s.state === 'connecting';
    this.status = s;
    // The status of a slow link starts over with the link; the status handler owns the status from here.
    if (s.state !== 'in') this.health.reset();
    this.onStatus(s);
  }
}
