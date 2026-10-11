# Playtest results: problems found

What the playtests showed that isn't fixed yet, to be picked up later. Each item says what was seen, the evidence, and what to do. Move the real ones to `docs/backlog.md` on `dev` when the audit is written up; this file lives on `chore/v1.2.0-playtest` only.

## Smoke test, 2026-10-11 (v1.2.0-playtest, prod)

Two players (Windows / Chrome 154 / RTX A2000 laptop, 1080p, DPR 1; Mac / Chrome 152 / M1 Pro, DPR 2), 39 minutes, ~73% of the roof painted (414 MB of 565 MB), 9 reloads. Pipeline: every line kind written, no gaps, no dropped reports, no client errors; the telemetry's own cost is ~4–6 ms per 5 s.

### Game

- **A stepladder placed or moved hitches everyone.** 21 of the 25 slow windows contain a `ladder` message. The placer's frame spends 65–125 ms in the `tools` lap, every receiver 64–72 ms in `net`, 11–20 ms more in `level` and `bake`. Reproduced locally on the roof level (1464 props): `Level.setRuntime` takes ~70 ms, almost all in `reaches` (`src/render/bake/reach.ts`), called from `LightBaker.sync` on the ladder's occluders: it tests every light receiver in the level against the shadow cones of the lamps in range. The stepladder is a runtime prop that differs from client to client, so it probably shouldn't relight baked light at all. Fix: leave runtime props (`owner` set) out of `changed` and `lampSpheres` in `LightBaker.sync`, or skip their occluders in the baker; then check in F3 that its shadow isn't missed. **S.** With 8–10 players moving ladders this repeats for everyone.
- **A paint-heavy rejoin freezes the client for 1.2–1.6 s** while it decodes and applies the paint file (hitches with cpu 1154–1272 ms, `loadMs` 0.9–1.4 s for 1–6 MB packed, ~160 MB raw). It happens behind the menu (`playing: false`), so players mostly don't feel it. Do: apply the file in slices over several frames. **M.**
- **Rejoining takes 5.5–6.3 s at 160 MB of paint:** ~0.3 s connect, 1.7 s the server packs the whole session paint again, ~1.5 s download (not a link stall: the first part waits for the pack; the old `longestPartGap` of 2.5 s was that), 1.4 s decode. Do: keep the last paint file and its op log, and hand it to a rejoiner within a few seconds instead of packing again. **M.**
- **Client memory at a mostly painted level:** GPU paint pages 1041 MB (49 pages), CPU atlases ~410 MB, JS heap 580–620 MB steady and up to 1067 MB (Geo) / 697 MB (ALS) while a paint file is applied (the join is a transient +350–400 MB). A 4–8 GB machine is at risk at full paint. Do: lower PAINT DETAIL for such devices (telling testers is enough for now); later free the file's buffers sooner and size pages by what's painted. **M.**
- **Paint ops traffic:** one heavy painter averaged 50 KB/s up (the other 28 KB/s). With 8 painters at once that is ~350 KB/s down per player. Ops aren't coalesced (a stamp each). Watch it in the phase where everyone sprays one wall; if it matters, batch ops per frame or drop the colour/size repeats. **S–M.**

### Server

- **Hosting blocks the event loop for ~1.2 s on the VPS** (1186 ms at 18:22:13, 1220 ms at 18:28:03, both right at a HOST): `new Session` builds every paint face of the level (`levelPaintFaces`, ~330–420 ms on a dev machine, about 3x on the VPS) before the first await. Every live session freezes for that long whenever anyone hosts. Do: cache the faces per level and detail (the geometry isn't mutated after `register`), or build off the event loop in a worker. The telemetry now records it (`host` events: `buildMs`, `loadMs`). **S–M.**
- **Server memory after a session ends was not returned:** container RSS stayed at 368–371 MiB for 4+ minutes after the 414 MB-of-paint session closed (live memory was 457 MB at 18:58). Whether it's retained or just not returned to the OS wasn't visible. The process line is now written at session close and every minute after; heap, array buffers and RSS there will say. **S** to find, unknown to fix.
- **Pack time grows with paint:** 95 MB raw -> 1.1 s, 160 MB -> 1.6–1.8 s per paint file (one per rejoin). Fine for the event loop (max ~130–146 ms), but it's the largest part of a rejoin.

### Telemetry (fixed on this branch for the main test)

- Stalls and longest silence counted a peer having nothing to send (a hidden tab, or nobody else) as a network stall. Now only counted while another player is here.
- Hitch lines described the frame after the slow one; the laps were of a 10 ms frame. Now the slow frame, with its laps, and the browser's long-animation-frame entries.
- `pingsUnanswered` counted a pong that landed in the next window as lost; `backedUp` counted every 256 KB paint part; `longestPartGap` included the wait for the first part.
- Not recorded before: display refresh, texture memory, level-edit cost, the server's host cost, memory after a session closes, the mouse.

## Known, not seen in the smoke test

- Mouse spikes (Chromium on Windows), in `docs/backlog.md`. The main test records them (`mouse` lines, see `docs/playtest.md`).
