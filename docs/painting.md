# Painting

How paint works and what to turn to change how it feels. Numbers live in `src/config.ts`, never here: read them there, and tune them live in F3 → Paint. Change this file only when a mechanic changes, not when a number does.

The goal: spraying feels like a drawing app and a real can at once. A continuous stroke with no gaps, opacity you can build up in layers, speed and distance that change the line as a real can does, and a crosshair that tells the truth. The owner's bar for this feel is met: keep it.

## Where things are

| What | Where |
|---|---|
| All tunable numbers | `src/config.ts`: `PAINT`, `DRIPS`, `BRUSH`, `CAPS`, `SPRAY`, `CROSSHAIR`, `MARKER`, `ROLLER`, `SPONGE` |
| The can's line: a dab's size, softness, opacity | `src/spray/dab.ts`, `src/spray/stroke.ts`, `src/spray/brush.ts`; rays: `src/spray/wall-probe.ts` |
| The can in hand, its plume | `src/spray/spray-tool.ts`, `src/spray/plume.ts`, `src/spray/particles.ts` |
| Marker, roller | `src/tools/marker.ts`, `src/tools/roller.ts`, sweep shared in `src/tools/stroke.ts` |
| Laying paint on texels | `src/paint-raster.ts`, driven by `src/painting.ts`; past a face's edge: `src/paint-seams.ts` |
| Paint on the GPU | `src/paint-gpu.ts`, blocks on pages: `src/page-packer.ts` |
| Wet paint and the dice | `src/paint-wet.ts` |
| A run moving down a wall | `src/paint-drips.ts` |
| Paint as data for the network and saves | `src/paint-ops.ts`, `src/op-wire.ts`, `src/save/paint-file.ts` |
| Faces an admin locked | `src/paint-locks.ts` |
| F3 rows, tooltips, its views | `src/debug/paint-sections.ts`, `src/debug/hint-text.ts` (rules: `src/debug/AGENTS.md`), `src/dev/wet-view.ts`, `src/dev/runs-view.ts` |

## How paint is kept

Paint is baked, never objects (`AGENTS.md`, Performance first). A surface's paintable faces share an atlas on the CPU, made on its first hit, and a block of a shared page on the GPU, made on the first hit on any of the page's surfaces; only what changed is uploaded. A face's edge stops a stamp, so `paint-seams.ts` carries the rest onto the faces in the same plane. Every surface has the same density, PAINT DETAIL (24, 48, 72 or 96 texels/m): it's a player's setting, held at the host's in a session, and paint sizes are in meters, never texels.

What leaves a painter is ops: a stamp, a roll, a drip, each in face fractions and meters (`CONTEXT.md`), so an op paints the same spot at any detail. A stamp is one dab with its 3 bytes of slant (protocol 12). Replays, saves and the server only paint ops: they never roll the dice and never make a run of their own. A save (`.rhhpaint`) is paint by face. Memory by detail: `docs/deploy.md`.

## The can's line

Dabs are laid along the aim at a spacing, and at a set rate while held still (`src/spray/stroke.ts`). The spacing and the hand's speed count the way across the ray: along a wall at an angle a dab is as much longer as that way is shorter, so a line holds the same paint there, and a wall behind another's edge is no distance, so a stroke stepping onto it leaves no pile of dabs. A stroke's first `BRUSH.speedStart` of moving takes the pace as it is, and a frame past that time the pace the aim had then, so a stroke doesn't start dense and starts alike at any frame rate; after it the speed follows the hand at `BRUSH.speedFollow`. A dab's width, softness and opacity come from the cap, the distance to the wall and the hand's speed (`dabAt`). Passes add up. Opacity is the player's own setting, Run + the wheel with the can in hand (`BRUSH.opacity` is its default): what a pass reaches in the far range, up to `BRUSH.closeFlow` times that close up. At an angle a dab stretches along the aim and fades at the far end (`slantOf`). Paint lands at once; the plume and particles only show: each cap has its own plume (`SPRAY.plume`, a cap's `plume`), and it follows the opacity for everyone. Painting has its own settings: a slower mouse, a narrower view and Streamline, how far the brush trails the aim (`BRUSH.streamline`).

The crosshair is as wide as the line would land now, and fades where paint wouldn't reach (`CROSSHAIR`).

| Cap (`CAPS` key) | In the game |
|---|---|
| `needle` | NEEDLE |
| `skinny` | SKINNY |
| `standard` | BANANA, the one a player starts with |
| `soft` | BLUE DOT |
| `fat` | NY FAT |
| `spray` | ASTRO FAT |

## How a run starts

1. **Wet paint.** Only paint landing on nearly opaque paint on an upright face counts (`paint-raster.ts`). Each texel keeps one number: when its wet paint is dry, as a Float32 counted from the last whole `DRIPS.wetSpan`, or a thin coat would be lost on a clock that has run for hours (`docs/known-limits.md`). A coat is a full-opacity stamp, and `DRIPS.passCoats` coats make a pass.
2. **Build-up.** Past `DRIPS.passes` of wet paint, a texel rolls the dice. Below that nothing can run. Paint dries at `DRIPS.dryTime` seconds a pass, so what counts is paint in a short time, not paint in total.
3. **The dice.** The odds are the tool's `chance` (0..1 in config, a percent in F3) for a whole spot, a square of `DRIPS.spot` counted from its face's corner, shared out over its texels: thin and wide lines have the same odds where they're as wet, and every paint detail runs alike, but for a dab under a texel at LOW (`docs/known-limits.md`).
4. **A failed roll (can).** It takes only `DRIPS.miss` off the texel. What it takes goes to the spot's pool.
5. **Rest (can).** After a run the spot starts none for `DRIPS.rest / chance` seconds, so a higher chance also rests less. Paint that arrives meanwhile goes to the pool.
6. **The pool (can).** It dries `DRIPS.keptDry` times slower than a texel's paint. How full it is against `DRIPS.full` raises the odds (up to `DRIPS.fullOdds` more) and the run's length. A run empties it.
7. **Length.** Between `DRIPS.minLength` and `maxLength`. For the can, `DRIPS.lengthLuck` of it is the dice and the rest how full the pool is.
8. **The run.** The painter's client decides it and sends a drip op; every client runs it from that op (`paint-drips.ts`). It trickles down the face one texel wide, slows down and thins out. New runs are dropped past `DRIPS.maxActive` or within `DRIPS.apart` of another in its column: the dice said yes, so the spot still rests and its pool is gone, and F3 doesn't count them.

## Marker and roller

They use the same code with another rule (`RunRule` in `paint-wet.ts`): `canRule` for the can, `toolRule` for these two.

- **No rest, no pool.** A failed roll takes all the paint there, and a run's length is the dice alone. `DRIPS.rest`, `miss`, `full`, `fullOdds`, `lengthLuck` and `keptDry` don't touch them.
- **They roll less often.** Only on a `fresh` frame (`src/tools/stroke.ts`): moving, or held long enough.
- **They share the rest:** `DRIPS.passes`, `dryTime`, `passCoats`, `spot`, the lengths and all of a run's looks. Changing these moves them too, so compare them in the bench.
- **Their own knob:** `MARKER.chance`, `ROLLER.chance`.

## What to turn

| Feedback | Turn | Also moves |
|---|---|---|
| Takes too much or too little paint to run | `DRIPS.passes` | Marker, roller |
| Paint dries too fast or too slow; a second pass should run more or less | `DRIPS.dryTime` | Marker, roller |
| One cap runs too much or too little | `CAPS.<cap>.chance` | Its strokes and its held runs |
| Same for the marker or the roller | `MARKER.chance`, `ROLLER.chance` | Nothing else |
| All cans run too much or too little | Every cap's `chance` by the same factor | Held runs too; scale `DRIPS.rest` with it to keep those |
| Too many or too few runs from a can held still or many passes | `DRIPS.rest` | Strokes hardly |
| A held can runs too late | `DRIPS.fullOdds`, `DRIPS.miss` | Repeated strokes |
| Runs too short or too long | `DRIPS.minLength`, `maxLength` | Marker, roller |
| Length should follow the paint more, or be more random | `DRIPS.lengthLuck`, `DRIPS.full` | `full` also moves the odds |
| Runs flow too fast or too slow | `DRIPS.speed`, `slowest` | Marker, roller |
| Runs too faint or too strong | `DRIPS.strength`, `thinnest` | Marker, roller |
| Runs too close together | `DRIPS.apart`, `DRIPS.spot` | `spot` also changes the odds and the rest's area |
| Too many on screen at once | `DRIPS.maxActive` | Runs past it never start, but spend their spot's rest and pool |
| The line itself: width, softness, density | `CAPS.<cap>`, `BRUSH` | Coats per pass, so runs too |

## Measure a change

1. `npm run bench:runs` before and after: counts, first run and length for strokes, fills and a held can, every cap and tool. It's seeded, so differences are the change's.
2. In F3 → Paint runs: `rolls / runs` for the last seconds, `wet view` for how wet paint is, `runs view` for what runs painted.
3. Any change to runs alters paint on purpose: `npm run golden -- --update`, and say so in the commit (`docs/testing.md`).
4. A change of mechanic: `scripts/paint-wet.test.mjs` and the paint runs checks in `scripts/game/paint.mjs`.

## Decided

- **Dice, not capacity.** A wall holding a set amount of paint gave many times more runs on lines passed over and over. Puddle runs gave too many as well.
- **Runs must not get in the way of painting:** with the can, one pass and a fill hardly ever run. Runs come from too much paint, by any way of laying it, with no special case for a held can.
- **Runs trickle.** They're never painted whole, even if that would make clients match to the texel (`docs/known-limits.md`).
- **All runs are as thin** at every cap.
- **A cap's hand-tuned line numbers** change only when the owner asks.
- **No objects per run:** runs only write into the paint texture (`AGENTS.md`).
- **Painting is the game's core:** modular, typed, testable code. What would need a flag, an exception or a special case goes to the owner first.
- **Particles only show.** The brush paints; painting by particles is gone.
- **Pressure doesn't run out.** The player sets opacity, on the can only; shaking is just an animation.
- **The opacity shows on an arc at the crosshair, as set,** not as dense as it lands at this distance. No gauge on the can, no PSI.
- **The crosshair is real size,** always. A higher opacity reads a little wider: kept.
- **One stamp op per dab,** with a slant on the wire; no stroke-segment op. The load passes (`docs/known-limits.md`). It's the first thing to look at if traffic becomes the limit.
- **Wet paint stays 4 bytes a texel.** A Float64 clock would double it (up to +510 MB at ULTRA on a level painted over), and whole ticks in a Uint32 run out after 74 hours: it counts from the hour instead.

## Tried and removed

Disliked or noise, so don't bring them back unasked:

- Wet gloss, glow and color bloom on fresh paint.
- Paint catching the wall's relief.
- Overspray dust, spatter drops, a spit at press start, a hiss tail after release.
- A chisel nib on the can. A flat one, tried as the TRANSVERSAL cap, is kept commented out for the marker (IDEA-336, BL-039). NEEDLE is a round cap of its own.
- A rounded bead at a run's end.
- A crosshair laid on the wall as an ellipse, or a wall reticle beside the screen's.
