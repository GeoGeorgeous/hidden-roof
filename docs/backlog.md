# Backlog

The one list of what's left. Counter for new ids: next: 297

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

1. TASK [BL-076]: Run the next public playtest and verify that all bugs from the previous playtest have been fixed (docs/ideas/weak-links.md) @1.6.2
2. IDEA [?BL-071]: Multiplayer View-Only sessions: past sessions are opened for viewing only (gallary)
3. [IDEA-195]: Admin mode in the game: a one-time link from cctv into any session, unseen, past its limits and stats, flying, with every tool; lock wall faces against paint (docs/ideas/admin-mode.md) @1.6.1
4. [IDEA-288]: Admin mode: who painted what, and erasing one player's paint with what it covered back, within the last ~15 minutes (the server's ring of op batches); after the Painting Rework cuts ops/s (TASK-231) (docs/ideas/admin-mode.md) @1.7.1
5. [IDEA-289]: A 15-minute timelapse of a wall's painting, from IDEA-288's ring of op batches; only if it comes nearly free (docs/ideas/admin-mode.md) @1.7.1

## Painting

1. IDEA [BL-074]: Stencils
2. [IDEA-225]: Painting Rework: the can as a continuous brush (dabs between frames, build-up when held still, streamline; particles only for show) (docs/ideas/paint-refactoring.md) @1.7.0
3. [IDEA-226]: Painting Rework: opacity on Shift + wheel, passes add up, smooth alpha (docs/ideas/paint-refactoring.md) @1.7.0
4. [IDEA-227]: Painting Rework: the can's physics: hand speed and distance (gap, close, far) (docs/ideas/paint-refactoring.md) @1.7.0
5. [IDEA-228]: Painting Rework: a true-size crosshair (the line's width, an opacity arc, too close) (docs/ideas/paint-refactoring.md) @1.7.0
6. [IDEA-229]: Painting Rework: SOFT and HARD caps; tune every cap with the brush, against Bombing!! 2 or paintsessions.com (docs/ideas/paint-refactoring.md) @1.7.0
7. [TASK-230]: Painting Rework: paint runs with the brush: the 1.5.0 runs don't fit it (measured: the can barely runs); puddle runs (by paint volume, no dice) are the candidate (docs/ideas/paint-refactoring.md) @1.7.0
8. [TASK-231]: Painting Rework: network: measure ops/s, the slant shape on the wire (protocol bump), maybe one op per stroke segment (see BL-024) (docs/ideas/paint-refactoring.md) @1.7.0
9. [TASK-232]: Painting Rework: to production: settings into config.ts and F3, no painting by particles, decide endless pressure (unlock-all stays dev only), update golden and multiplayer tests (docs/ideas/paint-refactoring.md) @1.7.0
10. [?IDEA-233]: Painting Rework: marker nibs, rectangular and calligraphy (not in the branch) (docs/ideas/paint-refactoring.md) @1.7.0
11. [?IDEA-166]: Painting Rework: lock the camera while painting (not in the branch) (docs/ideas/paint-refactoring.md) @1.7.0

## Input

1. BUGS [BL-010]: Rare huge mouse jumps snap the camera in Chrome on Windows; the fix is the owner's choice (docs/ideas/mouse-spikes.md) @1.6.1

## Performance

1. BUGS [BL-034]: Paint pages at ULTRA can reach ~1 GB of GPU memory: measured, 1045 MB is the ceiling (all 49 pages, 72% full); the lossless fix is BL-144 (docs/ideas/performance.md)
2. [PERF-200]: Reduce Ladder Shadow Update Delay Without Frequent Rebaking @1.7.0

## Rendering

1. IDEA [BL-066]: A camera mode for trailers and cinematics

## Props and level

1. TASK [BL-143]: A design run on props and the level plan: PropContext, placement, sign text, saves by face (docs/ideas/props-and-level.md)
2. IDEA [BL-144]: Cover v2: drop hidden paint faces and pack pages fuller, after BL-143; up to 28% less paint memory at ULTRA (BL-034) (docs/ideas/props-and-level.md)
3. TASK [BL-055]: Group the props better in build mode: decide which prop goes into which category (docs/ideas/props-and-level.md)
4. [BUGS-161]: A wall prop overlaps a fence
5. IDEA [BL-039]: More marker types, placed on the map; a per-tool variant module first, as caps are (docs/ideas/tools.md) @1.7.0
6. IDEA [BL-050]: Wire cutting
7. IDEA [BL-051]: Dynamic wire length
8. IDEA [BL-052]: Lamps that can be fixed to the floor or the ceiling
9. IDEA [BL-053]: Lamps that light signs
10. IDEA [BL-054]: New sign sizes, including big rectangular and square ones
11. IDEA [BL-075]: Digital billboards
12. IDEA [BL-106]: Paintable cone roofs on the water tanks (a cone paint mapping) (docs/ideas/props-and-level.md)
13. [TASK-194]: Replace paintable walls that cannot be reached with standard walls. Optimize room on the main floor.

## Tools

1. IDEA [BL-062]: Photo mode with Polaroid-like cards for photos
2. IDEA [BL-061]: A player in the style of an old iPod Classic

## UI

1. [TASK-203]: The HUD scales with the window and the DPR: tiny at 4K at 100%, crowded at 820×560 (docs/ideas/hud-scale.md)
2. [BUGS-198]: With F3 open the compact pause menu is under the pickup tags, nameplates, hotbar and toast (docs/ideas/hud-scale.md)
3. [BUGS-199]: LOW PRESSURE runs off the right edge in narrow windows (820×560) (docs/ideas/hud-scale.md)
4. [IDEA-204]: Notifications beyond play: the menu, pages, loading and a hidden tab on the same model; screen-reader announcements; more events (away and back, context lost, online, refused pointer lock or clipboard); battery (docs/ideas/notifications.md)

## Avatar

1. IDEA [BL-056]: New character avatar with a correct rig (docs/ideas/avatar.md)
2. IDEA [BL-057]: Two body types, male and female, after BL-056 (docs/ideas/avatar.md)
3. IDEA [BL-058]: Clothing attached as meshes, after BL-057 (docs/ideas/avatar.md)
4. IDEA [BL-059]: A character customization screen, after BL-058 (docs/ideas/avatar.md)
5. IDEA [BL-060]: Avatar for NPCs, first-person hands, the hood outside F3 (docs/ideas/avatar.md)

## Audio

1. IDEA [BL-063]: License-free background music: drum and bass, jungle @1.8.0
2. IDEA [BL-064]: A sound editor for the synthesized sounds (dev mode) @1.8.0
3. IDEA [BL-148]: Other players' sounds: spray hiss, marker, footsteps, landing as positional voices @1.8.0

## Tests and tooling

1. TEST [BL-035]: Fixed-step tests for walking, collisions, jumps and climbing
2. TEST [BL-036]: Light baking and weather run on the wall clock; decide what a test would compare first

## Servers and deploy

1. IDEA [?BL-147]: Anti-cheat: The server checks what players send (op reach and rate, ladder spot, jumps) before it goes public @1.6.1
2. [TASK-201]: Research itch.io Publishing Requirements, AI Policies, and Download Restrictions @1.6.3

## CCTV

The admin page (the cctv repo) and the server side it reads (server/admin/). 
The API and why it is so: docs/admin-api.md.

1. [CCTV-290]: "Join as admin" on a session: ask the server for a one-time pass, open the game at its server's address with it (IDEA-195, docs/ideas/admin-mode.md) @1.6.1

## Web and promotion

1. TASK [BL-067]: Posts on Reddit with technical decription @1.6.3
2. [TASK-169]: Creating and posting instagram reels @1.7.0
3. IDEA [BL-065]: A minimal tool to record gameplay as GIFs and short videos @1.6.2

## Auth

1. [IDEA-171]: Add Auth

## Legal

## Codebase

1. [RFCT-202]: src/ root files into folders (paint, menu, input, boot, render), style.css split next to its code; paint after the Painting Rework (docs/ideas/src-folders.md) @1.8.0

## Done

Shipped since the last release; the release commit empties this list.

1. [TASK-276]: Production on 1.6.0, deployed 2026-11-01 (docs/deploy.md §1): the server's data, admin key and the public session, the GeoIP base with its monthly cron, roof-traffic, Caddy's `/api/main` for the admin page; then a full wipe of DATA_DIR and LOG_DIR on main and next (the owner), the public sessions made again; the owner checked it in a browser (version, cctv main and next, a session made and closed) @1.6.0
2. [TASK-187]: The beacon, the device id and the address hash run without a consent dialog (the owner's decision and risk, recorded in SECRET_legal.md; confirmed 2026-11-01: no switch either); the privacy page names them (TASK-242, done); nothing left to build (the owner, 2026-11-01)
3. [RFCT-270]: The beacon's limit per address through PerMinute, the third copy of "N a minute per address" (logNoisy is another); PerMinute reads its SERVER limits when asked, so a test can still change them (done in BUGS-280: beacon.ts and log.ts use PerMinute, its limits read when asked)
4. [RFCT-273]: The snapshot's layout in one place: SNAPSHOT_FEET and SNAPSHOT_REST beside SNAPSHOT_BYTES (net/protocol.ts), read by encodeSnapshot, snapshotSpot and the sender's still check (sender.ts stays loadable in Node for its test)
5. [PERF-269]: The server's thread spared on admin reads: a /stats period sums each whole day before today from that day's total, made once (history.total); measured over 91 days of full hours: /stats/play?period=30d 325 → 23 ms, paint 324 → 22, client 219 → 14 (the first ask after a start makes the days, ~200 ms); the log's appendFileSync left as it is (2.2 µs a line against 0.6 on an open file)
6. [BUGS-234]: Holding Esc in fullscreen on a Mac says ⌃ ⌘ F leaves at once, not F11: Chrome on a Mac has no F11 for fullscreen, and Fn+F11 shows the desktop (checked by the owner: ⌃⌘F leaves)
7. BUGS [BL-011]: Title-screen pickup rings sized for the title view, not where the player stands: Pickups.view takes the camera the frame is drawn from and places the rings again when it changes, the game stopped or not; big rings high up in build mode are PICKUP.ring.minSize, as designed (the owner)
8. [TASK-189]: The Terms' moderation section (Rules): by hand, on reasonable belief, in proportion: erase paint, change the nickname, remove from a session, ban by address and device for a time or for good; a ban's reason and end shown in the game, any other measure's reason by email; reports (what and why) and appeals by email, a ban that blocks someone else included; read by a Sonnet legal review; the Privacy Policy names bans' legal basis
9. [IDEA-240]: Admin: ban a player by address (/64) and device id, for 1 day to 6 months or for good, with a reason (presets or the admin's own) the player is shown in the game and in place of the server list; shorten, change the reason, lift (`docs/admin-api.md`, Bans); a place in line put out is a turned-away event, and goes before seats free; cctv's Ban action and Bans page (cctv PRs #10, #11); checked on cctv's fake server, on the real one when dev reaches next
10. [CCTV-286]: A public session made from the admin page with the number of players chosen, as a private one's: `POST /sessions` takes `limit` for a public session too, `limits.private.min` to `limits.public`; cctv's Players stepper (cctv PR #10)
11. [BUGS-235]: A stepladder can't stand in an open door's way, so nobody can block it in a public session: not in its opening, nor within 0.9 m in front of the wall or behind it (`STEPLADDER_PLACE.doorwayWidth` and `doorwayDepth`, 0.9 m each) (the door prop's `passage` piece, `Level.inPassage`); the toast says "Not in a doorway"; checked by the placer's game only, as the rest of where it stands; scaffolding left out (the owner, 2026-11-01)
12. [TASK-291]: SEO basics: the page about the game in place of screen 10 (static in index.html, the Terms page look; hidden where the game loads; in the game, About → Game opens it over the paused game through a portal, its button back in; a loop of the game in the hero, six fact cards, How to start playing with Send the link to yourself, Play now once the window is big enough, and in the game a note when the window gets too small), the site name, title and description in search results, the structured data, llms.txt and sitemap
13. [TASK-292]: The Updates page (/updates.html): every release note as plain HTML a crawler reads, written by the build from docs/releases with the game's own parser, in the Terms page look; linked from the page about the game, Terms, Privacy, the sitemap and llms.txt
14. [TASK-293]: The sitemap's lastmod and the structured data's dateModified written by the build from git (the day each page's source last changed), not by hand at a release; an IndexNow key in public/ and scripts/indexnow.mjs, run once after each deploy; Caddy checked: crawlers (Googlebot, bingbot, GPTBot, ClaudeBot, PerplexityBot) get 200, unknown paths a real 404
15. [TASK-294]: The page about the game: an About section (the six fact cards, About in the top bar), The game right after it (the owner's words on what the game is: paint anything, painting, tools, vibes, and under P.S. a solo developer's ask for Ko-fi, Discord and the socials), How to play listing every tool with the server list's icon, and the FAQ on a slow game: the performance test, a laptop's power saver, the built-in GPU, the Frame rate setting; the FAQ in five groups, each question opening in place; About → Game's button says Start the game on the title screen, Back to the game after; How to start playing hidden once Play now shows
16. [TASK-295]: The page about the game's note when the game can't start, in the page's look: a red dot by what went wrong, what to do (WebGL2 off: most often hardware acceleration; a file that didn't load: the connection), and Reload the page
17. [TASK-296]: How to start playing only where the game can't start, saying what to do, right after the fact cards: a phone gets Play on a computer with Send the link to yourself, a desktop window too small Make the window bigger; gone over the game, once Play now shows, and when the game failed

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
