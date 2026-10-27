import { NET } from '../config';
import { msg } from '../messages';
import type { Progress } from './progress';
import type { PaintOp } from '../paint-ops';
import { loadPaint } from '../save/load-paint';
import { surfaceTable } from '../save/shape';
import { session } from '../session';
import { cleanName, PROTOCOL, type SessionInfo, type ToClient, type ToServer } from './protocol';
import { describeHello, NetLog, Traffic } from './diagnostics';
import { decodeOps, encodeOps, SurfaceIndex } from '../op-wire';
import { enterSessionLevel, type MultiplayerContext } from './game-context';
import { keepSolo, SoloReturn, type Solo } from './solo';
import { LinkHealth, type LinkStatus } from './link-health';
import { NetMinute } from './net-minute';
import { Outbox } from './outbox';
import { LinkClosed } from './link-closed';
import { Reconnect } from './reconnect';
import { SaveRequest } from './save-request';
import { Sender } from './sender';
import { ServerLink } from './server-link';
import { OwnStatus } from './own-status';
import { ownerOf, Remotes } from './remotes';
import { keepTabSession, tabSession } from './tab-session';
import { capture, encodeSnapshot } from './snapshot';
import type { NetStatus } from './status';

// This game in a multiplayer session (server/, protocol.ts): HOST or JOIN, then what this player sends
// (sender.ts: NET.sendRate times a second their snapshot and the paint ops they made since, their stepladder when it
// moves) goes to the server; the others come in as remote players. The welcome brings the session's level, PAINT
// DETAIL and paint; a full session's JOIN waits in line for it ('queued'). A dropped link is retried (reconnect.ts)
// with the player's token, or the place in line's, for as long as the server keeps them (SERVER.rejoinWindow); the
// token is kept in sessionStorage, so a reload comes back too, and each tab is its own player. The server keeps what
// the player carries, and hears what they're doing (own-status.ts).

const now = () => performance.now() / 1000;

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
  onProgress: (p: Progress | null) => void = () => {};
  /** What happened to the link (COPY NETWORK LOG). */
  readonly log = new NetLog();
  /** The session link's minute, for the beacon. */
  readonly minute = new NetMinute();
  /** The link to the server, while there's one. */
  private link: ServerLink | null = null;
  private remotes: Remotes;
  /** Who we are, once welcomed, and how to come back. */
  private joined: { code: string; token: string; name: string; asked: string; you: number; levelName: string; session: SessionInfo } | null = null;
  /** Our place in the line for a full session (code asked for, the server's token for the place, position, 1 next), until the welcome. */
  private line: { code: string; token: string; position: number } | null = null;
  /** The code of the session the last JOIN asked for. */
  private wanted = '';
  /** The link this game closed for its silence (NET.serverSilence): its close is a timeout. */
  private silenced: ServerLink | null = null;
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
  /** Coming back after a dropped link (reconnect.ts). */
  private reconnect: Reconnect;
  /** What happens when a link closes (link-closed.ts). */
  private closing: LinkClosed;

  constructor(private g: MultiplayerContext) {
    this.remotes = new Remotes(g, this.log);
    this.tail = new SoloReturn(g, {
      enqueue: (job) => (this.queue = this.queue.then(job).catch(console.error)),
      log: (line) => this.log.add(line),
      attempt: () => this.attempt,
      connecting: this.waiting,
      onEnd: () => this.onEnd(),
    });
    this.sender = new Sender({ capture: (at) => encodeSnapshot(capture(at, g.player, g.inventory, g.tools)), paint: g.paint, level: g.level, owner: () => session.player, inventory: g.inventory });
    this.reconnect = new Reconnect({
      now,
      log: (line) => this.log.add(line),
      linked: () => Boolean(this.link),
      connect: (hello) => this.connect(hello),
      fail: (reason, detail) => this.end({ state: 'failed', reason, detail }),
      set: (s) => this.setStatus(s),
    });
    this.closing = new LinkClosed({ joined: () => this.joined, line: () => this.line, linked: () => Boolean(this.link), asked: () => this.asked, end: (s) => this.end(s) }, this.reconnect, this.log);
    addEventListener('online', () => this.retryNow());
    this.own = new OwnStatus(g, (status) => this.send({ type: 'status', status }), () => Boolean(this.link?.live), () => this.health.troubled);
  }

  /** A HOST or JOIN is under way, or waits in line. */
  private waiting = () => this.status.state === 'connecting' || this.status.state === 'queued';

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

  /** What the session we are in is (its kind, name, player limit and tools); null outside one. */
  get session(): SessionInfo | null {
    return this.joined?.session ?? null;
  }

  /** The last round trip to the server (s), null before the first. */
  get ping() {
    return this.net.ping;
  }

  /** Start a private session (its name, most players, tools) on this level at this PAINT DETAIL, from a paint save or clean. */
  host(name: string, detail: number, session: Extract<ToServer, { type: 'host' }>['session'], save?: Uint8Array) {
    this.afterRestore(() => {
      const { data, name: levelName } = this.g.levelData();
      this.connect({ type: 'host', protocol: PROTOCOL, table: surfaceTable(this.g.paint.surfaces), name, levelName, level: data, detail, session, bytes: save });
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
    return this.saving.request(() => (this.onProgress({ step: 'saving' }), this.send({ type: 'save' })));
  }

  /** Tries the link again now, instead of when the wait is over (the player is reconnecting in the line). */
  retryNow() {
    this.reconnect.now?.();
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
      this.silenced = link;
      return link.close();
    }
    this.minute.frame(dt, t - link.lastHeard);
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
    this.wanted = hello.type === 'join' ? hello.code : '';
    // HOST goes where the server takes big messages (a save), a few at a time.
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${hello.type === 'host' ? '?host' : ''}`;
    this.log.add(`connecting to ${url}: ${describeHello(hello)}`);
    if (!this.joined && !this.line && this.status.state !== 'connecting') this.setStatus({ state: 'connecting' });
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
        progress: (p) => (this.fromLine(), this.onProgress(p)),
        log: (line) => this.log.add(line),
        traffic: (up, down) => {
          this.net.up += up;
          this.net.down += down;
          // A hidden tab draws no frames, so it counts no seconds: its bytes don't count either.
          if (this.joined && link.live && document.visibilityState === 'visible') this.minute.carried(up, down);
        },
        closed: (code, timedOut) => {
          // A link of the session that died (not a leave: 1000).
          if (this.joined && link.live && code !== 1000) this.minute.dropped(timedOut || this.silenced === link ? 'timeout' : String(code), now());
          if (this.link === link) this.link = null;
          this.closing.closed(code, timedOut);
        },
      },
      { url, open: (u) => new WebSocket(u), now, every: (tick, ms) => ((id) => () => clearInterval(id))(setInterval(tick, ms)) },
    ));
  }

  /** `arrived`: when it came (local s); `link`: the link it came on; `file`: the paint file of a welcome or a save. */
  private async receive(m: ToClient, arrived: number, link: ServerLink, file?: Uint8Array) {
    if (m.type === 'welcome') return this.welcome(m, link, file!);
    if (m.type === 'queued' && this.link === link) {
      // Back into a full session that lost our seat: the line has no page for a game that is in one, so it ends as full.
      if (this.joined) return this.send({ type: 'leave' }), this.end({ state: 'failed', reason: 'full' });
      this.log.add(`in line, #${m.position}`);
      this.line = { code: this.wanted, token: m.token, position: m.position };
      this.reconnect.reset();
      return this.setStatus({ state: 'queued', code: this.wanted, position: m.position });
    }
    if (!this.joined) return;
    if (this.remotes.handle(m, this.surfaces, arrived, this.onPlayer)) return;
    if (m.type === 'paint') decodeOps(m.bytes, this.surfaces)?.ops.forEach((op) => this.g.paintOps.apply(op));
    else if (m.type === 'save') {
      this.onProgress(null);
      this.saving.settle(file ?? null, msg('menu.saveBusy'));
    }
    else if (m.type === 'pong') {
      this.net.ping = now() - m.t;
      this.minute.pinged(this.net.ping * 1000);
      this.outbox.acked(m.acked);
    }
  }

  private async welcome(w: Extract<ToClient, { type: 'welcome' }>, link: ServerLink, file: Uint8Array) {
    // LEAVE, or the link dropped, before it was handled (it waited behind other messages): nothing to open or lock.
    if (this.link !== link) return this.log.add('welcome dropped: its link is gone');
    this.fromLine();
    const g = this.g;
    if (this.joined?.code !== w.code) {
      // Their own level and paint come back when the session ends: kept before the session's replaces them.
      if (!this.solo) {
        const solo = await keepSolo(g, (line) => this.log.add(line));
        if (this.link !== link) return this.log.add('welcome dropped: its link is gone');
        this.solo = solo;
      }
      const surfaces = enterSessionLevel(g, w);
      if (!surfaces) {
        this.send({ type: 'leave' });
        return this.end({ state: 'failed', reason: 'version' });
      }
      this.surfaces = surfaces;
      this.t0 = now();
    }
    const back = this.joined?.code === w.code;
    this.onProgress({ step: 'loading' });
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
    this.log.add(`in session ${w.code} as #${w.you}, at ${w.detail} texels/m, with ${w.players.length} others, ${(file.length / 1024).toFixed(0)} KB of paint`);
    this.joined = { code: w.code, token: w.token, name: w.name, asked: this.asked, you: w.you, levelName: w.levelName, session: w.session };
    keepTabSession({ code: w.code, token: w.token, name: w.name, asked: this.asked });
    session.multiplayer = true;
    session.player = ownerOf(w.you);
    this.remotes.fill(w, now());
    // The session's log counts: a ghost recording (F3) that had it is left without paint ops.
    this.sender.begin(true);
    this.sender.restart(g.level.runtimeOf(session.player));
    this.net = new Traffic();
    // Its welcome has come: it sends, and a silence on it means it's dead.
    Object.assign(link, { live: true, lastHeard: now() });
    for (const b of resend) this.sendOps(b);
    this.own.restart(now());
    this.onProgress(null);
    this.reconnect.reset();
    this.setStatus({ state: 'in', code: w.code });
  }

  /** The welcome is coming: the line is over, the join goes on as any other. */
  private fromLine() {
    if (!this.line) return;
    this.line = null;
    this.setStatus({ state: 'connecting' });
  }

  /** Out of the session: single player again, with the paint the player had before it (SAVE has the session's). A session lost for good while playing waits for the dialog's answer first (solo.ts). */
  private end(status: NetStatus) {
    // A failure after the welcome says which session it cost the player (a failed JOIN or HOST has none).
    if (status.state === 'failed' && this.joined) status = { ...status, code: this.joined.code };
    this.attempt++;
    this.line = null;
    this.reconnect.reset();
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
    this.status = s;
    if (s.state === 'in') this.minute.in(now());
    session.joining = this.waiting();
    // The status of a slow link starts over with the link; the status handler owns the status from here.
    if (s.state !== 'in') this.health.reset();
    this.onStatus(s);
  }
}
