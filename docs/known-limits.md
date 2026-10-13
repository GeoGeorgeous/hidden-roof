# Known limits, by design

Not tasks: how the game behaves on purpose, and what it would take to change it.

- **Paint order where strokes overlap** differs per client: each applies its own ops at once and others' when their figure gets there, and blending isn't commutative. Measured: 97 of 290 overlapping texels differed; a player who joins later sees the server's order. Everyone matches again after a reload or rejoin (`docs/multiplayer-audit.md`, 2.2).
- **Snapshot time is float32 seconds:** 2 ms steps after 8 hours of a session.
- **TCP head-of-line blocking:** one lost packet holds the ones behind it; smoothing and the adaptive delay hide it. WebTransport datagrams (Chromium) would remove it, if it ever shows.
