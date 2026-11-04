# Paint refactoring: the can as a brush

A handoff for the agent who brings this into the game. It says what was tried,
what the player liked, and what is left to decide. It doesn't say how to
write the code: read the branch.

- Status: ported by hand, module by module, into `test/paint-rework` (table below); what follows on
  the branch and the sandbox is how it started.
- Branch: `exp/painting-rework` (from `dev`), on origin. R&D only, not for merging as is: the architecture was bent
  on purpose, tests were neither run nor updated, settings live in a sandbox
  object, not in `config.ts`. See it with `git log dev..exp/painting-rework`
  and `git diff dev...exp/painting-rework`; try it with
  `git switch exp/painting-rework && npm run dev`, panel on Z.
- Backlog: the "Painting Rework" items, IDEA-225 to TASK-232 and IDEA-166, planned for
  1.7.0 (see "Backlog items" below). Network load also touches BL-024.
- Code: `src/sandbox/` (`feel.ts` settings and the distance model, `brush.ts`
  the brush, `aim.ts` the crosshair, `panel.ts` the Z panel, `mist.ts` the
  spray plume), plus hooks in `src/spray/spray-tool.ts`,
  `src/spray/particles.ts` (the plume), `src/paint-raster.ts` (elliptic dots,
  puddle cells), `src/paint-drips.ts` (runs by place), `src/painting.ts`,
  `src/paint-ops.ts`, `src/tools/tools.ts`, `src/config.ts` (`DRIPS.cell`,
  tools' wetness), and F3 (`src/debug/paint-sections.ts`, `hint-text.ts`,
  `src/dev/wet-view.ts`).
- The owner's verdict (2026-10-24): "everything got much better; this is
  exactly the painting I wanted for the game". The continuous stroke,
  opacity and layers, speed and distance, and the crosshair all count. Keep
  that feel; everything else is negotiable.
- Facts vs estimates: the owner's answers are marked "Owner:"; network
  numbers and anything "read in the code" are estimates, not measured.

## The goal

Spraying should feel like a drawing app (Procreate) and a real can at once:

- A continuous stroke, no gaps however fast the hand moves.
- Opacity as a first-class control: layers add up, you can build a fade.
- The can's physics: the same paint per second, so speed and distance change
  the line's width, density and edge, as with a real can.
- The crosshair tells the truth: the line's real size and the opacity.

## Backlog items

The rework is split by module. Each item replaces older ones (now in the
backlog's Discarder):

| Item | Painting Rework: | Modules | Replaces |
|---|---|---|---|
| IDEA-225 | the can as a continuous brush | 1, 3, 4 | IDEA-224 |
| IDEA-226 | opacity on Shift + wheel, smooth alpha | 2 | IDEA-165, BL-152 |
| IDEA-227 | the can's physics: hand speed and distance | 5, 6 | |
| IDEA-228 | a true-size crosshair | 7 | |
| IDEA-229 | SOFT and HARD caps, every cap tuned with the brush | 8 | IDEA-167, BL-017 |
| TASK-230 | paint runs with the brush (measured: the 1.5.0 runs don't fit it) | 13, known issues | BL-016 |
| TASK-231 | network: ops/s, slant on the wire, stroke-segment op | 9, network steps 1-3 | |
| TASK-232 | to production: config, no particle painting, decisions, tests | 10, 11, steps 4-5, open decisions | |
| IDEA-166 | lock the camera while painting (unconfirmed) | not in the branch | |

TASK-230 (paint runs): owner (2026-10-25): the marker runs a lot, the can
hardly ever, even held still. Measured, the earlier read of the code was
wrong: the 1.5.0 runs don't fit the brush.

Runs since 1.5.0: paint dries (`DRIPS.dryTime`, 3 s). Paint landing on an
already opaque texel is wet; once a texel holds `DRIPS.excess` coats of wet
paint it may run (a chance per m², each cap's and tool's `drips`), and the
paint that ran is gone. Cap drips 2, 4, 6 were tuned in 1.5.0 for particles.

Measured on fixed steps (5 s, 1 m from the wall, standard cap held still):
particles 17 runs, the brush 0. The brush lays 25-50× less paint than the
particles did (they piled paint on paint), so wet paint rarely builds up and
the per-m² chance almost never fires. The marker is unchanged (7 runs in 5 s
of strokes); it only stood out. A ×30 on the caps' chance brought the can
back to 1.5.0's numbers; module 13 (puddle runs) replaces that.

Until module 7 (2026-11-04): the caps' `drips` are the old ones ×30 (skinny 60,
standard 120, fat 180; spray stays 50), the stopgap measured above: 5 s held at
1 m gives 1, 6, 10 and 6 runs. Only numbers, no code; module 7 replaces them.

Marker nibs (IDEA-233, merged into BL-039 on 2026-11-02): the can's nibs
(chisel, needle) were tried on the branch and removed; marker nibs are a
separate idea, not started.

IDEA-166 (lock the camera): an idea from before the branch, not started.

Owner (2026-11-04): IDEA-166 is off 1.7.0, still unconfirmed (`?`).

## Modules kept

### 1. Brush (continuous stroke)

Paint lands at once where the aim meets the wall, not where particles land.
Between the last frame's point and this one, dabs are laid every fraction of
the dab's radius, each cast from the eye on its own, so a fast flick has no
gaps and turns corners and edges. Particles still fly, but only for show
(AGENTS.md already says they are visual only).

Why: particles land late and sparse; a fast stroke left dotted gaps.

Owner: particles stay in the game, for show only; the brush paints. How they look is module 12 (optional).

### 2. Pressure / opacity (Shift + wheel)

One pass of a stroke reaches about the set opacity along its middle, whatever
the dab spacing and edge (the per-dab amount is solved from it). Passes add
up, so a second pass darkens. Default 0.65.

Lesson: a "stroke takes the max of its dabs" mode was tried for evenness and
rejected; strokes no longer layered and the far spray died. Accumulation is
what makes it feel like paint.

Smooth alpha: `PAINT.alphaSteps = 0`, smooth opacity instead of the ink
style's 8 steps, which band semi-transparent strokes badly. Owner: keep
smooth in the game. It is global: every tool's paint, not only the can's.

### 3. Build-up when held still

Held still, dabs keep landing at a set rate (airbrush): the spot darkens and
then runs. Default 60 dabs/s.

### 4. Streamline

The brush trails the aim slightly (exponential smoothing). Takes mouse jitter
out of lines. Default 0.25. Owner: the lag isn't noticeable, 0.25 is fine.

### 5. Hand speed

Above a reference speed (m/s over the wall) the can's paint per second holds,
so per meter of line it thins, and the line also widens and softens. Slow is
dense and crisp, fast is light, wide and soft. Defaults: from 2.4 m/s,
lighter 0.4, wider 0.7, softer 0.8.

Lessons: an early speed-independent brush lost the real-can feel and the
owner asked for it back. Strokes started too dense while the speed was
smoothed up from zero: the first move now sets the speed at once.

### 6. Distance

- A gap (0.6 m): up to it from the wall, the can acts as close up (narrow,
  precise). The distance model starts past the gap.
- Close: narrow, harder, more paint (1.8×), runs more (4×).
- Far (up to 2.5 m past the gap): wide (spot ×2.2), soft.
- Opacity fades a little with distance, never below 75%.

### 7. Crosshair

Owner (2026-11-04): the game's own crosshair stays (`.crosshair`, its
`mix-blend-mode: difference` turns it light on dark and dark on light) and only
its size follows the line; the branch's element isn't ported. An opacity arc
is added to it, perhaps a half arc at its side. Unconfirmed idea, compared with
the arc in module 4: a gauge on the first-person can itself, a slot filled up to
the pressure, perhaps in the paint's color. What the branch's crosshair showed:

- Its size is the line the paint will leave right now (distance, cap, edge,
  hand speed, opacity): out to where the stroke is half as dense as in its
  middle. A soft edge reads narrower than the dab's full reach. Owner: real
  size always in the game; drop the toggle and the old 12-40 px clamp.
- The arc is the opacity; the middle dot is as dense as one pass.
- Red when close enough to run: dropped (owner, 2026-11-04).
- Optional: the distance to the wall as text (owner: dev only, not for
  players). The outer ring for how far the softest paint reaches: dropped
  (owner, 2026-11-04).

Owner: barely visible, like the game's own crosshair.

### 8. SOFT and HARD caps

Two new caps: a soft-edged medium one and a crisp narrow one. The cap's
softness scales the brush's edge (standard is the reference), so caps feel
different at any distance.

Owner (2026-11-04, later the same day): the four caps of today stay as they are,
tuned by hand: their numbers don't change. Two new ones come beside them.

| Cap | Line at 0.5 / 1.5 / 3 m, cm | What it is | Body, dot |
|---|---|---|---|
| SKINNY (today's) | 2.0 / 4.2 / 8.1 | | cream, dark |
| BANANA (`standard`, today's) | 2.8 / 6.8 / 11.4 | | yellow, dark |
| NY FAT (`fat`, today's) | 6.7 / 14.6 / 28.2 | | white, dark |
| ASTRO FAT (`spray`, today's) | 9.0 / 20.3 / 35.2 | | gray-white, dark |
| NEEDLE | 1.7 / 3.5 / 6.9 | thinner than SKINNY, as the default marker at 1.5 m | red, its nozzle a thin white tube toward the wall |
| BLUE DOT (`soft`) | 2.7 / 5.7 / 10.9 | `standard` with the softest edge | gray, blue |

Owner's choice (2026-11-04): these six ship. A HARD cap and a middle soft one were
tried and dropped: BANANA keeps the clean line, BLUE DOT is the softest. A flat nib
(TRANSVERSAL) worked but is not the can's: its code stays commented out for the
marker, a later version (IDEA-336).

Every cap gets a dot color (`CapSpec`; the nozzle, seen on pickups). A flat nib, as
tried: a fixed ellipse at 45° from the wall's horizon, going as a stamp's `slant`, so
no protocol change, in place of the wall's angle; a rectangle for a crosshair and a
flat fan for a plume.

The table below came first and is what the names came from:

Before that (2026-11-04): the caps take real caps' names, six in all, thin to wide.
Ids stay simple: a player reads `CapSpec.name`, saves, maps and stats keep the id.

| Player sees | Id | Real cap | Its line |
|---|---|---|---|
| NEEDLE | `needle` (new) | needle cap | 0.4-1.2 cm |
| SKINNY | `skinny` | skinny cap | 0.5-3 cm |
| BANANA | `standard` | banana outline | 1-4 cm, clean; the starting cap, in place of HARD |
| BLUE DOT | `soft` (new) | Blue Dot soft cap | 1-4.5 cm, soft and dusty |
| NY FAT | `fat` | NY fat | wide, sources differ |
| SPRAY | `spray` | nearest: Astro Fat, ~12 cm | the game's widest, light |

Widths are shop and guide figures, by brand and distance. A line is never
thinner than a texel: NEEDLE is about 1 cm at ULTRA, and at LOW (4 cm) little
different from SKINNY. It stays clean: no spatter. Places of the two new
pickups on the maps: asked in module 6. Pickup labels (`src/pickups/labels.ts`)
and each cap's `color` follow the names.

### 9. Slant

Hitting the wall at an angle stretches the dab into an ellipse along the aim,
fading at the far end. Stamp ops carry a `slant` (stretch, turn, tail), three
bytes on the wire behind a flag, so other players see what the painter painted.

Measured in module 5, one pass at 3 m, 65%, the standard cap (head on 0.50, 10 cm):

| Angle | Line along the aim | Line across the aim |
|---|---|---|
| 30° | 0.55 | 0.50, 13 cm |
| 60° | 0.73 | 0.50, 22 cm |
| 75° | 0.91 | 0.50, 40 cm |

As the sandbox had it: dabs overlap more along the aim, so that line darkens.
Thinning a dab as it stretches was tried in F3; owner (2026-11-04): stays as is.

Owner: important, in 1.7.0, protocol bump included (step 2 below is required).

### 10. Endless pressure, everything unlocked

Sandbox conveniences that change the game beyond painting:

- The can never loses pressure. Owner (2026-11-04): pressure that runs out goes
  for one the player sets with Shift + wheel. Shaking stays on RMB as an
  animation and its sound, doing nothing to the paint, perhaps an idle
  animation later. Going: drain (`cap.drain`), thinning, sputter, the low
  pressure warning, the tutorial's line on shaking.
- All tools, colors and caps unlocked from the start. Owner: a dev
  convenience only (instead of F3 → Unlock all items each time); the game
  keeps pickups as now. Don't ship it.

### 11. Z panel (optional)

Owner (2026-11-04): its settings move to F3, and the panel goes.
A lil-gui panel (Z) in Russian with hover tips. Colored dots show scope: every
cap alike, scaled per cap, cap in hand only, particles only. There are copy-all
(JSON to paste back) and reset. It's a dev tool; in production its settings
belong in `config.ts`, perhaps the F3 debug panel. The goal for that panel
(TASK-232): it shows which setting causes what, so tuning is systematic, not
trial and error.

### 12. Spray plume

Module 9. With the brush painting, particles are only a plume at the nozzle:
fine soft round specks in a cone toward the aim, slowed by the air, growing and
fading out before the wall (never past it). One ray at most per frame for the whole
plume, one draw call. Others' cans show the same plume. The old square points
are gone. Owner (2026-11-04): it follows the cap: `spray/plume.ts` makes a cap's
cone, specks and haze from its spread, dot and softness (BANANA's are the
sandbox's numbers), F3 scales each.

Tried first and replaced: a mist of specks flying to the wall and hanging
there a moment. Owner: too few, too fast, and no haze at the brush wanted.

### 13. Puddle runs (optional, unconfirmed)

Owner (2026-11-04): not to be copied as it is; talked over in module 7. On the
branch runs got more right but are far from ideal; today the marker's are good,
the can's so-so. What the branch does: paint runs by how much paint landed, not
by chance, so they are predictable:

- Extra paint (landing on already opaque paint) pools in square cells about
  3 cm wide (`DRIPS.cell`), spread over the cell, and dries as before.
- A cell that holds `DRIPS.excess` (6) coats on average runs, always, from
  the texel that tipped it, and the paint that ran is gone. If a run can't
  start yet (too many, one in that column), it starts once it can.
- A run's length and speed come from where it starts (a hash of the face
  point), so the same spot runs the same way. Runs still travel as drip ops:
  no protocol change.
- Each tool has a wetness, the share of its extra paint that pools (its
  `drips`): caps 1 (0 never runs), marker 0.4 (its stamps overlap 3×; at 1
  it made 148 runs in 5 s of strokes), roller 1.
- Knobs: extra coats per run, drying time, puddle size, wetness per tool.
  The chance knobs are gone (per-cap chance, the ×30, close up ×4): close up,
  the brush lays more paint, so it runs more by itself.

Measured, the same every time (5 s, 1 m from the wall): standard held 14 runs,
first after 0.77 s; fat held 70 (0.63 s); skinny held 3 (1.52 s); standard
strokes 23; marker strokes 19, held 2. From 2-3 m the brush lays too thin a
coat to outpace drying and doesn't run at all.

In production: the golden paint test's run hashes will change; the wet view
(F3) now shows cells.

## Tried and removed

- Living pigment (wet gloss, glow, chroma bloom). Disliked.
- Concrete tooth (paint catching the wall's relief). Disliked, walls stay.
- Overspray dust, spatter drops, a spit at press start, a hiss tail after
  release. Set to 0, then removed: noise, not feel.
- Nibs (chisel, needle on X). Removed.
- A rounded bead at a run's end. Removed.
- A crosshair laid on the wall as an ellipse. Reverted: with slant on, the
  stretched dab projects back to a near circle, so it showed almost nothing.
- A separate wall reticle next to the screen crosshair. Merged into one.

## Taking it to production

### Performance

The core rule holds: paint is still baked into the surface atlases and only
dirty rects upload. No objects per stroke. A frame costs the same however
much is painted. Owner: no lag seen in play (not measured). What scales is CPU rastering of
incoming ops, by how many people paint now, as before.

Measured 2026-11-04 (below): the fastest stroke costs 3.3 ms of tool time on
average, a ray 40 µs on the roof (168 meshes near the player). No BVH needed.

### Measured (2026-11-04)

`dev` e0ce90a against the branch de4d1f4 on fixed 60 Hz steps, in the browser
at ULTRA on the demo level, nothing drawn: the same 2 s sweeps along a wall.
Ops/s, what they send, and the tool's mean frame time:

| Cap, distance | Today | Held | 1 m/s | 2.4 m/s | 6 m/s | 12 m/s |
|---|---|---|---|---|---|---|
| skinny, 1 m | 1900, 43 KB/s, 1.3-1.8 ms | 60 | 338 | 776 | 1740 | 3102, 71 KB/s, 3.2 ms |
| standard, 1 m | 1760, 40 KB/s, 1.2 ms | 60 | 226 | 513 | 1152 | 2032, 47 KB/s, 1.7 ms |
| fat, 1 m | 650, 15 KB/s, 0.5 ms | 60 | 119 | 259 | 558 | 967, 23 KB/s, 1.2 ms |
| spray, 1 m | 1100, 25 KB/s, 0.9 ms | 60 | 109 | 174 | 387 | 667, 16 KB/s, 1.1 ms |
| skinny, 0.6 m | 1900, 43 KB/s | 60 | 353 | 808 | 1798 | 3061, 69 KB/s |

- Up to about 5 m/s the brush is lighter than today's particles on every cap;
  above it skinny, standard and fat can pass today's rate, spray doesn't.
  Today's ~1760 ops/s holds for spraying a wall without a pause.
- Slowest frame of the tool: 7.9 ms (skinny, 12 m/s, 0.6 m), today's 10.6 ms;
  at most 64 dabs in a frame, so `MAX_DABS` (160) was never reached.
- Uploads stay small: 5.6k texels a frame on average at most (spray, far, fast).
- Hand speed depends on the frame rate. Read for a true 1 m/s with the spray
  cap at 2.4 m: 1.91 m/s at 60 Hz, 3.62 at 144, 5.49 at 240. The brush must take
  it from last frame's point, not the last dab's. The owner tuned the feel at
  60 Hz, so the defaults stand.

Module 1 on `feat/paint-brush`, the same strokes (ops/s, KB/s, mean tool ms):
at 12 m/s skinny 1832, 41, 2.0; standard 1810, 41, 2.1; fat 930, 21, 0.9; spray
625, 14, 0.8. Slowest frame of the tool 11.5 ms (today's 10.6), 19.2 once, on
the first stroke of the page. Held 60 ops/s, 1.3 KB/s, 0.2 ms. The fastest
stroke sends at most 41 KB/s, under today's 43; fat (930 against 650) and
standard (1810 against 1760) pass their own rate only above about 8 and 12 m/s.

Read again in module 5 (`npm run study:load 40`, stamps at stretch 1.3, against
round ones): typical play CPU 38% and 38%, ops down 37.8 KB/s against 33.8;
heavy play CPU 74% against 66%, ping p99 8 ms against 4, 386 KB/s against 346,
no one dropped. In the golden strokes 93% of the can's stamps are slanted, so a
real stroke costs 26 bytes a stamp, not 23: about 12% more traffic. The load
passes: no stroke-segment op.

The agent's call on step 3: no stroke-segment op in 1.7.0. Per-dab stamps stay,
with the dab spacing held to at least half a texel, so a small cap's flick
doesn't pass today's rate (3 mm is under a third of a texel at ULTRA). The load
is read again in plan module 5; if it fails there, the op is back on the table.

### Network (20 players)

A stamp op is 23 bytes (26 at a slant, module 5). Estimates from the code, made before the measurements
above:

| | Ops/s per painter | Up | Down, 19 painting |
|---|---|---|---|
| Today (particles: every landed one is an op) | ~1760 | ~40 KB/s | ~760 KB/s |
| Brush, per-dab ops | 40 still, ~60 far, 300-1000 close and fast | 1-23 KB/s | 20-440 KB/s |
| Brush, one op per stroke segment | ~60 | ~2 KB/s | ~35 KB/s |

The brush is already no heavier than today's particles. Speed, streamline and
build-up are decided by the painter and travel as plain op values, so replay
stays bit-exact. Server and joiner snapshots are rasters, so they don't grow
with the op count.

### Steps, rough size

1. Measure real ops/s, brush vs particles, on the same stroke. Done, above.
2. Put the slant shape on the wire (+3 bytes). That's a protocol bump:
   clients and server ship together. ~half a day.
3. Optional, the big win: a stroke-segment op (A to B on one surface; every
   client lays the dabs). Split at surface edges. Cuts traffic 5-15×. 2-3 days.
   Decided after step 1: not in 1.7.0 (see Measured).
4. Move settings to `config.ts`. Drop particle painting (the brush paints,
   particles show). Keep only what's used. ~1 day.
5. Golden paint tests and multiplayer tests will change: update them. ~1 day.

### Known issues

- Fixed in module 1: slow lines come out the same at every frame rate. Dabs
  go exactly a spacing apart, the rest carried to the next frame, and the can
  lays at least `BRUSH.buildRate` dabs a second, a line's own counting.
- Fixed in module 2: a dab's falloff means `1 - s / 3` across it, so every cap's
  pass at 3 m reaches the same 0.50-0.53 at 65% (the fade takes the rest).
- Fixed in module 2: a coat under `PAINT.faintest` leaves a texel as it is, so a
  dab's far rim keeps no 8-bit step. Measured: the halo was 0.4% alpha at the rim.
- Fixed in module 2: with Shift held, a sideways wheel event counts as a step.
- The set opacity is what a pass reaches at the far end of the close range: at
  1.5 m a 65% pass reaches 92% (`BRUSH.closeFlow`), at 3 m 50%. Module 4's arc
  has to say which one it shows.
- Dabs near a face edge are clipped to their face. Check corners and seams.
- Fixed in module 1: the minimum spacing is `BRUSH.minSpacing` (5.2 mm, half a
  texel at ULTRA, in meters so every PAINT DETAIL sends alike), and a dab's
  amount comes from the real spacing, so small caps keep the set opacity.
- `package-lock.json` wasn't updated for lil-gui (devDependency): `npm ci`
  fails on the branch.

### Plan (2026-11-04)

One module at a time on its topic branch, each with `npm run check` and the
owner's in-game test. Paint reaches `next` after 1.6.2 is released.

Owner (2026-11-04): modules merge into `test/paint-rework`, not `dev`: a temporary
branch from `dev`, where the owner tests them together. Each module's topic
branch starts from it. It holds one test-only change, `ALL_PAINT` in
`src/inventory/inventory.ts` (every color and cap from the start, in `npm run dev`
only): cut it before the branch reaches `dev`, on the owner's word.

| # | Module | Items |
|---|---|---|
| 1 | Done on `feat/paint-brush`. Brush: dabs between frames, build-up, streamline, hand speed and distance, a test at 60, 144 and 240 Hz; the old particles only for show | IDEA-225, IDEA-227 |
| 2 | Done on `feat/paint-opacity`. Opacity: Run + the color keys on the can only (Shift + wheel by default, both wheel axes; a key holds one action, so no action of its own, and Controls says so); step 10% in config, 5-100%, 65% by default, kept in the local settings, never on the wire; smooth alpha; pressure no longer runs out, the PSI gauge shows the setting until module 4; one tutorial hint | IDEA-226 |
| 3 | In module 1 (one function sizes a dab; its number stays free so the others keep theirs) | |
| 4 | Done on `feat/paint-crosshair`. The game's crosshair sized to the line (`lineWidth`), no PSI gauge, one ray a frame shared with the brush. The opacity: a 120° arc on the crosshair's right, the percent beside it for a moment after a change. A sight glass on the can was tried against the arc: owner chose the arc | IDEA-228 |
| 5 | Done on `feat/paint-slant-wire`. The sandbox's slant ported (it was never in the game) and put on the wire: protocol 12, 3 bytes behind a flag, rounded like an op's other numbers; seams; the load read again | TASK-231 |
| 6 | Done on `feat/paint-caps`. Today's four caps as they are, with real names, colors and a dot on each; NEEDLE and BLUE DOT new, on the roof. Beside it: the can's crosshair fades where the paint wouldn't land, how faint in F3 (Cursor) | IDEA-229, IDEA-337 |
| 9 | Done on `feat/spray-plume`. Spray plume from the sandbox's, then by the cap (cone, specks, haze); the old square points gone | |
| 8 | Done on `feat/paint-audit`. Dead code, three reviews, load and client measures against 1.6.2 (`docs/known-limits.md`), docs; found: a slow line's backlog under 60 fps, plumes blanked in a crowd | TASK-232 |
| | The owner tests and thinks about paint runs | |
| 7 | Paint runs: the design talked over first, the marker's kept as they are if nothing asks otherwise; then `ALL_PAINT` cut and this doc gone | TASK-230 |

Order (owner, 2026-11-04): 6, 9, 8, a pause, 7.

Bar for all of it (owner, 2026-11-04): this is the game's core feature, so
robust, modular, typed, testable code. What doesn't fit the architecture and
needs an exception, a flag or a special case is talked over with the owner
first. Nothing is ported from `src/sandbox` as it is: no `FEEL.on`, no old and
new mode side by side; painting by particles is deleted, not turned off.

Simple here means a good design: the same behavior from shorter, cleaner code
that is easy to maintain and extend, and a hard thing explained in plain words.
It doesn't mean the shortest function. Performance comes first.

At the end of each module, the agent reports to the owner in plain technical
words: what was done, why this design and not another, what it costs in
performance (measured), and every place that left the architecture or looks
hacky, with the reason. Nothing of that kind stays unsaid.

Module 1's shape, a sketch that may change:

| File | Does | Checked by |
|---|---|---|
| `src/spray/dab.ts` | Pure: a dab's size, edge and density from cap, distance and speed | Node tests |
| `src/spray/stroke.ts` | A stroke's state: smoothing, hand speed, where dabs go | Node tests with a fake wall, at 60, 144 and 240 Hz |
| `src/spray/wall-probe.ts` | Finds the wall along a ray | Game tests |
| `src/spray/brush.ts` | Joins stroke, probe and `PaintSystem` | Game tests, golden |
| `src/spray/particles.ts` | Only shows particles | Game tests |

Settings in `BRUSH` in `config.ts`, each with its F3 row. Classes where there is
state; the stroke gets the probe and the painting through small typed
interfaces, so its logic runs without a browser.

Found in the branch, to fix on the way:

- Fixed in module 5: a slanted dab's seams. `pastEdge` takes its length, and the
  neighbor face gets the turn in its own axes (`turnOnto`).
- Fixed in module 5: `rounded()` rounds the slant, so painter and others agree.
- Fixed in module 5: a slanted dab walks the box around its ellipse, not a
  square of its length. At the longest and on a diagonal 5.7× a round dab's
  time, where the square was 16×; along an axis 4×.
- `wetCell()` makes an object per wet texel, in the branch only (module 7).

### Open decisions (the owner's)

Still open:

- How paint runs work with the brush: module 7.

Decided (2026-11-04): the opacity shows on an arc at the crosshair, as set, not as dense as it lands at this distance; no gauge on the can. The line reads wider at a higher opacity (saturation, not a rule of its own): kept.

Decided (2026-11-04): pressure the player sets replaces pressure that runs
out; shaking stays as an animation only; no PSI gauge; opacity on the can only;
the game's crosshair stays; no red crosshair; no softness ring; six caps with
real names; settings in `config.ts` and F3,
no Z panel; the owner's screen is 1920x1080 at 60 Hz.

Decided (2026-10-24): smooth alpha stays; unlock-all is dev only; the
crosshair is real size always; SOFT and HARD ship as pickup caps; slant goes
on the wire in 1.7.0; particles stay for show.

### Ideas not built

- A hiss that follows speed, distance and pressure.
