# Playtest build (v1.2.0-playtest)

A temporary build of 1.2.0 that records how a 4–8 player session performs (frame rate, rendering, paint, particles, network, server) so it can be audited. Players see one thing new: a notice on first launch saying this is a playtest build and what it records. Nothing else changes: no prompts in play, no setting. It lives only on this branch and is dropped after the playtest.

## What it is, and what it isn't

- **Branch** `chore/v1.2.0-playtest`, from the `v1.2.0` tag. **Tag** `v1.2.0-playtest` on its tip: the VPS deploys by tag, and the pause menu shows it, so testers can see which build they're on. Branch and tag have different names on purpose: git warns when a branch and a tag share one.
- **Never merged** into `dev`, `next` or `main`. `main` stays at `v1.2.0`, so 1.3.0 still fast-forwards. `next` never contains the tag, so 1.3.0's "since the last tag" is still from `v1.2.0`.
- **No release:** no `npm version`, no `docs/releases/*.md`, no GitHub release, no `scripts/release-discord.mjs` (Discord is posted only by that script, by hand; a push or a tag posts nothing).
- **Deployed for a few days**, server and client together (`docs/playtest-devops.md`). Then back to `v1.2.0`, or on to `v1.3.0` if it's out.
- **Whatever the audit finds** goes into `docs/backlog.md` on `dev`, not here. Once it's written up, delete the branch and the tag (locally and on GitHub) and the recorded data.

## How it works

- **Client:** in a multiplayer session only, every `PLAYTEST.every` (5 s) the game sends one `stats` message (~1–2 KB JSON) with that window's aggregates, plus a `hitch` message right away when a frame takes more than `PLAYTEST.hitchMs` (100 ms). The first report after a join carries the device and settings (`env`). Single player records and sends nothing.
- **Notice:** on the first launch on a device, a one-screen modal: this is the public playtest build of Hidden Roof; in a multiplayer session it sends performance data (the list below, in plain words) to the game's server; what isn't sent (no IP address in the clear, nothing typed but the name); how long it's kept and who sees it. One button, OK. Seen once per device (`localStorage`; shown again when that's unavailable). Styled as the menus are, and doesn't steal pointer lock.
- **Handshake, so a rollback is safe:** this is a technical guard, not a consent switch. The server says `telemetry: 1` in `welcome`. The client sends `stats` only when it saw that. The 1.2.0 server closes any link that sends a message type it doesn't know: a playtest tab left open after a rollback to 1.2.0 must not loop on reconnects. 1.2.0 tabs left open on the playtest server send nothing and work as before. `PROTOCOL` stays 4.
- **Server:** checks each `stats` for shape and size (≤ 16 KB, ≤ 1 per second per player, dropped otherwise, never a disconnect), stamps it with the server time, session code, player id and link id (see Who's who), and appends it as one JSON line to `PLAYTEST_LOG` (a directory; one file per day, `playtest-YYYY-MM-DD.jsonl`). Every `PLAYTEST.every` it also writes its own line per live session and one for the process. Unset `PLAYTEST_LOG`: nothing is written (tests, local runs).
- **Why a file, not `docker logs`:** at 8 players it's ~10 MB an hour, and the container's log rotates at 3 × 10 MB. The file lives on a bind mount, outside the container, so a restart keeps it.
- **Cost:** no allocation per frame (frame times go to a preallocated ring; laps are `performance.now()` pairs), aggregated once per window. The GPU timer runs all the time in a session (its queries are cheap; the report says whether it's supported). Network: ~0.3 KB/s up per player, nothing extra down. The report includes the telemetry's own time per window, to prove it.
- **Privacy:** the IP is never written, only a salted hash (to tell two players behind one router apart). Names are what players typed. The files stay on the host and the auditor's machine, never in this public repo. The notice tells the testers what's recorded.

## Who's who

A name isn't a person, and neither is the server's player id: if Geo's tab drops and someone else joins under "Geo" within the 60 s rejoin window, the server hands them Geo's slot, id, stepladder and inventory (a `takeover`, `server/session.ts`, `admit`). So every line carries several ids, and the report keys players on the device, never the name:

- **device:** a random id made on the first launch and kept in `localStorage` (the same key that remembers the notice). Survives reloads and sessions; a private window or another browser is a new device.
- **load:** a random id per page load: two tabs on one device, or a reload, tell apart.
- **link:** the server numbers each WebSocket it accepts; every line from that socket carries it. Join, back and takeover events say which link took which player id, and from which device.
- **player:** the session's player id, as the game and the server log use it.
- **name:** what was typed, at that moment: a label, never a key.
- **ip:** a salted hash of the address (salt made at server start, never written), and the device's GPU and browser from `env`, to sanity-check a device id (a cleared `localStorage` makes a new one).

The report shows each device as one row, labeled with the names it used, and flags takeovers and a name used by two devices.

## What it records

Each window is 5 s; times in ms; "p" is a percentile over the window's frames.

### Frame and CPU

- Frames, fps; frame interval p50 / p95 / p99 / max; frames over 33, 50, 100 ms.
- CPU time per frame, p50 / p95 / max, and split by section, the same cuts as F3's laps: player, lights, world, tools, net, level, bake, paint flush, render. The worst frame's split is kept whole, so a spike can be pinned to a section.
- Long tasks (`PerformanceObserver('longtask')`, Chromium): count, total, longest.
- Time the tab was hidden, unfocused, paused (pointer unlocked) or away: those frames don't count toward fps.
- `RENDER.maxFps` and the display's refresh (median rAF interval while uncapped), so a 60 Hz cap isn't read as a drop.

### GPU and rendering

- GPU ms per pass (`scene`, `volumetrics`, `post`) and total, where `EXT_disjoint_timer_query_webgl2` exists (not in Firefox or Safari).
- Draw calls and triangles: p50 / max. Expected to stay flat however many players paint (AGENTS.md); if it climbs with players, that's a finding.
- `renderer.info`: programs, geometries, textures. **New shader programs mid-session** are logged as an event with their frame time: a compile is a classic hitch.
- Texture memory: paint, bake, static.
- Drawing buffer size, DPR, render scale, canvas size.

### Paint

- Paint pages and painted surfaces alive; pages created in the window (paint is made lazily, on first hit: a burst of first hits is a burst of allocations).
- GPU uploads: dirty rects and bytes, per frame p50 / max and in the window; mip regeneration bytes.
- Paint ops applied: local and remote, per kind (`stamp`, `roll`, `drip`), and the CPU time spent applying remote ones.
- Drips alive.
- On join: paint file size, parts, download time, decode and apply time, and time from JOIN to the first playable frame.

### Spray particles (others' spray)

- Particles alive: p50 / max, and frames at the cap (`SPRAY.maxParticles`, 3000). At the cap, new spray is lost, a visible bug with many sprayers.
- Particles emitted per second: yours, and other players'.
- Other players spraying (any, and in view) per frame: p50 / max. Correlated with frame time in the report, this answers "do others' particles cost fps?".
- CPU time of the particle update and the avatars.

### Other players

- Players in the session; in view (frustum) per frame.
- Per remote player: snapshots received per second (expected 20), gaps over 150 ms and the longest, interpolation delay and jitter (the HUD's numbers), time extrapolated, smoothed corrections, teleports, NO SIGNAL events, clock rate corrections.

### Network

- Ping: p50 / p95 / max, and pings that came back late (> 1 s) or not at all.
- Messages and bytes up and down, per message type.
- Snapshots actually sent per second (a throttled background tab sends fewer).
- The socket's `bufferedAmount`: max in the window (backpressure on the upload).
- The most messages handled in one frame, and the time spent decoding and handling them.
- Reconnects: close code, reason, time to come back. Status changes from the network log (`NetLog`).
- `navigator.connection` where it exists: type, effective type, RTT, downlink.

### Memory

- JS heap used / total / limit (`performance.memory`, Chromium).
- Paint bytes on the CPU (atlases) and on the GPU (pages).

### Errors

- `window.onerror`, `unhandledrejection` with stack; `webglcontextlost` / `restored`; console errors and warnings (counted, the first few kept).

### Device and settings (`env`, once per join)

- Build version, protocol, level, the session's PAINT DETAIL, host or joiner.
- User agent, platform, `hardwareConcurrency`, `deviceMemory`, GPU vendor and renderer (`WEBGL_debug_renderer_info`), max texture size, screen and window size, DPR, fullscreen.
- Every player setting (`src/settings.ts`), and changes to them during the session, as events.

### Server, per session

- Players; messages and bytes in and out, per type; broadcast fan-out bytes.
- Per player: snapshots received per second, ops per second, `ws.bufferedAmount` max (a client that can't keep up), clock offset from pings.
- Drip simulation time per tick: p50 / max.
- Paint MB held; paint files made: size, time, players served, queue; join, leave and drop events with close codes, time from JOIN to welcome and to the last part.

### Server, process

- Event loop delay p50 / p99 / max (`monitorEventLoopDelay`) and utilization (`eventLoopUtilization`).
- CPU user and system, heap used, `arrayBuffers`, RSS.
- GC pauses (`PerformanceObserver('gc')`): count, total, longest.
- Sessions and players live.

## Line format

One JSON object per line, with `t` the server time (ISO) and `kind`:

```json
{"t":"2026-10-14T19:02:05.120Z","kind":"client","code":"ABCD","player":3,"name":"geo","ip":"9f2c…","stats":{…}}
{"t":"2026-10-14T19:02:05.250Z","kind":"hitch","code":"ABCD","player":3,"frame":{…}}
{"t":"2026-10-14T19:02:05.000Z","kind":"session","code":"ABCD","players":6,…}
{"t":"2026-10-14T19:02:05.000Z","kind":"process","eventLoop":{…},"cpu":{…},…}
```

Client clocks are aligned to the server's with the ping offset, so all lines share one timeline.

## Running the playtest

1. Before: `npm run check` on this branch, then a dry run with 8 clients against a local server (`scripts/playtest-bots.mjs`, see below); then the deploy (`docs/playtest-devops.md`).
2. Testers: Chromium-based browsers give the most data (GPU timer, heap, long tasks); a few on Firefox or Safari check those too. Mixed hardware is the point: note who's on what.
3. Script for one session, ~45 min: everyone in, spread out, each painting their own wall (10 min); everyone on one wall at once, all spraying in each other's view (10 min); someone joins late into heavy paint, someone reloads mid-session, someone switches tabs for a minute; free play. The organizer writes down the clock time of anything odd (lag, rubber-banding, a freeze) in the chat.
4. After: the devops agent copies the `.jsonl` files off the host; `node scripts/playtest-report.mjs <files>` makes the report.

## Tools on this branch

- `scripts/playtest-bots.mjs <url> [players]`: headless clients that join one session, walk and spray nonstop, to load the server before real players do. Server-side numbers only: bots draw with SwiftShader.
- `scripts/playtest-report.mjs <files…>`: a page with one timeline per player (fps, frame time p95, GPU ms, draw calls, particles, ping, remote delay) over the server's (event loop, bytes out, buffered), hitches marked, and a table of the worst windows with their causes: the input to the audit.

## Tunables

`PLAYTEST` in `src/config.ts`: `every` (5 s), `hitchMs` (100), `maxReport` (16 KB), `minGap` (1 s, per player on the server), `keepErrors` (10).
