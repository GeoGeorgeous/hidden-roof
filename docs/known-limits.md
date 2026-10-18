# Known limits, by design

Not tasks: how the game behaves on purpose, and what it would take to change it.

- **Paint order where strokes overlap** differs per client: each applies its own ops at once and others' when their figure gets there, and blending isn't commutative. Measured: 97 of 290 overlapping texels differed; a player who joins later sees the server's order. Everyone matches again after a reload or rejoin. Weighed and dropped: the server re-sending canonical tiles where ops overlapped, a confirmed copy per surface with rollback (2× paint memory), a per-texel last-writer register (loses layering and fades), additive or max blending (changes the look).
- **Snapshot time is float32 seconds:** 2 ms steps after 8 hours of a session.
- **TCP head-of-line blocking:** one lost packet holds the ones behind it; smoothing and the adaptive delay hide it. WebTransport datagrams (Chromium) would remove it, if it ever shows.
- **Props turn in quarter turns only** (BL-022, rejected 2026-10-14). A prop's `rot` is a whole number of quarter turns everywhere (level files, placement, the network's ladder message), and the player's colliders are boxes aligned to the world's axes (`THREE.Box3`). A stepladder turned 7.5° or 45° fits no such box: the player would bump into air beside it, and climbing a turned ladder isn't supported. Turning it in small steps would need colliders, climbing and placement rebuilt for free rotation: not worth it.

## Multiplayer

How sessions work on purpose (decided 2026-10-04 to 10-08; details in `server/`, `src/net/protocol.ts`, `src/op-wire.ts`).

- **The server holds the paint.** One Node process hands out 5-letter codes, puts every paint op in one order, paints it into an in-memory copy of the session's paint and sends a joiner that paint as one file. So the snapshot is ready at once, SAVE is always at the session's detail, and a session doesn't die with the host's tab.
- **A session lives in the server's memory only:** a restart or the last player leaving ends it; nothing is stored on the server and the browser keeps no autosave. SAVE keeps the paint; a host can upload a save when starting.
- **The host picks PAINT DETAIL**, locked for everyone in the session.
- **Ops are resolved dabs in face fractions and meters,** never texels or input replay, so the same op paints the same spot at any detail, and the painter paints with the values rounded as the bytes hold them, so every client and the server paint the same texels. Drips are decided by whoever painted and sent as ops; they trickle in real time, so clients can differ by dozens of texels.
- **Anyone can paint, scrub and move anything:** no ownership, undo or kick; movement is client-authoritative and trusted; the server checks only that an op names a real surface and face. Friends only until a public server (BL-147).
- **Weather, lightning, CCTV, neon flicker and fan phase are per player:** no shared clock; CCTV heads follow the local player. Nothing in play depends on them.
- **Players don't collide with each other.** Only a placed stepladder keeps off another player's box, checked by the placer's game.
- **Pickups are personal:** each player collects their own; the server keeps what a player carried under their name to give it back when they return.
- **Ladders go with their owner:** a dropped player's stepladder stays for `SERVER.rejoinWindow` (3 min), then goes, and is never saved; a climber on a ladder that is moved just drops.
- **Thin paint is coarse at LOW:** a texel is 4 cm at 24 texels/m, so the thinnest marker line and drips are 4 cm wide; a save loaded at a lower detail is averaged down, at a higher one enlarged by nearest texel.
- **Rejected:** host-client (WebRTC) authority; an op log (unbounded, ~24 MB/h per sprayer); texture deltas on the wire (~400 KB/s at ULTRA); interest management (not needed for 20 players on one roof).
