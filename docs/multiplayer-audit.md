# Multiplayer audit: roof.hidden.haus (taggin)

Read-only review, 2026-10-04. No source files were changed. Line numbers refer to `2d62d55` (branch `prep_multiplayer`, same as `main`). The one later commit, `2ed77d0` on `shadows-fix` (moon shadow bias), touches nothing multiplayer-related.

**Legend**

- Buckets: **A** must be networked (authoritative, sent over the socket). **B** deterministic from shared inputs (level JSON, seeds, session config): only the inputs need to be shared. **C** client-only cosmetic: fine to differ per player.
- `file:line` refers to the commit above.
- **UNVERIFIED** means inferred from reading, not executed.
- **Simulated** means checked by re-implementing the code's arithmetic in a Node one-off over `public/levels/demo.json`. The game itself was not run, so treat those numbers as estimates.
- Hard constraints from `AGENTS.md` are honored throughout. Paint stays in lazily created per-surface textures with dirty-rect uploads. Nothing proposed here adds per-stroke meshes, decals or scene-graph nodes.

---

## 0. Decisions (2026-10-04)

| # | Topic | Decision | What it changes in this report |
|---|---|---|---|
| 1 | Session size | 2 players max to start | No interest management; bandwidth is trivial (~7 KB/s each way worst case) |
| 2 | Canonical paint detail | ~~ULTRA (96 texels/m)~~ Replaced 2026-10-08: the host picks the session's PAINT DETAIL (LOW 24, MEDIUM 48, HIGH 72 or ULTRA 96, as in settings), locked for everyone | The server keeps paint at the session's detail; join snapshots and SAVE in a session are at that detail. Where sections 2–6 say the server or its saves are at 96, read "the session's detail" |
| 3 | Pickups | Personal | Client-side and trusted: no pickup messages at all (6.3) |
| 4 | Griefing | Anyone can paint or erase anything | No ownership, undo or kick |
| 5 | Hosting | Your VPS | One small Node server (WebSocket over TLS), started by hand on the VPS; static files served by Caddy apart from it (`docs/deploy.md`) |
| 6 | Ownership and saves | Simplest possible: anyone hosts or joins, usually one session at a time. The server keeps a session's paint only while it's live. Players save locally, and a host can upload a save when starting. | No accounts, no database, no write-ahead log, no object storage (6.4) |
| 7 | Build mode in multiplayer | Never | Dev gate (6.2) |
| 8 | Ladders when the owner leaves | They vanish | Server removes them on disconnect; never saved |
| 9 | PAINT DETAIL cap | None; trust players; watch memory | Log paint memory per session at start |
| 10 | Drips | On in multiplayer | Drip ops are required (2.2) |
| 11 | CCTV, weather, lightning | Client only | No shared clock (2.5) |
| 12 | Player collision | None | Avatars aren't colliders |
| 13 | Late joiner | Waits for the full paint snapshot | Loading screen; no streaming |
| 14 | Browsers | Chrome only | Testing scope |
| 15 | Avatars | Simple cube figure (head, body, arms, legs) in the first-person style | 2.3 |
| 16 | Host leaves | The session continues while anyone is connected | The server holds the paint (section 5) |
| 17 | Inventory in a session | Everyone starts with the starting kit and collects again | `inventory.reset()` on entering a session, as on level load (`src/main.ts:138`) |
| 18 | LOAD in single player | Yes: SAVE and LOAD on the ESC menu | Phase 2 |

The game stays single-player by default. Multiplayer is entered from the ESC menu: **SAVE** downloads the current paint (not the map), and **MULTIPLAYER** offers **HOST** (optionally upload a save first, then get a code to share) and **JOIN** (enter a code). Section 7 lays out the work in phases that are all built and tested in single player before any networking.

---

## 1. Executive summary

The game is a better starting point for multiplayer than most. All paint is a CPU-side raster in per-surface atlases behind two entry points (`PaintSystem.stamp` / `roll`, `src/painting.ts:141-195`). The level is almost a pure function of its JSON (`src/level/level.ts:88-95`, `src/level/build-prop.ts:153-245`). What's missing is everything that makes state addressable, recordable and transferable between machines.

### Top blockers, ranked

1. **Paint is addressed by local objects and atlas UVs.**
   - Surfaces are keyed by their `THREE.Mesh` and have no id (`src/painting.ts:50,61-68`).
   - Hits carry atlas UVs (`src/painting.ts:153-156`). The atlas layout depends on PAINT DETAIL: rect sizes are `ceil(m * texelsPerMeter)` and shelf packing adds a fixed 1-texel gutter (`src/surfaces.ts:62-66,138-169`).
   - Simulated: a UV from a LOW client, replayed on an ULTRA client, lands 2–16 cm off. On a building's roof atlas it can fall outside its face and be clipped away entirely.
   - **Fix:** stable surface keys plus face-local coordinates in meters.
2. **There is no paint-operation layer.**
   - Paint is produced inside tool code that mixes input, camera, view models and `Math.random` (`src/spray/particles.ts:80-98,119`; `src/spray/spray-tool.ts:91-92`; `src/tools/marker.ts:62-75`).
   - Paint runs are started by `Math.random` per texel inside the raster (`src/painting.ts:323`; `src/paint-drips.ts:38-41`).
   - Tool sizes live in global config (`src/tools/wheel-size.ts:17`).
   - So nothing can be recorded, sent, replayed or saved.
   - **Fix:** a `PaintOps` command layer (event sourcing).
3. **Nothing persists paint, ladders or pickups, and the level save loses data.**
   - The only save is the level JSON, as a download (`src/build/io.ts:7-14`).
   - Runtime ladders are excluded (`src/level/level.ts:97-101`).
   - A level's `skyline` overrides are read (`src/main.ts:139`) but never written back (`src/level/level.ts:97-101`, `src/build/buildmode.ts:73`).
   - Inventory and pickups reset on every load (`src/main.ts:137-138`).
   - Late join needs exactly the snapshot that's missing.
4. **The world model is built around single-player singletons.**
   - One ladder per world (`src/tools/ladder-tool.ts:36,113-121`), drawing ids from the same `Level.nextId` as level props (`src/level/level.ts:50,202`).
   - Particle paint and drips stop whenever the local player pauses (`src/main.ts:225,272-278`).
   - Personal pickups and client-only CCTV (decisions 3 and 11) mean the single `collected` flag (`src/pickups/pickups.ts:25,140`) and single tracked player (`src/render/cctv-track.ts:42-43`) can stay as they are.
5. **There is no third-person avatar.** Every tool model is a camera-locked view model (`src/spray/can-model.ts:61-62`, `src/tools/marker.ts:90-91`, `src/tools/ladder-model.ts:56-57`, `src/tools/roller-model.ts:72-73`), drawn in a separate view scene (`src/main.ts:66-72`).
6. **The city is not identical across players.**
   - CITY DETAIL rewrites `SKYLINE.radius` and `clutterRange` (`src/settings.ts:31-35,84`).
   - The radius sets the bounds of the loop that draws every tower from one shared RNG stream (`src/city/layout.ts:36,43,49-56`).
   - `clutterRange` changes how many randoms each tower consumes (`src/city/rooftops.ts:54,195`).
   - Simulated: 0 of the ~149 towers within 150 m of the level are identical between LOW and HIGH.
7. **Live config and dev tools can change shared state.**
   - F3 writes straight into every config object (`src/debug/tuning.ts:26-56,62-64`): movement physics, caps, drips, pickup radius, the city seed.
   - Build mode gives noclip and level editing (`src/main.ts:216-222`).
   - `window.game` exposes everything (`src/main.ts:364`).
8. **Paint memory and uploads at ULTRA scale badly with several painters.**
   - There is one dirty bounding rect per surface atlas (`src/painting.ts:329-336`). Two players painting opposite faces of one building upload the rect that spans both, every frame.
   - A fully painted demo level is about 372 MB CPU + 496 MB GPU of paint at ULTRA (simulated, 268 of 344 props modeled).
9. **The world build doesn't run headless yet.** `buildProp` creates materials, which build canvas textures (`src/level/build-prop.ts:3,136-145,274-281`). Small signs measure text on a canvas while building (`src/render/ink/words.ts:29,54-59`), so their geometry also depends on installed fonts. The server needs the pieces → paint faces step in Node to hold the session's paint. `expandPieces` (`src/level/build-prop.ts:153-245`) is close: it creates no materials, but small signs reach the canvas through `words.ts`.

### Recommended direction (updated with the decisions in section 0)

- **Server.** One small Node process on your VPS, in TypeScript. It reuses the kit, the level geometry and a pure paint raster. It hands out session codes, puts all paint ops in one order, keeps the session's paint in memory at 96 texels/m, and sends it to a joiner as one snapshot. It removes a player's ladder when they disconnect and forgets the session when it ends. Nothing is stored on disk.
- **Players.** Movement is client-authoritative and trusted (co-op, two players). Clients send 20 Hz state snapshots, and the other player is shown with about 100 ms of snapshot interpolation.
- **Paint.** The painting client resolves its own hits into face-local ops (surface key, face rect, u/v in meters, amount). The server orders them. Each client applies its own ops immediately. Drips are separate events from whoever painted.
- **Same look as today.** A pixel-exact golden test of the paint is written *before* any refactor and must stay identical through every step (6.5).
- **Ladders** are runtime props keyed by owner. **Pickups** stay client-side.
- **Dev tools** (build mode, F3) stay in single player behind one boot-time flag, and are never loaded in multiplayer.
- **Order of work:** golden test → paint ops in single player → SAVE (paint file) in single player → avatar and loopback tests → server and the MULTIPLAYER menu (section 7).

---

## 2. System and state → bucket

| System / state | Bucket | Evidence | Required change |
|---|---|---|---|
| Player position, yaw, pitch | A | `src/player.ts:19-22,98-101` | 20 Hz snapshot; interpolate other players |
| Movement flags (onGround, onLadder, crouched, sprinting) | A | `src/player.ts:23-35,123-136` | Bit flags in the snapshot |
| Eased eye height, step smoothing, FOV boost | C | `src/player.ts:41-43,94-95,172-173`; `src/main.ts:236-241` | Recompute locally from the flags |
| Fly / noclip | dev only | `src/player.ts:33-34,190-201`; `src/build/buildmode.ts:89` | Impossible in multiplayer |
| Movement physics constants | A (session config) | `src/config.ts:515-550`; `src/debug/tuning.ts:189-200` | Server sends them; client freezes them |
| Footsteps, landing sounds | C | `src/main.ts:166-168,227-230` | Derive from the remote player's state |
| Selected slot, color, cap | A | `src/inventory/inventory.ts:12-22,40-52`; `src/tools/tools.ts:70-74` | Snapshot fields |
| Marker nib and sponge patch size | A (today: global config) | `src/tools/wheel-size.ts:14-19`; `src/tools/tools.ts:16,75-79`; `src/config.ts:293,338` | Move to per-player tool state; snapshot field; ops carry the radius |
| Can pressure, flow, sputter | effect in A, gauge in C | `src/spray/spray-tool.ts:54-66,86-102` | Flow is baked into dab amounts; send `flowing` and `shaking` flags for visuals |
| Unlocked colors, caps, tools | C (personal, trusted; decision 3) | `src/inventory/inventory.ts:74-98`; `src/pickups/pickups.ts:133-143` | None; each client keeps its own |
| View-model poses, sway, bob, wall hand, can jitter | C | `src/tools/hold.ts:9-13`; `src/tools/view-sway.ts:20-36`; `src/spray/can-model.ts:66` | None; the avatar needs its own third-person poses |
| Paint ops (spray dabs, marker stamps, roller presses, sponge scrubs) | A | `src/spray/particles.ts:119`; `src/tools/marker.ts:73`; `src/tools/roller.ts:65`; `src/tools/sponge.ts:51` | Face-local `PaintOp`, ordered by the server (2.2) |
| Drip spawn decision | A (decided by whoever painted) | `src/painting.ts:314-327`; `src/paint-drips.ts:33-42` | Drip event in meters; other clients never spawn drips from remote ops |
| Drip run simulation | B (given the spawn event) | `src/paint-drips.ts:44-64` | Store runs in meters and convert per detail |
| Per-texel excess counters | C | `src/painting.ts:42-43,314-322` | Local only |
| Paint textures at local detail | C (the content is A) | `src/painting.ts:106-126` | Rebuilt from ops and snapshots |
| Canonical paint (server's in-memory copy at 96) | A (server) | does not exist | New (6.1, 6.4) |
| Paint surface identity | B (must become a stable key) | `src/painting.ts:48-50,61-68`; `src/level/build-prop.ts:274-281` | Key = owner key + paint index (2.2) |
| Atlas layout and UVs | C (depends on detail) | `src/surfaces.ts:62-66,85-110,138-169` | Never on the wire |
| Seam index (paint crossing onto coplanar neighbors) | B | `src/paint-seams.ts:38-66,83-100` | None (world space) |
| PAINT DETAIL (texels per meter) | C (per player by design) | `src/settings.ts:27,82,168-178` | Keep; never read by the protocol |
| Spray particles (the visuals) | C | `src/spray/particles.ts:6-9,103-107` | Separate the visuals from the paint path for remote players |
| Level JSON (props, spawn, pickups) | A (sent once or by hash) | `src/main.ts:161-164`; `src/build/io.ts:36-40` | Server picks the level; ignore `?level=` in multiplayer |
| Prop geometry, colliders, climb volumes | B | `src/level/level.ts:88-95`; `src/level/build-prop.ts:153-245,339-358` | Make pieces → faces runnable in Node (phases 1 and 4) |
| Per-prop variation seeds | B | `src/level/level.ts:218`; `src/kit/signs.ts:11-14`; `src/kit/steel.ts:101-118`; `src/kit/neon.ts:34-41,88,97`; `src/kit/details.ts:149` | None |
| Prop ids (`Level.nextId`) | B at load, then diverge | `src/level/level.ts:50,202`; `src/tools/ladder-tool.ts:116` | Stable uids; runtime props keyed by owner |
| Joint posts | B | `src/level/joints.ts:36-49`; `src/level/level.ts:260-269,288-292` | Key joint surfaces by joint key |
| Decor batches, shadow proxies | C | `src/level/batches.ts:152-155` | None |
| Light anchors and baked light | C | `src/kit/lights.ts:31-34,46`; `src/level/level.ts:219`; `src/render/bake/baker.ts:66-100` | Freeze LIGHTS (F3 off) |
| City / skyline geometry | should be B, isn't today | `src/city/layout.ts:36,43`; `src/city/rooftops.ts:54,195`; `src/settings.ts:84` | Seed each block separately (2.1) |
| City colliders | none exist | `src/city/mesh.ts:156`; colliders come only from props (`src/level/level.ts:270-282`) | None |
| Placed stepladders | A | `src/tools/ladder-tool.ts:113-121`; `src/level/level.ts:59-77` | Keyed by owner; removed when the owner leaves (2.4) |
| Small-sign widths (exit sign, name plate) | should be B, depend on fonts | `src/render/ink/words.ts:54-59`; `src/kit/small-signs.ts:11-15,33-35,102-105` | Font-independent widths (2.1) |
| Pickup placements | B | `src/pickups/pickups.ts:98-101` | None (personal pickups need no ids on the wire) |
| Pickup collected state | C (personal; decision 3) | `src/pickups/pickups.ts:25,133-143` | None |
| Pickup bob and spin | C | `src/pickups/pickups.ts:72,117-124` | Optional: phase from a hash of the id |
| Rain heightmap | C | `src/render/heightmap.ts:23-46`; `src/main.ts:94` | None |
| Glyph and word atlases | C (Latin glyphs depend on fonts) | `src/render/ink/glyphs.ts:107`; `src/render/ink/words.ts:16,44-63` | None |
| Shader clock (CCTV pan, fans, neon flicker, baked flicker) | C (decision 11) | `src/main.ts:252,255,285`; `src/materials.ts:61-62,94,129`; `src/render/flicker.ts:16-22` | None |
| What CCTV heads follow | C (decision 11) | `src/render/cctv-track.ts:35,42-48` | None: the local player |
| Rain on/off | C (decision 11) | `src/settings.ts:161`; `src/config.ts:50` | None |
| Lightning, smoke, metal drops, audio | C | `src/render/lightning.ts:25-42`; `src/render/smoke.ts:98`; `src/main.ts:333-348`; `src/audio.ts` | Positional voices for remote players |
| F3 config writes | must be off | `src/debug/tuning.ts:62-64`; `src/debug/panel.ts:153-187` | 6.2 |
| Build mode edits | must be off | `src/build/buildmode.ts:101-141` | 6.2 |
| Settings page | C (once SKYLINE and PLAYER are split) | `src/settings.ts:96-165,227-276` | 6.2 |

### 2.1 World determinism

**How a level loads.**

1. `fetchLevel` → `checkLevel` (`src/build/io.ts:36-40,49-61`). The format version is never checked.
2. `loadLevel` (`src/main.ts:134-142`) calls `Level.load`.
3. `Level.load` (`src/level/level.ts:88-95`) creates every instance in JSON order with `nextId++` (`:197-206`), then builds each one (`:214-225`) through `buildProp` (`src/level/build-prop.ts:263-293`).
4. `refresh` (`src/level/level.ts:260-286`) computes joints, rebuilds the flat collider/ladder/solid arrays and calls `onChange`. That rebakes light, reseeds smoke, rebuilds light FX and the rain heightmap (`src/main.ts:89-96`).
5. Then come pickups, the inventory reset, the city rebuild against `level.totalBounds()` (`src/main.ts:146-151`), and the spawn point.

**Pure function of the JSON (B):**

- **Seeds.** `seed = |round(7·x + 13·z)|` (`src/level/level.ts:218`). It's deterministic, but y and rotation aren't part of it, so stacked props share a seed. Demo: 98 seed values are shared by more than one prop. That's harmless, but it isn't a unique id.
- **Signs and lettering.** `lettering(seed)` uses `lcg(seed*977+13)` (`src/kit/signs.ts:11-14`). Neon uses a mulberry32 `rng(seed*7919+len)` and `flicker = 1 + seed % 9973` (`src/kit/neon.ts:34-41,88,97`). Small signs draw their real words into a row of the word atlas the first time each text is used, so row order follows build order: deterministic for the same JSON (`src/render/ink/words.ts:44-63`).
- **Debris.** `lcg(seed*31+7)` (`src/kit/steel.ts:101-118`). Every debris piece has `collide: false`, so debris can't affect collisions.
- **Joints.** Keyed by `kind|x.xx|y.xx|z.xx` from `toFixed(2)` (`src/level/joints.ts:44`). Built with prop id `-1` (`src/level/level.ts:289`).
- **Colliders and climb volumes.** Generated from the pieces with quarter-turn integer tables (`src/level/build-prop.ts:103-113,196-242`).
- **Paint surfaces.** One surface per material key, in first-appearance order (`src/level/build-prop.ts:175-186,243`). Rects are pushed in piece and face order, and packing writes positions in place without reordering them (`src/surfaces.ts:138-163`). So `rects[i]` names the same face at every detail.
- **Batches** are grouped by `RENDER.batchTile` (`src/level/batches.ts:152-155`), which is visual only.

**Depends on something other than the JSON:**

| Dependency | Where | Effect | Bucket impact |
|---|---|---|---|
| PAINT DETAIL | `src/surfaces.ts:62-66,146` | Atlas size, rect positions, UVs | C, but it makes UVs non-portable (6.1) |
| `LIGHTS.floodlight.dir` (F3) | `src/kit/lights.ts:31-34,46,54`; `src/level/level.ts:219` | Default tilt of floodlights with no `adjust` in the JSON | Visual only: the heads are rods without colliders (`:62-64`). Freeze in multiplayer. |
| CITY DETAIL (radius, clutterRange) | `src/settings.ts:31-35,84,171`; `src/city/layout.ts:43`; `src/city/rooftops.ts:54,195` | A different city | Should be B (fix below) |
| F3 SKYLINE sliders | `src/debug/tuning.ts:350-362` | A different city | Off in multiplayer |
| Runtime ladders | `src/level/level.ts:168-172` (`totalBounds` includes them) | The city centers on bounds that include ladders whenever it is rebuilt mid-session | Exclude runtime props |
| Fonts on the machine | `src/render/ink/words.ts:16,54-59` → `src/kit/small-signs.ts:11-15,33-35,58-59,102-105` | Exit-sign and name-plate **widths, colliders and paint faces** come from `measureText` in Impact / Arial Narrow / sans-serif. A machine without Impact builds different geometry. | Should be B. Use a fixed per-letter width table (S). This also makes the headless build possible: `words.ts` needs a canvas. The demo level has none of these signs. |
| Load and edit order | `src/level/level.ts:50,202`; `src/pickups/pickups.ts:38,72`; `src/build/history.ts:27-33` | Prop and pickup ids | Replace with stable ids |

**City and skyline.**

- Inputs: `SKYLINE` (`src/config.ts:557-583`), the level's own `skyline` overrides (`src/main.ts:139`, `src/skyline.ts:41`) and the level bounds (`src/main.ts:149`). The city has no colliders (`src/city/mesh.ts:156`), so any mismatch is visual only.
- **The flaw:** `layoutCity` draws every tower from one stream, `lcg(seed*7919+1)` (`src/city/layout.ts:36`). The block loop runs from `-n` to `n` with `n = ceil(radius / block)` (`:43,49-50`), so a different radius consumes the stream in a different order from the very first block. `dressTower` and `wallSigns` read the global `SKYLINE.clutterRange` instead of `cfg`, and the LOD they pick changes how many randoms each tower uses (`src/city/rooftops.ts:54,195`).
- **Simulated** (Node copy of `layout.ts`, demo bounds): HIGH builds 3008 towers, MEDIUM 1913, LOW 1014. Within 150 m of the level, 0 of LOW's 149 towers match a HIGH tower.
- **Fix (S):** seed each block with `lcg(hash(seed, bx, bz))` and each tower with its lot index. Generate the full radius list, then cull by the player's radius. Make clutter always consume the same randoms and only skip emitting geometry. Read `cfg` instead of `SKYLINE`.
- Pixel scale and PAINT DETAIL never touch city geometry. Pixel scale only changes the line point size (`src/main.ts:244-247`).

**Load order, float rounding, iteration order, frame timing.**

- **Maps and Sets** iterate in insertion order, and `Array.prototype.sort` is stable (ES2019). `packRects`' sort by height (`src/surfaces.ts:139`) is therefore deterministic.
- **Float rounding.** These are all deterministic IEEE operations: `Math.round` in the seed, `toFixed` in joint keys and placement (`src/level/joints.ts:44`; `src/build/placement.ts:34,87`), and `Math.round(offset/EPS)` for seam planes (`src/paint-seams.ts:30`).
- **Transcendentals are not guaranteed bit-identical across JS engines.** ECMAScript lets each engine approximate `Math.sin`, `cos`, `tan` and `log`. Where they matter:
  - Fat-cylinder colliders (`src/level/build-prop.ts:349-356`). Last-bit differences only, so harmless. UNVERIFIED in practice.
  - Spray cone sampling (`src/spray/particles.ts:80-82,141`). That's one more reason to send results, not inputs (2.2).
- **Frame timing changes paint today.**
  - `dt` is clamped to 1/20 (`src/main.ts:210`).
  - When a tool is held still, `fresh` frames come at a fixed rate (`src/tools/stroke.ts:48-50`), but while moving, every frame is fresh. So the sponge cleans more per second at higher fps (`src/tools/sponge.ts:51`).
  - Particle flight time and drip runs integrate `dt`.
  - So replaying inputs on another machine with another frame rate wouldn't reproduce the paint, but replaying ops would.

### 2.2 Paint pipeline and sync

**Pipeline today.**

1. **Tools** produce hits:
   - Can: raycasts per particle at emit time (`src/spray/particles.ts:72-109`) and stamps when the particle arrives (`:111-123`).
   - Marker, roller and sponge: sweep rays between frames (`src/tools/stroke.ts:43-64`) and call `stamp` or `roll` per ray (`src/tools/marker.ts:71-75`; `src/tools/roller.ts:63-69`; `src/tools/sponge.ts:50-52`).
2. `stamp` and `roll` turn the atlas UV into texel coordinates: `cx = uv.x · atlasW` (`src/painting.ts:153-156,185-187`). Then they rasterize a dot (`:253-304`) or a band (`:210-250`) clipped to the face rect, and spill across seams in world space (`:157-161,202-207`).
3. Paint composites OVER (`src/painting.ts:383-391`). The sponge moves alpha toward 0 (`:292-296`).
4. Excess paint on opaque texels may start a run (`src/painting.ts:314-327`) that drips one texel per row (`src/paint-drips.ts:44-64`).
5. Textures are created on the first hit (`src/painting.ts:106-126`). Only dirty rects are uploaded, and the smaller levels are averaged on the CPU (`:342-370`; `src/paint-mips.ts:28-56`).

**How are surfaces identified, and are the ids stable across clients?**

- By object reference: `bySurfaceMesh: Map<Object3D, PaintSurface>` (`src/painting.ts:50,61-68,97-99`). `PaintSurface` has no id field (`:34-46`).
- The nearest thing to an id is prop id + index in `BuiltProp.paint` (`src/level/build-prop.ts:274-281`). Prop ids come from `nextId++` in JSON order (`src/level/level.ts:197-206`), so they're stable across clients only until something is added at runtime. Ladders take ids from the same counter (`src/tools/ladder-tool.ts:116`), and so do build-mode edits and undo (`src/build/history.ts:27-33`).
- Joints all have id `-1` (`src/level/level.ts:289`).
- **Proposal:**
  - `SurfaceKey = ownerKey + '#' + k`, where `ownerKey` is `p<propUid>` or `j<jointKey>`, and `k` is the index in `BuiltProp.paint`. `k` is deterministic (`src/level/build-prop.ts:175-186`).
  - `propUid` is the JSON index for format-v2 levels and an explicit `id` from v3 on.
  - On the wire, use a dense u16 index from a deterministic enumeration (props in JSON order, then joints sorted by key). Send a hash of that table in `Welcome` so a mismatch fails fast.
  - The face is `rectIndex` in `geo.rects`, which is stable across detail (2.1).

**Can a remote stroke be replayed through the same code path as a local one?**

- **At the raster level, yes, after a small change.** Everything after `(rect, cx, cy)` in `stamp`, `roll` and `dot` is detail-independent: radii are in meters times `texelsPerMeter`, and seams are in world space.
- **What blocks it today:**
  1. The input is an atlas UV, which isn't portable (6.1).
  2. The surface is an object reference.
  3. Drip randomness sits inside the raster (`src/painting.ts:323`).
  4. Tool sizes come from global config (`src/tools/marker.ts:73`; `src/tools/sponge.ts:51`).
- **At the tool level, no.** Tools read `Input` and the camera directly (`src/spray/spray-tool.ts:42-71`; `src/tools/marker.ts:58-77`; `src/tools/roller.ts:43-46`; `src/tools/sponge.ts:37-44`). Remote players don't need the tools. They need the raster path plus their own visuals.
- **Proposal:** a `PaintOps.apply(op, record)` used both for local ops (record = true) and remote ops (record = false). It calls new `stampFace` / `rollFace(surface, rect, fu, fv, …)` entry points that compute `cx = rect.x + fu·rect.w`. Local tools convert `hit.uv` to face-local coordinates once, with a helper in `surfaces.ts`, so local and remote paint share 100% of the raster code.

**How are drips and spray noise made identical?**

- **Spray noise.** Cone direction, angle and amount use `Math.random` (`src/spray/particles.ts:80-82,98,141`), and so does sputter (`src/spray/spray-tool.ts:91-92`).
  - Seeding them per stroke (for example `lcg(hash(playerId, strokeSeq))`) would let a receiver re-simulate the particles. But it would still have to raycast against geometry that is identical *at that moment*, and transcendentals would have to match across engines (2.1).
  - **Recommended:** the painter sends the resolved dabs, so the noise is already baked into positions and amounts. Seed the author side anyway, so local replays and tests are reproducible.
- **Drips can't be made identical by seeding.** The trigger depends on per-texel excess counters (`src/painting.ts:314-322`), and the number of texels changes with detail.
  - **Recommended:** only the painter decides. The raster reports the run as a `drip` op in meters: surface, rect, `fu`, `fv`, length in meters, speed in m/s, and RGB taken from the texel. Receivers rasterize it at their own detail and pass `drip = 0` for remote stamps.
  - `PaintDrips` must keep runs in meters and convert per detail. Today it stores texel `x`, `y`, `end`, length and speed (`src/paint-drips.ts:11-20,37-41`), and it skips a new run if one is within 4 *texels* in the same column (`:36`).

**How does a late joiner get existing paint?** The join snapshot is the paint save format (6.4): the server's in-memory paint at 96, current up to a known op sequence number.

1. The client downloads the whole snapshot behind a loading screen (decision 13).
2. It resamples each face crop into its own atlas rect with `resampleRect` (`src/paint-resample.ts:24-54`): nearest neighbor when enlarging, alpha-weighted box filter when shrinking. That's the same function `carryPaint` uses.
3. It applies any ops numbered after the snapshot through `PaintOps.apply`, then spawns.

**Ordering and conflicts when two players paint or scrub the same texels.**

- OVER blending (`src/painting.ts:383-391`) and scrubbing (`:292-296`) don't commute. The final texel depends on the order the ops were applied.
- With one server order, every client applies remote ops in the same order. Each client applies its own ops *optimistically*, before the server confirms them.
- So clients can only disagree on texels that two or more players touched within about one round-trip time.

| Strategy | Converges | Cost | Look |
|---|---|---|---|
| Server order + optimistic local apply (accept brief disagreement) | At the next snapshot load (rejoin, reload) | None | Unchanged |
| …plus region repair: the server re-sends canonical face tiles where it saw overlapping ops from different players | Within about a second | Server raster + tile bandwidth | Unchanged |
| Rollback and replay per surface (keep a confirmed copy) | Immediately | 2× paint memory, re-raster cost | Unchanged |
| Per-texel last-writer-wins (CRDT register, Lamport timestamp) | Yes, order-free | +4 B/texel | Loses layering and fades |
| Commutative blend (additive or max) | Yes, order-free | None | Changes the paint look |

**Recommendation:** row 1 now and row 2 if the disagreement is ever visible. This is server-ordered last-writer-wins on operations, like Figma's multiplayer (server authority, no OT or CRDT). It keeps the OVER look that the art depends on.

**Wire format for paint**

| Option | Sent | Upstream per sprayer | Receiver CPU | Risk |
|---|---|---|---|---|
| Input replay (aim, nozzle, flow, seed per frame) | ~35 B × 60 fps | ~2 KB/s | Raycasts every particle: up to 1100/s per remote sprayer | Geometry has to match at that instant; engine math; frame-rate dependence (2.1) |
| **Resolved dabs (author's hits, face-local)** | 5–6 B per dab | 2–7 KB/s (table below) | Stamps only | None of the above. The author is trusted, so validate reach and rate. |
| Texture deltas (dirty rect pixels) | RGBA rect at the sender's detail | ~400 KB/s at ULTRA (UNVERIFIED estimate) | Paste | Detail mismatch, no ordering, trivial to fake |

**Recommended:** resolved dabs. This is the command pattern feeding an event log. Receivers do the cheapest possible work, which matters because "most of the screen is city" already eats the frame budget.

**Bandwidth per second of continuous use** (dab = `fu` u16, `fv` u16, amount u8, delay u8 = 6 B; stamp or press = 5 B; plus about 20 B per 50 ms batch):

| Tool | Ops/s at full use | Upstream |
|---|---|---|
| Can, skinny (rate 320, `src/config.ts:267`) | 320 | ~2.0 KB/s |
| Can, standard (450) | 450 | ~2.8 KB/s |
| Can, fat (800) | 800 | ~4.9 KB/s |
| Can, spray (1100) | 1100 | ~6.7 KB/s |
| Marker (up to 32 rays per frame, `src/tools/marker.ts:26,80`) | 360 at 1 rad/s, 1680 at 5 rad/s | 1.8–8.4 KB/s |
| Roller (ray step = halfDepth / reach, `src/tools/roller.ts:61`) | ~120 at 1 rad/s | ~0.6 KB/s, worst case 14 KB/s |
| Sponge (only on fresh frames, at most 24 rays) | ≤1440 | ≤7 KB/s |

So the worst realistic case is about 7 KB/s (56 kbit/s) upstream per painter. With two players (decision 1), each receives at most the other's ~7 KB/s. The server applies ops to its in-memory paint and doesn't keep them (a log would be ~24 MB/h per continuous sprayer). Delta-coding dabs within one face roughly halves the traffic if that's ever needed.

**What happens to paint when a prop rebuilds (`carryPaint`)?**

- `Level.build` carries paint over when the detail changed (`resample`) or when the face sizes are unchanged (`src/level/level.ts:214-225,298-307`).
- It matches surfaces by index and resamples face by face (`src/level/level.ts:148-150`; `src/painting.ts:90-95`; `src/paint-resample.ts:9-14`).
- Rebuilds happen on:
  - a local PAINT DETAIL change (`rebuildAll`, `src/level/level.ts:136-145`);
  - F3 light changes (`rebuildLit`, `:125-133`);
  - build-mode edits and stacking neighbors (`:231-242`).
  A ladder placement doesn't rebuild other props: the stepladder has no `stacks`.
- **What this means for multiplayer:**
  1. Paint in flight to a rebuilt surface is dropped (`src/painting.ts:101-104,152`; `src/paint-drips.ts:49`; particles keep a `PaintSurface` reference, `src/spray/particles.ts:93`). Resolving ops by key when they're applied fixes that.
  2. Dropping the detail and raising it again is lossy and can't be undone locally. In multiplayer, the client should re-fetch canonical faces when its detail goes up.
  3. Build-mode and F3 rebuilds don't exist in multiplayer (6.2).

### 2.3 Player state and the remote avatar

- **Controller.** `Player` (`src/player.ts:18-181`): AABB physics against the level colliders and ladder volumes passed in by reference (`:49-52`). It's only ever simulated locally; remote players are interpolated, not simulated.
- **Tool state.** `Inventory` holds the slot, colors, caps and pressure (`src/inventory/inventory.ts:11-22`). `Tools` routes input to the tool in hand (`src/tools/tools.ts:58-89`). Nib and patch sizes are in config (`src/tools/wheel-size.ts:17`).

**Minimal per-tick snapshot, about 24 B at 20 Hz:**

| Field | Encoding | Source |
|---|---|---|
| seq, client time | u16, u16 | new |
| feet position | 3 × f32 (12 B) | `src/player.ts:19` |
| yaw, pitch | u16, i16 | `src/player.ts:21-22` |
| flags | u16: onGround, onLadder, crouched, sprinting, pressing (LMB with a tool), flowing (`flow > 0`), shaking, rolling or scrubbing | `src/player.ts:23-35`; `src/spray/spray-tool.ts:24,54-66` |
| slot + cap | u8 (3 + 2 bits) | `src/inventory/inventory.ts:12,44-46` |
| color | u8 | `src/inventory/inventory.ts:40-42` |
| nib or patch size | u8, in `radiusStep` units | `src/config.ts:293-297,338-346` |

- **Derive, don't send:** velocity (from snapshot deltas), jump and landing (from `onGround` and vertical speed), eased crouch eye height (`src/player.ts:94-95`), footsteps, roller spin (from roller ops), drip visuals (from drip ops).
- **What's missing:** a third-person body. Every tool model copies the camera transform and lives in `viewScene` (`src/main.ts:66-72`; `src/tools/tools.ts:54`).

**Avatar plan (L):**

- An ink-gray body made of box segments, reusing `segment` / `chain` and the glove and sleeve materials (`src/spray/hands.ts:11-35`).
- Held tools: reuse the pickup item models (`src/pickups/visuals.ts:39-111`) and `spongeShape` (`src/tools/sponge-shape.ts:10-40`), scaled down. They already exist in world space.
- Poses: idle, walk and sprint lean, crouch, airborne, climb (facing the ladder normal, arms alternating with vertical speed), drawing arm aimed at pitch, shake, roller push, sponge circles.
- At most about 4 draw calls per avatar, with static parts merged. That stays within `AGENTS.md`: moving objects, nothing per stroke.
- No colored materials. Players are told apart by HTML nameplates, and the can label shows their paint color, which is the one allowed color.

### 2.4 Ladders

- **Today.** The stepladder is a level prop with `runtime: true` (`src/level/build-prop.ts:27-28`). `put` removes the previous one and adds a new one (`src/tools/ladder-tool.ts:113-121`): "there is only one, so placing it again moves it" (`:15-24`). Its pieces become colliders and a climb volume through the normal build (`src/kit/access.ts:134-164`; `src/level/build-prop.ts:240`). They join the shared `colliders`, `ladders` and `solids` arrays in `refresh` (`src/level/level.ts:270-282`), which `Player` and the tools hold by reference (`src/main.ts:108,111,113`). So "one ladder, moved."
- **Already works for another player's ladder:**
  - Player B's physics collide with it and can climb it, because it's in the same arrays.
  - B's placement check treats it as an obstacle: `overlaps` ignores only B's own `placedId` (`src/tools/ladder-tool.ts:100,107`).
  - B's aim ray looks through only B's own ladder (`:66,72`).
- **What has to change (M):**
  1. Owner-keyed runtime props: a single `Level.setRuntime(owner, data | null)` call that refreshes once. Today a move refreshes twice (`src/level/level.ts:59-77`), and each refresh rebakes nearby light, reseeds all smoke and rebuilds the heightmap (`src/main.ts:89-96`).
  2. Replace `LadderTool.placedId` with the local player's owner key.
  3. Server validation: the server runs the same overlap test against headless colliders and **every** player's box. Today the "not inside the player" check covers only the local player (`src/tools/ladder-tool.ts:101-104`), so B could place a ladder inside A.
  4. Removed when the owner leaves or disconnects (decision 8): the server sends `LadderSet removed`.
  5. If a climber's ladder moves out from under them, they simply drop (`src/player.ts:267-272`). That's acceptable.
  6. Never saved (decision 8).
  7. With two trusted players, the server can skip the overlap test (no headless colliders needed for it). Keep the client check against both players' boxes.

### 2.5 Time-driven world state

| Effect | Clock | Visible? | Gameplay? | Recommendation |
|---|---|---|---|---|
| CCTV idle pan | `uTime` = rAF time since page load (`src/main.ts:252`; `src/materials.ts:94`; `src/render/cctv-track.ts:78-83`) | Yes, differs per client | No (no alarms) | Optional session clock |
| CCTV follow and lens light | Local eye position (`src/main.ts:253`; `src/render/cctv-track.ts:42-48`) | Yes | No | C; optionally pass the nearest of up to 4 players |
| Neon flicker (tubes, real lights, baked light) | Same `uTime` and a deterministic hash (`src/render/flicker.ts:16-22`; `src/materials.ts:129`; `src/render/lighting.ts:268-269`; `src/render/bake/baker.ts:213-216`) | Yes | No | Session clock makes it identical |
| AC fans | `uTime` (`src/materials.ts:94`) | Yes | No | Same |
| Rain | Player setting (`src/settings.ts:161`) | Per player | No | C |
| Lightning | `Math.random` intervals (`src/render/lightning.ts:25-42`) | Yes | No | C, or session-seeded strikes if weather becomes shared |
| Rain and smoke animation, pickup bob | Local paused-aware clocks (`src/main.ts:265-267`; `src/pickups/pickups.ts:118`) | Yes | No | C |

Nothing gameplay-relevant depends on local time. **Decision 11:** all of this stays client-only, so no shared clock is needed.

### 2.6 Architecture fit

**Main loop.** `frame()` in `src/main.ts:206-327`. It reads input, steps the player only while not paused (`:225-226`), updates world effects, then tools, drips and pickups only while not paused (`:272-278`), then flushes level batches and paint (`:284-286`) and renders.

**Where the network layer plugs in:**

1. **Frame start (before `:226`).** `net.drain()` processes buffered socket messages: remote snapshots go into interpolation buffers, ladder and pickup events go to `Level` and `Pickups`, and paint ops are queued with their play time (`serverTime + offset + interpDelay`).
2. **Local sim (`:226`, `:274`).** Unchanged. Tools emit through `PaintOps`, which records local ops.
3. **World sim, never paused (after `:278`).** Apply due remote ops, run drips and remote particles, update avatars.
4. **Before `paint.flush` (`:286`).** So remote dabs upload in the same frame.
5. **Fixed 20 Hz send.** Local snapshot plus the recorded op batch.

**Singletons that would block a second, remote player or replaying remote events:**

| Singleton | Evidence | Fix |
|---|---|---|
| Tool sizes in config | `src/tools/wheel-size.ts:17`; `src/tools/tools.ts:16` | Per-player tool state |
| One `Inventory`, bound to `Tools` | `src/main.ts:109,111`; `src/tools/tools.ts:46` | Local only; a lightweight state per remote player |
| Tools read `Input` and the camera | `src/spray/spray-tool.ts:42-71`; `src/tools/marker.ts:58-77` | Remote players use `PaintOps` + avatar, not tools |
| `onDrip` callback with `Math.random`, level-wide run cap | `src/painting.ts:59,323`; `src/paint-drips.ts:34` | Drip ops; cap per author |
| One particle pool that stamps on arrival | `src/spray/particles.ts:40-66,119` | Visual-only path for remote players |
| One ladder (`placedId`), shared `Level.nextId` | `src/tools/ladder-tool.ts:36`; `src/level/level.ts:50` | Owner keys |
| `Pickups.update` for one player; global `collected` | `src/pickups/pickups.ts:25,117-131` | Per-player state |
| `trackUniforms.uPlayer` | `src/render/cctv-track.ts:35,42-43` | Nearest player (optional) |
| Single hiss and scribble voices | `src/spray/spray-tool.ts:48,67`; `src/tools/marker.ts:66,76` | Positional voices for remote players |
| Pause stops the world sim | `src/main.ts:225,272-278` | Split local and world sim |
| `live`, `window.game` | `src/debug/tuning.ts:78-102`; `src/main.ts:364` | Dev gate (6.2) |

---

## 3. Randomness inventory

There is no `Date.now` anywhere. `lcg` is in `src/lcg.ts:2-7`: an exact 32-bit LCG, since products stay below 2^53, so it's deterministic in every engine.

| Source | Site | Drives | Seen or collided with by others? | Verdict |
|---|---|---|---|---|
| `Math.random` | `src/spray/particles.ts:81` (angle), `:141` (Gaussian radius) | Where each spray dot lands | Yes (paint) | Seed per stroke; send the resolved dabs |
| `Math.random` | `src/spray/particles.ts:98` | Dab amount (0.6–1.0) | Yes (paint) | Same |
| `Math.random` | `src/spray/spray-tool.ts:91-92` | Sputter on and off at low pressure | Yes (via flow) | Seed; the effect is in the dabs |
| `Math.random` | `src/painting.ts:323` | Whether excess paint starts a run | Yes (paint) | Painter decides; becomes a drip op |
| `Math.random` | `src/paint-drips.ts:38,41` | Run length and speed | Yes (paint) | Painter decides; sent in the drip op |
| `Math.random` | `src/pickups/pickups.ts:72` | Bob and spin phase | Visual | Local, or hash of the stable id |
| `Math.random` | `src/render/lightning.ts:26,31,32,36,37` | Strike timing, pulses, thunder delay | Visual | Local (session seed if weather is shared) |
| `Math.random` | `src/render/rain.ts:34` | Drop seeds | Visual | Local |
| `Math.random` | `src/render/smoke.ts:98` | Puff seeds (reseeded on every level change) | Visual | Local |
| `Math.random` | `src/spray/can-model.ts:66` | First-person can jitter | No | Local |
| `Math.random` | `src/main.ts:341` | Rain pinging on metal | Audio | Local |
| `Math.random` | `src/audio.ts:38,142-150,174-188,237,245-247,260-261` | Noise buffer, sound variation | Audio | Local |
| `performance.now` | `src/main.ts:207,301` | Frame stats | No | Local |
| `performance.now` | `src/render/bake/baker.ts:155,168,171` | Bake time budget per frame | Visual (bake order) | Local |
| `performance.now` | `src/hud.ts:58,161,167,178,208`; `src/inventory/hotbar.ts:44,54` | HUD and toast timers | No | Local |
| `performance.now` | `src/build/buildmode.ts:139,156,325` | Build-mode status and repeat timing | Dev | Gone in multiplayer |
| `new Date` | `src/hud.ts:213`; `src/screenshot.ts:11` | Clock text, file name | No | Local |
| rAF `time` | `src/main.ts:206,252,255,285` | Shader `uTime`, flicker, CCTV | Visual | Optional session clock (2.5) |
| `dt` clocks | `src/main.ts:265`; `src/render/lightning.ts:46`; `src/pickups/pickups.ts:118` | Rain, smoke, lightning, bob | Visual | Local |
| `lcg(seed*7919+1)` | `src/city/layout.ts:36` | The whole city layout | Visual, must match | B. Seed per block (2.1) |
| `lcg(seed*131+i*17+axis*7)` | `src/city/layout.ts:45` | Street widths | Visual | B (already per grid line) |
| `lcg(floor(rnd()*1e9))` | `src/city/layout.ts:116` | Per-tower clutter stream | Visual | B (seed from the lot) |
| `lcg(seed*31+5)` | `src/skyline.ts:57` | City wires | Visual | B |
| `lcg(seed*977+13)` | `src/kit/signs.ts:12` | Sign lettering | Visual | B |
| `lcg(seed*31+7)` | `src/kit/steel.ts:102` | Debris layout (no colliders) | Visual | B |
| mulberry32 `rng(seed*7919+len)`; flicker `1+seed%9973` | `src/kit/neon.ts:34-41,88,97` | Neon glyphs, flicker id | Visual | B |
| Prop seed `round(7x+13z)` | `src/level/level.ts:218` | All per-instance variation | Visual | B (not unique: not an id) |
| `phase: seed*1.7`; `phase: c[0]*3` | `src/kit/details.ts:149`; `src/kit/equipment.ts:218` | CCTV pan and fan phase | Visual | B |
| `lcg(4242)`, `lcg(seed)` | `src/render/ink/glyphs.ts:87,105` | Glyph atlas (Latin glyphs depend on fonts, `:107`) | Visual | B / C |
| `lcg(91)`, `lcg(5150)` | `src/render/ink/tone.ts:28`; `src/render/ink/compose.ts:26` | Shader noise, paper | Visual | B |
| `lcg(seed)` | `src/textures.ts:16` | Base textures | Visual | B |
| `lcg(7)` | `src/tools/sponge-shape.ts:23` | Sponge pores | Visual | B |
| Integer hash of time | `src/render/flicker.ts:8-22` | Neon dips | Visual | B given a shared clock |

---

## 4. Network message schema

Binary frames over a WebSocket. Little-endian. `R` = reliable and ordered (TCP); every channel is R on a WebSocket. Player snapshots can move to WebTransport datagrams later.

| Message | Direction | Rate | Size | Fields |
|---|---|---|---|---|
| `Host` | client → server | once | level JSON (~16 KB raw) + optional paint save (6.4) | protocol u16, surface-table hash, name, level JSON, session config (PAINT DETAIL), optional save. The server answers `Hosted {code}` (e.g. 5 letters). |
| `Join` | client → server | once | ~40 B | protocol u16, surface-table hash, name, code, reconnect token (if rejoining) |
| `Welcome` | server → client | once | ~4–8 KB gzip | playerId u8, level JSON, session config, surface-table hash, current players, ladders |
| `JoinSnapshot` | server → client | once, before the joiner enters (decision 13) | 0.1–30 MB typical (6.4) | Same format as the paint save: the session's detail + face chunks `{surface u16, rect u16, w u16, h u16, codec u8, bytes}` + the op sequence number it is current to |
| `SaveRequest` / `Save` | client ↔ server | on SAVE | same as the snapshot | The current session paint as a downloadable save |
| `PlayerState` | client → server | 20 Hz | ~24 B | 2.3 table |
| `WorldSnapshot` | server → client | 20 Hz | 6 + 25·N B (N=8: ~206 B, ~4 KB/s) | serverTick u32, count u8, `{playerId u8, PlayerState}` × N |
| `PaintOps` | client → server | 20 Hz while painting | 20 B header + ops | clientSeq u32, t u16 (ms within the batch), tool u8, color u8, cap u8, sizeQ u8, flags u8, yawQ u16 (roller axis = camera right), groups `{surface varint, rect u8/u16, count u16, ops}` |
| … spray dab | inside `PaintOps` | | 6 B | fu u16, fv u16, amount u8, delay u8 (4 ms units, particle flight) |
| … marker, roller, sponge op | inside `PaintOps` | | 5 B | fu u16, fv u16, dt u8 |
| … drip | inside `PaintOps` | | ~14 B | surface, rect, fu u16, fv u16, length (mm) u16, speedQ u8, rgb 3 B |
| `PaintOps` (relayed) | server → client | 20 Hz | + 5 B | playerId u8, serverSeq u32, then the same body |
| `LadderPlace` | client → server | rare | 14 B | pos as 3 × i32 (mm), rot u8, clientSeq |
| `LadderSet` | server → all | rare | 18 B | owner u8, serverSeq u32, pos, rot, or `removed` |
| `Ping` / `Pong` | both | every 2 s | 16 B | t0, serverTime (clock offset for scheduling remote paint and interpolation) |
| `PlayerJoined` / `PlayerLeft` | server → all | rare | ~40 B | id, name |

- **Coordinates.** `fu` and `fv` are fractions of the face size quantized to u16. The largest face is 2048 texels at ULTRA, about 21 m (`src/config.ts:230`), so that's sub-millimeter resolution. Every client converts them to its own texels.
- **Server checks.** With two trusted players (decision 4), the server only checks that each op is well-formed (surface key exists, face index in range). Reach, rate and strength checks can wait until sessions open up.
- **No pickup messages.** Pickups are personal and client-side (decision 3).
- **Versions** (2026-10-08). Client and server are deployed separately (`docs/deploy.md`), so an open tab can be older or newer than the server. `Host` and `Join` carry:
  - `protocol`: one number in shared code, bumped when a message changes *or* anything the server runs for the session changes (paint raster, drips, face keys, the save format);
  - the surface-table hash of the level, as this client builds it: catches a kit or geometry change the bump forgot.
  On a mismatch the server answers `Rejected {reason}` and the client shows "A new version is out: reload the page" instead of reconnecting.

---

## 5. Authority model

| Model | Complexity | Bandwidth and hosting | Cheating | UX | Persistence and late join |
|---|---|---|---|---|---|
| **Dedicated server** (Node, shared TS modules) | M–L: server plus a headless world build and paint raster | Server fan-out; hosting cost | Best: validates, owns the log and grants | Stable; no host migration | Natural: the server owns saves and builds snapshots |
| Host client (listen server in a browser over WebRTC) | M: signaling, TURN, host logic | Cheap; host upstream fan-out ×N | The host can do anything | Session dies or migrates when the host leaves; the host's tab must stay open | Snapshots come from the host's textures, at the host's detail |
| Relay (forwards and orders messages, no game logic) | S | Like dedicated | Clients trusted | Stable | Log only; snapshots need a client upload or a full log replay |

**Recommendation (decisions 1, 5, 6): one Node process on your VPS that holds each live session's paint in memory.**

- It orders paint ops, applies them to an in-memory copy of the paint at 96 texels/m (the same pure raster the client uses, phase 1 in section 7), relays snapshots and ladders, and drops the session when it ends. No disk, no database.
- Why hold the paint on the server instead of asking the host's browser for it:
  - the joiner's snapshot is ULTRA quality no matter what detail the host plays at (decision 2);
  - it's ready instantly, which keeps the wait-for-snapshot screen short (decision 13);
  - SAVE in multiplayer always downloads ULTRA paint;
  - the session doesn't depend on the host's tab staying open.
- The cost is running the pure paint raster and the pieces → faces step in Node (phase 1 and 4). `expandPieces` already avoids materials. Two things need care: `words.ts` measures text with a canvas (2.1, fixed by a width table), and `materials.ts` must not be imported by the Node build (UNVERIFIED that the rest imports cleanly; checked by a Node smoke script in phase 4).
- Host-held paint (the host's browser is the source of truth, the server only relays) would skip the Node raster. But it ties snapshot quality to the host's detail and ends the session when the host leaves. It's the fallback if the Node raster turns out harder than expected.

**Why this fits this game:**

- It's cooperative with no combat, so movement can be client-authoritative. The local player keeps its zero-latency controller (`src/player.ts:98-181`) with no rollback. That's common in co-op games; Valve-style prediction and lag compensation exist for combat, which this game doesn't have.
- The hard shared state is paint, which needs one order (2.2) and durable storage (6.4). Both want an always-on owner, not a player's tab.
- The server is the same TypeScript as the client, so the kit, the face keys and the raster can't drift apart.
- Transport: WebSocket over TLS (`wss://`, behind Caddy on the VPS, since the page is served over HTTPS). Interest management isn't needed for 2 players on a ~30 × 30 m level (demo bounds x −8..18, z −20..12).

---

## 6. Dedicated answers

### 6.1 Mixed paint detail (A on ULTRA, B on LOW)

**Tracing B's stroke as it arrives at A, if it were sent the way paint is applied today:**

1. B (24 texels/m) raycasts and gets `hit.uv` in B's atlas and `hit.faceIndex`. The `uv` attribute is atlas UV (`src/surfaces.ts:89-101`).
2. At A (96 texels/m), `rect = rects[triToRect[faceIndex]]` is the right face, because triangle and rect indices don't depend on detail. But `cx = uv.x · A.atlasW` (`src/painting.ts:153-156`) uses B's packing. Rects are `ceil(m · d)` texels plus a fixed 1-texel gutter, and the shelf width is `ceil(sqrt(area) · 1.15)` (`src/surfaces.ts:62-66,138-169`).
3. **Simulated:**
   - Building roof atlas: LOW 78×90, ULTRA 286×318. Face centers land 2.3–15.8 cm off, and face 0's lands *outside* its face, where `dot` clips it away (`src/painting.ts:274-278`).
   - Parapet atlas: 2.3–8.1 cm off.
   - The reverse (A's UV at B) is the same mismatch, inverted.
4. With face-local addressing, both clients place the dab at the same point in meters.

**Does a stroke in meters rasterize the same at both details?** The footprint matches to within one receiver texel. Features smaller than a texel don't:

| Feature | LOW (24/m, 4.2 cm texels) | ULTRA (96/m, 1.04 cm) | Code |
|---|---|---|---|
| Spray dot, skinny cap, 3.3 cm | `r` = 0.79 texel, covers 1–2 texels | `r` = 3.2, about a 31-texel disc | `src/painting.ts:270-273`; `src/config.ts:267` |
| Spray dot, fat cap, 10 cm | `r` = 2.4 | `r` = 9.6 | same |
| Marker, default half-width 1.2 cm | `r` = 0.29 < 0.707: the one texel under the nib, so a **4 cm** line | `r` = 1.15: 1–2 texels, about 1–2 cm | `src/painting.ts:271-273,287`; `src/config.ts:293` |
| Marker at `radiusMin` 0 | 1 texel = 4 cm | 1 texel = 1 cm | `src/config.ts:292-295` |
| Roller band (22 × 3 cm halves) | L = 5.3, T = 0.72 texels | L = 21, T = 2.9 | `src/painting.ts:223-224` (at least half a texel) |
| Sponge, 9 cm (min 2 cm) | `r` = 2.2 (min: 1 texel) | `r` = 8.6 | `src/tools/sponge.ts:51` |
| Drip width | 1 texel = 4 cm | 1 cm | `src/painting.ts:307-312`; `src/paint-drips.ts:55` |
| Drip length and speed | meters × detail: same in meters | same | `src/paint-drips.ts:37-41` |
| Drip spawn rate | per m² on average; random per texel | same | `src/painting.ts:323` |
| Drip spacing in a column | within 4 texels = 17 cm | 4 cm | `src/paint-drips.ts:36` |
| Seam spill | world space: same | same | `src/painting.ts:202-207` |

So at LOW, thin marker lines, skinny-cap specks and drips are up to 4× wider. That's the same trade-off single-player already makes when you change detail, and it's acceptable.

**What is stored or computed in texels and would leak across the network:**

- Atlas UVs (above).
- Texel centers `cx` and `cy`.
- Drip `x`, `y`, `end`, `length`, `speed` and the 4-texel spacing (`src/paint-drips.ts:11-20,36-41`).
- Excess counters (`src/painting.ts:42-43`).
- Dirty rects.

The protocol may carry only surface key, rect index, face fractions, meters and m/s. Add a check (a grep test) that the protocol encoders never read `PAINT.texelsPerMeter`.

**Late-join snapshot with different details.**

- `carryPaint` resamples between two atlases of the *same client* (`src/painting.ts:90-95` → `src/paint-resample.ts:9-14`).
- A snapshot needs the same `resampleRect` (`src/paint-resample.ts:24-54`) with a **face crop** as the source: each face stored as its own small image with its 1-texel padding ring. The resampler already reads the padding (`:27-28`), and per-face storage needs no knowledge of the sender's atlas packing.
- Resampling down averages, which is lossless enough. Resampling up uses nearest neighbor, so a canonical detail below a client's makes blocky paint. That's why the canonical detail should be 96.

**Canonical paint: stroke log or fixed-detail server texture?**

| Option | Pros | Cons |
|---|---|---|
| Op log only (event sourcing) | Exact replay at any detail; tiny server | Unbounded growth (~24 MB/h per sprayer); join time grows with session length |
| Fixed-detail server faces only | Bounded; the save is the snapshot | Live ops still need ordering; resampling loses some quality |
| **Log + periodic per-face checkpoints (event sourcing with snapshots, like a database WAL with checkpoints)** | Bounded; exact recent history; enables "undo player X since the checkpoint" | Needs the headless raster (stage 2) |

**Decision (2, 6):** canonical paint is the server's in-memory paint at 96 (the highest PAINT DETAIL, so no client ever enlarges), allocated face by face (no atlas packing waste). The op stream is only for live sync and isn't kept. With sessions that live only in memory, the log and checkpoint row in the table above isn't needed. It's the option to come back to if crash safety ever matters.

**Memory and upload cost for an ULTRA client in a busy session.**

- Memory follows *which surfaces are touched*, not who painted them. A busy session touches more surfaces sooner.
- Simulated with `packRects` over the demo's buildings, slabs, walls, ledges, parapets and joints (268 of 344 props, 6,729 m² of faces): a fully painted level costs:

| Detail | CPU RGBA | GPU with smaller levels | Excess counters (drips on) |
|---|---|---|---|
| LOW 24 | 26 MB | 34 MB | 13 MB |
| MEDIUM 48 | 96 MB | 128 MB | 48 MB |
| HIGH 72 | 212 MB | 282 MB | 106 MB |
| ULTRA 96 | 372 MB | 496 MB | 186 MB |

- About 57% of ULTRA atlas texels are packing waste and padding (6,729 m² × 9,216 = 62 M face texels vs 97.6 M atlas texels).
- Uploads: one dirty bounding rect per surface (`src/painting.ts:329-336`), plus CPU averaging for every smaller level over that rect (`:353-365`). Two painters on one building's plaster atlas (about 600 × 720 texels at ULTRA) can force about 1.7 MB per frame of uploads.
- Fixes:
  - Dirty rects per face, merged only when they overlap (S).
  - Apply remote ops at their timestamps, so a 20 Hz batch is spread over frames.
  - Open question 9 on capping detail in multiplayer.
  - Longer term, per-face textures instead of per-prop atlases would remove both the waste and the union-rect problem. That's an L change to `surfaces.ts` and the material, so measure first.

**Code that must change for paint to be detail-independent end to end:**

1. `src/surfaces.ts`: add a `faceLocal(geo, faceIndex, uv)` helper.
2. `src/painting.ts`:
   - `stampFace` and `rollFace` entry points.
   - Drips out of the raster: `addExcess` reports to `PaintOps`.
   - Per-face dirty rects.
   - Lookup by key.
3. `src/paint-drips.ts`: runs in meters, spacing in meters.
4. `src/paint-resample.ts`: export a face-crop resampler.
5. Tools: `src/spray/particles.ts`, `src/tools/marker.ts`, `src/tools/roller.ts` and `src/tools/sponge.ts` emit face-local ops.
6. `src/tools/wheel-size.ts` and `src/tools/tools.ts`: sizes in per-player state.
7. `src/level/level.ts`: when local detail goes up, re-fetch canonical faces instead of enlarging its own copy (`rebuildAll`, `:136-145`).

### 6.2 Disabling dev tooling with minimal code

**Every dev and debug entry point:**

| Entry | Key or trigger | Code | Shared-state risk |
|---|---|---|---|
| Debug panel | F3, Backquote | `src/main.ts:212-215`; `src/input.ts:29`; `src/debug/panel.ts:46-50` | Writes any config (below) |
| Slider and toggle writes | panel | `src/debug/tuning.ts:26-56,62-64` | Physics, paint, city, pickups |
| Debug actions | panel | Rebuild city (`src/debug/tuning.ts:362`); strike lightning (`:440`); copy JSON | City geometry |
| `live` hooks | main | `src/main.ts:57,88,123-158`; `src/debug/tuning.ts:78-102` | Rebuilds (light props carry paint across rebuilds) |
| Build mode | B | `src/main.ts:216-222`; `src/build/buildmode.ts:87-141` | Noclip (`src/player.ts:190-201`), add and remove props and pickups (`src/build/buildmode.ts:260-292`), undo (`:112-114`), spawn T (`:119,196-209`), tilt `[` `]` (`:120-121`), sign text Enter (`:122,178-193`), paintable overlay H (`:115-118`) |
| Level download | P (build) | `src/build/buildmode.ts:123-126`; `src/build/io.ts:7-14` | None (local file) |
| Level load | O (build) | `src/build/buildmode.ts:127-136`; `src/build/io.ts:17-34`; `src/main.ts:159` | Replaces the whole world |
| Level by URL | `?level=` | `src/main.ts:161-164` | Selects the world |
| Console | `window.game` | `src/main.ts:364` | Everything (can't be prevented, only validated) |
| Screenshot | K | `src/main.ts:293`; `src/screenshot.ts` | None. Keep it. |
| Nib slider follows the wheel | wheel | `src/main.ts:187` | None |

**F3 values that would desync or cheat** (all have panel paths in `src/debug/tuning.ts`):

- Movement: walk, sprint and crouch speed, acceleration, friction, air control, jump height, gravity, climb speed, step height, crouch collider, ladder jump-off (`:189-200`). These are speed and jump cheats under client-authoritative movement.
- Pickup radius (`:202`).
- Spray range, falloff and particle speed (`:250-252`).
- Marker, roller and sponge reach, sizes, strength, drips and edge (`:255-283`).
- All drip settings (`:298-305`).
- All cap specs (`:132-143`).
- Pressure (`:313-319`).
- SKYLINE seed and layout (`:350-362`).
- `LIGHTS` aim and color, which rebuild light props (`:118-120`).

Everything else (ink, grading, volumetrics, sound, view model, HOLD poses, wall hand, CCTV ranges, thunder) is cosmetic.

**Options:**

| Option | Touches | Multiplayer bundle | Notes |
|---|---|---|---|
| 1. One session-mode flag read at boot; dev modules never constructed | `src/main.ts` only: about 35 lines (13 `build.` refs, 8 `debug.`, 14 `live.`, `window.game`); dev code moves to one new `src/dev/devtools.ts` | Still shipped | One `if` at boot; `dev?.update()` and `const building = dev?.building ?? false` replace scattered checks |
| 2. Vite env constant + dynamic `import()` | Same as option 1, plus `.env.multiplayer` and a `build:mp` script (no `vite.config` exists today) | About 1.7k lines dropped (build mode, history, grid, picker, spawn marker, panel, tuning, hints) | `if (import.meta.env.VITE_MP !== '1') import('./dev/devtools')` is replaced statically and tree-shaken |
| 3. Capability object passed to systems | 8+ files (Tools, BuildMode, DebugPanel, Settings, Pickups, Player, Input, main), about 25 checks | Shipped | Flexible (moderators), but scatters the checks you want to avoid |

**Recommendation:** option 1 implemented with option 2's mechanism.

- Move `BuildMode`, `DebugPanel`, the debug-only `live` hooks, the B and F3 handling and `window.game` into `src/dev/devtools.ts`.
- `main.ts` does `if (DEV_TOOLS) import('./dev/devtools').then((m) => (dev = m.install(ctx)))`, where `DEV_TOOLS = import.meta.env.VITE_MP !== '1' && !session.multiplayer`.
- One gate, tree-shaken in the multiplayer build, about 35 lines touched.
- Keep `applyPixelScale` and `rebuildCity` as plain functions in `main.ts`, because Settings uses them (`src/main.ts:45-49`).
- `pickups.editing` (`src/pickups/pickups.ts:34-35`) already models build mode as its own state, so it stays false in multiplayer and needs no other change.
- Bundle splitting is for size and clarity, not security. The server still validates everything (section 4).

**Freezing config in multiplayer:**

1. Split per-player settings out of shared objects:
   - `PLAYER` → `PLAYER` (physics, session) + `CONTROLS` (`mouseSensitivity`, `crouchToggle`).
   - `SKYLINE` → layout fields (session) + `CITY_VIEW` (`radius`, `clutterRange`, `lineRange`, `opacity`, `litWindows`; per player, which is fine once 2.1 is fixed).
   - `MARKER.radius` and `SPONGE.radius` → per-player tool state.
   - Today, Settings writes into `PAINT`, `SKYLINE`, `RENDER`, `ATMOS.rain`, `SMOKE`, `PLAYER.crouchToggle` and `AUDIO` (`src/settings.ts:75-84,150-163,168-178,227-276`).
2. `SessionConfig` = `PLAYER` physics, `CAPS`, `SPRAY`, `PRESSURE`, `MARKER`/`ROLLER`/`SPONGE` (minus current sizes), `DRIPS`, `PICKUP`, `STEPLADDER_PLACE`, SKYLINE layout, `LIGHTS`, and the level hash.
3. The server sends it in `Welcome`. The client `Object.assign`s it into those objects and **deep-freezes** them. ES modules are strict, so a stray write throws and shows up in testing instead of desyncing quietly.
4. The server keeps its own copy for validation. A config hash in `Welcome` catches mismatched builds.

### 6.3 Pickups

**Today:**

- **Spawned** from the level's `pickups: [{kind, pos}]` (`src/pickups/pickups.ts:12-15,98-101`).
- **Ids:** `nextId++` in load order (`:38,72`). Build-mode adds, removes and undo shift them (`src/build/buildmode.ts:269,283`; `src/build/history.ts:27-33`).
- **Collecting:** walking within `PICKUP.radius` (`:126-128`) calls `addColor`, `addCap` or `give(tool)` (`:133-143`; `src/inventory/inventory.ts:74-98`). If nothing is new it stays and toasts (`:136-138`). Otherwise `collected = true` hides it for good (`:140-141`).
- **Persistence: none.** `loadLevel` reloads the pickups and resets the inventory (`src/main.ts:137-138`). `toJSON` saves placements only (`:104-106`).
- **Build mode** shows everything and blocks collecting (`:34-35,108-111,125`).

**Stable id scheme.**

- Add `id: string` to `PickupData` and `PropData` in level format v3. Build mode assigns it on placement from a per-level counter stored in the JSON (`nextId`), and undo keeps it through `HistoryEntry.data`.
- v2 files fall back to the array index.
- On the wire, use a u16 index into the pickup table sorted by id, with a hash in `Welcome`.
- Ids are never reused, so saved progress survives level edits.

| | (a) Per player (personal) | (b) Shared (first collector unlocks for all) | Hybrid (colors personal, tools shared) |
|---|---|---|---|
| Authority | Server checks the claimant's last position is within radius + tolerance and that this player hasn't collected it | Server checks position and *first claim wins* (atomic set) | Per kind |
| Races and double collects | None between players; per-player idempotent set | Server orders claims; the loser gets `PickupCollected` and no grant | Shared kinds as in (b) |
| Sent | `PickupClaim` → `PickupGrant` to the claimant only | `PickupClaim` → `PickupCollected` broadcast; everyone's inventory gets the unlock | Both |
| Late joiner | Their own stored progress | The session's collected set; all shared unlocks granted at join | Both |
| Saving | Per (world, player) progress | Per-world collected set in the save | Both |
| Cheating risk | Low: only affects your own unlocks | Low–medium: a cheater unlocks for everyone | Mixed |
| UX for co-op graffiti | Everyone explores; pickups stay visible to those who haven't got them | Fast team progress, but explorers get "scooped"; a veteran joining unlocks everything for a newcomer | Exploring for colors is personal; team utility is shared. Note each player already owns a separate ladder (goal 6). |
| Code delta | Small: `collected` becomes a local set; Inventory is already per player | Medium: broadcast unlocks, toasts for others' finds | Medium |

**Decision: (a) personal pickups.** This matches the "personal loot" model of co-op games such as Diablo III and Borderlands 3's cooperation mode.

Because you also chose to trust both players (decision 4), pickups need **no network code at all**:

- Each client collects and hides pickups for itself, exactly as today (`src/pickups/pickups.ts:117-143`).
- The other player never sees which pickups you took.
- Stable pickup ids only matter if progress is ever saved. Under decision 6, saves hold paint only, so they can wait.

Decision 17: everyone enters a session with the starting kit and collects again (`inventory.reset()`, `src/main.ts:138`).

### 6.4 Saving the world and its paint

**Verified: no paint is persisted anywhere.**

- The only storage is settings and the open panel sections in `localStorage` (`src/settings.ts:180-198`; `src/debug/panel.ts:62-68,222-229`) and the level download (`src/build/io.ts:7-14`).
- Paint lives only in `PaintSurface.data` (`src/painting.ts:38`) and is discarded on level load (`src/level/level.ts:79-86`).

**What a paint save contains (format v1, decisions 6 and 8: paint only, no map, no ladders):**

```
header (JSON)
  format: "rhh-paint", version: 1, created
  level: { name, hash }        // which map it belongs to; the map itself is saved in build mode
  density: 96 in multiplayer (from the server), the player's own detail in single player
  faces: [{ surface: "p12#0", rect: 3, w, h, offset, length }]   // painted faces only, 1-texel ring included
body: face crops, RGBA + deflate
```

- Loading at another detail resamples each face (`src/paint-resample.ts:24-54`), the same path as a PAINT DETAIL change.
- Loading onto a different map (hash mismatch) is refused, with a toast naming the level the save belongs to.

- **Codec.** Use raw RGBA + deflate (`CompressionStream` in the browser, zlib in Node) or a JS PNG encoder. **Avoid canvas encoders.** Canvas and ImageBitmap paths premultiply alpha, which would lose the color of faint spray in straight-alpha paint data (UNVERIFIED per browser, but it's the documented canvas behavior).
- **Size estimate** (UNVERIFIED compression ratio, assuming 1–2 B per painted texel after deflate for sprayed paint, much less for flat roller or marker fills; demo face area about 6.7k m² for the modeled props, about 7.5k m² in total):

| Painted share | 48/m | 96/m |
|---|---|---|
| 10% | 2–3.5 MB | 7–14 MB |
| 25% | 4–9 MB | 17–35 MB |
| 100% | 17–35 MB | 70–140 MB |

  The server doesn't need to keep an op log: it applies ops to its in-memory paint as they arrive.

**Where it lives, and who owns it (decision 6).**

- **Single player:** the ESC menu's SAVE downloads a `.rhhpaint` file, and LOAD loads one into the current world (decision 18).
- **Session:** the server keeps the paint in memory only while the session is live. When the session ends or the server restarts, it's gone. No accounts, no database, no disk.
- **Keeping it:** any player presses SAVE during a session and gets the server's current paint at 96. Next time, the host uploads that file when hosting. That covers forks too: everyone can keep their own copy.
- **Crash safety:** none on the server, by design. Optionally, a client could autosave a local copy every few minutes (IndexedDB) so a server crash loses little; it's cheap to add later.
- **Encoding:** done by the server only on SAVE and on join, as a raw copy plus deflate in a `worker_threads` worker, so the relay never stalls.

**The save is the late-join snapshot.** `JoinSnapshot` and the SAVE file are the same bytes. The same `src/save/*` reader and writer run in the browser and in Node once the paint raster is pure (section 7, phase 1). Nothing is built twice.

**Should the save system be built before multiplayer? Yes, its core.**

1. It forces exactly the multiplayer prerequisites: stable surface, prop and pickup ids; face-local, detail-independent paint; and a recordable op layer. These are blockers 1–3.
2. It can be tested deterministically in single player, with no network flakiness. For example: paint, save, switch PAINT DETAIL, load, compare. That's the hard 6.1 problem, solved offline.
3. It fixes a real single-player gap today: paint is lost on every reload. Separately, the build-mode level save drops `skyline` (`src/level/level.ts:97-101`); that's a one-line fix.
4. The late-join snapshot *is* this format, so building it after networking would mean building it twice.

**Prerequisites for networking:** the format, face-crop save and resample, stable surface keys, the SAVE button in single player.

**Not needed under decision 6:** server storage, write-ahead logs, checkpoints, accounts, fork UI.

### 6.5 Will the rework change how paint looks?

**Where randomness enters the paint today.** Only here:

- spray direction, spread and per-dot amount (`src/spray/particles.ts:81,98,141`);
- sputter at low pressure (`src/spray/spray-tool.ts:91-92`);
- whether a run starts, and its length and speed (`src/painting.ts:323`; `src/paint-drips.ts:38,41`).

Everything that turns a hit into pixels is deterministic: dots, roller bands, blending and scrubbing (`src/painting.ts:210-304,383-403`).

**What the rework changes.**

- **The source of the random numbers, not their distribution.** A seeded generator gives the same uniform 0..1 values into the same formulas. A stroke today is already different every time you make it (`Math.random`), so a seeded stroke can't look different in style.
- **The path to a texel, not the texel.** UV → face position → texel round-trips to within about 1e-12 of a texel, so exactly the same texels are painted.
- **Nothing in the raster itself.** `dot`, `band`, `blend` and `toward` move to a pure file unchanged.

So the answer to "how dramatically" is: not at all, by construction. And it's checked, not assumed.

**Golden paint test (phase 0, before any refactor).**

1. Pass a random function into the paint path. It defaults to `Math.random`, so the game behaves exactly as today.
2. A script loads the demo level, seeds that function, and plays fixed camera paths for every tool: each cap, marker sizes, roller, sponge, drips on. It uses a fixed `dt` so frame timing doesn't matter, and runs at all four PAINT DETAILs.
3. It hashes every paint atlas and writes PNGs of a few faces for eyeballing.
4. **Every later step must reproduce the same hashes.** Where a step changes the order random numbers are drawn (drips becoming ops), it compares statistics instead (painted area per face, mean color, number and length of runs) plus the PNGs side by side.
5. It starts in headless Chromium (Playwright with the library workaround already known for this machine). Once the raster is pure, the same test runs in Node in about a second.

**What the other player sees.**

- Same detail as the painter: the same paint. The only exception is when both paint the same spot within about one round trip (tens of ms), where the overlap may blend in a different order on the two screens.
- Different detail: the other player's strokes drawn at their own detail. That's exactly how single player looks at that detail today (for example, the thinnest marker line is 4 cm on LOW).
- Paint made before joining arrives at 96, which is exact on ULTRA and averaged down on lower details.
- Drips: whoever painted decides; the other player sees the same run (length, speed, color), one texel wide at their own detail.

### 6.6 Should both players be forced to the same PAINT DETAIL and CITY DETAIL?

**CITY DETAIL: fix, don't force.**

- The city is decoration only: no colliders, no gameplay.
- Forcing one setting would make the cities match with no code, but it pushes weak machines to HIGH.
- The real fix (2.1) is small (S, about half a day) and also makes single player consistent. It can even wait: a different city never breaks anything.

**PAINT DETAIL: don't force; it saves about a day out of roughly three weeks.**

- **Forcing would let us skip:** the UV → face-position helper (~30 lines, worth keeping anyway for a stable save format), drip runs in meters (~20 lines), and resampling on join (the function already exists).
- **It wouldn't remove anything expensive:** stable surface keys, the paint-op layer, drips as events, ordering, the snapshot, the avatar, the server and the menu all stay.
- **It would push memory onto weak machines:** every player would pay the same (up to ~0.9 GB at ULTRA, 6.1).
- **In practice it rarely matters:** ULTRA is the default, so two typical players are both on ULTRA and see identical paint.

**A cheaper simplification that does help:** lock PAINT DETAIL while in a session, so a change applies when you leave. Changing it mid-session rebuilds every surface and resamples your own copy, which loses detail (`src/level/level.ts:136-145`). Locking it means no code to re-fetch the snapshot.

---

## 7. Work plan: phases, all tested in single player before networking

Single player stays the default and keeps build mode and F3. Multiplayer is entered from the ESC menu. Estimates are rough working days of focused work (UNVERIFIED). The avatar and the Node raster are the least certain.

**Phase 0: safety net (S, ~1 day).** Do this first; nothing visible changes.

- Pass a random function into the paint path.
- Write the golden paint test with baseline hashes at all four details (6.5).

**Phase 1: paint core, single player (M, ~3–4 days).** Golden hashes are checked after every step.

| # | Step | Scope | Files |
|---|---|---|---|
| 1 | Stable surface keys (owner key + paint index); `PaintSystem` lookup by key | S | `src/painting.ts`, `src/level/build-prop.ts`, `src/level/level.ts` |
| 2 | Per-player nib and patch size (out of `MARKER` / `SPONGE`) | S | `src/tools/wheel-size.ts`, `src/tools/tools.ts`, `src/tools/marker.ts`, `src/tools/sponge.ts`, `src/inventory/inventory.ts`, `src/debug/tuning.ts` |
| 3 | Face-position entry points `stampFace` / `rollFace`; tools convert `hit.uv` once | S | `src/surfaces.ts`, `src/painting.ts`, `src/spray/particles.ts`, `src/tools/marker.ts`, `src/tools/roller.ts`, `src/tools/sponge.ts` |
| 4 | Split `painting.ts` (403 lines) into `paint-raster.ts` (pure CPU) + `paint-gpu.ts` (textures, uploads); `paint-ops.ts` records and applies ops; drips become ops decided by the painter, runs in meters | M | `src/painting.ts`, `src/paint-drips.ts`, new `src/paint-ops.ts`, `src/spray/spray-tool.ts`, `src/main.ts` |
| 5 | Dirty rects per face | S | `paint-gpu.ts` |
| 6 | Font-independent small-sign widths | S | `src/render/ink/words.ts`, `src/kit/small-signs.ts` |

**Loopback test:** record ops while painting, replay them into a freshly loaded level. Same detail → identical hashes; another detail → matching statistics. This is the remote-paint path, proven without a network.

**Phase 2: SAVE in single player (S–M, ~2 days).**

- Paint save format and face-by-face resample on load (6.4).
- ESC menu: SAVE and LOAD (decision 18).
- Refuse a save made for another map.
- Fix the `skyline` drop in the build-mode level save.
- Test: save on ULTRA, load on LOW and back.

**Phase 3: multiplayer pieces, still offline (M, ~3–4 days).**

| Step | Scope | Files |
|---|---|---|
| Session mode + dev gate: B and F3 only in single player (6.2) | S | `src/main.ts`, new `src/dev/devtools.ts`, new `src/session.ts` |
| World sim keeps running while paused in a session | S | `src/main.ts`, `src/tools/tools.ts` |
| Ladders by owner, removed with their owner | S–M | `src/level/level.ts`, `src/tools/ladder-tool.ts` |
| Cube avatar: head, body, arms and legs as ink-gray boxes like the first-person hands; held tool from the pickup models; poses for walk, crouch, jump, climb, paint | M | new `src/avatar/*`, reuse `src/spray/hands.ts`, `src/pickups/visuals.ts` |
| Snapshot interpolation, tested with a "ghost": record your own play (state + ops) and play it back as a second player | S | new `src/net/remote-player.ts` |
| City determinism (optional, cosmetic). Done 2026-10-06: a seed per block, heights by distance (`SKYLINE.riseTo`), clutter range from the city's own settings | S | `src/city/layout.ts`, `src/city/rooftops.ts` |

**Phase 4: server and the MULTIPLAYER menu (M, ~4–5 days).** Planned in detail on 2026-10-08, on `feat/multiplayer`.

- **Server** (Node 24, `ws`, on the VPS behind Caddy for `wss://`, started by hand; `docs/deploy.md`):
  - session codes; op ordering;
  - in-memory paint at the session's detail (decision 2) through the same `paint-raster.ts` and pieces → faces in Node;
  - join snapshot, SAVE download;
  - names; a dropped player has 60 s to come back with their reconnect token, then their ladder goes; a session with no one left closes (section 8);
  - protocol and surface-table checks on `Host` / `Join` (section 4, Versions);
  - `/healthz`, an explicit `maxPayload`, paint memory logged per session (decision 9).
- **Client:**
  - **MULTIPLAYER → HOST:** name, PAINT DETAIL (locked for the session), "Upload a save?" (file / use my current paint / start clean), then shows the code.
  - **MULTIPLAYER → JOIN:** name, code, a loading screen until the full snapshot is in, then spawn.
  - In a session the ESC menu shows the code, SAVE, LEAVE. `?session` (the offline test mode from phase 3) goes.
  - Reconnects on its own; the reconnect token is kept in `sessionStorage`, so a reload within 60 s rejoins as the same player, and each tab is its own player.
  - Remote paint is played at its timestamps; the remote avatar has a nameplate.
  - Closes the items carried over in 7a (#3 player ids, #4 ladder `others`, #5 session menu, #6 locked detail and session config, #10 memory log).
- **Steps:**
  1. **Probe** (~0.5–1 day): bundle a Node entry with `vite build --ssr`, build the demo level's paint faces, apply recorded ops through `PaintRaster`, and compare hashes with the browser. It settles 7a #9. If the world doesn't build in Node at a sensible cost, the fallback is section 5's host-held paint.
  2. `src/net/protocol.ts`: the section 4 messages, with a Node test like `paint-file.test`.
  3. `server/`: sessions, relay, reconnects, `/healthz`; scripts `server` (watch) and `build:server`.
  4. Client network layer in place of the ghost's `SimLink`; Vite proxies `/ws` to the local server, so dev and prod use the same URL.
  5. MULTIPLAYER menu, session ESC menu.
  6. Join snapshot and SAVE from the server.
  7. A Playwright test with two pages against a local server (paint converges), in `npm run check`.
  8. Dockerfile, compose service, `docs/deploy.md`.
- **Test:** two Chrome windows side by side (e.g. a normal and an incognito one) against a local server, then the VPS. Windows, not tabs in one window: a background tab draws no frames, so it sends no state (7a #2).

**Total:** roughly 13–17 working days.

**How to start:** phase 0. It costs a day, changes nothing you can see, and from then on every step proves the paint still looks exactly the same.

---

## 7a. Status after phases 0–3 (2026-10-06)

Phases 0–3 are done on `feat/multiplayer`: every step in section 7 through phase 3, each with a test (`npm run check`, `npm run golden`). Same paint as before every refactor (golden hashes at all four details).

**Reviewed and fixed at the end of phase 3:**

- A remote player's interpolation delay adapts to measured jitter (`NET.jitterCover`, up to `maxDelay`), the usual "jitter buffer" sizing, instead of a fixed 0.13 s.
- A guess past a late snapshot (extrapolation, at most 0.25 s, as Source does) used to snap back when the real snapshot came; the difference now fades out (`NET.smoothing`), a teleport still snaps. Tested with resent packets (`GHOST.hiccups`).
- Snapshots received while no frames are drawn (a hidden tab) are capped at the newest 64.
- The avatar's in-air pose waits 0.18 s (or a jump up): stepping down a stair no longer flashes the jump pose.
- A ghost PLAY pressed during a loop restart no longer runs two loops.

**Carried into phase 4 (not bugs today; they need the server or the menu):**

| # | Item | Why it matters | Plan |
|---|---|---|---|
| 1 | Paint order differs per client | Each client applies its own ops at once and others' a moment later, so where two players' strokes overlap, blending order differs (alpha blending isn't commutative): tiny differences in overlaps | The server's order is canonical; it hands a joiner its paint. Optionally compare per-face hashes now and then and pull faces that differ |
| 2 | Hidden tab | No frames, so no snapshots go out: others see you stand (extrapolation stops) | Fine; on return, queued paint ops apply at once |
| 3 | `session.player` is `'local'` | Owner keys must be unique per player | The server hands out player ids in `Welcome` |
| 4 | `LadderTool.others` is only wired to the ghost | A ladder could be placed inside a real remote player | Point it at the remote players' positions |
| 5 | SAVE / LOAD PAINT in a session | LOAD would replace only this client's paint | The session menu: SAVE, LEAVE, the code (section 7) |
| 6 | PAINT DETAIL and F3-free config in a session | 6.2 and section 8.1 | Lock PAINT DETAIL in a session; freeze session config from `Welcome` |
| 7 | Snapshot time is float32 seconds | 2 ms steps after 8 hours | Fine; or session-relative time from the server |
| 8 | TCP head-of-line blocking | WebSocket: one lost packet holds the ones behind it (the ghost's hiccups model it) | Smoothing and the adaptive delay hide it for two players; WebTransport datagrams (Chrome) would remove it if needed |
| 9 | Headless world build for the server | Section 1, blocker 9 | Phase 4: pieces → paint faces in Node |
| 10 | Paint memory at full ULTRA | Section 1, blocker 8 | Log paint memory per session (decision 9) |

**Research behind the network choices** (2026-10-06): snapshot interpolation renders remote players slightly in the past between two snapshots ([Valve: Source multiplayer networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking): 100 ms, extrapolation for at most 0.25 s); size the buffer to two snapshot intervals plus measured jitter and adapt it ([Unity Netcode: interpolation](https://docs.unity3d.com/Packages/com.unity.netcode@1.8/manual/interpolation.html), [bugnet: buffer too small stutter](https://bugnet.io/blog/how-to-fix-snapshot-interpolation-buffer-too-small-stutter)); over TCP one lost packet stalls the rest ([WebTransport for games](https://minhvo.is-a.dev/blogs/webtransport-low-latency-communication-for-games-and-media)); a walk cycle phased by distance keeps feet from sliding ([Vulkan tutorial: procedural animation](https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/07_conclusion.html)); collaborative canvases converge through a central order or CRDTs ([techinterview: collaborative whiteboard](https://techinterview.org/system-design-collaborative-whiteboard/)); background tabs stop rAF but not WebSockets ([Chrome: background tabs](https://developer.chrome.com/blog/background_tabs)).

## 8. Still open

Everything asked so far is answered in section 0. These three were settled on 2026-10-08:

1. **PAINT DETAIL during a session.** Decided 2026-10-08: the host picks PAINT DETAIL on HOST (one of the settings' four), and it's locked for the session. The server's paint follows it (decision 2, replaced). This goes further than 6.6 (lock only).
2. **Reconnects.** Decided 2026-10-08: a dropped player has 60 s to come back. After that their ladder is removed, and a session with no one connected is closed. A session with someone still connected continues (decision 16).
3. **Names.** Decided 2026-10-08: yes, a name is asked on HOST and JOIN and shown as a nameplate.
