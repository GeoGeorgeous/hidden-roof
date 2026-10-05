# Testing

How the game is tested, and what makes the tests slow or unpredictable: what's fixed, and what's still open. Measured on the WSL dev machine (6 cores, Chromium with SwiftShader), 2026-10-06.

## The tests

| Command | What | Time |
|---|---|---|
| `npm run check` | Type check, `npm test`, smoke test, game tests, knip. Run before and after every change. | ~22 s |
| `npm test` | Paint save file round trip and rejections (broken, older, newer, oversized), in Node (as a server will run it). | <1 s |
| `npm run smoke` | Loads the game, renders a few frames, screenshots `shots/00-start.png`. Fails on page errors and console errors. `STEPS` (JSON `[{ js, wait, shot }]`) adds steps and screenshots. | ~10 s |
| `npm run test:game` | Behavior the golden test doesn't cover: the menu's SAVE / LOAD PAINT, saves through level edits and changed props, spray at LOAD, the sponge freeing memory, prop ids, city overrides, save names, wheel sizes, sign sizes with another font (`scripts/game.test.mjs`). | ~11 s |
| `npm run golden` | Paint at every PAINT DETAIL against a baseline, the loopback replay of paint ops, and saves (`docs/golden-paint.md`). | ~20 s |
| `npm run bench:save` | Save size and SAVE / LOAD time at LOW and ULTRA, 10% to all faces painted, real and random paint. Needs `npm run golden` first. | ~50 s |

No setup: the browser tests start their own Vite dev server (port 5180, its own dependency cache, so `npm run dev` can run beside it) and their own Chromium (`scripts/test-browser.mjs`). On machines without Chromium's system libraries, copies extracted to `~/.local/pwlibs` are used: `apt-get download libnspr4 libnss3 libasound2t64`, then `dpkg -x` each into `~/.local/pwlibs` (or `npx playwright install-deps chromium` with sudo).

## Fixed

| Problem | Effect | Fix |
|---|---|---|
| Tests needed `npm run dev` running and `LD_LIBRARY_PATH` set by hand | Failed or hung without them; a long-running dev server served stale copies of edited modules (`file.ts?t=…`) | `test-browser.mjs` starts a fresh server and sets the library path |
| The smoke test never failed | Console and page errors were printed, exit code 0 | Exits 1 on page errors and console errors; SwiftShader's ReadPixels note is filtered as noise |
| Fixed sleeps (smoke 1 s, golden 500 ms) | On a slow or busy machine the game wasn't ready (often no frame drawn at all in the smoke test); on a fast one, time wasted | Wait for the level to be built, then a number of frames (`gameReady`) |
| The smoke test drew at 1280×720 | A SwiftShader frame takes seconds at that size: 45 s per run | 640×360: 10 s |
| Paint randomness, frame time and the can jitter | The same strokes painted differently each run | Seeded paint randomness, one stream per purpose; fixed steps (`window.game.fixedStep`); rendering skipped in the golden test |
| Frames capped at 60 Hz | The golden test waited on vsync, not on work: 4 min | Uncapped frames (`uncapped`, only for pages that don't draw), details in parallel |
| Uncapped frames in a page that draws | The page queued frames faster than SwiftShader drew them; a screenshot and closing the browser each waited ~30 s | Uncapped only where nothing is drawn |
| Page loads were half of `npm run golden` (9 pages) | 45 s | Each play page also replays its ops and loads its save, with its paint wiped (`PaintSystem.clear`): 5 pages, 20 s. A broken replay still fails it |
| Checks run by hand | Menu flow, level edits and saves, spray at LOAD, sponge memory, ids, wheel sizes, sign sizes: not repeatable | `npm run test:game`, in `npm run check`; its pages don't draw (drawing made it 111 s) |
| The save size benchmark was a scratch script | Not repeatable | `npm run bench:save` |
| "A smaller test level paints 2× slower" | Looked like a reason to keep the demo | Measured alone, it isn't (3.4 s vs 3.8 s): the 2× was pages contending for CPU. The demo stays: it's the real game. |

## Open

| Problem | Effect | Suggested |
|---|---|---|
| Timing noise on this machine | The same page load takes 0.9 to 4.6 s between runs (load average ~5); parallel pages contend for 6 cores. Results don't depend on it, only durations. | Compare durations over several runs; never gate on them |
| Light baking and weather are timed by the wall clock | Bake progress (`baker.ts`, `performance.now` budget) and lightning/rain (`Math.random`) differ per run: screenshots aren't comparable | No test compares screenshots yet; when one does, finish the bake and turn rain off first |
| File compression may differ between Chromium versions | `.rhhpaint` bytes (not the paint) could change with a browser update | By design: tests compare loaded paint, never file bytes |

## Found in passing (game, not tests)

- **Hotbar icons stall the GPU the first time each shows** (`inventory/thumbnails.ts`): an icon is rendered once and read back with `readRenderTargetPixels`, which waits for all queued GPU work. On the demo, light baking is queued, so the golden test spends 1.6 s of its 3.8 s ULTRA play there; in the game it's a brief hitch on a new pickup or paint color (and the "GPU stall due to ReadPixels" note). An asynchronous readback (`readRenderTargetPixelsAsync`) would avoid it.
