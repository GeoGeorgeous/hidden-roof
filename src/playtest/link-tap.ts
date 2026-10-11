import { PLAYTEST } from '../config';
import { Histogram, Samples, round } from './probe';

// The playtest's view of the multiplayer link (docs/playtest.md, Network): what
// goes each way by message type, pings, silences from the server (TCP holds
// everything behind a lost packet, then it lands at once), the socket's send
// queue, the join, and what happens to the link. Read and cleared once a window.

/** What the playtest build sees of the link (this file): every message each way, the welcome, pongs, and what happens to the link. */
export interface NetTap {
  received(type: string, bytes: number, t: number): void;
  sent(type: string, bytes: number, queued: number): void;
  welcome(telemetry: boolean, w: { code: string; you: number; others: number; fileBytes: number; loadMs: number }): void;
  pong(rtt: number): void;
  event(name: string, detail?: Record<string, unknown>): void;
}

type Count = { n: number; bytes: number };
const now = () => performance.now();

export class LinkTap implements NetTap {
  /** Things that happened, for the window's report and the recorder's hitches. */
  events: Record<string, unknown>[] = [];
  /** The welcome came: the recorder sends `env` with the next report. */
  welcomed = false;
  private down = new Map<string, Count>();
  private up = new Map<string, Count>();
  /** How many other players are here (the server's presence says so, not away or dropped): set by the playtest. Silences only count while there are. */
  peers: () => number = () => 0;
  private pings = new Samples();
  private pingHist = new Histogram(PLAYTEST.pingBuckets);
  /** Pings sent and answered on this link, and when the last went: one still on its way isn't lost. */
  private pingsSent = 0;
  private pongs = 0;
  private lastPing = 0;
  private lostSeen = 0;
  private lastIn = 0;
  private lastPeers = 0;
  private peersMax = 0;
  private stalls = PLAYTEST.stallMs.map(() => 0);
  private longestSilence = 0;
  /** After a stall: when it ended, and how many messages came within 20 ms of it. */
  private burst = { at: -Infinity, n: 0, max: 0 };
  private maxQueued = 0;
  private perFrame = 0;
  private maxPerFrame = 0;
  /** The join under way: when it started, and when each paint part came. */
  private joining: { at: number; back: boolean; parts: number[] } | null = null;

  received(type: string, bytes: number, t: number) {
    const ms = t * 1000;
    // The server only has something to send while another player is here (the others' states, 20 a second): with no one, or with
    // them away (a hidden tab sends once a second), a silence is nothing to send, not a stall.
    const peers = this.peers();
    this.peersMax = Math.max(this.peersMax, peers);
    if (this.lastIn && Math.min(peers, this.lastPeers) > 0) {
      const gap = ms - this.lastIn;
      PLAYTEST.stallMs.forEach((s, i) => gap > s && this.stalls[i]++);
      if (gap > PLAYTEST.stallMs[0]) this.burst = { ...this.burst, at: ms, n: 0 };
      this.longestSilence = Math.max(this.longestSilence, gap);
    }
    if (ms - this.burst.at < 20) this.burst.max = Math.max(this.burst.max, ++this.burst.n);
    this.lastIn = ms;
    this.lastPeers = peers;
    add(this.down, type, bytes);
    this.perFrame++;
    if (type === 'part') this.joining?.parts.push(Math.round(ms - this.joining.at));
  }

  sent(type: string, bytes: number, queued: number) {
    add(this.up, type, bytes);
    if (type === 'ping') (this.pingsSent++, (this.lastPing = now()));
    this.maxQueued = Math.max(this.maxQueued, queued);
  }

  pong(rtt: number) {
    this.pongs++;
    this.pings.add(rtt * 1000);
    this.pingHist.add(rtt * 1000);
  }

  welcome(telemetry: boolean, w: { code: string; you: number; others: number; fileBytes: number; loadMs: number }) {
    const j = this.joining;
    const parts = j?.parts ?? [];
    // The first part waits for the server to pack the paint (and for the connection): its wait is its own number, the gaps are between parts.
    const partGap = parts.reduce((m, t, i) => (i ? Math.max(m, t - parts[i - 1]) : m), 0);
    this.event('welcome', { ...w, telemetry, loadMs: Math.round(w.loadMs), joinMs: j ? Math.round(now() - j.at) : null, back: j?.back, parts: parts.length, firstPartMs: parts[0] ?? 0, partsMs: parts.at(-1) ?? 0, longestPartGap: partGap });
    this.joining = null;
    this.welcomed = true;
    this.lastIn = 0;
    this.pingsSent = this.pongs = this.lostSeen = 0;
    void this.routeCheck();
  }

  event(name: string, detail?: Record<string, unknown>) {
    if (name === 'connect') this.joining = { at: now(), back: !!detail?.back, parts: [] };
    if (this.events.length < PLAYTEST.keepEvents) this.events.push({ e: name, at: Math.round(now()), ...detail });
  }

  /** Once a frame: messages handled in it. */
  frame() {
    const n = this.perFrame;
    this.perFrame = 0;
    if (n > this.maxPerFrame) this.maxPerFrame = n;
    return n;
  }

  /** The window's numbers, cleared. */
  take() {
    const out = {
      down: Object.fromEntries(this.down),
      up: Object.fromEntries(this.up),
      ping: this.pings.summary(),
      pingHist: this.pingHist.take(),
      pingsUnanswered: this.pingsLost(),
      stalls: Object.fromEntries(PLAYTEST.stallMs.map((s, i) => [s, this.stalls[i]])),
      longestSilence: Math.round(this.longestSilence),
      peers: this.peersMax,
      burstAfterStall: this.burst.max,
      maxQueued: this.maxQueued,
      maxMessagesPerFrame: this.maxPerFrame,
      connection: connection(),
    };
    this.down = new Map();
    this.up = new Map();
    this.pings.clear();
    this.maxQueued = this.maxPerFrame = this.longestSilence = this.peersMax = 0;
    this.stalls.fill(0);
    this.burst.max = 0;
    return out;
  }

  /** Pings that never came back since the last window: those still on their way (sent less than a second ago, or in the window's last moments) aren't. */
  private pingsLost() {
    const pending = this.pingsSent - this.pongs - (now() - this.lastPing < 1000 ? 1 : 0);
    const fresh = Math.max(0, pending - this.lostSeen);
    this.lostSeen = Math.max(0, pending);
    return fresh;
  }

  /** At each welcome: a plain HTTP request to the server, next to the socket's ping. Much better than the socket: it's the socket's path (a proxy), not the route. */
  private async routeCheck() {
    const t = now();
    try {
      await fetch('/ws', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      this.event('route', { httpMs: round(now() - t), wsPingMs: this.pings.summary()?.p50 ?? null });
    } catch (e) {
      this.event('route', { failed: (e as Error).name });
    }
  }
}

function add(m: Map<string, Count>, type: string, bytes: number) {
  const c = m.get(type);
  if (c) {
    c.n++;
    c.bytes += bytes;
  } else m.set(type, { n: 1, bytes });
}

/** navigator.connection where the browser has it (Chromium). */
function connection() {
  const c = (navigator as { connection?: { type?: string; effectiveType?: string; rtt?: number; downlink?: number } }).connection;
  return c ? { type: c.type, effective: c.effectiveType, rtt: c.rtt, downlink: c.downlink } : null;
}
