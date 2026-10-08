import { NET } from '../config';
import { HELLO, PROTOCOL } from './protocol';

// For finding out what went wrong with the multiplayer link: a log of what
// happened (also in the console as [net]) that the player can copy from the
// menu, and, when the server can't be reached, a guess at why, from asking it
// over plain HTTP at the same address (server/main.ts answers HELLO there).

export class NetLog {
  private lines: string[] = [];

  add(msg: string) {
    console.info('[net]', msg);
    this.lines.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
    if (this.lines.length > NET.logLines) this.lines.shift();
  }

  /** The log with what's needed to read it: where, which protocol, which browser. */
  text() {
    return [`roof network log · ${location.host} · protocol ${PROTOCOL} · ${new Date().toISOString()}`, navigator.userAgent, '', ...this.lines].join('\n');
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
