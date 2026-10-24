# Paint refactoring: the can as a brush

A handoff for the agent who brings this into the game. It says what was tried,
what the player liked, and what is left to decide. It doesn't say how to
write the code: read the branch.

- Branch: `exp/painting-rework` (from `dev`), local on the owner's machine
  (not on origin; ask for it to be pushed if you can't see it). Only this
  doc is on `dev`. R&D only, not for merging as is: the architecture was bent
  on purpose, tests were neither run nor updated, settings live in a sandbox
  object, not in `config.ts`. See it with `git log dev..exp/painting-rework`
  and `git diff dev...exp/painting-rework`; try it with
  `git switch exp/painting-rework && npm run dev`, panel on Z.
- Backlog: the "Painting Rework" items, IDEA-225 to IDEA-233 and IDEA-166, planned for
  1.7.0 (see "Backlog items" below). Network load also touches BL-024.
- Code: `src/sandbox/` (`feel.ts` settings and the distance model, `brush.ts`
  the brush, `aim.ts` the crosshair, `panel.ts` the Z panel), plus hooks in
  `src/spray/spray-tool.ts`, `src/spray/particles.ts`, `src/paint-raster.ts`
  (elliptic dots), `src/painting.ts`, `src/paint-ops.ts`, `src/tools/tools.ts`.
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
| IDEA-226 | opacity on Shift + wheel | 2 | IDEA-165, BL-152 |
| IDEA-227 | the can's physics: hand speed and distance | 5, 6 | |
| IDEA-228 | a true-size crosshair | 7 | |
| IDEA-229 | SOFT and HARD caps, every cap tuned with the brush | 8 | IDEA-167, BL-017 |
| TASK-230 | check that paint runs still work with the brush | known issues | BL-016 |
| TASK-231 | network: ops/s, slant on the wire, stroke-segment op | 9, network steps 1-3 | |
| TASK-232 | to production: config, no particle painting, decisions, tests | 10, 11, steps 4-5, open decisions | |
| IDEA-233 | marker nibs, rectangular and calligraphy (unconfirmed) | not in the branch | BL-042 |
| IDEA-166 | lock the camera while painting (unconfirmed) | not in the branch | |

TASK-230 (paint runs): the owner is happy with how runs work now: with the
brush the can runs much less and it feels right. What's left is checking
that the runs model and the brush fit, not retuning.

Runs since 1.5.0: paint dries (`DRIPS.dryTime`, 3 s). Paint landing on an
already opaque texel is wet; once a texel holds `DRIPS.excess` coats of wet
paint it may run (a chance per m², each cap's and tool's `drips`), and the
paint that ran is gone. A coat over a dry wall no longer runs; holding still
does. Tool defaults were lowered in 1.5.0 too (cap drips 2, 4, 6; roller 60).
F3 → Paint runs has a wet view, a most build-up readout and a runs view.

Read in the code (2026-10-24), the brush fits that model:

- Runs count paint per texel over time, not dabs or frames. The brush solves
  each dab's amount from its spacing and lays build-up at a rate per second,
  so neither the dab spacing nor the frame rate should change how much runs.
- Only opaque texels collect wet paint: a semi-transparent pass (opacity
  0.65) doesn't feed runs until passes add up to opaque. Likely why there
  are far fewer runs now.
- Close up, `closeDrips` (×4) raises the run chance on purpose.
- To check in play: moving slower than one dab spacing per frame counts as
  held still and builds up (see known issues), so a slow careful line may
  run more than meant; at the 160-dab cap a very fast flick lays lighter
  paint (fewer runs, harmless).

IDEA-233 (marker nibs): the can's nibs (chisel, needle) were tried on the
branch and removed; marker nibs are a separate idea, not started.

IDEA-166 (lock the camera): an idea from before the branch, not started.

Owner: IDEA-233 and IDEA-166 stay tagged 1.7.0 but unconfirmed (`?`): not
sure yet that they belong in it. Ask before working on them.

## Modules kept

### 1. Brush (continuous stroke)

Paint lands at once where the aim meets the wall, not where particles land.
Between the last frame's point and this one, dabs are laid every fraction of
the dab's radius, each cast from the eye on its own, so a fast flick has no
gaps and turns corners and edges. Particles still fly, but only for show
(AGENTS.md already says they are visual only).

Why: particles land late and sparse; a fast stroke left dotted gaps.

Owner: particles stay in the game, for show only; the brush paints.

### 2. Pressure / opacity (Shift + wheel)

One pass of a stroke reaches about the set opacity along its middle, whatever
the dab spacing and edge (the per-dab amount is solved from it). Passes add
up, so a second pass darkens. Default 0.65.

Lesson: a "stroke takes the max of its dabs" mode was tried for evenness and
rejected; strokes no longer layered and the far spray died. Accumulation is
what makes it feel like paint.

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

One crosshair replaces the game's while the can is out, a hairline ring:

- Its size is the line the paint will leave right now (distance, cap, edge,
  hand speed, opacity): out to where the stroke is half as dense as in its
  middle. A soft edge reads narrower than the dab's full reach. Owner: real
  size always in the game; drop the toggle and the old 12-40 px clamp.
- The arc is the opacity; the middle dot is as dense as one pass.
- Red when close enough to run (owner: undecided, see open decisions).
- Optional: the distance to the wall as text (owner: dev only, not for
  players); an outer faint ring for how far the softest paint reaches (off by
  default; owner: undecided, see open decisions).

Owner: barely visible, like the game's own crosshair.

### 8. SOFT and HARD caps

Two new caps: a soft-edged medium one and a crisp narrow one. The cap's
softness scales the brush's edge (standard is the reference), so caps feel
different at any distance.

Owner: both ship as new pickup caps next to skinny, standard and fat (five
caps). Names undecided; SOFT and HARD are placeholders (suggested: PINK DOT
and OUTLINE).

### 9. Slant

Hitting the wall at an angle stretches the dab into an ellipse along the aim,
fading at the far end. Stamp ops carry a `shape`, but the wire drops it, so
other players see round dots.

Owner: important, in 1.7.0, protocol bump included (step 2 below is required).

### 10. Endless pressure, everything unlocked, smooth alpha

Sandbox conveniences that change the game beyond painting:

- The can never loses pressure (no shaking). Owner: undecided.
- All tools, colors and caps unlocked from the start. Owner: a dev
  convenience only (instead of F3 → Unlock all items each time); the game
  keeps pickups as now. Don't ship it.
- `PAINT.alphaSteps = 0`: smooth opacity instead of the ink style's 8 steps.
  Steps band semi-transparent strokes badly. Owner: keep smooth in the game.

### 11. Z panel

A lil-gui panel (Z) in Russian with hover tips. Colored dots show scope: every
cap alike, scaled per cap, cap in hand only, particles only. There are copy-all
(JSON to paste back) and reset. It's a dev tool; in production its settings
belong in `config.ts`, perhaps the F3 debug panel. The goal for that panel
(TASK-232): it shows which setting causes what, so tuning is systematic, not
trial and error.

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

Up to 160 dabs per frame are raycast. Measure the frame cost of a fast
stroke before shipping.

### Network (20 players)

A stamp op is 23 bytes. Estimates from the code, not measured:

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

1. Measure real ops/s, brush vs particles, on the same stroke. ~20 min.
2. Put the slant shape on the wire (+3 bytes). That's a protocol bump:
   clients and server ship together. ~half a day.
3. Optional, the big win: a stroke-segment op (A to B on one surface; every
   client lays the dabs). Split at surface edges. Cuts traffic 5-15×. 2-3 days.
   Owner: the agent decides after step 1's measurement.
4. Move settings to `config.ts`. Drop particle painting (the brush paints,
   particles show). Keep only what's used. ~1 day.
5. Golden paint tests and multiplayer tests will change: update them. ~1 day.

### Known issues

- Slow movement may be denser than meant: under one dab spacing per frame
  counts as held still and builds up, more so at high refresh rates. Read in
  the code; owner: not seen in play.
- Dabs near a face edge are clipped to their face. Check corners and seams.
- At very small dabs the minimum spacing (3 mm) wins, and the line is a bit
  lighter than the set opacity.
- `package-lock.json` wasn't updated for lil-gui (devDependency): `npm ci`
  fails on the branch.

### Open decisions (the owner's)

Still open:

- Endless pressure: drop shaking, keep it, or a player option?
- Red "too close" turns on at ~0.93 m, which covers the whole precise gap.
  Red only inside the gap, no red, or as is?
- The crosshair's softness ring: dev only, a player option, or gone?
- Cap names for SOFT and HARD.

Decided (2026-10-24): smooth alpha stays; unlock-all is dev only; the
crosshair is real size always; SOFT and HARD ship as pickup caps; slant goes
on the wire in 1.7.0; particles stay for show; the stroke-segment op is the
agent's call after measuring.

### Ideas not built

- A hiss that follows speed, distance and pressure.
