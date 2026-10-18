# Backlog

The one list of what's left. One line per item, under its domain: `[TYPE-NNN]: what`. TYPE is BUGS, IDEA, TASK, or DSGN where a designer's work comes first; one counter for all types (next: 165), so a number is used once and stays if the type changes. `?` in front (`[?BUGS-162]`) means unconfirmed: check it before working on it. Older items keep their `BL-NNN` ids. Detail an item needs is in the file it links. When an item ships, its line moves to Done; the release commit empties Done.

## Now: 1.4.0

1. TASK [BL-113]: One Sender owns paint.log and what this player sends; the ghost's copy of the send path goes (docs/ideas/net-sender.md)
2. TASK [BL-133]: F3 builds its hooks first, then the panel; the 33 placeholder hooks and hooks.ts go (docs/ideas/f3-hooks-first.md)
3. TASK [BL-131]: An Environment module owns sky, fog and lights; main.ts stops wiring them (docs/ideas/environment-module.md)
4. TASK [BL-132]: One test driver: steps, keys and buttons, instead of four copies and private writes (docs/ideas/test-driver.md)
5. TASK [BL-134]: Split game.test.mjs (2318 lines) into scripts/game/ by area (docs/ideas/test-driver.md)
6. TASK [BL-013]: Device checks before the release: page zoom, three browsers, mouse side buttons, browser keys (docs/ideas/release-checks.md)

## Multiplayer

1. BUGS [BL-024]: Paint ops are most of the downstream bytes; merge stamps, shed load on slow links, after the playtest (docs/ideas/weak-links.md)
2. IDEA [BL-076]: The next playtest: binary ops, 12–20 players on separate networks, better telemetry (docs/ideas/weak-links.md)
3. TASK [BL-112]: The remote player's timeline as a pure module with a Node test (docs/ideas/remote-timeline.md)
4. IDEA [BL-114]: A failure says whether the player was in a session, for the notification system (docs/ideas/notifications.md)
5. IDEA [BL-071]: Saved past sessions, opened for viewing only
6. IDEA [BL-151]: Show what each other player is doing (in the menu, in Settings…) by their nameplate
7. IDEA [BL-153]: Find who painted something by player id, picked like the eyedropper (to spot bad paint)
8. IDEA [BL-154]: Limit some tools in multiplayer (e.g. the roller)

## Painting

1. BUGS [BL-015]: Rework the drips: each setting does one thing; spraying over a coat no longer grows them (docs/ideas/painting.md)
2. TASK [BL-016]: Tune drips per tool by hand and remove the strong ones, after BL-015 (docs/ideas/painting.md)
3. TASK [BL-017]: Tune the can's caps until painting feels right, against Bombing!! 2 (docs/ideas/painting.md)
4. IDEA [BL-106]: Paintable cone roofs on the water tanks (a cone paint mapping) (docs/ideas/painting.md)
5. BUGS [BL-146]: The sponge frees paint memory only after local strokes; build-mode undo checks only the atlas size (sponge.ts:58, painting.ts:354)
6. TASK [BL-145]: PaintSurface is a public struct written by GPU upload, the baker and painting; "has paint?" asked two ways (paint-surface.ts)
7. IDEA [BL-042]: New marker brushes: rectangular and calligraphy
8. IDEA [BL-074]: Stencils
9. IDEA [BL-152]: Tune the can's pressure with Shift + mouse

## Input

1. BUGS [BL-010]: Rare huge mouse jumps snap the camera in Chrome on Windows; the fix is the owner's choice (docs/ideas/mouse-spikes.md)
2. BUGS [BL-135]: A Mac mouse wheel may need several notches per color (WHEEL.notchPx); measure first (docs/ideas/release-checks.md)

## Performance

1. BUGS [BL-034]: Paint pages at ULTRA can reach ~1 GB of GPU memory: 49 pages, 44% full (docs/ideas/performance.md)
2. BUGS [BL-107]: Moving the stepladder again and again near lamps doubles the CPU time (lamp light re-baked) (docs/ideas/performance.md)
3. BUGS [BL-108]: Loading drops to 12 fps on the Intel UHD with Energy Saver on (docs/ideas/performance.md)
4. BUGS [BL-028]: Other players' spray costs ~0.2 ms of CPU a sprayer (docs/ideas/performance.md)
5. BUGS [BL-031]: Four shaders still compile in the first frame (docs/ideas/performance.md)
6. BUGS [BL-029]: The roof's edits of 2026-10-10 cost 3–9% GPU on the Intel UHD (docs/ideas/performance.md)
7. BUGS [BL-032]: One load of the roof took 62 s; not reproduced (docs/ideas/performance.md)

## Rendering

1. BUGS [BL-011]: Title-screen pickup rings are sized for where the player stands, not the title view
2. BUGS [BL-110]: Crossed lines on the menu's glass bars on the Intel UHD under WSL (likely the driver)
3. IDEA [BL-066]: A camera mode for trailers and cinematics

## Props and level

1. TASK [BL-143]: A design run on props and the level plan: PropContext, placement, sign text, saves by face (docs/ideas/props-and-level.md)
2. IDEA [BL-144]: Cover v2: drop hidden paint faces and pack pages fuller, after BL-143 (docs/ideas/props-and-level.md)
3. TASK [BL-055]: Group the props better in build mode: decide which prop goes into which category (docs/ideas/props-and-level.md)
4. TASK [BL-139]: src/debug/hint-text.ts is 419 lines, over the ~400 cap
5. [BUGS-161]: A wall prop overlaps a fence
6. BUGS [BL-150]: A level file newer than the game knows loads as if it were version 4 (levelProblem never reads version)
7. IDEA [BL-039]: More marker types, placed on the map
8. IDEA [BL-050]: Wire cutting
9. IDEA [BL-051]: Dynamic wire length
10. IDEA [BL-052]: Lamps that can be fixed to the floor or the ceiling
11. IDEA [BL-053]: Lamps that light signs
12. IDEA [BL-054]: New sign sizes, including big rectangular and square ones
13. IDEA [BL-075]: Digital billboards

## Tools

1. TASK [BL-141]: Exhaustive tool lists: a forgotten tool becomes a compile error; the tool names in one place (docs/ideas/tools.md)
2. BUGS [BL-142]: Other players' figures hold their tools wrong: roller width, sponge tilt, ladder model (docs/ideas/tools.md)

## UI

1. IDEA [BL-140]: One notification system: messages lost in menus and hidden tabs, nothing in play says reconnecting (docs/ideas/notifications.md)
2. DSGN [BL-092]: A screen that teaches the controls (nothing names the wheel and Q/E since the spawn wall's paint went)
3. BUGS [BL-072]: Nickname tags don't scale with the UI and resolution
4. [?BUGS-162]: The browser's page zoom scales the HUD and menus
5. [?BUGS-163]: Some Settings may not be remembered after a reload; check each one
6. TASK [BL-078]: Show BUY ME A COFFEE again once it has a link (revert e2c2310)
7. IDEA [BL-061]: A player in the style of an old iPod Classic
8. IDEA [BL-062]: Photo mode with Polaroid-like cards for photos
9. IDEA [BL-065]: A minimal tool to record gameplay as GIFs and short videos

## Avatar

1. IDEA [BL-056]: New character avatar with a correct rig (docs/ideas/avatar.md)
2. IDEA [BL-057]: Two body types, male and female, after BL-056 (docs/ideas/avatar.md)
3. IDEA [BL-058]: Clothing attached as meshes, after BL-057 (docs/ideas/avatar.md)
4. IDEA [BL-059]: A character customization screen, after BL-058 (docs/ideas/avatar.md)
5. IDEA [BL-060]: Avatar for NPCs, first-person hands, the hood outside F3 (docs/ideas/avatar.md)

## Audio

1. IDEA [BL-063]: License-free background music: drum and bass, jungle
2. IDEA [BL-064]: A sound editor for the synthesized sounds (dev mode)
3. IDEA [BL-148]: Other players' sounds: spray hiss, marker, footsteps, landing as positional voices

## Tests and tooling

1. TASK [BL-035]: Fixed-step tests for walking, collisions, jumps and climbing
2. BUGS [BL-037]: A game test page twice failed to load its level in 120 s; read `gameReady`'s log when it repeats
3. TASK [BL-036]: Light baking and weather run on the wall clock; decide what a test would compare first
4. TASK [BL-079]: The F3 probe's own shader compiles land in its measurement
5. TASK [BL-149]: A test that the protocol and op-wire never read PAINT.texelsPerMeter
6. TASK [BL-156]: CI is pinned to ubuntu-24.04 for 1.4.0; move it to Ubuntu 26 after the release
7. [TASK-164]: scripts/multiplayer.test.mjs is ~440 lines, over the ~400 cap: split it with BL-134

## Servers and deploy

1. BUGS [BL-027]: A closed session's paint stays in the server's memory until a GC (docs/ideas/server-ops.md)
2. TASK [BL-030]: Precompressed assets served by Caddy (docs/ideas/server-ops.md)
3. TASK [BL-077]: Deploy from GitHub Actions (docs/ideas/server-ops.md)
4. IDEA [BL-043]: One public server, running 24/7 (docs/ideas/public-servers.md)
5. TASK [BL-044]: Disable host and join (don't remove them), after BL-043 (docs/ideas/public-servers.md)
6. IDEA [BL-045]: A window of public servers instead of host and join (docs/ideas/public-servers.md)
7. [DSGN-160]: The lobby list for BL-045: allowed tools, players online, ping with a country flag
8. IDEA [BL-046]: A queue to enter the server, after BL-043 (docs/ideas/public-servers.md)
9. IDEA [BL-047]: Admin panel: players online, ban by IP, after BL-043 (docs/ideas/public-servers.md)
10. IDEA [BL-147]: The server checks what players send (op reach and rate, ladder spot, jumps) before it goes public

## Web and promotion

1. TASK [BL-068]: Meta tags: title, description, canonical, Open Graph, Twitter Card
2. TASK [BL-069]: robots.txt (with rules for AI bots), sitemap.xml and llms.txt
3. TASK [BL-070]: JSON-LD, semantic HTML outside the canvas, favicons and a web manifest
4. TASK [BL-067]: Posts for Reddit and Instagram reels from the game's account

## Done

Shipped since the last release; the release commit empties this list. What 1.4.0 already holds is in `docs/releases/drafts/v1.4.0.md`.

1. TASK [BL-137]: CI pinned to ubuntu-24.04 for 1.4.0, as GitHub moved ubuntu-latest to Ubuntu 26
2. BUGS [BL-138]: The multiplayer test records every network status the page passes through, so B's 1 s "reconnecting" is never missed
3. TASK [BL-136]: F3 tooltips, row labels and code comments say Q/E sizes a tool, not the wheel; WheelSized is SizeRange (tools/size-range.ts)
4. BUGS [BL-105]: Joining or hosting, the menu shows a disabled Joining… (the progress) instead of PLAY until the session's paint has loaded; no key or click resumes; LEAVE or Back cancels; a failed join gives PLAY back
