# Paint refactoring: the can as a brush

A handoff for the agent who brings this into the game. It says what was tried,
what the player liked, and what is left to decide. It doesn't say how to
write the code: read the branch.

- Branch: `exp/visual-sandbox` (from `dev`), local on the owner's machine
  (not on origin; ask for it to be pushed if you can't see it). Only this
  doc is on `dev`. R&D only, not for merging as is: the architecture was bent
  on purpose, tests were neither run nor updated, settings live in a sandbox
  object, not in `config.ts`. See it with `git log dev..exp/visual-sandbox`
  and `git diff dev...exp/visual-sandbox`; try it with
  `git switch exp/visual-sandbox && npm run dev`, panel on Z.
- Backlog: IDEA-224. It covers or touches BL-152 (pressure on Shift + wheel),
  IDEA-165 (pressure), IDEA-167 (soft / hard brushes), BL-017 (cap tuning)
  and BL-024 (paint ops bytes).
- Code: `src/sandbox/` (`feel.ts` settings and the distance model, `brush.ts`
  the brush, `aim.ts` the crosshair, `panel.ts` the Z panel), plus hooks in
  `src/spray/spray-tool.ts`, `src/spray/particles.ts`, `src/paint-raster.ts`
  (elliptic dots), `src/painting.ts`, `src/paint-ops.ts`, `src/tools/tools.ts`.
- The owner's verdict: "much more comfortable and smoother than before". Smooth,
  semi-transparent strokes and a can that responds to speed and distance are
  the point. Keep that feel; everything else is negotiable.

## The goal

Spraying should feel like a drawing app (Procreate) and a real can at once:

- A continuous stroke, no gaps however fast the hand moves.
- Opacity as a first-class control: layers add up, you can build a fade.
- The can's physics: the same paint per second, so speed and distance change
  the line's width, density and edge, as with a real can.
- The crosshair tells the truth: the line's real size and the opacity.

## Modules kept

### 1. Brush (continuous stroke)

Paint lands at once where the aim meets the wall, not where particles land.
Between the last frame's point and this one, dabs are laid every fraction of
the dab's radius, each cast from the eye on its own, so a fast flick has no
gaps and turns corners and edges. Particles still fly, but only for show
(AGENTS.md already says they are visual only).

Why: particles land late and sparse; a fast stroke left dotted gaps. This was
the change the owner felt most.

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
out of lines; costs a little lag. Default 0.25.

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
  middle. A soft edge reads narrower than the dab's full reach. Toggle
  "real size"; off, the old 12-40 px clamp.
- The arc is the opacity; the middle dot is as dense as one pass.
- Red when close enough to run (see open decisions).
- Optional: the distance to the wall as text; an outer faint ring for how far
  the softest paint reaches (off by default).

The owner wants it barely visible, like the game's own crosshair.

### 8. SOFT and HARD caps

Two new caps: a soft-edged medium one and a crisp narrow one. The cap's
softness scales the brush's edge (standard is the reference), so caps feel
different at any distance. Names are placeholders. Candidates: PINK DOT and
OUTLINE.

### 9. Slant

Hitting the wall at an angle stretches the dab into an ellipse along the aim,
fading at the far end. Stamp ops carry a `shape`, but the wire drops it, so
other players see round dots.

### 10. Endless pressure, everything unlocked, smooth alpha

Sandbox conveniences that change the game beyond painting:

- The can never loses pressure (no shaking).
- All tools, colors and caps unlocked from the start.
- `PAINT.alphaSteps = 0`: smooth opacity instead of the ink style's 8 steps.
  Steps band semi-transparent strokes badly.

### 11. Z panel

A lil-gui panel (Z) in Russian with hover tips. Colored dots show scope: every
cap alike, scaled per cap, cap in hand only, particles only. There are copy-all
(JSON to paste back) and reset. It's a dev tool; in production its settings
belong in `config.ts`, perhaps the F3 debug panel.

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
much is painted. No FPS loss was seen. What scales is CPU rastering of
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
4. Move settings to `config.ts`. Drop particle painting (the brush paints,
   particles show). Keep only what's used. ~1 day.
5. Golden paint tests and multiplayer tests will change: update them. ~1 day.

### Known issues

- Slow movement is denser than meant. Under one dab spacing per frame counts
  as held still and builds up, more so at high refresh rates.
- Drips are per stamp (per m² of paint). Check that the dab spacing and the
  frame rate don't change how much runs.
- Dabs near a face edge are clipped to their face. Check corners and seams.
- At very small dabs the minimum spacing (3 mm) wins, and the line is a bit
  lighter than the set opacity.
- `package-lock.json` wasn't updated for lil-gui (devDependency): `npm ci`
  fails on the branch.

### Open decisions (the owner's)

- Endless pressure: drop shaking, or keep it as an option?
- Unlock-all: sandbox only, or a mode?
- Smooth alpha (`alphaSteps 0`) for paint in the ink style, or bring the
  steps back?
- Red "too close" turns on at ~0.93 m, which covers the whole precise gap.
  Red only inside the gap, or no red?
- Cap names for SOFT and HARD.

### Ideas not built

- Real pressure from a gamepad trigger or pen pressure.
- A hiss that follows speed, distance and pressure.
- Undo last stroke. Hard with baked paint and multiplayer.
- Straight line (Shift + click).
- Wet paint that blends with a fresh neighbor.
