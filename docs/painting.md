# Painting

How paint works and what to turn to change how it feels. Numbers live in `src/config.ts`, never here: read them there, and tune them live in F3 → Paint. Change this file only when a mechanic changes, not when a number does.

## Where things are

| What | Where |
|---|---|
| All tunable numbers | `src/config.ts`: `DRIPS`, `BRUSH`, `CAPS`, `MARKER`, `ROLLER` |
| The can's line: a dab's size, softness, opacity | `src/spray/dab.ts`, `src/spray/stroke.ts`, `src/spray/brush.ts` |
| Marker, roller | `src/tools/marker.ts`, `src/tools/roller.ts`, sweep shared in `src/tools/stroke.ts` |
| Laying paint on texels | `src/paint-raster.ts`, driven by `src/painting.ts` |
| Wet paint and the dice | `src/paint-wet.ts` |
| A run moving down a wall | `src/paint-drips.ts` |
| Paint as data for the network and saves | `src/paint-ops.ts`, `src/op-wire.ts` |
| F3 rows, tooltips | `src/debug/paint-sections.ts`, `src/debug/hint-text.ts` (rules: `src/debug/AGENTS.md`) |

## The can's line

Dabs are laid along the aim at a spacing, and at a set rate while held still (`src/spray/stroke.ts`). A dab's width, softness and opacity come from the cap, the distance to the wall and the hand's speed (`dabAt`). Passes add up. Opacity is the player's own setting (`BRUSH.opacity` is its default). Paint lands at once; the plume and particles only show.

## How a run starts

1. **Wet paint.** Only paint landing on nearly opaque paint on an upright face counts (`paint-raster.ts`). Each texel keeps one number: when its wet paint is dry. A coat is a full-opacity stamp, and `DRIPS.passCoats` coats make a pass.
2. **Build-up.** Past `DRIPS.passes` of wet paint, a texel rolls the dice. Below that nothing can run. Paint dries at `DRIPS.dryTime` seconds a pass, so what counts is paint in a short time, not paint in total.
3. **The dice.** The odds are the tool's `chance` for a whole spot, a square of `DRIPS.spot`, shared out over its texels: thin and wide lines have the same odds where they're as wet, and every paint detail runs alike.
4. **A failed roll (can).** It takes only `DRIPS.miss` off the texel. What it takes goes to the spot's pool.
5. **Rest (can).** After a run the spot starts none for `DRIPS.rest / chance` seconds, so a higher chance also rests less. Paint that arrives meanwhile goes to the pool.
6. **The pool (can).** It dries `DRIPS.keptDry` times slower than a texel's paint. How full it is against `DRIPS.full` raises the odds (up to `DRIPS.fullOdds` more) and the run's length. A run empties it.
7. **Length.** Between `DRIPS.minLength` and `maxLength`. For the can, `DRIPS.lengthLuck` of it is the dice and the rest how full the pool is.
8. **The run.** The painter's client decides it and sends a drip op; every client runs it from that op (`paint-drips.ts`). It trickles down the face one texel wide, slows down and thins out. New runs are dropped past `DRIPS.maxActive` or within `DRIPS.apart` of another in its column.

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
| Too many on screen at once | `DRIPS.maxActive` | Runs past it never start |
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
