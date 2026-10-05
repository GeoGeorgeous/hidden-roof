# roof.hidden.haus

A small first-person graffiti game in the browser. You're on the rooftops of a pen-and-ink megacity, high above streets lost in black: find colors, caps, a marker, a stepladder, a paint roller and a sponge, then paint whatever you like (and scrub it off again). The world is drawn in ink on paper; the only color anywhere is your paint. There are no enemies and no objectives. The HUD looks like a body-cam recording overlay.

Built with three.js, TypeScript and Vite. There are no external assets: the geometry, textures and sounds are all generated in code. See `AGENTS.md` for the two ground rules (performance first, small files).

## Run

```sh
npm install
npm run dev        # http://localhost:5173  (loads public/levels/demo.json)
npm run build      # typecheck + production build into dist/
```

`?level=name` loads `public/levels/name.json`. Click the page to capture the mouse and go fullscreen. Esc pauses the game and shows the menu (Resume / Save paint / Load paint / Settings / Exit fullscreen) on a dark sheet. **Save paint** downloads the paint of the level as a `.rhhpaint` file (paint only, at your paint detail); **Load paint** (also on the title screen) replaces the paint with a saved one, at any paint detail. Paint goes back on every prop that's still there with the same faces: paint on props removed or changed since (in build mode, or by a game update) is skipped, and a save none of whose paint fits (another level) is refused. **Settings** has three tabs, each setting with a short description and, where it matters, the performance cost of its current value in dots (1 none, 2 minimal, 3 medium, 4 high, 5 critical; green, orange, red): Gameplay (field of view, extra FOV while running, crouch hold or toggle), Graphics (resolution, volumetrics, paint detail, city detail, fullscreen on or off, rain, smoke, moving prop parts) and Sound (a volume per sound, 0–200% of its default). Settings write the same config values the debug panel edits. Resolution, volumetrics, paint and city detail are remembered in the browser; the rest reset on reload. Press Esc again while paused to leave fullscreen.

## Controls

**Play**

| Input | Action |
|---|---|
| WASD, Shift, Space | Move, run, jump |
| Move into a ladder | Climb. Let go to slide down, Ctrl to hold on, Space to jump off. Walking away from it walks off. |
| LMB | Spray with the can, draw with the marker, place the stepladder, roll with the roller, or scrub paint off with the sponge |
| 1 – 5 | Can / marker / stepladder / paint roller / sponge (once found) |
| Q / E | Cycle through the colors you've collected (can, marker, roller) |
| Mouse wheel | Can: cycle through your caps. Marker: nib size. Sponge: cleaning patch size (the crosshair follows both). Stepladder: turn it. |
| RMB | Shake the can (restores pressure) |
| B | Toggle build mode |
| K | Screenshot: the game view (without the HUD) downloads as a PNG |
| F3 or \` | Debug and tuning panel (Esc frees the mouse for the sliders) |

**Build mode** (you fly with no collisions; the scene switches to plain daylight without rain). It works like Minecraft Creative: aim at a face and click.

| Input | Action |
|---|---|
| WASD, Space, C (Shift for fast) | Fly |
| LMB | Place the ghost. Hold it to keep placing wherever the ghost moves (pillars, bridges) |
| RMB | Delete what you aim at |
| MMB | Pick the prop or pickup you aim at (with its rotation) |
| Tab / Shift+Tab, 1-7 | Prop category |
| Mouse wheel | Prop within the category |
| R | Rotate 90° |
| PgUp / PgDn | Working level (the build plane) up / down |
| Ctrl+Z | Undo |
| [ / ] | Tilt the floodlight under the crosshair (saved per floodlight as `adjust` in the level) |
| Enter | Type the text of the sign under the crosshair (exit, high voltage, name plate; saved per sign as `text` in the level). Aiming elsewhere, it sets the text for the next signs you place. New signs reuse the last text typed or picked with MMB |
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

The hotbar at the bottom center is a row of small circles (`HOTBAR.slots`, 5), there from the start: one per slot key, so every tool always sits under its own number. A slot whose tool you haven't found is an empty circle; once found, it shows the item's pickup model as an icon (rendered once into a small image by the game's renderer and cached; the can's icon shows the current paint color). The selected slot has a solid ring. Color, cap and pressure show next to the tool in hand. How each tool is held is tunable live in F3 → Camera (`HOLD`), even while the panel pauses the game.

- **Slot 1: the spray can.** There is exactly one can, and its paint never runs out. Its pressure drains while you spray: below 50% the paint thins, below 25% the can sputters. The PSI gauge shows by the can while you spray or shake (it fades in and out with the pressure changing); when low it stays up in red, with a blinking LOW PRESSURE — SHAKE [RMB] above it. Shake with RMB to restore it.
- **Slot 2: the marker,** once you find it. It's a pump marker with a hard square nib: it draws a solid, hard-edged line at close range in the current color, as wide as the nib going straight and wider on the diagonal. The mouse wheel changes the nib size (`MARKER.radiusMin` .. `radiusMax` in `radiusStep`s), and the crosshair grows with it. Its band shows the color, and switching colors (or tools) shows the same COLOR tag next to whichever tool is in hand.
- **Slot 3: the stepladder,** once you find it. A small A-frame ladder (1.2 m, like its pickup) that stands on its own: climb it from the front (like any ladder) and stand on its top to reach higher walls. In hand you hold it folded, like the can and the marker. A green preview shows where it would stand: anywhere on the floor (not on the grid), turned to face you, and the mouse wheel turns it a quarter turn at a time; aiming at a wall puts it on the floor in front of it. It's red where it can't stand: its four feet must rest on one flat floor (not over an edge, a gap or a step), nothing may be in its way or in you, and there must be room to stand in front of it and climb. LMB places it. There is only one: placing it again moves it. It isn't saved with the level, and build mode leaves it alone (`STEPLADDER_PLACE` in config).
- **Slot 4: the paint roller,** once you find it. A wide graffiti roller on a short pole: held to a surface within reach, LMB rolls a solid band of paint as wide as the roller (44 cm), along the roller (the view's right, laid into the surface), with lighter ends. Moving the view rolls it; presses are filled in between frames, so a stroke is one continuous band. Rolling up and down makes the wide stroke; rolling sideways only drags it along its own length, like a real roller. It uses the same paint textures as the can and marker (`PaintSystem.roll`), carries across seams, and starts paint runs easily. The cover shows the current color and spins as it rolls (`ROLLER` in config, F3 → Painting).
- **Slot 5: the sponge,** once you find it. A kitchen sponge, a soft block with a dark scouring pad on the front, held like the can (same pose, same arm). Held to a surface within arm's reach, LMB scrubs paint off a round patch under the crosshair. Each pass takes a share of the paint left (`SPONGE.strength`), so one pass fades it and scrubbing back and forth cleans it; it works on any paint (can, marker, roller, runs). The mouse wheel changes the patch size (`SPONGE.radiusMin` .. `radiusMax` in `radiusStep`s), and the crosshair grows with it. It uses the paint system's own stamp with no color (`PaintSystem.stamp(..., null)`), skips surfaces that were never painted, and costs no more than spraying. In hand it presses to the wall and scrubs in small circles. Everything about it is in `SPONGE` (F3 → Painting): reach, patch size and wheel range, strength, the model (size, scouring pad, pores, tones) and the pickup's size, offset and rotation; changes rebuild the held model, the pickups and the hotbar icon live.
- **Colors** are pickups: black, white, red, orange, yellow, green, blue, purple and pink. Once collected, a color stays available for the can, the marker and the roller. You start with black.
- **Caps** are skinny, standard, fat and spray (a wide, soft mist for fades). You start with the standard cap. The crosshair circle grows with the cap, and the cap's name shows next to the can for a moment after switching.
- **Pickups** hover, spin and glow so you can spot them from far away. Walk into one to collect it. If it gives you nothing new, it stays on the map.

## Prop kit

**Props:** wall lamp, floodlight, lamp post, string lights, neon blade signs (pink / cyan / amber; two-sided, each with its own slogan in Japanese), the signs category (wall sign, shop sign, blade sign, small exit / high voltage / no entry / name plate signs whose text you type in build mode (real type, `render/ink/words.ts`), sign tower: a lattice frame carrying a panel, and the billboard below), lattice mast, tanks on a stand, roof debris, building, half block (2 m high, stacks by 2 m), slab, parapet, door (closed or standing open outward, for insides), floor hatch, stairwell hut, stairs, ladder, platform, fire escape, water tower, vent shaft, duct, AC unit (small / medium / large / wall-mounted), utility box, exhaust pipe, modular pipes (straight run, corner, from the floor, from a wall, up into the roof; every piece ends its pipe 1 m from its origin at the same height, so they chain on the 0.5 m grid), drain pipe (stacks storey by storey), antenna, cable, modular floor and wall cables (straight, corner, floor to wall, wall storey; chained like the pipes), chain-link fence, fence gate, billboard (face and lamps outward; ladder at the back, walkway around to the front catwalk), CCTV camera (the head pans slowly; when you come near it turns to follow you and its lens and a small spot light switch on, `CCTV` and `LIGHTS.cctv`; swinging pieces turn in the vertex shader, so they stay in the level batches, and the light is aimed on the CPU with the same math).

Each prop is a builder function that returns a list of **pieces** (box, cylinder, rod, cone, climb volume) for a given size (`src/kit/`). The same pieces produce everything else (`src/level/build-prop.ts`):

- **Visuals:** every piece is a full box or a capped cylinder. There are no single-sided planes.
- **Colliders:** taken directly from the pieces. Rotations are multiples of 90°, so every box stays axis-aligned and its collider matches it exactly. Sloped handrails collide as a chain of small boxes.
- **Ladders:** their climb volumes come from the ladder pieces.
- **Paint:** a piece is paintable if it has a flat face at least 0.5 m on each side and 1.2 m² in area. Everything else is decor and is merged into one mesh per prop and material. For drawing, decor is merged again per 32 m tile of the level (`RENDER.batchTile`), together with a shadow-only copy of the tile's paint meshes, so draw calls grow with the level's area, an edit re-merges only the tiles it touched, and tiles out of view (or outside the moon's shadow box) are skipped. Opaque surfaces are drawn front to back, grouped by base texture.
- **Railings:** stairs, platforms, fire escapes and the billboard catwalk always build their own.
- **Lettering and facades:** a material can carry sign lettering (`Mat.letters`, a rect of a text atlas: real slogans in the bundled Japanese font, `render/ink/slogans.ts`, drawn by `panel-text.ts`, `neon-text.ts`, `city-text.ts` and `words.ts`; every sign instance picks its own from its seed; drawn straight from the atlas, not lit, so it reads in shadow and at night) or facade bands (`Mat.facade`, `FACADES` presets: ribbon windows, fins, punched windows, slats; the tall facade under a building block uses them). Lettered panels stay paintable: paint covers the lettering.

**Placement conventions:**
- A prop's origin is at its bottom, centered, with its front facing −z.
- Edge and wall props (parapet, fence, gate, ladder, fire escape, utility box) have their back on the placement line, so you put them on a roof edge or a wall face.

## Level JSON

```json
{
  "version": 3,
  "spawn": { "pos": [0, 0, 5], "yaw": 0 },
  "props": [{ "id": 1, "type": "building", "pos": [-7, 0, -5], "rot": 0 }, { "id": 2, "type": "slab", "pos": [-7, 4, -5] }],
  "pickups": [{ "kind": "color:red", "pos": [-3, 0, 6] }, { "kind": "cap:fat", "pos": [16, 8, -3] }, { "kind": "marker", "pos": [-8, 3, -5] }]
}
```

- `pos` is in meters relative to level 0, so `y` = level × 4 (8 is level 2, -4 is level -1). Props between floors keep their exact height.
- `id` is the prop's own number, kept through edits: paint saves find their surfaces by it. Build mode gives new props the next free one and writes them all when it saves. Without ids (version 2 files), props are numbered in file order.
- `rot` is the number of quarter turns.
- `text` (signs only, optional) is the sign's own text; without it the sign shows its default (EXIT, HIGH VOLTAGE, STAFF ONLY).
- Pickup kinds:
  - `color:<white|red|orange|yellow|green|blue|purple|pink>` unlocks a paint color
  - `cap:<skinny|standard|fat|spray>` unlocks a cap
  - `marker`
  - `ladder` (the stepladder)
  - `roller` (the paint roller)
  - `sponge`
- The city is regenerated around the level's bounds every time a level loads, always the same for the same settings. A level can override any `SKYLINE` value in its own object, e.g. `"skyline": { "seed": 12, "margin": 20 }`.

## How painting works

- Every paintable piece gets one RGBA atlas holding all its faces, at `PAINT.texelsPerMeter`. The **PAINT DETAIL** setting (pause menu) picks it: LOW 24 (4.2 cm texels, the old look), MEDIUM 48, HIGH 72 or ULTRA 96 (1 cm texels, the default). Base textures stay at 24 texels per meter (`BASE_TEXTURES`).
- The atlas is created the first time paint hits that piece.
- **Sizes are in meters** (`CAPS.*.stampRadius`, `MARKER.radius`), so every paint detail sprays alike: texels whose centers lie inside a dot get paint. A dot smaller than a texel paints the texel under it, so a marker radius of 0 draws the thinnest line the detail allows: 4 cm on LOW, 1 cm on ULTRA (the marker's default nib is 0.012 m, a 2.4 cm square).
- **Spray:**
  - Each particle raycasts once when it's emitted.
  - It stamps paint into the atlas when it arrives.
  - Particles are visual only and come from a fixed-size pool.
- **Across seams:** a dot is clipped to the face it hit, and the part past the face's edge goes onto the faces in the same plane next to it, on the same prop or another (wall pieces, joint posts, stacked blocks), so seams don't show in the paint (`paint-seams.ts`: flat faces indexed per plane in 2 m cells; only dots that cross an edge look anything up).
- **Marker:** stamps directly under the crosshair, filling the gaps between frames.
- **Paint runs:** spraying on and on onto paint that's already opaque builds up excess, and so does going over a marker line again or holding the marker still. On vertical faces, a few texels at the limit start a thin run down the face that slows down and ends in a drop. Runs are written into the paint texture like any stamp (`DRIPS` in config; F3 → Painting). How many start is set per square meter (`DRIPS.perSquareMeter`), so every paint detail runs alike.
- **Overpainting:** a surface has a single paint layer, and new paint is composited *over* it. The color always moves toward the new paint by that paint's own amount, so the last color painted always wins. Each 8-bit channel moves by at least one step per coat, so repeated coats reach the exact new color instead of stalling a little short of it.
- **Uploads:** each frame, only textures that changed are uploaded: the rect that changed, in one `texSubImage2D` (three's `copyTextureToTexture`), then the same rect of each smaller level.
- **Distant paint** (`PAINT.mipLevels`): each paint texture has smaller levels (1/2, 1/4, 1/8), so fine paint fades evenly instead of sparkling once a texel gets smaller than a pixel. They're averaged on the CPU straight from the atlas, only where paint changed, with colors weighted by alpha (the GPU's own mipmaps would darken paint edges with the black of unpainted texels). They add a third to the GPU memory of paint; the CPU keeps only the atlas.
- **Changing PAINT DETAIL** applies when you resume, since every prop is rebuilt: its paint is resampled into the new atlas (nearest texel when enlarging, averaged when shrinking), in about 0.2 s for the demo level. Going down blurs existing paint to the coarser texels, and going back up keeps it that way; new paint gets the full detail. Stepping through the choices in the menu costs nothing.
- **Moving a prop in build mode keeps its paint.** Rotating or resizing it clears its paint.
- **Paint memory** grows with the square of the detail, and only for surfaces that were hit. If every one of the demo's 407 paintable surfaces were painted: LOW 35 MB of GPU memory (26 MB on the CPU), MEDIUM 132 MB (99), HIGH 292 MB (220), ULTRA 515 MB (387). That's about 1.3 MB per painted surface on ULTRA, 0.1 MB on LOW.

## Rendering and lights

- **Ink look** (`src/render/ink/`, `INK`, F3 → Ink): the world is drawn in ink on paper; only paint keeps its color (no desaturation: nothing else has color to begin with).
  - Each pixel's tone (light reaching it x its material's gray) picks the ink: paper, hatching, cross-hatching (vertical strokes on walls) or solid black. Hatch lines are laid out in world space by the face's normal (no UVs), with their spacing picked in octaves so it stays about `hatchPx` pixels at any distance, and box-filtered by their screen footprint: no moire, no gray smear far away.
  - Distance and the low clouds lighten the tone (black → cross-hatching → hatching → paper), so ink never turns gray. Below `voidTop` the city sinks into black, and that never fades: the street is a black void far down.
  - Facade bands (black slots between pale strips) and grime (rain streaks, stains, buffed patches, wall cracks, panel and floor seams) are drawn in the shader from the world position, filtered the same way. Paint goes over all of it, lit softly and lightly hatched in the dark.
  - The final pass draws pen outlines from the depth buffer (second differences of 1/z: silhouettes on their near side, creases a little lighter), thinning with distance, with a slight wobble, then paper grain from a precomputed paper texture.
  - Glows, beams and rain are white or ink; pickups hover tilted in a drawn ring (solid, with a dashed one inside) (in color only for paint colors); the hands and can are inked (the label shows the paint color); the HUD is ink on paper.
- **City** (`src/city/`, `SKYLINE`, F3 → Rendering → City): a seeded street grid of blocks split into lots, one tower per lot with setbacks and facade bands. Near the level the roofs are mostly below you, with a few huge towers among them; farther out the city rises into a wall that fades into the paper. Roofs are packed (cores, tanks on lattice legs, AC rows, billboards on frames, masts with guy wires, cranes, railings, pipes down the facades), walls carry blade and shop signs and AC boxes, and wires are strung across the streets and high over the level.
  - Volumes are merged into 160 m chunks drawn with the city's own lean ink material (no paint, lamps or shadows), after the level, near chunks first.
  - Thin steel and wires are one-pixel GL lines in ink. Each line has a range and a feature size (a lattice's panel, a railing's height): it fades out beyond its range and when its feature gets a few pixels small, so far lattices keep their outline and lose their bracing instead of turning into a black mass. Line chunks past their range aren't drawn.
- **Frame:** the scene renders into a linear HDR target (with a float depth texture) at the internal (pixelated) resolution. Volumetric light runs next, then the hands and tool are drawn into the same target with their depth squashed into the front 1% of the range, so they're always in front yet get outlines too. The final pass adds the outlines, the volumetric light, paper grain and grading, and converts to sRGB.
- **Light props** carry an emitter at its default spot on the lens. Per light kind, `LIGHTS` holds the color, source offset, aim, strength, spread, range, edge softness, glow, beam and shadows. All of it is live-tunable in F3 → Lights; lens colors and floodlight heads rebuild to match. Glow sprites only show from the side the lens faces.
- **Baked lamp light** (`src/render/bake/`, `LIGHTMAP`): every steady lamp's light is baked, with shadows, so lamps light up at any distance and any number of them costs the same per frame.
  - Paintable surfaces get a light texture each (4 texels per meter by default, half float); decor gets the light in its vertices. The shader adds it exactly like the diffuse light of a real spot light, so the look matches the real lights it replaced. Paint stays in its own texture, so spraying never touches the bake.
  - Shadows come from the level's colliders (see-through pieces like chain-link excluded): every lamp kind with `shadows` casts them, and lamp light no longer passes through walls and roofs.
  - It rebakes on its own. A build edit rebakes what it relit: everything in range of a lamp that came or went, plus whatever lies in the shadow cone of a prop that came or went. Any light setting rebakes the whole level. Rebakes run a few ms per frame (`budgetMs`), nearest first, and the old light stays up until a surface is redone. A freshly loaded level (or a paint detail change) bakes at once.
  - What a bake can't do stays real-time: CCTV lights move, so they keep a pool of 2 real spot lights; the nearest 4 lamps add their wet highlights (specular only, wet surfaces only); neon light dips with its tubes through a flicker layer whose brightness the CPU updates each frame.
  - Demo level: about 2.4 MB of light textures; a full bake takes about 60 ms on a desktop CPU (170 ms the first time).
  - F3 → Lights → baked light: shadows on/off, texel density, smooth or hard texels, wet highlights, bake time per frame, and a switch back to the old way (the nearest lamps get real spot lights) for comparison.
- **Weather and ambience:** rain has a soft sound bed that follows rain density. While it rains, lightning strikes at random (45–150 s apart) and lights the sky, ambient, moon and volumetric fog in quick pulses, with thunder after a distance-based delay. Rain color and opacity are `ATMOS.rainColor` / `rainOpacity`. F3 → Sound has every gain; F3 → Lightning, smoke, fans, flicker has the rest, plus a STRIKE NOW button.
- **Rain on metal:** raindrops ping on the tops of nearby metal pieces (rails, AC units, vents, ducts, the fire escape…) open to the sky, panned toward where they land. Metal under a roof stays quiet (`AUDIO.metal*`).
- **Smoke:** exhaust pipes release smoke (on by default): one GPU-animated particle batch for the whole level (`SMOKE`).
- **AC fans** spin in the vertex shader (like the CCTV heads, so they stay batched), and hum when you're near one (`FANS`, `AUDIO.fanGain`/`fanRange`).
- **Flicker:** neon tubes and their lights dip together now and then (one hash shared by CPU and shader) (`FLICKER`).
- **Player glow:** a faint shadowless point light just above the head, so dark corners stay walkable (`PLAYER_LIGHT`). Off in build mode.
- **Lamp count and range are free on the GPU:** baked light is one texture read per pixel however many lamps there are; range only makes bakes longer. Real lights (the CCTV pool, or every near lamp with baking off) cost per pool slot: three.js shades every slot on every lit pixel regardless of range.
- **Volumetric light:** a low-res raymarch through the fog. It uses the moon shadow map for light shafts, plus the nearest 8 lamps, baked or not (real spot lights in the two shadow slots get shadowed shafts). Off / low / medium / high in the pause menu.
- **Settings** (pause menu, saved in this browser): resolution (pixel scale), volumetric quality, paint detail and city detail (LOW / MEDIUM / HIGH: the city's reach, rooftop clutter and how far thin lines show). Resolution and volumetrics apply immediately, paint and city detail when you resume (see How painting works).
- **GPU cost:** F3 → Performance shows GPU time for the scene, volumetrics and hands + post passes. This needs `EXT_disjoint_timer_query_webgl2` (desktop Chromium); otherwise it shows n/a.

## Tunable constants (`src/config.ts`)

- `RENDER`: `pixelScale`, `fov`, `sprintFovBoost` and `sprintFovEase`, and `batchTile` (decor batch tile size).
- `PAINT`: `texelsPerMeter` (the default paint detail; the pause-menu setting overrides it), `alphaSteps`, `maxTextureSize`, `mipLevels`.
- `BASE_TEXTURES`: `texelsPerMeter` of the base textures, whatever the paint detail.
- `CAPS`: one entry per cap.
  - `coneAngle` (cone spread)
  - `rate` (particles per second)
  - `strength` (alpha per particle)
  - `stampRadius` (dot radius in meters)
  - `hissGain` and `hissTone`
  - `crosshair` (circle diameter in px) and `color` (cap color on the can and pickup)
- `COLORS` and `COLOR_ORDER`: the paint palette and its Q/E order. Add a color here and it becomes a `color:<name>` pickup.
- `SPRAY`: `range`, `falloffStart`, particle speed, size and pool size.
- `PRESSURE`: drain rate, the thin and sputter thresholds, sputter duty, shake restore and shake duration.
- `HOLD`: how each tool is held in first person (`can`, `marker`, `ladder`, `roller`, `sponge`; a new tool adds its own): `distance` in front of the eye, `x` / `y` position per meter of distance (so changing the distance keeps it in the same spot on screen), `scale`, and `pitch` / `yaw` / `roll`. Live in F3 → Camera → HELD ….
- `MARKER`: `reach`, `radius` (half the square nib's side in meters; 0 = one paint texel), `drips` (how readily it starts paint runs), and `strength`.
- `VIEWMODEL`: hand sway, walk bob, jump lag and the trigger-press animation.
- `ATMOS`: the rainy night, including `lightDecay` (light falloff, 2 = physical). `DAYLIGHT` overrides some of its keys while build mode is on.
- `BUILD`: build mode reach, the hold-to-place repeat timing and the free-fly speeds (`flySpeed`, `flySprintSpeed`).
- `WALL_HAND`: when the free left hand reaches for a wall and lets go: reach / release from the shoulder, the arc to your left it searches (`fromAngle`..`toAngle`), and its height below the eyes.
- `CCTV`: CCTV follow ranges and how far a head can turn.
- `DRIPS`, `PLAYER_LIGHT`: see above.
- `LIGHTS`: per light kind: `color`, `offset`, `dir`, `intensity`, `range`, `spread` (at most `LIGHT_SPREAD_MAX`), `softness`, `glow`, `beam`, `shadows` (casts baked shadows).
- `LIGHTMAP`: baked lamp light: `enabled`, `shadows`, `texelsPerMeter`, `smooth`, `highlights` (wet highlights from the nearest lamps), `budgetMs` (rebake time per frame).
- `VOLUMETRICS`: `enabled`, `downscale`, `steps`, `maxDistance`, `density`, `moon`, `lights`, `anisotropy`.
- `INK`: `paper`, `ink`, `sky` and `cloud` colors (`cloud`: what the city fades into above `ATMOS.cloudBase`, the sky color by default), `exposure`, the tone steps (`paperTone`, `hatchTone`, `blackTone`, `toneNoise`), `hatchPx` / `hatchWidth`, `grime`, the void (`voidTop`, `voidBottom`), paint (`paintLight`, `paintMin`, `paintHatch`) and the final pass (`outline`, `crease`, `outlineFade`, `wobble`, `grain`). All live in F3 → Ink. `ATMOS.fogDensity` is how fast the drawing fades into paper.
- `GRADE`: `exposure`, `contrast`, `saturation`, `temperature`, `tint` (neutral by default: they would change paint colors).
- `SKYLINE`: the city: `seed`, `radius`, `block`, `streetMin`/`streetMax`, `margin` (free space round the level), `street` (how far down the street is), `near`, `tallChance`/`tallMin`/`tallMax` (huge towers), `clutterRange`, `lineRange` (live), `litWindows` (live), `opacity` (live: fades the whole city into the sky color to focus on the level). F3 → Rendering → City, with a rebuild button; a level can override any of them.
- `PICKUP`: `radius`, `hover`, `spin`, `bob`.
- `PLAYER`:
  - `walkSpeed`, `sprintSpeed`
  - `acceleration`, `friction`, `airControl`
  - `jumpHeight`, `gravity`
  - `stepHeight`, `climbSpeed`, `ladderJumpOff`
  - `eyeHeight`, `height`, `radius`
  - `mouseSensitivity`, `killY`
  - `footstepStride`, `hardLanding` (footstep sounds)
- `AUDIO`: gains.

The F3 panel groups its controls into small collapsible sections (collapse / expand all; open sections are remembered), and every setting has a tooltip. It has a live control for every tunable value above that applies without a restart, including colors and `[x, y, z]` values. Not included: `RENDER.batchTile`, `BUILD`, `PLAYER.footstepStride`/`hardLanding`, `PAINT.texelsPerMeter` (pause menu → PAINT DETAIL), `maxTextureSize`/`mipLevels`, `BASE_TEXTURES`, `SPRAY` pool and particle size, and `AUDIO`, which are only read at startup or when a texture is made. **copy values** puts them on the clipboard as JSON, ready to paste back in as new defaults.

## Files

```
src/main.ts              wiring + game loop
src/config.ts            all tunable constants
src/kit/                 prop kit: pieces + helpers (railings, ladders), prop builders (signs.ts, steel.ts: lettered signs, lattices), registry
src/level/               build-prop (pieces → meshes/colliders), level (instances, JSON), decor batch tiles, solids broad phase
src/build/               build mode, its HUD panel, level file I/O
src/inventory/           pickup kinds, inventory (can, marker, ladder, roller, sponge, unlocks), hotbar and its item icons
src/pickups/             pickup manager + visuals
src/spray/               spray tool, can + hand view model, particles
src/tools/               marker, stepladder, paint roller, sponge, tool routing (hotbar → tool), hand sway/bob
src/debug/               debug + tuning panel, tunable list, GPU pass timer
src/render/              lighting pool, light FX, rain, atmosphere presets, post pipeline, volumetrics
src/render/ink/          ink look: tones + hatching (tone.ts), facade bands, grime, sign lettering atlas, outline + paper pass
src/render/bake/         baked lamp light: lightmap layout, shadow grid, lamp math, baker
src/city/                the city: layout, chunked meshes + lean material, pen lines, rooftop clutter + signs, wires
src/painting.ts          lazy paint textures, stamping, dirty-rect uploads
src/paint-mips.ts        smaller paint levels for distant surfaces
src/paint-resample.ts    moves paint into a new atlas (paint detail change)
src/surfaces.ts          box / cylinder geometry with per-surface atlas UVs
src/materials.ts         surface shader, procedural base textures
src/player.ts            FPS controller, collisions (with broadphase), ladders, fly mode
src/sky.ts, skyline.ts   paper sky dome, the city around the level (builds src/city)
src/hud.ts               body-cam frame: vignette, REC/clock, crosshair, cap tag, start/pause menu
src/style.css            all UI styling (ink on paper + red alert, thin lines, monospace)
src/settings.ts          pause-menu settings (resolution, volumetrics, paint detail, city detail), saved in localStorage
src/audio.ts, input.ts, fullscreen.ts
src/hex-color.ts, lcg.ts small shared helpers: config colors parsed only on change, seeded random
public/levels/demo.json  demo rooftop (the original props and every pickup), plus an empty level-0 roof to the north for building
scripts/smoke.mjs        headless Playwright smoke test
```
