import { LOBBY } from '../config';
import type { MessageId } from '../messages';
import { LOBBY_CODE, LOBBY_LIST, type Lobby, type LobbyEntry } from './protocol';

// Asking the server which sessions there are (protocol.ts, Lobby): over plain HTTP, no WebSocket. The round trip
// of an answer is the ping the list shows. A server that can't be asked is an answer too (`why`, the words for it:
// the same as for a link that fails), never an exception for the page to catch.

/** What the server said and how long it took (ms), or why there is no answer. */
export type Answer<T> = { value: T; ping: number } | { why: MessageId };

async function ask(url: string): Promise<{ body: unknown; ping: number } | { why: MessageId; missing?: true }> {
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(LOBBY.fetchTimeout * 1000) });
  } catch (e) {
    return { why: (e as Error).name === 'TimeoutError' ? 'menu.netTimeout' : 'menu.netOffline' };
  }
  if (res.status === 404) return { why: 'menu.netNoSession', missing: true };
  if (!res.ok) return { why: res.status >= 500 ? 'menu.netServerDown' : 'menu.netNoServer' };
  try {
    const body: unknown = await res.json();
    return { body, ping: Math.round(performance.now() - t0) };
  } catch {
    // Not the server's answer (the page of a site with no game server).
    return { why: 'menu.netNoServer' };
  }
}

/** The server's sessions, public and private, and where it is. */
export async function fetchLobby(): Promise<Answer<Lobby>> {
  const a = await ask(LOBBY_LIST);
  if ('why' in a) return a;
  const lobby = a.body as Lobby | null;
  if (!Array.isArray(lobby?.sessions)) return { why: 'menu.netNoServer' };
  return { value: lobby, ping: a.ping };
}

/** The session with this code, or null when there is none. */
export async function lookupCode(code: string): Promise<Answer<LobbyEntry | null>> {
  const a = await ask(LOBBY_CODE + code);
  if ('why' in a) return a.missing ? { value: null, ping: 0 } : a;
  const entry = a.body as LobbyEntry | null;
  return Array.isArray(entry?.players) ? { value: entry, ping: a.ping } : { why: 'menu.netNoServer' };
}
