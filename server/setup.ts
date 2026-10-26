import { SERVER } from '../src/config';
import { SLOTS, type Tool } from '../src/inventory/tool';
import type { SessionKind } from '../src/net/protocol';

// What a session (session.ts) is made as.

/** What its creator made it: public (open to all) or private (by its code), its name, most players, the tools it allows; `stays` when empty; `admin`: the admin made it. */
export interface SessionSetup {
  kind: SessionKind;
  name: string;
  limit: number;
  tools: readonly Tool[];
  stays: boolean;
  admin: boolean;
}

/** A session made without a setup (the paint tests'): private, every tool, closed when empty. */
export const HOSTED: SessionSetup = { kind: 'private', name: '', limit: SERVER.players.private, tools: SLOTS, stays: false, admin: false };
