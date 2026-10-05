# Testing

How the game is tested, and what makes the tests slow or unpredictable: what's fixed, and what's still open. Measured on the WSL dev machine (6 cores, Chromium with SwiftShader), 2026-10-06.

## The tests

| Command | What | Time |
|---|---|---|
| `npm run check` | Type check, `npm test`, smoke test, knip. Run before and after every change. | ~12 s |
| `npm test` | Paint save file round trip and rejections, in Node (as a server will run it). | <1 s |
| `npm run smoke` | Loads the game, renders a few frames, screenshots `shots/00-start.png`. Fails on page errors and console errors. `STEPS` (JSON `[{ js, wait, shot }]`) adds steps and screenshots. | ~10 s |
| `npm run golden` | Paint at every PAINT DETAIL against a baseline, the loopback replay of paint ops, and saves (`docs/golden-paint.md`). | ~45 s |

No setup: the browser tests start their own Vite dev server (port 5180, its own dependency cache, so `npm run dev` can run beside it) and their own Chromium (`scripts/test-browser.mjs`). On machines without Chromium's system libraries, copies extracted to `~/.local/pwlibs` are used: `apt-get download libnspr4 libnss3 libasound2t64`, then `dpkg -x` each into `~/.local/pwlibs` (or `npx playwright install-deps chromium` with sudo).

## Fixed

| Problem | Effect | Fix |
|---|---|---|
| Tests needed `npm run dev` running and `LD_LIBRARY_PATH` set by hand | Failed or hung without them; a long-running dev server served stale copies of edited modules (`file.ts?t=…`) | `test-browser.mjs` starts a fresh server and sets the library path |
| The smoke test never failed | Console and page errors were printed, exit code 0 | Exits 1 on page errors and console errors; SwiftShader's ReadPixels note is filtered as noise |
| Fixed sleeps (smoke 1 s, golden 500 ms) | On a slow or busy machine the game wasn't ready (often no frame drawn at all in the smoke test); on a fast one, time wasted | Wait for the level to be built, then a number of frames (`gameReady`) |
| The smoke test drew at 1280×720 | A SwiftShader frame takes seconds at that size: 45 s per run | 640×360: 10 s |
| Paint randomness, frame time and the can jitter | The same strokes painted differently each run | Seeded paint randomness, one stream per purpose; fixed steps (`window.game.fixedStep`); rendering skipped in the golden test |
| Frames capped at 60 Hz | The golden test waited on vsync, not on work: 4 min | Uncapped frames (`uncapped`, only for pages that don't draw), details in parallel: 45 s |
| Uncapped frames in a page that draws | The page queued frames faster than SwiftShader drew them; a screenshot and closing the browser each waited ~30 s | Uncapped only where nothing is drawn |

## Open

| Problem | Effect | Suggested |
|---|---|---|
| Timing noise on this machine | The same page load takes 0.9 to 4.6 s between runs (load average ~5); parallel pages contend for 6 cores. Test results don't depend on it, only durations. | Compare durations over several runs; don't gate on them |
| Page loads are half of `npm run golden` | 9 pages, each building the demo level and the city: 3–12 s each with four in parallel | Reuse a page between play and replay (needs a clean way to reset paint and the level in place) |
| A smaller test level paints more slowly | With only the 49 props around the test wall, painting took 6.4–7.6 s instead of 3.1–4.1 s (same paint). Idle frames cost the same (0.4–0.6 ms); the cause is unknown, possibly the city, which fills the space the missing props left. | Keep the demo; worth a profile of a painting frame if paint performance is looked at |
| Checks run by hand, not in a script | The menu SAVE / LOAD flow, the level hash cases, spray in the air at LOAD, sign widths with another font, the wheel sizes, the save size benchmark | Fold the menu flow into the smoke test (`STEPS`) or a small UI test; keep the benchmark as a script if sizes need tracking |
| Light baking and weather are timed by the wall clock | Bake progress (`baker.ts`, `performance.now` budget) and lightning/rain (`Math.random`) differ per run: screenshots aren't comparable | Paint doesn't depend on them; for screenshot comparisons, finish the bake and turn rain off first |
| File compression may differ between Chromium versions | `.rhhpaint` bytes (not the paint) could change with a browser update | Tests compare loaded paint, never file bytes |
