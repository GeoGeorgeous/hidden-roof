# Backlog

The one place for what's left to do: bugs, things to check, performance, tests, ideas. Notes for later go here, not into other docs. Items are in the order they were triaged; the fields drive the board (status: Requested, Planned, In Progress, Blocked, Done; priority: Urgent, High, Medium, Low). `Done` items stay until the release that ships them, then the release commit deletes them.

### A game opened or reloaded in a hidden tab doesn't load until it's shown
- id: BL-001
- type: bug
- status: Done
- priority: High
- size: XS
- area: ui
- release: later
- source: code review 2026-10-11

`loadStep` (`src/loading.ts`) waits for an animation frame, and a hidden tab gets none. A tab opened in the background loads only once looked at; one reloaded in a session and left hidden doesn't come back into it, and after `SERVER.rejoinWindow` (60 s) comes back as a new player (no stepladder; what they carried comes back by name). Do: in `loadStep`, a plain `setTimeout` while `document.hidden`.



### The loading screen says LOADING forever when the game can't start
- id: BL-002
- type: bug
- status: Done
- priority: High
- size: S
- area: ui
- release: later
- source: code review 2026-10-11

No WebGL (`new THREE.WebGLRenderer` in `main.ts` throws) or a script that doesn't load. Do: catch the renderer's failure and say so on the loading screen (as `loadFailed` does for the level).

Decided (2026-10-14): the fix and an automated test, in its own file beside the smoke test (~5–8 s): Chromium with `--disable-3d-apis` (no WebGL), and one with the main script blocked. To see it by hand in Chrome: start it with `--disable-3d-apis --user-data-dir=<a temp dir>` (`chrome://gpu` shows WebGL: Disabled), or DevTools → Network → Block request URL on `main-*.js` (not `index-*.js`: that is the boot script that writes the message).

### Strokes made while the link is dying vanish on rejoin
- id: BL-003
- type: bug
- status: Done
- priority: Urgent
- size: M
- area: net
- release: later
- source: playtest 2026-10-12

7 players, 2.6 h; all findings in `docs/playtest-multiplayer.md`. `Multiplayer.welcome` (`src/net/multiplayer.ts`) replaces the player's paint with the server's file and clears `ops`, `opTimes` and `paint.log`; ops sent into a stalled socket are never acknowledged. So everything painted from the stall's start to the end of the rejoin (silence 6 s + retry + a 4 s median, 18 s worst, download) is lost: 3–20 s of work, 81 times in the test. Do: each op batch carries a per-player sequence number, the server acks the highest in `pong` and drops repeats by token, the client keeps unacked batches, and after `loadPaint` applies them again and resends. Bump `PROTOCOL`.

Reproduced (2026-10-14, `npm run test:weak-link`): a stroke B makes between the drop and its welcome is gone, on B and on A; a stroke made while the link was only slow survives (it reached the server before the drop).

Fixed (2026-10-14, `PROTOCOL` 5): op batches carry `seq`; the server acks the highest it has in `pong` and the welcome, and drops a batch it has had. The game keeps unacked batches (`src/net/outbox.ts`); back after a drop, it paints them and what it painted meanwhile again over the welcome's paint and sends them again. Tests: `npm test` (the outbox), `npm run test:server` (a resent batch is dropped, the next goes; a new tab counts from 1), `npm run test:weak-link` `stall` and the new `cut` (a link that dies with a stroke on its way, the stroke lost with it) fail on a lost stroke.

### The server's heartbeat kills links that are only stalled downstream
- id: BL-004
- type: bug
- status: Done
- priority: Urgent
- size: S
- area: net
- release: later
- source: playtest 2026-10-12

79 of 81 drops (code 1006) fell on the 10 s heartbeat (`server/main.ts`: `terminate()` when no pong came since the last ping); in 62 of 69 the player's reports still reached the server less than 10 s before the kill, so the uplink worked and the ping sat in the downlink queue behind ops (app pings of 11–16 s were measured). 40% of the drops (32 of 81) came within 30 s of a rejoin: the paint file (0.3–3.4 MB) loads the same weak path, and the next kill follows. Do: count any message from the client as alive (`state` arrives at 20 Hz); let the game wait longer than 6 s for the server (`lastHeard`, `SERVER.ping * 3`) before it closes and rejoins, or make it adaptive.

Reproduced (2026-10-14, `npm run test:weak-link`): B's downlink narrowed to 8 KB/s while A paints, its uplink still working: the server drops B with 1006 exactly 20.0 s after the link opened (two missed heartbeats), while B's reports still arrive.

Fixed (2026-10-14): the server counts any bytes from a game as alive (`SERVER.heartbeat`, 10 s: dropped after a whole beat with nothing), and a game sends a ping at least every `SERVER.ping` when it has nothing else to send (its paint file coming down, a hidden tab). The game waits `NET.serverSilence` (15 s, was 6) for the server before it closes and rejoins. A paint file comes in parts of 32 KB (`SERVER.partBytes`, was 256): a part took 32 s at 8 KB/s, so the game gave up on its join (`NET.connectTimeout`, 15 s) and a slow link could never get back into a painted session. Tests: `npm run test:server` (a game that sends but answers no ping stays, a silent one goes); `npm run test:weak-link` `slow`, `three-players` and the new `slow-join` (back in over 8 KB/s with a 382 KB paint file: 58 s, no drop; without the game's ping the server drops it 20 s into the download, with 256 KB parts the game gives up) fail on any such drop.

### A player who is away over 60 s comes back as a new one
- id: BL-005
- type: bug
- status: Done
- priority: High
- size: XS
- area: net
- release: later
- source: playtest 2026-10-12

Five times in the playtest (`SERVER.rejoinWindow`): the stepladder and carried items are lost (what they carried returns by name). Under the weak-link drops a minute is short. Do: a longer window (config; 3–5 min).



### Water tank roofs fall through
- id: BL-006
- type: bug
- status: Done
- priority: Urgent
- size: S
- area: level
- release: later
- source: stress test

Tanks on stands and the water tank: the roof has no collider, so the player walks in between; crouching shows the real flat roof, which can be painted (the oval roofs are fine). Seen at (-10.07, 3.40, -8.57) and (-7.13, 4.32, -14.12). Do: give those props a roof collider.

Fixed (2026-10-14): cones built no collider, so the player fell through the roof onto the tank's flat top inside it. A cone now collides as a stack of short cylinders (`coneColliders`, `src/level/build-prop.ts`); test: `game.test.mjs` drops a player on each tank roof.

### Spraying and shaking the can work at the same time
- id: BL-007
- type: bug
- status: Done
- priority: Urgent
- size: S
- area: input
- release: later
- source: stress test

Painting and shaking the can are mutually exclusive: one or the other. Today both run at once, so a player can shake forever and keep painting. Do: shaking blocks painting and painting blocks shaking.



### Why did everyone show DISCONNECTED?
- id: BL-009
- type: bug
- status: Done
- priority: Medium
- size: S
- area: net
- release: later
- source: playtest 2026-10-12

In the playtest the host saw all others as DISCONNECTED, a label only the server's `presence: dropped` sets (`NO SIGNAL` is the game's own). The data can't tell if the others really dropped, a welcome lists them as dropped, or queued presence arrives in a burst. Do: two clients in `scripts/multiplayer.test.mjs` style, one with its downlink stalled for 15 s, and log the `presence` and `players[].state` the other receives (`docs/playtest-multiplayer.md`).

Triage notes (2026-10-14): research, not a fix: write the stalled-downlink test first, then decide.

Explained (2026-10-14, `npm run test:weak-link`): A shows B as dropped (DISCONNECTED) the moment the server's heartbeat drops B's link (BL-004), and as here again a second later once B is back. The playtest's drops came in waves of 2–3 players, so everyone showed DISCONNECTED. Fixing BL-004 should end most of it; check again with the stand then.

Checked (2026-10-14, after BL-004): on a slow link (`slow`, `three-players`) A shows B as here all along; DISCONNECTED now comes only when a link is really dead (`stall`, `past-rejoin-window`).

### Mouse spikes snap the camera (Chrome on Windows)
- id: BL-010
- type: bug
- status: Blocked
- priority: Medium
- size: S
- area: input
- release: later
- blocked-by: the owner's decision
- source: profile 2026-10-10

A profile on Windows 11, Chrome 154: during a fast flick, one `mousemove` of 458 px among events of at most 123 px (one frame with none, then three at once); the camera jumped 60°. The frame took 16.7 ms: a bad input value, not a stall. Once in 42 minutes, 14 s after the lock was taken. `src/input.ts` adds every `movementX/Y` as it comes; unchanged since 1.0.

Known: a Chromium bug on Windows since at least 2017 (Chrome 62, jumps of 300–400 px, crbug 781182: [three.js #12757](https://github.com/mrdoob/three.js/issues/12757)), still reported in 2023 and 2025 (100–300 px in the direction of the move, Chrome, Edge and Opera on Windows, mostly with 1000 Hz mice, rare at 125 Hz: [three.js #27040](https://github.com/mrdoob/three.js/issues/27040), [t2-mapper #7](https://github.com/exogen/t2-mapper/issues/7)); closed as a device issue no engine can fix. A second kind: one huge value right after the lock is taken ([world PR #31](https://github.com/kathirmeyyappan/world/pull/31) drops motion for 150 ms after a lock change and events over 400 px). `requestPointerLock({ unadjustedMovement: true })` ([web.dev](https://web.dev/articles/disable-mouse-acceleration), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)) turns off OS acceleration; no source says it ends the spikes, and it changes the feel for players used to acceleration.

Do: in `input.ts`, drop one event over 300 px (config) that is also over 3× the largest of the last ~8, and motion in the 100 ms after the lock is taken; count what's dropped in the profiler's report. A fixed cap alone would drop real flicks of 125 Hz mice at high DPI (those build up over several events, so the relative rule keeps them). Test with synthetic `MouseEvent`s: a flick passes, a lone 458 px among 60–120 px is dropped, a ramp of 250–350 px passes. Maybe later a RAW MOUSE setting (`unadjustedMovement`, off by default, with the fallback).

Triage notes (2026-10-14): needs a human: the drop rule changes how the mouse feels; judge it with real 125 Hz and 1000 Hz mice on Windows.

Blocked (2026-10-14): the owner decides between the drop rule, a RAW MOUSE setting, both or nothing, after looking into it. To reproduce first: (1) a test feeding synthetic `mousemove`s with the profile's numbers (one 458 px among 60–120 px) shows the 60° snap; (2) a counter of events over 300 px in the F3 profiler (time since the lock, size, the events around it), and a session on Windows with a 1000 Hz mouse, to see how often it happens.

### Pickup rings on the title screen are sized for where you stand
- id: BL-011
- type: bug
- status: Planned
- priority: Low
- size: XS
- area: render
- release: later
- source: check by hand

`ringSize` in `src/pickups/pickups.ts` uses the player's camera, not the title view: the lime one, ~16 m from the title camera and ~29 m from the spawn, shows almost twice its size. Do: size them for the camera that draws (`shown` in `main.ts`), or leave it.

Triage notes (2026-10-14): needs a decision: size the rings for the title camera, or leave it.

### A remote player's correction glides too fast on a bad link
- id: BL-012
- type: bug
- status: Done
- priority: Low
- size: S
- area: net
- release: later
- source: check by hand

Up to ~3× walking speed (16 m/s at 60 fps, over 0.1–0.2 s); the ghost test allows it (it checks for jumps: 30–65 m/s unsmoothed). A speed cap changes how other players look: judge it in F3 → Test → Ghost (net: hiccups 0.2, record a walk that stops, PLAY), then decide.

Fixed (2026-10-14): a correction closes at `NET.smoothing` as before but never faster than `NET.glideSpeed` (4 m/s, config) on top of how the player moves: the ghost on a bad link tops out at 9 m/s walking (5 + 4), was 16. The game test's ghost check holds it to that. Judge the look on real devices (F3 → Test → Ghost, hiccups 0.2); a bigger correction now takes longer to close (2 m, the teleport limit: 0.5 s).

### Check by hand before a release
- id: BL-013
- type: test
- status: Planned
- priority: Medium
- size: M
- area: build
- release: later
- source: check by hand

Walking along railings and landings (the corner slip, `PLAYER.cornerSlip`), the lattice mast (can't be climbed), the clear windows (see through, paint from both sides, a stepladder against one from behind), pickups (ring shapes, glow, tags within 4 m, hidden behind walls), and a session from two devices on one network (paint, presence, reload, the network log).

Decided (2026-10-17, audit S1.1): for 1.4.0 the owner tests next on one device (a normal and an incognito window; Chrome, Firefox, Edge), since the home network blocks LAN play. The Mac and the weakest laptop are checked on production after the release; a failure there is a 1.4.1 patch. The split is in `docs/audit-2026-10-17.md` → Decisions.



### The ESC menu in a real browser
- id: BL-014
- type: test
- status: Planned
- priority: Low
- size: S
- area: ui
- release: later
- source: check by hand 2026-10-11

Enter in HOST's name field hosts, and the menu at 1366×768 and in a small window. Checked in headed Chromium 153 with real keys: in fullscreen, Esc tapped on the pause screen resumes on release, held it fills the rings and Chromium leaves as they fill (1500 ms), and so does holding EXIT FULLSCREEN. Windowed, Chromium takes the Esc that frees the mouse and refuses the lock again without a click, so Esc doesn't resume there (as before the hold). Still to see: Firefox and Safari (one Esc leaves fullscreen, a plain ESC key on the control).

Triage notes (2026-10-14): needs a human: a check in real Firefox and Safari.

Decided (2026-10-17, audit S1.1): Firefox on Windows before the 1.4.0 release (T1.16); Safari and Firefox on the Mac after it, on production.

Checked (2026-10-18, T1.16 by an agent, headed Firefox 155 and WebKit 26.6 on Linux, automated keys): in fullscreen one Esc leaves and doesn't resume, held it leaves, EXIT FULLSCREEN leaves at once, no rings; windowed, Esc on the pause screen resumes (both give the pointer lock back on its release). PLAY's ESC key now shows there too (`esc-hold.ts`). Left for a human: a real held key, and Safari on the Mac.

### Rework the drips: independent chance, no stacking across tools
- id: BL-015
- type: refactor
- status: Requested
- priority: High
- size: L
- area: paint
- release: later
- source: owner

The drip settings are not obvious: `chance` seems to be moved by the paint's density and other parameters (`DRIPS` and each tool's and cap's `drips`, `src/config.ts`). Make each setting do one thing, so tuning is predictable. Includes the core bug (was BL-008): roll a first coat, then spray on it, and the drips get stronger when they shouldn't; check how the excess paint (`DRIPS`) adds up across tools. Reproduce it with a test first. Part of reworking the painting.



### Tune drips per tool by hand; remove the strong ones
- id: BL-016
- type: chore
- status: Blocked
- priority: High
- size: M
- area: paint
- release: later
- blocked-by: BL-015
- source: owner

Drips are too strong in general. Tune them for each tool (caps, marker, roller) by hand, by eye, after the config is clear. Maybe a cooldown on the paint (an open question).



### Tune the caps so painting feels better
- id: BL-017
- type: chore
- status: Requested
- priority: Medium
- size: S
- area: paint
- release: later
- source: owner

Adjust the can caps (`spread`, `rate`, `strength`, `dotSize`, `softness`) until painting feels right. Compare with Bombing!! 2.



### Key bindings settings
- id: BL-018
- type: feature
- status: Done
- priority: High
- size: M
- area: input
- release: next
- source: stress test feedback

A screen to rebind the keys. Done (audit S3.5): Settings → Controls, two slots per play action, swap on conflict, reserved keys refused, saved as overrides.



### Remember the chosen settings
- id: BL-019
- type: feature
- status: Done
- priority: High
- size: S
- area: ui
- release: next
- source: stress test feedback

`src/settings.ts` already saves ink style, pixel scale, max FPS, volumetrics, paint detail and city detail. Add to what it saves: the key layout, volume and sound, mouse sensitivity and FOV. Done (audit S3.5): gameplay, sound and on/off settings and the key bindings are saved as overrides of config's defaults (`src/settings-store.ts`).



### Pick a color with a click on the mouse wheel
- id: BL-020
- type: feature
- status: Done
- priority: Medium
- size: S
- area: input
- release: next
- source: owner

An eyedropper (owner, 2026-10-18): the wheel's click picks the owned color nearest the paint under the crosshair. Done (audit S3.5): action `pick`, `src/tools/eyedropper.ts`.

### Block the browser zoom: Ctrl +/−/0, Ctrl+wheel, trackpad pinch
- id: BL-023
- type: feature
- status: Done
- priority: Medium
- size: XS
- area: ui
- release: next
- source: owner

Blocked in the game and in the menus (one entry in the guard table, BL-081). Zoom changes the render buffer (a 3080 Ti rendered 3840×2160 for a 2560×1440 screen at zoom); BL-026 caps the buffer too.

Zooming out (not in) is what makes the buffer bigger: see BL-026.

### Paint ops are 94% of the downstream bytes, ~250 B each
- id: BL-024
- type: perf
- status: In Progress
- priority: High
- size: L
- area: net
- release: later
- source: playtest 2026-10-12

JSON stamps with full-precision floats and the surface key, uncompressed; a painting player makes a median 140 ops/s (p99 ~1800), and the server repeats each to the 5–6 others. Total out of the server: p50 0.5 MB/s, p99 3.2 MB/s, max 4.5 MB/s for 7 players, 7.3 GB in 2.6 h. Players on weak links (home Wi-Fi, VPN, hotspot) died more the more they received: 1.5% of 5 s windows were followed by a drop within 25 s below 100 KB/s, 28% above 500 KB/s; players on good links barely moved (0.4% to 4%). Do, in this order: (1) a binary op (quantized u/v/radius, a small integer for the surface key), every client applying the quantized values so texels still match, ~20 B; (2) merge a frame's stamps that land on the same texels; (3) when a link's ping grows past ~1 s, send it only the newest `state` per player and wait with ops. Read `docs/multiplayer-audit.md` first (the "nothing is compressed" decision in `protocol.ts`). Effort M–L.

Step (1) done (2026-10-14, `PROTOCOL` 6): ops travel packed (`src/op-wire.ts`): a surface as its place among the session's sorted surface keys, every number as u16 (i16 for a roll's axis); 23 B a stamp, 31 a roll, 21 a run, plus 8 a batch. The painter paints with the rounded numbers too (`painting.ts`, `paint-drips.ts`), so the loopback, saves and the server still match the browser to the bit; the golden hashes changed once (the strokes look the same, drip runs land differently). Measured (`npm run test:weak-link` `bytes`): 185 → 28 B down per stamp, so a painter's ops at the stand's rate (~4.5 KB/s) now fit the `slow` link (8 KB/s). Left: (2) and (3), only if the next playtest (BL-076) still shows weak links falling behind; (2) must paint what the merged op paints, or texels drift apart.

Found (2026-10-18, T1.13): in a live session the players' paint and the server's save were not identical: ~100 of ~6,000 painted texels apart after every tool on one wall (Chromium, Firefox and WebKit alike; identical with drips off). A run's paint per row depended on the frame times of the client running it; now it depends on the row (`paint-drips.ts`, golden hashes changed once): ~50–80 texels apart. The rest is order: a run trickles in real time, so it meets the next strokes (and the sponge) at another moment on each client. Bit-exact would need a run painted whole when it starts (no trickle). Decided (owner, 2026-10-18): runs keep flowing down slowly; the drift stays. A fix would have to keep the flow on screen (e.g. the run whole in the shared paint, animated only in what's drawn).

### Every rejoin uploads all paint pages in one frame
- id: BL-025
- type: perf
- status: Done
- priority: Medium
- size: S
- area: paint
- release: later
- source: playtest 2026-10-12

83 of the test's 94 frames over 100 ms (median 230 ms, worst 1.1 s) came within 30 s of a welcome: `paint + hud` lap with 170–470 uploads and 28–195 MB in one frame (`PaintGpu.flush`, `src/paint-gpu.ts`). The JS heap also jumps to 0.8–1 GB on each join (steady ~0.5 GB). Do: spread the first upload over frames, about one paint page (~24 MB) a frame (config), in any order: the paint shows within a second of the join, with no freeze. What `loadPaint` allocates is BL-083.

### Never render more pixels than the screen has
- id: BL-026
- type: perf
- status: Done
- priority: Medium
- size: S
- area: render
- release: later
- source: playtest 2026-10-12

The buffer is the window's size in CSS pixels (`renderer.setPixelRatio(1 / RENDER.pixelScale)`, `devicePixelRatio` unused). A 3080 Ti rendered 3840×2160 for a 2560×1440 screen: the page zoomed out to ~67% (Ctrl + wheel down) makes more CSS pixels than the screen has. Blocking the zoom (BL-023) stops new zooms, but Chrome remembers a site's zoom, and its menu can still zoom. Do: a pixel ratio of `min(1, devicePixelRatio) / RENDER.pixelScale`, so the buffer never has more pixels than the screen (no change at zoom 100% or above). The weak-GPU hint is BL-084.

### A closed session's paint stays in the server's memory until a GC
- id: BL-027
- type: perf
- status: Planned
- priority: Low
- size: XS
- area: net
- release: later
- source: measured 2026-10-13

Node 24: 320 MB of dropped `ArrayBuffer`s stay (rss 366 MB) while idle, and `gc()` frees them (rss 47 MB). The host's container showed ~500 MB with no session. `liveMemory` (`server/log.ts`: heap + arrayBuffers) counts that garbage against `HOST_MEMORY`, so a new session could be turned away as busy until the next GC. Do: run `node --expose-gc` and call `gc()` when a session closes, or sum the open sessions' `memory.now` instead.

Triage notes (2026-10-14): needs the host: `--expose-gc` changes how the server is started (Dockerfile, `docs/deploy.md`); or the other way, summing the open sessions' memory, needs a decision.

### Other players' spray with many players
- id: BL-028
- type: perf
- status: Planned
- priority: Medium
- size: M
- area: paint
- release: later
- source: measured

A2000 laptop, 1280×720, fake players sending no paint ops: 19 others walking 124 fps, all 19 spraying 84 fps; their particles cost ~0.2 ms of CPU a frame per sprayer (a ray each a frame, `spray/particles.ts` `show`, a pool of 3000). Their paint ops come on top, unmeasured. Do: particles only for the nearest few sprayers, or reuse each sprayer's ray for a few frames; or a lower `SERVER.maxPlayers` (XS). Measure a real session of 8 to 20 first.



### The roof level's edits of 2026-10-10 cost a little
- id: BL-029
- type: perf
- status: Requested
- priority: Low
- size: S
- area: level
- release: later
- source: measured 2026-10-11

Two edits (lamps, signs, ducts, 4 clear windows; then railings, parapets, roof lights, skylights, ducts: 1373 → 1464 props). At six fixed views at 1280×720 on a quiet machine (median of 3 runs, `next` before them vs `dev` after): Intel UHD GPU time +3–9% (14.3–17.0 → 15.6–17.7 ms, scene + post), CPU +0.4–1.4 ms, draw calls +4–21% (128–374 → 133–422), triangles +8%. On the A2000 the GPU barely moves (±6%). The extra calls are merged tile batches (more materials and finishes per tile) and glass: no draw call per prop. Not urgent; if the weak GPU needs room, fewer material and finish variants per tile first.



### Precompressed assets
- id: BL-030
- type: perf
- status: Planned
- priority: Low
- size: S
- area: deploy
- release: later
- source: VPS recon 2026-10-11

Caddy compresses every response on the fly (zstd at its default level comes out 1.5% bigger than gzip for the game's JS: 911 KB → ~270 KB). Brotli 11, made at build time, would be ~20% smaller and cost no CPU per request. Do: Vite emits `.br` and `.gz` next to each asset, and Caddy serves them (`file_server { precompressed br gzip }`, `docs/deploy.md` §5, on the host).

Triage notes (2026-10-14): needs the host: Caddy's `precompressed` is set on the VPS, outside this repo.

### Four shaders still compile in the first frame
- id: BL-031
- type: perf
- status: Requested
- priority: Low
- size: S
- area: render
- release: later

Under the loading screen: the moon's shadow pass (two depth materials) and two drawn outside the scenes `post.warm` compiles (a ShaderMaterial, a MeshBasicMaterial). Nothing compiles at START or later. Do, if loading on Windows is slow: warm them as `Volumetrics.warm` does.



### One load of the roof took 62 s
- id: BL-032
- type: bug
- status: Requested
- priority: Low
- size: S
- area: render
- release: later
- source: ad-hoc script 2026-10-11

On the real GPU (headed Chromium on WSLg, its own Vite server); 8 other loads took 4.8–5.8 s, and 3 reruns didn't show it again. Cause not found. If a player reports a long load, start here.



### The hint wall takes two paint pages
- id: BL-033
- type: perf
- status: Done
- priority: Medium
- size: S
- area: level
- release: next

It spans two level tiles (`p89`, `p90` and a joint), so every game starts with two 2048² paint pages: +42.5 MB of GPU memory before anything is painted. Do: move the hint (or the wall) into one tile and save the level and its paint again (build mode P).

Triage notes (2026-10-14): needs a human: moving the wall and saving the level and its paint again is done in build mode (P).

Decided (2026-10-17, audit S1.1): fixed by BL-090. The roof's level paint is dropped, so the hint wall and its two pages go with it.

### Paint pages at ULTRA use ~0.95 GB of GPU memory
- id: BL-034
- type: perf
- status: Planned
- priority: Medium
- size: L
- area: paint
- release: later
- source: profile (1.1.0)

After 40 minutes of painting at ULTRA a profile counted 45 more GPU textures (~0.95 GB if paint pages). Confirmed by the playtest of 2026-10-12: 49 paint pages, 1041 MB of GPU memory at 58% of the level painted; all painted would be an estimated 1.5–2 GB. Already so in 1.1.0. Do: smaller or fewer pages for sparse paint (the paint file was 23% of the atlases: most of each page is empty), or a cap with a warning.



### Player movement has no test
- id: BL-035
- type: test
- status: Planned
- priority: Medium
- size: M
- area: input
- release: later

Walking, collisions (and the corner slip), jumps, climbing, ladders. A fixed-step check per move (ladders have one: `scripts/game.test.mjs`).



### Light baking and weather run on the wall clock
- id: BL-036
- type: test
- status: Planned
- priority: Low
- size: S
- area: render
- release: later

`baker.ts` budget, rain: screenshots aren't byte-comparable. Compare pictures only after the bake finishes, rain off.

Triage notes (2026-10-14): unclear what to do: no test compares pictures byte for byte today. Research first: which test would.

### The multiplayer test's first page didn't build its level within 120 s
- id: BL-037
- type: test
- status: Requested
- priority: Low
- size: S
- area: net
- release: later
- source: 2026-10-10

Once (another agent testing on the machine too); not seen since. If it repeats, find what held it up (the page's console, the machine's load).

Again 2026-10-18, in the game test (the `level paint` check's page, full check on dev 988813b, nothing else running); the check passed alone after. Since then a load that doesn't end fails naming the loading screen's step and the page's last warnings, errors and failed requests (`gameReady`, `scripts/test-browser.mjs`): read those when it repeats.



### Source files over the ~400 line limit
- id: BL-038
- type: refactor
- status: Planned
- priority: Low
- size: S
- area: build
- release: later
- source: review of 1.3.0

`src/net/multiplayer.ts` is 408 lines, `src/hud.ts` 410, `src/main.ts` 403. Split by responsibility the next time any grows (`multiplayer.ts`: the paint-file download and the heartbeat; `hud.ts`: the perf lines or the menu's pages; `main.ts`: the load steps).

Triage notes (2026-10-14): wait, as the item says, until one of the files grows: splitting `main.ts` now risks the boot for no gain.

### More marker types, placed on the map
- id: BL-039
- type: feature
- status: Requested
- priority: Medium
- size: M
- area: level
- release: later
- source: owner



### New marker brushes: rectangular and calligraphy
- id: BL-042
- type: feature
- status: Requested
- priority: Medium
- size: M
- area: paint
- release: later
- source: owner



### One public server, running 24/7
- id: BL-043
- type: feature
- status: Requested
- priority: High
- size: L
- area: deploy
- release: later
- source: owner

See `docs/deploy.md`.



### Disable host and join (don't remove them)
- id: BL-044
- type: chore
- status: Blocked
- priority: Medium
- size: S
- area: net
- release: later
- blocked-by: BL-043
- source: owner

Disable, with stubs, and switch them off on the server's side too.



### A window of public servers instead of host and join
- id: BL-045
- type: feature
- status: Blocked
- priority: Medium
- size: M
- area: ui
- release: later
- blocked-by: BL-043, BL-044
- source: owner

Name, number of players and ping (one server for now). Build the UI of the new screen in Claude Code.



### A queue to enter the server
- id: BL-046
- type: feature
- status: Blocked
- priority: Medium
- size: M
- area: net
- release: later
- blocked-by: BL-043
- source: owner



### Admin panel: players online, ban by IP
- id: BL-047
- type: feature
- status: Blocked
- priority: Medium
- size: L
- area: net
- release: later
- blocked-by: BL-043
- source: owner

See who is online; block by IP forever or for a time.



### Check when the checks of AGENTS.md run in the test cycle
- id: BL-049
- type: chore
- status: Done
- priority: Low
- size: XS
- area: build
- release: later
- source: owner

On every commit, or only on `dev`?



### Wire cutting
- id: BL-050
- type: feature
- status: Requested
- priority: Low
- size: M
- area: level
- release: later
- source: owner



### Dynamic wire length
- id: BL-051
- type: feature
- status: Requested
- priority: Low
- size: M
- area: level
- release: later
- source: owner



### Lamps that can be fixed to the floor
- id: BL-052
- type: feature
- status: Requested
- priority: Low
- size: S
- area: level
- release: later
- source: owner



### Lamps that light signs
- id: BL-053
- type: feature
- status: Requested
- priority: Low
- size: M
- area: level
- release: later
- source: owner



### New sign sizes, including big rectangular and square ones
- id: BL-054
- type: feature
- status: Requested
- priority: Low
- size: S
- area: level
- release: later
- source: owner



### Group the props better in build mode
- id: BL-055
- type: chore
- status: Requested
- priority: Low
- size: S
- area: build
- release: later
- source: owner



### New character avatar with a correct rig
- id: BL-056
- type: feature
- status: Requested
- priority: Medium
- size: L
- area: avatar
- release: later
- source: owner

See `docs/avatar.md`.



### Two body types: male and female
- id: BL-057
- type: feature
- status: Blocked
- priority: Low
- size: L
- area: avatar
- release: later
- blocked-by: BL-056
- source: owner



### Clothing attached as meshes
- id: BL-058
- type: feature
- status: Blocked
- priority: Low
- size: L
- area: avatar
- release: later
- blocked-by: BL-056, BL-057
- source: owner

Hoodies, tank tops, pants, sweatshirts, caps, bandanas and boots.



### UI for character customization
- id: BL-059
- type: feature
- status: Blocked
- priority: Low
- size: M
- area: avatar
- release: later
- blocked-by: BL-058
- source: owner



### Avatar for NPCs, first-person hands, hood outside F3
- id: BL-060
- type: feature
- status: Blocked
- priority: Low
- size: L
- area: avatar
- release: later
- blocked-by: BL-056
- source: ideas

NPCs moving around, talking, helping; first-person hands from the avatar's hand; the hood up or down outside F3 (`docs/avatar.md`).



### A player in the style of an old iPod Classic
- id: BL-061
- type: idea
- status: Requested
- priority: Low
- size: M
- area: ui
- release: later
- source: owner



### Photo mode: Polaroid cartridges or an old 2000s point-and-shoot camera
- id: BL-062
- type: idea
- status: Requested
- priority: Low
- size: M
- area: ui
- release: later
- source: owner

A better screenshot (by K). Future idea, not approved: research first. Undecided which one: a Polaroid with cartridges, or a 2000s point-and-shoot digital camera (the point-and-shoot is simpler: frame, flash, grain, date stamp).



### Background music with no license, DnB and jungle
- id: BL-063
- type: idea
- status: Requested
- priority: Low
- size: M
- area: audio
- release: later
- source: owner



### Sound editor for the synthesized sounds (developer mode)
- id: BL-064
- type: idea
- status: Requested
- priority: Low
- size: M
- area: audio
- release: later
- source: owner



### A minimal tool to record gameplay (GIFs and short videos)
- id: BL-065
- type: idea
- status: Requested
- priority: Low
- size: M
- area: ui
- release: later
- source: owner



### A camera mode for trailers and cinematics
- id: BL-066
- type: idea
- status: Requested
- priority: Low
- size: M
- area: render
- release: later
- source: owner



### Posts for Reddit and Instagram reels (the game's account)
- id: BL-067
- type: chore
- status: Requested
- priority: Low
- size: M
- area: marketing
- release: later
- source: owner



### Meta tags: title, description, canonical, viewport, lang, theme-color, Open Graph, Twitter Card
- id: BL-068
- type: chore
- status: Requested
- priority: Medium
- size: S
- area: seo
- release: later
- source: owner

With a preview picture.



### robots.txt (with rules for AI bots), sitemap.xml and llms.txt
- id: BL-069
- type: chore
- status: Requested
- priority: Low
- size: S
- area: seo
- release: later
- source: owner



### JSON-LD, semantic HTML outside the canvas, favicons and a web manifest
- id: BL-070
- type: chore
- status: Requested
- priority: Low
- size: M
- area: seo
- release: later
- source: owner

JSON-LD as VideoGame or WebApplication; semantic HTML outside the canvas with a noscript fallback.



### Session archives, view only
- id: BL-071
- type: idea
- status: Requested
- priority: Low
- size: M
- area: net
- release: later
- source: owner

Saved past sessions (the world's paint), opened for viewing only.



### Nickname tags don't scale with the UI and resolution
- id: BL-072
- type: idea
- status: Requested
- priority: Low
- size: S
- area: ui
- release: later
- source: owner

The tags don't scale with the UI or the resolution.



### No nicknames on screenshots
- id: BL-073
- type: idea
- status: Requested
- priority: Low
- size: XS
- area: ui
- release: later
- source: owner



### Stencils
- id: BL-074
- type: idea
- status: Requested
- priority: Low
- size: M
- area: paint
- release: later
- source: owner



### Digital billboards
- id: BL-075
- type: idea
- status: Requested
- priority: Low
- size: M
- area: level
- release: later
- source: owner



### The next playtest
- id: BL-076
- type: idea
- status: Requested
- priority: Medium
- size: S
- area: net
- release: later
- source: playtest 2026-10-12

Telemetry is kept on the `feat/playtest-telemetry` branch (tag `v1.2.0-playtest.2`), not in releases; merging it into a newer base conflicts in `knip.json`, `src/main.ts`, `src/net/multiplayer.ts`, `src/net/remotes.ts`, `src/style.css`. Lessons: two or more players on one home network can't tell their network from the game's, so ask for separate networks; have 12–20 players and a weak laptop (Intel iGPU, 8 GB) in it; log the display's refresh rate and the browser's power-saver state (two players' "low fps" was the browser's 30 Hz cap on battery, not the game); have the server log each link's ping and `bufferedAmount` (the roof server sees a ~0 queue because Caddy drains it at once: set `tcp_notsent_lowat` on the host to see it); fix the report's `Infinity` (a percentile in the histogram's open top bucket), count a hidden tab's silence apart from a real stall, and keep a client's reports during an outage and send them after the rejoin (13 client-side closes were recorded for 81 drops). Run it a second time with the binary ops (BL-024), to compare (`docs/playtest-multiplayer.md` has the list and the numbers to beat).



### Deploy from GitHub Actions
- id: BL-077
- type: chore
- status: Requested
- priority: Low
- size: M
- area: deploy
- release: later
- source: ideas

Push to `main` → Actions builds → deploy over SSH with the repo's own deploy key (`docs/deploy.md`, section 5).



### BUY ME A COFFEE
- id: BL-078
- type: chore
- status: Blocked
- priority: Low
- size: XS
- area: ui
- release: later
- blocked-by: the link
- source: ideas

Hidden until it has a link (`git revert` the commit that hid it, then set the link).



### The F3 probe's own shader compiles land in its measurement
- id: BL-079
- type: chore
- status: Requested
- priority: Low
- size: S
- area: render
- release: later
- source: ideas

The probe turns moon shadows and wet highlights off: each compiles new shaders (7 a time; ~1.6 s on Windows D3D11), which lands in its own measurement. Players have neither setting; compile both variants before measuring if it matters.



### Wheel and Q/E per tool
- id: BL-080
- type: feature
- status: Done
- priority: Medium
- size: S
- area: input
- release: later
- source: owner

Decided (2026-10-14), replacing the earlier table: the wheel changes the color, Q/E change the size. Today it is the other way round for most tools (`src/tools/tools.ts`: Q/E the color for every tool, the wheel the can's cap and the marker's, roller's and sponge's size).

| Tool | Wheel | Q/E |
|---|---|---|
| Can | color | cap (the can's size) |
| Marker | color | size (later: marker types instead of sizes, BL-039) |
| Roller | color | size |
| Sponge | nothing (no color) | size |
| Stepladder | quarter turn (as now) | nothing |

Confirmed by the owner: the can's Q/E pick the cap; the sponge's wheel does nothing. A click on the wheel picking a color is BL-020.

Decided (2026-10-17, audit S1.1): BL-080 stays. The spawn wall still taught the old controls; its paint is dropped (BL-090), and a controls screen comes later (BL-092).

### Browser input guard: one table of blocked default events
- id: BL-081
- type: refactor
- status: Done
- priority: Medium
- size: M
- area: input
- release: next
- source: owner

Today the blocking is spread over `src/input.ts`: the `PREVENT` set and every Ctrl/Meta combo while the mouse is locked, F3, `contextmenu`, and `beforeunload` for Ctrl+W. Zoom (Ctrl+wheel, pinch) is not handled anywhere, and nothing is blocked in the menus. Do: one table in `config.ts` (keys, combos, wheel+Ctrl, pinch, context menu, F-keys), each entry with a condition (while playing, or always) and a reason; one module `src/browser-guards.ts` applies it; one test. Policy: while playing, block as now plus zoom and pinch; in the menus block only zoom and pinch. Open: let F5, Ctrl+R and F11 through while playing?

The mouse's back and forward buttons (3, 4) are cancelled on mouseup and auxclick, always, since audit F3.6 (S3.1); move that into the table.



### A K in the session code takes a screenshot
- id: BL-082
- type: bug
- status: Done
- priority: High
- size: XS
- area: input
- release: later
- source: owner

Typing a code with a K in the join field takes a screenshot instead of typing the letter. `Input` (`src/input.ts`) records every `keydown` on `window`, including keys typed into the code and name fields, and `main.ts` takes the screenshot on `wasPressed('KeyK')`. Every other game key fires while typing too. Do: in `Input`, ignore keydown whose target is an `input`, `textarea` or editable element; test with a synthetic keydown on a text field. Confirmed in the code.

### The JS heap jumps to 0.8–1 GB on each join
- id: BL-083
- type: perf
- status: Done
- priority: Medium
- size: S
- area: paint
- release: later
- source: playtest 2026-10-12

Split from BL-025. Steady ~0.5 GB. Measure what `loadPaint` allocates on a join first, then decide.

Measured (2026-10-14, `npm run bench:join`, as BL-085): the heap's steady growth on a join is every painted surface's CPU atlas (330 MB for the roof at HIGH, by design); on top of it the paint file inflated whole, 100–400 MB, was alive with them. Now a join's paint goes on face by face as it inflates (`eachFace`, `src/save/paint-file.ts`; LOAD from a file still reads it all first, so a broken file changes nothing): the top over the steady heap went from +124 to +65 MB at a quarter of the roof painted, +75 MB with all of it.

### A performance test in Settings, and `npm run bench`
- id: BL-084
- type: feature
- status: Done
- priority: Medium
- size: M
- area: ui
- release: next
- source: playtest 2026-10-12; owner laptop runs 2026-10-18 (audit F2.3, F2.5, F2.10, S2.3)

An Intel Iris Xe player played at 30 fps (23 ms of GPU a frame) and left after 6 minutes; the owner's RTX laptop ran Chrome on its Intel UHD unnoticed. Decided (2026-10-18, audit S2.1): nothing measures on its own (no timer in play or on the menu). Do: one test module that hides the menu and draws the pause menu's city view (`titleCamera`) for ~3 s, 0.5 s of it warm-up, with the GPU timer (`src/debug/gpu-timer.ts`) on only then and CPU time taken before the draw calls (F2.10).

- Settings → Performance test → RUN: `GPU · CPU · fps` and one message. Capped (frames ~33 ms apart, GPU and CPU low): Chrome's Energy Saver (chrome://settings/performance), Edge's efficiency mode, macOS Low Power Mode, else the browser's or system's power saver. Integrated GPU by name: the per-OS line of BL-109. GPU over 20 ms (config) on a dedicated GPU: "Your GPU is the limit". Else "Runs well". No GPU timer: CPU and fps, "GPU time isn't available in this browser". Never suggest a lower RESOLUTION.
- The test uses the player's current settings, never its own. During it: `TESTING…  [ESC] TO STOP` only (Esc: back to Settings, no result); the game stays as paused as it was (multiplayer allowed). After it: a `performance test` popup (`popup()`, as SAVE/UPLOAD PAINT) with the numbers, the settings, the GPU name and the message; `Run again`, `Dismiss` [ESC]; nothing kept.
- `npm run bench`: headed Playwright on the real GPU starts the same test with a fresh profile (the game's defaults) at the screen's size; 3 runs, median of each p50/p95/p99 of CPU and GPU ms, fps, draw calls; JSON with GPU name, OS, CPU cores, build, settings, refresh rate, printed and in `.cache/bench/<git describe>-<gpu>.json`; `npm run bench -- a.json b.json` compares (change in %, no threshold), builds only.
- Any developer's machine: ANGLE's native backend per OS (D3D11 Windows, Metal macOS, OpenGL Linux, D3D12 + `GPU=` on WSL; today `scripts/test-browser.mjs` uses the real GPU on Linux with a display only); a software GPU stops it with "no real GPU: <name>". Only when needed: never in `npm run check`, CI or another script; `docs/testing.md` says when (before and after a render or level change, comparing GPUs).

Done (2026-10-18, audit S2.3, `feat/perf-test`): `src/perf-test.ts` (the measuring and the message, tested in Node with stand-in timings), `src/perf-test-page.ts` (TESTING…, the popup), Settings → Graphics → Performance test → RUN, `scripts/bench.mjs`. Also: a FRAME RATE the player set that caps it says so ("Your Frame rate setting holds the game at 30 fps"), a busy CPU says "Your CPU is the limit", and a cap is judged against 33 ms, not the frame (F2.11). Bench, 1920×1080, defaults: RTX A2000 GPU 2.7 ms, CPU 1.3 ms, "Runs well"; Intel UHD GPU 23.1 ms, CPU 1.1 ms, 26 fps, "built into the processor, and it is the limit". Review fixes (audit F2.13): Firefox's names, more built-in GPUs, a hidden window stops the test, the bench on the bundled build.

Redesigned (2026-10-18, `design_handoff_esc_menu/UPDATE-12.md`, screen 12): the row is first on Graphics, Run under the values below; the camera flies once around the level from the title view (`flyCamera`, `src/render/title-view.ts`) for 10 s (0.5 s warm-up); a popup over the blurred flight shows live numbers (eased, every 100 ms), then average and 1% low fps, a tier (Stutters, Playable, Smooth, Very smooth) on a read-only slider, CPU and GPU bars, the settings, draw calls, the card and a tip: room to spare, the video card, the processor, or evenly loaded, with what to lower (Volumetrics, Resolution, City detail). Kept from before: a Frame rate setting or a power saver holding it, and, on a built-in GPU, how to give the browser the faster one. The design reverses "never suggest a lower Resolution". `PERF_TEST` in config.

### Paint takes 7–10 s to show after joining a session with a lot of it
- id: BL-085
- type: perf
- status: Done
- priority: Medium
- size: S
- area: net
- release: later
- source: owner

Seen as new drawings appearing in the ESC city view. Measure first: how much is the download of the paint file (0.3–3.4 MB in the playtest), how much its decoding and `loadPaint`, how much the upload (BL-025). Then decide.

The playtest of 2026-10-12 measured it: join (connect to in-session) p50 3.9 s, p90 12.2 s, max 17.8 s for paint files of a few hundred KB (≈70 KB/s), up to 3.4 MB later in the session; 12 links died before their welcome arrived. The file comes over the same link as everyone's ops (BL-024), and a stalled link is killed by the heartbeat (BL-004): both make it slower.

Part of it fixed with BL-004 (2026-10-14): a join over a slow link was killed during its download by the server's heartbeat, or by the game's own `NET.connectTimeout` while one 256 KB part came down; parts are 32 KB now. Download time itself is unchanged (BL-024 shares the link).

Measured and fixed (2026-10-14, `npm run bench:join`: the roof at HIGH, a quarter of its faces painted, 100 MB of paint in a 5.4 MB file, a joiner on the real GPU, no network delay): loaded 2.5–3.9 s → 0.8 s, shown 3.4–5.2 s → 1.3 s (all faces: 1.0 and 1.8 s). The welcome built the level again though the joiner had it open: 0.7 s, then its light bake and shader compiles (~1.3 s), and the download and the paint's inflating waited behind them. Now the open level, when it's the session's (data, name and surface table), starts over without a rebuild (`playSessionLevel`, `src/net/game-context.ts`). Mip levels are made each from the one above (`mipHalf`, `src/paint-mips.ts`), the atlas read once instead of once a level: 663 → 292 ms of the upload. Left: the upload's frames (24 MB each, `PAINT.uploadBudget`) still take 50–120 ms, and ~0.4 s of shaders compile at the first frames with paint (page materials); on a slow link the download is what's left (BL-024).

### Placing the stepladder lags
- id: BL-086
- type: bug
- status: Done
- priority: High
- size: S
- area: input
- release: later
- source: owner

Placing the stepladder from the inventory lags. Measured on the roof: 170–220 ms per placement, 160–207 of them in `LightBaker.sync`, which tested 3440 receivers against 416–831 shadow cones: one per lamp and per box of the ladder (17 boxes, 34 when moved). Fixed: one box per prop (`hull`, `src/render/bake/reach.ts`): 15–33 ms.

### `main.ts` and `level.ts` are over 400 lines
- id: BL-087
- type: refactor
- status: Done
- priority: Low
- size: S
- area: code
- release: later
- source: agent

`src/main.ts` (405: the frame loop is ~150 of them) and `src/level/level.ts` (408) are past the ~400 the codebase keeps to; both were at 403 before BL-085 added a few lines. Split by responsibility: e.g. the level's loading (load, restart, the city, the level file) out of `main.ts`; `Level`'s runtime props or its cover bookkeeping out of `level.ts`. Behavior stays identical (`npm run check` before and after).

Done (2026-10-14): the level as a file (`PropData`, `LevelData`) is `src/level/level-data.ts`; the frame meter (fps, CPU time a frame) is `src/frame-meter.ts`. `level.ts` 376 lines, `main.ts` 398.

### A late welcome can mark the next link as live
- id: BL-088
- type: bug
- status: Done
- priority: Low
- size: S
- area: net
- release: next
- source: agent (architecture review 2026-10-14)

`Multiplayer.welcome` (`src/net/multiplayer.ts`) marks whichever link is current as live once the paint is loaded, not the link the welcome came on. If link A drops while its welcome loads paint and the retry has opened link B, A's welcome marks B live before B's own welcome, so B stops giving up after `NET.connectTimeout`. As before the ServerLink split (a shared `live` flag). Do: pass the welcome's link from `connect`'s handler through `receive` to `welcome`, and mark that one. Test: in `scripts/multiplayer.test.mjs`, delay a welcome (as the "takes 5 s" check does), drop the link meanwhile, and check the new link still gives up after `NET.connectTimeout` when the server stays silent. Fixed (S5.1, F5.3): the welcome marks the link it came on; the test is in `scripts/multiplayer.test.mjs` as above (link 1 drops while its welcome loads, link 2 hears nothing and gives up after `NET.connectTimeout`).

### The multiplayer test sometimes never sees B reconnect
- id: BL-091
- type: bug
- status: Done
- priority: High
- size: S
- area: net
- release: next
- source: audit 2026-10-17 (F1.4)

`scripts/multiplayer.test.mjs:147`: B never starts reconnecting within 15 s after being cut off. Failed in CI on 1ee0264 and e74440d (runs 38558757226, 38457382788). Decided (2026-10-17): find and fix the cause before dev is promoted into next. Cause (S1.3): `frame()` in `src/main.ts` asked for the next frame only at its end, so one exception in a frame stopped the game loop, and `net.update`'s check for a silent server with it. Fixed: the frame asks for the next one first; the test throws one frame on B before the silence check, and a timed-out status wait prints the page's network log and errors.

### The server's heartbeat cuts a link before its hello
- id: BL-093
- type: bug
- status: Done
- priority: Medium
- size: S
- area: net
- release: next
- source: audit 2026-10-17 (F1.10, S1.3)

The heartbeat (`server/main.ts`, SERVER.heartbeat 10 s) terminated a link that had sent nothing yet, though the lobby gives it SERVER.helloTimeout (20 s) for its hello. A reload's rejoin opened while the page was busy could be cut (1006, "blocked") and leave the session. Fixed: the heartbeat starts with the link's first message; `npm run test:server` checks a hello two beats late still gets in.

### Work through the audit of 2026-10-17
- id: BL-089
- type: chore
- status: Planned
- priority: High
- size: L
- area: build
- release: next
- source: review 2026-10-17

The 1.4.0 groundwork audit: 90 findings in 8 modules (release, performance, input, notifications, multiplayer code, tools, props, core), 34 agent sessions and 26 tests, in `docs/audit-2026-10-17.md`, the source of truth for its findings, decisions and results. The workflow page (decide, bundle, test, generate session prompts) is linked at its top. A finding that becomes work gets its own backlog item, named on the finding's Backlog line. Done when every finding is done, set aside, or a backlog item.



### Drop the roof's level paint: its hint wall teaches the old controls
- id: BL-090
- type: bug
- status: Done
- priority: Low
- size: XS
- area: level
- release: next
- source: audit 2026-10-17 (F1.1)

`public/levels/roof.rhhpaint` holds only the hint wall at the spawn, which still reads "Mouse Wheel: Cap / Tool width · Q/E: Color" (swapped by BL-080). Do: delete the file and set `"paint": false` in `public/levels/roof.json`, in one commit (`server/world-test.ts:185` checks the two agree). Also fixes BL-033: no paint pages at the start (−42.5 MB of GPU memory). Check `npm run shots` (the spawn) and the full check. Audit session S1.2.



### A controls screen
- id: BL-092
- type: feature
- status: Requested
- priority: Medium
- size: S
- area: ui
- release: later
- source: audit 2026-10-17 (F1.8)

Once the roof's level paint is dropped (BL-090), nothing in the game teaches the controls (the menus and HUD don't name the wheel or Q/E). Do: a controls screen; it can share its table with the key bindings screen (audit F3.13).

### A frame throws during the multiplayer test
- id: BL-094
- type: bug
- status: Requested
- priority: Medium
- size: XS
- area: net
- release: next
- source: audit 2026-10-17 (F8.19, S3.1)

Each `npm run test:mp` makes Vite print `[Unhandled error] TypeError: Cannot read properties of null (reading 'frame')` at the end of a frame (`src/main.ts:348` by its source map; `dev?.report` → the profiler is the likely reader). Also on a clean dev (f793d33). The test passes, since a thrown frame no longer stops the game (BL-091). Do: find the null, fix it, and make the multiplayer test fail on a page error.
### One play state module; Esc and Enter routed by it
- id: BL-095
- type: refactor
- status: Done
- priority: Medium
- size: M
- area: input
- release: next
- source: audit 2026-10-17 (F8.2, F3.9, S3.2)

Play state is spread over `Input.locked`, `main.ts` (paused, frozen, `yours`/`noInput`), DevTools (panel, building), the pause menu (started, debugOpen) and three "in a session" flags (`session.multiplayer`, `Multiplayer.inSession`, `PauseMenu.session`). Esc is handled in four places with a check that changes state (`escapeResumes`), and Enter has its own listener while Input also records it (S3.1's F3.4). Do: one module owns locked, panel open, building, in a session and started, and derives playing, frozen, the input play gets and what the menu shows; no DOM, tested in Node (`npm test`). The browser's pointer lock and a test lock are its two adapters: the tests start play one way. While paused, Esc and Enter go to the menu through it (PauseMenu `back()`/`primary()` say what they did) and never into the game's keys; EscHold keeps its listener. No behavior change. Audit session S3.6.

### Input action map
- id: BL-096
- type: refactor
- status: Done
- priority: Medium
- size: S
- area: input
- release: next
- source: audit 2026-10-17 (F3.10, S3.2)

Play code reads physical key codes (~25 reads in 10 files) and the `PREVENT` list repeats them. Do: `BINDINGS` in `config.ts` (action → codes; mouse buttons and wheel as pseudo-codes); Input answers held / pressed / repeated(action) and label(action). Build mode, F3 and F2/F8/F9 stay raw codes (dev-only); Esc and Enter are reserved. No behavior change; golden paint identical. Then BL-081 blocks what play binds, while playing. Groundwork for BL-018 and BL-092. Audit session S3.3, after S3.6.

### Test runs side by side share a cache and freeze WSL
- id: BL-098
- type: bug
- status: Done
- priority: Medium
- size: XS
- area: code
- release: next
- source: audit 2026-10-17 (F8.20, S3.3)

Worktrees with `node_modules` linked in (as AGENTS.md says to run the full check) give every test server the same `node_modules/.vite-test` dependency cache (`scripts/test-browser.mjs`). Two runs at once also overload WSL: in S3.3 a side-by-side check failed a game check with `{}` (no frames for 30 s), another pair hung loading, a third froze WSL. Alone, they pass. Do: a cache dir per worktree, and say in AGENTS.md and docs/testing.md: one heavy test run at a time on one machine.

### main.ts combines the shared callback slots
- id: BL-097
- type: refactor
- status: Done
- priority: Low
- size: S
- area: core
- release: next
- source: audit 2026-10-17 (F8.10, S3.2)

Three slots are wrapped or replaced by a second module, so what they do depends on construction order (DevTools arrives by async import): `tools.ladder.others` (Multiplayer, then DevTools adds the ghost), `input.escapeResumes` (main, then DevTools), `paintFile.save` (paintMenu, then net-menu). Do: main.ts sets each once, combining what the modules offer; the one-at-a-time SAVE promise moves into Multiplayer beside `requestSave`; `escapeResumes` goes with BL-095. With BL-095, in audit session S3.6.

### Game fullscreen's keyboard lock took every key: F11 did nothing
- id: BL-099
- type: bug
- status: Done
- priority: Medium
- size: XS
- area: input
- release: next
- source: owner (audit F3.17, S3.4)

`keyboard.lock()` with no list took F11, F5, Ctrl+R, Ctrl+T and Alt+Tab from the browser in game fullscreen; F11 worked only after Esc was held. Done: lock only the keys play binds (from BINDINGS) and Esc; the hold line names [ESC] and [F11].

### Playing, the keyboard is the game's: every key but the browser's
- id: BL-100
- type: bug
- status: Done
- priority: Medium
- size: S
- area: input
- release: next
- source: audit 2026-10-17 (F3.18, S3.4)

The guard blocked listed keys only: Firefox's quick find (/ and '), F6, F10 and Alt's menu bar took the keyboard mid-game. Done: while playing every keydown is blocked except `BROWSER_KEYS` (Esc, F5, Ctrl+R, F11, F12), and Alt's release.

### macOS: a key released during a Cmd combo stays down
- id: BL-101
- type: bug
- status: Done
- priority: Medium
- size: XS
- area: input
- release: next
- source: audit 2026-10-17 (F3.19, S3.4)

macOS sends no keyup for keys released while Cmd is held: a movement key kept walking. Done: Cmd's release drops the held keys. Real Mac: audit T3.3.

### A check's real resume unlocked later game checks
- id: BL-103
- type: bug
- status: Done
- priority: Medium
- size: XS
- area: code
- release: next
- source: audit 2026-10-17 (F8.21, S3.4)

A synthetic Enter on the pause screen resumed with the real pointer lock (a user gesture in Playwright); the lock was lost ~40 ms later and that late event unlocked the next checks, under load only. Done: `noBrowserLock` on test pages; tests start play with `Input.setLocked`.


### A slow join shows PLAY before the session has loaded
- id: BL-105
- type: bug
- status: Requested
- priority: High
- size: S
- area: net
- release: next
- source: owner device tests 2026-10-18 (audit F5.10)

On a slow link the welcome's paint file takes a while; the joiner sees PLAY meanwhile, paints alone, and loses it when the welcome lands and moves them into the session. Do: the menu stays on joining (no PLAY) until the welcome is loaded; LEAVE cancels.

### Water tank roofs can't be painted
- id: BL-106
- type: idea
- status: Requested
- priority: Low
- size: S
- area: paint
- release: later
- source: owner device tests 2026-10-18 (audit F7.15)

The cone roofs of the water tank and the tanks on stands (`p.cone`, `src/kit/equipment.ts`, `src/kit/steel.ts`) have no paint option or mapping; the paintable flat top sits hidden inside. Do: a cone paint mapping, checked against saves and page counts.

### Moving the stepladder again and again near lamps doubles the CPU time
- id: BL-107
- type: perf
- status: Requested
- priority: Low
- size: S
- area: render
- release: later
- source: owner device tests 2026-10-18 (audit F2.8)

RTX laptop: CPU ~7.3 → 14–16 ms a frame while the ladder is placed over and over near lamps (each move re-bakes its lamp light, `LightBaker.sync`, BL-086); one placement is fine. Do: measure on the Intel laptop (audit T1.8) before deciding.

### Loading drops to 12 fps on the Intel UHD with Energy Saver on
- id: BL-108
- type: perf
- status: Requested
- priority: Low
- size: S
- area: render
- release: later
- source: owner laptop runs 2026-10-18 (audit F2.9)

Intel UHD laptop, Chrome's Energy Saver on: 30 fps in play, but 12 fps and CPU 18–24 ms while the game loads (likely shader compiles and uploads). Do: measure the load with `npm run bench` on the Intel UHD (BL-084) before deciding.

Measured (2026-10-18, `npm run bench` on the bundled build, WSL, no Energy Saver: it can't be turned on there): the load takes 3.9 s on the Intel UHD (the longest frame 1.6 s) and 2.7 s on the RTX A2000 (1.1 s). The steps block by design, so few frames on either GPU. (A first measurement through the dev server, 7.9 and 5.3 s, was mostly Vite compiling modules: audit F2.13.) Next: the same on the Windows laptop with Energy Saver on, then decide.

### Show the GPU in use in Settings; FRAME RATE's note
- id: BL-109
- type: feature
- status: Done
- priority: Medium
- size: S
- area: ui
- release: next
- source: owner laptop runs 2026-10-18 (audit F2.2, F2.6, S2.2)

The RTX laptop ran Chrome on its Intel UHD without the owner knowing. Do: a read-only GPU row under Resolution in Settings, from `WEBGL_debug_renderer_info` read once (as `src/dev/profiler.ts`), short name, "Hidden by the browser" when masked; when it looks integrated (Intel UHD / HD / Iris, AMD "Radeon Graphics" without a model), a description per OS: Windows Settings → System → Display → Graphics → the browser → High performance; Linux `prime-run` or `DRI_PRIME=1`; Intel Macs: turn off automatic graphics switching; nothing on Apple silicon. The name in the perf readout too. The Frame rate row's description: "Above your display's refresh rate this acts like Max." Shots of Settings.

Done (2026-10-18, audit S2.2, `feat/show-gpu`): `src/gpu-name.ts` (short name, integrated, the per-OS line; tested in Node over the names browsers report), the GPU row and Frame rate's note in Settings → Graphics, `gpu · <name>` in the perf lines.

### Crossed lines on the menu's glass bars on the Intel UHD (WSL)
- id: BL-110
- type: bug
- status: Requested
- priority: Low
- size: XS
- area: ui
- release: later
- source: audit S2.2 shots 2026-10-18 (F2.12)

`npm run shots` with `GPU=Intel` (WSLg's D3D12 on the Intel UHD) draws an X across the Settings tabs and the Back button, the blurred-glass bars (`backdrop-filter`); the NVIDIA draws them clean. Likely WSLg's driver, not the game. Do: look at Settings on the Windows laptop's Intel UHD in Chrome; only if it shows there, look at the bars' CSS.

### test:weak-link sometimes doesn't load the game
- id: BL-111
- type: bug
- status: Requested
- priority: Medium
- size: S
- area: net
- release: next
- source: audit S5.1 2026-10-18 (F5.11)

The first `npm run test:weak-link` run in a tree twice stopped at "The game didn't load: reload the page" (`src/boot.ts`: `import('./main')` rejected): once on `fix/net-bugs`, once on a clean `dev` worktree. Later runs passed, a cold Vite cache too. Its pages come from a browser context, which had no load log; since S5.1 (`scripts/test-browser.mjs`) they have one. Do: on the next failure, read the load log `gameReady` prints and fix the cause.

### The remote player's timeline as a pure module
- id: BL-112
- type: refactor
- status: Planned
- priority: Medium
- size: M
- area: net
- release: next
- source: audit S5.2 2026-10-18 (F5.4)

`src/net/remote-player.ts` mixes the clock (snapshots, lag, target, jitter, the shown time, timed events, the catch-up) with the figure, reads `document.hidden`, and the tests set its private fields (`scripts/game.test.mjs:2008`). Do: a pure `RemoteTimeline` (`receive`, `schedule(t, run, hidden)`, `sample(now, dt)`, `reset`, `flush`, `heard`, `stats`) with a Node test in `npm test`; RemotePlayer keeps the avatar, look, smoothing, ladder facing and spray; Remotes gives the tests a read-only view instead of `remotes.list`. No behavior change. Session S5.3.

### One Sender owns paint.log and what this player sends
- id: BL-113
- type: refactor
- status: Planned
- priority: Medium
- size: M
- area: net
- release: next
- source: audit S5.2 2026-10-18 (F5.5)

What this player sends is built twice: `Multiplayer.update` (snapshot clock, paint ops from paint.log, stepladder and inventory changes) and `src/dev/ghost.ts` (its own Msg type and keep()); paint.log has three writers (F5.2 came from that). Do: `src/net/sender.ts` owns paint.log (a second owner is refused), the snapshot clock and the change checks, and gives out the real `ToServer` messages on a clock it's handed; Multiplayer sends them through Outbox and ServerLink, the ghost records them and replays them over SimLink through the same dispatch into a RemotePlayer, ops through encodeOps/decodeOps. Node test with a fake capture and level. No behavior or protocol change. Session S5.4, after BL-112.

### A failure says whether the player was in a session
- id: BL-114
- type: feature
- status: Planned
- priority: Low
- size: XS
- area: net
- release: next
- source: audit S5.2 2026-10-18 (F5.12)

`NetStatus` `failed` is the same after a failed JOIN and after a session that ended mid-play, but M4's notification model shows them differently (a blocking error in play, F4.4; the MULTIPLAYER page's line while joining). Do: with M4's notify module (F4.9), `failed` carries the session's code when the player was in one; net-menu's onStatus stays the one adapter.
