# Playtest build (v1.2.0-playtest)

A temporary build of 1.2.0 that records how a 4–8 player session performs (frame rate, rendering, paint, particles, network, server) so it can be audited. Players see one thing new: a notice on first launch saying this is a playtest build and what it records. Nothing else changes: no prompts in play, no setting. It lives only on this branch and is dropped after the playtest.

## What it is, and what it isn't

- **Branch** `chore/v1.2.0-playtest`, from the `v1.2.0` tag. **Tag** `v1.2.0-playtest` on its tip (an update after the first deploy gets a new tag, `v1.2.0-playtest.2`, never a moved one: a moved tag needs a force-push and a host that has fetched the old one refuses it): the VPS deploys by tag, and the pause menu shows it, so testers can see which build they're on. Branch and tag have different names on purpose: git warns when a branch and a tag share one.
- **Never merged** into `dev`, `next` or `main`. `main` stays at `v1.2.0`, so 1.3.0 still fast-forwards. `next` never contains the tag, so 1.3.0's "since the last tag" is still from `v1.2.0`.
- **No release:** no `npm version`, no `docs/releases/*.md`, no GitHub release, no `scripts/release-discord.mjs` (Discord is posted only by that script, by hand; a push or a tag posts nothing).
- **Deployed for a few days**, server and client together (`docs/playtest-devops.md`). Then back to `v1.2.0`, or on to `v1.3.0` if it's out.
- **Whatever the audit finds** goes into `docs/backlog.md` on `dev`, not here. Once it's written up, delete the branch and the tag (locally and on GitHub) and the recorded data.

## How it works

- **Client:** in a multiplayer session only, every `PLAYTEST.every` (5 s) the game sends one `stats` message (~1–2 KB JSON) with that window's aggregates, plus a `hitch` message right away when a frame takes more than `PLAYTEST.hitchMs` (100 ms). The first report after a join carries the device and settings (`env`). Single player records and sends nothing.
- **Notice:** on the first launch on a device (not in automated browsers: the tests and `npm run shots` press the menus under it), three pages in Russian (the testers'), each with its own OK (`src/playtest/notice.ts`): what's recorded, who sees it, how long it's kept, what isn't recorded, and an optional "Я играю через VPN"; what else to check (paint leaving past the can's nozzle; others' spray particles and fps: spray each other); F9 to mark a lag. Seen once all three are OK'd (`localStorage`; shown again when that's unavailable or it was closed early). Styled as the menus are, and doesn't steal pointer lock.
- **Handshake, so a rollback is safe:** this is a technical guard, not a consent switch. The server says `telemetry: 1` in `welcome`. The client sends `stats` only when it saw that. The 1.2.0 server closes any link that sends a message type it doesn't know: a playtest tab left open after a rollback to 1.2.0 must not loop on reconnects. 1.2.0 tabs left open on the playtest server send nothing and work as before. `PROTOCOL` stays 4.
- **Server:** checks each `stats` for shape and size (≤ 16 KB; a burst of 12 then 2 a second per player; dropped otherwise and counted, never a disconnect), stamps it with the server time, session code, player id and link id (see Who's who), and appends it as one JSON line to `PLAYTEST_LOG` (a directory; one file per day, `playtest-YYYY-MM-DD.jsonl`). Every `PLAYTEST.every` it also writes its own line per live session and one for the process. Unset `PLAYTEST_LOG`: nothing is written (tests, local runs).
- **Why a file, not `docker logs`:** the container's log rotates at 3 × 10 MB. The file lives on a bind mount, outside the container, so a restart keeps it.
- **Size:** plain text, ~3.5 KB per player per 5 s, about 2.5 MB per player per hour of play (the smoke test: 3.5 MB for two players in 39 minutes). 10 players for 24 hours straight is ~600 MB; real play (evenings) is tens of MB a day. Nothing is written while no session is live. Guards: at most `PLAYTEST.hitchesPerWindow` hitch lines per player per window (a hitch storm is counted, not written line by line); yesterday's file is gzipped (JSON lines shrink ~10×); past `PLAYTEST.maxDiskMB` (1 GB) the server stops writing and says so once in its log.
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
- Long animation frames (`PerformanceObserver('long-animation-frame')`, Chromium 123+; `longtask` where it's missing): count, total, longest, blocking time, and for the longest its scripts' attribution (source, function, duration) and its style and layout time. That says what held the main thread, which our own laps can't see: GC, the browser, an extension.
- Frame times also as a fixed histogram (buckets: ≤ 8, 12, 17, 25, 33, 50, 100, 250 ms, more): percentiles don't add up across windows and players, bucket counts do, so the report can give one true p99 for a player's whole session or for everyone during the shared-wall phase.
- Drift over time: fps, heap, paint pages and draw calls per window, so the report can show a slope (a leak, or a laptop throttling as it heats). Battery charging or not (`navigator.getBattery`, Chromium), at join and when it changes.
- Time the tab was hidden, unfocused, paused (pointer unlocked) or away: those frames don't count toward fps.
- `RENDER.maxFps` and the display's refresh (`refresh`: the spacing of every animation frame callback, also those the frame limit skips; the report shows it as the display's Hz), so a 60 Hz display isn't read as a drop.
- **Hitches:** a frame whose own work took over `PLAYTEST.hitchMs` (`by: cpu`: its laps say what) or a frame that came late after quick work (`by: gap`: the GPU, the browser, vsync). The frame after a slow one shows the same time in its interval, so it isn't reported twice. The hitch line is sent `PLAYTEST.hitchWait` after the frame and carries the long animation frames the browser reported around it (`loaf`).
- **Level edits:** a stepladder placed or moved, a prop built: `levelEdits` (the whole change, ms) and `bakeSync` (the light baker's part) per window. A stepladder relights the lamps around it (`src/render/bake/reach.ts`), ~70 ms on the placer and on every receiver.

### GPU and rendering

- GPU ms per pass (`scene`, `volumetrics`, `post`) and total, where `EXT_disjoint_timer_query_webgl2` exists (not in Firefox or Safari).
- Draw calls and triangles: p50 / max. Expected to stay flat however many players paint (AGENTS.md); if it climbs with players, that's a finding.
- `renderer.info`: programs, geometries, textures. **New shader programs mid-session** are logged as an event with their frame time: a compile is a classic hitch.
- Texture memory (`textureMB`): paint pages, baked light, and the fixed textures.
- Drawing buffer size, DPR, render scale, canvas size.

### Paint

- Paint pages and painted surfaces alive; pages created in the window (paint is made lazily, on first hit: a burst of first hits is a burst of allocations).
- GPU uploads: dirty rects and bytes, per frame p50 / max and in the window. The mips are made on the CPU for the dirty rect (`mipRect`) and uploaded with it, so their bytes are in the same number; there is no `generateMipmap` to count.
- Paint ops applied: local and remote, per kind (`stamp`, `roll`, `drip`), and the CPU time spent applying remote ones.
- Drips alive.
- **Paint latency:** each remote op carries its sender's time; the time from it being made to it being applied here, p50 / p95 / max (clocks aligned with the ping offset). The number players feel: "I sprayed and they saw it N ms later".
- On join: paint file size, parts, the wait for the first part (the server packs the paint first, 1–2 s for a heavily painted level) and the longest gap between parts, load (decode and apply) time, and time from JOIN to the first playable frame.

### Spray particles (others' spray)

- Particles alive: p50 / max, and frames at the cap (`SPRAY.maxParticles`, 3000). At the cap, new spray is lost, a visible bug with many sprayers.
- Particles emitted per second: yours, and other players'.
- Other players spraying (any, and in view) per frame: p50 / max. Correlated with frame time in the report, this answers "do others' particles cost fps?".
- CPU time of the particle update and the avatars.

### Other players

- Players in the session; in view (frustum) per frame.
- Per remote player: snapshots received per second (expected 20), gaps over 150 ms and the longest, interpolation delay and jitter (the HUD's numbers), time extrapolated, smoothed corrections, teleports, NO SIGNAL events, clock rate corrections.

### Network

- Ping: p50 / p95 / max, and pings that never came back (one sent less than a second ago is still on its way, not lost). Also as a fixed histogram, as frame times.
- **Stalls:** WebSocket runs on TCP, so one lost packet holds back everything behind it until it's resent (100–200 ms), then it all lands at once. Per window: gaps with no message from the server over 150 / 300 / 1000 ms, and the burst after each (messages in one frame). Only while another player is here (`peers`, the server's presence): the server sends nothing but a ping every 2 s to a lone player, and a peer with a hidden tab sends once a second, so those silences are nothing to send, not a held-up link. Snapshot inter-arrival per remote as a histogram: a healthy link is a spike at 50 ms.
- How stale others look: per remote, interpolation delay + half the ping, p50 / max.
- Messages and bytes up and down, per message type.
- Snapshots actually sent per second (a throttled background tab sends fewer).
- The socket's `bufferedAmount`: max in the window (backpressure on the upload).
- The most messages handled in one frame, and the time spent decoding and handling them.
- Reconnects: close code, reason, time to come back. Status changes from the network log (`NetLog`).
- `navigator.connection` where it exists: type, effective type, RTT, downlink.

### VPN and route

Some testers reach the server through a VPN (it isn't reachable from where they are). What that changes, and what's recorded for it:

- **More round trip:** the route goes through the VPN's exit. Recorded as ping, so it shows; the notice asks "Using a VPN?" (a checkbox, optional) so the report can split players by it instead of guessing.
- **More stalls:** a VPN over TCP (OpenVPN in TCP mode, some "stealth" modes) puts TCP inside TCP: both resend on loss, and stalls stack. WireGuard or OpenVPN over UDP don't. Recorded by the stall counters above; the report compares VPN and non-VPN players.
- **MTU:** a tunnel's smaller packets can fragment or drop big messages: the paint file on join (256 KB parts) is the one most likely to stall. Recorded: each part's arrival time on join.
- **Shared address:** testers on one VPN exit share one IP to the server. Its limits per address (24 links, 2 HOST links, 2 hosted sessions) are per IP, so a crowded exit can be turned away as `too-many`; that's in the server's events. This is why the report keys on the device, not the IP.
- **Exit changes:** a VPN that reconnects or switches exit drops the WebSocket and comes back from a new IP. Recorded: drop, close code, time to come back, and the server's event that the device's IP hash changed.
- **Route vs. WebSocket:** at join, the time of a plain `fetch('/ws')`, next to the WebSocket's own ping: when the socket is much worse than plain HTTP, it's the socket's path (a proxy, a firewall), not the route.

### Mouse

The backlog's "mouse spikes snap the camera" (Chromium on Windows: one `mousemove` of hundreds of px among small ones, or a huge one right after the lock): seen from the side (`src/playtest/mouse.ts`), `input.ts` untouched, and only while the pointer is locked.

- Per window (`mouse`): events, the largest move, moves over `PLAYTEST.mouseSpikePx`, spikes, spikes just after the lock, the most events handled in one frame, lock and unlock counts, the spacing between events (the mouse's own timestamps) and how long the browser held them (`held`).
- A spike (a move over `mouseSpikePx` and over 3x the largest of the last 8; or over `mouseLockPx` within `mouseLockMs` of the lock) is sent at once as a `mouse` line: dx, dy, the 8 moves before it, the time since the previous event, since the lock and since the window got focus, the events per frame of the last 4 frames and in this one, the frame's interval, `held`, buttons. At most `mouseSpikesPerWindow` per window; the window's count has the rest. With the device (`env`: browser, OS, GPU, DPR, refresh) that separates the kinds: a lone value mid-flick, one after the lock, one after a long frame, or a particular device.
- Ask the testers to press F9 when the camera snaps: the mark is on the same timeline.

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

- Per player: `ws.send` calls that find the socket's queue over 64 KB from before the frame (the server keeps sending to a client that can't take it; a 256 KB paint file part is over the line by itself and doesn't count), and the longest time the queue stayed over it.

### Server, process

- Event loop delay p50 / p99 / max (`monitorEventLoopDelay`) and utilization (`eventLoopUtilization`).
- CPU user and system, heap used, `arrayBuffers`, RSS.
- GC pauses (`PerformanceObserver('gc')`): count, total, longest.
- Sessions and players live.
- **Hosts:** a `host` event per HOST: the time to build the level's faces and to load the save. Both run on the event loop, so every live session waits for them.
- **After the last session ends:** the process line is written once and then every `PLAYTEST.idleEvery` seconds for `PLAYTEST.idleMinutes`, with heap used, heap total, external, array buffers and RSS, to tell memory still held from memory the allocator hasn't returned.
- `TCP_NODELAY`: `ws` sets it on every socket, so small messages aren't held back to be batched (nothing to record; Node has no getter for it).

## Line format

One JSON object per line, with `t` the server time (ISO) and `kind`:

```json
{"t":"2026-10-14T19:02:05.120Z","kind":"client","code":"ABCD","player":3,"name":"geo","ip":"9f2c…","stats":{…}}
{"t":"2026-10-14T19:02:05.250Z","kind":"hitch","code":"ABCD","player":3,"frame":{…}}
{"t":"2026-10-14T19:02:05.000Z","kind":"session","code":"ABCD","players":6,…}
{"t":"2026-10-14T19:02:05.000Z","kind":"process","eventLoop":{…},"cpu":{…},…}
```

Client clocks are aligned to the server's with the ping offset, so all lines share one timeline.

## Events and markers

- **Marker:** F9 (nothing shown) writes a `mark` line from that player: "it lagged just now". Cheaper and more exact than clock times in the chat. Tell the testers.
- **Phases:** the organizer presses Shift+F9 at the start of each phase of the script (below): the phase number goes up by one, for everyone, so the report can compare phases. (F9 is free in the player build: F3's profiler uses it only in the dev build.)
- **Pipeline test:** `?playtest-hitch` (URL flag) stalls one frame for 250 ms every 30 s: used once before the playtest to see the hitch end up in the file and the report. Never on in the playtest itself.

## Running the playtest

1. Before: `npm run check` on this branch, then a dry run with 8 clients against a local server (`scripts/playtest-bots.mjs`, see below); then the deploy (`docs/playtest-devops.md`).
2. Testers: Chromium-based browsers give the most data (GPU timer, heap, long tasks); a few on Firefox or Safari check those too. Mixed hardware is the point: note who's on what.
3. Script for one session, ~45 min: everyone in, spread out, each painting their own wall (10 min); everyone on one wall at once, all spraying in each other's view (10 min); someone joins late into heavy paint, someone reloads mid-session, someone switches tabs for a minute; free play. The organizer writes down the clock time of anything odd (lag, rubber-banding, a freeze) in the chat.
4. After: the devops agent copies the `.jsonl` files off the host; `node scripts/playtest-report.mjs <files>` makes the report.

## Tools on this branch

- `npm run playtest:bots -- <ws url> [players] [minutes] [level]` (`server/playtest-bots.ts`): bots that host or join one session, walk in circles and spray nonstop (state 20 times a second, 3 paint ops each time, pings, empty reports), to load the server before real players do. They draw nothing: server and link numbers only. Locally each comes from its own address; never point them at the live server during the playtest (they'd be in the data, though the report leaves them out).
- `npm run playtest:report -- <files…> [--out report.html]` (`scripts/playtest-report.mjs`): one HTML page: who's who by device, each device's numbers, timelines (fps, frame p95, GPU, draw calls, others' particles, ping, silences, heap; the server's event loop, CPU, bytes out) with marks and phases, phases compared, the worst windows and hitches with what took the time, the network split by VPN, joins, errors, the server's numbers and every link event: the input to the audit.
- Tried locally (2026-10-11, again with the second build): 10 bots for a minute (10 in, ping ≤ 1 ms, ~1.4 MB/s sent in all, no report dropped, no bad message); 8 bots for a minute (8 in, ping ≤ 3 ms, ~860 KB/s sent in all, event loop fine); 3 browsers joining 5 spraying bots for 90 s (5.3 KB per report, its own cost ~6 ms per 5 s spread over ~300 frames, the report itself built between frames in ~1 ms); the notice, OK, and a reload not showing it again.

## Tunables

`PLAYTEST` in `src/config.ts`: `every` (5 s), `hitchMs` (100), `hitchesPerWindow` (5), `hitchWait` (300 ms), `mouseSpikePx` / `mouseSpikesPerWindow` / `mouseLockPx` / `mouseLockMs` (300 / 5 / 400 / 150), `idleEvery` / `idleMinutes` (60 s / 10), `maxReport` (16 KB), `burst` / `rate` (12 reports at once, 2 a second after, per player on the server), `keepErrors` (10), `keepEvents` (40), `samples` (1500 per metric per window), `maxDiskMB` (1024), `stallMs` (150 / 300 / 1000), `queueWarn` (64 KB), the histogram buckets (`frameBuckets`, `pingBuckets`, `arrivalBuckets`), `fakeHitchMs` / `fakeHitchEvery` (250 ms every 30 s).

## Reading

- [Detecting and fixing frame hitches](https://bugnet.io/blog/how-to-detect-and-fix-frame-hitches-and-stutter): averages hide hitches; watch p95 / p99 and capture what ran in the spike frame.
- [Game profiling](https://www.skills.sh/rudolfolah/profiling-code/game-profiling): for rare hitches report the worst frame and the count, not a p99 of a few samples; fix settings and warm up before measuring.
- [Unity: simulating hitches](https://docs.unity3d.com/6000.2/Documentation/Manual/time-simulate-hitches.html): inject hitches to test that they're caught (`?playtest-hitch`).
- [Counter-Strike 2's telemetry HUD](https://help.steampowered.com/faqs/view/5E6F-5B36-5485-F6B9): split frame time from network problems.
- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames), [spec](https://www.w3.org/TR/2026/WD-long-animation-frames-20260428/), [DebugBear on LoAF](https://www.debugbear.com/blog/long-animation-frames): what held a frame, with script attribution; Chromium only.
- [KHR_parallel_shader_compile](https://developer.mozilla.org/docs/Web/API/KHR_parallel_shader_compile): shader compiles block; three.js compiles on first use, so a new program mid-session is a hitch suspect.
- [Why can't I send UDP packets from a browser?](https://gafferongames.com/post/why_cant_i_send_udp_packets_from_a_browser/), [WebSocket vs TCP](https://websocket.org/reference/websocket-vs-tcp/): head-of-line blocking on a WebSocket, the stall-then-burst pattern.
- [Unity Netcode metrics](https://docs.unity3d.com/Packages/com.unity.netcode@1.8/manual/metrics.html), [interpolation delay calculator](https://west-games.com/interpolation-delay-calculator/): RTT, jitter and interpolation delay as the core link numbers; size the buffer from a high percentile of jitter, not the average.
- [Peeking into VALORANT's netcode](https://technology.riotgames.com/node/111): what a player sees of others is old by interpolation delay plus half the ping.
- [WebSocket backpressure](https://qaskills.sh/blog/websocket-testing-backpressure-limits): `bufferedAmount` is the overload signal, but not every queue.
- [How a VPN affects ping and packet loss](https://cyberpanel.net/blog/how-a-vpn-affects-ping-packet-loss-and-latency-in-gaming): the route counts more than the cipher; TCP tunnels amplify jitter; MTU causes micro-stutters.
