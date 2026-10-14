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

Decided (2026-10-14): the fix and an automated test, in its own file beside the smoke test (~5–8 s): Chromium with `--disable-3d-apis` (no WebGL), and one with the main script blocked. To see it by hand in Chrome: start it with `--disable-3d-apis --user-data-dir=<a temp dir>` (`chrome://gpu` shows WebGL: Disabled), or DevTools → Network → Block request URL on the main `index-*.js`.

### Strokes made while the link is dying vanish on rejoin
- id: BL-003
- type: bug
- status: Planned
- priority: Urgent
- size: M
- area: net
- release: later
- source: playtest 2026-10-12

7 players, 2.6 h; all findings in `docs/playtest-multiplayer.md`. `Multiplayer.welcome` (`src/net/multiplayer.ts`) replaces the player's paint with the server's file and clears `ops`, `opTimes` and `paint.log`; ops sent into a stalled socket are never acknowledged. So everything painted from the stall's start to the end of the rejoin (silence 6 s + retry + a 4 s median, 18 s worst, download) is lost: 3–20 s of work, 81 times in the test. Do: each op batch carries a per-player sequence number, the server acks the highest in `pong` and drops repeats by token, the client keeps unacked batches, and after `loadPaint` applies them again and resends. Bump `PROTOCOL`.



### The server's heartbeat kills links that are only stalled downstream
- id: BL-004
- type: bug
- status: Planned
- priority: Urgent
- size: S
- area: net
- release: later
- source: playtest 2026-10-12

79 of 81 drops (code 1006) fell on the 10 s heartbeat (`server/main.ts`: `terminate()` when no pong came since the last ping); in 62 of 69 the player's reports still reached the server less than 10 s before the kill, so the uplink worked and the ping sat in the downlink queue behind ops (app pings of 11–16 s were measured). 40% of the drops (32 of 81) came within 30 s of a rejoin: the paint file (0.3–3.4 MB) loads the same weak path, and the next kill follows. Do: count any message from the client as alive (`state` arrives at 20 Hz); let the game wait longer than 6 s for the server (`lastHeard`, `SERVER.ping * 3`) before it closes and rejoins, or make it adaptive.



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
- status: Planned
- priority: Urgent
- size: S
- area: level
- release: later
- source: stress test

Tanks on stands and the water tank: the roof has no collider, so the player walks in between; crouching shows the real flat roof, which can be painted (the oval roofs are fine). Seen at (-10.07, 3.40, -8.57) and (-7.13, 4.32, -14.12). Do: give those props a roof collider.



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
- status: Planned
- priority: Medium
- size: S
- area: net
- release: later
- source: playtest 2026-10-12

In the playtest the host saw all others as DISCONNECTED, a label only the server's `presence: dropped` sets (`NO SIGNAL` is the game's own). The data can't tell if the others really dropped, a welcome lists them as dropped, or queued presence arrives in a burst. Do: two clients in `scripts/multiplayer.test.mjs` style, one with its downlink stalled for 15 s, and log the `presence` and `players[].state` the other receives (`docs/playtest-multiplayer.md`).

Triage notes (2026-10-14): research, not a fix: write the stalled-downlink test first, then decide.

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
- status: Requested
- priority: Low
- size: S
- area: net
- release: later
- source: check by hand

Up to ~3× walking speed (16 m/s at 60 fps, over 0.1–0.2 s); the ghost test allows it (it checks for jumps: 30–65 m/s unsmoothed). A speed cap changes how other players look: judge it in F3 → Test → Ghost (net: hiccups 0.2, record a walk that stops, PLAY), then decide.



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
- status: Requested
- priority: High
- size: M
- area: input
- release: later
- source: stress test feedback

A screen to rebind the keys.



### Remember the chosen settings
- id: BL-019
- type: feature
- status: Blocked
- priority: High
- size: S
- area: ui
- release: later
- blocked-by: BL-018
- source: stress test feedback

`src/settings.ts` already saves ink style, pixel scale, max FPS, volumetrics, paint detail and city detail. Add to what it saves: the key layout, volume and sound, mouse sensitivity and FOV.



### Pick a color with a click on the mouse wheel
- id: BL-020
- type: feature
- status: Requested
- priority: Medium
- size: S
- area: input
- release: later
- source: owner



### Rotate the stepladder from the inventory by 7.5° per wheel step instead of 90°
- id: BL-022
- type: feature
- status: Blocked
- priority: High
- size: S
- area: input
- release: later
- blocked-by: the owner's decision
- source: owner

Step in `config.ts` (`LADDER.rotateStep`, default 7.5°: 90° is 12 steps, 45° is 6).

Found (2026-10-14): bigger than S. A prop's `rot` is a whole number of quarter turns everywhere (`PropData`, `rotate` and `solidBoxes` in `src/level/build-prop.ts`, placement, the network's ladder message), and the player's colliders are boxes aligned to the world's axes (`THREE.Box3`). A ladder at 7.5° or 45° fits no such box: the player would bump into air beside it, and climbing a turned ladder isn't supported. Options: (a) turn only the model, colliders on the nearest quarter turn (S, looks off up close); (b) free rotation with its own colliders, climbing and network check (L); (c) keep quarter turns, animate the turn smoothly (S). Also open: does "smooth" mean a smaller step or an animated quarter turn?

### Block the browser zoom: Ctrl +/−/0, Ctrl+wheel, trackpad pinch
- id: BL-023
- type: feature
- status: Blocked
- priority: Medium
- size: XS
- area: ui
- release: later
- blocked-by: BL-081
- source: owner

Blocked in the game and in the menus (one entry in the guard table, BL-081). Zoom changes the render buffer (a 3080 Ti rendered 3840×2160 for a 2560×1440 screen at zoom); BL-026 caps the buffer too.

Zooming out (not in) is what makes the buffer bigger: see BL-026.

### Paint ops are 94% of the downstream bytes, ~250 B each
- id: BL-024
- type: perf
- status: Planned
- priority: High
- size: L
- area: net
- release: later
- source: playtest 2026-10-12

JSON stamps with full-precision floats and the surface key, uncompressed; a painting player makes a median 140 ops/s (p99 ~1800), and the server repeats each to the 5–6 others. Total out of the server: p50 0.5 MB/s, p99 3.2 MB/s, max 4.5 MB/s for 7 players, 7.3 GB in 2.6 h. Players on weak links (home Wi-Fi, VPN, hotspot) died more the more they received: 1.5% of 5 s windows were followed by a drop within 25 s below 100 KB/s, 28% above 500 KB/s; players on good links barely moved (0.4% to 4%). Do, in this order: (1) a binary op (quantized u/v/radius, a small integer for the surface key), every client applying the quantized values so texels still match, ~20 B; (2) merge a frame's stamps that land on the same texels; (3) when a link's ping grows past ~1 s, send it only the newest `state` per player and wait with ops. Read `docs/multiplayer-audit.md` first (the "nothing is compressed" decision in `protocol.ts`). Effort M–L.



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
- status: Planned
- priority: Medium
- size: S
- area: level
- release: later

It spans two level tiles (`p89`, `p90` and a joint), so every game starts with two 2048² paint pages: +42.5 MB of GPU memory before anything is painted. Do: move the hint (or the wall) into one tile and save the level and its paint again (build mode P).

Triage notes (2026-10-14): needs a human: moving the wall and saving the level and its paint again is done in build mode (P).

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



### After connecting to a server, start the game and skip the pause menu
- id: BL-048
- type: chore
- status: Requested
- priority: Medium
- size: XS
- area: ui
- release: later
- source: owner



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
- status: Blocked
- priority: Medium
- size: S
- area: input
- release: later
- blocked-by: the owner's decision
- source: owner

Controls (replaces the Q/E and wheel swap): can: Q/E change the cap, the wheel changes the color; marker: Q/E change the marker type (one type for now, BL-039), the wheel changes the size; roller and sponge: the wheel changes the size (as now); stepladder: the wheel rotates it (BL-022). Click on the wheel picks a color (BL-020).

Found (2026-10-14): today Q/E change the color for every tool (`src/tools/tools.ts`), the wheel changes the can's cap and the marker's, roller's and sponge's size. In the table above, Q/E on the marker go to its type and the wheel stays size: the marker and the roller would have no way left to change color. Options: (a) Q/E stay color on the marker and roller, the marker type gets its own key once there is a second type; (b) the wheel click cycles the color on every tool (BL-020).

### Browser input guard: one table of blocked default events
- id: BL-081
- type: refactor
- status: Requested
- priority: Medium
- size: M
- area: input
- release: later
- source: owner

Today the blocking is spread over `src/input.ts`: the `PREVENT` set and every Ctrl/Meta combo while the mouse is locked, F3, `contextmenu`, and `beforeunload` for Ctrl+W. Zoom (Ctrl+wheel, pinch) is not handled anywhere, and nothing is blocked in the menus. Do: one table in `config.ts` (keys, combos, wheel+Ctrl, pinch, context menu, F-keys), each entry with a condition (while playing, or always) and a reason; one module `src/browser-guards.ts` applies it; one test. Policy: while playing, block as now plus zoom and pinch; in the menus block only zoom and pinch. Open: let F5, Ctrl+R and F11 through while playing?



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
- status: Requested
- priority: Medium
- size: S
- area: paint
- release: later
- source: playtest 2026-10-12

Split from BL-025. Steady ~0.5 GB. Measure what `loadPaint` allocates on a join first, then decide.

### A hint in the HUD when the GPU can't keep up
- id: BL-084
- type: feature
- status: Blocked
- priority: Medium
- size: S
- area: ui
- release: later
- blocked-by: the owner's decision
- source: playtest 2026-10-12

An Intel Iris Xe player played at 30 fps (23 ms of GPU a frame) and left after 6 minutes, likely not knowing PIXEL SCALE exists. Do: once a session, when the GPU frame time stays over 20 ms for 5 s (config), a text hint in the HUD's existing style (as `LOW PRESSURE — HOLD [RMB] TO SHAKE`), pointing to SETTINGS → PIXEL SCALE. No new UI.

Blocked (2026-10-14): GPU time is measured only while F3's perf readout is on (`EXT_disjoint_timer_query_webgl2`, desktop Chromium only). Decide: the timer on for every player (a little work every frame), sampled (the first ~30 s, or every few seconds), or judged from FPS (false alarms: a laptop on battery caps Chrome at 30 Hz). Its place in the HUD needs a screenshot.

When built: a `?weak-gpu` URL flag that shows the hint at once, to see it without a weak GPU.

### Paint takes 7–10 s to show after joining a session with a lot of it
- id: BL-085
- type: perf
- status: Requested
- priority: Medium
- size: S
- area: net
- release: later
- source: owner

Seen as new drawings appearing in the ESC city view. Measure first: how much is the download of the paint file (0.3–3.4 MB in the playtest), how much its decoding and `loadPaint`, how much the upload (BL-025). Then decide.

The playtest of 2026-10-12 measured it: join (connect to in-session) p50 3.9 s, p90 12.2 s, max 17.8 s for paint files of a few hundred KB (≈70 KB/s), up to 3.4 MB later in the session; 12 links died before their welcome arrived. The file comes over the same link as everyone's ops (BL-024), and a stalled link is killed by the heartbeat (BL-004): both make it slower.

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
