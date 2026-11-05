# Backlog

The one list of what's left. Counter for new ids: next: 347

<details>
<summary>Backlog rules (read before editing)</summary>

### File structure

- **Counter:** one sequential counter for all items, on the line above. Every new id takes that number, then the counter goes up by one. Numbers are never reused, even if an item's type changes or the item is deleted.
- **Sections:** domain sections (Multiplayer, Painting, UI, ...) hold the backlog; `Done` holds items shipped since the last release and is emptied by the release commit; `Discarder`, last, holds deleted items and is never emptied.
- **Numbering:** items are numbered 1, 2, 3... within each section. Renumber the section after any add, move or removal.

### Item line

`N. [~~]TYPE [MARKERS ID]: Description (path/to/detail.md) @X.Y.Z[~~]`

Only `N.`, the id and the description are required. The optional parts appear in this order:

- **TYPE:** `BUGS`, `IDEA`, `TASK`, `DSGN` (designer's work comes first), `PERF` (frame time, memory, load time), `RFCT` (refactor, same behavior), `TEST` (tests and tooling), `DOCS` (docs only), `CCTV` (the admin page, in the cctv repo, with its server side here; in the CCTV section).
- **ID:** two formats exist. Both took their numbers from the same counter, so a number appears only once across all of them.
  - **Current format** `[TYPE-NNN]`, for every new item. No separate type word; the type is the id prefix. Example: `3. [BUGS-165]: Lamps flicker after a reload`
  - **Legacy format** `[BL-NNN]`, for items created before the change. These keep a type word in front, because the id carries no type. Example: `1. TASK [BL-013]: Device checks before the release`
  - Never create new `BL` ids, and never convert a `BL` id to the current format. Other lines, docs and commits refer to it (e.g. "after BL-015").
  - **Reclassifying:** keep the number. For a current id change the prefix (`[BUGS-161]` becomes `[TASK-161]`); for a legacy id change only the type word (`IDEA [BL-071]` becomes `TASK [BL-071]`).
- **Markers:** zero or more characters inside the brackets, before the id, always in the order `!?>`: `!` critical, `?` unconfirmed (verify before working on it), `>` explain (the owner wants it explained). Examples: `[?BUGS-162]`, `[!>BL-024]`. Keep markers when editing a line; never drop them silently.
- **Detail link:** specs live in `docs/ideas/` and are linked in parentheses after the description.
- **Release tag:** `@X.Y.Z` at the very end of the line.
- **Deleted:** everything after the number is wrapped in `~~...~~`, and the line lives in `Discarder`. The item is dropped but kept for the record: don't work on it, don't move it to Done, and don't remove the line unless asked.

### Release planning

- An item is planned for a release, the current one included, with `@X.Y.Z` at the end of its line. It stays in its domain section. The current release is the one after the latest git tag (`git describe --tags --abbrev=0`).
- An item without a tag is unplanned. A release's list is every line tagged with that version.
- Never invent a release tag. Plan items for a release only when asked.
- **Starting the next release** (e.g. 1.4.0 is released and 1.5.0 begins): leave every tag where it is; ask before retagging anything left unshipped from the old release.

### Operations

- **Add:** take the counter's number and increment it. Write `[TYPE-NNN]` under the right domain, and link a detail doc if there is one.
- **Ship:** move the line into Done and drop its release tag. Delete its detail doc in `docs/ideas/` (or its part of a shared one) and the link.
- **Delete:** wrap the line in `~~...~~`, drop its release tag and move it to the end of `Discarder`; don't remove it. No struck-through line stays in another section.
- **Unconfirmed (`?`):** before working on it, check whether the problem is real and report back. Remove the `?` only once it is confirmed.
- **Explain (`>`):** find every id containing `>`. For each, say what the task means, why it matters and what the work involves, using the linked docs/ideas file and the code. Then remove the `>` from those ids.

</details>

## Multiplayer

1. TASK [BL-076]: Run the next public playtest and verify that all bugs from the previous playtest have been fixed (docs/ideas/weak-links.md) @1.7.2
2. IDEA [?BL-071]: Multiplayer View-Only sessions: past sessions are opened for viewing only (gallary)
3. [IDEA-288]: Admin mode: who painted what, and erasing one player's paint with what it covered back, within the last ~15 minutes (the server's ring of op batches) (docs/ideas/admin-mode.md) @1.9.0
4. [IDEA-289]: A 15-minute timelapse of a wall's painting, from IDEA-288's ring of op batches; only if it comes nearly free (docs/ideas/admin-mode.md)

## Painting

1. IDEA [BL-074]: Stencils
2. [TASK-232]: Painting Rework: to production: what's left: cut unlock-all (`ALL_PAINT`) @1.7.0
3. [?IDEA-166]: Lock the camera while painting: an idea from before the rework, not started, off 1.7.0
4. [IDEA-336]: Marker: a flat nib, wide across and thin along, for calligraphy: tried on a can cap (TRANSVERSAL), its code kept commented out, each place marked "Kept for a flat nib on the marker, a later version." (grep it)

## Input

1. BUGS [BL-010]: Rare huge mouse jumps snap the camera in Chrome on Windows; the fix is the owner's choice (docs/ideas/mouse-spikes.md) @1.7.1

## Performance

1. BUGS [BL-034]: Paint pages at ULTRA can reach ~1 GB of GPU memory: measured, 1045 MB is the ceiling (all 49 pages, 72% full); the lossless fix is BL-144 (docs/ideas/performance.md)
2. [PERF-200]: Reduce Ladder Shadow Update Delay Without Frequent Rebaking @1.7.0
3. [PERF-322]: The server allocates a new buffer for every state it keeps as a player's last (`p.last`, server/session.ts): one buffer a player would do, as SNAPSHOT_BYTES is fixed
4. [PERF-340]: A client among 40 players holds 40 fps on a good GPU, 20 on Intel UHD, before and after the Painting Rework: the frame's CPU is the 40 figures (about 100 draw calls); alone on the roof with the can in hand the frame's CPU rose 2.5–3.3 → 4.2–4.9 ms in the rework. Measured 2026-11-05: the aim's ray each frame (module 4) was most of it, and its scan of all 3405 solids most of the ray: PERF-341 took that off. The 5 more draw calls are one new cap pickup in view, at no cost. Still unknown: about 0.7 ms and 1–4 fps lost at 60 Hz on NVIDIA from module 2 on, with no per-frame code found there; not the ray alone, the crosshair, the tags, the pickups or the alpha steps; to read outside WSL

## Rendering

1. IDEA [BL-066]: A camera mode for trailers and cinematics
2. [RFCT-320]: Capture mode's fixed frames scale the hatching by writing INK.hatchPx, so F3's spacing shows 3.56 in 9:16 and what is set there inside a frame is lost: a scale of its own, apart from the tunable

## Props and level

1. TASK [BL-143]: A design run on props and the level plan: PropContext, placement, sign text, saves by face (docs/ideas/props-and-level.md)
2. IDEA [BL-144]: Cover v2: drop hidden paint faces, make paintable walls nobody can reach plain walls and trim the room on the main floor (TASK-194 merged in), and pack pages fuller, after BL-143; up to 28% less paint memory at ULTRA (BL-034) (docs/ideas/props-and-level.md)
3. TASK [BL-055]: Group the props better in build mode: decide which prop goes into which category (docs/ideas/props-and-level.md)
4. [?BUGS-161]: A wall prop overlaps a fence
5. IDEA [BL-039]: More marker types (rectangular and calligraphy nibs among them, IDEA-233 merged in), placed on the map; a per-tool variant module first, as caps are (docs/ideas/tools.md) @1.7.0
6. IDEA [BL-050]: Wire cutting
7. IDEA [BL-051]: Dynamic wire length
8. IDEA [BL-052]: Lamps that can be fixed to the floor or the ceiling
9. IDEA [BL-053]: Lamps that light signs
10. IDEA [BL-054]: New sign sizes, including big rectangular and square ones
11. IDEA [BL-075]: Digital billboards
12. IDEA [BL-106]: Paintable cone roofs on the water tanks (a cone paint mapping) (docs/ideas/props-and-level.md)

## Tools

1. IDEA [BL-062]: Photo mode with Polaroid-like cards for photos
2. IDEA [BL-061]: A player in the style of an old iPod Classic

## UI

1. [?TASK-203]: The HUD fits every window: it scales with the window and the DPR (tiny at 4K at 100%, crowded at 820×560), the compact pause menu with F3 open stays above the HUD (BUGS-198 merged in, likely fixed by the `--z-*` layers); all three checked on shots first (docs/ideas/hud-scale.md)
2. [IDEA-204]: Notifications beyond play: the menu, pages, loading and a hidden tab on the same model; screen-reader announcements; more events (away and back, context lost, online, refused pointer lock or clipboard); battery (docs/ideas/notifications.md)

## Avatar

1. IDEA [BL-056]: New character avatar with a correct rig (docs/ideas/avatar.md)
2. IDEA [BL-057]: Two body types, male and female, after BL-056 (docs/ideas/avatar.md)
3. IDEA [BL-058]: Clothing attached as meshes, after BL-057 (docs/ideas/avatar.md)
4. IDEA [BL-059]: A character customization screen, after BL-058 (docs/ideas/avatar.md)
5. IDEA [BL-060]: Avatar for NPCs, first-person hands, the hood outside F3 (docs/ideas/avatar.md)

## Audio

1. IDEA [BL-063]: License-free background music: drum and bass, jungle @1.8.0
2. IDEA [BL-148]: Other players' sounds: spray hiss, marker, footsteps, landing as positional voices @1.8.0
3. [IDEA-343]: The can's hiss follows the hand's speed, the distance and the opacity

## Tests and tooling

1. TEST [BL-035]: Fixed-step tests for walking, collisions, jumps and climbing
2. [TEST-299]: Heavy runs (check, test:server, test:game, test:mp, golden) under a memory cap, e.g. `systemd-run --user --scope -p MemoryMax=9G`: a runaway test is killed, not WSL (an assert on a paint atlas, diffed byte by byte, took 11 GB and WSL with it three times on 2026-11-02)
3. [TEST-321]: `scripts/net-lab.mjs` (test:weak-link) and `join.bench.mjs` leave their server running when they crash; csp.test and multiplayer/harness each have their own `exit` hook: one helper in test-browser.mjs for all four

## Servers and deploy

1. [TASK-201]: The game on itch.io and CrazyGames, played from roof.hidden.haus in their iframe: itch as an HTML upload whose index.html is that iframe (a link-only page is never indexed), CrazyGames' Basic Launch from our own domain (no SDK); the CSP's `frame-ancestors` (now `'none'`, in `vite.config.ts` and Caddy on the host) opened to itch's and CrazyGames' domains; pointer lock, fullscreen and the window size checked inside both; the AI disclosure answered (docs/ideas/web-portals.md) @1.7.1
2. [IDEA-338]: The server limits a stamp's reach (radius × stretch) when it takes an op: a modified client's huge slanted stamps search ~80 times the seam cells of a round one
3. [TASK-342]: With 1.7.0 the admin's statistics start over: no players yet, and paint counts change scale; the owner's decision. All but traffic goes, a step for devops (docs/deploy.md, section 1) @1.7.0

## CCTV

The admin page (the cctv repo) and the server side it reads (server/admin/).
The API and why it is so: docs/admin-api.md.

1. [CCTV-302]: A player's state `capture` (filming with capture mode's free camera, standing still; `docs/admin-api.md`, a session's players) on the session page beside `menu` and `idle`; reaches the server with PROTOCOL 11 (1.6.2). Done in cctv PR #13 (a Capture tab and label after In menu, a neutral pill; the fake server's ana in capture), waiting for the owner's merge; a real-server check when 1.6.2 is on staging

## Web and promotion

1. TASK [BL-067]: Posts on Reddit with technical decription @1.7.2
2. [TASK-169]: Creating and posting instagram reels @1.7.1
3. [IDEA-301]: Capture mode, part 2: the flight's points saved as JSON, and game time at 0.1x-8x (the points and the flight themselves are in BL-065) @1.7.1

## Auth

1. [IDEA-171]: Add Auth

## Legal

## Codebase

1. [RFCT-202]: src/ root files into folders (paint, menu, input, boot, render), style.css split next to its code; paint after the Painting Rework (docs/ideas/src-folders.md) @1.9.0
2. [RFCT-323]: server/session.ts, src/net/multiplayer.ts and src/main.ts are past the ~400 lines of AGENTS.md: split by responsibility

## Done

Shipped since the last release; the release commit empties this list.

1. [IDEA-225]: Painting Rework: the can as a continuous brush (dabs between frames, build-up when held still, streamline; particles only for show)
2. [IDEA-227]: Painting Rework: the can's physics: hand speed and distance (gap, close, far)
3. [BUGS-330]: Lightning with the Thunder slider at 0 stopped the game with an error (an exponential ramp to 0): it is silent now
4. [IDEA-226]: Painting Rework: opacity on Run + the color keys (Shift + wheel), passes add up, smooth alpha; pressure no longer runs out, shaking is only an animation
5. [IDEA-228]: Painting Rework: the game's crosshair at true size (the line it would leave), the opacity on an arc beside it with its percent; no PSI gauge
6. [TASK-231]: Painting Rework: a dab at an angle stretches along the aim and fades at the far end, and others see it: protocol 12, 3 bytes a slanted stamp; over seams too; the load read again, no op per stroke segment
7. [IDEA-331]: Settings → General in groups (painting, view, help, left hand); Sensitivity while painting and Streamline for every player
8. [IDEA-332]: Settings → General: Field of view: painting, degrees taken off the view while a tool paints
9. [IDEA-333]: Settings: Reset all on General, Audio and Graphics, each for its own tab
10. [IDEA-229]: Painting Rework: six caps with real names, colors and a dot each (NEEDLE, BLUE DOT new), on the roof
11. [IDEA-334]: The cap's and color's tags sit beside the cap and invert what's under them, as the crosshair does; the swatch stays true
12. [IDEA-335]: Painting Rework: the spray is a plume at the nozzle, each cap's own (cone, specks, haze); the old square points are gone
13. [IDEA-337]: The can's crosshair fades where the paint wouldn't land, from the ray it already casts; how faint is a row in F3 (Cursor)
14. [IDEA-339]: The plume follows the opacity set: fewer and fainter specks, as tuned at 65%, for you and for others, in the snapshot's flow byte
15. [PERF-341]: What rays look through near a point: the solids' spheres in one flat array, about 10 times faster; a roof frame's CPU 5.7 → 3.7 ms in the same conditions, fps unchanged
16. [TASK-230]: Paint runs with the brush: past `passes` of wet paint a spot rolls the dice by its cap's `chance`; a failed roll leaves the paint, it pools in the spot and makes a run likelier and longer, and a spot rests after a run: a can held still runs with every cap as a result of the same rule; marker and roller as they were; F3 in passes, chance and rest; `npm run bench:runs`

## Discarder

Dropped items, kept for the record; don't work on them.

1. ~~[RFCT-180]: painting.ts is past the ~400-line limit (412): split it by responsibility (patches for build mode and saves into paint-patch.ts) (no boundary without exposing PaintSystem's internals: 417 lines accepted)~~
2. ~~BUGS [BL-135]: A Mac mouse wheel may need several notches per color (WHEEL.notchPx); measure first (docs/ideas/release-checks.md)~~
3. ~~BUGS [?BL-108]: Loading drops to 12 fps on the Intel UHD with Energy Saver on (docs/ideas/performance.md)~~
4. ~~BUGS [BL-029]: The roof's edits of 2026-10-10 cost 3–9% GPU on the Intel UHD (docs/ideas/performance.md)~~
5. ~~BUGS [BL-032]: One load of the roof took 62 s; not reproduced (docs/ideas/performance.md)~~
6. ~~BUGS [?BL-110]: Crossed lines on the menu's glass bars on the Intel UHD under WSL (likely the driver)~~
7. ~~BUGS [BL-142]: Other players' figures hold their tools wrong: roller width, sponge tilt, ladder model (docs/ideas/tools.md)~~
8. ~~BUGS [BL-072]: Nickname tags don't scale with the UI and resolution~~
9. ~~BUGS [?BL-037]: A game test page twice failed to load its level in 120 s; read `gameReady`'s log when it repeats~~
10. ~~[BUGS-179]: test:mp logs two console errors on dev and still passes: "reading 'frame'" in main.ts step and "reading 'state'" in a test's remotes.get (no bug: both are the tests' own injected faults, now thrown as 'on purpose' errors)~~
11. ~~TASK [BL-077]: Deploy from GitHub Actions (docs/ideas/server-ops.md) (the owner dropped it: deploys stay by hand)~~
12. ~~[TASK-173]: Add cookies notification and all legal necessary documentation (docs/ideas/legal.md) (no cookies: the privacy policy is TASK-178)~~
13. ~~[TASK-186]: What the privacy page now promises holds on the host: the Hetzner data processing agreement signed (owner), logs deleted after 14 days, disk encryption answered: the page claims none until then (devops, docs/ideas/vps.md) (docs/ideas/legal.md) (the owner dropped it: the page no longer mentions the agreement, a log period or encryption)~~
14. ~~[?BUGS-162]: The browser's page zoom scales the HUD and menus (zoom keys, Ctrl+wheel and pinch are blocked already: BROWSER_GUARDS)~~
15. ~~IDEA [?BL-152]: Tune the can's pressure with Shift + mouse (replaced by Painting Rework: IDEA-226)~~
16. ~~TASK [BL-016]: Tune drips per tool by hand and remove the strong ones (drying time, build-up, each cap's and tool's drips): the owner tunes in F3 on dev and pastes the JSON (replaced by Painting Rework: TASK-230)~~
17. ~~TASK [BL-017]: Tune the can's caps until painting feels right, against Bombing!! 2 or paintsessions.com (replaced by Painting Rework: IDEA-229)~~
18. ~~IDEA [BL-042]: Reword the painting: new marker brushes: rectangular and calligraphy (replaced by Painting Rework: IDEA-233)~~
19. ~~[IDEA-165]: Reword the painting: pressure (replaced by Painting Rework: IDEA-226)~~
20. ~~[IDEA-167]: Reword the painting: different brushes (soft / hard) (replaced by Painting Rework: IDEA-229)~~
21. ~~[IDEA-224]: The can as a brush (continuous stroke, opacity, speed and distance feel): bring the R&D branch exp/visual-sandbox into the game (docs/ideas/paint-refactoring.md) (replaced by Painting Rework: IDEA-225 to IDEA-232)~~
22. ~~IDEA [BL-043]: One public server, running 24/7 (the owner's own step once 1.6.0 is deployed)~~
23. ~~[?BUGS-249]: cctv shows a session's time as -1:-1 (cctv's 60 s clock, not the server: in CCTV-252)~~
24. ~~[RFCT-268]: server/time.ts with DAY, HOUR, dayName and iso once (dayName is in 5 files, 864e5 in 7), and one day-files helper (days changed, read back at start, pruned past SERVER.historyDays) for history, people, traffic and events (done in BUGS-280: server/days.ts has DAY, HOUR, iso and dayName once; a day-files helper not worth it: history, people, events and traffic keep and prune their days differently)~~
25. ~~[RFCT-272]: A session's today peak seeded at midnight without a read writing state: the admin API's live() calls today.players() on every read for that (obsolete: a session's `today` went in CCTV-278; its peak is raised on a join, and live() writes nothing)~~
26. ~~[IDEA-193]: Function to lock some some parts of the wall with paintings from changes (admin control) (merged into IDEA-195)~~
27. ~~IDEA [?BL-153]: Find who painted something by player id, picked like the eyedropper (to spot bad paint) (merged into IDEA-195)~~
28. ~~[TASK-287]: Better SEO: large; needs a discussion and the owner's decisions first, done last in the release, not touched until then; being discussed, nothing approved yet (dropped 2026-11-02: what it held is done in TASK-291, TASK-292 and TASK-293)~~
29. ~~IDEA [?BL-147]: Anti-cheat: The server checks what players send (op reach and rate, ladder spot, jumps) before it goes public (dropped 2026-11-02: nothing in the game is worth cheating at; what matters is already there: a bad or oversized message, or an error, closes only that link, a budget per link and limits per address, kick and ban only through the admin API (unpublished port, ADMIN_KEY, CCTV behind tinyauth), admin only with a one-time pass, a player's lock ignored)~~
30. ~~IDEA [BL-064]: A sound editor for the synthesized sounds (dev mode) (dropped 2026-11-02: F3's Sound tab tunes the mix, weather, each cap's hiss and the props)~~
31. ~~TEST [BL-036]: Light baking and weather run on the wall clock; decide what a test would compare first (dropped 2026-11-02: no criterion to test against)~~
32. ~~[?IDEA-233]: Painting Rework: marker nibs, rectangular and calligraphy (not in the branch) (docs/ideas/paint-refactoring.md) (merged into BL-039)~~
33. ~~[TASK-194]: Replace paintable walls that cannot be reached with standard walls. Optimize room on the main floor. (merged into BL-144)~~
34. ~~[BUGS-198]: With F3 open the compact pause menu is under the pickup tags, nameplates, hotbar and toast (docs/ideas/hud-scale.md) (merged into TASK-203)~~
35. ~~[BUGS-199]: LOW PRESSURE runs off the right edge in narrow windows (820×560) (docs/ideas/hud-scale.md) (merged into TASK-203)~~
57. [BUGS-345]: Under 60 frames a second a slow line of the can lost up to half its paint: the can's dabs of the clock are laid in the same frame, and the strokes are tested from 20 Hz up
58. [BUGS-346]: A spot of wet paint was counted on the atlas's grid, so one square could hold two faces, up to a meter or more apart in the world: its squares start at their face's corner now
