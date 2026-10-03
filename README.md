# taggin'

A small first-person graffiti game in the browser. You're on a rooftop at sunset with one spray can. There are no enemies and no objectives; you just paint.

Built with three.js, TypeScript and Vite. There are no external assets: the geometry, textures and sounds are all generated in code.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

Click the page to capture the mouse. Esc releases it.

## Controls

| Input | Action |
|---|---|
| Mouse | Look |
| WASD | Move |
| Shift | Run |
| Space | Jump (on a ladder: jump off) |
| W / S on a ladder | Climb up / down. W climbs down when you look down. |
| LMB (hold) | Spray toward the crosshair |
| Mouse wheel | Switch cap (THIN / FAT) |
| G | Shake the can (rattle, restores some pressure) |
| F3 or \` | Debug overlay (fps, paint texture count and memory, uploads, draw calls, particles) |

## How painting works

- Every paintable primitive (box or cylinder) gets one RGBA paint atlas holding all its faces. Each face is laid out at the same texel density, so paint looks the same on a big wall and on a small box.
- The atlas is created the first time paint hits that surface. Before that the material samples a shared 1×1 empty texture.
- Each particle raycasts when it is emitted. It flies from the nozzle to the hit point and stamps paint into the atlas when it arrives. Stamps are clipped to the face that was hit, so paint never bleeds onto another face.
- Each frame, only textures that changed are uploaded, and only the rows that changed (`texture.addUpdateRange`).
- Base looks (concrete, brick, metal, wood…) are small shared tiling textures. They are mapped in world space at the same density as the paint.
- The scene renders at reduced resolution and is upscaled with nearest filtering (`RENDER.pixelScale`).

When I painted every texel of every surface in Level 1 as a test, it came to 92 textures and about 3.3 MB of paint texture memory.

## Files

```
src/config.ts     all tunable constants
src/main.ts       renderer, game loop, view-model pass
src/input.ts      keyboard/mouse state, pointer lock
src/player.ts     FPS controller, AABB collisions, step-up, ladders
src/surfaces.ts   paintable box/cylinder geometry with per-surface atlas UVs
src/painting.ts   lazy paint textures, stamping, dirty-row uploads
src/materials.ts  surface shader (base + paint + light + fog), procedural base textures
src/spraycan.ts   pressure, caps, can view model, particles
src/audio.ts      Web Audio synthesis: hiss, rattle, clicks, footsteps, ambience
src/hud.ts        crosshair, cap/pressure HUD, start overlay, debug overlay
src/world.ts      level-building helpers (box, cylinder, decor, ladder, walls, sky)
src/level1.ts     the rooftop layout and skyline
scripts/smoke.mjs headless Playwright smoke test (screenshots into shots/)
```

## Tunable constants (`src/config.ts`)

**RENDER**
- `pixelScale` (2.5): internal resolution divisor. Higher values look chunkier and render faster.
- `fov` (75)
- `fogNear` / `fogFar` (40 / 260)

**PAINT**
- `texelsPerMeter` (16): texel density of all paint and base textures.
- `color` (RGB): the single spray color.
- `alphaSteps` (5): quantizes paint alpha for the chunky look. 0 turns it off for smooth gradients.
- `maxTextureSize` (2048): largest allowed atlas side.

**CAPS** (one entry per cap)
- `coneAngle`: spray cone half-angle in radians. THIN 0.035, FAT 0.12.
- `rate`: particles per second at full flow. THIN 260, FAT 520.
- `strength`: alpha added per particle. THIN 0.16, FAT 0.1.
- `stampRadius`: stamp radius in texels. THIN 0, FAT 1.
- `hissGain`: hiss loudness for this cap.

**SPRAY**
- `range` (3.5 m): how far paint reaches.
- `falloffStart` (1.5 m): paint fades out between this distance and `range`.
- `particleSpeed` (11 m/s)
- `particleSize` (0.035 m)
- `maxParticles` (3000)

**PRESSURE**
- `drainPerSecond` (0.04): full to empty in about 25 s of spraying.
- `thinThreshold` (0.5): below this, paint and hiss get weaker.
- `sputterThreshold` (0.25): below this, the can fires in random bursts.
- `minSteadyFlow` (0.4): flow at the sputter threshold.
- `sputterDuty` (0.45): fraction of time the can fires while sputtering.
- `shakeRestore` (0.3): pressure restored by one shake.
- `shakeDuration` (0.55 s)

**PLAYER**
- `eyeHeight` (1.62 m), `height` (1.78 m), `radius` (0.3 m)
- `walkSpeed` (4.2 m/s), `sprintSpeed` (6.5 m/s)
- `groundAccel` (14), `airAccel` (3)
- `jumpSpeed` (6.9): gives a jump of about 1.13 m.
- `gravity` (21)
- `stepHeight` (0.42 m)
- `climbSpeed` (2.6 m/s)
- `mouseSensitivity` (0.0022)
- `killY` (-25): fall below this and you respawn.

**AUDIO**
- `masterGain`, `hissGain`, `ambienceGain`, `footstepGain`

Sky and light colors are in `SKY` in `src/materials.ts`.

## Level 1

The rooftop of a tall building is 24 × 18 m with parapets all around.

- **North-west:** a brick stairwell hut. A ladder on its east wall leads to the upper level on its roof, which has a machine box, a crate, an antenna and a satellite dish.
- **North:** a catwalk runs from the hut roof along a blank 12.5 × 4 m billboard with lamps.
- **East:** three AC units on a pad feed an overhead duct that crosses the roof. A tall exhaust column stands next to the ladder.
- **South-east:** a wooden water tank on a steel stand, plus a large condenser and crates you can climb to reach the tank.
- **South:** pipe runs along the parapet, a riser, and an overhead pipe.
- **South-west:** a brick chimney, two skylights and mushroom vents.
- **Around it:** a non-paintable skyline merged into a few draw calls.

## Smoke test

`npm run dev`, then `npm run smoke`. The script loads the page in headless Chromium, fakes pointer lock, runs the steps in the `STEPS` env var (JSON) and saves screenshots. It needs `npx playwright install chromium`. On a bare Linux/WSL machine Chromium may also need `libnss3`, `libnspr4` and `libasound2`.
