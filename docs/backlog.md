# Later

Found in the release review of 2026-10-10 (`dev` after 1.1.0) and left for later. Each: what, what showed it, where, what to do, effort (XS: minutes, S: hours, M: half a day, L: more).

## Mouse spikes snap the camera (Chrome on Windows)

- **Seen:** a profile on Windows 11, Chrome 154: during a fast flick, one `mousemove` of 458 px among events of at most 123 px (one frame with none, then three at once); the camera jumped 60°. The frame took 16.7 ms: a bad input value, not a stall. Once in 42 minutes, 14 s after the lock was taken. `src/input.ts` adds every `movementX/Y` as it comes; unchanged since 1.0.
- **Known:** a Chromium bug on Windows since at least 2017 (Chrome 62, jumps of 300–400 px, crbug 781182: [three.js #12757](https://github.com/mrdoob/three.js/issues/12757)), still reported in 2023 and 2025 (100–300 px in the direction of the move, Chrome, Edge and Opera on Windows, mostly with 1000 Hz mice, rare at 125 Hz: [three.js #27040](https://github.com/mrdoob/three.js/issues/27040), [t2-mapper #7](https://github.com/exogen/t2-mapper/issues/7)); closed as a device issue no engine can fix. A second kind: one huge value right after the lock is taken ([world PR #31](https://github.com/kathirmeyyappan/world/pull/31) drops motion for 150 ms after a lock change and events over 400 px). `requestPointerLock({ unadjustedMovement: true })` (raw input, Chromium on Windows, macOS and ChromeOS; `NotSupportedError` elsewhere: [web.dev](https://web.dev/articles/disable-mouse-acceleration), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)) turns off OS acceleration; no source says it ends the spikes, and it changes the feel for players used to acceleration.
- **Do:** in `input.ts`, drop one event over `300 px` (config) that is also over 3× the largest of the last ~8, and motion in the 100 ms after the lock is taken; count what's dropped in the profiler's report. A fixed cap alone would drop real flicks of 125 Hz mice at high DPI (those build up over several events, so the relative rule keeps them). Test with synthetic `MouseEvent`s: a flick passes, a lone 458 px among 60–120 px is dropped, a ramp of 250–350 px passes. Maybe later a RAW MOUSE setting (`unadjustedMovement`, off by default, with the fallback). **S.**

## Playtest what no test covers

- Walking along railings and landings (the corner slip, `PLAYER.cornerSlip`), the lattice mast (can't be climbed), the clear windows (see through, paint from both sides, stepladder against one from behind), pickups (ring shapes, glow, tags within 4 m, hidden behind walls), and a session from two devices on one network (paint, presence, reload, the network log). **M**, by hand.

## Many players: other players' spray

- **Measured** (A2000 laptop, 1280×720, fake players sending no paint ops): 19 others walking 124 fps, all 19 spraying 84 fps; their particles cost ~0.2 ms of CPU a frame per sprayer (a ray each a frame, `spray/particles.ts` `show`, a pool of 3000). Their paint ops (stamps, uploads) come on top, unmeasured.
- **Do:** particles only for the nearest few sprayers, or reuse each sprayer's ray for a few frames; or a lower `SERVER.maxPlayers`. Measure a real session of 8 to 20 first. **M** (or XS for the cap).

## The hint wall takes two paint pages

- The spawn's hint wall spans two level tiles (`p89`, `p90` and a joint), so every game starts with two 2048² paint pages: +42.5 MB of GPU memory before anything is painted.
- **Do:** move the hint (or the wall) into one tile and save the level and its paint again (build mode P). **S.**

## Paint pages at ULTRA

- After 40 minutes of painting at ULTRA a profile counted 45 more GPU textures; if paint pages (2048², ~21 MB each with mips), ~0.95 GB of GPU memory. Already so in 1.1.0.
- **Do:** check the HUD's `tex memory` after heavy painting at ULTRA; if that's what it is, smaller or fewer pages for sparse paint, or a cap with a warning. **L.**

## Player movement has no test

- Walking, collisions (and the corner slip), jumps, climbing, ladders: no fixed-step check (also in `docs/testing.md`, Open). **M.**

## Also

- BUY ME A COFFEE: hidden until it has a link (`git revert` the commit that hid it, then set the link).
- The F3 probe turns moon shadows and wet highlights off: each compiles new shaders (7 a time; ~1.6 s on Windows D3D11), which lands in its own measurement. Players have neither setting.
