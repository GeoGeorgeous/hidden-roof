import type * as THREE from 'three';
import { NET, SERVER } from '../config';
import type { Inventory } from '../inventory/inventory';
import type { Level, LevelData } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintOp, PaintOps } from '../paint-ops';
import type { PaintSystem } from '../painting';
import type { Player } from '../player';
import { loadPaint } from '../save/load-paint';
import { surfaceTable } from '../save/shape';
import { session } from '../session';
import type { Tools } from '../tools/tools';
import { decode, encode, PROTOCOL, type Rejection, type ToClient, type ToServer } from './protocol';
import { diagnose, NetLog } from './diagnostics';
import { Nameplates } from './nameplates';
import { RemotePlayer } from './remote-player';
import { capture, encodeSnapshot } from './snapshot';

// This game in a multiplayer session (server/, protocol.ts): HOST or JOIN,
// then NET.sendRate times a second this player's snapshot and the paint ops
// they made since, and their stepladder when it moves; the others come in as
// remote players. The welcome brings the session's level, PAINT DETAIL and
// paint. A dropped link is retried with the player's token for as long as the
// server keeps them (SERVER.rejoinWindow); the token is kept in sessionStorage,
// so a reload comes back too, and each tab is its own player.

export interface MultiplayerContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  level: Level;
  paint: PaintSystem;
  paintOps: PaintOps;
  drips: PaintDrips;
  player: Player;
  inventory: Inventory;
  tools: Tools;
  /** The level as a file, and its name (what HOST starts the session on). */
  levelData(): { data: LevelData; name: string };
  /** Play this level (the session's), from its spawn, with the starting kit. */
  openLevel(data: LevelData, name: string): void;
  /** Hold PAINT DETAIL at the session's (texels per meter), or give it back (null). */
  lockDetail(tpm: number | null): void;
}

/** Why the game isn't in a session: the server said so (Rejection), it never answered, or diagnose's guess at why it can't be reached. */
type Failure = Rejection | 'timeout' | Awaited<ReturnType<typeof diagnose>>['reason'];

/** What the player sees of the link, shown on the menus; `detail`: what was seen (a close code, an HTTP status, tries), for reports. */
export type NetStatus = { state: 'off' } | { state: 'connecting' } | { state: 'in'; code: string } | { state: 'reconnecting'; code: string; detail: string } | { state: 'failed'; reason: Failure; detail?: string };

const KEY = 'roofhiddenhaus.session';
const now = () => performance.now() / 1000;
const ownerOf = (id: number) => `player${id}`;

export class Multiplayer {
  status: NetStatus = { state: 'off' };
  onStatus: (s: NetStatus) => void = () => {};
  /** The session's paint as a file (SAVE). */
  onSave: (bytes: Uint8Array, levelName: string) => void = () => {};
  /** Someone joined or left the session. */
  onPlayer: (name: string, joined: boolean) => void = () => {};
  readonly names = new Map<number, string>();
  /** What happened to the link (COPY NETWORK LOG). */
  readonly log = new NetLog();
  private nameplates = new Nameplates();
  private ws: WebSocket | null = null;
  private remotes = new Map<number, RemotePlayer>();
  /** Who we are, once welcomed, and how to come back. */
  private joined: { code: string; token: string; name: string; you: number; levelName: string } | null = null;
  /** Messages are handled one at a time, in order (a welcome loads paint before what follows it). */
  private queue = Promise.resolve();
  private t0 = 0;
  private nextSend = 0;
  private lastHeard = 0;
  private ops: PaintOp[] = [];
  private opTimes: number[] = [];
  private ladderId: number | undefined;
  private retry: { until: number; wait: number; tries: number } | null = null;
  /** For the HUD: the last round trip (s), bytes each way since `since`, and their rates (bytes/s). */
  private net = { ping: null as number | null, nextPing: 0, up: 0, down: 0, since: 0, upRate: 0, downRate: 0 };
  /** The name we go by in the session. */
  private name = '';

  constructor(private g: MultiplayerContext) {
    g.tools.ladder.others = () => [...this.remotes.values()].filter((r) => r.avatar.group.visible).map((r) => r.position);
  }

  get inSession() {
    return this.joined !== null;
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
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
      if (s?.code && s.token) this.connect({ type: 'join', protocol: PROTOCOL, name: s.name, code: s.code, token: s.token });
    } catch {
      // No storage (private mode): a reload starts single player.
    }
  }

  /** SAVE: the server sends the session's paint (onSave). */
  requestSave() {
    this.send({ type: 'save' });
  }

  leave() {
    this.log.add('LEAVE SESSION');
    this.send({ type: 'leave' });
    this.end({ state: 'off' });
  }

  /** Once a frame: send this player's state and paint, show the others. */
  update(dt: number) {
    const t = now();
    for (const r of this.remotes.values()) r.update(t, dt);
    this.nameplates.update(this.g.camera, [...this.remotes].filter(([, r]) => r.avatar.group.visible).map(([id, r]) => ({ id, name: this.names.get(id) ?? '', feet: r.position })));
    if (!this.joined || this.ws?.readyState !== WebSocket.OPEN) return;
    if (t - this.lastHeard > SERVER.ping * 3) {
      this.log.add(`nothing from the server for ${SERVER.ping * 3} s: closing to reconnect`);
      return this.ws.close();
    }
    this.measure(t);
    const at = t - this.t0;
    const log = this.g.paint.log!;
    for (const op of log) this.ops.push(op), this.opTimes.push(at);
    log.length = 0;
    const id = this.g.level.runtimeOf(session.player);
    if (id !== this.ladderId) {
      this.ladderId = id;
      const p = id === undefined ? undefined : this.g.level.props.get(id);
      this.send({ type: 'ladder', t: at, data: p ? { type: p.type, pos: [...p.pos], rot: p.rot } : null });
    }
    if (t < this.nextSend) return;
    this.nextSend = Math.max(this.nextSend + 1 / NET.sendRate, t);
    this.send({ type: 'state', bytes: encodeSnapshot(capture(at, this.g.player, this.g.inventory, this.g.tools)) });
    if (!this.ops.length) return;
    this.send({ type: 'ops', t: this.opTimes, ops: this.ops });
    this.ops = [];
    this.opTimes = [];
  }

  private connect(hello: Extract<ToServer, { type: 'host' | 'join' }>) {
    this.ws?.close();
    this.name = hello.name;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.log.add(`connecting to ${url}: ${hello.type === 'host' ? `HOST at ${hello.detail} texels/m${hello.bytes ? ` with ${(hello.bytes.length / 1024).toFixed(0)} KB of paint` : ''}` : `JOIN ${hello.code}${hello.token ? ' (coming back)' : ''}`}`);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    if (!this.joined) this.setStatus({ state: 'connecting' });
    const started = now();
    /** No welcome or rejection in NET.connectTimeout: give up on this socket. */
    let answered = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (answered || this.ws !== ws) return;
      this.log.add(`no answer in ${NET.connectTimeout} s (socket ${['connecting', 'open', 'closing', 'closed'][ws.readyState]})`);
      timedOut = true;
      ws.close();
    }, NET.connectTimeout * 1000);
    ws.onopen = () => {
      this.log.add(`open after ${Math.round((now() - started) * 1000)} ms`);
      ws.send(encode(hello));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.lastHeard = now();
      this.net.down += (e.data as ArrayBuffer).byteLength;
      const m = decode(new Uint8Array(e.data as ArrayBuffer)) as ToClient | null;
      if (m?.type === 'welcome' || m?.type === 'rejected') answered = true;
      // What this game can't take (a welcome it can't load) ends the session for it.
      if (m) this.queue = this.queue.then(() => this.receive(m)).catch((err) => (console.error(err), this.send({ type: 'leave' }), this.end({ state: 'failed', reason: 'version' })));
    };
    ws.onclose = (e) => {
      clearTimeout(timer);
      if (this.ws !== ws) return;
      this.log.add(`closed: ${e.code}${e.reason ? ` ${e.reason}` : ''}${e.wasClean ? '' : ', not clean'}, after ${(now() - started).toFixed(1)} s`);
      this.ws = null;
      if (timedOut && !this.joined) return this.end({ state: 'failed', reason: 'timeout', detail: `NO ANSWER IN ${NET.connectTimeout} S` });
      this.dropped(e.code);
    };
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
      void why.then((d) => !this.ws && !this.joined && this.end({ state: 'failed', reason: d.reason, detail: `${d.detail} · WS ${code}` }));
      return;
    }
    if (this.status.state !== 'reconnecting') this.retry = { until: now() + SERVER.rejoinWindow, wait: 1, tries: 0 };
    const r = this.retry!;
    if (now() > r.until) return this.end({ state: 'failed', reason: 'ended', detail: `NO WAY BACK IN ${SERVER.rejoinWindow} S` });
    r.tries++;
    this.setStatus({ state: 'reconnecting', code: j.code, detail: `WS ${code} · TRY ${r.tries}` });
    void why.then((d) => this.status.state === 'reconnecting' && this.joined === j && this.setStatus({ state: 'reconnecting', code: j.code, detail: `${d.detail} · WS ${code} · TRY ${r.tries}` }));
    this.log.add(`trying again in ${r.wait} s (try ${r.tries})`);
    setTimeout(() => this.joined === j && !this.ws && this.connect({ type: 'join', protocol: PROTOCOL, name: j.name, code: j.code, token: j.token }), r.wait * 1000);
    r.wait = Math.min(r.wait * 2, 8);
  }

  private async receive(m: ToClient) {
    if (m.type === 'welcome') return this.welcome(m);
    if (m.type === 'rejected') {
      this.log.add(`turned away by the server: ${m.reason}`);
      // A session that's gone (the server restarted) while we were coming back: it ended.
      const ended = this.joined && m.reason === 'no-session';
      return this.end({ state: 'failed', reason: ended ? 'ended' : m.reason });
    }
    if (!this.joined) return;
    if (m.type === 'state') this.remotes.get(m.id)?.receive(m.bytes, now());
    else if (m.type === 'ops') {
      const r = this.remotes.get(m.id);
      m.ops.forEach((op, i) => r?.receiveOp(m.t[i], op));
    } else if (m.type === 'ladder') this.remotes.get(m.id)?.receiveLadder(m.t, m.data);
    else if (m.type === 'joined') {
      this.addRemote(m.id, m.name);
      this.onPlayer(m.name, true);
    } else if (m.type === 'left') {
      const name = this.names.get(m.id);
      this.removeRemote(m.id);
      if (name !== undefined) this.onPlayer(name, false);
    }
    else if (m.type === 'save') this.onSave(m.bytes, this.joined.levelName);
    else if (m.type === 'pong') this.net.ping = now() - m.t;
  }

  private async welcome(w: Extract<ToClient, { type: 'welcome' }>) {
    const g = this.g;
    if (this.joined?.code !== w.code) {
      g.lockDetail(w.detail);
      g.openLevel(w.level, w.levelName);
      if (surfaceTable(g.paint.surfaces) !== w.table) {
        this.send({ type: 'leave' });
        return this.end({ state: 'failed', reason: 'version' });
      }
      this.t0 = now();
    }
    // The session's paint replaces ours; what we painted while the link was down is gone with it.
    await loadPaint(g.paint, g.drips, w.bytes, { name: w.levelName });
    const name = this.name;
    this.log.add(`in session ${w.code} as #${w.you}, at ${w.detail} texels/m, with ${w.players.length} others, ${(w.bytes.length / 1024).toFixed(0)} KB of paint`);
    this.joined = { code: w.code, token: w.token, name, you: w.you, levelName: w.levelName };
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ code: w.code, token: w.token, name }));
    } catch {
      // No storage: a reload won't come back.
    }
    session.multiplayer = true;
    session.player = ownerOf(w.you);
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    for (const p of w.players) this.addRemote(p.id, p.name);
    for (const l of w.ladders) g.level.setRuntime(ownerOf(l.id), l.data);
    g.paint.log = [];
    this.ops = [];
    this.opTimes = [];
    this.ladderId = g.level.runtimeOf(session.player);
    this.nextSend = 0;
    Object.assign(this.net, { ping: null, nextPing: 0, up: 0, down: 0, since: now() });
    this.setStatus({ state: 'in', code: w.code });
  }

  private addRemote(id: number, name: string) {
    this.names.set(id, name);
    this.remotes.set(id, new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, ownerOf(id), this.g.tools.spray.others));
  }

  private removeRemote(id: number) {
    this.remotes.get(id)?.dispose();
    this.remotes.delete(id);
    this.names.delete(id);
    this.g.level.setRuntime(ownerOf(id), null);
  }

  /** Out of the session: single player again, keeping the paint (SAVE PAINT still has it). */
  private end(status: NetStatus) {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.joined) {
      for (const id of [...this.remotes.keys()]) this.removeRemote(id);
      this.g.level.setRuntime(session.player, null);
      this.g.paint.log = null;
      this.g.lockDetail(null);
      session.multiplayer = false;
      session.player = 'local';
      this.joined = null;
    }
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // No storage.
    }
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
    const players = [...this.remotes].map(([id, r]) => ({ name: this.names.get(id) ?? '', delay: r.stats.delay, jitter: r.stats.jitter }));
    return { reconnecting: this.status.state === 'reconnecting', ping: n.ping, up: n.upRate, down: n.downRate, players };
  }

  /** A ping now and then; traffic rates each second. */
  private measure(t: number) {
    const n = this.net;
    if (t >= n.nextPing) {
      n.nextPing = t + SERVER.ping;
      this.send({ type: 'ping', t });
    }
    if (t - n.since < 1) return;
    n.upRate = n.up / (t - n.since);
    n.downRate = n.down / (t - n.since);
    n.up = n.down = 0;
    n.since = t;
  }

  private send(m: ToServer) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const f = encode(m);
    this.net.up += f.length;
    this.ws.send(f);
  }

  private setStatus(s: NetStatus) {
    if (s.state === 'failed' || s.state === 'off') this.log.add(`status: ${s.state}${s.state === 'failed' ? ` ${s.reason}${s.detail ? ` (${s.detail})` : ''}` : ''}`);
    this.status = s;
    this.onStatus(s);
  }
}
