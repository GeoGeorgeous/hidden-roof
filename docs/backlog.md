# Backlog

The one list of what's left. Counter for new ids: next: 182

<details>
<summary>Backlog rules (read before editing)</summary>

### File structure

- **Counter:** one sequential counter for all items, on the line above. Every new id takes that number, then the counter goes up by one. Numbers are never reused, even if an item's type changes or the item is deleted.
- **Sections:** domain sections (Multiplayer, Painting, UI, ...) hold the backlog; `Done` holds items shipped since the last release and is emptied by the release commit.
- **Numbering:** items are numbered 1, 2, 3... within each section. Renumber the section after any add, move or removal.

### Item line

`N. [~~]TYPE [MARKERS ID]: Description (path/to/detail.md) @X.Y.Z[~~]`

Only `N.`, the id and the description are required. The optional parts appear in this order:

- **TYPE:** `BUGS`, `IDEA`, `TASK`, `DSGN` (designer's work comes first), `PERF` (frame time, memory, load time), `RFCT` (refactor, same behavior), `TEST` (tests and tooling), `DOCS` (docs only).
- **ID:** two formats exist. Both took their numbers from the same counter, so a number appears only once across all of them.
  - **Current format** `[TYPE-NNN]`, for every new item. No separate type word; the type is the id prefix. Example: `3. [BUGS-165]: Lamps flicker after a reload`
  - **Legacy format** `[BL-NNN]`, for items created before the change. These keep a type word in front, because the id carries no type. Example: `1. TASK [BL-013]: Device checks before the release`
  - Never create new `BL` ids, and never convert a `BL` id to the current format. Other lines, docs and commits refer to it (e.g. "after BL-015").
  - **Reclassifying:** keep the number. For a current id change the prefix (`[BUGS-161]` becomes `[TASK-161]`); for a legacy id change only the type word (`IDEA [BL-071]` becomes `TASK [BL-071]`).
- **Markers:** zero or more characters inside the brackets, before the id, always in the order `!?>`: `!` critical, `?` unconfirmed (verify before working on it), `>` explain (the owner wants it explained). Examples: `[?BUGS-162]`, `[!>BL-024]`. Keep markers when editing a line; never drop them silently.
- **Detail link:** specs live in `docs/ideas/` and are linked in parentheses after the description.
- **Release tag:** `@X.Y.Z` at the very end of the line.
- **Deleted:** everything after the number is wrapped in `~~...~~`. The item is dropped but kept for the record: don't work on it, don't move it to Done, and don't remove the line unless asked.

### Release planning

- An item is planned for a release, the current one included, with `@X.Y.Z` at the end of its line. It stays in its domain section. The current release is the one after the latest git tag (`git describe --tags --abbrev=0`).
- An item without a tag is unplanned. A release's list is every line tagged with that version.
- Never invent a release tag. Plan items for a release only when asked.
- **Starting the next release** (e.g. 1.4.0 is released and 1.5.0 begins): leave every tag where it is; ask before retagging anything left unshipped from the old release.

### Operations

- **Add:** take the counter's number and increment it. Write `[TYPE-NNN]` under the right domain, and link a detail doc if there is one.
- **Ship:** move the line into Done and drop its release tag. Delete its detail doc in `docs/ideas/` (or its part of a shared one) and the link.
- **Delete:** wrap the line in `~~...~~` in place; don't remove it.
- **Unconfirmed (`?`):** before working on it, check whether the problem is real and report back. Remove the `?` only once it is confirmed.
- **Explain (`>`):** find every id containing `>`. For each, say what the task means, why it matters and what the work involves, using the linked docs/ideas file and the code. Then remove the `>` from those ids.

</details>

## Multiplayer

1. BUGS [BL-024]: Paint ops are most of the downstream bytes; merge stamps, shed load on slow links, after the playtest (docs/ideas/weak-links.md) @1.6.1
2. TASK [BL-076]: Run the next public playtest and verify that all bugs from the previous playtest have been fixed (docs/ideas/weak-links.md) @1.6.1
3. IDEA [BL-114]: A failure says whether the player was in a session, for the notification system (docs/ideas/notifications.md) @1.9.0
4. IDEA [?BL-071]: Multiplayer View-Only sessions: past sessions are opened for viewing only (gallary)
5. TASK [BL-151]: Show what each other player is doing, add more statuses (in the menu, in Settings…) by their nameplate. For now, we have AWAY and DISCONNECTED @1.6.0
6. IDEA [?BL-153]: Find who painted something by player id, picked like the eyedropper (to spot bad paint)
7. TASK [BL-154]: Limit some tools in multiplayer (e.g. the roller) @1.6.0
8. [TASK-168]: Returning players recover their inventory but spawn at the default spawn instead of their last position. Restore both inventory and position. @1.7.0

## Painting

1. IDEA [BL-074]: Stencils
2. IDEA [?BL-152]: Tune the can's pressure with Shift + mouse
3. TASK [BL-016]: Tune drips per tool by hand and remove the strong ones (drying time, build-up, each cap's and tool's drips): the owner tunes in F3 on dev and pastes the JSON (docs/ideas/painting.md) @1.5.0
4. ~~[RFCT-180]: painting.ts is past the ~400-line limit (412): split it by responsibility (patches for build mode and saves into paint-patch.ts) @1.5.0 (no boundary without exposing PaintSystem's internals: 417 lines accepted)~~
5. TASK [BL-017]: Tune the can's caps until painting feels right, against Bombing!! 2 or paintsessions.com (docs/ideas/painting.md) @1.7.0
6. IDEA [BL-042]: Reword the painting: new marker brushes: rectangular and calligraphy @1.7.0
7. [IDEA-165]: Reword the painting: pressure @1.7.0
8. [IDEA-166]: Reword the painting: lock the camera @1.7.0
9. [IDEA-167]: Reword the painting: different brushes (soft / hard) @1.7.0

## Input

1. BUGS [?BL-010]: Rare huge mouse jumps snap the camera in Chrome on Windows; the fix is the owner's choice (docs/ideas/mouse-spikes.md)
2. ~~BUGS [BL-135]: A Mac mouse wheel may need several notches per color (WHEEL.notchPx); measure first (docs/ideas/release-checks.md)~~

## Performance

1. BUGS [BL-034]: Paint pages at ULTRA can reach ~1 GB of GPU memory: measured, 1045 MB is the ceiling (all 49 pages, 72% full); the lossless fix is BL-144 (docs/ideas/performance.md)
2. ~~BUGS [?BL-108]: Loading drops to 12 fps on the Intel UHD with Energy Saver on (docs/ideas/performance.md)~~
3. ~~BUGS [BL-029]: The roof's edits of 2026-10-10 cost 3–9% GPU on the Intel UHD (docs/ideas/performance.md)~~
4. ~~BUGS [BL-032]: One load of the roof took 62 s; not reproduced (docs/ideas/performance.md)~~
5. [PERF-181]: Placing a stepladder still costs one ~6 ms frame: about 3 ms is environment.rebuild (rain heightmap, lights), which a runtime prop never changes; skip it for runtime props

## Rendering

1. BUGS [?BL-011]: Title-screen pickup rings are sized for where the player stands, not the title view
2. ~~BUGS [?BL-110]: Crossed lines on the menu's glass bars on the Intel UHD under WSL (likely the driver)~~
3. IDEA [BL-066]: A camera mode for trailers and cinematics

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
12. IDEA [BL-106]: Paintable cone roofs on the water tanks (a cone paint mapping) (docs/ideas/painting.md)

## Tools

1. ~~BUGS [BL-142]: Other players' figures hold their tools wrong: roller width, sponge tilt, ladder model (docs/ideas/tools.md)~~
2. IDEA [BL-062]: Photo mode with Polaroid-like cards for photos
3. IDEA [BL-061]: A player in the style of an old iPod Classic
4. [TEST-177]: Allow releasing small patch versions with no image at all @1.6.1

## UI

1. IDEA [BL-140]: One notification system: messages lost in menus and hidden tabs, nothing in play says reconnecting (docs/ideas/notifications.md) @1.9.0
2. DSGN [BL-092]: A screen that teaches the controls; the owner has the design: ask for it @1.5.0
3. ~~BUGS [BL-072]: Nickname tags don't scale with the UI and resolution~~
4. ~~[?BUGS-162]: The browser's page zoom scales the HUD and menus (zoom keys, Ctrl+wheel and pinch are blocked already: BROWSER_GUARDS) @1.5.0~~
5. TASK [BL-078]: Show BUY ME A COFFEE again once it has a link (revert e2c2310) @1.6.0
6. [BUGS-175]: Screenshot K does not capture players name tags @1.5.0

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
2. ~~BUGS [?BL-037]: A game test page twice failed to load its level in 120 s; read `gameReady`'s log when it repeats~~
3. TEST [BL-036]: Light baking and weather run on the wall clock; decide what a test would compare first
4. TASK [BL-156]: CI is pinned to ubuntu-24.04 for 1.4.0; move it to Ubuntu 26 as 1.5.0's last task, once GitHub's runners have it @1.5.0
5. ~~[BUGS-179]: test:mp logs two console errors on dev and still passes: "reading 'frame'" in main.ts step and "reading 'state'" in a test's remotes.get (no bug: both are the tests' own injected faults, now thrown as 'on purpose' errors)~~

## Servers and deploy

1. PERF [BL-030]: Precompressed assets served by Caddy; the host's part goes to devops (docs/ideas/server-ops.md, docs/ideas/vps.md) @1.5.0
2. TASK [BL-077]: Deploy from GitHub Actions (docs/ideas/server-ops.md)
3. IDEA [BL-043]: One public server, running 24/7 (docs/ideas/public-servers.md) @1.6.0
4. TASK [BL-044]: Disable host and join (don't remove them), after BL-043 (docs/ideas/public-servers.md) @1.6.0
5. IDEA [BL-045]: A window of public servers instead of host and join (docs/ideas/public-servers.md) @1.6.0
6. [DSGN-160]: The lobby list for BL-045: allowed tools, players online, ping with a country flag @1.6.0
7. IDEA [BL-046]: A queue to enter the server, after BL-043 (docs/ideas/public-servers.md) @1.6.0
8. IDEA [BL-047]: Admin panel: servers stats (players online, perfomance, etc), players info (username, IP, ping), ban by IP, after BL-043 (docs/ideas/public-servers.md) @1.6.0
9. IDEA [?BL-147]: Anti-cheat: The server checks what players send (op reach and rate, ladder spot, jumps) before it goes public @1.6.0

## Web and promotion

1. TASK [BL-068]: Meta tags: title, description, canonical, Open Graph, Twitter Card; ask the owner the open questions first (docs/ideas/seo.md) @1.5.0
2. TASK [BL-069]: robots.txt (with rules for AI bots), sitemap.xml and llms.txt (docs/ideas/seo.md) @1.5.0
3. TASK [BL-070]: JSON-LD, semantic HTML outside the canvas, favicons and a web manifest (docs/ideas/seo.md) @1.5.0
4. TASK [BL-067]: Posts on Reddit with technical decription @1.6.0
5. [TASK-169]: Creating and posting instagram reels @1.7.0
6. IDEA [BL-065]: A minimal tool to record gameplay as GIFs and short videos
7. [TASK-170]: Create accounts in social media (Discord, Instagram, YouTube, TikTok, subreddit) @1.5.0

## Auth

1. [IDEA-171]: Add Auth

## Legal

1. [TASK-176]: Add LICENCE, CONTRIBUTING, Terms of Service and other Legal docs; ask the owner the open questions first (docs/ideas/legal.md) @1.5.0
2. ~~[TASK-173]: Add cookies notification and all legal necessary documentation (docs/ideas/legal.md) @1.5.0 (no cookies: the privacy policy is TASK-178)~~
3. [TASK-178]: Privacy policy, with the legal docs: no cookies or analytics; the server and Caddy see IP addresses, other players see nicknames, settings stay in localStorage (docs/ideas/legal.md) @1.5.0

## Done

Shipped since the last release; the release commit empties this list.

1. BUGS [BL-031]: Four shaders still compile in the first frame
2. TASK [BL-141]: Exhaustive tool lists: a forgotten tool becomes a compile error; the tool names in one place
3. TEST [BL-079]: The F3 probe's own shader compiles land in its measurement
4. TEST [BL-149]: A test that the protocol and op-wire never read PAINT.texelsPerMeter
5. [BUGS-174]: DevTools displays comments in the HTML, CSS, and JavaScript, but the code should be minified
6. [BUGS-172]: Leaving a multiplayer session keeps painted map, but leaving the session should clean the paint and show the initial menu with city view; the solo paint comes back
7. RFCT [BL-145]: PaintSurface is a public struct written by GPU upload, the baker and painting; "has paint?" asked two ways (paint-surface.ts)
8. RFCT [BL-015]: Rework the drips: each setting does one thing; spraying over a coat no longer grows them; paint dries, per texel
9. BUGS [BL-107]: Moving the stepladder again and again near lamps doubles the CPU time (lamp light re-baked)
10. BUGS [BL-028]: Other players' spray costs ~0.2 ms of CPU a sprayer
11. RFCT [BL-112]: The remote player's timeline as a pure module with a Node test
