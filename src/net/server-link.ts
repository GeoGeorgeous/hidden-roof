import { NET, SERVER } from '../config.ts';
import { msg } from '../messages.ts';
import { PartsIn } from './parts-in.ts';
import { decode, encode, type ToClient, type ToServer } from './protocol.ts';

// One WebSocket to the game server, for one HOST or JOIN (multiplayer.ts
// opens a new one to come back): it sends the hello, says how its upload and
// the paint file's download go, sends something at least every SERVER.ping
// (the server's own ping may wait behind what's coming down), gives up on a
// server that says nothing in NET.connectTimeout before the welcome, and puts
// a paint file's parts together. The socket and the clock come from outside,
// so Node runs it with fakes (scripts/server-link.test.mjs).

/** What it needs of a WebSocket. */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: string;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
}

export interface LinkEvents {
  /** A message as it came (a welcome or a save once its paint file has: `file`), at time `arrived` (s). */
  message(m: ToClient, arrived: number, file?: Uint8Array): void;
  /** What's under way, for the player (UPLOADING PAINT 40%…). */
  progress(text: string): void;
  log(line: string): void;
  /** Bytes sent and received, for the HUD's traffic. */
  traffic(up: number, down: number): void;
  /** The socket closed (code, as the browser says); `timedOut`: no answer in NET.connectTimeout before the welcome. */
  closed(code: number, timedOut: boolean): void;
}

export interface LinkEnv {
  url: string;
  open(url: string): SocketLike;
  /** Seconds. */
  now(): number;
  /** Runs `tick` every NET.linkCheck s until the returned stop(); tests leave it out and tick by hand. */
  every?(tick: () => void, ms: number): () => void;
}

const OPEN = 1;
const percent = (done: number, all: number) => `${Math.floor((100 * done) / Math.max(all, 1))}%`;

export class ServerLink {
  /** Its welcome has come: from now a silence is the session's to judge (NET.serverSilence), not connectTimeout's. */
  live = false;
  /** When it last heard from the server, and last sent (s). */
  lastHeard: number;
  sent = -Infinity;
  private socket: SocketLike;
  private started: number;
  /** Nothing from the server since then (s), the hello's upload aside: give up after NET.connectTimeout. */
  private heard: number;
  private timedOut = false;
  private uploading = false;
  private gone = false;
  private frame: Uint8Array<ArrayBuffer>;
  /** A HOST's save: the server sends no paint back, it's this. */
  private save?: Uint8Array;
  /** What the server is doing once the hello is up. */
  private next: string;
  private parts = new PartsIn();
  private stop = () => {};
  private on: LinkEvents;
  private env: LinkEnv;

  // No parameter properties: Node runs this file as is (it strips types only).
  constructor(hello: Extract<ToServer, { type: 'host' | 'join' }>, on: LinkEvents, env: LinkEnv) {
    this.on = on;
    this.env = env;
    this.frame = encode(hello);
    this.save = hello.type === 'host' ? hello.bytes : undefined;
    this.next = msg(hello.type === 'join' ? (hello.token ? 'menu.progressGoingBack' : 'menu.progressJoining') : this.save ? 'menu.progressCreatingSave' : 'menu.progressCreating');
    this.started = this.heard = this.lastHeard = env.now();
    const ws = (this.socket = env.open(env.url));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => this.opened();
    ws.onmessage = (e) => this.arrived(e.data as ArrayBuffer);
    ws.onclose = (e) => this.closed(e.code, e.reason, e.wasClean);
    if (env.every) this.stop = env.every(() => this.tick(), NET.linkCheck * 1000);
  }

  get open() {
    return !this.gone && this.socket.readyState === OPEN;
  }

  /** Sends `m` if the socket is open. */
  send(m: ToServer) {
    if (!this.open) return;
    const f = encode(m);
    this.sent = this.env.now();
    this.socket.send(f);
    this.on.traffic(f.length, 0);
  }

  /** Closes the socket: it reports closed() as any close (a reconnect follows). */
  close() {
    this.socket.close();
  }

  /** Done with it (replaced, or the session's over): closes the socket and says nothing more. */
  abandon() {
    this.gone = true;
    this.stop();
    this.socket.close();
  }

  /** Every NET.linkCheck s: the keepalive, the upload's progress, and the give-up before a welcome. */
  tick() {
    if (this.gone) return;
    const now = this.env.now();
    if (!this.uploading && this.open && now - this.sent > SERVER.ping) this.send({ type: 'ping', t: now });
    if (this.live) return;
    if (this.uploading && this.socket.bufferedAmount) {
      this.heard = now;
      this.on.progress(msg('menu.progressUploading', { percent: percent(this.frame.length - this.socket.bufferedAmount, this.frame.length) }));
    } else if (this.uploading) {
      this.uploading = false;
      this.on.progress(this.next);
    }
    if (now - this.heard < NET.connectTimeout) return;
    this.on.log(`nothing from the server in ${NET.connectTimeout} s (socket ${['connecting', 'open', 'closing', 'closed'][this.socket.readyState]})`);
    this.timedOut = true;
    this.stop();
    this.socket.close();
  }

  private opened() {
    if (this.gone) return;
    this.on.log(`open after ${Math.round((this.env.now() - this.started) * 1000)} ms`);
    this.socket.send(this.frame);
    this.sent = this.env.now();
    // Only a save is worth a percentage (the rest goes in a blink).
    this.uploading = !!this.save && this.socket.bufferedAmount > 0;
    this.on.progress(this.uploading ? msg('menu.progressUploading', { percent: '0%' }) : this.next);
  }

  private arrived(data: ArrayBuffer) {
    if (this.gone) return;
    const t = (this.lastHeard = this.heard = this.env.now());
    this.uploading = false;
    this.on.traffic(0, data.byteLength);
    const m = decode(new Uint8Array(data)) as ToClient | null;
    if (!m) return;
    if (m.type === 'welcome' && m.parts) this.on.log(`welcome: the paint comes in ${m.parts} parts`);
    const done = this.parts.take(m);
    const of = this.parts.coming ?? (done?.file && done.m);
    if (m.type === 'part' && of) this.on.progress(msg(of.type === 'save' ? 'menu.progressSavingParts' : 'menu.progressDownloading', { percent: percent(this.parts.got, of.parts) }));
    if (done) this.on.message(done.m, t, done.file ?? (done.m.type === 'welcome' ? this.save : undefined));
  }

  private closed(code: number, reason: string, clean: boolean) {
    this.stop();
    if (this.gone) return;
    this.gone = true;
    this.on.log(`closed: ${code}${reason ? ` ${reason}` : ''}${clean ? '' : ', not clean'}, after ${(this.env.now() - this.started).toFixed(1)} s`);
    this.on.closed(code, this.timedOut);
  }
}
