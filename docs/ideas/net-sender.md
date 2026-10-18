# One Sender for what this player sends (BL-113)

Decided 2026-10-18 (architecture run on the network code). For 1.4.0. No behavior change, no protocol change.

## Problem

`src/dev/ghost.ts` has its own `Msg` type and copies the send loop of `src/net/multiplayer.ts` without `encodeOps`/`decodeOps`. `paint.log` has three writers (multiplayer.ts, ghost.ts, the tests' harnesses) and doubles as an on/off flag; a ghost recording stopped by a session once put it back to null and every frame threw.

## Design

One `Sender` (`src/net/sender.ts`) says what this player sends:

- It owns `paint.log`: begins and ends logging; a second owner is refused, so the ghost-crash shape can't come back.
- It owns the snapshot clock (`NET.sendRate`) and the stepladder and inventory change checks.
- It gives out the real `ToServer` messages (`state`, `ladder`, `inventory`) and the paint ops taken, on a clock it's handed.
- Its dependencies come in (a capture function, the level's runtime lookup, the paint system), so Node tests it.

Multiplayer puts its output through Outbox and ServerLink. The ghost records the same messages and plays them over SimLink, through the same per-type dispatch into a RemotePlayer as `Multiplayer.receive`, with ops through `encodeOps`/`decodeOps` like the wire. ghost.ts's `Msg`, its `keep()` and its `paint.log` handling go; multiplayer.ts's `update` loses its send half. ServerLink and SimLink are the two adapters of the message sink.

## Done when

The module has its Node test in `npm test`; ghost.ts's copy of the send path is gone; `test:mp`, `test:weak-link` and `npm run check` pass before and after; golden paint identical. Stop and report if it grows past M.
