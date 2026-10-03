# taggin'

A small first-person graffiti game in the browser. You're on New York rooftops at sunset: find colors, caps, can upgrades and a marker, then paint whatever you like. There are no enemies and no objectives. The HUD looks like a body-cam recording overlay.

Built with three.js, TypeScript and Vite. There are no external assets: the geometry, textures and sounds are all generated in code. See `AGENTS.md` for the two ground rules (performance first, small files).

## Run

```sh
npm install
npm run dev        # http://localhost:5173  (loads public/levels/demo.json)
npm run build      # typecheck + production build into dist/
```

`?level=name` loads `public/levels/name.json`. Click the page to capture the mouse and go fullscreen. Esc pauses the game and shows the menu (Resume / Exit fullscreen). Press Esc again while paused to leave fullscreen.

## Controls

**Play**

| Input | Action |
|---|---|
| WASD, Shift, Space | Move, run, jump |
| Move into a ladder | Climb. Let go to slide down, Ctrl to hold on, Space to jump off. Walking away from it walks off. |
| LMB | Spray with the can, or draw with the marker |
| 1 / 2 | Can / marker (once found) |
| Q / E | Cycle through the colors you've collected (can and marker) |
| Mouse wheel | Cycle through the caps you've collected (can only) |
| RMB | Shake the can (restores pressure) |
| B | Toggle build mode |
| F3 or \` | Debug and tuning panel (Esc frees the mouse for the sliders) |

**Build mode** (you fly with no collisions; the scene switches to plain daylight without rain). It works like Minecraft Creative: aim at a face and click.

| Input | Action |
|---|---|
| WASD, Space, C (Shift for fast) | Fly |
| LMB | Place the ghost. Hold it to keep placing wherever the ghost moves (pillars, bridges) |
| RMB | Delete what you aim at |
| MMB | Pick the prop or pickup you aim at (with its rotation) |
| Tab / Shift+Tab, 1-6 | Prop category |
| Mouse wheel | Prop within the category |
| R | Rotate 90° |
| PgUp / PgDn | Working level (the build plane) up / down |
| Ctrl+Z | Undo |
| [ / ] | Tilt the floodlight under the crosshair (saved per floodlight as `adjust` in the level) |
| T | Put the spawn point on the floor under the crosshair, facing where you look (the blue figure + arrow shows it while building) |
| H | Show paintable surfaces (green stripes; everything else dims) |
| P | Save the level as `level.json` (downloads) |
| O | Load a level JSON file |

**Placement:**
- Aim at a top face and the new prop goes on top. Aim at a side face and it goes next to that face, flush against it. Everything snaps to the grid (2 m cells, 4 m levels, 0.5 m for small props).
- The ghost is green when the prop fits and red when it would overlap something, can't go on that face, or would end up inside you.
- Building blocks stack: a block with another block below it is one 4 m storey, so pillars and towers go up level by level.

**Levels:** the map sits on top of a skyscraper, so heights are counted in levels, not meters. Level 0 is the main roof (y = 0). Each level is 4 m: level 1 is 4 m up, level -1 is 4 m down. The build HUD shows the level of the ghost (`AIM LEVEL 2`, or `LEVEL 1 +1.2 M` for things standing between floors) and the working level (`PLANE LEVEL n`). Aiming at empty space lands on the build plane, an invisible floor at the working level, so you can start building in mid-air. PgUp / PgDn move the plane, and it also follows the level of whatever you place last.

## Inventory

- **Slot 1: the spray can.** There is exactly one can, and its paint never runs out. Its pressure drains while you spray: below 50% the paint thins, below 25% the can sputters and the HUD shows a red alert. Shake with RMB to restore it.
- **Slot 2: the marker,** once you find it. It draws a thin, solid line at close range in the current color. Its band shows the color, and switching colors (or tools) shows the same COLOR tag next to whichever tool is in hand.
- **Colors** are pickups. Once collected, a color stays available for both the can and the marker. You start with black.
- **Can size** (sm → md → lg) is a permanent upgrade, not an item. Bigger cans lose pressure more slowly. You start with sm.
- **Caps** are skinny, standard, fat and spray (a wide, soft mist for fades). You start with the standard cap. The crosshair circle grows with the cap, and the cap's name shows next to the can for a moment after switching.
- **Pickups** hover, spin and glow so you can spot them from far away. Walk into one to collect it. If it gives you nothing new, it stays on the map.

## Prop kit

**Props:** wall lamp, floodlight, lamp post, string lights, neon blade signs (pink / cyan; two-sided, glyphs vary per sign), building, slab, parapet, stairwell hut, stairs, ladder, platform, fire escape, water tower, vent shaft, duct, AC unit (small / medium / large / wall-mounted), utility box, exhaust pipe, pipe run, antenna, cable, chain-link fence, fence gate, billboard (face and lamps outward; ladder at the back, walkway around to the front catwalk), CCTV camera (the head pans slowly; when you come near it turns to follow you and its lens and a small spot light switch on, `CCTV` and `LIGHTS.cctv`; swinging pieces turn in the vertex shader, so they stay in the level batches, and the light is aimed on the CPU with the same math).

Each prop is a builder function that returns a list of **pieces** (box, cylinder, rod, cone, climb volume) for a given size (`src/kit/`). The same pieces produce everything else (`src/level/build-prop.ts`):

- **Visuals:** every piece is a full box or a capped cylinder. There are no single-sided planes.
- **Colliders:** taken directly from the pieces. Rotations are multiples of 90°, so every box stays axis-aligned and its collider matches it exactly. Sloped handrails collide as a chain of small boxes.
- **Ladders:** their climb volumes come from the ladder pieces.
- **Paint:** a piece is paintable if it has a flat face at least 0.5 m on each side and 1.2 m² in area. Everything else is decor and is merged into one mesh per prop and material.
- **Railings:** stairs, platforms, fire escapes and the billboard catwalk always build their own.

**Placement conventions:**
- A prop's origin is at its bottom, centered, with its front facing −z.
- Edge and wall props (parapet, fence, gate, ladder, fire escape, utility box) have their back on the placement line, so you put them on a roof edge or a wall face.

## Level JSON

```json
{
  "version": 2,
  "spawn": { "pos": [0, 0, 5], "yaw": 0 },
  "props": [{ "type": "building", "pos": [-7, 0, -5], "rot": 0 }, { "type": "slab", "pos": [-7, 4, -5] }],
  "pickups": [{ "kind": "color:red", "pos": [-3, 0, 6] }, { "kind": "cap:fat", "pos": [16, 8, -3] }, { "kind": "marker", "pos": [-8, 3, -5] }]
}
```

- `pos` is in meters relative to level 0, so `y` = level × 4 (8 is level 2, -4 is level -1). Props between floors keep their exact height.
- `rot` is the number of quarter turns.
- Pickup kinds:
  - `color:<white|red>` unlocks a paint color
  - `can:<md|lg>` upgrades the can
  - `cap:<skinny|standard|fat|spray>` unlocks a cap
  - `marker`
- The skyline is regenerated around the level's bounds every time a level loads.

## How painting works

- Every paintable piece gets one RGBA atlas holding all its faces, at `PAINT.texelsPerMeter` (24).
- The atlas is created the first time paint hits that piece.
- **Spray:**
  - Each particle raycasts once when it's emitted.
  - It stamps paint into the atlas when it arrives.
  - Particles are visual only and come from a fixed-size pool.
- **Marker:** stamps directly under the crosshair, filling the gaps between frames.
- **Paint runs:** spraying on and on onto paint that's already opaque builds up excess. On vertical faces, a few texels at the limit start a thin run down the face that slows down and ends in a drop. Runs are written into the paint texture like any stamp (`DRIPS` in config; F3 → Painting).
- **Overpainting:** a surface has a single paint layer, and new paint is composited *over* it. The color always moves toward the new paint by that paint's own amount, so the last color painted always wins. Each 8-bit channel moves by at least one step per coat, so repeated coats reach the exact new color instead of stalling a little short of it.
- **Uploads:** each frame, only textures that changed are uploaded, and only their dirty rows.
- **Moving a prop in build mode keeps its paint.** Rotating or resizing it clears its paint.
- **Demo level fully painted:** 39 textures, 9.1 MB.

## Rendering and lights

- **Frame:** the scene renders into a linear HDR target at the internal (pixelated) resolution. Volumetric light runs next, then the hands and tool are drawn. A final pass adds the volumetric light, applies color grading and converts to sRGB.
- **Light props** carry an emitter at its default spot on the lens. Per light kind, `LIGHTS` holds the color, source offset, aim, strength, spread, range, edge softness, glow, beam and shadows. All of it is live-tunable in F3 → Lights; lens colors and floodlight heads rebuild to match. The nearest 8 become real spot lights; the first 2 slots cast shadows and only go to floodlights and billboard lamps. Glow sprites only show from the side the lens faces.
- **Weather and ambience:** rain has a soft sound bed that follows rain density. While it rains, lightning strikes at random (45–150 s apart) and lights the sky, ambient, moon and volumetric fog in quick pulses, with thunder after a distance-based delay. Now and then a police or fire siren passes somewhere far off (wail and yelp, or the fire truck's Q siren; muffled, echoing, drifting across the stereo field; `SIRENS`, `AUDIO.sirenGain`). Rain color and opacity are `ATMOS.rainColor` / `rainOpacity`. F3 → Sound has every gain; F3 → Lightning, smoke, fans, flicker has the rest, plus STRIKE NOW and SIREN NOW buttons.
- **Rain on metal:** raindrops ping on the tops of nearby metal pieces (rails, AC units, vents, ducts, the fire escape…) open to the sky, panned toward where they land. Metal under a roof stays quiet (`AUDIO.metal*`).
- **Smoke:** vent shafts, exhausts and AC units release smoke or warm air: one GPU-animated particle batch for the whole level (`SMOKE`).
- **AC fans** spin in the vertex shader (like the CCTV heads, so they stay batched), and hum when you're near one (`FANS`, `AUDIO.fanGain`/`fanRange`).
- **Flicker:** neon tubes and their lights dip together now and then (one hash shared by CPU and shader) (`FLICKER`).
- **Player glow:** a faint shadowless point light just above the head, so dark corners stay walkable (`PLAYER_LIGHT`). Off in build mode.
- **Light range is free on the GPU:** three.js shades every pool slot on every lit pixel regardless of range. Cost comes from the pool size and the shadow slots.
- **Volumetric light:** a low-res raymarch through the fog. It uses the moon shadow map for light shafts, plus the real spot lights (the two shadow slots get shafts too). Off / low / medium / high in the pause menu.
- **Settings** (pause menu, saved in this browser): resolution (pixel scale) and volumetric quality. Both apply immediately.
- **GPU cost:** F3 → Performance shows GPU time for the scene, volumetrics and hands + post passes. This needs `EXT_disjoint_timer_query_webgl2` (desktop Chromium); otherwise it shows n/a.

## Tunable constants (`src/config.ts`)

- `RENDER`: `pixelScale`, `fov`, `sprintFovBoost` and `sprintFovEase`.
- `PAINT`: `texelsPerMeter`, `alphaSteps`, `maxTextureSize`.
- `CAPS`: one entry per cap.
  - `coneAngle` (cone spread)
  - `rate` (particles per second)
  - `strength` (alpha per particle)
  - `stampRadius`
  - `hissGain` and `hissTone`
  - `crosshair` (circle diameter in px) and `color` (cap color on the can and pickup)
- `COLORS` and `COLOR_ORDER`: the paint palette and its Q/E order. Add a color here and it becomes a `color:<name>` pickup.
- `CAN_SIZES`: `drain` (pressure-loss multiplier) and view-model `scale` per size.
- `SPRAY`: `range`, `falloffStart`, particle speed, size and pool size.
- `PRESSURE`: drain rate, the thin and sputter thresholds, sputter duty, shake restore and shake duration.
- `MARKER`: `reach`, `radius`, `strength`, and `holdDistance` / `holdScale` for the first-person pose.
- `VIEWMODEL`: hand sway, walk bob, jump lag and the trigger-press animation.
- `ATMOS`: the rainy night, including `lightDecay` (light falloff, 2 = physical). `DAYLIGHT` overrides some of its keys while build mode is on.
- `BUILD`: build mode reach and the hold-to-place repeat timing.
- `WALL_HAND`: when the free left hand reaches for a wall and lets go: reach / release from the shoulder, the arc to your left it searches (`fromAngle`..`toAngle`), and its height below the eyes.
- `SIRENS`, `CCTV`: far-siren timing; CCTV follow ranges and how far a head can turn.
- `DRIPS`, `PLAYER_LIGHT`: see above.
- `LIGHTS`: per light kind: `color`, `offset`, `dir`, `intensity`, `range`, `spread`, `softness`, `glow`, `beam`, `shadows`.
- `VOLUMETRICS`: `enabled`, `downscale`, `steps`, `maxDistance`, `density`, `moon`, `lights`, `anisotropy`.
- `GRADE`: `exposure`, `contrast`, `saturation`, `temperature`, `tint`.
- `SKYLINE`: background city windows: `windowScale` (size), `lit`, `randomness` (whole floors vs single windows), `brightnessVariation`, `seed`. All live in F3 → Rendering → Skyline.
- `PICKUP`: `radius`, `hover`, `spin`, `bob`.
- `PLAYER`:
  - `walkSpeed`, `sprintSpeed`
  - `acceleration`, `friction`, `airControl`
  - `jumpHeight`, `gravity`
  - `stepHeight`, `climbSpeed`, `ladderJumpOff`
  - `eyeHeight`, `height`, `radius`
  - `mouseSensitivity`, `killY`
- `AUDIO`: gains.

The F3 panel groups its controls into small collapsible sections (collapse / expand all; open sections are remembered), and every setting has a tooltip. It has a live control for every tunable value above that applies without a restart, including colors and `[x, y, z]` values. Not included: `PAINT.texelsPerMeter`/`maxTextureSize`, `SPRAY` pool and particle size, and `AUDIO`, which are only read at startup. **copy values** puts them on the clipboard as JSON, ready to paste back in as new defaults.

## Files

```
src/main.ts              wiring + game loop
src/config.ts            all tunable constants
src/kit/                 prop kit: pieces + helpers (railings, ladders), prop builders, registry
src/level/               build-prop (pieces → meshes/colliders), level (instances, JSON)
src/build/               build mode, its HUD panel, level file I/O
src/inventory/           pickup kinds, inventory (can, marker, unlocks), tool readout HUD
src/pickups/             pickup manager + visuals
src/spray/               spray tool, can + hand view model, particles
src/tools/               marker, tool routing (hotbar → tool), hand sway/bob
src/debug/               debug + tuning panel, tunable list, GPU pass timer
src/render/              lighting pool, light FX, rain, atmosphere presets, post pipeline, volumetrics
src/painting.ts          lazy paint textures, stamping, dirty-row uploads
src/surfaces.ts          box / cylinder geometry with per-surface atlas UVs
src/materials.ts         surface shader, procedural base textures
src/player.ts            FPS controller, collisions (with broadphase), ladders, fly mode
src/sky.ts, skyline.ts   sky dome, background city
src/hud.ts               body-cam frame: vignette, REC/clock, crosshair, cap tag, start/pause menu
src/style.css            all UI styling (white + red alert, thin lines, monospace)
src/settings.ts          pause-menu settings (resolution, volumetrics), saved in localStorage
src/audio.ts, input.ts, fullscreen.ts
public/levels/demo.json  demo rooftop using every prop and pickup, plus an empty level-0 roof to the north for building
scripts/smoke.mjs        headless Playwright smoke test
```
