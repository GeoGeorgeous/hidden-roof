# Golden paint baseline (phase 0)

Recorded 2026-10-05 on `feat/multiplayer` at `c371829`, before any of the multiplayer paint refactors in `docs/multiplayer-audit.md` (section 7). It is the reference that every later step is compared against.

## How to run

```sh
npm run golden              # compare with scripts/golden-paint.json (exit 1 on a failure)
npm run golden -- --update  # rewrite the baseline (only when a change is meant to alter paint)
```

It starts its own dev server and browser (`scripts/test-browser.mjs`); see `docs/testing.md`.

A run takes about 25 s here (55 s while other agents test): the four details run side by side, a page each, and each page also replays its ops and loads its save; frames aren't capped at 60 Hz. The game runs on fixed steps, so none of that changes the paint. A level of only the 49 props around the test wall paints exactly the same texels and isn't faster, so the test keeps the demo (see `docs/testing.md`). Face images land in `shots/golden/` (not committed). Copies of the baseline images are in `docs/golden/`.

## What it does

- Loads the demo level at each PAINT DETAIL (24, 48, 72, 96 texels/m) in a fresh page. CITY DETAIL is LOW because the city never takes paint.
- Stands 1 m from a paintable wall on the demo roof, at x = 3.4, z 1.9–4, up to 1.7 m high, and faces it.
- Seeds paint randomness with `seedPaintRandom(1)` and steps frames at a fixed 1/60 s through `window.game.fixedStep`. The paint then depends on the frame count, not on how fast the browser runs.
- Turns DRIPS on, unlocks every tool, color and cap, and plays 12 scripted runs:
  - the can with each cap, plus one run sputtering at low pressure;
  - the marker with three nibs (default, thinnest, widest);
  - the roller on the wall and on the floor;
  - the sponge at two sizes.

  Runs overlap on purpose, to cover layering, runs on wet paint and the sponge over paint.
- Hashes every paint atlas (CPU RGBA), keyed by its stable surface key (`PaintSurface.key`), so the order surfaces are registered in doesn't matter. It also checks that keys are unique and that `paint.find` returns each surface. It also records the total painted area, mean alpha, drip triggers and the coverage each run added. Coverage is m² of full-opacity paint; the sponge's is negative.
- **Loopback.** While playing, every paint op is recorded (`PaintSystem.log`, `src/paint-ops.ts`) along with which frame made it: stamps, rolls, and the runs the painter started. The same page, its paint and runs wiped (`PaintSystem.clear`), replays them frame by frame through `PaintOps.apply`. It must give the same hash: that's the remote-paint path, proven without a network. ULTRA's ops are also replayed in a LOW page, where the painted area must come within 10% of ULTRA's.
- **Saves.** The paint is also saved while playing (`src/save`, `.rhhpaint`). The page loads the save after its loopback check, and must give the live hash. ULTRA's save loaded at LOW, and LOW's at ULTRA, must equal the paint switched to that detail in game: the same resample, both ways. Then the level is edited and the save loaded again: with an unpainted prop removed it must load the same; with a painted prop removed, that prop's faces must be skipped; with every painted prop removed, it must be refused (SAVED FOR ANOTHER VERSION OF DEMO), with the paint kept. A broken loader was checked to fail the test.
- Rendering is skipped by stubbing `renderer.render`. The paint is all on the CPU, so the hashes are the same either way, and the run is about 5× faster.

## Baseline

The numbers `npm run golden` compares with, as `scripts/golden-paint.json` holds them (2026-10-10; rewritten with `--update` whenever a change is meant to alter paint, last for the new brush, cap and run defaults). The phase 0 baseline (one shared random stream) is in git history at `300deb3`.

| Detail | Hash | Painted m² | Mean alpha | Drip triggers |
|---|---|---|---|---|
| LOW 24 | `148086ca376a532b` | 1.194 | 0.785 | 45 |
| MEDIUM 48 | `57fc697b71bab496` | 1.150 | 0.779 | 30 |
| HIGH 72 | `29e20b1131896a50` | 1.163 | 0.777 | 39 |
| ULTRA 96 | `004f0a0d8f9950ea` | 1.153 | 0.785 | 41 |

Coverage added per run, in m² of full paint (negative means removed):

| Run | LOW | MEDIUM | HIGH | ULTRA |
|---|---|---|---|---|
| can skinny | 0.078 | 0.059 | 0.057 | 0.059 |
| can standard | 0.144 | 0.134 | 0.131 | 0.132 |
| can fat, held for runs | 0.047 | 0.038 | 0.033 | 0.034 |
| can spray | 0.261 | 0.266 | 0.269 | 0.268 |
| can sputtering | 0.031 | 0.036 | 0.036 | 0.035 |
| marker | 0.073 | 0.037 | 0.041 | 0.041 |
| marker thinnest | 0.026 | 0.013 | 0.009 | 0.006 |
| marker widest, held for runs | 0.056 | 0.046 | 0.047 | 0.041 |
| roller on the wall | 0.348 | 0.353 | 0.365 | 0.368 |
| roller on the floor | 0.068 | 0.067 | 0.068 | 0.067 |
| sponge | −0.102 | −0.079 | −0.074 | −0.071 |
| sponge widest | −0.094 | −0.075 | −0.077 | −0.076 |

The wall at ULTRA and at LOW, then the floor (ULTRA), at 96 px/m over paper:

![wall, ULTRA](golden/wall-ultra.png) ![wall, LOW](golden/wall-low.png) ![floor, ULTRA](golden/floor-ultra.png)

Loopback: identical at all four details, about 8,100–9,000 ops over 1,377 frames. ULTRA's ops at LOW paint 1.181 m², 2.4% more than at ULTRA (1.153): LOW draws thin lines and runs a whole 4 cm texel wide.

## Findings (2026-10-05, with the numbers of then)

1. **The paint was not reproducible until the can jitter was seeded.** The audit lists the first-person can jitter (`src/spray/can-model.ts`) as visual only. But particles leave from the jittered nozzle, so the jitter changes their flight time and the order dabs land in. With drips on, it also changes which runs start, because excess builds up in that order. It now uses `paintRandom` too (`9a73958`). The other `Math.random` sites in the audit's section 3 are visual or audio only.
2. **Same detail is bit-exact.** Two runs at the same detail, each in a fresh page, give identical hashes at LOW and ULTRA. This holds once the paint randomness is seeded and `dt` is fixed. Nothing else was needed: no prop rebuilds happened during the runs, and the baker, lightning and other wall-clock effects don't reach paint.
3. **Comparing across details is approximate, and noisier than the raster alone explains.** Total painted area agrees within about 3% across the four details. Runs the audit predicts to differ do differ: at LOW the default marker line is 4 cm wide instead of about 2.4 cm (2.3×), and the thinnest line is 4 cm instead of 1 cm (6×). Two runs differ for an extra reason:
   - **Sputtering** varies from 0.025 to 0.070 m² between details.
   - **Drip triggers** don't follow detail (272, 246, 212, 231).

   The cause is that all paint randomness is **one shared stream**. Drip decisions draw one random number per saturated texel, and the number of texels depends on detail. So every later run, the sputter run included, draws different numbers at each detail.

   **Fixed:** paint randomness is now one stream per purpose: spray (with the can jitter), sputter and drips (`src/lcg.ts`). In the phase 0 baseline (one stream), sputtering varied by 64% between details. Now it varies by 2% (0.044–0.045 m²), and the fat-cap and widest-sponge runs agree more closely too. What still varies comes from the raster's texel size (the marker, LOW's coarse dots) and from drip decisions, which are made per texel.

4. **At LOW, the sponge removes more and the roller lays less.** The sponge removes about 30% more paint (−0.143 vs −0.108 m²), and the roller on the wall lays about 17% less (0.229 vs 0.275). The likely cause, not verified, is the coarse 4 cm texels: a scrub takes whole texels, and the roller's narrow press bands, between the slats (next point), round to fewer texels. Either way, this is how the game behaves today, not something these changes introduced.
5. **The demo wall has unpaintable slats.** They are 2 cm in front of the wall (part of the `building` prop), about every 12 cm from 0.3 to 0.95 m up. Strokes that cross them leave stripes, as the orange roller shows. It's correct occlusion, not a gap in the roller. The marker runs stay above the slats so their paint is easy to read.
6. **Vite test gotcha.** After a source file is edited while `npm run dev` runs, the game imports it as `file.ts?t=…`. `import('/src/file.ts')` from a test then loads a second copy with its own state. Use the exact URL from `performance.getEntriesByType('resource')`, or go through `window.game`.

## Using it in later steps

- Refactors that must not change paint (stable keys, sizes in per-player state, `stampFace` / `rollFace`, splitting `painting.ts`): `npm run golden` must report all details matching.
- Steps that change the order of random draws (drips becoming ops): the hashes will change. Compare the per-run coverage and drip numbers with this table instead, and the PNGs side by side. Then rewrite the baseline with `--update` in the same commit, and say so in the commit message.
- If the test scene changes (new runs, another wall), rewrite the baseline in its own commit, with no paint-path change in it.
