import type { Tool } from '../inventory/tool';
import type { SurfaceIndex } from '../op-wire';
import type { PaintSystem } from '../painting';
import type { ToClient, ToServer } from './protocol';
import type { Remotes } from './remotes';

// Locks against paint as a session tells every game (server/locks.ts), and what admin mode (src/admin) gets of
// the session an admin is in (server/admins.ts): multiplayer.ts makes it when the welcome says admin.

/** What admin mode has of its session. */
export interface AdminSession {
  /** The tools the session allows. */
  tools: readonly Tool[];
  surfaces: SurfaceIndex;
  send(m: Extract<ToServer, { type: 'seen' | 'lock' }>): void;
  /** The players (not admins), dropped ones too, and where this game last showed each (null: never). */
  players(): Remotes['whereabouts'];
  /** A lock changed. */
  onLocks: () => void;
}

/** The welcome's locks in place of any (surface numbers this game doesn't have are dropped). */
export function welcomeLocks(paint: PaintSystem, surfaces: SurfaceIndex, w: Extract<ToClient, { type: 'welcome' }>) {
  paint.locks.reset(w.locks.flatMap(([i, rect]): [string, number][] => (surfaces.keys[i] ? [[surfaces.keys[i], rect]] : [])));
}

/** A lock as a session tells it. */
export function lockOf(paint: PaintSystem, surfaces: SurfaceIndex, m: Extract<ToClient, { type: 'lock' }>) {
  const key = surfaces.keys[m.surface];
  if (key) paint.locks.set(key, m.rect, m.on);
}
