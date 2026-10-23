// The session this tab is in, kept in sessionStorage, so a reload comes back
// to it as the same player. Each tab is its own player: a duplicated tab
// carries it along, and the server tells the older one it's been replaced.

const KEY = 'roofhiddenhaus.session';

export interface TabSession {
  code: string;
  token: string;
  /** The name they go by in the session (numbered if it was taken). */
  name: string;
  /** The name they typed: what a join sends. Missing from a session kept by an older version. */
  asked?: string;
}

/** The session this tab was in before a reload; none without storage (private mode). */
export function tabSession(): TabSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return s?.code && s.token ? s : null;
  } catch {
    return null;
  }
}

/** Keep the session this tab is in, or forget it (null). Without storage a reload starts single player. */
export function keepTabSession(s: TabSession | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // No storage.
  }
}
