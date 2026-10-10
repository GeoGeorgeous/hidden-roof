# Backlog

The one place for what's left to do: bugs, things to check, performance, tests, ideas. Notes for later go here, not into other docs. When an item is done, delete it (the commit says so; git keeps the history). Each item: what, what showed it, where, what to do, effort (XS: minutes, S: hours, M: half a day, L: more).

## Bugs

### Mouse spikes snap the camera (Chrome on Windows)

- **Seen:** a profile on Windows 11, Chrome 154 (2026-10-10): during a fast flick, one `mousemove` of 458 px among events of at most 123 px (one frame with none, then three at once); the camera jumped 60°. The frame took 16.7 ms: a bad input value, not a stall. Once in 42 minutes, 14 s after the lock was taken. `src/input.ts` adds every `movementX/Y` as it comes; unchanged since 1.0.
- **Known:** a Chromium bug on Windows since at least 2017 (Chrome 62, jumps of 300–400 px, crbug 781182: [three.js #12757](https://github.com/mrdoob/three.js/issues/12757)), still reported in 2023 and 2025 (100–300 px in the direction of the move, Chrome, Edge and Opera on Windows, mostly with 1000 Hz mice, rare at 125 Hz: [three.js #27040](https://github.com/mrdoob/three.js/issues/27040), [t2-mapper #7](https://github.com/exogen/t2-mapper/issues/7)); closed as a device issue no engine can fix. A second kind: one huge value right after the lock is taken ([world PR #31](https://github.com/kathirmeyyappan/world/pull/31) drops motion for 150 ms after a lock change and events over 400 px). `requestPointerLock({ unadjustedMovement: true })` (raw input, Chromium on Windows, macOS and ChromeOS; `NotSupportedError` elsewhere: [web.dev](https://web.dev/articles/disable-mouse-acceleration), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)) turns off OS acceleration; no source says it ends the spikes, and it changes the feel for players used to acceleration.
- **Do:** in `input.ts`, drop one event over 300 px (config) that is also over 3× the largest of the last ~8, and motion in the 100 ms after the lock is taken; count what's dropped in the profiler's report. A fixed cap alone would drop real flicks of 125 Hz mice at high DPI (those build up over several events, so the relative rule keeps them). Test with synthetic `MouseEvent`s: a flick passes, a lone 458 px among 60–120 px is dropped, a ramp of 250–350 px passes. Maybe later a RAW MOUSE setting (`unadjustedMovement`, off by default, with the fallback). **S.**

## Check by hand

- **Before a release:** walking along railings and landings (the corner slip, `PLAYER.cornerSlip`), the lattice mast (can't be climbed), the clear windows (see through, paint from both sides, a stepladder against one from behind), pickups (ring shapes, glow, tags within 4 m, hidden behind walls), and a session from two devices on one network (paint, presence, reload, the network log). **M.**
- **A remote player's correction glides** at up to ~3× walking speed on a bad link (16 m/s at 60 fps, over 0.1–0.2 s); the ghost test allows it (it checks for jumps: 30–65 m/s unsmoothed). A speed cap changes how other players look: judge it in F3 → Test → Ghost (net: hiccups 0.2, record a walk that stops, PLAY), then decide. **S.**

## Performance

- **Other players' spray with many players.** Measured (A2000 laptop, 1280×720, fake players sending no paint ops): 19 others walking 124 fps, all 19 spraying 84 fps; their particles cost ~0.2 ms of CPU a frame per sprayer (a ray each a frame, `spray/particles.ts` `show`, a pool of 3000). Their paint ops come on top, unmeasured. Do: particles only for the nearest few sprayers, or reuse each sprayer's ray for a few frames; or a lower `SERVER.maxPlayers`. Measure a real session of 8 to 20 first. **M** (XS for the cap).
- **The roof level's edits of 2026-10-10** (48 props: lamps, signs, ducts, 4 clear windows) cost about 4–15% of the frame rate and 7–31 draw calls at five fixed views, the most facing the edited building (x 10–16). Measured with the machine under load: measure again on a quiet one. **S.**
- **The hint wall takes two paint pages.** It spans two level tiles (`p89`, `p90` and a joint), so every game starts with two 2048² paint pages: +42.5 MB of GPU memory before anything is painted. Do: move the hint (or the wall) into one tile and save the level and its paint again (build mode P). **S.**
- **Paint pages at ULTRA.** After 40 minutes of painting at ULTRA a profile counted 45 more GPU textures; if paint pages (2048², ~21 MB each with mips), ~0.95 GB of GPU memory. Already so in 1.1.0. Do: check the HUD's `tex memory` after heavy painting at ULTRA; if that's what it is, smaller or fewer pages for sparse paint, or a cap with a warning. **L.**

## Tests

- **Player movement has no test:** walking, collisions (and the corner slip), jumps, climbing, ladders. A fixed-step check per move. **M.**
- **Light baking and weather run on the wall clock** (`baker.ts` budget, rain): screenshots aren't byte-comparable. Compare pictures only after the bake finishes, rain off. **S.**
- **Timeouts in `npm run check`** (2026-10-10, another agent testing on the machine too): the server test's wait for a HOST's welcome (2 s, `Game.next` in `server/server-test.ts`) ran out in 2 of ~10 full checks, on branches whose server code is `dev`'s; 0 of 22 runs of the server test alone or right after the game test. The multiplayer test's first page didn't build its level within 120 s once. Do: give the server test's waits more room (the server is fast; the machine isn't always), and see whether the 120 s one repeats. **S.**

## Known, by design

- **Paint order where strokes overlap** differs per client: each applies its own ops at once and others' when their figure gets there, and blending isn't commutative. Measured: 97 of 290 overlapping texels differed; a player who joins later sees the server's order. Everyone matches again after a reload or rejoin (`docs/multiplayer-audit.md`, 2.2).
- **Snapshot time is float32 seconds:** 2 ms steps after 8 hours of a session.
- **TCP head-of-line blocking:** one lost packet holds the ones behind it; smoothing and the adaptive delay hide it. WebTransport datagrams (Chromium) would remove it, if it ever shows.

## Ideas

- **Deploy from GitHub Actions:** push to `main` → Actions builds → deploy over SSH with the repo's own deploy key (`docs/deploy.md`, section 5).
- **The avatar for NPCs** (moving around, talking, helping), first-person hands from the avatar's hand, and the hood up or down outside F3 (`docs/avatar.md`).
- **BUY ME A COFFEE:** hidden until it has a link (`git revert` the commit that hid it, then set the link).
- **The F3 probe** turns moon shadows and wet highlights off: each compiles new shaders (7 a time; ~1.6 s on Windows D3D11), which lands in its own measurement. Players have neither setting; compile both variants before measuring if it matters.
