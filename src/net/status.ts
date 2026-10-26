import type { diagnose } from './diagnostics';
import type { Rejection } from './protocol';
import type { Tries } from './reconnect';

// What the player sees of the link to a session (multiplayer.ts).

/** Why the game isn't in a session: the server said so (Rejection), it never answered, it couldn't handle a message (broken), the time to rejoin ran out (expired), the server came back without the session (restarted: it said `no-session` to a rejoin), or diagnose's guess at why it can't be reached. */
export type Failure = Rejection | 'timeout' | 'broken' | 'expired' | 'restarted' | Awaited<ReturnType<typeof diagnose>>['reason'];

/** What the player sees of the link, shown on the menus (`queued`: the session is full and this link waits in line, `lost`: the link dropped meanwhile and is being tried again); `detail`: what was seen (a close code, an HTTP status, tries), for reports. */
export type NetStatus = { state: 'off' } | { state: 'connecting' } | { state: 'in'; code: string } | { state: 'reconnecting'; code: string; detail: string; tries: number } | { state: 'queued'; code: string; position: number; lost?: Tries } | { state: 'failed'; reason: Failure; detail?: string; code?: string };
