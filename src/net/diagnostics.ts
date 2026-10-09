import { NET, SERVER } from '../config';
import type { Multiplayer } from './multiplayer';
import { HELLO, PROTOCOL } from './protocol';
import { VERSION } from '../version';

// For finding out what went wrong with the multiplayer link: a log of what
// happened (also in the console as [net]) that the player can copy from the
// menu, and, when the server can't be reached, a guess at why, from asking it
// over plain HTTP at the same address (server/main.ts answers HELLO there).
// Also the link's lines in the HUD's performance readout.

export class NetLog {
  private lines: string[] = [];

  add(msg: string) {
    console.info('[net]', msg);
    this.lines.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
    if (this.lines.length > NET.logLines) this.lines.shift();
  }

  /** The log with what's needed to read it: where, which protocol, which browser. */
  text() {
    return [`roof network log · ${location.host} · ${VERSION} · protocol ${PROTOCOL} · ${new Date().toISOString()}`, navigator.userAgent, '', ...this.lines].join('\n');
  }
}

/**
 * Why a WebSocket that closed before the welcome might have: this browser is
 * offline or can't reach the site (`offline`), the site answers but its game
 * server is down (`server-down`: a 5xx from Caddy) or missing (`no-server`),
 * a server of another version (`version`), or the server is up and the socket
 * still failed (`blocked`: a proxy, a firewall, an extension). `detail` says
 * what was seen.
 */
export async function diagnose(): Promise<{ reason: 'offline' | 'server-down' | 'no-server' | 'version' | 'blocked'; detail: string }> {
  if (!navigator.onLine) return { reason: 'offline', detail: 'BROWSER OFFLINE' };
  let res: Response;
  try {
    res = await fetch('/ws', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  } catch (e) {
    return { reason: 'offline', detail: (e as Error).name === 'TimeoutError' ? 'NO HTTP ANSWER IN 5 S' : 'HTTP FAILED' };
  }
  const text = res.ok ? await res.text() : '';
  const theirs = text.match(/^roof server · protocol (\d+)/)?.[1];
  if (text === HELLO) return { reason: 'blocked', detail: 'SERVER UP' };
  if (theirs) return { reason: 'version', detail: `SERVER PROTOCOL ${theirs}, OURS ${PROTOCOL}` };
  return { reason: res.status >= 500 ? 'server-down' : 'no-server', detail: `HTTP ${res.status}` };
}

/** For the HUD: the last round trip (s), bytes each way since `since`, and their rates (bytes/s). */
export class Traffic {
  ping: number | null = null;
  up = 0;
  down = 0;
  upRate = 0;
  downRate = 0;
  private nextPing = 0;
  private since = performance.now() / 1000;

  /** Rates each second, at time `t` (s); true when it's time to send a ping. */
  measure(t: number) {
    const ping = t >= this.nextPing;
    if (ping) this.nextPing = t + SERVER.ping;
    if (t - this.since >= 1) {
      this.upRate = this.up / (t - this.since);
      this.downRate = this.down / (t - this.since);
      this.up = this.down = 0;
      this.since = t;
    }
    return ping;
  }
}

export type NetStats = Multiplayer['stats'];

/** In a multiplayer session: ping, traffic, and how far behind each other player is shown. */
export function netLines(n: NetStats): string[] {
  if (!n) return [];
  if (n.reconnecting) return ['net · reconnecting…'];
  const kb = (b: number) => (b / 1024).toFixed(1);
  const ms = (s: number) => Math.round(s * 1000);
  return [
    `ping · ${n.ping === null ? '…' : `${ms(n.ping)} ms`}`,
    `net · up ${kb(n.up)} · down ${kb(n.down)} KB/s`,
    ...n.players.map((p) => `${p.name} · ${ms(p.delay)} ms behind · jitter ${ms(p.jitter)} ms`),
  ];
}
