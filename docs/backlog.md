# Backlog

The one list of what's left. Counter for new ids: next: 275

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
3. IDEA [?BL-153]: Find who painted something by player id, picked like the eyedropper (to spot bad paint)

## Painting

1. IDEA [BL-074]: Stencils
2. [IDEA-193]: Function to lock some some parts of the wall with paintings from changes (admin control)
3. [IDEA-225]: Painting Rework: the can as a continuous brush (dabs between frames, build-up when held still, streamline; particles only for show) (docs/ideas/paint-refactoring.md) @1.7.0
4. [IDEA-226]: Painting Rework: opacity on Shift + wheel, passes add up, smooth alpha (docs/ideas/paint-refactoring.md) @1.7.0
5. [IDEA-227]: Painting Rework: the can's physics: hand speed and distance (gap, close, far) (docs/ideas/paint-refactoring.md) @1.7.0
6. [IDEA-228]: Painting Rework: a true-size crosshair (the line's width, an opacity arc, too close) (docs/ideas/paint-refactoring.md) @1.7.0
7. [IDEA-229]: Painting Rework: SOFT and HARD caps; tune every cap with the brush, against Bombing!! 2 or paintsessions.com (docs/ideas/paint-refactoring.md) @1.7.0
8. [TASK-230]: Painting Rework: paint runs with the brush: the 1.5.0 runs don't fit it (measured: the can barely runs); puddle runs (by paint volume, no dice) are the candidate (docs/ideas/paint-refactoring.md) @1.7.0
9. [TASK-231]: Painting Rework: network: measure ops/s, the slant shape on the wire (protocol bump), maybe one op per stroke segment (see BL-024) (docs/ideas/paint-refactoring.md) @1.7.0
10. [TASK-232]: Painting Rework: to production: settings into config.ts and F3, no painting by particles, decide endless pressure (unlock-all stays dev only), update golden and multiplayer tests (docs/ideas/paint-refactoring.md) @1.7.0
11. [?IDEA-233]: Painting Rework: marker nibs, rectangular and calligraphy (not in the branch) (docs/ideas/paint-refactoring.md) @1.7.0
12. [?IDEA-166]: Painting Rework: lock the camera while painting (not in the branch) (docs/ideas/paint-refactoring.md) @1.7.0

## Input

1. BUGS [BL-010]: Rare huge mouse jumps snap the camera in Chrome on Windows; the fix is the owner's choice (docs/ideas/mouse-spikes.md) @1.6.1
2. [BUGS-234]: on MacOS pressing F11 doesn't exit fullscreen instantlly

## Performance

1. BUGS [BL-034]: Paint pages at ULTRA can reach ~1 GB of GPU memory: measured, 1045 MB is the ceiling (all 49 pages, 72% full); the lossless fix is BL-144 (docs/ideas/performance.md)
2. [PERF-200]: Reduce Ladder Shadow Update Delay Without Frequent Rebaking @1.7.0
3. [PERF-269]: The server's thread spared on admin reads and logging: /traffic?period=30d reads and parses up to 31 hours files one after another (MBs of JSON), /history?period=30d sums 720 hours each time (closed hours never change), /events/page parses today's whole file for 50 events; the log appends each line with appendFileSync

## Rendering

1. BUGS [?BL-011]: Title-screen pickup rings are sized for where the player stands, not the title view @1.6.1
2. IDEA [BL-066]: A camera mode for trailers and cinematics

## Props and level

1. TASK [BL-143]: A design run on props and the level plan: PropContext, placement, sign text, saves by face (docs/ideas/props-and-level.md)
2. IDEA [BL-144]: Cover v2: drop hidden paint faces and pack pages fuller, after BL-143; up to 28% less paint memory at ULTRA (BL-034) (docs/ideas/props-and-level.md)
3. TASK [BL-055]: Group the props better in build mode: decide which prop goes into which category (docs/ideas/props-and-level.md)
4. [BUGS-161]: A wall prop overlaps a fence
5. IDEA [BL-039]: More marker types, placed on the map @1.7.0
6. IDEA [BL-050]: Wire cutting
7. IDEA [BL-051]: Dynamic wire length
8. IDEA [BL-052]: Lamps that can be fixed to the floor or the ceiling
9. IDEA [BL-053]: Lamps that light signs
10. IDEA [BL-054]: New sign sizes, including big rectangular and square ones
11. IDEA [BL-075]: Digital billboards
12. IDEA [BL-106]: Paintable cone roofs on the water tanks (a cone paint mapping) (docs/ideas/props-and-level.md)
13. [TASK-194]: Replace paintable walls that cannot be reached with standard walls. Optimize room on the main floor.
14. [BUGS-235]: Placing ladder by other players can block pass through an open door or a scaffolding

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
3. [IDEA-195]: Spectator/god mode for admin @1.6.1

## Servers and deploy

1. IDEA [BL-047]: Admin panel: servers stats (players online, perfomance, etc), players info (username, IP, ping); ban by IP is IDEA-240 (docs/ideas/public-servers.md) @1.6.0
2. [IDEA-240]: Admin: ban by IP (with a reason the player is shown); restoring a save is CCTV-255 (docs/ideas/public-servers.md)
3. IDEA [?BL-147]: Anti-cheat: The server checks what players send (op reach and rate, ladder spot, jumps) before it goes public @1.6.1
4. [TASK-201]: Research itch.io Publishing Requirements, AI Policies, and Download Restrictions @1.6.3

## CCTV

The admin page (the cctv repo) and the server side it reads (server/admin-api.ts). Specs: docs/ideas/admin-data.md.

1. [CCTV-271]: A save's `stats` in GET /sessions in the shape of the session's `stats` (stamps by tool, painters), the page sums them; and one of a session's `today` and `stats` for the page, not both

## Web and promotion

1. TASK [BL-067]: Posts on Reddit with technical decription @1.6.3
2. [TASK-169]: Creating and posting instagram reels @1.7.0
3. IDEA [BL-065]: A minimal tool to record gameplay as GIFs and short videos

## Auth

1. [IDEA-171]: Add Auth

## Legal

1. [TASK-187]: The beacon, the device id and the address hash run without a consent dialog (the owner's decision and risk, recorded in SECRET_legal.md); the privacy page names them (TASK-242)
2. [TASK-242]: The privacy page names what the admin's stats keep: a random device id in localStorage, the address as a salted hash (a new salt every 30 days), the country, plays kept 30 days and counts forever, the web traffic read from the server's access log (a visitor as a salted hash of address and browser, a new salt every 30 days, the hashes kept by the hour for 30 days); why, and how to object; DB-IP's credit (CC BY 4.0) (docs/ideas/public-servers.md); the beacon's session-link minute too (ping, closes, KB/s: no ids)
3. [TASK-189]: The Terms' moderation section (DSA: grounds and measures, reports by email, a restricted player told what and why); the house rules screen is in (docs/ideas/public-servers.md)

## Codebase

1. [RFCT-202]: src/ root files into folders (paint, menu, input, boot, render), style.css split next to its code; paint after the Painting Rework (docs/ideas/src-folders.md) @1.8.0
2. [RFCT-268]: server/time.ts with DAY, HOUR, dayName and iso once (dayName is in 5 files, 864e5 in 7), and one day-files helper (days changed, read back at start, pruned past SERVER.historyDays) for history, people, traffic and events
3. [RFCT-270]: The beacon's limit per address through PerMinute, the third copy of "N a minute per address" (logNoisy is another); PerMinute reads its SERVER limits when asked, so a test can still change them
4. [RFCT-272]: A session's today peak seeded at midnight without a read writing state: the admin API's live() calls today.players() on every read for that
5. [RFCT-273]: The still player's "same stance" check next to encodeSnapshot (sender.ts reads the snapshot's byte offsets itself)

## Done

Shipped since the last release; the release commit empties this list.

1. TASK [BL-044]: Disable HOST for everyone (kept in the code, SERVER.playerHost); JOIN by code moved into the server list
2. IDEA [BL-045]: A list of all sessions, public and private, instead of host and join
3. [DSGN-160]: The lobby list for BL-045: allowed tools, players online, ping with the server's country
4. [TASK-236]: Private and public sessions: private joined by code (2 to 4 players), public open to all (up to 20), created by the admin (server command)
5. [IDEA-237]: Session names chosen at creation, shown in the server list
6. [TASK-238]: Public paint stored and backed up, restored after a host outage; wiped when the protocol, surface table or level changes, or by the admin
7. IDEA [BL-046]: A queue to enter a full session: your place in line, pushed by the server; held 3 minutes after a dropped link
8. TASK [BL-154]: Tools a session turns off at creation are gone from its map and hands (the server drops their ops and stepladders too)
9. [TASK-243]: Admin actions from cctv: kick a player (the game says so), and download a session's paint as of now (any session, not kept on disk)
10. [TASK-239]: The admin's wipe keeps the last 3 paint saves, and a restart after it still starts from the empty wall
11. [TASK-244]: The beacon counts game events in its minute summary, solo too: the funnel (Play, level ready, first spray, joined a session), pickups by item, jumps, falls, the stepladder, time playing, idle and in menus, the tutorial steps learnt, settings chosen and changed, screenshots and Discord clicks (the game has no Share); who is on the site now (a beacon every minute, even an empty one, saying menu, solo, in a session or hidden: on the site and solo counted from the last minute's beacons, public and private from the server itself, in `/events` status); /history's `client` sends counts by key, not a top 5 cut (errors by message, fps, load and join times as histograms beside their median and p95)
12. [TASK-241]: Read Caddy's access log in a container of its own on the host, `roof-traffic` (not the game server): page views, referrers and UTM, the first funnel steps, as daily rollups for the admin page's Traffic tab; our own links carry `?ref=` (discord, ig, tg), counted with `utm_source` and the Referer as one Source
13. [IDEA-188]: Who plays and from where, counted on the server: country from the IP at connect, counts only, the IP not kept (SECRET_legal.md)
14. [BUGS-246]: The queue and the paint loading screen show the server's roof, as the title screen does, not the player's last view; once loaded the same screen stays, without its progress, and asks for a click ("Click to play", bottom right beside Leave, or anywhere on the screen) instead of opening the ESC menu; the pointer lock is also tried at once, for a browser that allows it
15. [BUGS-247]: A session the admin closes says so in the game's dialog ("The admin ended this session"), not that everyone left; a new close reason `closed` (code 4012) beside `ended`, added in protocol 8 as the kick was, no bump; those waiting in line are told the same
16. [TASK-250]: The public join dialog in two steps: the session and the name (always asked), then the house rules and the consent, both of one size and in one order (title, the session's line, a rule, the step; the name large at the bottom, as the private code), where "Don't show again" skips only that step, so the name can always be changed; Esc goes back a step; private sessions are as before
17. [TASK-251]: One game tab per browser (Web Locks, decided before the level loads): a second tab only says "The game is open in another tab" (no takeover: the owner wants one game, nothing moved between tabs); and the server seats a JOIN from the device of a player whose link is still open in that player's seat (the old link is closed as replaced)
18. [BUGS-168]: A player who comes back under the same nickname gets their inventory and their last position back (the server keeps the last position from the state it relays, checks it against the level, and the welcome carries it)
19. [TASK-245]: A public session gives one address at most 4 seats and 4 places in its line (a household shares one), and takes 10 JOINs a minute from one address; refused with their own reasons and texts; a dropped seat is still taken back by its nickname
20. [CCTV-254]: Stats per session, since its paint began (made, wiped or restored): stamps by tool, colors, painters, play seconds, joins, most players at once, counted where the day's are; GET /sessions and the event stream carry them as `stats`, each public save keeps its own beside it, a wipe zeroes them; the server's history is as it was
21. [CCTV-255]: A public session's saves kept by age (the newest, and the newest at least 6 h, 1 day, 3 days and 7 days old; a wipe puts the current ones aside, replacing the last wipe's), listed with their stats, each downloadable (`GET /sessions/CODE/saves/MS`) and restorable into the live session (`POST /sessions/CODE/restore`: an undo save first, the players dropped and back on the restored paint, event `restored`); a private session's paint downloads as it is now, never kept
22. [CCTV-256]: A new session, public or private, starts empty or from an uploaded save: `POST /uploads` takes the paint file (streamed to disk, up to 128 MB, kept 60 min) and checks it as a save is loaded, `POST /sessions` takes its id (made on its level at its detail, with its paint), and a restore takes it too; one for another level, detail or surface table is refused
23. [CCTV-253]: Events kept on disk (a file a day, 30 days, capped in size) and read in pages; the page shows 50 a page with prev and next
24. [CCTV-258]: "On the site" counts each open page once, not each heartbeat in its 90 s window (2 players showed up to 5): a page id in the beacon, and a goodbye beacon when the page is left
25. [CCTV-259]: A badge for how fresh each figure is (live, the minute's beacon with the next one due, hourly, daily), its tooltip saying where the data comes from; the server sends each source's time and interval
26. [CCTV-260]: People in one model: Visitors (unique, from the web log) > Views (page loads) > Players (solo and multiplayer, unique by the device id, now in the beacon) > in sessions, with Now beside it; by address behind a switch, merged dropped; Main rebuilt on it
27. [CCTV-252]: Session > Players: one placeholder for a field not there yet (ping in a player's first 10 s or while dropped, time, country); time in game as H:MM:SS on a 1 s clock, never below 0 (it showed -1:-1); Kick keeps its place @1.6.0
28. [CCTV-257]: One switch for every time on the page: UTC or the browser's local time; days still count in UTC @1.6.0
29. [TEST-177]: A patch release may have no picture: nothing shows in its place in the game, on GitHub or on Discord; a minor or major release still needs one (docs/releases/AGENTS.md) @1.6.0
30. [TEST-248]: Closing the tab, checked in browsers against a server: the goodbye beacon on pagehide takes the page off the site count at once (menu, solo and session alike); the session sees the link close with 1001 and holds the seat as for a drop (TASK-262) @1.6.0
31. [TASK-262]: A closed tab in a session (the browser closes the link with 1001, a lost connection gives 1006) holds the seat 15 s (`SERVER.closedHold`), not the 180 s rejoin window: it frees a seat and the line soon, while a reload (or a proxy closing links the same way) is back by then; tested in lobby-test @1.6.0
32. [CCTV-263]: The session's saves note follows the server: `GET /` says `saveEvery` (s, `KEEP_EVERY`) and `saveAges` (s), and the page words them (it said every 30 minutes, whatever the server did) @1.6.0
33. BUGS [BL-024]: Paint ops are most of the downstream bytes: measured (2026-10-27, `npm run study:load`): 20 players work as is, 40 on the server but heavy painting sends ~360 KB/s to each, 60 is the server's one thread full (by frames), 80 doesn't; follow-ups PERF-264 and PERF-265; merging stamps and shedding load on slow links not taken (owner: shedding could make weak links less smooth; maps are small, so no rate by distance) (docs/ideas/weak-links.md) @1.6.0
34. [PERF-264]: The others' states and ops reach a game in one relay frame per turn of the server's event loop (nothing waits longer than what came in with it), 9 B a state or ops over its bytes; protocol 9. Measured (`npm run study:load`, typical / heavy painting): 60 players 51% / 80% of the server's core (was 100% / 100%), 80 players 55% / 90% with ping p99 13 / 10 ms (was 12 / 17 s); bytes a player receives as before or less (docs/ideas/weak-links.md) @1.6.0
35. [PERF-265]: A player standing still (feet within 1 mm, the rest the same) sends two states a second, not 20 (`NET.stillRate`), once two alike have gone, so the others see no speed to guess on; moving again sends the one held back first, so the move starts when it began (scripts/sender.test.mjs) @1.6.0
36. [CCTV-266]: The server's log of a day, downloadable from the admin page: `GET /logs` (the day files with their size, `keepDays`, `redactDays`), `GET /logs/DAY` as it is, `?session=CODE` that session's lines with the stack lines under them; a Server log panel on Main and Download log on a session (cctv 4f34852) @1.6.0
37. [CCTV-267]: Network health in the beacon, as the first playtest's telemetry had it: each minute in a session the app ping (p50, p95, max), closes by code (`timeout`: the game gave up on a silent link), reconnect times, stalls (nothing from the server for over 1.5 s), KB/s each way; counted per hour as `client.net` in /history; a Network block on Stats (lost links an hour of session time: 1006 and timeout) (cctv 4c498f1) @1.6.0
38. [CCTV-261]: ADMIN_API 3: /history's `people` and `countries` gone (players, inSessions and playerCountries), a session's `today.topColor` gone (the page takes the most painted of `colors`), `client`'s fps, low1, load and join plain histograms keyed in their unit with no medians (the page makes them); deployed with cctv a608340 @1.6.0
39. [RFCT-274]: 1.6.0's network and admin code made simpler (review of 2026-10-27): a rejection is the link's close code alone (no `rejected` message; protocol stays 9), every way out of a session is one path with one `left` event (a kick wrote two, a close none), one lock per kept session and the saves chained, one atomic write, progress as a step and a percent, Reconnect keeps its own tries, HOST in lobby-host.ts, no fixups for formats only staging wrote (its stats, people and traffic files are wiped before the release) @1.6.0

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
